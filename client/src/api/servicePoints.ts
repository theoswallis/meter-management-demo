import { httpClient } from '../http/httpClient.js';
import type { HttpResponse } from '../http/types.js';
import type {
  CreateServicePointInput,
  ServicePoint,
} from './types.js';

/**
 * Create a service point nested under a specific service location.
 * POST /api/service-locations/:id/service-points
 */
export function createServicePointForLocation(
  locationId: number | string,
  data: CreateServicePointInput
): Promise<HttpResponse<ServicePoint>> {
  return httpClient.post<ServicePoint, CreateServicePointInput>(
    `/api/service-locations/${locationId}/service-points`,
    data
  );
}

/**
 * Retrieve a single service point by its ID.
 * GET /api/service-points/:id
 */
export function getServicePointById(
  id: number | string
): Promise<HttpResponse<ServicePoint>> {
  return httpClient.get<ServicePoint>(`/api/service-points/${id}`);
}

