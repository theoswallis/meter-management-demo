<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useTopologyStore } from '../stores/topology.js';
import { getMeterById } from '../api/meters.js';
import { getMeterReadings, getMeterUsage } from '../api/meterReadings.js';
import { getServiceLocationById } from '../api/serviceLocations.js';
import { getServicePointById } from '../api/servicePoints.js';
import AddReadingForm from '../components/meters/AddReadingForm.vue';
import MeterUsageAnalysisGraph from '../components/meters/MeterUsageAnalysisGraph.vue';
import type {
  Meter,
  MeterReading,
  MeterUsageRecord,
  MeterType,
  MeterStatus,
  ServiceLocation,
  ServicePoint,
} from '../api/types.js';

const route = useRoute();
const router = useRouter();
const topologyStore = useTopologyStore();

const meterId = computed(() => Number(route.params.id));

// State
const meter = ref<Meter | null>(null);
const location = ref<ServiceLocation | null>(null);
const point = ref<ServicePoint | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

// Readings Pagination State
const readings = ref<MeterReading[]>([]);
const totalReadings = ref(0);
const pageSize = ref(25);
const currentPage = ref(1);
const readingsLoading = ref(false);

// Usage Records for Graph & Anomaly Correlation
const usageRecords = ref<MeterUsageRecord[]>([]);
const showAddReadingForm = ref(false);
const newlyCreatedReadingId = ref<number | null>(null);
const successMessage = ref<string | null>(null);
const filterAnomaliesOnly = ref(false);

const unit = computed(() => {
  if (!meter.value) return 'units';
  switch (meter.value.type) {
    case 'electric':
      return 'kWh';
    case 'water':
      return 'gal';
    case 'gas':
      return 'therms';
    default:
      return 'units';
  }
});

// Load meter metadata, usage, and initial readings
async function loadMeterData() {
  if (isNaN(meterId.value)) {
    error.value = 'Invalid meter ID';
    loading.value = false;
    return;
  }

  loading.value = true;
  error.value = null;

  try {
    const res = await getMeterById(meterId.value);
    if (!res.ok || !res.data) {
      error.value = `Meter #${meterId.value} not found`;
      loading.value = false;
      return;
    }

    meter.value = res.data;

    // Concurrently fetch parent location & service point if present
    const fetchLocationPromise = meter.value.serviceLocationId
      ? getServiceLocationById(meter.value.serviceLocationId)
          .then((r) => (r.ok ? (location.value = r.data) : null))
          .catch(() => null)
      : Promise.resolve();

    const fetchPointPromise = meter.value.servicePointId
      ? getServicePointById(meter.value.servicePointId)
          .then((r) => (r.ok ? (point.value = r.data) : null))
          .catch(() => null)
      : Promise.resolve();

    // Fetch usage records for graph analysis (up to 100 recent)
    const fetchUsagePromise = getMeterUsage(meterId.value, { limit: 100 })
      .then((r) => {
        if (r.ok && r.data?.data) {
          usageRecords.value = r.data.data;
        }
      })
      .catch(() => null);

    await Promise.all([fetchLocationPromise, fetchPointPromise, fetchUsagePromise]);

    // Fetch first page of readings
    await fetchReadingsPage(1);
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'An error occurred loading meter';
  } finally {
    loading.value = false;
  }
}

// Fetch specific page of readings
async function fetchReadingsPage(page: number) {
  readingsLoading.value = true;
  currentPage.value = page;

  try {
    const offset = (page - 1) * pageSize.value;
    const res = await getMeterReadings(meterId.value, {
      limit: pageSize.value,
      offset,
    });

    if (res.ok && res.data) {
      readings.value = res.data.data || [];
      totalReadings.value = res.data.total || 0;
    }
  } catch (err: unknown) {
    console.error('Failed to fetch readings page:', err);
  } finally {
    readingsLoading.value = false;
  }
}

watch(pageSize, () => {
  fetchReadingsPage(1);
});

watch(meterId, () => {
  loadMeterData();
});

onMounted(() => {
  loadMeterData();
});

