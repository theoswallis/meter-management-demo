<script setup lang="ts">
import { useRoute } from 'vue-router';

const route = useRoute();
const pointId = route.params.id;
</script>

<template>
  <div class="space-y-6">
    <header>
      <router-link
        to="/service-locations"
        class="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-500 transition"
      >
        &larr; Back to Service Locations
      </router-link>
      <h1 class="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
        Service Point #{{ pointId }}
      </h1>
      <p class="text-xs sm:text-sm text-gray-500 mt-1">Service point details, attached meters, and notes.</p>
    </header>
    <div class="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center flex min-h-[280px] flex-col items-center justify-center">
      <div class="mx-auto w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 mb-3">
        <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <p class="text-sm text-gray-500">Service point meters and details will appear here.</p>
    </div>
  </div>
</template>
