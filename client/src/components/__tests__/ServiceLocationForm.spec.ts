import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import ServiceLocationForm from '../locations/ServiceLocationForm.vue';
import * as serviceLocationsApi from '../../api/serviceLocations.js';

vi.mock('../../api/serviceLocations.js', () => ({
  createServiceLocation: vi.fn(),
}));

describe('ServiceLocationForm.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all address inputs and action buttons', () => {
    const wrapper = mount(ServiceLocationForm);

    expect(wrapper.find('#loc-address1').exists()).toBe(true);
    expect(wrapper.find('#loc-address2').exists()).toBe(true);
    expect(wrapper.find('#loc-city').exists()).toBe(true);
    expect(wrapper.find('#loc-state').exists()).toBe(true);
    expect(wrapper.find('#loc-postal').exists()).toBe(true);
    expect(wrapper.find('button[type="submit"]').text()).toContain('Save Location');
  });

  it('shows inline validation error when street address is blurred empty', async () => {
    const wrapper = mount(ServiceLocationForm);
    const addressInput = wrapper.find('#loc-address1');

    await addressInput.trigger('blur');

    expect(wrapper.text()).toContain('Street address is required.');
    expect(addressInput.attributes('data-invalid')).toBe('true');
  });

  it('validates state must be 2 uppercase letters and auto-uppercases input', async () => {
    const wrapper = mount(ServiceLocationForm);
    const stateInput = wrapper.find('#loc-state');

    await stateInput.setValue('co');
    await stateInput.trigger('input');
    expect((stateInput.element as HTMLInputElement).value).toBe('CO');

    await stateInput.setValue('C');
    await stateInput.trigger('blur');
    expect(wrapper.text()).toContain('State must be exactly 2 uppercase letters.');
  });

  it('shows inline validation error for invalid postal code format', async () => {
    const wrapper = mount(ServiceLocationForm);
    const postalInput = wrapper.find('#loc-postal');

    await postalInput.setValue('802');
    await postalInput.trigger('blur');
    expect(wrapper.text()).toContain('Postal code must be 5 digits (e.g. 80202) or ZIP+4');

    await postalInput.setValue('80202');
    await postalInput.trigger('blur');
    expect(wrapper.text()).not.toContain('Postal code must be 5 digits');
  });

  it('prevents submission when fields are invalid', async () => {
    const wrapper = mount(ServiceLocationForm);

    await wrapper.find('form').trigger('submit.prevent');

    expect(serviceLocationsApi.createServiceLocation).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Street address is required.');
    expect(wrapper.text()).toContain('City is required.');
    expect(wrapper.text()).toContain('State is required');
    expect(wrapper.text()).toContain('Postal code is required.');
  });

  it('submits valid form data and emits success event', async () => {
    const mockCreated = {
      id: 99,
      addressLine1: '742 Evergreen Terrace',
      addressLine2: 'Apt 1',
      city: 'Springfield',
      state: 'IL',
      postalCode: '62704',
      createdAt: '2026-09-05T00:00:00Z',
      updatedAt: '2026-09-05T00:00:00Z',
    };

    vi.mocked(serviceLocationsApi.createServiceLocation).mockResolvedValueOnce({
      data: mockCreated,
      status: 201,
      statusText: 'Created',
      headers: new Headers(),
      ok: true,
    });

    const wrapper = mount(ServiceLocationForm);

    await wrapper.find('#loc-address1').setValue('742 Evergreen Terrace');
    await wrapper.find('#loc-address2').setValue('Apt 1');
    await wrapper.find('#loc-city').setValue('Springfield');
    await wrapper.find('#loc-state').setValue('IL');
    await wrapper.find('#loc-postal').setValue('62704');

    await wrapper.find('form').trigger('submit.prevent');

    expect(serviceLocationsApi.createServiceLocation).toHaveBeenCalledWith({
      addressLine1: '742 Evergreen Terrace',
      addressLine2: 'Apt 1',
      city: 'Springfield',
      state: 'IL',
      postalCode: '62704',
    });

    expect(wrapper.emitted('success')).toBeTruthy();
    expect(wrapper.emitted('success')?.[0]).toEqual([mockCreated]);
  });

  it('maps backend Zod issues inline when submission returns 400', async () => {
    vi.mocked(serviceLocationsApi.createServiceLocation).mockResolvedValueOnce({
      data: {
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validation error',
        issues: [
          {
            field: 'state',
            message: 'State must consist of 2 uppercase letters',
            code: 'invalid_string',
          },
        ],
      } as any,
      status: 400,
      statusText: 'Bad Request',
      headers: new Headers(),
      ok: false,
    });

    const wrapper = mount(ServiceLocationForm);

    await wrapper.find('#loc-address1').setValue('1042 Market St');
    await wrapper.find('#loc-city').setValue('Denver');
    await wrapper.find('#loc-state').setValue('CO');
    await wrapper.find('#loc-postal').setValue('80202');

    await wrapper.find('form').trigger('submit.prevent');

    expect(wrapper.text()).toContain('State must consist of 2 uppercase letters');
    expect(wrapper.text()).toContain('Please review and resolve the highlighted errors below.');
  });

  it('emits cancel event when cancel button is clicked', async () => {
    const wrapper = mount(ServiceLocationForm);

    await wrapper.find('button[title="Close form"]').trigger('click');

    expect(wrapper.emitted('cancel')).toBeTruthy();
  });
});
