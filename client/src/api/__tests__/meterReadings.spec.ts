import { describe, it, expect, vi, beforeEach } from 'vitest';
import { httpClient } from '../../http/httpClient.js';
import {
  getMeterReadings,
  createMeterReading,
  getMeterUsage,
} from '../meterReadings.js';

describe('meterReadings API - Serialization & Transformations', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('serializes Date objects to ISO strings in query parameters for getMeterReadings', async () => {
    const getSpy = vi.spyOn(httpClient, 'get').mockResolvedValueOnce({
      data: { data: [], total: 0, limit: 20, offset: 0 },
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      ok: true,
    });

    const start = new Date('2026-01-01T00:00:00.000Z');
    const end = new Date('2026-01-31T23:59:59.000Z');

    await getMeterReadings(1, { limit: 20, offset: 0, startDate: start, endDate: end });

    expect(getSpy).toHaveBeenCalledWith('/api/meters/1/readings', {
      params: {
        limit: 20,
        offset: 0,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      },
    });
  });

  it('converts Date object to ISO string in createMeterReading payload', async () => {
    const postSpy = vi.spyOn(httpClient, 'post').mockResolvedValueOnce({
      data: { id: 100, meterId: 1, readAt: '2026-02-01T12:00:00.000Z', readingValue: '123.450', createdAt: '' },
      status: 201,
      statusText: 'Created',
      headers: new Headers(),
      ok: true,
    });

    const readAt = new Date('2026-02-01T12:00:00.000Z');
    await createMeterReading(1, { readAt, readingValue: '123.450' });

    expect(postSpy).toHaveBeenCalledWith('/api/meters/1/readings', {
      readAt: readAt.toISOString(),
      readingValue: '123.450',
    });
  });

  it('preserves string readAt in createMeterReading payload if already formatted', async () => {
    const postSpy = vi.spyOn(httpClient, 'post').mockResolvedValueOnce({
      data: { id: 100, meterId: 1, readAt: '2026-02-01T12:00:00.000Z', readingValue: '123.450', createdAt: '' },
      status: 201,
      statusText: 'Created',
      headers: new Headers(),
      ok: true,
    });

    const readAtStr = '2026-02-01T12:00:00.000Z';
    await createMeterReading(1, { readAt: readAtStr, readingValue: '123.450' });

    expect(postSpy).toHaveBeenCalledWith('/api/meters/1/readings', {
      readAt: readAtStr,
      readingValue: '123.450',
    });
  });


  it('serializes Date objects to ISO strings in getMeterUsage analytics query params', async () => {
    const getSpy = vi.spyOn(httpClient, 'get').mockResolvedValueOnce({
      data: { data: [], total: 0, limit: 50, offset: 0 },
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      ok: true,
    });

    const start = new Date('2026-01-01T00:00:00.000Z');
    await getMeterUsage(1, { limit: 50, offset: 0, startDate: start });

    expect(getSpy).toHaveBeenCalledWith('/api/meters/1/usage', {
      params: { limit: 50, offset: 0, startDate: start.toISOString() },
    });
  });
});
