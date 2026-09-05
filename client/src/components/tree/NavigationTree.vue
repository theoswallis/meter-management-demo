<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { useTopologyStore } from '../../stores/topology.js';
import type { ServiceLocationTree, ServicePoint } from '../../api/types.js';

const store = useTopologyStore();

function handleLocationClick(loc: ServiceLocationTree) {
  if (store.selectedNode?.type === 'location' && store.selectedNode?.id === loc.id) {
    store.toggleLocation(loc.id);
  } else {
    store.selectLocation(loc);
  }
}

function handlePointClick(sp: ServicePoint, loc: ServiceLocationTree) {
  if (store.selectedNode?.type === 'point' && store.selectedNode?.id === sp.id) {
    store.togglePoint(sp.id);
  } else {
    store.selectPoint(sp, loc);
  }
}

function getMeterColorClass(type: string): string {
  switch (type) {
    case 'electric':
      return 'bg-amber-100 text-amber-800 border-amber-300';
    case 'water':
      return 'bg-sky-100 text-sky-800 border-sky-300';
    case 'gas':
      return 'bg-orange-100 text-orange-800 border-orange-300';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-300';
  }
}

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'active':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-600/20';
    case 'maintenance':
      return 'bg-amber-50 text-amber-700 ring-amber-600/20';
    case 'decommissioned':
      return 'bg-gray-100 text-gray-600 ring-gray-500/20';
    case 'inactive':
      return 'bg-blue-50 text-blue-700 ring-blue-600/20';
    default:
      return 'bg-gray-50 text-gray-700 ring-gray-600/20';
  }
}

function getTotalMetersInLocation(loc: ServiceLocationTree): number {
  if (!loc.servicePoints) return 0;
  return loc.servicePoints.reduce((acc, sp) => acc + (sp.meters?.length || 0), 0);
}
</script>

