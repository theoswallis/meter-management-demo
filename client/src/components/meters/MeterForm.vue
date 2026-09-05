<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, nextTick } from 'vue';
import { useTopologyStore } from '../../stores/topology.js';
import { createMeterForServicePoint } from '../../api/meters.js';
import { createServicePointForLocation } from '../../api/servicePoints.js';
import type { Meter, MeterType, MeterStatus, ServicePoint } from '../../api/types.js';

const props = withDefaults(
  defineProps<{
    initialLocationId?: number | null;
    initialServicePointId?: number | null;
    lockLocation?: boolean;
    compact?: boolean;
    title?: string;
    subtitle?: string;
  }>(),
  {
    initialLocationId: null,
    initialServicePointId: null,
    lockLocation: false,
    compact: false,
    title: 'Add New Meter',
    subtitle: 'Register a telemetry meter and associate it with a service point and location.',
  }
);

const emit = defineEmits<{
  (e: 'success', meter: Meter): void;
  (e: 'cancel'): void;
}>();

const topologyStore = useTopologyStore();

// Form Fields
const form = reactive({
  locationId: (props.initialLocationId ?? '') as number | '',
  servicePointMode: 'existing' as 'existing' | 'new',
  existingServicePointId: (props.initialServicePointId ?? '') as number | '',
  newPointIdentifier: '',
  newPointNotes: '',
  serialNumber: '',
  type: 'electric' as MeterType,
  status: 'active' as MeterStatus,
  installedOn: new Date().toISOString().split('T')[0],
});

// Field Touched State
const touched = reactive({
  locationId: false,
  existingServicePointId: false,
  newPointIdentifier: false,
  serialNumber: false,
  installedOn: false,
});

// Field-specific validation errors
const errors = reactive({
  locationId: null as string | null,
  existingServicePointId: null as string | null,
  newPointIdentifier: null as string | null,
  serialNumber: null as string | null,
  installedOn: null as string | null,
});

const isSubmitting = ref(false);
const generalError = ref<string | null>(null);

onMounted(async () => {
  if (topologyStore.locations.length === 0) {
    await topologyStore.fetchAll();
  }
  syncServicePointsForLocation();
});

// Watch locationId to adapt service point mode and available options
const availablePoints = computed<ServicePoint[]>(() => {
  if (!form.locationId) return [];
  const tree = topologyStore.trees[form.locationId];
  return tree?.servicePoints || [];
});

function syncServicePointsForLocation() {
  if (!form.locationId) {
    form.existingServicePointId = '';
    return;
  }

  const points = availablePoints.value;
  if (points.length === 0) {
    form.servicePointMode = 'new';
    form.existingServicePointId = '';
  } else {
    // If current existingServicePointId is not in points, reset or pick first
    const exists = points.some((p) => p.id === form.existingServicePointId);
    if (!exists) {
      form.existingServicePointId = points[0]?.id ?? '';
    }
  }
}

watch(
  () => form.locationId,
  () => {
    syncServicePointsForLocation();
    if (touched.locationId) {
      runFieldValidation('locationId');
    }
  }
);

watch(
  () => props.initialLocationId,
  (newVal) => {
    if (newVal !== undefined && newVal !== null) {
      form.locationId = newVal;
      syncServicePointsForLocation();
    }
  }
);

watch(
  () => props.initialServicePointId,
  (newVal) => {
    if (newVal !== undefined && newVal !== null) {
      form.existingServicePointId = newVal;
      form.servicePointMode = 'existing';
    }
  }
);

// Validation Rules
function validateLocationId(val: number | ''): string | null {
  if (!val) {
    return 'Please select a service location.';
  }
  return null;
}

function validateExistingServicePointId(val: number | ''): string | null {
  if (form.servicePointMode === 'existing' && !val) {
    return 'Please select an existing service point, or switch to create a new one.';
  }
  return null;
}

function validateNewPointIdentifier(val: string): string | null {
  if (form.servicePointMode === 'new') {
    const trimmed = val.trim();
    if (!trimmed) {
      return 'Service point identifier is required (e.g. Unit 101, Main Panel).';
    }
    if (trimmed.length < 2) {
      return 'Identifier must be at least 2 characters.';
    }
  }
  return null;
}

function validateSerialNumber(val: string): string | null {
  const trimmed = val.trim();
  if (!trimmed) {
    return 'Meter serial number is required.';
  }
  if (trimmed.length < 2) {
    return 'Serial number must be at least 2 characters.';
  }
  return null;
}

