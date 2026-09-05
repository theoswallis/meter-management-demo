<script setup lang="ts">
import { ref, reactive, computed, nextTick } from 'vue';
import { createMeterReading } from '../../api/meterReadings.js';
import type { MeterReading } from '../../api/types.js';

const props = withDefaults(
  defineProps<{
    meterId: number;
    unit?: string;
    latestReadingValue?: number | string | null;
    latestReadAt?: string | null;
  }>(),
  {
    unit: 'kWh',
    latestReadingValue: null,
    latestReadAt: null,
  }
);

const emit = defineEmits<{
  (e: 'success', reading: MeterReading): void;
  (e: 'cancel'): void;
}>();

function formatLocalDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

const form = reactive({
  readingValue: '',
  readAt: formatLocalDateTime(new Date()),
});

const touched = reactive({
  readingValue: false,
  readAt: false,
});

const errors = reactive({
  readingValue: null as string | null,
  readAt: null as string | null,
});

const isSubmitting = ref(false);
const generalError = ref<string | null>(null);

function validateReadingValue(val: unknown): string | null {
  const str = String(val ?? '').trim();
  if (!str) {
    return 'Reading value is required.';
  }
  const num = Number(str);
  if (isNaN(num)) {
    return 'Reading value must be a valid number.';
  }
  if (num < 0) {
    return 'Reading value must be non-negative.';
  }
  return null;
}

function validateReadAt(val: unknown): string | null {
  const str = String(val ?? '').trim();
  if (!str) {
    return 'Reading timestamp is required.';
  }
  const parsed = new Date(str);
  if (isNaN(parsed.getTime())) {
    return 'Please enter a valid date and time.';
  }
  return null;
}

const isRolloverOrReset = computed(() => {
  if (props.latestReadingValue === null || props.latestReadingValue === undefined) return false;
  const str = String(form.readingValue ?? '').trim();
  const num = Number(str);
  const prev = Number(props.latestReadingValue);
  return !isNaN(num) && !isNaN(prev) && num < prev && str.length > 0;
});

function handleBlur(field: 'readingValue' | 'readAt') {
  touched[field] = true;
  runFieldValidation(field);
}

function handleInput(field: 'readingValue' | 'readAt') {
  if (touched[field]) {
    runFieldValidation(field);
  }
}

function runFieldValidation(field: 'readingValue' | 'readAt'): boolean {
  if (field === 'readingValue') {
    errors.readingValue = validateReadingValue(form.readingValue);
    return !errors.readingValue;
  }
  if (field === 'readAt') {
    errors.readAt = validateReadAt(form.readAt);
    return !errors.readAt;
  }
  return true;
}

function validateAll(): boolean {
  touched.readingValue = true;
  touched.readAt = true;
  const v1 = runFieldValidation('readingValue');
  const v2 = runFieldValidation('readAt');
  return v1 && v2;
}

function setReadAtToNow() {
  form.readAt = formatLocalDateTime(new Date());
  if (touched.readAt) {
    runFieldValidation('readAt');
  }
}

