<script setup lang="ts">
import { ref, computed } from 'vue';
import type { MeterUsageRecord } from '../../api/types.js';

export interface AnomalyDetails {
  type: 'spike' | 'flatline' | 'rollover' | 'gap';
  label: string;
  badgeClass: string;
  description: string;
}

export interface AnalyzedUsageItem {
  id: number;
  readAt: string;
  readingValue: number;
  previousReadingValue: number | null;
  usage: number;
  daysDiff: number;
  ratePerDay: number;
  ratePerHour: number;
  timeElapsed: string;
  anomaly: AnomalyDetails | null;
}

const props = withDefaults(
  defineProps<{
    records: MeterUsageRecord[];
    unit?: string;
  }>(),
  {
    unit: 'kWh',
  }
);

const timeRangeFilter = ref<'all' | '30' | '14'>('all');
const activeHoveredBar = ref<AnalyzedUsageItem | null>(null);

function parseDaysFromInterval(timeElapsed: string | null, readAt: string, prevReadAt: string | null): number {
  if (prevReadAt) {
    const diffMs = new Date(readAt).getTime() - new Date(prevReadAt).getTime();
    if (!isNaN(diffMs) && diffMs > 0) {
      return diffMs / (1000 * 60 * 60 * 24);
    }
  }

  if (!timeElapsed) return 1;

  let days = 0;
  const dayMatch = timeElapsed.match(/(\d+)\s+day/);
  if (dayMatch && dayMatch[1]) {
    days += parseInt(dayMatch[1], 10);
  }

  const timeMatch = timeElapsed.match(/(?:(\d+):)?(\d+):(\d+)/);
  if (timeMatch) {
    const hrs = parseInt(timeMatch[1] || '0', 10);
    const mins = parseInt(timeMatch[2] || '0', 10);
    days += hrs / 24 + mins / 1440;
  }

  return days > 0 ? days : 1;
}

function formatDuration(days: number): string {
  if (days < 1) {
    const hours = Math.max(1, Math.round(days * 24));
    return `${hours}h`;
  }
  const d = Math.floor(days);
  const h = Math.round((days - d) * 24);
  return h > 0 ? `${d}d ${h}h` : `${d}d`;
}

