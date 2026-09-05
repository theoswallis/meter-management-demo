<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useTopologyStore } from '../stores/topology.js';
import ServiceLocationForm from '../components/locations/ServiceLocationForm.vue';
import type { ServiceLocation } from '../api/types.js';

const route = useRoute();
const router = useRouter();
const topologyStore = useTopologyStore();

const showAddForm = ref(route.query.new === '1' || route.query.action === 'new');
const searchQuery = ref('');
const selectedStateFilter = ref('all');
const newlyCreatedId = ref<number | null>(null);
const successMessage = ref<string | null>(null);

onMounted(async () => {
  if (topologyStore.locations.length === 0) {
    await topologyStore.fetchAll();
  }
  if (route.query.created) {
    const createdId = Number(route.query.created);
    if (!isNaN(createdId)) {
      newlyCreatedId.value = createdId;
      const createdLoc = topologyStore.locations.find((l) => l.id === createdId);
      if (createdLoc) {
        successMessage.value = `Service location "${createdLoc.addressLine1}, ${createdLoc.city}, ${createdLoc.state} ${createdLoc.postalCode}" was successfully registered!`;
      } else {
        successMessage.value = `Service location #${createdId} was successfully registered!`;
      }
      setTimeout(() => {
        if (newlyCreatedId.value === createdId) {
          newlyCreatedId.value = null;
        }
      }, 5000);
    }
  }
});

// Summary Metrics
const totalLocations = computed(() => topologyStore.locations.length);

const uniqueStates = computed(() => {
  const states = new Set(topologyStore.locations.map((loc) => loc.state).filter(Boolean));
  return Array.from(states).sort();
});

const totalPoints = computed(() => {
  return Object.values(topologyStore.trees).reduce((sum, tree) => {
    return sum + (tree.servicePoints?.length ?? 0);
  }, 0);
});

const totalMeters = computed(() => {
  return Object.values(topologyStore.trees).reduce((sum, tree) => {
    const meterCount = (tree.servicePoints || []).reduce(
      (mSum, sp) => mSum + (sp.meters?.length ?? 0),
      0
    );
    return sum + meterCount;
  }, 0);
});

// Filtered Locations List
const filteredLocations = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  const stateFilter = selectedStateFilter.value;

  return topologyStore.locations.filter((loc) => {
    // State Filter
    if (stateFilter !== 'all' && loc.state !== stateFilter) {
      return false;
    }

    // Search Query Filter
    if (!q) return true;

    return (
      loc.addressLine1.toLowerCase().includes(q) ||
      (loc.addressLine2 && loc.addressLine2.toLowerCase().includes(q)) ||
      loc.city.toLowerCase().includes(q) ||
      loc.state.toLowerCase().includes(q) ||
      loc.postalCode.includes(q) ||
      String(loc.id) === q
    );
  });
});

function getPointsCount(locationId: number): number {
  return topologyStore.trees[locationId]?.servicePoints?.length ?? 0;
}

