import { httpClient } from '../http/httpClient.js';
import type { HttpResponse } from '../http/types.js';
import type {
  CreateMeterInput,
  Meter,
  UpdateMeterInput,
} from './types.js';

/**
 * List all meters across all service points under a specific service location.
 * GET /api/service-locations/:id/meters
 */
export function getMetersByLocationId(
  locationId: number | string
): Promise<HttpResponse<Meter[]>> {
  return httpClient.get<Meter[]>(`/api/service-locations/${locationId}/meters`);
}

/**
 * List all meters installed at a specific service point.
 * GET /api/service-points/:id/meters
 */
export function getMetersByServicePointId(
  servicePointId: number | string
): Promise<HttpResponse<Meter[]>> {
  return httpClient.get<Meter[]>(`/api/service-points/${servicePointId}/meters`);
}

/**
 * Retrieve a single meter by its ID.
 * GET /api/meters/:id
 */
export function getMeterById(
  id: number | string
): Promise<HttpResponse<Meter>> {
  return httpClient.get<Meter>(`/api/meters/${id}`);
}

/**
 * Create a new meter nested under a specific service point.
 * (The backend automatically infers serviceLocationId from the service point).
 * POST /api/service-points/:id/meters
 */
export function createMeterForServicePoint(
  servicePointId: number | string,
  data: CreateMeterInput
): Promise<HttpResponse<Meter>> {
  return httpClient.post<Meter, CreateMeterInput>(
    `/api/service-points/${servicePointId}/meters`,
    data
  );
}

/**
 * Create a meter at top level (requires servicePointId and serviceLocationId).
 * POST /api/meters
 */
export function createMeter(
  data: CreateMeterInput & { servicePointId: number; serviceLocationId: number }
): Promise<HttpResponse<Meter>> {
  return httpClient.post<Meter, CreateMeterInput & { servicePointId: number; serviceLocationId: number }>(
    '/api/meters',
    data
  );
}

/**
 * Partially update a meter (status, serial number, installed date, or parent service point).
 * PATCH /api/meters/:id
 */
export function updateMeter(
  id: number | string,
  data: UpdateMeterInput
): Promise<HttpResponse<Meter>> {
  return httpClient.patch<Meter, UpdateMeterInput>(`/api/meters/${id}`, data);
}