function validateInstalledOn(val?: string | null): string | null {
  if (!val) return null; // Optional in API
  if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    return 'Date must be in YYYY-MM-DD format.';
  }
  return null;
}

// Live Validation Handler
function handleBlur(field: keyof typeof touched) {
  touched[field] = true;
  runFieldValidation(field);
}

function handleInput(field: keyof typeof touched) {
  if (touched[field]) {
    runFieldValidation(field);
  }
}

function runFieldValidation(field: keyof typeof touched): boolean {
  switch (field) {
    case 'locationId':
      errors.locationId = validateLocationId(form.locationId);
      return !errors.locationId;
    case 'existingServicePointId':
      errors.existingServicePointId = validateExistingServicePointId(form.existingServicePointId);
      return !errors.existingServicePointId;
    case 'newPointIdentifier':
      errors.newPointIdentifier = validateNewPointIdentifier(form.newPointIdentifier);
      return !errors.newPointIdentifier;
    case 'serialNumber':
      errors.serialNumber = validateSerialNumber(form.serialNumber);
      return !errors.serialNumber;
    case 'installedOn':
      errors.installedOn = validateInstalledOn(form.installedOn);
      return !errors.installedOn;
    default:
      return true;
  }
}

function validateAll(): boolean {
  touched.locationId = true;
  touched.serialNumber = true;
  touched.installedOn = true;

  if (form.servicePointMode === 'existing') {
    touched.existingServicePointId = true;
    touched.newPointIdentifier = false;
  } else {
    touched.newPointIdentifier = true;
    touched.existingServicePointId = false;
  }

  const vLoc = runFieldValidation('locationId');
  const vPoint =
    form.servicePointMode === 'existing'
      ? runFieldValidation('existingServicePointId')
      : runFieldValidation('newPointIdentifier');
  const vSerial = runFieldValidation('serialNumber');
  const vDate = runFieldValidation('installedOn');

  return vLoc && vPoint && vSerial && vDate;
}

function resetForm() {
  form.locationId = (props.initialLocationId ?? '') as number | '';
  form.servicePointMode = 'existing';
  form.existingServicePointId = (props.initialServicePointId ?? '') as number | '';
  form.newPointIdentifier = '';
  form.newPointNotes = '';
  form.serialNumber = '';
  form.type = 'electric';
  form.status = 'active';
  form.installedOn = new Date().toISOString().split('T')[0];

  touched.locationId = false;
  touched.existingServicePointId = false;
  touched.newPointIdentifier = false;
  touched.serialNumber = false;
  touched.installedOn = false;

  errors.locationId = null;
  errors.existingServicePointId = null;
  errors.newPointIdentifier = null;
  errors.serialNumber = null;
  errors.installedOn = null;

  generalError.value = null;
}

