import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import MetersView from '../MetersView.vue';
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

describe('MetersView.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupStore() {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useTopologyStore();
    vi.spyOn(store, 'fetchAll').mockResolvedValue(undefined);

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
        servicePoints: [
          {
            id: 10,
            serviceLocationId: 1,
            identifier: 'Main Panel',
            notes: null,
            createdAt: '2026-09-01T12:00:00Z',
            updatedAt: '2026-09-01T12:00:00Z',
            meters: [
              {
                id: 101,
                servicePointId: 10,
                serviceLocationId: 1,
                serialNumber: 'ELEC-999',
                type: 'electric',
                status: 'active',
                installedOn: '2026-08-01',
                createdAt: '2026-09-01T12:00:00Z',
                updatedAt: '2026-09-01T12:00:00Z',
              },
              {
                id: 102,
                servicePointId: 10,
                serviceLocationId: 1,
                serialNumber: 'WATR-888',
                type: 'water',
                status: 'active',
                installedOn: '2026-08-01',
                createdAt: '2026-09-01T12:00:00Z',
                updatedAt: '2026-09-01T12:00:00Z',
              },
            ],
          },
        ],
      },
    };

    return { pinia, store };
  }

  it('renders meters table and summary statistics', () => {
    const { pinia } = setupStore();

    const wrapper = mount(MetersView, {
      global: {
        plugins: [pinia],
        stubs: {
          RouterLink: {
            template: '<a><slot /></a>',
          },
        },
      },
    });

    expect(wrapper.text()).toContain('Meters & Telemetry');
    expect(wrapper.text()).toContain('ELEC-999');
    expect(wrapper.text()).toContain('WATR-888');
    expect(wrapper.text()).toContain('100 Broadway');
    expect(wrapper.text()).toContain('Main Panel');
  });

  it('filters meters by search query', async () => {
    const { pinia } = setupStore();

    const wrapper = mount(MetersView, {
      global: {
        plugins: [pinia],
        stubs: {
          RouterLink: {
            template: '<a><slot /></a>',
          },
        },
      },
    });

    const searchInput = wrapper.find('input[placeholder*="Search serial"]');
    await searchInput.setValue('WATR');

    expect(wrapper.text()).not.toContain('ELEC-999');
    expect(wrapper.text()).toContain('WATR-888');
  });

  it('toggles the inline Add Meter form', async () => {
    const { pinia } = setupStore();

    const wrapper = mount(MetersView, {
      global: {
        plugins: [pinia],
        stubs: {
          RouterLink: {
            template: '<a><slot /></a>',
          },
        },
      },
    });

    expect(wrapper.findComponent({ name: 'MeterForm' }).exists()).toBe(false);

    const addBtn = wrapper.find('header button.bg-indigo-600');
    await addBtn.trigger('click');

    expect(wrapper.findComponent({ name: 'MeterForm' }).exists()).toBe(true);
    expect(addBtn.text()).toContain('Close Form');
  });
});
