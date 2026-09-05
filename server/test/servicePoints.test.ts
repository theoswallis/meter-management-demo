import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, type TestContext } from './harness.js';

describe('Service Points API', () => {
  let ctx: TestContext;

  before(async () => {
    ctx = await createTestContext({ seed: true });
  });

  after(async () => {
    await ctx.cleanup();
  });

  describe('GET /api/service-locations/:id/service-points', () => {
    it('returns 200 and all service points belonging to a specific location', async () => {
      // Location 1 is Single Family Home, has 1 service point ('Main Residence')
      const response = await ctx.app.inject({
        method: 'GET',
        url: '/api/service-locations/1/service-points',
      });

      assert.equal(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.ok(Array.isArray(body), 'Should return an array of service points');
      assert.equal(body.length, 1);
      assert.equal(body[0].serviceLocationId, 1);
      assert.equal(body[0].identifier, 'Main Residence');
    });

    it('returns 200 with 50 service points for multi-family location', async () => {
      // Location 2 is Multi-Family (8500 Sunrise Boulevard, 50 units)
      const response = await ctx.app.inject({
        method: 'GET',
        url: '/api/service-locations/2/service-points',
      });

      assert.equal(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.equal(body.length, 50);
      assert.ok(body.every((pt: any) => pt.serviceLocationId === 2));
    });

    it('returns 404 if the parent service location does not exist', async () => {
      const response = await ctx.app.inject({
        method: 'GET',
        url: '/api/service-locations/999999/service-points',
      });

      assert.equal(response.statusCode, 404);
      const body = JSON.parse(response.body);
      assert.equal(body.statusCode, 404);
      assert.match(body.message, /service location not found/i);
    });
  });

  describe('GET /api/service-points/:id', () => {
    it('returns 200 and the service point by ID', async () => {
      const response = await ctx.app.inject({
        method: 'GET',
        url: '/api/service-points/1',
      });

      assert.equal(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.equal(body.id, 1);
      assert.equal(body.identifier, 'Main Residence');
      assert.ok(typeof body.serviceLocationId === 'number');
    });

    it('returns 404 when service point is not found', async () => {
      const response = await ctx.app.inject({
        method: 'GET',
        url: '/api/service-points/999999',
      });

      assert.equal(response.statusCode, 404);
      const body = JSON.parse(response.body);
      assert.equal(body.statusCode, 404);
      assert.match(body.message, /service point not found/i);
    });
  });

  describe('POST /api/service-locations/:id/service-points (Nested)', () => {
    it('creates a service point linked to the location from the URL parameter', async () => {
      const payload = {
        identifier: 'Detached Garage Workshop',
        notes: 'Outbuilding workshop metered separately',
      };

      const response = await ctx.app.inject({
        method: 'POST',
        url: '/api/service-locations/1/service-points',
        payload,
      });

      assert.equal(response.statusCode, 201);
      const body = JSON.parse(response.body);
      assert.ok(typeof body.id === 'number');
      assert.equal(body.serviceLocationId, 1);
      assert.equal(body.identifier, payload.identifier);
      assert.equal(body.notes, payload.notes);
    });

    it('returns 409 Conflict when creating duplicate identifier under the same location', async () => {
      // Location 1 already has 'Main Residence'
      const payload = {
        identifier: 'Main Residence',
      };

      const response = await ctx.app.inject({
        method: 'POST',
        url: '/api/service-locations/1/service-points',
        payload,
      });

      assert.equal(response.statusCode, 409);
      const body = JSON.parse(response.body);
      assert.equal(body.statusCode, 409);
      assert.equal(body.error, 'Conflict');
    });
  });

  describe('POST /api/service-points (Top-level)', () => {
    it('creates a service point when serviceLocationId is supplied in body', async () => {
      const payload = {
        serviceLocationId: 1,
        identifier: 'Pool House Cabana',
        notes: 'Backyard pool house',
      };

      const response = await ctx.app.inject({
        method: 'POST',
        url: '/api/service-points',
        payload,
      });

      assert.equal(response.statusCode, 201);
      const body = JSON.parse(response.body);
      assert.ok(typeof body.id === 'number');
      assert.equal(body.serviceLocationId, 1);
      assert.equal(body.identifier, payload.identifier);
    });

    it('returns 400 Bad Request when serviceLocationId does not exist', async () => {
      const payload = {
        serviceLocationId: 999999,
        identifier: 'Ghost Service Point',
      };

      const response = await ctx.app.inject({
        method: 'POST',
        url: '/api/service-points',
        payload,
      });

      assert.equal(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.equal(body.statusCode, 400);
      assert.match(body.message, /referenced foreign key record does not exist/i);
    });
  });
});
