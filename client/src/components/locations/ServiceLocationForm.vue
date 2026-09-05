<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick } from 'vue';
import { createServiceLocation, updateServiceLocation } from '../../api/serviceLocations.js';
import type { CreateServiceLocationInput, ServiceLocation } from '../../api/types.js';

const props = withDefaults(
  defineProps<{
    locationId?: number | null;
    initialData?: Partial<CreateServiceLocationInput> | null;
    compact?: boolean;
    title?: string;
    subtitle?: string;
    submitButtonText?: string;
  }>(),
  {
    locationId: null,
    initialData: null,
    compact: false,
    title: 'Add New Service Location',
    subtitle: 'Register a new physical facility or customer premise address.',
    submitButtonText: '',
  }
);

const emit = defineEmits<{
  (e: 'success', location: ServiceLocation): void;
  (e: 'cancel'): void;
}>();

// Form Fields
const form = reactive<CreateServiceLocationInput>({
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: '',
});

function initForm() {
  if (props.initialData) {
    form.addressLine1 = props.initialData.addressLine1 ?? '';
    form.addressLine2 = props.initialData.addressLine2 ?? '';
    form.city = props.initialData.city ?? '';
    form.state = props.initialData.state ?? '';
    form.postalCode = props.initialData.postalCode ?? '';
  } else {
    form.addressLine1 = '';
    form.addressLine2 = '';
    form.city = '';
    form.state = '';
    form.postalCode = '';
  }
}

watch(
  () => props.initialData,
  () => {
    initForm();
  },
  { immediate: true, deep: true }
);

// Field Touched State
const touched = reactive<Record<keyof CreateServiceLocationInput, boolean>>({
  addressLine1: false,
  addressLine2: false,
  city: false,
  state: false,
  postalCode: false,
});

// Field-specific validation errors
const errors = reactive<Record<keyof CreateServiceLocationInput, string | null>>({
  addressLine1: null,
  addressLine2: null,
  city: null,
  state: null,
  postalCode: null,
});

const isSubmitting = ref(false);
const generalError = ref<string | null>(null);

// Validation Rules
function validateAddressLine1(val: string): string | null {
  const trimmed = val.trim();
  if (!trimmed) {
    return 'Street address is required.';
  }
  if (trimmed.length < 3) {
    return 'Street address must be at least 3 characters.';
  }
  return null;
}

function validateCity(val: string): string | null {
  const trimmed = val.trim();
  if (!trimmed) {
    return 'City is required.';
  }
  return null;
}

function validateState(val: string): string | null {
  const trimmed = val.trim().toUpperCase();
  if (!trimmed) {
    return 'State is required (e.g. CO, CA, NY).';
  }
  if (!/^[A-Z]{2}$/.test(trimmed)) {
    return 'State must be exactly 2 uppercase letters.';
  }
  return null;
}

function validatePostalCode(val: string): string | null {
  const trimmed = val.trim();
  if (!trimmed) {
    return 'Postal code is required.';
  }
  if (!/^[0-9]{5}(-[0-9]{4})?$/.test(trimmed)) {
    return 'Postal code must be 5 digits (e.g. 80202) or ZIP+4 (e.g. 80202-1234).';
  }
  return null;
}

// Live Validation on blur or change
function handleBlur(field: keyof CreateServiceLocationInput) {
  touched[field] = true;
  runFieldValidation(field);
}

function handleInput(field: keyof CreateServiceLocationInput) {
  if (field === 'state') {
    form.state = form.state.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
  }
  if (field === 'postalCode') {
    form.postalCode = form.postalCode.replace(/[^0-9-]/g, '').slice(0, 10);
  }

  if (touched[field]) {
    runFieldValidation(field);
  }
}