// Map usage records by reading ID for instant lookup of interval deltas and time
const usageByReadingId = computed(() => {
  const map = new Map<number, MeterUsageRecord>();
  for (const u of usageRecords.value) {
    map.set(Number(u.id), u);
  }
  return map;
});

// Anomaly classification for a given reading
export interface ReadingAnomaly {
  type: 'spike' | 'flatline' | 'rollover' | 'gap';
  label: string;
  badgeClass: string;
  description: string;
}

// Compute baseline average rate from all positive usage records
const baselineAvgRate = computed(() => {
  const positiveRates: number[] = [];
  for (const u of usageRecords.value) {
    if (u.previousReadingValue === null) continue;
    const usageVal = Number(u.usage ?? 0);
    if (usageVal <= 0) continue;

    let days = 1;
    if (u.previousReadAt) {
      const diffMs = new Date(u.readAt).getTime() - new Date(u.previousReadAt).getTime();
      if (!isNaN(diffMs) && diffMs > 0) {
        days = Math.max(0.01, diffMs / (1000 * 60 * 60 * 24));
      }
    }
    positiveRates.push(usageVal / days);
  }

  return positiveRates.length > 0
    ? positiveRates.reduce((a, b) => a + b, 0) / positiveRates.length
    : 0;
});

const baselineMedianRate = computed(() => {
  const positiveRates: number[] = [];
  for (const u of usageRecords.value) {
    if (u.previousReadingValue === null) continue;
    const usageVal = Number(u.usage ?? 0);
    if (usageVal <= 0) continue;

    let days = 1;
    if (u.previousReadAt) {
      const diffMs = new Date(u.readAt).getTime() - new Date(u.previousReadAt).getTime();
      if (!isNaN(diffMs) && diffMs > 0) {
        days = Math.max(0.01, diffMs / (1000 * 60 * 60 * 24));
      }
    }
    positiveRates.push(usageVal / days);
  }

  if (positiveRates.length === 0) return 0;
  positiveRates.sort((a, b) => a - b);
  const mid = Math.floor(positiveRates.length / 2);
  return positiveRates.length % 2 !== 0
    ? positiveRates[mid]!
    : (positiveRates[mid - 1]! + positiveRates[mid]!) / 2;
});

function getAnomalyForReading(
  reading: MeterReading,
  usageRec?: MeterUsageRecord
): ReadingAnomaly | null {
  if (!usageRec || usageRec.previousReadingValue === null) {
    return null;
  }

  const usageVal = Number(usageRec.usage ?? 0);
  let daysDiff = 1;
  if (usageRec.previousReadAt) {
    const diffMs = new Date(reading.readAt).getTime() - new Date(usageRec.previousReadAt).getTime();
    if (!isNaN(diffMs) && diffMs > 0) {
      daysDiff = Math.max(0.01, diffMs / (1000 * 60 * 60 * 24));
    }
  }
  const ratePerDay = usageVal / daysDiff;

  // 1. Negative usage -> Rollover
  if (usageVal < 0) {
    return {
      type: 'rollover',
      label: 'Rollover / Reset',
      badgeClass: 'bg-red-50 text-red-700 ring-red-600/20',
      description: `Reading dropped by ${Math.abs(usageVal).toFixed(1)} ${unit.value}`,
    };
  }

  // 2. Flatline / Zero usage
  if (usageVal === 0 && daysDiff >= 0.5) {
    return {
      type: 'flatline',
      label: 'Stalled (0.0)',
      badgeClass: 'bg-amber-50 text-amber-700 ring-amber-600/20',
      description: 'Zero consumption recorded over interval',
    };
  }

  // 3. Spike
  const refRate = baselineMedianRate.value > 0 ? baselineMedianRate.value : baselineAvgRate.value;
  if (
    refRate > 0 &&
    ratePerDay > refRate * 2.2 &&
    usageRecords.value.length >= 2
  ) {
    const pct = Math.round(((ratePerDay - refRate) / refRate) * 100);
    return {
      type: 'spike',
      label: `Spike (+${pct}%)`,
      badgeClass: 'bg-rose-50 text-rose-700 ring-rose-600/20',
      description: `Rate of ${ratePerDay.toFixed(1)} ${unit.value}/day is ${pct}% above baseline (${refRate.toFixed(1)})`,
    };
  }

  // 4. Extended Gap
  if (daysDiff > 3) {
    const d = Math.round(daysDiff);
    return {
      type: 'gap',
      label: `Outage Gap (${d}d)`,
      badgeClass: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
      description: `No checkpoints reported for ${d} days`,
    };
  }

  return null;
}

