import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, type TestContext } from './harness.js';

describe('Meter Readings API', () => {
  let ctx: TestContext;

  before(async () => {
    ctx = await createTestContext({ seed: true });
  });

  after(async () => {
    await ctx.cleanup();
  });

  describe('GET /api/meters/:id/readings (Pagination & Date Filtering)', () => {
    it('returns paginated readings for a meter ordered descending by readAt', async () => {
      // Meter 1 (SFH Electric) has 16 daily readings seeded (15 days ago to today)
      const response = await ctx.app.inject({
        method: 'GET',
        url: '/api/meters/1/readings?limit=5&offset=0',
      });

      assert.equal(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.ok(Array.isArray(body.data));
      assert.equal(body.data.length, 5);
      assert.ok(typeof body.total === 'number' && body.total >= 16);
      assert.equal(body.limit, 5);
      assert.equal(body.offset, 0);

      // Verify descending order
      const t0 = new Date(body.data[0].readAt).getTime();
      const t1 = new Date(body.data[1].readAt).getTime();
      assert.ok(t0 >= t1, 'Readings should be sorted descending by readAt');
    });

    it('supports offset pagination and returns the next page of readings', async () => {
      const page1Response = await ctx.app.inject({
        method: 'GET',
        url: '/api/meters/1/readings?limit=5&offset=0',
      });
      const page1 = JSON.parse(page1Response.body);

      const page2Response = await ctx.app.inject({
        method: 'GET',
        url: '/api/meters/1/readings?limit=5&offset=5',
      });
      const page2 = JSON.parse(page2Response.body);

      assert.equal(page2.data.length, 5);
      assert.equal(page2.offset, 5);
      assert.notEqual(page1.data[0].id, page2.data[0].id, 'Page 2 should contain different readings');
    });

    it('supports date filtering with startDate and endDate', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayIso = yesterday.toISOString();

      const response = await ctx.app.inject({
        method: 'GET',
        url: `/api/meters/1/readings?startDate=${yesterdayIso}`,
      });

      assert.equal(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.ok(Array.isArray(body.data));
      for (const r of body.data) {
        assert.ok(new Date(r.readAt) >= new Date(yesterdayIso));
      }
    });

    it('returns 404 when querying readings for a non-existent meter', async () => {
      const response = await ctx.app.inject({
        method: 'GET',
        url: '/api/meters/999999/readings',
      });

      assert.equal(response.statusCode, 404);
      const body = JSON.parse(response.body);
      assert.equal(body.statusCode, 404);
      assert.match(body.message, /meter not found/i);
    });
  });

  describe('POST /api/meters/:id/readings', () => {
    it('records a new meter reading with 201 Created', async () => {
      const payload = {
        readingValue: 12950.75,
        readAt: new Date().toISOString(),
      };

      const response = await ctx.app.inject({
        method: 'POST',
        url: '/api/meters/1/readings',
        payload,
      });

      assert.equal(response.statusCode, 201);
      const body = JSON.parse(response.body);
      assert.ok(typeof body.id === 'number');
      assert.equal(body.meterId, 1);
      assert.equal(body.readingValue, '12950.750');
      assert.ok(body.readAt);
      assert.ok(body.createdAt);
    });

    it('returns 400 Bad Request when readingValue is negative (database check constraint)', async () => {
      const payload = {
        readingValue: -15.2,
      };

      const response = await ctx.app.inject({
        method: 'POST',
        url: '/api/meters/1/readings',
        payload,
      });

      assert.equal(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.equal(body.statusCode, 400);
    });

    it('returns 404 when posting a reading for a non-existent meter', async () => {
      const payload = {
        readingValue: 100.0,
      };

      const response = await ctx.app.inject({
        method: 'POST',
        url: '/api/meters/999999/readings',
        payload,
      });

      assert.equal(response.statusCode, 404);
      const body = JSON.parse(response.body);
      assert.equal(body.statusCode, 404);
      assert.match(body.message, /meter not found/i);
    });
  });

  describe('POST /api/meters/:id/readings/bulk (Batch Reading Ingestion)', () => {
    it('records multiple readings in a single bulk transaction', async () => {
      const payload = {
        readings: [
          { readingValue: 13000.0, readAt: new Date(Date.now() - 3600000).toISOString() },
          { readingValue: 13005.5, readAt: new Date(Date.now() - 1800000).toISOString() },
          { readingValue: 13010.25, readAt: new Date().toISOString() },
        ],
      };

      const response = await ctx.app.inject({
        method: 'POST',
        url: '/api/meters/1/readings/bulk',
        payload,
      });

      assert.equal(response.statusCode, 201);
      const body = JSON.parse(response.body);
      assert.equal(body.count, 3);
      assert.ok(Array.isArray(body.data));
      assert.equal(body.data.length, 3);
      assert.equal(body.data[0].readingValue, '13000.000');
    });

    it('returns 400 Bad Request if readings array is empty', async () => {
      const response = await ctx.app.inject({
        method: 'POST',
        url: '/api/meters/1/readings/bulk',
        payload: { readings: [] },
      });

      assert.equal(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.equal(body.statusCode, 400);
      assert.equal(body.message, 'Validation error');
    });

    it('returns 400 Bad Request if any reading in batch is invalid (e.g. negative)', async () => {
      const response = await ctx.app.inject({
        method: 'POST',
        url: '/api/meters/1/readings/bulk',
        payload: {
          readings: [
            { readingValue: 13050.0 },
            { readingValue: -5.0 }, // Invalid!
          ],
        },
      });

      assert.equal(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.equal(body.statusCode, 400);
    });

    it('returns 404 when bulk inserting for a non-existent meter', async () => {
      const response = await ctx.app.inject({
        method: 'POST',
        url: '/api/meters/999999/readings/bulk',
        payload: {
          readings: [{ readingValue: 100.0 }],
        },
      });

      assert.equal(response.statusCode, 404);
      const body = JSON.parse(response.body);
      assert.equal(body.statusCode, 404);
      assert.match(body.message, /meter not found/i);
    });
  });

  describe('GET /api/meters/:id/usage (SQL Window Function Analytics)', () => {
    it('returns consumption analytics with calculated usage and time elapsed', async () => {
      // Meter 1 has multiple readings seeded
      const response = await ctx.app.inject({
        method: 'GET',
        url: '/api/meters/1/usage?limit=5',
      });

      assert.equal(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.ok(Array.isArray(body.data));
      assert.equal(body.data.length, 5);
      assert.ok(typeof body.total === 'number');

      // Check window function fields on rows with a preceding reading
      const rowWithPrev = body.data.find((r: any) => r.previousReadingValue !== null);
      assert.ok(rowWithPrev, 'Should have at least one reading with a previous reading');
      assert.ok(rowWithPrev.usage !== null, 'usage delta must be calculated');
      assert.ok(rowWithPrev.timeElapsed !== null, 'time elapsed interval must be calculated');

      // Verify mathematical accuracy: usage = readingValue - previousReadingValue
      const curr = parseFloat(rowWithPrev.readingValue);
      const prev = parseFloat(rowWithPrev.previousReadingValue);
      const expectedUsage = curr - prev;
      const actualUsage = parseFloat(rowWithPrev.usage);
      assert.ok(
        Math.abs(expectedUsage - actualUsage) < 0.001,
        `Usage math should match: ${actualUsage} vs ${expectedUsage}`
      );
    });

    it('returns 404 for non-existent meter usage', async () => {
      const response = await ctx.app.inject({
        method: 'GET',
        url: '/api/meters/999999/usage',
      });

      assert.equal(response.statusCode, 404);
      const body = JSON.parse(response.body);
      assert.equal(body.statusCode, 404);
      assert.match(body.message, /meter not found/i);
    });
  });
});

