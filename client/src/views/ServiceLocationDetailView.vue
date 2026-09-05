<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getServiceLocationTree } from '../api/serviceLocations.js';
import { useTopologyStore } from '../stores/topology.js';
import ServiceLocationForm from '../components/locations/ServiceLocationForm.vue';
import MeterForm from '../components/meters/MeterForm.vue';
import type {
  Meter,
  MeterStatus,
  MeterType,
  ServiceLocation,
  ServiceLocationTree,
  ServicePoint,
} from '../api/types.js';

interface EnrichedMeter extends Meter {
  servicePointName?: string;
  servicePointNotes?: string | null;
}

const props = defineProps<{
  id?: string;
}>();

const route = useRoute();
const router = useRouter();
const topologyStore = useTopologyStore();

// Location ID from props or route
const locationId = computed(() => {
  const param = props.id || (route.params.id as string);
  return Number(param);
});

// View State
const loading = ref(true);
const error = ref<string | null>(null);
const locationTree = ref<ServiceLocationTree | null>(null);

// Edit Location State
const isEditingLocation = ref(false);
const locationSuccessMsg = ref<string | null>(null);

// Add Meter State
const showAddMeterForm = ref(route.query.newMeter === '1' || route.query.action === 'add-meter');
const newlyCreatedMeter = ref<Meter | null>(null);
const meterSuccessMsg = ref<string | null>(null);

// Search & Filter State
const searchQuery = ref('');
const selectedPointFilter = ref<number | 'all'>('all');
const selectedTypeFilter = ref<string>('all');
const selectedStatusFilter = ref<string>('all');

// Pagination State
const currentPage = ref(1);
const pageSize = ref(10);
const pageSizeOptions = [5, 10, 25, 50];

// Load Location Data
async function loadLocationTree() {
  if (isNaN(locationId.value)) {
    error.value = 'Invalid Service Location ID';
    loading.value = false;
    return;
  }

  loading.value = true;
  error.value = null;

  try {
    const res = await getServiceLocationTree(locationId.value);
    if (res.ok && res.data) {
      locationTree.value = res.data;
    } else {
      error.value = `Service location #${locationId.value} could not be found.`;
    }
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Failed to load service location';
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  await loadLocationTree();
  if (topologyStore.locations.length === 0) {
    topologyStore.fetchAll();
  }
});

// Watch for route param change
watch(
  () => locationId.value,
  async (newId) => {
    if (newId) {
      currentPage.value = 1;
      selectedPointFilter.value = 'all';
      searchQuery.value = '';
      await loadLocationTree();
    }
  }
);

// Flatten and enrich all meters across service points
const allMeters = computed<EnrichedMeter[]>(() => {
  if (!locationTree.value?.servicePoints) return [];

  const list: EnrichedMeter[] = [];
  for (const sp of locationTree.value.servicePoints) {
    if (!sp.meters) continue;
    for (const m of sp.meters) {
      list.push({
        ...m,
        servicePointName: sp.identifier,
        servicePointNotes: sp.notes,
      });
    }
  }
  return list.sort((a, b) => b.id - a.id);
});

// All service points under this location
const servicePoints = computed<ServicePoint[]>(() => {
  return locationTree.value?.servicePoints || [];
});

// Metrics
const metrics = computed(() => {
  const points = servicePoints.value;
  const meters = allMeters.value;
  const active = meters.filter((m) => m.status === 'active').length;
  const maintenance = meters.filter(
    (m) => m.status === 'maintenance' || m.status === 'decommissioned'
  ).length;

  const electric = meters.filter((m) => m.type === 'electric').length;
  const water = meters.filter((m) => m.type === 'water').length;
  const gas = meters.filter((m) => m.type === 'gas').length;

  return {
    totalPoints: points.length,
    totalMeters: meters.length,
    activeMeters: active,
    maintenanceMeters: maintenance,
    electric,
    water,
    gas,
  };
});