// Enriched Readings for Table
interface EnrichedReadingRow {
  reading: MeterReading;
  usageRec?: MeterUsageRecord;
  delta: number | null;
  daysDiff: number | null;
  ratePerDay: number | null;
  ratePerHour: number | null;
  durationLabel: string;
  anomaly: ReadingAnomaly | null;
}

const enrichedReadings = computed<EnrichedReadingRow[]>(() => {
  return readings.value.map((r) => {
    const u = usageByReadingId.value.get(r.id);
    let delta: number | null = null;
    let daysDiff: number | null = null;
    let ratePerDay: number | null = null;
    let ratePerHour: number | null = null;
    let durationLabel = '—';

    if (u && u.previousReadingValue !== null) {
      delta = Number(u.usage ?? 0);
      if (u.previousReadAt) {
        const diffMs = new Date(r.readAt).getTime() - new Date(u.previousReadAt).getTime();
        if (!isNaN(diffMs) && diffMs > 0) {
          daysDiff = diffMs / (1000 * 60 * 60 * 24);
          if (daysDiff < 1) {
            durationLabel = `${Math.max(1, Math.round(daysDiff * 24))}h`;
          } else {
            const d = Math.floor(daysDiff);
            const h = Math.round((daysDiff - d) * 24);
            durationLabel = h > 0 ? `${d}d ${h}h` : `${d}d`;
          }
        }
      }
      if (daysDiff && daysDiff > 0) {
        ratePerDay = delta / daysDiff;
        ratePerHour = ratePerDay / 24;
      }
    }

    const anomaly = getAnomalyForReading(r, u);

    return {
      reading: r,
      usageRec: u,
      delta,
      daysDiff,
      ratePerDay,
      ratePerHour,
      durationLabel,
      anomaly,
    };
  });
});

const displayedReadings = computed(() => {
  if (!filterAnomaliesOnly.value) {
    return enrichedReadings.value;
  }
  return enrichedReadings.value.filter((row) => !!row.anomaly);
});

// Pagination Helpers
const totalPages = computed(() => Math.max(1, Math.ceil(totalReadings.value / pageSize.value)));

const latestReading = computed(() => (readings.value.length > 0 ? readings.value[0] : null));

// Overview Metrics
const lifetimeConsumption = computed(() => {
  if (usageRecords.value.length === 0) return null;
  const positiveUsage = usageRecords.value
    .filter((u) => u.usage !== null && Number(u.usage) > 0)
    .reduce((sum, u) => sum + Number(u.usage), 0);
  return positiveUsage;
});

const totalAnomaliesCount = computed(() => {
  let count = 0;
  for (const u of usageRecords.value) {
    if (u.previousReadingValue === null) continue;
    const dummyReading: MeterReading = {
      id: u.id,
      meterId: u.meterId,
      readAt: u.readAt,
      readingValue: u.readingValue,
      createdAt: u.readAt,
    };
    if (getAnomalyForReading(dummyReading, u)) {
      count++;
    }
  }
  return count;
});

// Handle Reading Recorded
async function handleReadingRecorded(newReading: MeterReading) {
  showAddReadingForm.value = false;
  newlyCreatedReadingId.value = newReading.id;
  successMessage.value = `Successfully recorded reading of ${Number(newReading.readingValue).toLocaleString()} ${unit.value} at ${formatDateTime(newReading.readAt)}!`;

  // Refresh usage and readings
  const usageRes = await getMeterUsage(meterId.value, { limit: 100 });
  if (usageRes.ok && usageRes.data?.data) {
    usageRecords.value = usageRes.data.data;
  }

  await fetchReadingsPage(1);
  await topologyStore.fetchAll();

  setTimeout(() => {
    if (newlyCreatedReadingId.value === newReading.id) {
      newlyCreatedReadingId.value = null;
    }
  }, 6000);
}

