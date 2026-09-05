<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { useTopologyStore } from '../../stores/topology.js';
import MeterDashboardDetail from '../meters/MeterDashboardDetail.vue';

const store = useTopologyStore();
</script>

<template>
  <div class="space-y-6">
    <!-- Selected: Location Node -->
    <div
      v-if="store.selectedNode?.type === 'location' && store.selectedNode.location"
      class="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start"
    >
      <!-- Left (Location Summary & Stats): 5 cols on xl -->
      <div class="xl:col-span-5 bg-white rounded-xl border border-gray-200 p-6 shadow-xs space-y-6">
        <div class="flex items-start justify-between gap-4">
          <div>
            <span class="inline-flex items-center gap-1.5 rounded-md bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-700/10 mb-2">
              Service Location
            </span>
            <h3 class="text-xl font-bold text-gray-900 text-balance">
              {{ store.selectedNode.location.addressLine1 }}
            </h3>
            <p class="text-sm text-gray-500">
              {{ store.selectedNode.location.city }}, {{ store.selectedNode.location.state }} {{ store.selectedNode.location.postalCode }}
            </p>
          </div>
          <RouterLink
            :to="`/service-locations/${store.selectedNode.location.id}`"
            class="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-500 transition shrink-0"
          >
            <span>View Full Location</span>
            <svg class="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clip-rule="evenodd" />
            </svg>
          </RouterLink>
        </div>

        <!-- Quick Summary Stats -->
        <div class="grid grid-cols-3 gap-3">
          <div class="rounded-lg bg-gray-50 p-3 border border-gray-100">
            <div class="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Service Points</div>
            <div class="text-lg font-semibold text-gray-900 mt-0.5">
              {{ store.selectedNode.location.servicePoints?.length || 0 }}
            </div>
          </div>
          <div class="rounded-lg bg-gray-50 p-3 border border-gray-100">
            <div class="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Registered ID</div>
            <div class="text-lg font-mono font-semibold text-gray-900 mt-0.5">
              #{{ store.selectedNode.location.id }}
            </div>
          </div>
          <div class="rounded-lg bg-gray-50 p-3 border border-gray-100">
            <div class="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Postal Code</div>
            <div class="text-lg font-semibold text-gray-900 mt-0.5">
              {{ store.selectedNode.location.postalCode }}
            </div>
          </div>
        </div>
      </div>

      <!-- Right (Associated Service Points List): 7 cols on xl -->
      <div class="xl:col-span-7 bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
        <div class="p-4 border-b border-gray-200 bg-gray-50/70 flex items-center justify-between">
          <h4 class="text-sm font-semibold text-gray-900">Associated Service Points</h4>
          <span class="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
            {{ store.selectedNode.location.servicePoints?.length || 0 }} Units
          </span>
        </div>
        <div v-if="store.selectedNode.location.servicePoints && store.selectedNode.location.servicePoints.length > 0" class="divide-y divide-gray-100 max-h-[calc(100vh-240px)] overflow-y-auto">
          <div
            v-for="sp in store.selectedNode.location.servicePoints"
            :key="sp.id"
            @click="store.selectedNode.location && store.selectPoint(sp, store.selectedNode.location)"
            class="flex items-center justify-between p-3.5 bg-white hover:bg-indigo-50/40 cursor-pointer transition group"
          >
            <div>
              <div class="text-xs font-semibold text-gray-900 group-hover:text-indigo-600 transition">{{ sp.identifier }}</div>
              <div v-if="sp.notes" class="text-[11px] text-gray-500">{{ sp.notes }}</div>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs font-medium text-gray-500">{{ sp.meters?.length || 0 }} meters</span>
              <span class="text-xs font-semibold text-indigo-600 group-hover:translate-x-0.5 transition inline-flex items-center gap-0.5">
                Inspect &rarr;
              </span>
            </div>
          </div>
        </div>
        <div v-else class="p-8 text-center text-xs text-gray-400 italic">No service points registered for this location.</div>
      </div>
    </div>

    <!-- Selected: Service Point Node -->
    <div
      v-else-if="store.selectedNode?.type === 'point' && store.selectedNode.point"
      class="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start"
    >
      <!-- Left (Service Point Summary & Notes): 5 cols on xl -->
      <div class="xl:col-span-5 bg-white rounded-xl border border-gray-200 p-6 shadow-xs space-y-6">
        <div class="flex items-start justify-between gap-4">
          <div>
            <span class="inline-flex items-center gap-1.5 rounded-md bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700 ring-1 ring-inset ring-sky-700/10 mb-2">
              Service Point
            </span>
            <h3 class="text-xl font-bold text-gray-900">
              {{ store.selectedNode.point.identifier }}
            </h3>
            <p v-if="store.selectedNode.location" class="text-sm text-gray-500">
              Located at {{ store.selectedNode.location.addressLine1 }}
            </p>
          </div>
          <RouterLink
            :to="`/service-points/${store.selectedNode.point.id}`"
            class="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-sky-500 transition shrink-0"
          >
            <span>View Service Point</span>
            <svg class="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clip-rule="evenodd" />
            </svg>
          </RouterLink>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="rounded-lg bg-gray-50 p-3 border border-gray-100">
            <div class="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Service Point ID</div>
            <div class="text-base font-mono font-semibold text-gray-900 mt-0.5">#{{ store.selectedNode.point.id }}</div>
          </div>
          <div class="rounded-lg bg-gray-50 p-3 border border-gray-100">
            <div class="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Parent Location</div>
            <RouterLink
              v-if="store.selectedNode.location"
              :to="`/service-locations/${store.selectedNode.location.id}`"
              :title="store.selectedNode.location.addressLine1"
              class="text-base font-semibold text-indigo-600 hover:text-indigo-500 block truncate mt-0.5"
            >
              {{ store.selectedNode.location.addressLine1 }}
            </RouterLink>
          </div>
        </div>

        <div v-if="store.selectedNode.point.notes" class="rounded-lg bg-gray-50 p-3.5 text-xs text-gray-700 border border-gray-200">
          <span class="font-semibold text-gray-900">Notes: </span>
          {{ store.selectedNode.point.notes }}
        </div>
      </div>

      <!-- Right (Installed Meters List): 7 cols on xl -->
      <div class="xl:col-span-7 bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
        <div class="p-4 border-b border-gray-200 bg-gray-50/70 flex items-center justify-between">
          <div>
            <h4 class="text-sm font-semibold text-gray-900">Installed Meters</h4>
            <span class="text-[11px] text-gray-400">Click any meter to view 30-day analytics</span>
          </div>
          <span class="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
            {{ store.selectedNode.point?.meters?.length || 0 }} Installed
          </span>
        </div>
        <div v-if="store.selectedNode.point?.meters && store.selectedNode.point.meters.length > 0" class="divide-y divide-gray-100 max-h-[calc(100vh-240px)] overflow-y-auto">
          <div
            v-for="m in store.selectedNode.point.meters"
            :key="m.id"
            @click="store.selectedNode.location && store.selectedNode.point && store.selectMeter(m, store.selectedNode.point, store.selectedNode.location)"
            class="flex items-center justify-between p-3.5 bg-white hover:bg-indigo-50/40 cursor-pointer transition group"
          >
            <div class="flex items-center gap-3">
              <span class="text-lg">
                {{ m.type === 'electric' ? '⚡' : m.type === 'water' ? '💧' : '🔥' }}
              </span>
              <div>
                <div class="font-mono text-xs font-semibold text-gray-900 group-hover:text-indigo-600 transition">
                  {{ m.serialNumber }}
                </div>
                <div class="text-[11px] text-gray-500 capitalize">{{ m.type }} utility meter</div>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <span class="rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ring-emerald-600/20 capitalize">
                {{ m.status }}
              </span>
              <span class="text-xs font-semibold text-indigo-600 group-hover:translate-x-0.5 transition inline-flex items-center gap-0.5">
                Inspect &rarr;
              </span>
            </div>
          </div>
        </div>
        <div v-else class="p-8 text-center text-xs text-gray-400 italic">No meters installed at this service point.</div>
      </div>
    </div>

    <!-- Selected: Meter Node (30-day usage analytics & readings list) -->
    <div v-else-if="store.selectedNode?.type === 'meter' && store.selectedNode.meter">
      <MeterDashboardDetail
        :meter="store.selectedNode.meter"
        :location="store.selectedNode.location"
        :point="store.selectedNode.point"
      />
    </div>

    <!-- Default State: No node selected -->
    <div v-else class="space-y-6">
      <!-- High-level Metric Cards -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
          <div class="text-xs font-medium text-gray-500 uppercase tracking-wider">Locations</div>
          <div class="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{{ store.metrics.locationsCount }}</div>
          <div class="text-[11px] text-gray-400 mt-0.5">Physical properties</div>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
          <div class="text-xs font-medium text-gray-500 uppercase tracking-wider">Service Points</div>
          <div class="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{{ store.metrics.pointsCount }}</div>
          <div class="text-[11px] text-gray-400 mt-0.5">Units & panels</div>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
          <div class="text-xs font-medium text-gray-500 uppercase tracking-wider">Total Meters</div>
          <div class="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{{ store.metrics.metersCount }}</div>
          <div class="text-[11px] text-emerald-600 mt-0.5 font-medium">{{ store.metrics.activeMeters }} active</div>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
          <div class="text-xs font-medium text-gray-500 uppercase tracking-wider">Maintenance / Dec.</div>
          <div class="text-2xl font-bold text-amber-600 mt-1 tabular-nums">
            {{ store.metrics.maintenanceMeters + store.metrics.decommissionedMeters }}
          </div>
          <div class="text-[11px] text-gray-400 mt-0.5">Flagged meters</div>
        </div>
      </div>

      <!-- Empty Selection State Placeholder -->
      <div class="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center flex min-h-[320px] flex-col items-center justify-center">
        <div class="mx-auto w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 mb-3">
          <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        </div>
        <h3 class="text-sm font-semibold text-gray-900">No Item Selected</h3>
        <p class="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
          Select a service location, service point, or meter from the hierarchy on the left to inspect details and live telemetry.
        </p>
        <div class="mt-5 flex items-center justify-center gap-3">
          <RouterLink
            to="/service-locations"
            class="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-xs hover:bg-gray-50 transition"
          >
            Manage Locations
          </RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>
