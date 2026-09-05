import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ServiceLocationDetailView from '../ServiceLocationDetailView.vue';
import * as serviceLocationsApi from '../../api/serviceLocations.js';
import type { ServiceLocationTree } from '../../api/types.js';

vi.mock('vue-router', () => ({
  useRoute: () => ({
    params: { id: '1' },
    query: {},
  }),
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock('../../api/serviceLocations.js', () => ({
  getServiceLocations: vi.fn(),
  getServiceLocationById: vi.fn(),
  getServiceLocationTree: vi.fn(),
  updateServiceLocation: vi.fn(),
}));

describe('ServiceLocationDetailView.vue', () => {
  const mockTree: ServiceLocationTree = {
    id: 1,
    addressLine1: '1042 Maple Street',
    addressLine2: 'Apt 4B',
    city: 'Denver',
    state: 'CO',
    postalCode: '80202',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    servicePoints: [
      {
        id: 10,
        serviceLocationId: 1,
        identifier: 'Main Residence Panel',
        notes: 'Basement utility closet',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        meters: [
          {
            id: 101,
            serviceLocationId: 1,
            servicePointId: 10,
            serialNumber: 'MTR-ELEC-101',
            type: 'electric',
            status: 'active',
            installedOn: '2026-01-15',
            createdAt: '2026-01-15T00:00:00Z',
            updatedAt: '2026-01-15T00:00:00Z',
          },
          {
            id: 102,
            serviceLocationId: 1,
            servicePointId: 10,
            serialNumber: 'MTR-WAT-102',
            type: 'water',
            status: 'active',
            installedOn: '2026-01-15',
            createdAt: '2026-01-15T00:00:00Z',
            updatedAt: '2026-01-15T00:00:00Z',
          },
        ],
      },
      {
        id: 20,
        serviceLocationId: 1,
        identifier: 'Detached Garage',
        notes: 'North wall panel',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        meters: [
          {
            id: 201,
            serviceLocationId: 1,
            servicePointId: 20,
            serialNumber: 'MTR-GAS-201',
            type: 'gas',
            status: 'maintenance',
            installedOn: '2026-02-01',
            createdAt: '2026-02-01T00:00:00Z',
            updatedAt: '2026-02-01T00:00:00Z',
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    const pinia = createPinia();
    setActivePinia(pinia);
  });

  it('renders service location details and metric summary', async () => {
    vi.mocked(serviceLocationsApi.getServiceLocationTree).mockResolvedValue({
      data: mockTree,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      ok: true,
    });

    const wrapper = mount(ServiceLocationDetailView, {
      props: { id: '1' },
      global: {
        stubs: {
          RouterLink: { template: '<a><slot /></a>' },
          ServiceLocationForm: true,
          MeterForm: true,
        },
      },
    });

    await flushPromises();

    expect(wrapper.text()).toContain('1042 Maple Street');
    expect(wrapper.text()).toContain('(Apt 4B)');
    expect(wrapper.text()).toContain('Denver, CO 80202');
    expect(wrapper.text()).toContain('Location #1');

    // Metrics
    expect(wrapper.text()).toContain('Service Points');
    expect(wrapper.text()).toContain('Installed Meters');
  });

  it('renders service point filter buttons and filters the meters table', async () => {
    vi.mocked(serviceLocationsApi.getServiceLocationTree).mockResolvedValue({
      data: mockTree,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      ok: true,
    });

    const wrapper = mount(ServiceLocationDetailView, {
      props: { id: '1' },
      global: {
        stubs: {
          RouterLink: { template: '<a><slot /></a>' },
          ServiceLocationForm: true,
          MeterForm: true,
        },
      },
    });

    await flushPromises();

    // Both service points visible as filter pills
    expect(wrapper.text()).toContain('Main Residence Panel');
    expect(wrapper.text()).toContain('Detached Garage');

    // Initially all 3 meters are shown
    expect(wrapper.text()).toContain('MTR-ELEC-101');
    expect(wrapper.text()).toContain('MTR-WAT-102');
    expect(wrapper.text()).toContain('MTR-GAS-201');

    // Click Detached Garage filter pill
    const garageBtn = wrapper.findAll('button').find((b) => b.text().includes('Detached Garage'));
    expect(garageBtn).toBeDefined();
    await garageBtn!.trigger('click');

    // Only Detached Garage meters shown
    expect(wrapper.text()).toContain('MTR-GAS-201');
    expect(wrapper.text()).not.toContain('MTR-ELEC-101');
  });

  it('filters meters by search query', async () => {
    vi.mocked(serviceLocationsApi.getServiceLocationTree).mockResolvedValue({
      data: mockTree,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      ok: true,
    });

    const wrapper = mount(ServiceLocationDetailView, {
      props: { id: '1' },
      global: {
        stubs: {
          RouterLink: { template: '<a><slot /></a>' },
          ServiceLocationForm: true,
          MeterForm: true,
        },
      },
    });

    await flushPromises();

    const searchInput = wrapper.find('input[placeholder*="Search by serial"]');
    expect(searchInput.exists()).toBe(true);

    await searchInput.setValue('WAT-102');

    expect(wrapper.text()).toContain('MTR-WAT-102');
    expect(wrapper.text()).not.toContain('MTR-ELEC-101');
    expect(wrapper.text()).not.toContain('MTR-GAS-201');
  });

  it('toggles edit location mode', async () => {
    vi.mocked(serviceLocationsApi.getServiceLocationTree).mockResolvedValue({
      data: mockTree,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      ok: true,
    });

    const wrapper = mount(ServiceLocationDetailView, {
      props: { id: '1' },
      global: {
        stubs: {
          RouterLink: { template: '<a><slot /></a>' },
          ServiceLocationForm: {
            name: 'ServiceLocationForm',
            template: '<div class="stubbed-location-form"><button @click="$emit(\'cancel\')">Cancel</button></div>',
            emits: ['cancel', 'success'],
          },
          MeterForm: true,
        },
      },
    });

    await flushPromises();

    expect(wrapper.find('.stubbed-location-form').exists()).toBe(false);

    // Click "Edit Location"
    const editBtn = wrapper.findAll('button').find((b) => b.text().includes('Edit Location'));
    expect(editBtn).toBeDefined();
    await editBtn!.trigger('click');

    expect(wrapper.find('.stubbed-location-form').exists()).toBe(true);
  });

  it('toggles add meter form', async () => {
    vi.mocked(serviceLocationsApi.getServiceLocationTree).mockResolvedValue({
      data: mockTree,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      ok: true,
    });

    const wrapper = mount(ServiceLocationDetailView, {
      props: { id: '1' },
      global: {
        stubs: {
          RouterLink: { template: '<a><slot /></a>' },
          ServiceLocationForm: true,
          MeterForm: {
            name: 'MeterForm',
            template: '<div class="stubbed-meter-form"><button @click="$emit(\'cancel\')">Cancel</button></div>',
            emits: ['cancel', 'success'],
          },
        },
      },
    });

    await flushPromises();

    expect(wrapper.find('.stubbed-meter-form').exists()).toBe(false);

    // Click "Add Meter"
    const addMeterBtn = wrapper.findAll('button').find((b) => b.text().includes('Add Meter'));
    expect(addMeterBtn).toBeDefined();
    await addMeterBtn!.trigger('click');

    expect(wrapper.find('.stubbed-meter-form').exists()).toBe(true);
  });

  it('displays error banner when location fails to load', async () => {
    vi.mocked(serviceLocationsApi.getServiceLocationTree).mockResolvedValue({
      data: null as any,
      status: 404,
      statusText: 'Not Found',
      headers: new Headers(),
      ok: false,
    });

    const wrapper = mount(ServiceLocationDetailView, {
      props: { id: '999' },
      global: {
        stubs: {
          RouterLink: { template: '<a><slot /></a>' },
        },
      },
    });

    await flushPromises();

    expect(wrapper.text()).toContain('could not be found');
  });
});
