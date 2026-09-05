import { httpClient } from '../http/httpClient.js';
import type { HttpResponse } from '../http/types.js';
import type {
  CreateServiceLocationInput,
  PaginatedResponse,
  QueryServiceLocationsParams,
  ServiceLocation,
  ServiceLocationTree,
} from './types.js';

/**
 * List service locations with pagination and optional filters.
 * GET /api/service-locations
 */
export function getServiceLocations(
  params?: QueryServiceLocationsParams
): Promise<HttpResponse<PaginatedResponse<ServiceLocation>>> {
  return httpClient.get<PaginatedResponse<ServiceLocation>>('/api/service-locations', {
    params: params as Record<string, string | number | undefined>,
  });
}

/**
 * Retrieve a single service location by its ID.
 * GET /api/service-locations/:id
 */
export function getServiceLocationById(
  id: number | string
): Promise<HttpResponse<ServiceLocation>> {
  return httpClient.get<ServiceLocation>(`/api/service-locations/${id}`);
}

/**
 * Create a new service location.
 * POST /api/service-locations
 */
export function createServiceLocation(
  data: CreateServiceLocationInput
): Promise<HttpResponse<ServiceLocation>> {
  return httpClient.post<ServiceLocation, CreateServiceLocationInput>(
    '/api/service-locations',
    data
  );
}

/**
 * Retrieve the full topology hierarchy (service location -> service points -> meters).
 * GET /api/service-locations/:id/tree
 */
export function getServiceLocationTree(
  id: number | string
): Promise<HttpResponse<ServiceLocationTree>> {
  return httpClient.get<ServiceLocationTree>(`/api/service-locations/${id}/tree`);
}

/**
 * Update an existing service location.
 * PATCH /api/service-locations/:id
 */
export function updateServiceLocation(
  id: number | string,
  data: Partial<CreateServiceLocationInput>
): Promise<HttpResponse<ServiceLocation>> {
  return httpClient.patch<ServiceLocation, Partial<CreateServiceLocationInput>>(
    `/api/service-locations/${id}`,
    data
  );
}