function getMetersCount(locationId: number): number {
  const tree = topologyStore.trees[locationId];
  if (!tree?.servicePoints) return 0;
  return tree.servicePoints.reduce((sum, sp) => sum + (sp.meters?.length ?? 0), 0);
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

// Handle Location Created
async function handleLocationCreated(newLoc: ServiceLocation) {
  showAddForm.value = false;
  newlyCreatedId.value = newLoc.id;
  successMessage.value = `Service location "${newLoc.addressLine1}, ${newLoc.city}, ${newLoc.state} ${newLoc.postalCode}" was successfully registered!`;

  // Re-fetch all topology data to populate trees and counts
  await topologyStore.fetchAll();

  // Clear highlight after 5 seconds
  setTimeout(() => {
    if (newlyCreatedId.value === newLoc.id) {
      newlyCreatedId.value = null;
    }
  }, 5000);
}

function navigateToDashboardNode(locationId: number) {
  const tree = topologyStore.trees[locationId];
  if (tree) {
    topologyStore.selectLocation(tree);
  }
  router.push('/');
}

function clearFilters() {
  searchQuery.value = '';
  selectedStateFilter.value = 'all';
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header with Action -->
    <header class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
          Service Locations
        </h1>
        <p class="text-xs sm:text-sm text-gray-500 mt-1">
          Manage registered facilities, physical premises, and connected infrastructure.
        </p>
      </div>

      <div class="flex items-center gap-2.5">
        <button
          type="button"
          @click="topologyStore.fetchAll()"
          :disabled="topologyStore.loading"
          class="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 shadow-xs hover:bg-gray-50 focus:outline-hidden transition disabled:opacity-50"
          title="Refresh locations"
        >
          <svg
            :class="['h-4 w-4 text-gray-500', topologyStore.loading ? 'animate-spin' : '']"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span class="hidden sm:inline">Refresh</span>
        </button>

        <button
          type="button"
          @click="showAddForm = !showAddForm"
          class="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-500 focus:outline-hidden focus:ring-2 focus:ring-indigo-600/30 transition"
        >
          <svg
            v-if="!showAddForm"
            class="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          <svg
            v-else
            class="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
          <span>{{ showAddForm ? 'Close Form' : 'Add Location' }}</span>
        </button>
      </div>
    </header>

    <!-- Success Toast / Notification Banner -->
    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="opacity-0 -translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-2"
    >
      <div
        v-if="successMessage"
        class="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-xs flex items-center justify-between gap-3 text-xs text-emerald-800"
      >
        <div class="flex items-center gap-2.5">
          <span class="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shrink-0">
            <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
            </svg>
          </span>
          <span class="font-medium">{{ successMessage }}</span>
        </div>
        <button
          type="button"
          @click="successMessage = null"
          class="text-emerald-500 hover:text-emerald-700 p-1 rounded-md"
        >
          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </Transition>

    <!-- Inline Add Location Form Section -->
    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="opacity-0 -translate-y-4 scale-98"
      enter-to-class="opacity-100 translate-y-0 scale-100"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="opacity-100 translate-y-0 scale-100"
      leave-to-class="opacity-0 -translate-y-4 scale-98"
    >
      <div v-if="showAddForm" class="mb-6">
        <ServiceLocationForm
          compact
          title="Add New Service Location"
          subtitle="All fields marked with * are required. Complete the form with inline validation before submitting."
          @success="handleLocationCreated"
          @cancel="showAddForm = false"
        />
      </div>
    </Transition>

    <!-- Quick Stats Metric Row -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
        <div class="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Total Locations</div>
        <div class="text-2xl font-bold text-gray-900 mt-1 tabular-nums">
          {{ totalLocations }}
        </div>
        <div class="text-[10px] text-gray-400 mt-0.5">Physical properties</div>
      </div>

      <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
        <div class="text-[11px] font-medium text-gray-500 uppercase tracking-wider">States Covered</div>
        <div class="text-2xl font-bold text-indigo-600 mt-1 tabular-nums">
          {{ uniqueStates.length }}
        </div>
        <div class="text-[10px] text-gray-400 mt-0.5">{{ uniqueStates.join(', ') || 'None' }}</div>
      </div>

      <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
        <div class="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Service Points</div>
        <div class="text-2xl font-bold text-gray-900 mt-1 tabular-nums">
          {{ totalPoints }}
        </div>
        <div class="text-[10px] text-gray-400 mt-0.5">Meter sockets & panels</div>
      </div>

      <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
        <div class="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Connected Meters</div>
        <div class="text-2xl font-bold text-emerald-600 mt-1 tabular-nums">
          {{ totalMeters }}
        </div>
        <div class="text-[10px] text-gray-400 mt-0.5">Deployed telemetry units</div>
      </div>
    </div>

    <!-- Search & Filter Controls -->
    <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
      <div class="flex flex-col sm:flex-row items-center justify-between gap-3">
        <!-- Search Input -->
        <div class="relative w-full sm:w-96">
          <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <svg class="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search address, city, state, or postal code..."
            class="block w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-xs placeholder-gray-400 focus:border-indigo-600 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 transition"
          />
        </div>

        <!-- Filter Dropdown & Reset -->
        <div class="flex items-center gap-2.5 w-full sm:w-auto justify-end">
          <div class="flex items-center gap-1.5">
            <label for="state-filter" class="text-xs text-gray-500 whitespace-nowrap">State:</label>
            <select
              id="state-filter"
              v-model="selectedStateFilter"
              class="rounded-lg border border-gray-300 bg-white py-1.5 pl-2.5 pr-8 text-xs text-gray-700 focus:border-indigo-600 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="all">All States</option>
              <option v-for="st in uniqueStates" :key="st" :value="st">
                {{ st }}
              </option>
            </select>
          </div>

          <button
            v-if="searchQuery || selectedStateFilter !== 'all'"
            type="button"
            @click="clearFilters"
            class="text-xs text-indigo-600 hover:text-indigo-800 font-medium px-2 py-1.5 rounded hover:bg-indigo-50 transition"
          >
            Clear Filters
          </button>
        </div>
      </div>
    </div>

    <!-- Locations Table Card -->
    <div class="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
      <!-- Loading State -->
      <div v-if="topologyStore.loading && topologyStore.locations.length === 0" class="p-8 space-y-3">
        <div v-for="i in 5" :key="i" class="h-10 bg-gray-100 rounded-lg animate-pulse"></div>
      </div>

      <!-- Error State -->
      <div v-else-if="topologyStore.error" class="p-8 text-center text-xs text-red-600 bg-red-50">
        {{ topologyStore.error }}
      </div>

      <!-- Empty State (No locations in database) -->
      <div
        v-else-if="topologyStore.locations.length === 0"
        class="p-12 text-center"
      >
        <div class="mx-auto w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 mb-3">
          <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>
        <h3 class="text-sm font-semibold text-gray-900">No Service Locations Yet</h3>
        <p class="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
          Get started by adding your first service location to register meter sockets and premises.
        </p>
        <button
          type="button"
          @click="showAddForm = true"
          class="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-500 transition"
        >
          + Add First Location
        </button>
      </div>

      <!-- No Filter Results State -->
      <div
        v-else-if="filteredLocations.length === 0"
        class="p-12 text-center"
      >
        <p class="text-sm font-medium text-gray-700">No service locations match your search.</p>
        <p class="text-xs text-gray-400 mt-1">Try changing your search query or state filter.</p>
        <button
          type="button"
          @click="clearFilters"
          class="mt-3 inline-flex items-center text-xs font-semibold text-indigo-600 hover:text-indigo-800"
        >
          Reset all filters
        </button>
      </div>

      <!-- Table -->
      <div v-else class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200 text-left text-xs">
          <thead class="bg-gray-50/80 text-[11px] font-semibold text-gray-600 uppercase tracking-wider">
            <tr>
              <th scope="col" class="py-3.5 pl-6 pr-3">Location / Address</th>
              <th scope="col" class="px-3 py-3.5">City & State</th>
              <th scope="col" class="px-3 py-3.5">Postal Code</th>
              <th scope="col" class="px-3 py-3.5 text-center">Service Points</th>
              <th scope="col" class="px-3 py-3.5 text-center">Meters</th>
              <th scope="col" class="px-3 py-3.5">Created</th>
              <th scope="col" class="relative py-3.5 pl-3 pr-6 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 bg-white">
            <tr
              v-for="loc in filteredLocations"
              :key="loc.id"
              :class="[
                'transition hover:bg-indigo-50/30',
                newlyCreatedId === loc.id ? 'bg-emerald-50/60 ring-2 ring-emerald-500 ring-inset' : '',
              ]"
            >
              <!-- Location Address -->
              <td class="py-3.5 pl-6 pr-3">
                <div class="flex items-center gap-2.5">
                  <span class="inline-flex shrink-0 items-center rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-gray-700 tabular-nums">
                    #{{ loc.id }}
                  </span>
                  <div class="min-w-0">
                    <div class="truncate font-semibold text-gray-900">{{ loc.addressLine1 }}</div>
                    <div v-if="loc.addressLine2" class="text-[11px] text-gray-500">
                      {{ loc.addressLine2 }}
                    </div>
                  </div>
                </div>
              </td>

              <!-- City & State -->
              <td class="px-3 py-3.5 whitespace-nowrap">
                <span class="text-gray-900 font-medium">{{ loc.city }}</span>
                <span class="inline-flex items-center rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold font-mono text-gray-700 ml-1.5">
                  {{ loc.state }}
                </span>
              </td>

              <!-- Postal Code -->
              <td class="px-3 py-3.5 whitespace-nowrap font-mono text-gray-600 tabular-nums">
                {{ loc.postalCode }}
              </td>

              <!-- Service Points Count -->
              <td class="px-3 py-3.5 whitespace-nowrap text-center">
                <span class="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 tabular-nums">
                  {{ getPointsCount(loc.id) }} {{ getPointsCount(loc.id) === 1 ? 'Point' : 'Points' }}
                </span>
              </td>

              <!-- Meters Count -->
              <td class="px-3 py-3.5 whitespace-nowrap text-center">
                <span
                  :class="[
                    'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums',
                    getMetersCount(loc.id) > 0
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-gray-100 text-gray-500',
                  ]"
                >
                  {{ getMetersCount(loc.id) }} {{ getMetersCount(loc.id) === 1 ? 'Meter' : 'Meters' }}
                </span>
              </td>

              <!-- Created At -->
              <td class="px-3 py-3.5 whitespace-nowrap text-gray-500 tabular-nums">
                {{ formatDate(loc.createdAt) }}
              </td>

              <!-- Actions -->
              <td class="py-3.5 pl-3 pr-6 text-right whitespace-nowrap space-x-2">
                <button
                  type="button"
                  @click="navigateToDashboardNode(loc.id)"
                  class="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1 text-[11px] font-medium text-indigo-700 border border-indigo-200 shadow-2xs hover:bg-indigo-50 transition"
                  title="Inspect in Dashboard topology"
                >
                  <svg class="h-3.5 w-3.5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  <span>Inspect</span>
                </button>

                <RouterLink
                  :to="`/meters?locationId=${loc.id}&new=1`"
                  class="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-700 border border-indigo-200 shadow-2xs hover:bg-indigo-100 transition"
                  title="Add meter at this location"
                >
                  + Meter
                </RouterLink>

                <RouterLink
                  :to="`/service-locations/${loc.id}`"
                  class="inline-flex items-center rounded-md bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700 border border-gray-300 shadow-2xs hover:bg-gray-50 transition"
                >
                  Detail
                </RouterLink>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
