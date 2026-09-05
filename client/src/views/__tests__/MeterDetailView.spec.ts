import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import MeterDetailView from '../MeterDetailView.vue';
import * as metersApi from '../../api/meters.js';
import * as meterReadingsApi from '../../api/meterReadings.js';
import * as serviceLocationsApi from '../../api/serviceLocations.js';
import * as servicePointsApi from '../../api/servicePoints.js';

vi.mock('vue-router', () => ({
  useRoute: () => ({
    params: { id: '4' },
    query: {},
  }),
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock('../../api/meters.js', () => ({
  getMeterById: vi.fn(),
}));

vi.mock('../../api/meterReadings.js', () => ({
  getMeterReadings: vi.fn(),
  getMeterUsage: vi.fn(),
  createMeterReading: vi.fn(),
}));

vi.mock('../../api/serviceLocations.js', () => ({
  getServiceLocationById: vi.fn(),
}));

vi.mock('../../api/servicePoints.js', () => ({
  getServicePointById: vi.fn(),
}));

describe('MeterDetailView.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const pinia = createPinia();
    setActivePinia(pinia);
  });

  function setupMocks() {
    vi.mocked(metersApi.getMeterById).mockResolvedValue({
      data: {
        id: 4,
        serviceLocationId: 1,
        servicePointId: 2,
        serialNumber: 'MTR-WAT-BURST-404',
        type: 'water',
        status: 'active',
        installedOn: '2026-01-01',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      ok: true,
    });

    vi.mocked(serviceLocationsApi.getServiceLocationById).mockResolvedValue({
      data: {
        id: 1,
        addressLine1: '455 Spruce Court',
        addressLine2: null,
        city: 'Denver',
        state: 'CO',
        postalCode: '80210',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      ok: true,
    });

    vi.mocked(servicePointsApi.getServicePointById).mockResolvedValue({
      data: {
        id: 2,
        serviceLocationId: 1,
        identifier: 'Main Residence',
        notes: 'Water pipe leak',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      ok: true,
    });

    // Mock readings: baseline read, followed by a massive spike
    vi.mocked(meterReadingsApi.getMeterReadings).mockResolvedValue({
      data: {
        data: [
          {
            id: 102,
            meterId: 4,
            readAt: '2026-09-05T08:00:00Z',
            readingValue: '438.500',
            createdAt: '2026-09-05T08:00:00Z',
          },
          {
            id: 101,
            meterId: 4,
            readAt: '2026-09-04T08:00:00Z',
            readingValue: '410.000',
            createdAt: '2026-09-04T08:00:00Z',
          },
          {
            id: 100,
            meterId: 4,
            readAt: '2026-09-03T08:00:00Z',
            readingValue: '409.500',
            createdAt: '2026-09-03T08:00:00Z',
          },
        ],
        total: 3,
        limit: 25,
        offset: 0,
      },
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      ok: true,
    });

    // Mock usage view records
    vi.mocked(meterReadingsApi.getMeterUsage).mockResolvedValue({
      data: {
        data: [
          {
            id: 102,
            meterId: 4,
            readAt: '2026-09-05T08:00:00Z',
            readingValue: '438.500',
            previousReadingValue: '410.000',
            previousReadAt: '2026-09-04T08:00:00Z',
            usage: '28.500',
            timeElapsed: '1 day',
          },
          {
            id: 101,
            meterId: 4,
            readAt: '2026-09-04T08:00:00Z',
            readingValue: '410.000',
            previousReadingValue: '409.500',
            previousReadAt: '2026-09-03T08:00:00Z',
            usage: '0.500',
            timeElapsed: '1 day',
          },
          {
            id: 100,
            meterId: 4,
            readAt: '2026-09-03T08:00:00Z',
            readingValue: '409.500',
            previousReadingValue: null,
            previousReadAt: null,
            usage: null,
            timeElapsed: null,
          },
        ],
        total: 3,
        limit: 100,
        offset: 0,
      },
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      ok: true,
    });
  }

  it('renders meter details, location header, and usage summary metrics', async () => {
    setupMocks();

    const wrapper = mount(MeterDetailView, {
      global: {
        stubs: {
          RouterLink: { template: '<a><slot /></a>' },
        },
      },
    });

    await flushPromises();

    expect(wrapper.text()).toContain('455 Spruce Court');
    expect(wrapper.text()).toContain('Main Residence');
    expect(wrapper.text()).toContain('MTR-WAT-BURST-404');
    expect(wrapper.text()).toContain('Water Meter');
    expect(wrapper.text()).toContain('438.5 gal');
  });

  it('visually indicates abnormal readings (consumption spikes)', async () => {
    setupMocks();

    const wrapper = mount(MeterDetailView, {
      global: {
        stubs: {
          RouterLink: { template: '<a><slot /></a>' },
        },
      },
    });

    await flushPromises();

    // Spike should be detected on reading #102 (+28.5 gal vs +0.5 baseline)
    expect(wrapper.text()).toContain('Spike');
    expect(wrapper.text()).toContain('+28.5');
  });

  it('toggles the inline Add Reading form', async () => {
    setupMocks();

    const wrapper = mount(MeterDetailView, {
      global: {
        stubs: {
          RouterLink: { template: '<a><slot /></a>' },
        },
      },
    });

    await flushPromises();

    expect(wrapper.findComponent({ name: 'AddReadingForm' }).exists()).toBe(false);

    const toggleBtn = wrapper.find('header button.bg-indigo-600, div button.bg-indigo-600');
    await toggleBtn.trigger('click');

    expect(wrapper.findComponent({ name: 'AddReadingForm' }).exists()).toBe(true);
  });
});
