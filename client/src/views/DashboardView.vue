<script setup lang="ts">
import { onMounted } from 'vue';
import { useTopologyStore } from '../stores/topology.js';
import NavigationTree from '../components/tree/NavigationTree.vue';
import NodeDetailCard from '../components/tree/NodeDetailCard.vue';

const store = useTopologyStore();

onMounted(() => {
  if (store.locations.length === 0) {
    store.fetchAll();
  }
});
</script>

<template>
  <div class="space-y-6">
    <!-- Dashboard Header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-gray-900">Dashboard</h1>
        <p class="text-xs text-gray-500 mt-1">
          System Overview & Hierarchical Topology Navigation
        </p>
      </div>

      <!-- Action buttons -->
      <div class="flex items-center gap-2">
        <button
          type="button"
          @click="store.fetchAll()"
          :disabled="store.loading"
          class="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-xs hover:bg-gray-50 disabled:opacity-50 transition"
        >
          <svg
            :class="['h-3.5 w-3.5 text-gray-500', store.loading ? 'animate-spin' : '']"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span>Refresh</span>
        </button>
      </div>
    </div>

    <!-- 2-Column Split: Navigation Tree (Left) + Detail Card (Right) -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <!-- Left: Navigation Tree (4 cols on lg, 3 cols on xl, 2 cols on 2xl) -->
      <div class="lg:col-span-4 xl:col-span-3 min-[1800px]:col-span-2 sticky top-20">
        <NavigationTree />
      </div>

      <!-- Right: Detailed Inspector & Overview (8 cols on lg, 9 cols on xl, 10 cols on 2xl) -->
      <div class="lg:col-span-8 xl:col-span-9 min-[1800px]:col-span-10">
        <NodeDetailCard />
      </div>
    </div>
  </div>
</template>
