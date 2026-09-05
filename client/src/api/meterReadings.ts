import { httpClient } from '../http/httpClient.js';
import type { HttpResponse } from '../http/types.js';
import type {
  BulkMeterReadingsInput,
  BulkMeterReadingsResponse,
  CreateMeterReadingInput,
  MeterReading,
  MeterUsageRecord,
  PaginatedResponse,
  QueryMeterReadingsParams,
  QueryUsageParams,
} from './types.js';

function serializeDateParams(
  params?: QueryMeterReadingsParams
): Record<string, string | number | undefined> | undefined {
  if (!params) return undefined;
  const result: Record<string, string | number | undefined> = {};

  for (const [key, val] of Object.entries(params)) {
    if (val instanceof Date) {
      result[key] = val.toISOString();
    } else if (val !== undefined && val !== null) {
      result[key] = val as string | number;
    }
  }

  return result;
}

/**
 * Retrieve paginated readings for a meter ordered descending by timestamp.
 * Supports date filtering with startDate and endDate.
 * GET /api/meters/:id/readings
 */
export function getMeterReadings(
  meterId: number | string,
  params?: QueryMeterReadingsParams
): Promise<HttpResponse<PaginatedResponse<MeterReading>>> {
  return httpClient.get<PaginatedResponse<MeterReading>>(`/api/meters/${meterId}/readings`, {
    params: serializeDateParams(params),
  });
}

/**
 * Record a single reading for a meter.
 * POST /api/meters/:id/readings
 */
export function createMeterReading(
  meterId: number | string,
  data: CreateMeterReadingInput
): Promise<HttpResponse<MeterReading>> {
  const payload = {
    ...data,
    readAt: data.readAt instanceof Date ? data.readAt.toISOString() : data.readAt,
  };

  return httpClient.post<MeterReading, typeof payload>(
    `/api/meters/${meterId}/readings`,
    payload
  );
}

/**
 * Batch insert readings in a single transaction.
 * POST /api/meters/:id/readings/bulk
 */
export function createBulkMeterReadings(
  meterId: number | string,
  data: BulkMeterReadingsInput
): Promise<HttpResponse<BulkMeterReadingsResponse>> {
  const payload = {
    readings: data.readings.map((r) => ({
      ...r,
      readAt: r.readAt instanceof Date ? r.readAt.toISOString() : r.readAt,
    })),
  };

  return httpClient.post<BulkMeterReadingsResponse, typeof payload>(
    `/api/meters/${meterId}/readings/bulk`,
    payload
  );
}

/**
 * Retrieve interval consumption analytics and usage delta calculations via the SQL window view.
 * GET /api/meters/:id/usage
 */
export function getMeterUsage(
  meterId: number | string,
  params?: QueryUsageParams
): Promise<HttpResponse<PaginatedResponse<MeterUsageRecord>>> {
  return httpClient.get<PaginatedResponse<MeterUsageRecord>>(`/api/meters/${meterId}/usage`, {
    params: serializeDateParams(params),
  });
}
