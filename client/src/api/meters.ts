import { httpClient } from '../http/httpClient.js';
import type { HttpResponse } from '../http/types.js';
import type {
  CreateMeterInput,
  Meter,
} from './types.js';

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

