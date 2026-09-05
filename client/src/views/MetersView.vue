<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useTopologyStore } from '../stores/topology.js';
import MeterForm from '../components/meters/MeterForm.vue';
import type { Meter, MeterType, MeterStatus, ServiceLocationTree, ServicePoint } from '../api/types.js';

const route = useRoute();
const router = useRouter();
const topologyStore = useTopologyStore();

const showAddForm = ref(route.query.new === '1' || route.query.action === 'new');
const preselectedLocationId = ref<number | null>(
  route.query.locationId ? Number(route.query.locationId) : null
);
const preselectedPointId = ref<number | null>(
  route.query.pointId ? Number(route.query.pointId) : null
);

const searchQuery = ref('');
const selectedTypeFilter = ref<string>('all');
const selectedStatusFilter = ref<string>('all');
const newlyCreatedId = ref<number | null>(null);
const successMessage = ref<string | null>(null);

onMounted(async () => {
  if (topologyStore.locations.length === 0) {
    await topologyStore.fetchAll();
  }
});

interface EnrichedMeter {
  meter: Meter;
  location?: ServiceLocationTree;
  point?: ServicePoint;
}

// Flatten all meters from all trees for unified display
const allMeters = computed<EnrichedMeter[]>(() => {
  const result: EnrichedMeter[] = [];
  for (const loc of Object.values(topologyStore.trees)) {
    if (!loc.servicePoints) continue;
    for (const sp of loc.servicePoints) {
      if (!sp.meters) continue;
      for (const m of sp.meters) {
        result.push({
          meter: m,
          location: loc,
          point: sp,
        });
      }
    }
  }
  return result.sort((a, b) => b.meter.id - a.meter.id);
});

// Summary Metrics
const totalCount = computed(() => allMeters.value.length);
const activeCount = computed(() => allMeters.value.filter((m) => m.meter.status === 'active').length);
const maintenanceCount = computed(
  () =>
    allMeters.value.filter(
      (m) => m.meter.status === 'maintenance' || m.meter.status === 'decommissioned'
    ).length
);
const electricCount = computed(() => allMeters.value.filter((m) => m.meter.type === 'electric').length);
const waterCount = computed(() => allMeters.value.filter((m) => m.meter.type === 'water').length);
const gasCount = computed(() => allMeters.value.filter((m) => m.meter.type === 'gas').length);

// Filtered List
const filteredMeters = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  const typeF = selectedTypeFilter.value;
  const statusF = selectedStatusFilter.value;

  return allMeters.value.filter(({ meter, location, point }) => {
    // Type Filter
    if (typeF !== 'all' && meter.type !== typeF) {
      return false;
    }

    // Status Filter
    if (statusF !== 'all' && meter.status !== statusF) {
      return false;
    }

    // Search Query Filter
    if (!q) return true;

    return (
      meter.serialNumber.toLowerCase().includes(q) ||
      meter.type.toLowerCase().includes(q) ||
      meter.status.toLowerCase().includes(q) ||
      (point && point.identifier.toLowerCase().includes(q)) ||
      (location && location.addressLine1.toLowerCase().includes(q)) ||
      (location && location.city.toLowerCase().includes(q)) ||
      String(meter.id) === q
    );
  });
});

function getMeterColorClass(type: MeterType): string {
  switch (type) {
    case 'electric':
      return 'bg-amber-50 text-amber-700 ring-amber-600/20';
    case 'water':
      return 'bg-blue-50 text-blue-700 ring-blue-600/20';
    case 'gas':
      return 'bg-orange-50 text-orange-700 ring-orange-600/20';
    default:
      return 'bg-gray-50 text-gray-700 ring-gray-600/20';
  }
}

function getStatusBadgeClass(status: MeterStatus): string {
  switch (status) {
    case 'active':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-600/20';
    case 'inactive':
      return 'bg-gray-50 text-gray-700 ring-gray-600/20';
    case 'maintenance':
      return 'bg-amber-50 text-amber-700 ring-amber-600/20';
    case 'decommissioned':
      return 'bg-red-50 text-red-700 ring-red-600/20';
    default:
      return 'bg-gray-50 text-gray-700 ring-gray-600/20';
  }
}

function navigateToDashboardMeter(item: EnrichedMeter) {
  if (item.location && item.point) {
    topologyStore.selectMeter(item.meter, item.point, item.location);
    router.push('/');
  }
}

function handleMeterCreated(newMeter: Meter) {
  showAddForm.value = false;
  newlyCreatedId.value = newMeter.id;
  successMessage.value = `Meter ${newMeter.serialNumber} (${newMeter.type}) successfully registered!`;

  setTimeout(() => {
    if (newlyCreatedId.value === newMeter.id) {
      newlyCreatedId.value = null;
    }
  }, 5000);
}