// Form Submission
async function handleSubmit() {
  generalError.value = null;

  if (!validateAll()) {
    await nextTick();
    const firstInvalid = document.querySelector<HTMLElement>('[data-invalid="true"]');
    if (firstInvalid) {
      firstInvalid.focus();
    }
    return;
  }

  isSubmitting.value = true;

  try {
    let resolvedPointId: number;

    // 1. Resolve or Create Service Point
    if (form.servicePointMode === 'new') {
      const pointRes = await createServicePointForLocation(form.locationId as number, {
        identifier: form.newPointIdentifier.trim(),
        notes: form.newPointNotes.trim() || null,
      });

      if (!pointRes.ok) {
        generalError.value = (pointRes.data as any)?.message || 'Failed to create service point';
        isSubmitting.value = false;
        return;
      }
      resolvedPointId = pointRes.data.id;
    } else {
      resolvedPointId = Number(form.existingServicePointId);
    }

    // 2. Create Meter under the resolved Service Point
    const meterRes = await createMeterForServicePoint(resolvedPointId, {
      serialNumber: form.serialNumber.trim(),
      type: form.type,
      status: form.status,
      installedOn: form.installedOn || undefined,
    });

    if (meterRes.ok) {
      const createdMeter = meterRes.data;
      await topologyStore.fetchAll();
      resetForm();
      emit('success', createdMeter);
    } else {
      const backendData = meterRes.data as any;
      if (backendData?.issues && Array.isArray(backendData.issues)) {
        for (const issue of backendData.issues) {
          const field = issue.field as keyof typeof errors;
          if (field in errors) {
            errors[field] = issue.message;
            touched[field] = true;
          }
        }
        generalError.value = 'Please resolve the highlighted validation errors.';
      } else {
        generalError.value = backendData?.message || `Failed to create meter (${meterRes.status})`;
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
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
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
    <form @submit.prevent="handleSubmit" novalidate class="mt-5 space-y-5">
      <!-- Section 1: Location & Service Point -->
      <div class="space-y-4">
        <div class="text-xs font-semibold uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
          <span class="flex h-5 w-5 items-center justify-center rounded bg-indigo-50 text-indigo-700 text-[10px] font-bold">1</span>
          Location & Service Point Assignment
        </div>

        <!-- Service Location Selection -->
        <div>
          <label for="meter-location" class="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
            Service Location <span class="text-red-500">*</span>
          </label>
          <div class="relative rounded-md shadow-xs">
            <select
              id="meter-location"
              v-model="form.locationId"
              :disabled="lockLocation"
              :data-invalid="touched.locationId && !!errors.locationId"
              @blur="handleBlur('locationId')"
              :class="[
                'block w-full rounded-lg border py-2 pl-3 pr-10 text-sm transition',
                lockLocation
                  ? 'bg-gray-100 text-gray-700 border-gray-200 cursor-not-allowed'
                  : touched.locationId && errors.locationId
                    ? 'border-red-300 text-red-900 focus:border-red-500 focus:ring-red-500/20 bg-red-50/20'
                    : touched.locationId && !errors.locationId
                      ? 'border-emerald-300 focus:border-emerald-500 focus:ring-emerald-500/20 bg-white'
                      : 'border-gray-300 focus:border-indigo-600 focus:ring-indigo-500/20 bg-white',
              ]"
            >
              <option value="" disabled>-- Select a registered service location --</option>
              <option
                v-for="loc in topologyStore.locations"
                :key="loc.id"
                :value="loc.id"
              >
                #{{ loc.id }} &bull; {{ loc.addressLine1 }}, {{ loc.city }}, {{ loc.state }} {{ loc.postalCode }}
              </option>
            </select>
          </div>
          <p v-if="lockLocation" class="mt-1 text-[11px] text-gray-500 flex items-center gap-1 font-medium">
            <svg class="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Pre-assigned to current service location.
          </p>
          <p v-else-if="touched.locationId && errors.locationId" class="mt-1 text-xs text-red-600 flex items-center gap-1 font-medium">
            {{ errors.locationId }}
          </p>
        </div>

        <!-- Service Point Options (Existing vs New) -->
        <div v-if="form.locationId" class="rounded-xl border border-gray-200 bg-gray-50/60 p-3.5">
          <div class="flex items-center justify-between mb-2">
            <label class="block text-xs font-semibold text-gray-700 uppercase tracking-wider">
              Service Point (Socket / Panel) <span class="text-red-500">*</span>
            </label>

            <!-- Toggle Buttons -->
            <div class="inline-flex rounded-lg bg-gray-200/80 p-0.5 text-xs font-medium">
              <button
                type="button"
                :disabled="availablePoints.length === 0"
                @click="form.servicePointMode = 'existing'"
                :class="[
                  'px-2.5 py-1 rounded-md transition',
                  form.servicePointMode === 'existing'
                    ? 'bg-white text-gray-900 shadow-2xs font-semibold'
                    : availablePoints.length === 0
                      ? 'text-gray-400 cursor-not-allowed'
                      : 'text-gray-600 hover:text-gray-900',
                ]"
              >
                Select Existing ({{ availablePoints.length }})
              </button>
              <button
                type="button"
                @click="form.servicePointMode = 'new'"
                :class="[
                  'px-2.5 py-1 rounded-md transition',
                  form.servicePointMode === 'new'
                    ? 'bg-white text-indigo-700 shadow-2xs font-semibold'
                    : 'text-gray-600 hover:text-gray-900',
                ]"
              >
                + New Service Point
              </button>
            </div>
          </div>

          <!-- Existing Service Point Dropdown -->
          <div v-if="form.servicePointMode === 'existing'">
            <div class="relative rounded-md shadow-xs">
              <select
                id="meter-point-select"
                v-model="form.existingServicePointId"
                :data-invalid="touched.existingServicePointId && !!errors.existingServicePointId"
                @blur="handleBlur('existingServicePointId')"
                :class="[
                  'block w-full rounded-lg border py-2 pl-3 pr-10 text-sm transition bg-white',
                  touched.existingServicePointId && errors.existingServicePointId
                    ? 'border-red-300 text-red-900 focus:border-red-500 focus:ring-red-500/20 bg-red-50/20'
                    : 'border-gray-300 focus:border-indigo-600 focus:ring-indigo-500/20',
                ]"
              >
                <option value="" disabled>-- Select existing service point --</option>
                <option
                  v-for="pt in availablePoints"
                  :key="pt.id"
                  :value="pt.id"
                >
                  {{ pt.identifier }} {{ pt.notes ? `(${pt.notes})` : '' }} &bull; ID #{{ pt.id }}
                </option>
              </select>
            </div>
            <p v-if="touched.existingServicePointId && errors.existingServicePointId" class="mt-1 text-xs text-red-600 font-medium">
              {{ errors.existingServicePointId }}
            </p>
          </div>

          <!-- New Service Point Inline Inputs -->
          <div v-else class="bg-indigo-50/50 p-3 rounded-lg border border-indigo-100 space-y-3">
            <div class="flex items-center gap-1.5 text-xs text-indigo-700 font-medium">
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Create new service point inline for this meter</span>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label for="new-point-identifier" class="block text-xs font-medium text-gray-700 mb-1">
                  Point Identifier <span class="text-red-500">*</span>
                </label>
                <input
                  id="new-point-identifier"
                  v-model="form.newPointIdentifier"
                  type="text"
                  placeholder="e.g. Unit 204 or Main Panel"
                  :data-invalid="touched.newPointIdentifier && !!errors.newPointIdentifier"
                  @blur="handleBlur('newPointIdentifier')"
                  @input="handleInput('newPointIdentifier')"
                  :class="[
                    'block w-full rounded-lg border py-1.5 px-3 text-sm bg-white transition',
                    touched.newPointIdentifier && errors.newPointIdentifier
                      ? 'border-red-300 text-red-900 focus:border-red-500 focus:ring-red-500/20'
                      : 'border-gray-300 focus:border-indigo-600 focus:ring-indigo-500/20',
                  ]"
                />
                <p v-if="touched.newPointIdentifier && errors.newPointIdentifier" class="mt-1 text-xs text-red-600 font-medium">
                  {{ errors.newPointIdentifier }}
                </p>
              </div>

              <div>
                <label for="new-point-notes" class="block text-xs font-medium text-gray-700 mb-1">
                  Notes / Location Details <span class="text-gray-400 font-normal">(Optional)</span>
                </label>
                <input
                  id="new-point-notes"
                  v-model="form.newPointNotes"
                  type="text"
                  placeholder="e.g. Basement electrical room"
                  class="block w-full rounded-lg border border-gray-300 py-1.5 px-3 text-sm bg-white focus:border-indigo-600 focus:ring-indigo-500/20 transition"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Section 2: Meter Specifications -->
      <div class="space-y-4 pt-5 border-t border-gray-100">
        <div class="text-xs font-semibold uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
          <span class="flex h-5 w-5 items-center justify-center rounded bg-indigo-50 text-indigo-700 text-[10px] font-bold">2</span>
          Meter Specifications
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <!-- Serial Number -->
          <div>
            <label for="meter-serial" class="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
              Serial Number <span class="text-red-500">*</span>
            </label>
            <div class="relative rounded-md shadow-xs">
              <input
                id="meter-serial"
                v-model="form.serialNumber"
                type="text"
                placeholder="e.g. MTR-E-10492"
                :data-invalid="touched.serialNumber && !!errors.serialNumber"
                @blur="handleBlur('serialNumber')"
                @input="handleInput('serialNumber')"
                :class="[
                  'block w-full rounded-lg border py-2 pl-3 pr-10 text-sm font-mono transition',
                  touched.serialNumber && errors.serialNumber
                    ? 'border-red-300 text-red-900 placeholder-red-300 focus:border-red-500 focus:ring-red-500/20 bg-red-50/20'
                    : touched.serialNumber && !errors.serialNumber
                      ? 'border-emerald-300 focus:border-emerald-500 focus:ring-emerald-500/20'
                      : 'border-gray-300 focus:border-indigo-600 focus:ring-indigo-500/20',
                ]"
              />
              <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                <svg
                  v-if="touched.serialNumber && errors.serialNumber"
                  class="h-4 w-4 text-red-500"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" />
                </svg>
                <svg
                  v-else-if="touched.serialNumber && !errors.serialNumber"
                  class="h-4 w-4 text-emerald-500"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
                </svg>
              </div>
            </div>
            <p v-if="touched.serialNumber && errors.serialNumber" class="mt-1 text-xs text-red-600 font-medium">
              {{ errors.serialNumber }}
            </p>
          </div>

          <!-- Installed Date -->
          <div>
            <label for="meter-installed" class="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
              Installation Date
            </label>
            <input
              id="meter-installed"
              v-model="form.installedOn"
              type="date"
              :data-invalid="touched.installedOn && !!errors.installedOn"
              @blur="handleBlur('installedOn')"
              @input="handleInput('installedOn')"
              :class="[
                'block w-full rounded-lg border py-2 px-3 text-sm transition',
                touched.installedOn && errors.installedOn
                  ? 'border-red-300 text-red-900 focus:border-red-500 focus:ring-red-500/20 bg-red-50/20'
                  : 'border-gray-300 focus:border-indigo-600 focus:ring-indigo-500/20',
              ]"
            />
            <p v-if="touched.installedOn && errors.installedOn" class="mt-1 text-xs text-red-600 font-medium">
              {{ errors.installedOn }}
            </p>
          </div>
        </div>

        <!-- Meter Utility Type & Status -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          <!-- Type Selection -->
          <div>
            <label class="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
              Utility Type <span class="text-red-500">*</span>
            </label>
            <div class="grid grid-cols-3 gap-2">
              <button
                type="button"
                @click="form.type = 'electric'"
                :class="[
                  'py-2 px-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition',
                  form.type === 'electric'
                    ? 'border-amber-500 bg-amber-50 text-amber-900 ring-2 ring-amber-500/20'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
                ]"
              >
                <span>⚡</span> Electric
              </button>

              <button
                type="button"
                @click="form.type = 'water'"
                :class="[
                  'py-2 px-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition',
                  form.type === 'water'
                    ? 'border-blue-500 bg-blue-50 text-blue-900 ring-2 ring-blue-500/20'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
                ]"
              >
                <span>💧</span> Water
              </button>

              <button
                type="button"
                @click="form.type = 'gas'"
                :class="[
                  'py-2 px-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition',
                  form.type === 'gas'
                    ? 'border-orange-500 bg-orange-50 text-orange-900 ring-2 ring-orange-500/20'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
                ]"
              >
                <span>🔥</span> Gas
              </button>
            </div>
          </div>

          <!-- Initial Status -->
          <div>
            <label class="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
              Initial Operational Status <span class="text-red-500">*</span>
            </label>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              <button
                type="button"
                @click="form.status = 'active'"
                :class="[
                  'py-2 px-2 rounded-lg border text-[11px] font-semibold text-center transition capitalize',
                  form.status === 'active'
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/20'
                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
                ]"
              >
                Active
              </button>

              <button
                type="button"
                @click="form.status = 'inactive'"
                :class="[
                  'py-2 px-2 rounded-lg border text-[11px] font-semibold text-center transition capitalize',
                  form.status === 'inactive'
                    ? 'border-gray-500 bg-gray-100 text-gray-800 ring-2 ring-gray-500/20'
                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
                ]"
              >
                Inactive
              </button>

              <button
                type="button"
                @click="form.status = 'maintenance'"
                :class="[
                  'py-2 px-2 rounded-lg border text-[11px] font-semibold text-center transition capitalize',
                  form.status === 'maintenance'
                    ? 'border-amber-500 bg-amber-50 text-amber-800 ring-2 ring-amber-500/20'
                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
                ]"
              >
                Maint.
              </button>

              <button
                type="button"
                @click="form.status = 'decommissioned'"
                :class="[
                  'py-2 px-2 rounded-lg border text-[11px] font-semibold text-center transition capitalize',
                  form.status === 'decommissioned'
                    ? 'border-red-500 bg-red-50 text-red-800 ring-2 ring-red-500/20'
                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
                ]"
              >
                Decom.
              </button>
            </div>
          </div>
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
          <span>{{ isSubmitting ? 'Saving Meter...' : 'Save Meter' }}</span>
        </button>
      </div>
    </form>
  </div>
</template>
