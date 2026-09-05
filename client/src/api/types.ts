// ============================================================================
// Common & Pagination
// ============================================================================

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface PaginationParams {
  limit?: number;
  offset?: number;
}

// ============================================================================
// Service Location Types
// ============================================================================

export interface ServiceLocation {
  id: number;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateServiceLocationInput {
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state: string;
  postalCode: string;
}

export interface QueryServiceLocationsParams extends PaginationParams {
  city?: string;
  state?: string;
}

export interface ServiceLocationTree extends ServiceLocation {
  servicePoints: (ServicePoint & {
    meters: Meter[];
  })[];
}

// ============================================================================
// Service Point Types
// ============================================================================

export interface ServicePoint {
  id: number;
  serviceLocationId: number;
  identifier: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateServicePointInput {
  serviceLocationId?: number;
  identifier: string;
  notes?: string | null;
}

// ============================================================================
// Meter Types
// ============================================================================

export type MeterType = 'water' | 'electric' | 'gas';
export type MeterStatus = 'active' | 'inactive' | 'maintenance' | 'decommissioned';

export interface Meter {
  id: number;
  servicePointId: number;
  serviceLocationId: number;
  serialNumber: string;
  type: MeterType;
  status: MeterStatus;
  installedOn: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMeterInput {
  servicePointId?: number;
  serviceLocationId?: number;
  serialNumber: string;
  type: MeterType;
  status?: MeterStatus;
  installedOn?: string;
}

// ============================================================================
// Meter Reading & Usage Types
// ============================================================================

export interface MeterReading {
  id: number;
  meterId: number;
  readAt: string;
  readingValue: string;
  createdAt: string;
}

export interface CreateMeterReadingInput {
  readAt?: string | Date;
  readingValue: string | number;
}

export interface QueryMeterReadingsParams extends PaginationParams {
  startDate?: string | Date;
  endDate?: string | Date;
}

export interface MeterUsageRecord {
  id: number;
  meterId: number;
  readAt: string;
  readingValue: string;
  previousReadingValue: string | null;
  previousReadAt: string | null;
  usage: string | null;
  timeElapsed: string | null;
}

export type QueryUsageParams = QueryMeterReadingsParams;
