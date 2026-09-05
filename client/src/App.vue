<script setup lang="ts">
import { RouterLink, RouterView, useRoute } from 'vue-router';

const route = useRoute();

const navigation = [
  { name: 'Dashboard', href: '/' },
  { name: 'Locations', href: '/service-locations' },
  { name: 'Meters', href: '/meters' },
];

function isActive(href: string): boolean {
  if (href === '/') {
    return route.path === '/';
  }
  return route.path.startsWith(href);
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 text-gray-900 flex flex-col font-sans">
    <!-- Main Application Header -->
    <header class="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur-xs">
      <div class="mx-auto w-full max-w-[2200px] px-4 sm:px-6 lg:px-8 2xl:px-12">
        <div class="flex min-h-16 items-center justify-between gap-3 py-2 md:py-0">
          <!-- Logo & Brand -->
          <div class="flex min-w-0 flex-wrap items-center gap-x-8 gap-y-1">
            <RouterLink to="/" class="flex items-center gap-2.5 group">
              <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-xs group-hover:bg-indigo-700 transition">
                <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
              </div>
              <div>
                <span class="text-base font-semibold text-gray-900 tracking-tight block leading-tight">Meter Management</span>
                <span class="text-[11px] font-medium text-gray-500 uppercase tracking-wider block">Telemetry & Analytics</span>
              </div>
            </RouterLink>

            <!-- Navigation Links -->
            <nav class="flex w-full items-center gap-1 md:w-auto">
              <RouterLink
                v-for="item in navigation"
                :key="item.name"
                :to="item.href"
                :class="[
                  isActive(item.href)
                    ? 'bg-indigo-50 text-indigo-700 font-semibold'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 font-medium',
                  'rounded-md px-3 py-2 text-sm transition',
                ]"
              >
                {{ item.name }}
              </RouterLink>
            </nav>
          </div>

          <!-- Right Status Badge -->
          <div class="hidden shrink-0 items-center gap-3 sm:flex">
            <div class="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
              <span class="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Live Database
            </div>
          </div>
        </div>
      </div>
    </header>

    <!-- Page Content Container -->
    <main class="flex-1 mx-auto w-full max-w-[2200px] px-4 py-6 sm:px-6 lg:px-8 2xl:px-12">
      <RouterView />
    </main>

    <!-- Simple Footer -->
    <footer class="border-t border-gray-200 bg-white py-4 text-center text-[11px] sm:text-xs text-gray-500">
      <div class="mx-auto w-full max-w-[2200px] px-4 sm:px-6 lg:px-8 2xl:px-12 flex flex-col sm:flex-row items-center justify-between gap-2">
        <span>Utility Meter Management Platform</span>
        <span>Fastify + Drizzle ORM + Vue 3 + Tailwind CSS</span>
      </div>
    </footer>
  </div>
</template>