function clearFilters() {
  searchQuery.value = '';
  selectedTypeFilter.value = 'all';
  selectedStatusFilter.value = 'all';
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header with Action -->
    <header class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
          Meters & Telemetry
        </h1>
        <p class="text-xs sm:text-sm text-gray-500 mt-1">
          Catalog and status of all electric, water, and gas meters across service locations.
        </p>
      </div>

      <div class="flex items-center gap-2.5">
        <button
          type="button"
          @click="topologyStore.fetchAll()"
          :disabled="topologyStore.loading"
          class="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 shadow-xs hover:bg-gray-50 focus:outline-hidden transition disabled:opacity-50"
          title="Refresh meters"
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
          <span>{{ showAddForm ? 'Close Form' : 'Add Meter' }}</span>
        </button>
      </div>
    </header>

    <!-- Success Toast Banner -->
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

    <!-- Inline Add Meter Form Card -->
    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="opacity-0 -translate-y-4 scale-98"
      enter-to-class="opacity-100 translate-y-0 scale-100"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="opacity-100 translate-y-0 scale-100"
      leave-to-class="opacity-0 -translate-y-4 scale-98"
    >
      <div v-if="showAddForm" class="mb-6">
        <MeterForm
          compact
          :initial-location-id="preselectedLocationId"
          :initial-service-point-id="preselectedPointId"
          title="Add New Meter"
          subtitle="Select location, choose or create a service point, and set meter specifications with inline validation."
          @success="handleMeterCreated"
          @cancel="showAddForm = false"
        />
      </div>
    </Transition>

    <!-- Summary Stats Metrics -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
        <div class="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Total Meters</div>
        <div class="text-2xl font-bold text-gray-900 mt-1 tabular-nums">
          {{ totalCount }}
        </div>
        <div class="text-[10px] text-gray-400 mt-0.5">All utilities</div>
      </div>

      <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
        <div class="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Active Units</div>
        <div class="text-2xl font-bold text-emerald-600 mt-1 tabular-nums">
          {{ activeCount }}
        </div>
        <div class="text-[10px] text-gray-400 mt-0.5">Normal telemetry reporting</div>
      </div>

      <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
        <div class="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Flagged / Maint.</div>
        <div class="text-2xl font-bold text-amber-600 mt-1 tabular-nums">
          {{ maintenanceCount }}
        </div>
        <div class="text-[10px] text-gray-400 mt-0.5">Needs review or repair</div>
      </div>

      <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
        <div class="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Utility Breakdown</div>
        <div class="flex items-center gap-2 mt-1 text-sm font-semibold text-gray-800 tabular-nums">
          <span title="Electric">⚡ {{ electricCount }}</span>
          <span class="text-gray-300">&bull;</span>
          <span title="Water">💧 {{ waterCount }}</span>
          <span class="text-gray-300">&bull;</span>
          <span title="Gas">🔥 {{ gasCount }}</span>
        </div>
        <div class="text-[10px] text-gray-400 mt-0.5">Electric / Water / Gas</div>
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
            placeholder="Search serial number, type, address, or unit..."
            class="block w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-xs placeholder-gray-400 focus:border-indigo-600 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 transition"
          />
        </div>

        <!-- Filter Dropdowns -->
        <div class="flex items-center gap-2.5 w-full sm:w-auto justify-end flex-wrap">
          <!-- Type Filter -->
          <div class="flex items-center gap-1.5">
            <label for="type-filter" class="text-xs text-gray-500 whitespace-nowrap">Type:</label>
            <select
              id="type-filter"
              v-model="selectedTypeFilter"
              class="rounded-lg border border-gray-300 bg-white py-1.5 pl-2.5 pr-8 text-xs text-gray-700 focus:border-indigo-600 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="all">All Types</option>
              <option value="electric">⚡ Electric</option>
              <option value="water">💧 Water</option>
              <option value="gas">🔥 Gas</option>
            </select>
          </div>

          <!-- Status Filter -->
          <div class="flex items-center gap-1.5">
            <label for="status-filter" class="text-xs text-gray-500 whitespace-nowrap">Status:</label>
            <select
              id="status-filter"
              v-model="selectedStatusFilter"
              class="rounded-lg border border-gray-300 bg-white py-1.5 pl-2.5 pr-8 text-xs text-gray-700 focus:border-indigo-600 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="maintenance">Maintenance</option>
              <option value="decommissioned">Decommissioned</option>
            </select>
          </div>

          <button
            v-if="searchQuery || selectedTypeFilter !== 'all' || selectedStatusFilter !== 'all'"
            type="button"
            @click="clearFilters"
            class="text-xs text-indigo-600 hover:text-indigo-800 font-medium px-2 py-1.5 rounded hover:bg-indigo-50 transition"
          >
            Clear Filters
          </button>
        </div>
      </div>
    </div>

    <!-- Meters Table Card -->
    <div class="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
      <!-- Loading State -->
      <div v-if="topologyStore.loading && allMeters.length === 0" class="p-8 space-y-3">
        <div v-for="i in 5" :key="i" class="h-10 bg-gray-100 rounded-lg animate-pulse"></div>
      </div>

      <!-- Empty State (No meters in database) -->
      <div
        v-else-if="allMeters.length === 0"
        class="p-12 text-center"
      >
        <div class="mx-auto w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 mb-3">
          <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <h3 class="text-sm font-semibold text-gray-900">No Meters Registered</h3>
        <p class="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
          Start recording consumption telemetry by adding your first meter.
        </p>
        <button
          type="button"
          @click="showAddForm = true"
          class="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-500 transition"
        >
          + Add First Meter
        </button>
      </div>

      <!-- No Filter Results State -->
      <div
        v-else-if="filteredMeters.length === 0"
        class="p-12 text-center"
      >
        <p class="text-sm font-medium text-gray-700">No meters match your active filters.</p>
        <p class="text-xs text-gray-400 mt-1">Try broadening your search query, type, or status.</p>
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
              <th scope="col" class="py-3.5 pl-6 pr-3">Meter Serial & Type</th>
              <th scope="col" class="px-3 py-3.5">Service Location</th>
              <th scope="col" class="px-3 py-3.5">Service Point</th>
              <th scope="col" class="px-3 py-3.5 text-center">Status</th>
              <th scope="col" class="px-3 py-3.5">Installed</th>
              <th scope="col" class="relative py-3.5 pl-3 pr-6 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 bg-white">
            <tr
              v-for="item in filteredMeters"
              :key="item.meter.id"
              :class="[
                'transition hover:bg-indigo-50/30',
                newlyCreatedId === item.meter.id ? 'bg-emerald-50/60 ring-2 ring-emerald-500 ring-inset' : '',
              ]"
            >
              <!-- Serial & Type -->
              <td class="py-3.5 pl-6 pr-3">
                <div class="flex items-center gap-2.5">
                  <span
                    :class="[
                      'inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset capitalize',
                      getMeterColorClass(item.meter.type),
                    ]"
                  >
                    <span v-if="item.meter.type === 'electric'">⚡</span>
                    <span v-else-if="item.meter.type === 'water'">💧</span>
                    <span v-else-if="item.meter.type === 'gas'">🔥</span>
                    {{ item.meter.type }}
                  </span>
                  <div>
                    <span class="font-mono font-bold text-gray-900">{{ item.meter.serialNumber }}</span>
                    <span class="text-[10px] text-gray-400 block tabular-nums">ID #{{ item.meter.id }}</span>
                  </div>
                </div>
              </td>

              <!-- Service Location -->
              <td class="px-3 py-3.5">
                <div v-if="item.location" class="max-w-xs truncate">
                  <div class="font-semibold text-gray-900 truncate">{{ item.location.addressLine1 }}</div>
                  <div class="text-[11px] text-gray-500">{{ item.location.city }}, {{ item.location.state }}</div>
                </div>
                <span v-else class="text-gray-400 italic">Location #{{ item.meter.serviceLocationId }}</span>
              </td>

              <!-- Service Point -->
              <td class="px-3 py-3.5 whitespace-nowrap">
                <div v-if="item.point">
                  <span class="font-medium text-gray-900">{{ item.point.identifier }}</span>
                  <span v-if="item.point.notes" :title="item.point.notes" class="text-[11px] text-gray-500 block truncate max-w-xs">{{ item.point.notes }}</span>
                </div>
                <span v-else class="text-gray-400 italic">Point #{{ item.meter.servicePointId }}</span>
              </td>

              <!-- Status Badge -->
              <td class="px-3 py-3.5 whitespace-nowrap text-center">
                <span
                  :class="[
                    'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset capitalize',
                    getStatusBadgeClass(item.meter.status),
                  ]"
                >
                  {{ item.meter.status }}
                </span>
              </td>

              <!-- Installed Date -->
              <td class="px-3 py-3.5 whitespace-nowrap text-gray-500 font-mono text-[11px] tabular-nums">
                {{ item.meter.installedOn || 'N/A' }}
              </td>

              <!-- Actions -->
              <td class="py-3.5 pl-3 pr-6 text-right whitespace-nowrap space-x-2">
                <button
                  type="button"
                  @click="navigateToDashboardMeter(item)"
                  class="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1 text-[11px] font-medium text-indigo-700 border border-indigo-200 shadow-2xs hover:bg-indigo-50 transition"
                  title="Inspect telemetry in dashboard"
                >
                  <svg class="h-3.5 w-3.5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  <span>Inspect</span>
                </button>

                <RouterLink
                  :to="`/meters/${item.meter.id}`"
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