function navigateToDashboard() {
  if (meter.value && point.value && location.value) {
    const locTree = topologyStore.trees[location.value.id];
    topologyStore.selectMeter(meter.value, point.value, locTree || (location.value as any));
    router.push('/');
  }
}

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

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatRelativeTime(iso: string): string {
  try {
    const diffMs = Date.now() - new Date(iso).getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 30) return `${diffDays}d ago`;
    return `${Math.floor(diffDays / 30)}mo ago`;
  } catch {
    return '';
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Breadcrumb & Header -->
    <div>
      <div class="flex items-center gap-2 text-xs font-semibold text-gray-500 mb-2">
        <RouterLink to="/meters" class="text-indigo-600 hover:text-indigo-500 flex items-center gap-1">
          <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Meters
        </RouterLink>
        <span>/</span>
        <span class="text-gray-900 font-mono">Meter #{{ meterId }}</span>
      </div>

      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <!-- Type and Status Badges -->
          <div v-if="meter" class="flex items-center gap-2 mb-2 flex-wrap">
            <span
              :class="[
                'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset capitalize',
                getMeterColorClass(meter.type),
              ]"
            >
              <span v-if="meter.type === 'electric'">⚡</span>
              <span v-else-if="meter.type === 'water'">💧</span>
              <span v-else-if="meter.type === 'gas'">🔥</span>
              {{ meter.type.charAt(0).toUpperCase() + meter.type.slice(1) }} Meter
            </span>

            <span
              :class="[
                'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset capitalize',
                getStatusBadgeClass(meter.status),
              ]"
            >
              {{ meter.status }}
            </span>
          </div>

          <!-- Main Header: Location & Service Point -->
          <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
            <span v-if="location">{{ location.addressLine1 }}</span>
            <span v-else>Service Location #{{ meter?.serviceLocationId }}</span>
            <span v-if="point" class="text-gray-500 font-normal text-lg sm:text-xl">
              &bull; {{ point.identifier }}
            </span>
          </h1>

          <!-- Subheader: Meter Serial Number -->
          <p class="text-xs text-gray-500 mt-1">
            Serial Number:
            <span class="font-mono font-bold text-gray-800">{{ meter?.serialNumber || 'Loading...' }}</span>
            <span v-if="location" class="ml-2 text-gray-400">
              ({{ location.city }}, {{ location.state }} {{ location.postalCode }})
            </span>
          </p>
        </div>

        <!-- Action Buttons -->
        <div class="flex items-center gap-2.5 flex-wrap">
          <button
            v-if="meter && point && location"
            type="button"
            @click="navigateToDashboard"
            class="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-xs hover:bg-gray-50 transition"
            title="Inspect in Dashboard topology"
          >
            <svg class="h-4 w-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <span>Inspect in Dashboard</span>
          </button>

          <button
            type="button"
            @click="loadMeterData"
            :disabled="loading"
            class="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-xs hover:bg-gray-50 transition disabled:opacity-50"
            title="Refresh meter telemetry"
          >
            <svg
              :class="['h-4 w-4 text-gray-500', loading ? 'animate-spin' : '']"
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
            @click="showAddReadingForm = !showAddReadingForm"
            class="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-500 focus:outline-hidden focus:ring-2 focus:ring-indigo-600/30 transition"
          >
            <svg
              v-if="!showAddReadingForm"
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
            <span>{{ showAddReadingForm ? 'Close Form' : 'Record Reading' }}</span>
          </button>
        </div>
      </div>
    </div>

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

    <!-- Inline Add Reading Form Card -->
    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="opacity-0 -translate-y-4 scale-98"
      enter-to-class="opacity-100 translate-y-0 scale-100"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="opacity-100 translate-y-0 scale-100"
      leave-to-class="opacity-0 -translate-y-4 scale-98"
    >
      <div v-if="showAddReadingForm" class="mb-6">
        <AddReadingForm
          :meter-id="meterId"
          :unit="unit"
          :latest-reading-value="latestReading?.readingValue"
          :latest-read-at="latestReading?.readAt"
          @success="handleReadingRecorded"
          @cancel="showAddReadingForm = false"
        />
      </div>
    </Transition>

    <!-- Error State -->
    <div v-if="error" class="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-xs text-red-700">
      <p class="font-semibold text-sm mb-1">Failed to load meter</p>
      <p>{{ error }}</p>
      <RouterLink to="/meters" class="mt-4 inline-flex items-center text-xs font-semibold text-red-800 underline">
        Back to Meters Catalog
      </RouterLink>
    </div>

    <template v-else-if="meter">
      <!-- Metric Cards Strip -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <!-- Latest Reading -->
        <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
          <div class="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Latest Reading</div>
          <div class="text-xl sm:text-2xl font-bold font-mono text-gray-900 mt-1">
            <span v-if="latestReading">{{ Number(latestReading.readingValue).toLocaleString() }}</span>
            <span v-else class="text-gray-400">None</span>
            <span class="text-xs font-normal text-gray-500 ml-1">{{ unit }}</span>
          </div>
          <div v-if="latestReading" class="text-[10px] text-gray-400 mt-0.5 truncate">
            {{ formatDateTime(latestReading.readAt) }} ({{ formatRelativeTime(latestReading.readAt) }})
          </div>
          <div v-else class="text-[10px] text-gray-400 mt-0.5">No readings recorded</div>
        </div>

        <!-- Recorded Consumption -->
        <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
          <div class="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Total Consumption</div>
          <div class="text-xl sm:text-2xl font-bold font-mono text-indigo-600 mt-1">
            <span v-if="lifetimeConsumption !== null">{{ lifetimeConsumption.toLocaleString(undefined, { maximumFractionDigits: 1 }) }}</span>
            <span v-else class="text-gray-400">N/A</span>
            <span class="text-xs font-normal text-gray-500 ml-1">{{ unit }}</span>
          </div>
          <div class="text-[10px] text-gray-400 mt-0.5">Cumulative usage series</div>
        </div>

        <!-- Average Daily Velocity -->
        <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
          <div class="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Average Daily Rate</div>
          <div class="text-xl sm:text-2xl font-bold font-mono text-emerald-600 mt-1">
            <span v-if="baselineAvgRate > 0">{{ baselineAvgRate.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }}</span>
            <span v-else class="text-gray-400">N/A</span>
            <span class="text-xs font-normal text-gray-500 ml-1">{{ unit }}/day</span>
          </div>
          <div class="text-[10px] text-gray-400 mt-0.5">Baseline rate across intervals</div>
        </div>

        <!-- Anomalies Flagged -->
        <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
          <div class="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Anomalies Flagged</div>
          <div
            :class="[
              'text-xl sm:text-2xl font-bold mt-1',
              totalAnomaliesCount > 0 ? 'text-rose-600' : 'text-gray-900',
            ]"
          >
            {{ totalAnomaliesCount }}
          </div>
          <div class="text-[10px] text-gray-400 mt-0.5">
            {{ totalAnomaliesCount > 0 ? 'Spikes, stalls, or rollovers' : 'Zero abnormalities detected' }}
          </div>
        </div>
      </div>

      <!-- Usage Analysis Graph Component -->
      <MeterUsageAnalysisGraph
        :records="usageRecords"
        :unit="unit"
      />

      <!-- All Readings Table Card -->
      <div class="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
        <!-- Table Header & Controls -->
        <div class="p-4 sm:p-5 border-b border-gray-200 bg-gray-50/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 class="text-sm font-bold text-gray-900 tracking-tight flex items-center gap-2">
              <span>All Historical Telemetry Readings</span>
              <span class="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                {{ totalReadings }} Total
              </span>
            </h2>
            <p class="text-xs text-gray-500 mt-0.5">
              Cumulative meter checkpoints with computed interval deltas, reporting rates, and anomaly tags.
            </p>
          </div>

          <!-- Controls: Anomaly Filter & Page Size -->
          <div class="flex items-center gap-3 flex-wrap">
            <label class="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer select-none">
              <input
                v-model="filterAnomaliesOnly"
                type="checkbox"
                class="rounded text-indigo-600 focus:ring-indigo-500"
              />
              <span class="font-medium text-rose-700">⚠️ Show Anomalies Only</span>
            </label>

            <div class="flex items-center gap-1.5 text-xs text-gray-500">
              <span>Page Size:</span>
              <select
                v-model="pageSize"
                class="rounded-md border border-gray-300 bg-white py-1 pl-2 pr-6 text-xs text-gray-700 focus:border-indigo-600 focus:ring-indigo-500/20"
              >
                <option :value="10">10</option>
                <option :value="25">25</option>
                <option :value="50">50</option>
                <option :value="100">100</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Table Loading State -->
        <div v-if="readingsLoading" class="p-8 space-y-3">
          <div v-for="i in 5" :key="i" class="h-10 bg-gray-100 rounded-lg animate-pulse"></div>
        </div>

        <!-- Empty State -->
        <div v-else-if="readings.length === 0" class="p-12 text-center">
          <p class="text-sm font-medium text-gray-700">No readings recorded yet.</p>
          <p class="text-xs text-gray-400 mt-1">Add your first reading using the "Record Reading" button above.</p>
          <button
            type="button"
            @click="showAddReadingForm = true"
            class="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-500 transition"
          >
            + Add First Reading
          </button>
        </div>

        <!-- No Filter Results State -->
        <div v-else-if="displayedReadings.length === 0" class="p-10 text-center">
          <p class="text-sm font-medium text-gray-700">No anomalous readings on this page.</p>
          <button
            type="button"
            @click="filterAnomaliesOnly = false"
            class="mt-2 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
          >
            View all readings
          </button>
        </div>

        <!-- Readings Data Table -->
        <div v-else class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200 text-left text-xs">
            <thead class="bg-gray-50/80 text-[11px] font-semibold text-gray-600 uppercase tracking-wider">
              <tr>
                <th scope="col" class="py-3 pl-6 pr-3">Timestamp / Date</th>
                <th scope="col" class="px-3 py-3 text-right">Reading Value</th>
                <th scope="col" class="px-3 py-3 text-right">Interval Delta (&Delta;R)</th>
                <th scope="col" class="px-3 py-3 text-center">Duration (&Delta;t)</th>
                <th scope="col" class="px-3 py-3 text-right">Rate (&Delta;R/&Delta;t)</th>
                <th scope="col" class="px-3 py-3 text-center">Health / Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 bg-white">
              <tr
                v-for="row in displayedReadings"
                :key="row.reading.id"
                :class="[
                  'transition hover:bg-indigo-50/30',
                  newlyCreatedReadingId === row.reading.id
                    ? 'bg-emerald-50/80 ring-2 ring-emerald-500 ring-inset'
                    : row.anomaly
                      ? row.anomaly.type === 'spike'
                        ? 'bg-rose-50/30 border-l-4 border-l-rose-500'
                        : row.anomaly.type === 'flatline'
                          ? 'bg-amber-50/30 border-l-4 border-l-amber-500'
                          : row.anomaly.type === 'rollover'
                            ? 'bg-red-50/30 border-l-4 border-l-red-600'
                            : 'bg-indigo-50/20 border-l-4 border-l-indigo-400'
                      : '',
                ]"
              >
                <!-- Timestamp -->
                <td class="py-3.5 pl-6 pr-3 whitespace-nowrap">
                  <div class="flex items-center gap-2">
                    <span class="inline-flex items-center rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-mono text-gray-600">
                      #{{ row.reading.id }}
                    </span>
                    <div>
                      <div class="font-semibold text-gray-900 font-mono">
                        {{ formatDateTime(row.reading.readAt) }}
                      </div>
                      <div class="text-[10px] text-gray-400">
                        {{ formatRelativeTime(row.reading.readAt) }}
                      </div>
                    </div>
                  </div>
                </td>

                <!-- Reading Value -->
                <td class="px-3 py-3.5 whitespace-nowrap text-right font-mono font-bold text-gray-900 text-sm">
                  {{ Number(row.reading.readingValue).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 3 }) }}
                  <span class="text-[10px] font-normal text-gray-400 ml-0.5">{{ unit }}</span>
                </td>

                <!-- Delta -->
                <td class="px-3 py-3.5 whitespace-nowrap text-right font-mono">
                  <span
                    v-if="row.delta !== null"
                    :class="[
                      'font-semibold',
                      row.delta > 0
                        ? 'text-indigo-600'
                        : row.delta < 0
                          ? 'text-red-600'
                          : 'text-amber-600',
                    ]"
                  >
                    {{ row.delta > 0 ? '+' : '' }}{{ row.delta.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 3 }) }}
                    <span class="text-[10px] font-normal text-gray-400">{{ unit }}</span>
                  </span>
                  <span v-else class="text-gray-400 text-[11px] italic">Base (Initial)</span>
                </td>

                <!-- Duration -->
                <td class="px-3 py-3.5 whitespace-nowrap text-center text-gray-600 font-mono text-xs">
                  {{ row.durationLabel }}
                </td>

                <!-- Normalized Rate -->
                <td class="px-3 py-3.5 whitespace-nowrap text-right font-mono">
                  <div v-if="row.ratePerDay !== null">
                    <div
                      :class="[
                        'font-bold',
                        row.anomaly?.type === 'spike' ? 'text-rose-600' : 'text-gray-900',
                      ]"
                    >
                      {{ row.ratePerDay.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 }) }}
                      <span class="text-[10px] font-normal text-gray-500">{{ unit }}/day</span>
                    </div>
                    <div v-if="row.ratePerHour !== null" class="text-[10px] text-gray-400">
                      {{ row.ratePerHour.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 }) }} {{ unit }}/hr
                    </div>
                  </div>
                  <span v-else class="text-gray-400 text-[11px] italic">—</span>
                </td>

                <!-- Anomaly / Health Status -->
                <td class="px-3 py-3.5 whitespace-nowrap text-center">
                  <span
                    v-if="row.anomaly"
                    :class="[
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset',
                      row.anomaly.badgeClass,
                    ]"
                    :title="row.anomaly.description"
                  >
                    <span>⚠️</span>
                    {{ row.anomaly.label }}
                  </span>
                  <span
                    v-else-if="row.usageRec?.previousReadingValue === null"
                    class="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600"
                  >
                    Initial Read
                  </span>
                  <span
                    v-else
                    class="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700"
                  >
                    Normal
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination Controls Bar -->
        <div class="p-4 border-t border-gray-200 bg-gray-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-gray-600">
          <div>
            Showing <strong class="text-gray-900">{{ (currentPage - 1) * pageSize + 1 }}</strong> to
            <strong class="text-gray-900">{{ Math.min(currentPage * pageSize, totalReadings) }}</strong> of
            <strong class="text-gray-900">{{ totalReadings }}</strong> readings
          </div>

          <div class="flex items-center gap-1 self-center sm:self-auto">
            <!-- First Page -->
            <button
              type="button"
              :disabled="currentPage <= 1 || readingsLoading"
              @click="fetchReadingsPage(1)"
              class="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium hover:bg-gray-50 disabled:opacity-40"
              title="First Page"
            >
              &laquo;
            </button>

            <!-- Previous Page -->
            <button
              type="button"
              :disabled="currentPage <= 1 || readingsLoading"
              @click="fetchReadingsPage(currentPage - 1)"
              class="rounded border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-gray-50 disabled:opacity-40"
            >
              Previous
            </button>

            <!-- Current Page / Total -->
            <span class="px-2 font-mono font-medium">
              {{ currentPage }} / {{ totalPages }}
            </span>

            <!-- Next Page -->
            <button
              type="button"
              :disabled="currentPage >= totalPages || readingsLoading"
              @click="fetchReadingsPage(currentPage + 1)"
              class="rounded border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-gray-50 disabled:opacity-40"
            >
              Next
            </button>

            <!-- Last Page -->
            <button
              type="button"
              :disabled="currentPage >= totalPages || readingsLoading"
              @click="fetchReadingsPage(totalPages)"
              class="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium hover:bg-gray-50 disabled:opacity-40"
              title="Last Page"
            >
              &raquo;
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
