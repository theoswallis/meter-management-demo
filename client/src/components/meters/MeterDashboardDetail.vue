<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { RouterLink } from 'vue-router';
import { getMeterUsage } from '../../api/meterReadings.js';
import { getMeterReadings } from '../../api/meterReadings.js';
import type {
  Meter,
  MeterReading,
  MeterUsageRecord,
  ServiceLocationTree,
  ServicePoint,
} from '../../api/types.js';
import {
  formatDateTime,
  formatNumber,
  getUtilityUnit,
} from '../../utils/formatters.js';

const props = defineProps<{
  meter: Meter;
  location?: ServiceLocationTree;
  point?: ServicePoint;
}>();

const loading = ref(false);
const error = ref<string | null>(null);

const usageRecords = ref<MeterUsageRecord[]>([]);
const readings = ref<MeterReading[]>([]);
export interface NormalizedUsageItem {
  id: string | number;
  readAt: string;
  usage: number;
  deltaDays: number;
  deltaHours: number;
  ratePerDay: number;
  ratePerHour: number;
  timeElapsed: string;
  rawRecord: MeterUsageRecord;
}

const activeHoveredBar = ref<NormalizedUsageItem | null>(null);

const unit = computed(() => getUtilityUnit(props.meter.type));

// Anchor 30-day window to the latest read timestamp among usage records
const latestReadTimestamp = computed<number | null>(() => {
  if (usageRecords.value.length === 0) return null;
  let max = -Infinity;
  for (const r of usageRecords.value) {
    const t = new Date(r.readAt).getTime();
    if (!isNaN(t) && t > max) {
      max = t;
    }
  }
  return max > -Infinity ? max : null;
});

// Normalized usage records within 30 days of the latest read
const last30DaysUsage = computed<NormalizedUsageItem[]>(() => {
  if (latestReadTimestamp.value === null) return [];

  // Cutoff is 30 days before the latest read timestamp
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const cutoffTime = latestReadTimestamp.value - thirtyDaysMs;

  const results: NormalizedUsageItem[] = [];

  for (const record of usageRecords.value) {
    const readTime = new Date(record.readAt).getTime();
    if (isNaN(readTime)) continue;

    // Must be within 30 days of the latest read (and up to latest read)
    if (readTime >= cutoffTime && readTime <= latestReadTimestamp.value) {
      if (record.usage !== null && record.usage !== undefined) {
        const usageVal = parseFloat(record.usage);
        if (!isNaN(usageVal)) {
          let deltaMs = 0;
          if (record.previousReadAt) {
            const prevTime = new Date(record.previousReadAt).getTime();
            if (!isNaN(prevTime)) {
              deltaMs = readTime - prevTime;
            }
          }

          const deltaDays = deltaMs > 0 ? deltaMs / 86400000 : 1;
          const deltaHours = deltaMs > 0 ? deltaMs / 3600000 : 24;

          let timeElapsed = record.timeElapsed;
          if (!timeElapsed) {
            const roundedDays = Math.round(deltaDays);
            timeElapsed = roundedDays <= 1 ? '1 day' : `${roundedDays} days`;
          }

          results.push({
            id: record.id,
            readAt: record.readAt,
            usage: usageVal,
            deltaDays,
            deltaHours,
            ratePerDay: usageVal / Math.max(deltaDays, 0.001),
            ratePerHour: usageVal / Math.max(deltaHours, 0.01),
            timeElapsed,
            rawRecord: record,
          });
        }
      }
    }
  }

  return results;
});

// 30-Day metrics with peak interval chosen based on highest per-day rate
const metrics30Days = computed(() => {
  const list = last30DaysUsage.value;
  let sum = 0;
  let count = 0;
  let peakItem: NormalizedUsageItem | null = null;
  let maxRate = -Infinity;

  for (const item of list) {
    sum += item.usage;
    count++;
    if (item.ratePerDay > maxRate) {
      maxRate = item.ratePerDay;
      peakItem = item;
    }
  }

  return {
    total: sum,
    count,
    avg: count > 0 ? sum / count : 0,
    peakItem,
    maxDailyRate: count > 0 && maxRate > 0 ? maxRate : 0,
  };
});

