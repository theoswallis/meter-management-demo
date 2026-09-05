import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpClient, resolveUrl, httpClient } from '../httpClient.js';

describe('resolveUrl', () => {
  it('combines baseUrl and path without duplicate slashes', () => {
    expect(resolveUrl('http://localhost:3000/', '/api/service-locations')).toBe(
      'http://localhost:3000/api/service-locations'
    );
    expect(resolveUrl('http://localhost:3000', 'api/service-locations')).toBe(
      'http://localhost:3000/api/service-locations'
    );
  });

  it('preserves absolute URLs passed as path', () => {
    expect(resolveUrl('http://localhost:3000', 'https://external-api.com/data')).toBe(
      'https://external-api.com/data'
    );
  });

  it('appends query parameters correctly', () => {
    const url = resolveUrl('http://localhost:3000', '/api/meters/1/readings', {
      limit: 25,
      offset: 50,
      active: true,
      empty: null,
      missing: undefined,
    });

    expect(url).toBe('http://localhost:3000/api/meters/1/readings?limit=25&offset=50&active=true');
  });

  it('handles relative base URLs with params', () => {
    const url = resolveUrl('', '/api/service-locations', { search: 'oak' });
    expect(url).toBe('/api/service-locations?search=oak');
  });
});

describe('HttpClient', () => {
  let client: HttpClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    client = new HttpClient({ baseUrl: 'http://localhost:3000' });
  });

  it('initializes with default base url and allows updating base url', () => {
    expect(client.getBaseUrl()).toBe('http://localhost:3000');
    client.setBaseUrl('https://api.example.com');
    expect(client.getBaseUrl()).toBe('https://api.example.com');
  });

  it('resolves paths against configured baseUrl', () => {
    expect(client.resolvePath('/api/health')).toBe('http://localhost:3000/api/health');
  });

  it('fires GET request and inspects successful 200 response code and JSON data', async () => {
    const mockData = { id: '1', name: 'Oak Plaza' };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockData), {
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const res = await client.get<typeof mockData>('/api/service-locations/1');

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:3000/api/service-locations/1',
      expect.objectContaining({
        method: 'GET',
      })
    );
    expect(res.status).toBe(200);
    expect(res.ok).toBe(true);
    expect(res.statusText).toBe('OK');
    expect(res.data).toEqual(mockData);
  });

  it('fires POST request serializing JSON body and inspecting 201 Created code', async () => {
    const payload = { name: 'Sunset Ridge', addressLine1: '100 Sunset Blvd' };
    const mockCreated = { id: '2', ...payload };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockCreated), {
        status: 201,
        statusText: 'Created',
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const res = await client.post<typeof mockCreated>('/api/service-locations', payload);

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:3000/api/service-locations',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(payload),
      })
    );
    expect(res.status).toBe(201);
    expect(res.ok).toBe(true);
    expect(res.data).toEqual(mockCreated);
  });

  it('inspects 204 No Content response without failing JSON parsing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, {
        status: 204,
        statusText: 'No Content',
      })
    );

    const res = await client.delete('/api/meters/1');
    expect(res.status).toBe(204);
    expect(res.ok).toBe(true);
    expect(res.data).toBeUndefined();
  });

  it('inspects client/server error codes without throwing immediately', async () => {
    const errorBody = { error: 'Not Found', message: 'Meter not found' };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(errorBody), {
        status: 404,
        statusText: 'Not Found',
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const res = await client.get('/api/meters/999');

    expect(res.status).toBe(404);
    expect(res.ok).toBe(false);
    expect(res.statusText).toBe('Not Found');
    expect(res.data).toEqual(errorBody);
  });

  it('provides singleton export httpClient', () => {
    expect(httpClient).toBeInstanceOf(HttpClient);
  });
});
