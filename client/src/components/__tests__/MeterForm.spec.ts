import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import MeterForm from '../meters/MeterForm.vue';
import { useTopologyStore } from '../../stores/topology.js';
import * as metersApi from '../../api/meters.js';
import * as servicePointsApi from '../../api/servicePoints.js';

vi.mock('../../api/meters.js', () => ({
  createMeterForServicePoint: vi.fn(),
}));

vi.mock('../../api/servicePoints.js', () => ({
  createServicePointForLocation: vi.fn(),
}));

describe('MeterForm.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const pinia = createPinia();
    setActivePinia(pinia);
  });

  function setupStoreWithLocation() {
    const store = useTopologyStore();
    vi.spyOn(store, 'fetchAll').mockResolvedValue(undefined);
    store.locations = [
      {
        id: 10,
        addressLine1: '1042 Maple Street',
        addressLine2: null,
        city: 'Denver',
        state: 'CO',
        postalCode: '80203',
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      },
    ];
    store.trees = {
      10: {
        id: 10,
        addressLine1: '1042 Maple Street',
        addressLine2: null,
        city: 'Denver',
        state: 'CO',
        postalCode: '80203',
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
        servicePoints: [
          {
            id: 201,
            serviceLocationId: 10,
            identifier: 'Main Electrical Panel',
            notes: 'Exterior wall',
            createdAt: '2026-09-01T00:00:00Z',
            updatedAt: '2026-09-01T00:00:00Z',
            meters: [],
          },
        ],
      },
    };
    return store;
  }

  it('renders location, service point, serial number, and utility type selectors', () => {
    setupStoreWithLocation();
    const wrapper = mount(MeterForm);

    expect(wrapper.find('#meter-location').exists()).toBe(true);
    expect(wrapper.find('#meter-serial').exists()).toBe(true);
    expect(wrapper.text()).toContain('Electric');
    expect(wrapper.text()).toContain('Water');
    expect(wrapper.text()).toContain('Gas');
  });

  it('shows inline validation when required fields are missing on submit', async () => {
    setupStoreWithLocation();
    const wrapper = mount(MeterForm);

    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(wrapper.text()).toContain('Please select a service location.');
    expect(wrapper.text()).toContain('Meter serial number is required.');
    expect(metersApi.createMeterForServicePoint).not.toHaveBeenCalled();
  });

  it('creates meter under existing service point when selected', async () => {
    setupStoreWithLocation();

    const mockMeter = {
      id: 55,
      servicePointId: 201,
      serviceLocationId: 10,
      serialNumber: 'MTR-E-999',
      type: 'electric' as const,
      status: 'active' as const,
      installedOn: '2026-09-05',
      createdAt: '2026-09-05T00:00:00Z',
      updatedAt: '2026-09-05T00:00:00Z',
    };

    vi.mocked(metersApi.createMeterForServicePoint).mockResolvedValueOnce({
      data: mockMeter,
      status: 201,
      statusText: 'Created',
      headers: new Headers(),
      ok: true,
    });

    const wrapper = mount(MeterForm, {
      props: {
        initialLocationId: 10,
        initialServicePointId: 201,
      },
    });

    await wrapper.find('#meter-serial').setValue('MTR-E-999');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(metersApi.createMeterForServicePoint).toHaveBeenCalledWith(201, {
      serialNumber: 'MTR-E-999',
      type: 'electric',
      status: 'active',
      installedOn: expect.any(String),
    });

    expect(wrapper.emitted('success')).toBeTruthy();
    expect(wrapper.emitted('success')?.[0]).toEqual([mockMeter]);
  });

  it('creates new service point inline and then creates meter when in new point mode', async () => {
    setupStoreWithLocation();

    const mockNewPoint = {
      id: 305,
      serviceLocationId: 10,
      identifier: 'Unit 402 Subpanel',
      notes: 'Hallway closet',
      createdAt: '2026-09-05T00:00:00Z',
      updatedAt: '2026-09-05T00:00:00Z',
    };

    const mockMeter = {
      id: 77,
      servicePointId: 305,
      serviceLocationId: 10,
      serialNumber: 'MTR-W-500',
      type: 'water' as const,
      status: 'active' as const,
      installedOn: '2026-09-05',
      createdAt: '2026-09-05T00:00:00Z',
      updatedAt: '2026-09-05T00:00:00Z',
    };

    vi.mocked(servicePointsApi.createServicePointForLocation).mockResolvedValueOnce({
      data: mockNewPoint,
      status: 201,
      statusText: 'Created',
      headers: new Headers(),
      ok: true,
    });

    vi.mocked(metersApi.createMeterForServicePoint).mockResolvedValueOnce({
      data: mockMeter,
      status: 201,
      statusText: 'Created',
      headers: new Headers(),
      ok: true,
    });

    const wrapper = mount(MeterForm, {
      props: {
        initialLocationId: 10,
      },
    });

    // Switch to new service point mode
    const newPointBtn = wrapper
      .findAll('button')
      .find((b) => b.text().includes('+ New Service Point'));
    expect(newPointBtn).toBeDefined();
    await newPointBtn!.trigger('click');

    await wrapper.find('#new-point-identifier').setValue('Unit 402 Subpanel');
    await wrapper.find('#new-point-notes').setValue('Hallway closet');
    await wrapper.find('#meter-serial').setValue('MTR-W-500');

    // Select water type
    const waterBtn = wrapper.findAll('button').find((b) => b.text().includes('Water'));
    expect(waterBtn).toBeDefined();
    await waterBtn!.trigger('click');

    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(servicePointsApi.createServicePointForLocation).toHaveBeenCalledWith(10, {
      identifier: 'Unit 402 Subpanel',
      notes: 'Hallway closet',
    });

    expect(metersApi.createMeterForServicePoint).toHaveBeenCalledWith(305, {
      serialNumber: 'MTR-W-500',
      type: 'water',
      status: 'active',
      installedOn: expect.any(String),
    });

    expect(wrapper.emitted('success')).toBeTruthy();
  });
});