<template>
  <div class="flex flex-col h-full bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
    <!-- Header & Search Toolbar -->
    <div class="p-4 border-b border-gray-200 bg-gray-50/70">
      <div class="flex items-center justify-between gap-2 mb-3">
        <div class="flex min-w-0 items-center gap-2">
          <svg class="w-5 h-5 shrink-0 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          <h2 class="truncate text-sm font-semibold text-gray-900 tracking-tight">Topology Hierarchy</h2>
        </div>
        <div class="flex shrink-0 items-center gap-0.5 text-xs">
          <button
            type="button"
            @click="store.expandAll()"
            class="whitespace-nowrap px-1.5 py-1 font-medium text-gray-600 hover:text-indigo-600 hover:bg-white rounded transition border border-transparent hover:border-gray-200"
            title="Expand all tree nodes"
          >
            Expand
          </button>
          <span class="text-gray-300">|</span>
          <button
            type="button"
            @click="store.collapseAll()"
            class="whitespace-nowrap px-1.5 py-1 font-medium text-gray-600 hover:text-indigo-600 hover:bg-white rounded transition border border-transparent hover:border-gray-200"
            title="Collapse all tree nodes"
          >
            Collapse
          </button>
        </div>
      </div>

      <!-- Search Input -->
      <div class="relative">
        <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <svg class="h-4 w-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd" />
          </svg>
        </div>
        <input
          v-model="store.searchQuery"
          type="text"
          placeholder="Filter locations, units, meters..."
          class="w-full rounded-lg border border-gray-300 bg-white py-1.5 pl-9 pr-8 text-xs text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition"
        />
        <button
          v-if="store.searchQuery"
          @click="store.searchQuery = ''"
          type="button"
          class="absolute inset-y-0 right-0 flex items-center pr-2.5 text-gray-400 hover:text-gray-600"
        >
          <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Tree Content Body -->
    <div class="flex-1 overflow-y-auto p-2 min-h-[350px] max-h-[calc(100vh-280px)]">
      <!-- Loading State -->
      <div v-if="store.loading" class="p-6 space-y-3">
        <div v-for="i in 4" :key="i" class="animate-pulse flex items-center gap-3">
          <div class="h-4 w-4 bg-gray-200 rounded"></div>
          <div class="h-4 w-32 bg-gray-200 rounded"></div>
          <div class="h-4 w-12 bg-gray-100 rounded ml-auto"></div>
        </div>
      </div>

      <!-- Error State -->
      <div v-else-if="store.error" class="p-4 rounded-lg bg-red-50 text-red-700 text-xs">
        <div class="font-semibold mb-1">Failed to load topology</div>
        <div>{{ store.error }}</div>
        <button
          @click="store.fetchAll()"
          class="mt-2 text-xs font-semibold underline hover:text-red-800"
        >
          Retry
        </button>
      </div>

      <!-- Empty State -->
      <div v-else-if="store.filteredTrees.length === 0" class="p-8 text-center text-gray-500 text-xs">
        <svg class="mx-auto h-8 w-8 text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p class="font-medium text-gray-900">No matching nodes found</p>
        <p class="mt-0.5">Try adjusting your filter search term.</p>
      </div>

      <!-- Tree Nodes List -->
      <ul v-else class="space-y-1 text-xs">
        <!-- Location Node (Level 1) -->
        <li v-for="loc in store.filteredTrees" :key="loc.id" class="rounded-lg transition">
          <div
            :class="[
              'flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition select-none group',
              store.selectedNode?.type === 'location' && store.selectedNode?.id === loc.id
                ? 'bg-indigo-50/90 text-indigo-950 font-medium ring-1 ring-indigo-500/30'
                : 'text-gray-800 hover:bg-gray-100/80',
            ]"
            @click="handleLocationClick(loc)"
          >
            <!-- Expand/Collapse Chevron -->
            <button
              type="button"
              class="p-0.5 text-gray-400 hover:text-gray-700 rounded transition"
              @click.stop="store.toggleLocation(loc.id)"
            >
              <svg
                :class="['h-3.5 w-3.5 transition-transform duration-150', store.isLocationExpanded(loc.id) ? 'rotate-90 text-gray-600' : '']"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd" />
              </svg>
            </button>

            <!-- Location Building Icon -->
            <div class="h-6 w-6 rounded bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
              <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>

            <!-- Location Label -->
            <div class="flex-1 min-w-0 pr-1">
              <div :title="loc.addressLine1" class="truncate font-semibold text-gray-900 leading-tight">
                {{ loc.addressLine1 }}
              </div>
              <div class="text-[10px] text-gray-500 truncate tabular-nums">
                {{ loc.city }}, {{ loc.state }} {{ loc.postalCode }}
              </div>
            </div>

            <!-- Badges & Action -->
            <div class="flex items-center gap-1.5 shrink-0">
              <span
                class="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 tabular-nums"
                title="Service Points count"
              >
                {{ loc.servicePoints?.length || 0 }} pts
              </span>
              <span
                class="rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 tabular-nums"
                title="Meters count"
              >
                {{ getTotalMetersInLocation(loc) }} mtr
              </span>
              <RouterLink
                :to="`/service-locations/${loc.id}`"
                class="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-indigo-600 rounded transition"
                title="Go to location page"
                @click.stop
              >
                <svg class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h4a.75.75 0 010 1.5h-4z" clip-rule="evenodd" />
                  <path fill-rule="evenodd" d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" clip-rule="evenodd" />
                </svg>
              </RouterLink>
            </div>
          </div>

          <!-- Service Points Sub-Tree (Level 2) -->
          <ul
            v-if="store.isLocationExpanded(loc.id) && loc.servicePoints && loc.servicePoints.length > 0"
            class="pl-4 ml-3 border-l-2 border-indigo-100 mt-1 space-y-1"
          >
            <li v-for="sp in loc.servicePoints" :key="sp.id">
              <div
                :class="[
                  'flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer transition select-none group',
                  store.selectedNode?.type === 'point' && store.selectedNode?.id === sp.id
                    ? 'bg-indigo-50 text-indigo-950 font-medium ring-1 ring-indigo-500/30'
                    : 'text-gray-700 hover:bg-gray-100/70',
                ]"
                @click="handlePointClick(sp, loc)"
              >
                <!-- Expand Chevron for Points -->
                <button
                  type="button"
                  class="p-0.5 text-gray-400 hover:text-gray-700 rounded transition"
                  @click.stop="store.togglePoint(sp.id)"
                >
                  <svg
                    :class="['h-3 w-3 transition-transform duration-150', store.isPointExpanded(sp.id) ? 'rotate-90 text-gray-600' : '']"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd" />
                  </svg>
                </button>

                <!-- Service Point Icon -->
                <div class="h-5 w-5 rounded bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
                  <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
                    <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
                    <line x1="6" y1="6" x2="6.01" y2="6"></line>
                    <line x1="6" y1="18" x2="6.01" y2="18"></line>
                  </svg>
                </div>

                <!-- Point Label -->
                <div class="flex-1 min-w-0 pr-1">
                  <div :title="sp.identifier" class="truncate font-medium text-gray-900">
                    {{ sp.identifier }}
                  </div>
                  <div v-if="sp.notes" class="text-[10px] text-gray-400 truncate italic">
                    {{ sp.notes }}
                  </div>
                </div>

                <!-- Badges & Action -->
                <div class="flex items-center gap-1.5 shrink-0">
                  <span
                    class="rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium text-gray-500 tabular-nums"
                  >
                    {{ sp.meters?.length || 0 }} mtrs
                  </span>
                  <RouterLink
                    :to="`/service-points/${sp.id}`"
                    class="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-indigo-600 rounded transition"
                    title="Go to service point page"
                    @click.stop
                  >
                    <svg class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                      <path fill-rule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h4a.75.75 0 010 1.5h-4z" clip-rule="evenodd" />
                    </svg>
                  </RouterLink>
                </div>
              </div>

              <!-- Meters Sub-Tree (Level 3) -->
              <ul
                v-if="store.isPointExpanded(sp.id) && sp.meters && sp.meters.length > 0"
                class="pl-4 ml-2.5 border-l-2 border-gray-200 mt-1 space-y-1"
              >
                <li v-for="m in sp.meters" :key="m.id">
                  <div
                    :class="[
                      'flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer transition select-none group',
                      store.selectedNode?.type === 'meter' && store.selectedNode?.id === m.id
                        ? 'bg-indigo-50 text-indigo-950 font-medium ring-1 ring-indigo-500/30'
                        : 'text-gray-600 hover:bg-gray-100/60',
                    ]"
                    @click="store.selectMeter(m, sp, loc)"
                  >
                    <!-- Meter Type Icon -->
                    <div
                      :class="[
                        'h-5 w-5 rounded flex items-center justify-center shrink-0 border text-[10px] font-bold uppercase',
                        getMeterColorClass(m.type),
                      ]"
                    >
                      <span v-if="m.type === 'electric'">⚡</span>
                      <span v-else-if="m.type === 'water'">💧</span>
                      <span v-else-if="m.type === 'gas'">🔥</span>
                      <span v-else>M</span>
                    </div>

                    <!-- Meter Serial -->
                    <div class="flex-1 min-w-0">
                      <div :title="m.serialNumber" class="truncate font-mono text-[11px] text-gray-900">
                        {{ m.serialNumber }}
                      </div>
                    </div>

                    <!-- Status Pill -->
                    <span
                      :class="[
                        'rounded-full px-1.5 py-0.5 text-[9px] font-medium capitalize ring-1 ring-inset shrink-0',
                        getStatusBadgeClass(m.status),
                      ]"
                    >
                      {{ m.status }}
                    </span>

                    <!-- Quick Link -->
                    <RouterLink
                      :to="`/meters/${m.id}`"
                      class="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-indigo-600 rounded transition shrink-0"
                      title="Go to meter analytics"
                      @click.stop
                    >
                      <svg class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h4a.75.75 0 010 1.5h-4z" clip-rule="evenodd" />
                      </svg>
                    </RouterLink>
                  </div>
                </li>
              </ul>

              <!-- Service Point with 0 meters message -->
              <div
                v-else-if="store.isPointExpanded(sp.id) && (!sp.meters || sp.meters.length === 0)"
                class="pl-6 py-1 text-[11px] text-gray-400 italic"
              >
                No meters installed
              </div>
            </li>
          </ul>

          <!-- Location with 0 service points message -->
          <div
            v-else-if="store.isLocationExpanded(loc.id) && (!loc.servicePoints || loc.servicePoints.length === 0)"
            class="pl-7 py-1 text-[11px] text-gray-400 italic"
          >
            No service points registered
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>
