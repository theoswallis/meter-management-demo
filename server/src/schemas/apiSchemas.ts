import { z } from 'zod';

// ============================================================================
// Service Location Schemas
// ============================================================================

export const createServiceLocationSchema = z.object({
  addressLine1: z.string().min(1, 'Address line 1 is required'),
  addressLine2: z.string().nullable().optional(),
  city: z.string().min(1, 'City is required'),
  state: z
    .string()
    .length(2, 'State must be a 2-letter uppercase postal code')
    .regex(/^[A-Z]{2}$/, 'State must consist of 2 uppercase letters'),
  postalCode: z
    .string()
    .regex(/^[0-9]{5}(-[0-9]{4})?$/, 'Postal code must be in 12345 or 12345-6789 format'),
});

export type CreateServiceLocationInput = z.infer<typeof createServiceLocationSchema>;

export const queryServiceLocationsSchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
  city: z.string().optional(),
  state: z.string().length(2).optional(),
});

// ============================================================================
// Service Point Schemas
// ============================================================================

export const createServicePointSchema = z.object({
  serviceLocationId: z.coerce.number().int().positive().optional(),
  identifier: z.string().min(1, 'Identifier is required (e.g. unit number or panel name)'),
  notes: z.string().nullable().optional(),
});

export type CreateServicePointInput = z.infer<typeof createServicePointSchema>;

// ============================================================================
// Meter Schemas
// ============================================================================

export const createMeterSchema = z.object({
  servicePointId: z.coerce.number().int().positive().optional(),
  serviceLocationId: z.coerce.number().int().positive().optional(),
  serialNumber: z.string().min(1, 'Serial number is required'),
  type: z.enum(['water', 'electric', 'gas'] as const),
  status: z
    .enum(['active', 'inactive', 'maintenance', 'decommissioned'] as const)
    .default('active'),
  installedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'installedOn must be in YYYY-MM-DD format')
    .optional(),
});

export type CreateMeterInput = z.infer<typeof createMeterSchema>;

// ============================================================================
// Meter Reading Schemas
// ============================================================================

export const createMeterReadingSchema = z.object({
  readAt: z.coerce.date().default(() => new Date()),
  readingValue: z
    .union([z.number(), z.string()])
    .refine(
      (val) => {
        const num = typeof val === 'number' ? val : parseFloat(val);
        return !isNaN(num) && num >= 0;
      },
      { message: 'Reading value must be a non-negative number' }
    )
    .transform((val) => (typeof val === 'number' ? val.toFixed(3) : parseFloat(val).toFixed(3))),
});

export type CreateMeterReadingInput = z.infer<typeof createMeterReadingSchema>;

export const queryMeterReadingsSchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const bulkMeterReadingsSchema = z.object({
  readings: z
    .array(createMeterReadingSchema)
    .min(1, 'At least one reading is required in bulk payload')
    .max(1000, 'Cannot submit more than 1000 readings per batch'),
});

export type BulkMeterReadingsInput = z.infer<typeof bulkMeterReadingsSchema>;

export const updateMeterSchema = z
  .object({
    status: z.enum(['active', 'inactive', 'maintenance', 'decommissioned'] as const).optional(),
    serialNumber: z.string().min(1, 'Serial number cannot be empty').optional(),
    installedOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'installedOn must be in YYYY-MM-DD format')
      .optional(),
    servicePointId: z.coerce.number().int().positive().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided to update',
  });

export type UpdateMeterInput = z.infer<typeof updateMeterSchema>;

export const queryUsageSchema = queryMeterReadingsSchema;

