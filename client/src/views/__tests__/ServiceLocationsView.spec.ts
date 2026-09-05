import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ServiceLocationsView from '../ServiceLocationsView.vue';
import { useTopologyStore } from '../../stores/topology.js';

vi.mock('vue-router', () => ({
  useRoute: () => ({
    query: {},
    params: {},
  }),
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

describe('ServiceLocationsView.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders service locations table and summary cards from topology store', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useTopologyStore();
    store.locations = [
      {
        id: 1,
        addressLine1: '100 Broadway',
        addressLine2: null,
        city: 'Denver',
        state: 'CO',
        postalCode: '80202',
        createdAt: '2026-09-01T12:00:00Z',
        updatedAt: '2026-09-01T12:00:00Z',
      },
    ];
    store.trees = {
      1: {
        id: 1,
        addressLine1: '100 Broadway',
        addressLine2: null,
        city: 'Denver',
        state: 'CO',
        postalCode: '80202',
        createdAt: '2026-09-01T12:00:00Z',
        updatedAt: '2026-09-01T12:00:00Z',
        servicePoints: [],
      },
    };

    const wrapper = mount(ServiceLocationsView, {
      global: {
        plugins: [pinia],
        stubs: {
          RouterLink: {
            template: '<a><slot /></a>',
          },
        },
      },
    });

    expect(wrapper.text()).toContain('Service Locations');
    expect(wrapper.text()).toContain('100 Broadway');
    expect(wrapper.text()).toContain('Denver');
    expect(wrapper.text()).toContain('CO');
    expect(wrapper.text()).toContain('80202');
  });

  it('toggles the inline Add Location form', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);

    const wrapper = mount(ServiceLocationsView, {
      global: {
        plugins: [pinia],
        stubs: {
          RouterLink: {
            template: '<a><slot /></a>',
          },
        },
      },
    });

    expect(wrapper.findComponent({ name: 'ServiceLocationForm' }).exists()).toBe(false);

    const toggleBtn = wrapper.find('header button.bg-indigo-600');
    await toggleBtn.trigger('click');

    expect(wrapper.findComponent({ name: 'ServiceLocationForm' }).exists()).toBe(true);
    expect(toggleBtn.text()).toContain('Close Form');
  });

  it('filters locations by search input', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useTopologyStore();
    store.locations = [
      {
        id: 1,
        addressLine1: '100 Broadway',
        addressLine2: null,
        city: 'Denver',
        state: 'CO',
        postalCode: '80202',
        createdAt: '2026-09-01T12:00:00Z',
        updatedAt: '2026-09-01T12:00:00Z',
      },
      {
        id: 2,
        addressLine1: '500 Market St',
        addressLine2: null,
        city: 'San Francisco',
        state: 'CA',
        postalCode: '94105',
        createdAt: '2026-09-01T12:00:00Z',
        updatedAt: '2026-09-01T12:00:00Z',
      },
    ];

    const wrapper = mount(ServiceLocationsView, {
      global: {
        plugins: [pinia],
        stubs: {
          RouterLink: {
            template: '<a><slot /></a>',
          },
        },
      },
    });

    expect(wrapper.text()).toContain('100 Broadway');
    expect(wrapper.text()).toContain('500 Market St');

    const searchInput = wrapper.find('input[placeholder*="Search address"]');
    await searchInput.setValue('Francisco');

    expect(wrapper.text()).not.toContain('100 Broadway');
    expect(wrapper.text()).toContain('500 Market St');
  });
});