function resetForm() {
  form.readingValue = '';
  form.readAt = formatLocalDateTime(new Date());
  touched.readingValue = false;
  touched.readAt = false;
  errors.readingValue = null;
  errors.readAt = null;
  generalError.value = null;
}

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
    const res = await createMeterReading(props.meterId, {
      readingValue: Number(form.readingValue),
      readAt: new Date(form.readAt).toISOString(),
    });

    if (res.ok) {
      const created = res.data;
      resetForm();
      emit('success', created);
    } else {
      const backendData = res.data as any;
      if (backendData?.issues && Array.isArray(backendData.issues)) {
        for (const issue of backendData.issues) {
          if (issue.field === 'readingValue' || issue.field === 'readAt') {
            errors[issue.field as 'readingValue' | 'readAt'] = issue.message;
            touched[issue.field as 'readingValue' | 'readAt'] = true;
          }
        }
        generalError.value = 'Please resolve the validation errors below.';
      } else {
        generalError.value = backendData?.message || `Failed to record reading (${res.status})`;
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
  <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-5 sm:p-6 transition-all">
    <!-- Header -->
    <div class="flex items-start justify-between pb-4 border-b border-gray-100">
      <div>
        <h3 class="text-base font-bold text-gray-900 tracking-tight flex items-center gap-2">
          <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
          </span>
          Record New Meter Reading
        </h3>
        <p class="text-xs text-gray-500 mt-1">
          Add a single telemetry checkpoint for Meter #{{ meterId }}.
        </p>
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
      class="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-700"
    >
      <svg class="h-4 w-4 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <div>
        <p class="font-medium">{{ generalError }}</p>
      </div>
    </div>

    <!-- Form -->
    <form @submit.prevent="handleSubmit" novalidate class="mt-4 space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <!-- Reading Value -->
        <div>
          <div class="flex items-center justify-between mb-1">
            <label for="reading-val" class="block text-xs font-semibold text-gray-700 uppercase tracking-wider">
              Reading Value ({{ unit }}) <span class="text-red-500">*</span>
            </label>
            <span
              v-if="latestReadingValue !== null && latestReadingValue !== undefined"
              class="text-[11px] text-gray-500 font-mono"
            >
              Prev: <strong class="text-gray-700">{{ latestReadingValue }} {{ unit }}</strong>
            </span>
          </div>
          <div class="relative rounded-md shadow-xs">
            <input
              id="reading-val"
              v-model="form.readingValue"
              type="number"
              step="any"
              placeholder="e.g. 1284.500"
              :data-invalid="touched.readingValue && !!errors.readingValue"
              @blur="handleBlur('readingValue')"
              @input="handleInput('readingValue')"
              :class="[
                'block w-full rounded-lg border py-2 pl-3 pr-16 text-sm font-mono transition',
                touched.readingValue && errors.readingValue
                  ? 'border-red-300 text-red-900 focus:border-red-500 focus:ring-red-500/20 bg-red-50/20'
                  : touched.readingValue && !errors.readingValue
                    ? 'border-emerald-300 focus:border-emerald-500 focus:ring-emerald-500/20'
                    : 'border-gray-300 focus:border-indigo-600 focus:ring-indigo-500/20',
              ]"
            />
            <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
              <span class="text-xs font-semibold text-gray-400 mr-1.5">{{ unit }}</span>
              <svg
                v-if="touched.readingValue && errors.readingValue"
                class="h-4 w-4 text-red-500"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" />
              </svg>
              <svg
                v-else-if="touched.readingValue && !errors.readingValue"
                class="h-4 w-4 text-emerald-500"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
              </svg>
            </div>
          </div>
          <p v-if="touched.readingValue && errors.readingValue" class="mt-1 text-xs text-red-600 font-medium">
            {{ errors.readingValue }}
          </p>

          <!-- Rollover Warning Banner -->
          <div
            v-if="isRolloverOrReset"
            class="mt-2 p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[11px] flex items-start gap-1.5"
          >
            <span class="text-amber-600 font-bold shrink-0">⚠️</span>
            <span>
              Entered value (<strong>{{ form.readingValue }}</strong>) is lower than previous reading (<strong>{{ latestReadingValue }}</strong>). This will be flagged as a meter rollover or reset.
            </span>
          </div>
        </div>

        <!-- Reading Timestamp -->
        <div>
          <div class="flex items-center justify-between mb-1">
            <label for="reading-time" class="block text-xs font-semibold text-gray-700 uppercase tracking-wider">
              Timestamp <span class="text-red-500">*</span>
            </label>
            <button
              type="button"
              @click="setReadAtToNow"
              class="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold transition"
            >
              Set to Now
            </button>
          </div>
          <div class="relative rounded-md shadow-xs">
            <input
              id="reading-time"
              v-model="form.readAt"
              type="datetime-local"
              :data-invalid="touched.readAt && !!errors.readAt"
              @blur="handleBlur('readAt')"
              @input="handleInput('readAt')"
              :class="[
                'block w-full rounded-lg border py-2 px-3 text-sm font-mono transition',
                touched.readAt && errors.readAt
                  ? 'border-red-300 text-red-900 focus:border-red-500 focus:ring-red-500/20 bg-red-50/20'
                  : touched.readAt && !errors.readAt
                    ? 'border-emerald-300 focus:border-emerald-500 focus:ring-emerald-500/20'
                    : 'border-gray-300 focus:border-indigo-600 focus:ring-indigo-500/20',
              ]"
            />
          </div>
          <p v-if="touched.readAt && errors.readAt" class="mt-1 text-xs text-red-600 font-medium">
            {{ errors.readAt }}
          </p>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="pt-3 border-t border-gray-100 flex items-center justify-end gap-2.5">
        <button
          type="button"
          @click="handleCancel"
          :disabled="isSubmitting"
          class="rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 shadow-xs hover:bg-gray-50 focus:outline-hidden transition disabled:opacity-50"
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
          <span>{{ isSubmitting ? 'Recording...' : 'Record Reading' }}</span>
        </button>
      </div>
    </form>
  </div>
</template>