// Filtered Meters List
const filteredMeters = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  const pointF = selectedPointFilter.value;
  const typeF = selectedTypeFilter.value;
  const statusF = selectedStatusFilter.value;

  return allMeters.value.filter((m) => {
    // Service Point Filter
    if (pointF !== 'all' && m.servicePointId !== pointF) {
      return false;
    }

    // Utility Type Filter
    if (typeF !== 'all' && m.type !== typeF) {
      return false;
    }

    // Status Filter
    if (statusF !== 'all' && m.status !== statusF) {
      return false;
    }

    // Search Query (matches serial number, point identifier, point notes, type, status, or meter ID)
    if (!q) return true;

    return (
      m.serialNumber.toLowerCase().includes(q) ||
      (m.servicePointName && m.servicePointName.toLowerCase().includes(q)) ||
      (m.servicePointNotes && m.servicePointNotes.toLowerCase().includes(q)) ||
      m.type.toLowerCase().includes(q) ||
      m.status.toLowerCase().includes(q) ||
      String(m.id) === q
    );
  });
});

// Reset pagination when search or filters change
watch([searchQuery, selectedPointFilter, selectedTypeFilter, selectedStatusFilter, pageSize], () => {
  currentPage.value = 1;
});

// Pagination Calculations
const totalPages = computed(() => {
  return Math.max(1, Math.ceil(filteredMeters.value.length / pageSize.value));
});

const paginatedMeters = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredMeters.value.slice(start, start + pageSize.value);
});

const paginationStart = computed(() => {
  if (filteredMeters.value.length === 0) return 0;
  return (currentPage.value - 1) * pageSize.value + 1;
});

const paginationEnd = computed(() => {
  return Math.min(currentPage.value * pageSize.value, filteredMeters.value.length);
});

function goToPage(page: number) {
  if (page >= 1 && page <= totalPages.value) {
    currentPage.value = page;
  }
}

// Service Point Selection Shortcut
function togglePointFilter(pointId: number) {
  if (selectedPointFilter.value === pointId) {
    selectedPointFilter.value = 'all';
  } else {
    selectedPointFilter.value = pointId;
  }
}

function countMetersForPoint(pointId: number): number {
  return allMeters.value.filter((m) => m.servicePointId === pointId).length;
}

// Edit Location Handlers
function onLocationUpdated(updated: ServiceLocation) {
  if (locationTree.value) {
    locationTree.value.addressLine1 = updated.addressLine1;
    locationTree.value.addressLine2 = updated.addressLine2;
    locationTree.value.city = updated.city;
    locationTree.value.state = updated.state;
    locationTree.value.postalCode = updated.postalCode;
    locationTree.value.updatedAt = updated.updatedAt || new Date().toISOString();
  }
  isEditingLocation.value = false;
  locationSuccessMsg.value = 'Service location details updated successfully!';
  topologyStore.fetchAll();

  setTimeout(() => {
    locationSuccessMsg.value = null;
  }, 4000);
}

// Add Meter Handlers
async function onMeterCreated(meter: Meter) {
  newlyCreatedMeter.value = meter;
  meterSuccessMsg.value = `Meter "${meter.serialNumber}" was successfully registered!`;
  showAddMeterForm.value = false;

  await loadLocationTree();
  topologyStore.fetchAll();

  setTimeout(() => {
    meterSuccessMsg.value = null;
  }, 6000);
}

