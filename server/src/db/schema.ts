import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  char,
  check,
  date,
  foreignKey,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';

// Enums
export const meterTypeEnum = pgEnum('meter_type', ['water', 'electric', 'gas']);
export const meterStatusEnum = pgEnum('meter_status', ['active', 'inactive', 'maintenance', 'decommissioned']);

// Service Locations Table
export const serviceLocations = pgTable(
  'service_locations',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    addressLine1: text('address_line1').notNull(),
    addressLine2: text('address_line2'),
    city: text('city').notNull(),
    state: char('state', { length: 2 }).notNull(),
    postalCode: text('postal_code').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('state_is_upper', sql`${table.state} = upper(${table.state})`),
    check('postal_code_format', sql`${table.postalCode} ~ '^[0-9]{5}(-[0-9]{4})?$'`),
  ]
);

// Service Points Table
export const servicePoints = pgTable(
  'service_points',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    serviceLocationId: bigint('service_location_id', { mode: 'number' })
      .notNull()
      .references(() => serviceLocations.id, { onDelete: 'restrict' }),
    identifier: text('identifier').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('service_points_location_identifier_key').on(table.serviceLocationId, table.identifier),
    unique('service_points_id_location_key').on(table.id, table.serviceLocationId),
  ]
);

// Meters Table
export const meters = pgTable(
  'meters',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    servicePointId: bigint('service_point_id', { mode: 'number' }).notNull(),
    serviceLocationId: bigint('service_location_id', { mode: 'number' }).notNull(),
    serialNumber: text('serial_number').notNull(),
    type: meterTypeEnum('type').notNull(),
    status: meterStatusEnum('status').default('active').notNull(),
    installedOn: date('installed_on').default(sql`CURRENT_DATE`).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('meters_serial_number_key').on(table.serialNumber),
    unique('meters_location_serial_key').on(table.serviceLocationId, table.serialNumber),
    foreignKey({
      columns: [table.servicePointId, table.serviceLocationId],
      foreignColumns: [servicePoints.id, servicePoints.serviceLocationId],
      name: 'meters_service_point_location_fkey',
    }).onDelete('restrict'),
    index('meters_service_point_idx').on(table.servicePointId),
  ]
);

// Meter Readings Table
export const meterReadings = pgTable(
  'meter_readings',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    meterId: bigint('meter_id', { mode: 'number' })
      .notNull()
      .references(() => meters.id, { onDelete: 'cascade' }),
    readAt: timestamp('read_at', { withTimezone: true }).notNull(),
    readingValue: numeric('reading_value', { precision: 14, scale: 3 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('reading_value_positive', sql`${table.readingValue} >= 0`),
    index('meter_readings_meter_id_read_at_idx').on(table.meterId, table.readAt.desc()),
  ]
);

// Relations
export const serviceLocationsRelations = relations(serviceLocations, ({ many }) => ({
  servicePoints: many(servicePoints),
  meters: many(meters),
}));

export const servicePointsRelations = relations(servicePoints, ({ one, many }) => ({
  serviceLocation: one(serviceLocations, {
    fields: [servicePoints.serviceLocationId],
    references: [serviceLocations.id],
  }),
  meters: many(meters),
}));

export const metersRelations = relations(meters, ({ one, many }) => ({
  servicePoint: one(servicePoints, {
    fields: [meters.servicePointId],
    references: [servicePoints.id],
  }),
  serviceLocation: one(serviceLocations, {
    fields: [meters.serviceLocationId],
    references: [serviceLocations.id],
  }),
  readings: many(meterReadings),
}));

export const meterReadingsRelations = relations(meterReadings, ({ one }) => ({
  meter: one(meters, {
    fields: [meterReadings.meterId],
    references: [meters.id],
  }),
}));

// Inferred Types
export type ServiceLocation = typeof serviceLocations.$inferSelect;
export type NewServiceLocation = typeof serviceLocations.$inferInsert;

export type ServicePoint = typeof servicePoints.$inferSelect;
export type NewServicePoint = typeof servicePoints.$inferInsert;

export type Meter = typeof meters.$inferSelect;
export type NewMeter = typeof meters.$inferInsert;

export type MeterReading = typeof meterReadings.$inferSelect;
export type NewMeterReading = typeof meterReadings.$inferInsert;
