import { createRouter, createWebHistory } from 'vue-router';
import DashboardView from '../views/DashboardView.vue';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: DashboardView,
    },
    {
      path: '/service-locations',
      name: 'service-locations',
      component: () => import('../views/ServiceLocationsView.vue'),
    },
    {
      path: '/service-locations/new',
      redirect: '/service-locations?new=1',
    },
    {
      path: '/meters',
      name: 'meters',
      component: () => import('../views/MetersView.vue'),
    },
    {
      path: '/service-locations/:id',
      name: 'service-location-detail',
      component: () => import('../views/ServiceLocationDetailView.vue'),
      props: true,
    },
    {
      path: '/service-points/:id',
      name: 'service-point-detail',
      component: () => import('../views/ServicePointDetailView.vue'),
      props: true,
    },
    {
      path: '/meters/:id',
      name: 'meter-detail',
      component: () => import('../views/MeterDetailView.vue'),
      props: true,
    },
  ],
});

export default router;