function openAddMeterForPoint(pointId?: number) {
  if (pointId) {
    selectedPointFilter.value = pointId;
  }
  showAddMeterForm.value = true;
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function clearAllFilters() {
  searchQuery.value = '';
  selectedPointFilter.value = 'all';
  selectedTypeFilter.value = 'all';
  selectedStatusFilter.value = 'all';
}
</script>

<template>
  <div class="space-y-6 pb-12">
    <!-- Breadcrumb & Top Navigation -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <nav class="flex items-center gap-2 text-xs text-gray-500">
        <router-link
          to="/service-locations"
          class="font-medium text-indigo-600 hover:text-indigo-700 transition inline-flex items-center gap-1"
        >
          <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Service Locations
        </router-link>
        <span class="text-gray-300">/</span>
        <span class="font-semibold text-gray-800">
          Location #{{ locationId }}
        </span>
      </nav>

      <!-- Action Buttons -->
      <div v-if="locationTree && !loading" class="flex items-center gap-2">
        <button
          v-if="!isEditingLocation"
          type="button"
          @click="isEditingLocation = true"
          class="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-xs hover:bg-gray-50 transition"
        >
          <svg class="h-3.5 w-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
          Edit Location
        </button>

        <button
          v-if="!showAddMeterForm"
          type="button"
          @click="showAddMeterForm = true"
          class="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-indigo-500 transition"
        >
          <svg class="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          Add Meter
        </button>
      </div>
    </div>

    <!-- Feedback Alerts -->
    <div
      v-if="locationSuccessMsg"
      class="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800 flex items-center justify-between shadow-xs transition"
    >
      <div class="flex items-center gap-2">
        <svg class="h-4 w-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span class="font-medium">{{ locationSuccessMsg }}</span>
      </div>
      <button
        type="button"
        @click="locationSuccessMsg = null"
        class="text-emerald-600 hover:text-emerald-800"
      >
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <div
      v-if="meterSuccessMsg"
      class="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-xs text-indigo-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs transition"
    >
      <div class="flex items-center gap-2.5">
        <span class="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 shrink-0">
          <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
        </span>
        <div>
          <p class="font-semibold">{{ meterSuccessMsg }}</p>
          <p v-if="newlyCreatedMeter" class="text-[11px] text-indigo-700 mt-0.5">
            Serial Number: <span class="font-mono font-bold">{{ newlyCreatedMeter.serialNumber }}</span> &bull;
            Type: <span class="capitalize">{{ newlyCreatedMeter.type }}</span>
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <router-link
          v-if="newlyCreatedMeter"
          :to="`/meters/${newlyCreatedMeter.id}`"
          class="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-indigo-500 transition"
        >
          View Meter Readings &rarr;
        </router-link>
        <button
          type="button"
          @click="meterSuccessMsg = null"
          class="text-indigo-400 hover:text-indigo-600 p-1"
        >
          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="rounded-2xl border border-gray-200 bg-white p-12 text-center shadow-xs">
      <div class="inline-flex items-center justify-center p-3 rounded-xl bg-indigo-50 text-indigo-600 mb-3 animate-pulse">
        <svg class="h-8 w-8 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
      <h3 class="text-sm font-semibold text-gray-900">Loading service location details...</h3>
      <p class="text-xs text-gray-500 mt-1">Fetching premise hierarchy, service points, and meters.</p>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="rounded-2xl border border-red-200 bg-red-50 p-8 text-center shadow-xs">
      <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 mb-3">
        <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <h3 class="text-base font-bold text-red-900">{{ error }}</h3>
      <p class="text-xs text-red-700 mt-1">Please check the ID or return to the locations directory.</p>
      <router-link
        to="/service-locations"
        class="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-red-500 transition"
      >
        Back to Service Locations
      </router-link>
    </div>

    <!-- Main Content -->
    <template v-else-if="locationTree">
      <!-- Edit Location Form (Conditional) -->
      <div v-if="isEditingLocation" class="transition-all">
        <ServiceLocationForm
          :location-id="locationTree.id"
          :initial-data="locationTree"
          title="Edit Service Location"
          subtitle="Update street address, city, state, or postal code for this facility."
          submit-button-text="Save Changes"
          @success="onLocationUpdated"
          @cancel="isEditingLocation = false"
        />
      </div>

      <!-- Premise Summary Card (Default Mode) -->
      <div v-else class="rounded-2xl border border-gray-200 bg-white shadow-xs overflow-hidden">
        <div class="p-6 sm:p-8">
          <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <!-- Left: Location Info -->
            <div class="flex items-start gap-4">
              <div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100 shadow-xs">
                <svg class="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>

              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <span class="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-gray-100 text-gray-700 tracking-wide font-mono">
                    ID #{{ locationTree.id }}
                  </span>
                  <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span class="h-1.5 w-1.5 rounded-full bg-emerald-500 mr-1.5"></span> Active Premise
                  </span>
                </div>

                <h1 class="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900 mt-1">
                  {{ locationTree.addressLine1 }}
                  <span v-if="locationTree.addressLine2" class="text-gray-500 font-normal text-xl">
                    ({{ locationTree.addressLine2 }})
                  </span>
                </h1>

                <p class="text-sm text-gray-600 flex items-center gap-1.5 mt-1">
                  <svg class="h-4 w-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>{{ locationTree.city }}, {{ locationTree.state }} {{ locationTree.postalCode }}</span>
                </p>
              </div>
            </div>

            <!-- Right: Quick Metadata & Action -->
            <div class="flex flex-col sm:flex-row lg:flex-col items-start lg:items-end justify-between gap-3 text-xs text-gray-500 border-t lg:border-t-0 pt-4 lg:pt-0 border-gray-100">
              <div class="space-y-1 lg:text-right">
                <p>Created: <span class="font-medium text-gray-700">{{ formatDate(locationTree.createdAt) }}</span></p>
                <p v-if="locationTree.updatedAt">Last updated: <span class="font-medium text-gray-700">{{ formatDateTime(locationTree.updatedAt) }}</span></p>
              </div>

              <button
                type="button"
                @click="isEditingLocation = true"
                class="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 transition"
              >
                <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit Premise Details
              </button>
            </div>
          </div>
        </div>

        <!-- Metric Stat Cards -->
        <div class="grid grid-cols-2 md:grid-cols-4 border-t border-gray-100 bg-gray-50/50 divide-x divide-y md:divide-y-0 divide-gray-100">
          <div class="p-4 sm:p-5">
            <span class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block">Service Points</span>
            <span class="text-2xl font-bold text-gray-900 mt-1 block">{{ metrics.totalPoints }}</span>
            <span class="text-[11px] text-gray-500 mt-0.5 block">Panels / Sockets</span>
          </div>

          <div class="p-4 sm:p-5">
            <span class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block">Installed Meters</span>
            <span class="text-2xl font-bold text-gray-900 mt-1 block">{{ metrics.totalMeters }}</span>
            <span class="text-[11px] text-gray-500 mt-0.5 block">All utility hardware</span>
          </div>

          <div class="p-4 sm:p-5">
            <span class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block">Active Status</span>
            <div class="flex items-center gap-2 mt-1">
              <span class="text-2xl font-bold text-emerald-600">{{ metrics.activeMeters }}</span>
              <span class="text-xs text-gray-400">/ {{ metrics.totalMeters }}</span>
            </div>
            <span class="text-[11px] text-emerald-700 mt-0.5 block font-medium">Operational</span>
          </div>

          <div class="p-4 sm:p-5">
            <span class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block">Utility Mix</span>
            <div class="flex items-center gap-2.5 mt-2">
              <span class="inline-flex items-center gap-1 text-xs font-semibold text-amber-700" title="Electric meters">
                ⚡ {{ metrics.electric }}
              </span>
              <span class="inline-flex items-center gap-1 text-xs font-semibold text-blue-700" title="Water meters">
                💧 {{ metrics.water }}
              </span>
              <span class="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700" title="Gas meters">
                🔥 {{ metrics.gas }}
              </span>
            </div>
            <span class="text-[11px] text-gray-500 mt-0.5 block">Elec / Water / Gas</span>
          </div>
        </div>
      </div>

      <!-- Add Meter Form (Drawer / Inline Toggle) -->
      <div v-if="showAddMeterForm" class="transition-all">
        <MeterForm
          :initial-location-id="locationTree.id"
          :initial-service-point-id="selectedPointFilter !== 'all' ? selectedPointFilter : null"
          :lock-location="true"
          title="Add Meter to this Premise"
          subtitle="Install a meter at an existing service point or define a new service point on the fly."
          @success="onMeterCreated"
          @cancel="showAddMeterForm = false"
        />
      </div>

      <!-- Service Points Filter & Overview Strip -->
      <div class="rounded-xl border border-gray-200 bg-white p-5 shadow-xs space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 class="text-sm font-bold text-gray-900 tracking-tight flex items-center gap-2">
              <span class="flex h-5 w-5 items-center justify-center rounded-md bg-indigo-50 text-indigo-600 text-xs">
                ⊞
              </span>
              Service Points at this Premise
            </h3>
            <p class="text-xs text-gray-500 mt-0.5">
              Filter meters by clicking any service point socket or panel below.
            </p>
          </div>

          <!-- Quick Service Point Dropdown Filter -->
          <div class="flex items-center gap-2">
            <label for="sp-select-filter" class="text-xs font-semibold text-gray-600 whitespace-nowrap">
              Socket Filter:
            </label>
            <select
              id="sp-select-filter"
              v-model="selectedPointFilter"
              class="rounded-lg border border-gray-300 bg-white py-1.5 pl-3 pr-8 text-xs font-medium text-gray-700 shadow-xs focus:border-indigo-600 focus:outline-hidden"
            >
              <option value="all">All Service Points ({{ allMeters.length }} meters)</option>
              <option
                v-for="sp in servicePoints"
                :key="sp.id"
                :value="sp.id"
              >
                {{ sp.identifier }} ({{ countMetersForPoint(sp.id) }} meters)
              </option>
            </select>
          </div>
        </div>

        <!-- Service Points Interactive Pill Grid -->
        <div v-if="servicePoints.length > 0" class="flex flex-wrap gap-2 pt-1">
          <!-- "All" Pill -->
          <button
            type="button"
            @click="selectedPointFilter = 'all'"
            :class="[
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition shadow-2xs',
              selectedPointFilter === 'all'
                ? 'bg-indigo-600 text-white shadow-indigo-200'
                : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200',
            ]"
          >
            <span>All Points</span>
            <span
              :class="[
                'px-1.5 py-0.2 rounded-full text-[10px] font-bold',
                selectedPointFilter === 'all' ? 'bg-indigo-700 text-white' : 'bg-gray-200 text-gray-700',
              ]"
            >
              {{ allMeters.length }}
            </span>
          </button>

          <!-- Individual Point Pills -->
          <button
            v-for="sp in servicePoints"
            :key="sp.id"
            type="button"
            @click="togglePointFilter(sp.id)"
            :class="[
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition shadow-2xs',
              selectedPointFilter === sp.id
                ? 'bg-indigo-600 text-white shadow-indigo-200'
                : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200',
            ]"
            :title="sp.notes || sp.identifier"
          >
            <span>{{ sp.identifier }}</span>
            <span
              :class="[
                'px-1.5 py-0.2 rounded-full text-[10px] font-bold',
                selectedPointFilter === sp.id ? 'bg-indigo-700 text-white' : 'bg-gray-200 text-gray-700',
              ]"
            >
              {{ countMetersForPoint(sp.id) }}
            </span>
          </button>
        </div>

        <div v-else class="rounded-lg border border-dashed border-gray-200 p-4 text-center text-xs text-gray-500">
          No service points have been configured for this location yet. Click "Add Meter" to create your first service point.
        </div>
      </div>

      <!-- Meters Section with Search, Table, and Pagination -->
      <div class="rounded-2xl border border-gray-200 bg-white shadow-xs overflow-hidden">
        <!-- Table Control Header -->
        <div class="p-5 border-b border-gray-200 space-y-3">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 class="text-base font-bold text-gray-900 tracking-tight flex items-center gap-2">
                <span>Installed Meters</span>
                <span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600 font-mono">
                  {{ filteredMeters.length }}
                </span>
              </h2>
              <p class="text-xs text-gray-500 mt-0.5">
                Full list of telemetry devices attached to this premise with reading telemetry access.
              </p>
            </div>

            <div class="flex items-center gap-2">
              <button
                v-if="!showAddMeterForm"
                type="button"
                @click="openAddMeterForPoint(selectedPointFilter !== 'all' ? selectedPointFilter : undefined)"
                class="inline-flex items-center gap-1 rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition"
              >
                <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
                <span>Add Meter{{ selectedPointFilter !== 'all' ? ' to Point' : '' }}</span>
              </button>
            </div>
          </div>

          <!-- Search & Filter Controls -->
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
            <!-- Search Input -->
            <div class="lg:col-span-2 relative">
              <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <svg class="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                v-model="searchQuery"
                type="text"
                placeholder="Search by serial #, point name, notes..."
                class="block w-full rounded-lg border border-gray-300 py-1.5 pl-9 pr-8 text-xs placeholder:text-gray-400 focus:border-indigo-600 focus:outline-hidden"
              />
              <button
                v-if="searchQuery"
                type="button"
                @click="searchQuery = ''"
                class="absolute inset-y-0 right-0 flex items-center pr-2.5 text-gray-400 hover:text-gray-600"
              >
                <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <!-- Utility Type Filter -->
            <div>
              <select
                v-model="selectedTypeFilter"
                class="block w-full rounded-lg border border-gray-300 bg-white py-1.5 px-3 text-xs text-gray-700 focus:border-indigo-600 focus:outline-hidden"
              >
                <option value="all">All Utilities</option>
                <option value="electric">⚡ Electric</option>
                <option value="water">💧 Water</option>
                <option value="gas">🔥 Gas</option>
              </select>
            </div>

            <!-- Status Filter -->
            <div>
              <select
                v-model="selectedStatusFilter"
                class="block w-full rounded-lg border border-gray-300 bg-white py-1.5 px-3 text-xs text-gray-700 focus:border-indigo-600 focus:outline-hidden"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active Only</option>
                <option value="inactive">Inactive</option>
                <option value="maintenance">Maintenance</option>
                <option value="decommissioned">Decommissioned</option>
              </select>
            </div>
          </div>

          <!-- Active Filters Bar -->
          <div
            v-if="searchQuery || selectedPointFilter !== 'all' || selectedTypeFilter !== 'all' || selectedStatusFilter !== 'all'"
            class="flex flex-wrap items-center gap-2 pt-1 text-xs text-gray-500"
          >
            <span class="font-medium">Active filters:</span>

            <span
              v-if="selectedPointFilter !== 'all'"
              class="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 border border-indigo-100"
            >
              Point: {{ servicePoints.find(p => p.id === selectedPointFilter)?.identifier || selectedPointFilter }}
              <button type="button" @click="selectedPointFilter = 'all'" class="text-indigo-500 hover:text-indigo-800">✕</button>
            </span>

            <span
              v-if="searchQuery"
              class="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-700"
            >
              Search: "{{ searchQuery }}"
              <button type="button" @click="searchQuery = ''" class="text-gray-500 hover:text-gray-800">✕</button>
            </span>

            <span
              v-if="selectedTypeFilter !== 'all'"
              class="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-700 capitalize"
            >
              Type: {{ selectedTypeFilter }}
              <button type="button" @click="selectedTypeFilter = 'all'" class="text-gray-500 hover:text-gray-800">✕</button>
            </span>

            <span
              v-if="selectedStatusFilter !== 'all'"
              class="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-700 capitalize"
            >
              Status: {{ selectedStatusFilter }}
              <button type="button" @click="selectedStatusFilter = 'all'" class="text-gray-500 hover:text-gray-800">✕</button>
            </span>

            <button
              type="button"
              @click="clearAllFilters"
              class="text-indigo-600 hover:text-indigo-800 font-semibold underline text-[11px] ml-1"
            >
              Clear all
            </button>
          </div>
        </div>

        <!-- Meters Table -->
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200 text-left text-xs">
            <thead class="bg-gray-50/75 text-gray-500 uppercase tracking-wider font-semibold">
              <tr>
                <th scope="col" class="py-3 pl-6 pr-3">Meter ID / Serial Number</th>
                <th scope="col" class="px-3 py-3">Utility Type</th>
                <th scope="col" class="px-3 py-3">Service Point (Socket)</th>
                <th scope="col" class="px-3 py-3">Status</th>
                <th scope="col" class="px-3 py-3">Installed Date</th>
                <th scope="col" class="py-3 pl-3 pr-6 text-right">Actions</th>
              </tr>
            </thead>

            <tbody class="divide-y divide-gray-100 bg-white">
              <tr
                v-for="m in paginatedMeters"
                :key="m.id"
                class="hover:bg-indigo-50/30 transition group"
              >
                <!-- Serial Number -->
                <td class="py-3.5 pl-6 pr-3 font-medium text-gray-900 whitespace-nowrap">
                  <router-link
                    :to="`/meters/${m.id}`"
                    class="font-mono font-bold text-indigo-600 hover:text-indigo-800 transition flex items-center gap-2"
                  >
                    <span>{{ m.serialNumber }}</span>
                    <span class="text-[10px] text-gray-400 font-normal group-hover:translate-x-0.5 transition-transform">
                      &rarr;
                    </span>
                  </router-link>
                  <span class="text-[10px] text-gray-400 block font-mono">ID #{{ m.id }}</span>
                </td>

                <!-- Utility Type -->
                <td class="px-3 py-3.5 whitespace-nowrap">
                  <span
                    v-if="m.type === 'electric'"
                    class="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200/60"
                  >
                    ⚡ Electric
                  </span>
                  <span
                    v-else-if="m.type === 'water'"
                    class="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 border border-blue-200/60"
                  >
                    💧 Water
                  </span>
                  <span
                    v-else-if="m.type === 'gas'"
                    class="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200/60"
                  >
                    🔥 Gas
                  </span>
                  <span
                    v-else
                    class="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700"
                  >
                    {{ m.type }}
                  </span>
                </td>

                <!-- Service Point -->
                <td class="px-3 py-3.5 whitespace-nowrap">
                  <button
                    type="button"
                    @click="selectedPointFilter = m.servicePointId"
                    class="inline-flex items-center gap-1 rounded-md bg-gray-100 hover:bg-indigo-50 hover:text-indigo-700 px-2 py-0.5 text-xs font-medium text-gray-700 transition"
                    :title="`Filter by ${m.servicePointName}`"
                  >
                    <span>{{ m.servicePointName || `Point #${m.servicePointId}` }}</span>
                    <svg class="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                    </svg>
                  </button>
                  <span v-if="m.servicePointNotes" class="block text-[10px] text-gray-400 mt-0.5 truncate max-w-[200px]">
                    {{ m.servicePointNotes }}
                  </span>
                </td>

                <!-- Status -->
                <td class="px-3 py-3.5 whitespace-nowrap">
                  <span
                    v-if="m.status === 'active'"
                    class="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200/60"
                  >
                    <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span> Active
                  </span>
                  <span
                    v-else-if="m.status === 'maintenance'"
                    class="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200/60"
                  >
                    <span class="h-1.5 w-1.5 rounded-full bg-amber-500"></span> Maintenance
                  </span>
                  <span
                    v-else-if="m.status === 'decommissioned'"
                    class="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 border border-red-200/60"
                  >
                    <span class="h-1.5 w-1.5 rounded-full bg-red-500"></span> Decommissioned
                  </span>
                  <span
                    v-else
                    class="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700"
                  >
                    {{ m.status }}
                  </span>
                </td>

                <!-- Installed Date -->
                <td class="px-3 py-3.5 whitespace-nowrap text-gray-600">
                  {{ formatDate(m.installedOn) }}
                </td>

                <!-- Actions -->
                <td class="py-3.5 pl-3 pr-6 text-right whitespace-nowrap">
                  <router-link
                    :to="`/meters/${m.id}`"
                    class="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 shadow-2xs hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 transition"
                  >
                    View Telemetry
                    <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </router-link>
                </td>
              </tr>

              <!-- Empty Table State -->
              <tr v-if="filteredMeters.length === 0">
                <td colspan="6" class="py-12 text-center text-gray-500">
                  <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400 mb-2">
                    <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <p class="text-sm font-semibold text-gray-700">No meters found</p>
                  <p class="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
                    {{
                      searchQuery || selectedPointFilter !== 'all' || selectedTypeFilter !== 'all'
                        ? 'Try clearing your search query or filters to view all installed meters.'
                        : 'No meters have been registered to this location yet.'
                    }}
                  </p>
                  <div class="mt-4 flex items-center justify-center gap-2">
                    <button
                      v-if="searchQuery || selectedPointFilter !== 'all' || selectedTypeFilter !== 'all'"
                      type="button"
                      @click="clearAllFilters"
                      class="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-xs hover:bg-gray-50 transition"
                    >
                      Clear Filters
                    </button>
                    <button
                      type="button"
                      @click="showAddMeterForm = true"
                      class="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-indigo-500 transition"
                    >
                      + Add Meter
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination Controls -->
        <div
          v-if="filteredMeters.length > 0"
          class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-t border-gray-200 bg-gray-50/50 text-xs text-gray-600"
        >
          <!-- Results Count and Page Size Selector -->
          <div class="flex items-center gap-3">
            <span>
              Showing <span class="font-semibold text-gray-900">{{ paginationStart }}</span> to
              <span class="font-semibold text-gray-900">{{ paginationEnd }}</span> of
              <span class="font-semibold text-gray-900">{{ filteredMeters.length }}</span> meters
            </span>

            <div class="flex items-center gap-1.5">
              <label for="meters-page-size" class="text-gray-500">Per page:</label>
              <select
                id="meters-page-size"
                v-model="pageSize"
                class="rounded-md border border-gray-300 bg-white py-1 pl-2 pr-6 text-xs text-gray-700 focus:border-indigo-600 focus:outline-hidden"
              >
                <option v-for="size in pageSizeOptions" :key="size" :value="size">
                  {{ size }}
                </option>
              </select>
            </div>
          </div>

          <!-- Page Navigation Buttons -->
          <div class="flex items-center gap-1">
            <button
              type="button"
              @click="goToPage(currentPage - 1)"
              :disabled="currentPage <= 1"
              class="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 shadow-2xs hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              &larr; Previous
            </button>

            <!-- Page Numbers -->
            <div class="flex items-center gap-1 px-1">
              <button
                v-for="p in totalPages"
                :key="p"
                type="button"
                @click="goToPage(p)"
                :class="[
                  'h-7 w-7 rounded-md text-xs font-semibold transition',
                  p === currentPage
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-gray-700 hover:bg-gray-100',
                ]"
              >
                {{ p }}
              </button>
            </div>

            <button
              type="button"
              @click="goToPage(currentPage + 1)"
              :disabled="currentPage >= totalPages"
              class="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 shadow-2xs hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              Next &rarr;
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