function runFieldValidation(field: keyof CreateServiceLocationInput): boolean {
  switch (field) {
    case 'addressLine1':
      errors.addressLine1 = validateAddressLine1(form.addressLine1);
      return !errors.addressLine1;
    case 'city':
      errors.city = validateCity(form.city);
      return !errors.city;
    case 'state':
      errors.state = validateState(form.state);
      return !errors.state;
    case 'postalCode':
      errors.postalCode = validatePostalCode(form.postalCode);
      return !errors.postalCode;
    default:
      return true;
  }
}

function validateAll(): boolean {
  touched.addressLine1 = true;
  touched.city = true;
  touched.state = true;
  touched.postalCode = true;

  const v1 = runFieldValidation('addressLine1');
  const v2 = runFieldValidation('city');
  const v3 = runFieldValidation('state');
  const v4 = runFieldValidation('postalCode');

  return v1 && v2 && v3 && v4;
}

const isFormValid = computed(() => {
  return (
    !validateAddressLine1(form.addressLine1) &&
    !validateCity(form.city) &&
    !validateState(form.state) &&
    !validatePostalCode(form.postalCode)
  );
});

// Reset Form
function resetForm() {
  initForm();
  touched.addressLine1 = false;
  touched.addressLine2 = false;
  touched.city = false;
  touched.state = false;
  touched.postalCode = false;

  errors.addressLine1 = null;
  errors.addressLine2 = null;
  errors.city = null;
  errors.state = null;
  errors.postalCode = null;

  generalError.value = null;
}

// Submit Form
async function handleSubmit() {
  generalError.value = null;

  if (!validateAll()) {
    // Focus first invalid field
    await nextTick();
    const firstInvalid = document.querySelector<HTMLInputElement>('[data-invalid="true"]');
    if (firstInvalid) {
      firstInvalid.focus();
    }
    return;
  }

  isSubmitting.value = true;

  try {
    const payload: CreateServiceLocationInput = {
      addressLine1: form.addressLine1.trim(),
      addressLine2: form.addressLine2?.trim() || null,
      city: form.city.trim(),
      state: form.state.trim().toUpperCase(),
      postalCode: form.postalCode.trim(),
    };

    const isEdit = !!props.locationId;
    const res = isEdit
      ? await updateServiceLocation(props.locationId!, payload)
      : await createServiceLocation(payload);

    if (res.ok) {
      const location = res.data;
      resetForm();
      emit('success', location);
    } else {
      // Check for backend Zod issues
      const backendData = res.data as any;
      if (backendData?.issues && Array.isArray(backendData.issues)) {
        for (const issue of backendData.issues) {
          const field = issue.field as keyof CreateServiceLocationInput;
          if (field in errors) {
            errors[field] = issue.message;
            touched[field] = true;
          }
        }
        generalError.value = 'Please review and resolve the highlighted errors below.';
      } else {
        generalError.value = backendData?.message || `Failed to ${isEdit ? 'update' : 'create'} location (${res.status})`;
      }
    }
  } catch (err: unknown) {
    generalError.value = err instanceof Error ? err.message : 'A network error occurred';
  } finally {
    isSubmitting.value = false;
  }
}

function handleCancel() {
  resetForm();
  emit('cancel');
}

defineExpose({
  resetForm,
  isFormValid,
});
</script>

