import { httpClient } from '../http/httpClient.js';
import type { HttpResponse } from '../http/types.js';
import type {
  CreateServicePointInput,
  ServicePoint,
} from './types.js';

/**
 * List all service points belonging to a specific service location.
 * GET /api/service-locations/:id/service-points
 */
export function getServicePointsByLocationId(
  locationId: number | string
): Promise<HttpResponse<ServicePoint[]>> {
  return httpClient.get<ServicePoint[]>(`/api/service-locations/${locationId}/service-points`);
}

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

/**
 * Create a service point at top level (requires serviceLocationId in payload).
 * POST /api/service-points
 */
export function createServicePoint(
  data: CreateServicePointInput & { serviceLocationId: number }
): Promise<HttpResponse<ServicePoint>> {
  return httpClient.post<ServicePoint, CreateServicePointInput & { serviceLocationId: number }>(
    '/api/service-points',
    data
  );
}