// Compute normalized usage items and detect anomalies
const analyzedItems = computed<AnalyzedUsageItem[]>(() => {
  if (!props.records || props.records.length === 0) return [];

  // Sort chronological ascending (oldest to newest)
  const sorted = [...props.records].sort(
    (a, b) => new Date(a.readAt).getTime() - new Date(b.readAt).getTime()
  );

  // First pass: compute basic metrics & rates
  const rawItems = sorted.map((rec) => {
    const readVal = Number(rec.readingValue);
    const prevVal = rec.previousReadingValue !== null ? Number(rec.previousReadingValue) : null;
    const usageVal = rec.usage !== null ? Number(rec.usage) : prevVal !== null ? readVal - prevVal : 0;
    const daysDiff = Math.max(0.01, parseDaysFromInterval(rec.timeElapsed, rec.readAt, rec.previousReadAt));
    const ratePerDay = daysDiff > 0 ? usageVal / daysDiff : usageVal;
    const ratePerHour = ratePerDay / 24;

    return {
      id: rec.id,
      readAt: rec.readAt,
      readingValue: readVal,
      previousReadingValue: prevVal,
      usage: usageVal,
      daysDiff,
      ratePerDay,
      ratePerHour,
      timeElapsed: formatDuration(daysDiff),
    };
  });

  // Calculate baseline median for spike threshold (robust against outlier distortion)
  const validPositiveRates = rawItems
    .filter((it) => it.previousReadingValue !== null && it.ratePerDay > 0)
    .map((it) => it.ratePerDay);

  const sortedPositiveRates = [...validPositiveRates].sort((a, b) => a - b);
  let medianRate = 0;
  if (sortedPositiveRates.length > 0) {
    const mid = Math.floor(sortedPositiveRates.length / 2);
    medianRate =
      sortedPositiveRates.length % 2 !== 0
        ? sortedPositiveRates[mid]!
        : (sortedPositiveRates[mid - 1]! + sortedPositiveRates[mid]!) / 2;
  }

  // Second pass: flag anomalies
  return rawItems.map((it) => {
    let anomaly: AnomalyDetails | null = null;

    if (it.previousReadingValue !== null) {
      if (it.usage < 0) {
        anomaly = {
          type: 'rollover',
          label: 'Rollover / Reset',
          badgeClass: 'bg-red-50 text-red-700 ring-red-600/20 border-red-200',
          description: `Reading dropped by ${Math.abs(it.usage).toFixed(1)} ${props.unit} (counter rollover or meter swap)`,
        };
      } else if (it.usage === 0 && it.daysDiff >= 0.5) {
        anomaly = {
          type: 'flatline',
          label: 'Stalled / Flatline',
          badgeClass: 'bg-amber-50 text-amber-700 ring-amber-600/20 border-amber-200',
          description: `Zero consumption recorded over ${it.timeElapsed}`,
        };
      } else if (medianRate > 0 && it.ratePerDay > medianRate * 2.2 && validPositiveRates.length >= 2) {
        const pctAbove = Math.round(((it.ratePerDay - medianRate) / medianRate) * 100);
        anomaly = {
          type: 'spike',
          label: `Consumption Spike (+${pctAbove}%)`,
          badgeClass: 'bg-rose-50 text-rose-700 ring-rose-600/20 border-rose-200',
          description: `Surge of ${it.ratePerDay.toFixed(1)} ${props.unit}/day vs baseline (${medianRate.toFixed(1)})`,
        };
      } else if (it.daysDiff > 3) {
        anomaly = {
          type: 'gap',
          label: `Outage Gap (${it.timeElapsed})`,
          badgeClass: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20 border-indigo-200',
          description: `Reporting interval spanned ${it.timeElapsed} without checkpoints`,
        };
      }
    }

    return {
      ...it,
      anomaly,
    };
  });
});

// Filter by selected time range
const filteredItems = computed<AnalyzedUsageItem[]>(() => {
  const items = analyzedItems.value;
  if (timeRangeFilter.value === 'all' || items.length === 0) return items;

  const daysCutoff = parseInt(timeRangeFilter.value, 10);
  const latestDate = new Date(items[items.length - 1]!.readAt).getTime();
  const thresholdTime = latestDate - daysCutoff * 24 * 60 * 60 * 1000;

  return items.filter((it) => new Date(it.readAt).getTime() >= thresholdTime);
});

// Max positive daily rate for normalization scaling
const maxDailyRate = computed(() => {
  const positiveRates = filteredItems.value.map((i) => Math.max(0, i.ratePerDay));
  return positiveRates.length > 0 ? Math.max(...positiveRates, 1) : 1;
});