// Chronological usage records for bar chart visualization (oldest to newest)
const chronologicalUsage = computed(() => {
  return [...last30DaysUsage.value].reverse();
});

// Maps of reading ID to usage record, and timestamp to usage record
const usageByReadingId = computed(() => {
  const map = new Map<number, MeterUsageRecord>();
  for (const u of usageRecords.value) {
    map.set(Number(u.id), u);
  }
  return map;
});

const usageByTimestamp = computed(() => {
  const map = new Map<number, MeterUsageRecord>();
  for (const u of usageRecords.value) {
    const time = new Date(u.readAt).getTime();
    if (!isNaN(time)) {
      map.set(time, u);
    }
  }
  return map;
});

interface ReadingRateInfo {
  ratePerDay: number;
  ratePerHour: number;
  deltaDays: number;
  deltaHours: number;
}

function getReadingRecord(r: MeterReading): MeterUsageRecord | undefined {
  const byId = usageByReadingId.value.get(r.id);
  if (byId) return byId;
  const time = new Date(r.readAt).getTime();
  return usageByTimestamp.value.get(time);
}

function getReadingDelta(r: MeterReading, index: number): number | null {
  const record = getReadingRecord(r);
  if (record && record.usage !== null && record.usage !== undefined) {
    const val = parseFloat(record.usage);
    if (!isNaN(val)) return val;
  }

  // Fallback to consecutive reading diff if available
  if (index + 1 < readings.value.length) {
    const next = readings.value[index + 1];
    if (next) {
      const currentVal = parseFloat(r.readingValue);
      const prevVal = parseFloat(next.readingValue);
      if (!isNaN(currentVal) && !isNaN(prevVal)) {
        return currentVal - prevVal;
      }
    }
  }

  return null;
}

function getReadingInterval(r: MeterReading, index: number): string | null {
  const record = getReadingRecord(r);
  if (record?.timeElapsed) {
    return record.timeElapsed;
  }

  if (index + 1 < readings.value.length) {
    const next = readings.value[index + 1];
    if (next) {
      const diffMs = new Date(r.readAt).getTime() - new Date(next.readAt).getTime();
      if (diffMs > 0) {
        const hours = diffMs / 3600000;
        if (hours >= 24) {
          const days = Math.round(hours / 24);
          return `${days} ${days === 1 ? 'day' : 'days'}`;
        }
        return `${Math.round(hours)} hrs`;
      }
    }
  }

  return null;
}

function getReadingRate(r: MeterReading, index: number): ReadingRateInfo | null {
  const delta = getReadingDelta(r, index);
  if (delta === null) return null;

  const record = getReadingRecord(r);
  let deltaMs = 0;

  if (record?.previousReadAt) {
    const currentMs = new Date(record.readAt).getTime();
    const prevMs = new Date(record.previousReadAt).getTime();
    if (!isNaN(currentMs) && !isNaN(prevMs)) {
      deltaMs = currentMs - prevMs;
    }
  }

  if (deltaMs <= 0 && index + 1 < readings.value.length) {
    const next = readings.value[index + 1];
    if (next) {
      const currentMs = new Date(r.readAt).getTime();
      const prevMs = new Date(next.readAt).getTime();
      if (!isNaN(currentMs) && !isNaN(prevMs)) {
        deltaMs = currentMs - prevMs;
      }
    }
  }

  if (deltaMs <= 0) return null;

  const deltaHours = deltaMs / 3600000;
  const deltaDays = deltaMs / 86400000;

  return {
    ratePerDay: delta / deltaDays,
    ratePerHour: delta / deltaHours,
    deltaDays,
    deltaHours,
  };
}

function getMeterColorClass(type: string): string {
  switch (type) {
    case 'electric':
      return 'bg-amber-50 text-amber-700 ring-amber-600/20';
    case 'water':
      return 'bg-sky-50 text-sky-700 ring-sky-600/20';
    case 'gas':
      return 'bg-orange-50 text-orange-700 ring-orange-600/20';
    default:
      return 'bg-gray-50 text-gray-700 ring-gray-600/20';
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
    default:
      return 'bg-blue-50 text-blue-700 ring-blue-600/20';
  }
}

