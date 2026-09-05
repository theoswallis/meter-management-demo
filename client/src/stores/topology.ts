import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { getServiceLocations, getServiceLocationTree } from '../api/serviceLocations.js';
import type {
  Meter,
  ServiceLocation,
  ServiceLocationTree,
  ServicePoint,
} from '../api/types.js';

export type NodeType = 'location' | 'point' | 'meter';

export interface SelectedNode {
  type: NodeType;
  id: number;
  locationId?: number;
  pointId?: number;
  location?: ServiceLocationTree;
  point?: ServicePoint & { meters?: Meter[] };
  meter?: Meter;
}

export const useTopologyStore = defineStore('topology', () => {
  const locations = ref<ServiceLocation[]>([]);
  const trees = ref<Record<number, ServiceLocationTree>>({});
  const loading = ref(false);
  const loadingTrees = ref<Record<number, boolean>>({});
  const error = ref<string | null>(null);

  const expandedLocations = ref<number[]>([]);
  const expandedPoints = ref<number[]>([]);
  const selectedNode = ref<SelectedNode | null>(null);
  const searchQuery = ref('');

  // Total counts across all loaded trees
  const metrics = computed(() => {
    const locList = Object.values(trees.value);
    let totalPoints = 0;
    let totalMeters = 0;
    let activeMeters = 0;
    let maintenanceMeters = 0;
    let decommissionedMeters = 0;

    for (const loc of locList) {
      if (!loc.servicePoints) continue;
      totalPoints += loc.servicePoints.length;
      for (const sp of loc.servicePoints) {
        if (!sp.meters) continue;
        totalMeters += sp.meters.length;
        for (const m of sp.meters) {
          if (m.status === 'active') activeMeters++;
          else if (m.status === 'maintenance') maintenanceMeters++;
          else if (m.status === 'decommissioned') decommissionedMeters++;
        }
      }
    }

    return {
      locationsCount: locations.value.length,
      pointsCount: totalPoints,
      metersCount: totalMeters,
      activeMeters,
      maintenanceMeters,
      decommissionedMeters,
    };
  });

  // Filtered topology tree based on search query
  const filteredTrees = computed(() => {
    const q = searchQuery.value.trim().toLowerCase();
    const treeList = Object.values(trees.value);

    if (!q) return treeList;

    return treeList
      .map((loc) => {
        const matchesLoc =
          loc.addressLine1.toLowerCase().includes(q) ||
          (loc.city && loc.city.toLowerCase().includes(q)) ||
          loc.state.toLowerCase().includes(q) ||
          loc.postalCode.includes(q);

        const filteredPoints = (loc.servicePoints || [])
          .map((sp) => {
            const matchesPoint =
              sp.identifier.toLowerCase().includes(q) ||
              (sp.notes && sp.notes.toLowerCase().includes(q));

            const filteredMeters = (sp.meters || []).filter(
              (m) =>
                m.serialNumber.toLowerCase().includes(q) ||
                m.type.toLowerCase().includes(q) ||
                m.status.toLowerCase().includes(q)
            );

            if (matchesPoint || filteredMeters.length > 0) {
              return {
                ...sp,
                meters: matchesPoint ? sp.meters || [] : filteredMeters,
              };
            }
            return null;
          })
          .filter(Boolean) as (ServicePoint & { meters: Meter[] })[];

        if (matchesLoc || filteredPoints.length > 0) {
          return {
            ...loc,
            servicePoints: matchesLoc ? loc.servicePoints || [] : filteredPoints,
          };
        }
        return null;
      })
      .filter(Boolean) as ServiceLocationTree[];
  });

  async function fetchAll(): Promise<void> {
    loading.value = true;
    error.value = null;

    try {
      const res = await getServiceLocations({ limit: 100 });
      if (!res.ok) {
        error.value = `Failed to load locations: ${res.statusText}`;
        return;
      }

      locations.value = res.data.data;

      // Fetch trees for all locations concurrently
      await Promise.all(
        locations.value.map(async (loc) => {
          loadingTrees.value[loc.id] = true;
          try {
            const treeRes = await getServiceLocationTree(loc.id);
            if (treeRes.ok) {
              trees.value[loc.id] = treeRes.data;
            }
          } finally {
            loadingTrees.value[loc.id] = false;
          }
        })
      );

      // Default expand the first location if none expanded yet
      if (locations.value.length > 0 && expandedLocations.value.length === 0) {
        const firstId = locations.value[0]?.id;
        if (firstId !== undefined) {
          expandedLocations.value = [firstId];
          const firstTree = trees.value[firstId];
          if (firstTree && firstTree.servicePoints && firstTree.servicePoints.length > 0) {
            const firstPtId = firstTree.servicePoints[0]?.id;
            if (firstPtId !== undefined) {
              expandedPoints.value = [firstPtId];
            }
          }
        }
      }
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : 'An unexpected error occurred';
    } finally {
      loading.value = false;
    }
  }

  function isLocationExpanded(id: number): boolean {
    if (searchQuery.value.trim().length > 0) return true;
    return expandedLocations.value.includes(id);
  }

  function isPointExpanded(id: number): boolean {
    if (searchQuery.value.trim().length > 0) return true;
    return expandedPoints.value.includes(id);
  }

  function toggleLocation(id: number): void {
    const idx = expandedLocations.value.indexOf(id);
    if (idx >= 0) {
      expandedLocations.value.splice(idx, 1);
    } else {
      expandedLocations.value.push(id);
    }
  }

  function togglePoint(id: number): void {
    const idx = expandedPoints.value.indexOf(id);
    if (idx >= 0) {
      expandedPoints.value.splice(idx, 1);
    } else {
      expandedPoints.value.push(id);
    }
  }

  function expandAll(): void {
    expandedLocations.value = Object.keys(trees.value).map(Number);
    const pointIds: number[] = [];
    for (const tree of Object.values(trees.value)) {
      if (tree.servicePoints) {
        for (const pt of tree.servicePoints) {
          pointIds.push(pt.id);
        }
      }
    }
    expandedPoints.value = pointIds;
  }

  function collapseAll(): void {
    expandedLocations.value = [];
    expandedPoints.value = [];
  }

  function selectLocation(loc: ServiceLocationTree): void {
    if (!expandedLocations.value.includes(loc.id)) {
      expandedLocations.value.push(loc.id);
    }

    selectedNode.value = {
      type: 'location',
      id: loc.id,
      locationId: loc.id,
      location: loc,
    };
  }

  function selectPoint(point: ServicePoint, location: ServiceLocationTree): void {
    if (!expandedLocations.value.includes(location.id)) {
      expandedLocations.value.push(location.id);
    }
    if (!expandedPoints.value.includes(point.id)) {
      expandedPoints.value.push(point.id);
    }

    selectedNode.value = {
      type: 'point',
      id: point.id,
      locationId: location.id,
      pointId: point.id,
      location,
      point,
    };
  }

  function selectMeter(meter: Meter, point: ServicePoint, location: ServiceLocationTree): void {
    if (!expandedLocations.value.includes(location.id)) {
      expandedLocations.value.push(location.id);
    }
    if (!expandedPoints.value.includes(point.id)) {
      expandedPoints.value.push(point.id);
    }

    selectedNode.value = {
      type: 'meter',
      id: meter.id,
      locationId: location.id,
      pointId: point.id,
      location,
      point,
      meter,
    };
  }

  return {
    locations,
    trees,
    loading,
    loadingTrees,
    error,
    expandedLocations,
    expandedPoints,
    selectedNode,
    searchQuery,
    metrics,
    filteredTrees,
    fetchAll,
    isLocationExpanded,
    isPointExpanded,
    toggleLocation,
    togglePoint,
    expandAll,
    collapseAll,
    selectLocation,
    selectPoint,
    selectMeter,
  };
});