const anomalyCounts = computed(() => {
  let spikes = 0;
  let flatlines = 0;
  let rollovers = 0;
  let gaps = 0;

  for (const it of filteredItems.value) {
    if (!it.anomaly) continue;
    if (it.anomaly.type === 'spike') spikes++;
    else if (it.anomaly.type === 'flatline') flatlines++;
    else if (it.anomaly.type === 'rollover') rollovers++;
    else if (it.anomaly.type === 'gap') gaps++;
  }

  return {
    total: spikes + flatlines + rollovers + gaps,
    spikes,
    flatlines,
    rollovers,
    gaps,
  };
});

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatNumber(num: number, decimals = 1): string {
  return num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
</script>

<template>
  <div class="bg-white rounded-xl border border-gray-200 p-5 sm:p-6 shadow-xs space-y-4">
    <!-- Header: Title, Anomaly Badges, & Range Controls -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div>
        <div class="flex items-center gap-2 flex-wrap">
          <h3 class="text-sm font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <span class="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-50 text-indigo-600">
              <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
              </svg>
            </span>
            Usage Analysis & Telemetry Intervals
          </h3>

          <span class="text-[11px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
            Normalized ({{ unit }}/day)
          </span>

          <span
            v-if="anomalyCounts.total > 0"
            class="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/20"
          >
            <span>⚠️</span>
            {{ anomalyCounts.total }} {{ anomalyCounts.total === 1 ? 'Anomaly' : 'Anomalies' }} Detected
          </span>
        </div>
        <p class="text-xs text-gray-500 mt-1">
          Bar heights represent interval consumption normalized per day. Anomalies (spikes, stalls, rollovers) are highlighted.
        </p>
      </div>

      <!-- Time Range Pills -->
      <div class="inline-flex rounded-lg bg-gray-100 p-0.5 text-xs font-medium shrink-0 self-start sm:self-auto">
        <button
          type="button"
          @click="timeRangeFilter = 'all'"
          :class="[
            'px-2.5 py-1 rounded-md transition',
            timeRangeFilter === 'all'
              ? 'bg-white text-gray-900 shadow-2xs font-semibold'
              : 'text-gray-600 hover:text-gray-900',
          ]"
        >
          All History
        </button>
        <button
          type="button"
          @click="timeRangeFilter = '30'"
          :class="[
            'px-2.5 py-1 rounded-md transition',
            timeRangeFilter === '30'
              ? 'bg-white text-gray-900 shadow-2xs font-semibold'
              : 'text-gray-600 hover:text-gray-900',
          ]"
        >
          30 Days
        </button>
        <button
          type="button"
          @click="timeRangeFilter = '14'"
          :class="[
            'px-2.5 py-1 rounded-md transition',
            timeRangeFilter === '14'
              ? 'bg-white text-gray-900 shadow-2xs font-semibold'
              : 'text-gray-600 hover:text-gray-900',
          ]"
        >
          14 Days
        </button>
      </div>
    </div>

    <!-- Telemetry Readout Strip (Fixed Height h-8 to prevent ANY layout shift on hover) -->
    <div class="h-8 px-3 py-1 bg-gray-50/90 rounded-lg border border-gray-200/80 flex items-center justify-between text-xs overflow-hidden select-none">
      <div v-if="activeHoveredBar" class="flex items-center justify-between w-full font-mono">
        <!-- Left: Timestamp + Anomaly Tag -->
        <div class="flex items-center gap-2 min-w-0 truncate text-gray-600">
          <span
            :class="[
              'w-2 h-2 rounded-full shrink-0',
              activeHoveredBar.anomaly?.type === 'spike'
                ? 'bg-rose-500 animate-ping'
                : activeHoveredBar.anomaly?.type === 'flatline'
                  ? 'bg-amber-500'
                  : activeHoveredBar.anomaly?.type === 'rollover'
                    ? 'bg-red-600'
                    : 'bg-indigo-500',
            ]"
          ></span>
          <span class="font-semibold text-gray-800 truncate">
            {{ formatDateTime(activeHoveredBar.readAt) }}
          </span>

          <span
            v-if="activeHoveredBar.anomaly"
            :class="[
              'px-2 py-0.5 rounded text-[10px] font-sans font-semibold ring-1 ring-inset shrink-0',
              activeHoveredBar.anomaly.badgeClass,
            ]"
          >
            {{ activeHoveredBar.anomaly.label }}
          </span>
        </div>

        <!-- Right: Daily Rate & Interval Breakdown -->
        <div class="shrink-0 ml-3 flex items-center gap-2">
          <span class="font-bold text-indigo-700">
            {{ formatNumber(activeHoveredBar.ratePerDay, 2) }} {{ unit }}/day
          </span>
          <span class="text-gray-500 font-normal text-[11px] hidden sm:inline">
            ({{ formatNumber(activeHoveredBar.usage, 1) }} {{ unit }} over {{ activeHoveredBar.timeElapsed }})
          </span>
        </div>
      </div>

      <!-- Idle prompt -->
      <div v-else class="text-gray-400 text-[11px] flex items-center justify-between w-full">
        <div class="flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-gray-300"></span>
          <span>Hover over any bar to inspect interval telemetry & anomaly details</span>
        </div>
        <span class="text-gray-400 hidden sm:inline">{{ filteredItems.length }} intervals rendered</span>
      </div>
    </div>

    <!-- Bar Histogram Chart -->
    <div
      v-if="filteredItems.length > 0"
      class="flex items-end gap-1.5 h-36 pt-6 px-3 bg-gray-50/80 rounded-xl border border-gray-200"
    >
      <div
        v-for="item in filteredItems"
        :key="item.id"
        class="flex-1 h-full flex items-end group relative cursor-pointer"
        @mouseenter="activeHoveredBar = item"
        @mouseleave="activeHoveredBar = null"
      >
        <!-- Bar Element -->
        <div
          :style="{
            height: `${Math.max(8, Math.min(100, maxDailyRate > 0 ? (Math.max(0, item.ratePerDay) / maxDailyRate) * 100 : 8))}%`,
          }"
          :class="[
            'w-full rounded-t transition-colors duration-150 relative',
            item.anomaly?.type === 'spike'
              ? activeHoveredBar?.id === item.id
                ? 'bg-rose-600 ring-2 ring-rose-400'
                : 'bg-rose-400 hover:bg-rose-500 ring-1 ring-rose-300'
              : item.anomaly?.type === 'flatline'
                ? activeHoveredBar?.id === item.id
                  ? 'bg-amber-400 border-2 border-amber-600'
                  : 'bg-amber-200 border-2 border-dashed border-amber-400 hover:bg-amber-300'
                : item.anomaly?.type === 'rollover'
                  ? activeHoveredBar?.id === item.id
                    ? 'bg-red-700 ring-2 ring-red-400'
                    : 'bg-red-500 hover:bg-red-600'
                  : item.anomaly?.type === 'gap'
                    ? activeHoveredBar?.id === item.id
                      ? 'bg-indigo-700 ring-2 ring-indigo-400'
                      : 'bg-indigo-400 hover:bg-indigo-500 ring-1 ring-indigo-300'
                    : activeHoveredBar?.id === item.id
                      ? 'bg-indigo-600'
                      : 'bg-indigo-300 hover:bg-indigo-400',
          ]"
        >
          <!-- Top Indicator Pip for Anomalies -->
          <div
            v-if="item.anomaly"
            :class="[
              'absolute -top-2 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full ring-1 ring-white shadow-2xs',
              item.anomaly.type === 'spike'
                ? 'bg-rose-500'
                : item.anomaly.type === 'flatline'
                  ? 'bg-amber-500'
                  : item.anomaly.type === 'rollover'
                    ? 'bg-red-600'
                    : 'bg-indigo-600',
            ]"
          ></div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div
      v-else
      class="text-center py-10 text-xs text-gray-400 italic bg-gray-50 rounded-xl border border-dashed border-gray-200"
    >
      No usage readings recorded for this meter in the selected time range.
    </div>

    <!-- Anomaly Legend & Status Breakdown -->
    <div class="pt-2 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3 text-[11px] text-gray-500">
      <div class="flex items-center gap-3 flex-wrap">
        <span class="font-medium text-gray-700">Legend:</span>
        <div class="flex items-center gap-1.5">
          <span class="w-2.5 h-2.5 rounded-xs bg-indigo-400"></span>
          <span>Normal Baseline</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="w-2.5 h-2.5 rounded-xs bg-rose-500"></span>
          <span>Consumption Spike</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="w-2.5 h-2.5 rounded-xs bg-amber-300 border border-dashed border-amber-500"></span>
          <span>Stalled / Flatline</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="w-2.5 h-2.5 rounded-xs bg-red-600"></span>
          <span>Rollover / Reset</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="w-2.5 h-2.5 rounded-xs bg-indigo-400 ring-1 ring-indigo-500"></span>
          <span>Extended Outage Gap</span>
        </div>
      </div>

      <div class="text-[10px] text-gray-400">
        Peak: <strong class="text-gray-700 font-mono">{{ formatNumber(maxDailyRate, 1) }} {{ unit }}/day</strong>
      </div>
    </div>
  </div>
</template>