async function fetchMeterData(meterId: number) {
  loading.value = true;
  error.value = null;

  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [usageRes, readingsRes] = await Promise.all([
      getMeterUsage(meterId, { limit: 100 }),
      getMeterReadings(meterId, { limit: 50 }),
    ]);

    if (usageRes.ok) {
      usageRecords.value = usageRes.data.data;
    }
    if (readingsRes.ok) {
      readings.value = readingsRes.data.data;
    }
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Failed to load meter data';
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.meter.id,
  (newId) => {
    if (newId) {
      fetchMeterData(newId);
    }
  },
  { immediate: true }
);
</script>

<template>
  <div class="grid grid-cols-1 min-[1400px]:grid-cols-12 gap-6 items-start">
    <!-- Left Column: Meter Header Card, 30-Day Usage Highlights & Trend Histogram (7 cols) -->
    <div class="min-[1400px]:col-span-7 space-y-6">
      <div class="bg-white rounded-xl border border-gray-200 p-6 shadow-xs">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <!-- Badges & Breadcrumb -->
          <div class="flex items-center gap-2 mb-2 flex-wrap">
            <span
              :class="[
                'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset capitalize',
                getMeterColorClass(meter.type),
              ]"
            >
              <span v-if="meter.type === 'electric'">⚡</span>
              <span v-else-if="meter.type === 'water'">💧</span>
              <span v-else-if="meter.type === 'gas'">🔥</span>
              {{ meter.type }} Meter
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

          <!-- Location / Service Point (Main Header) -->
          <h3 class="text-xl font-bold text-gray-900 tracking-tight">
            <span v-if="location">{{ location.addressLine1 }}</span>
            <span v-else>Service Location #{{ meter.serviceLocationId }}</span>
            <span v-if="point" class="text-gray-500 font-normal text-base"> &bull; {{ point.identifier }}</span>
          </h3>

          <!-- Meter Identifier (Subheader) -->
          <p class="text-xs text-gray-500 mt-1">
            Meter Identifier: <span class="font-mono font-semibold text-gray-700">{{ meter.serialNumber }}</span>
          </p>
        </div>

        <RouterLink
          :to="`/meters/${meter.id}`"
          class="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-500 transition shrink-0"
        >
          <span>All Readings</span>
          <svg class="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clip-rule="evenodd" />
          </svg>
        </RouterLink>
      </div>

      <!-- 30-Day Usage Highlights -->
      <div class="mt-6 pt-6 border-t border-gray-100 grid grid-cols-2 min-[2000px]:grid-cols-4 gap-3">
        <div class="rounded-lg bg-indigo-50/70 p-3.5 border border-indigo-100">
          <div class="text-[11px] font-semibold text-indigo-700 uppercase tracking-wide">30-Day Usage</div>
          <div class="text-2xl font-bold text-indigo-950 mt-1 tabular-nums">
            {{ formatNumber(metrics30Days.total, 2) }}
            <span class="text-xs font-medium text-indigo-600 ml-0.5">{{ unit }}</span>
          </div>
          <div class="text-[10px] text-indigo-600/80 mt-0.5 tabular-nums">{{ metrics30Days.count }} intervals recorded</div>
        </div>

        <div class="rounded-lg bg-gray-50 p-3.5 border border-gray-200">
          <div class="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Interval Average</div>
          <div class="text-xl font-semibold text-gray-900 mt-1 tabular-nums">
            {{ formatNumber(metrics30Days.avg, 2) }}
            <span class="text-xs font-medium text-gray-500">{{ unit }}</span>
          </div>
          <div class="text-[10px] text-gray-400 mt-0.5">Mean per check-in</div>
        </div>

        <div class="rounded-lg bg-gray-50 p-3.5 border border-gray-200">
          <div class="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Peak Interval</div>
          <div v-if="metrics30Days.peakItem" class="text-lg font-bold text-gray-900 mt-1 leading-snug tabular-nums">
            {{ formatNumber(metrics30Days.peakItem.usage, 1) }} {{ unit }} over {{ metrics30Days.peakItem.timeElapsed }}
          </div>
          <div v-else class="text-xl font-semibold text-gray-900 mt-1">
            N/A
          </div>
          <div v-if="metrics30Days.peakItem" class="text-[10px] text-gray-400 mt-0.5 tabular-nums">
            Rate: {{ formatNumber(metrics30Days.peakItem.ratePerDay, 2) }} {{ unit }}/day
          </div>
          <div v-else class="text-[10px] text-gray-400 mt-0.5">
            Highest per-day rate
          </div>
        </div>

        <div class="rounded-lg bg-gray-50 p-3.5 border border-gray-200">
          <div class="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Installed On</div>
          <div class="text-xl font-semibold text-gray-900 mt-1 tabular-nums">
            {{ meter.installedOn || 'N/A' }}
          </div>
          <div class="text-[10px] text-gray-400 mt-0.5">Commission date</div>
        </div>
      </div>

      <!-- 30-Day Usage Mini Timeline Chart -->
      <div class="mt-6 pt-6 border-t border-gray-100">
        <div class="flex items-center justify-between gap-2 mb-2">
          <h4 class="text-xs font-semibold text-gray-800 uppercase tracking-wider">
            30-Day Consumption Trend
          </h4>
          <span class="text-[11px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
            Daily Rate: {{ unit }}/day
          </span>
        </div>

        <!-- Dedicated Telemetry Readout Strip (fixed height to prevent layout shift) -->
        <div class="h-7 px-2.5 py-1 mb-2 bg-gray-50/90 rounded-md border border-gray-200/80 flex items-center justify-between text-xs overflow-hidden select-none">
          <div v-if="activeHoveredBar" class="flex items-center justify-between w-full font-mono">
            <div class="flex items-center gap-1.5 min-w-0 truncate text-gray-600">
              <span class="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0"></span>
              <span class="font-medium truncate">{{ formatDateTime(activeHoveredBar.readAt) }}</span>
            </div>
            <div class="text-indigo-700 shrink-0 ml-3">
              <span class="font-bold tabular-nums">{{ formatNumber(activeHoveredBar.ratePerDay, 2) }} {{ unit }}/day</span>
              <span class="text-gray-500 font-normal text-[11px] ml-1.5 tabular-nums">({{ formatNumber(activeHoveredBar.usage, 1) }} {{ unit }} over {{ activeHoveredBar.timeElapsed }})</span>
            </div>
          </div>
          <div v-else class="text-gray-400 text-[11px] flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full bg-gray-300"></span>
            <span>Hover over any bar to view interval telemetry</span>
          </div>
        </div>

        <!-- Mini Bar Histogram -->
        <div v-if="chronologicalUsage.length > 0" class="flex items-end gap-1 h-36 pt-4 px-2 bg-gray-50/80 rounded-lg border border-gray-200">
          <div
            v-for="item in chronologicalUsage"
            :key="item.id"
            class="flex-1 h-full flex items-end group relative cursor-pointer"
            @mouseenter="activeHoveredBar = item"
            @mouseleave="activeHoveredBar = null"
          >
            <!-- Bar Element -->
            <div
              :style="{
                height: `${Math.max(8, Math.min(100, metrics30Days.maxDailyRate > 0 ? (item.ratePerDay / metrics30Days.maxDailyRate) * 100 : 8))}%`,
              }"
              :class="[
                'w-full rounded-t-sm transition-colors duration-150',
                activeHoveredBar?.id === item.id
                  ? 'bg-indigo-600'
                  : 'bg-indigo-300 hover:bg-indigo-400',
              ]"
            ></div>
          </div>
        </div>

        <div v-else-if="!loading" class="text-center py-6 text-xs text-gray-400 italic bg-gray-50 rounded-lg border border-dashed border-gray-200">
          No usage readings recorded in the past 30 days.
        </div>
      </div>
    </div>
  </div>

    <!-- Right Column: Readings List Table (5 cols on lg/xl) -->
    <div class="min-[1400px]:col-span-5">
      <div class="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden sticky top-20">
        <div class="p-4 border-b border-gray-200 bg-gray-50/70 flex items-center justify-between">
          <h3 class="text-sm font-semibold text-gray-900">Recent Readings</h3>
          <span class="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
            {{ readings.length }} Loaded
          </span>
        </div>

        <!-- Loading State -->
        <div v-if="loading && readings.length === 0" class="p-6 space-y-2">
          <div v-for="i in 5" :key="i" class="h-6 bg-gray-100 rounded animate-pulse"></div>
        </div>

        <!-- Error State -->
        <div v-else-if="error" class="p-4 text-xs text-red-600 bg-red-50">
          {{ error }}
        </div>

        <!-- Empty State -->
        <div v-else-if="readings.length === 0" class="p-8 text-center text-xs text-gray-400 italic">
          No telemetry readings found for this meter.
        </div>

        <!-- Readings Table -->
        <div v-else class="overflow-x-auto max-h-[calc(100vh-240px)] min-h-[420px] overflow-y-auto">
          <table class="min-w-full divide-y divide-gray-200 text-left text-xs">
            <thead class="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th scope="col" class="py-2.5 pl-3 pr-2 font-semibold text-gray-900">Timestamp</th>
                <th scope="col" class="px-2 py-2.5 font-semibold text-gray-900 text-right">Reading</th>
                <th scope="col" class="px-2 py-2.5 font-semibold text-gray-900 text-right">Delta</th>
                <th scope="col" class="px-2 py-2.5 pr-3 font-semibold text-gray-900 text-right" title="Reading delta divided by timestamp delta">Rate</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 bg-white">
              <tr
                v-for="(r, index) in readings"
                :key="r.id"
                class="hover:bg-gray-50/80 transition"
              >
                <td class="whitespace-nowrap py-2.5 pl-3 pr-2 font-medium text-gray-800 text-[11px] tabular-nums">
                  <div>{{ formatDateTime(r.readAt) }}</div>
                  <div v-if="getReadingInterval(r, index)" class="text-[10px] text-gray-400">
                    {{ getReadingInterval(r, index) }}
                  </div>
                </td>
                <td class="whitespace-nowrap px-2 py-2.5 font-mono text-gray-900 font-semibold text-[11px] text-right tabular-nums">
                  {{ formatNumber(r.readingValue, 2) }}
                  <span class="text-[9px] font-sans font-normal text-gray-500 ml-0.5">{{ unit }}</span>
                </td>
                <td class="whitespace-nowrap px-2 py-2.5 text-right">
                  <span
                    v-if="getReadingDelta(r, index) !== null"
                    :class="[
                      'inline-flex items-center gap-0.5 font-mono font-medium px-1.5 py-0.5 rounded text-[10px] tabular-nums',
                      getReadingDelta(r, index)! >= 0
                        ? 'text-emerald-700 bg-emerald-50'
                        : 'text-amber-700 bg-amber-50',
                    ]"
                  >
                    {{ getReadingDelta(r, index)! >= 0 ? '+' : '' }}{{ formatNumber(getReadingDelta(r, index)!, 2) }}
                    <span class="text-[9px] font-sans font-normal text-gray-500 ml-0.5">{{ unit }}</span>
                  </span>
                  <span v-else class="text-gray-400 italic text-[10px]">
                    Base
                  </span>
                </td>
                <td class="whitespace-nowrap px-2 py-2.5 pr-3 font-mono text-[11px] text-right tabular-nums">
                  <div v-if="getReadingRate(r, index)">
                    <div
                      :class="[
                        'font-semibold',
                        getReadingRate(r, index)!.ratePerDay >= 0 ? 'text-gray-900' : 'text-amber-700',
                      ]"
                    >
                      {{ getReadingRate(r, index)!.ratePerDay >= 0 ? '+' : '' }}{{ formatNumber(getReadingRate(r, index)!.ratePerDay, 2) }}
                      <span class="text-[9px] font-sans font-normal text-gray-500">{{ unit }}/day</span>
                    </div>
                    <div class="text-[10px] text-gray-400 font-sans">
                      {{ formatNumber(getReadingRate(r, index)!.ratePerHour, 2) }} {{ unit }}/hr
                    </div>
                  </div>
                  <span v-else class="text-gray-400 italic text-[10px] font-sans">
                    —
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
