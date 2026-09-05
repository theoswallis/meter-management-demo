import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import AddReadingForm from '../meters/AddReadingForm.vue';
import * as meterReadingsApi from '../../api/meterReadings.js';

vi.mock('../../api/meterReadings.js', () => ({
  createMeterReading: vi.fn(),
}));

describe('AddReadingForm.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders reading value and timestamp inputs with unit badge', () => {
    const wrapper = mount(AddReadingForm, {
      props: {
        meterId: 4,
        unit: 'kWh',
        latestReadingValue: 1200.5,
      },
    });

    expect(wrapper.find('#reading-val').exists()).toBe(true);
    expect(wrapper.find('#reading-time').exists()).toBe(true);
    expect(wrapper.text()).toContain('1200.5 kWh');
    expect(wrapper.text()).toContain('kWh');
  });

  it('shows inline validation when required fields are missing', async () => {
    const wrapper = mount(AddReadingForm, {
      props: {
        meterId: 4,
      },
    });

    // Clear reading value and submit
    await wrapper.find('#reading-val').setValue('');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(wrapper.text()).toContain('Reading value is required.');
    expect(meterReadingsApi.createMeterReading).not.toHaveBeenCalled();
  });

  it('shows rollover/reset warning when entered value is less than previous reading', async () => {
    const wrapper = mount(AddReadingForm, {
      props: {
        meterId: 7,
        unit: 'kWh',
        latestReadingValue: 99995.8,
      },
    });

    await wrapper.find('#reading-val').setValue('8.4');
    expect(wrapper.text()).toContain('Entered value (8.4) is lower than previous reading');
    expect(wrapper.text()).toContain('meter rollover or reset');
  });

  it('submits valid reading and emits success event', async () => {
    const mockCreated = {
      id: 999,
      meterId: 4,
      readAt: '2026-09-05T08:00:00.000Z',
      readingValue: '1250.000',
      createdAt: '2026-09-05T08:00:00.000Z',
    };

    vi.mocked(meterReadingsApi.createMeterReading).mockResolvedValueOnce({
      data: mockCreated,
      status: 201,
      statusText: 'Created',
      headers: new Headers(),
      ok: true,
    });

    const wrapper = mount(AddReadingForm, {
      props: {
        meterId: 4,
        unit: 'kWh',
      },
    });

    await wrapper.find('#reading-val').setValue('1250');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(meterReadingsApi.createMeterReading).toHaveBeenCalledWith(4, {
      readingValue: 1250,
      readAt: expect.any(String),
    });

    expect(wrapper.emitted('success')).toBeTruthy();
    expect(wrapper.emitted('success')?.[0]).toEqual([mockCreated]);
  });

  it('emits cancel event when cancel button is clicked', async () => {
    const wrapper = mount(AddReadingForm, {
      props: {
        meterId: 4,
      },
    });

    await wrapper.find('button[title="Close form"]').trigger('click');
    expect(wrapper.emitted('cancel')).toBeTruthy();
  });
});