<template>
  <div :class="['bg-white rounded-xl border border-gray-200 shadow-sm transition-all', compact ? 'p-5' : 'p-6 sm:p-8']">
    <!-- Header -->
    <div class="flex items-start justify-between pb-5 border-b border-gray-100">
      <div>
        <h3 class="text-lg font-bold text-gray-900 tracking-tight flex items-center gap-2">
          <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </span>
          {{ title }}
        </h3>
        <p class="text-xs text-gray-500 mt-1">{{ subtitle }}</p>
      </div>

      <button
        type="button"
        @click="handleCancel"
        class="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
        title="Close form"
      >
        <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- General Error Banner -->
    <div
      v-if="generalError"
      class="mt-4 p-3.5 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-700"
    >
      <svg class="h-4 w-4 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <div>
        <p class="font-medium">{{ generalError }}</p>
      </div>
    </div>

    <!-- Form -->
    <form @submit.prevent="handleSubmit" novalidate class="mt-5 space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-12 gap-3">
      <!-- Address Line 1 -->
      <div class="sm:col-span-7">
        <label for="loc-address1" class="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
          Street Address <span class="text-red-500">*</span>
        </label>
        <div class="relative rounded-md shadow-xs">
          <input
            id="loc-address1"
            v-model="form.addressLine1"
            type="text"
            placeholder="e.g. 1042 Market Street"
            :data-invalid="touched.addressLine1 && !!errors.addressLine1"
            @blur="handleBlur('addressLine1')"
            @input="handleInput('addressLine1')"
            :class="[
              'block w-full rounded-lg border py-2 pl-3 pr-10 text-sm transition',
              touched.addressLine1 && errors.addressLine1
                ? 'border-red-300 text-red-900 placeholder-red-300 focus:border-red-500 focus:outline-hidden focus:ring-2 focus:ring-red-500/20 bg-red-50/20'
                : touched.addressLine1 && !errors.addressLine1
                  ? 'border-emerald-300 focus:border-emerald-500 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20'
                  : 'border-gray-300 focus:border-indigo-600 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20',
            ]"
          />
          <!-- Status Icon Indicator -->
          <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
            <svg
              v-if="touched.addressLine1 && errors.addressLine1"
              class="h-4 w-4 text-red-500"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" />
            </svg>
            <svg
              v-else-if="touched.addressLine1 && !errors.addressLine1"
              class="h-4 w-4 text-emerald-500"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
            </svg>
          </div>
        </div>
        <!-- Inline Error Message -->
        <p v-if="touched.addressLine1 && errors.addressLine1" class="mt-1 text-xs text-red-600 flex items-center gap-1 font-medium">
          <svg class="h-3.5 w-3.5 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {{ errors.addressLine1 }}
        </p>
      </div>

      <!-- Address Line 2 -->
      <div class="sm:col-span-5">
        <div class="flex items-center justify-between mb-1">
          <label for="loc-address2" class="block text-xs font-semibold text-gray-700 uppercase tracking-wider">
            Suite / Unit / Apt
          </label>
          <span class="text-[11px] text-gray-400">Optional</span>
        </div>
        <input
          id="loc-address2"
          v-model="form.addressLine2"
          type="text"
          placeholder="e.g. Suite 400, Apt 3B, Bldg C"
          class="block w-full rounded-lg border border-gray-300 py-2 px-3 text-sm focus:border-indigo-600 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 transition"
        />
      </div>
      </div>

      <!-- City, State, Postal Code in Grid -->
      <div class="grid grid-cols-1 sm:grid-cols-12 gap-3">
        <!-- City -->
        <div class="sm:col-span-6">
          <label for="loc-city" class="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
            City <span class="text-red-500">*</span>
          </label>
          <div class="relative rounded-md shadow-xs">
            <input
              id="loc-city"
              v-model="form.city"
              type="text"
              placeholder="e.g. Denver"
              :data-invalid="touched.city && !!errors.city"
              @blur="handleBlur('city')"
              @input="handleInput('city')"
              :class="[
                'block w-full rounded-lg border py-2 pl-3 pr-10 text-sm transition',
                touched.city && errors.city
                  ? 'border-red-300 text-red-900 placeholder-red-300 focus:border-red-500 focus:outline-hidden focus:ring-2 focus:ring-red-500/20 bg-red-50/20'
                  : touched.city && !errors.city
                    ? 'border-emerald-300 focus:border-emerald-500 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20'
                    : 'border-gray-300 focus:border-indigo-600 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20',
              ]"
            />
            <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
              <svg
                v-if="touched.city && errors.city"
                class="h-4 w-4 text-red-500"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" />
              </svg>
              <svg
                v-else-if="touched.city && !errors.city"
                class="h-4 w-4 text-emerald-500"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
              </svg>
            </div>
          </div>
          <p v-if="touched.city && errors.city" class="mt-1 text-xs text-red-600 font-medium">
            {{ errors.city }}
          </p>
        </div>

        <!-- State -->
        <div class="sm:col-span-2">
          <label for="loc-state" class="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
            State <span class="text-red-500">*</span>
          </label>
          <div class="relative rounded-md shadow-xs">
            <input
              id="loc-state"
              v-model="form.state"
              type="text"
              maxlength="2"
              placeholder="CO"
              :data-invalid="touched.state && !!errors.state"
              @blur="handleBlur('state')"
              @input="handleInput('state')"
              :class="[
                'block w-full rounded-lg border py-2 pl-3 pr-8 text-sm font-mono uppercase transition text-center sm:text-left',
                touched.state && errors.state
                  ? 'border-red-300 text-red-900 placeholder-red-300 focus:border-red-500 focus:outline-hidden focus:ring-2 focus:ring-red-500/20 bg-red-50/20'
                  : touched.state && !errors.state
                    ? 'border-emerald-300 focus:border-emerald-500 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20'
                    : 'border-gray-300 focus:border-indigo-600 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20',
              ]"
            />
            <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5">
              <svg
                v-if="touched.state && errors.state"
                class="h-4 w-4 text-red-500"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" />
              </svg>
              <svg
                v-else-if="touched.state && !errors.state"
                class="h-4 w-4 text-emerald-500"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
              </svg>
            </div>
          </div>
          <p v-if="touched.state && errors.state" class="mt-1 text-xs text-red-600 font-medium">
            {{ errors.state }}
          </p>
        </div>

        <!-- Postal Code -->
        <div class="sm:col-span-4">
          <label for="loc-postal" class="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
            Postal Code <span class="text-red-500">*</span>
          </label>
          <div class="relative rounded-md shadow-xs">
            <input
              id="loc-postal"
              v-model="form.postalCode"
              type="text"
              maxlength="10"
              placeholder="80202"
              :data-invalid="touched.postalCode && !!errors.postalCode"
              @blur="handleBlur('postalCode')"
              @input="handleInput('postalCode')"
              :class="[
                'block w-full rounded-lg border py-2 pl-3 pr-10 text-sm font-mono transition',
                touched.postalCode && errors.postalCode
                  ? 'border-red-300 text-red-900 placeholder-red-300 focus:border-red-500 focus:outline-hidden focus:ring-2 focus:ring-red-500/20 bg-red-50/20'
                  : touched.postalCode && !errors.postalCode
                    ? 'border-emerald-300 focus:border-emerald-500 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20'
                    : 'border-gray-300 focus:border-indigo-600 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20',
              ]"
            />
            <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
              <svg
                v-if="touched.postalCode && errors.postalCode"
                class="h-4 w-4 text-red-500"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" />
              </svg>
              <svg
                v-else-if="touched.postalCode && !errors.postalCode"
                class="h-4 w-4 text-emerald-500"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
              </svg>
            </div>
          </div>
          <p v-if="touched.postalCode && errors.postalCode" class="mt-1 text-xs text-red-600 font-medium">
            {{ errors.postalCode }}
          </p>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="pt-4 border-t border-gray-100 flex items-center justify-end gap-3">
        <button
          type="button"
          @click="handleCancel"
          :disabled="isSubmitting"
          class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-700 shadow-xs hover:bg-gray-50 focus:outline-hidden transition disabled:opacity-50"
        >
          Cancel
        </button>

        <button
          type="submit"
          :disabled="isSubmitting"
          class="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-500 focus:outline-hidden focus:ring-2 focus:ring-indigo-600/30 transition disabled:opacity-50"
        >
          <svg
            v-if="isSubmitting"
            class="animate-spin -ml-0.5 h-3.5 w-3.5 text-white"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span>{{
            isSubmitting
              ? (props.locationId ? 'Saving Changes...' : 'Saving Location...')
              : (props.submitButtonText || (props.locationId ? 'Save Changes' : 'Save Location'))
          }}</span>
        </button>
      </div>
    </form>
  </div>
</template>
