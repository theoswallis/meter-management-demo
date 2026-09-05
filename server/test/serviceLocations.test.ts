import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, type TestContext } from './harness.js';

describe('Service Locations API', () => {
  let ctx: TestContext;

  before(async () => {
    ctx = await createTestContext({ seed: true });
  });

  after(async () => {
    await ctx.cleanup();
  });

  describe('GET /api/service-locations', () => {
    it('returns a list of service locations with pagination metadata', async () => {
      const response = await ctx.app.inject({
        method: 'GET',
        url: '/api/service-locations?limit=5',
      });

      assert.equal(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.ok(Array.isArray(body.data), 'data should be an array');
      assert.equal(body.data.length, 5);
      assert.ok(typeof body.total === 'number' && body.total >= 5);
      assert.equal(body.limit, 5);
      assert.equal(body.offset, 0);

      // Verify location properties
      const first = body.data[0];
      assert.ok(typeof first.id === 'number');
      assert.ok(typeof first.addressLine1 === 'string');
      assert.ok(typeof first.city === 'string');
      assert.ok(typeof first.state === 'string');
      assert.ok(typeof first.postalCode === 'string');
    });
  });

  describe('GET /api/service-locations/:id', () => {
    it('returns 200 and the service location when found', async () => {
      const response = await ctx.app.inject({
        method: 'GET',
        url: '/api/service-locations/1',
      });

      assert.equal(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.equal(body.id, 1);
      assert.equal(body.addressLine1, '1042 Maple Street');
      assert.equal(body.city, 'Denver');
      assert.equal(body.state, 'CO');
    });

    it('returns 404 when the service location is not found', async () => {
      const response = await ctx.app.inject({
        method: 'GET',
        url: '/api/service-locations/999999',
      });

      assert.equal(response.statusCode, 404);
      const body = JSON.parse(response.body);
      assert.equal(body.statusCode, 404);
      assert.match(body.message, /service location not found/i);
    });
  });

  describe('POST /api/service-locations', () => {
    it('creates a new service location with 201 Created and valid body', async () => {
      const payload = {
        addressLine1: '500 Skyline Vista Blvd',
        addressLine2: 'Suite 400',
        city: 'Denver',
        state: 'CO',
        postalCode: '80202',
      };

      const response = await ctx.app.inject({
        method: 'POST',
        url: '/api/service-locations',
        payload,
      });

      assert.equal(response.statusCode, 201);
      const body = JSON.parse(response.body);
      assert.ok(typeof body.id === 'number');
      assert.equal(body.addressLine1, payload.addressLine1);
      assert.equal(body.addressLine2, payload.addressLine2);
      assert.equal(body.city, payload.city);
      assert.equal(body.state, payload.state);
      assert.equal(body.postalCode, payload.postalCode);
      assert.ok(body.createdAt);
      assert.ok(body.updatedAt);
    });

    it('returns 400 Bad Request if validation fails (e.g. invalid state or postal code)', async () => {
      const badPayload = {
        addressLine1: '500 Invalid Way',
        city: 'Denver',
        state: 'colorado', // Should be 2-letter uppercase
        postalCode: 'invalid-zip',
      };

      const response = await ctx.app.inject({
        method: 'POST',
        url: '/api/service-locations',
        payload: badPayload,
      });

      assert.equal(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.equal(body.statusCode, 400);
      assert.equal(body.message, 'Validation error');
      assert.ok(body.issues.length >= 2);
    });
  });

  describe('GET /api/service-locations/:id/tree', () => {
    it('returns the entire topology tree (location -> service points -> meters)', async () => {
      // Location 1 is SFH (1 service point with 3 meters)
      const response = await ctx.app.inject({
        method: 'GET',
        url: '/api/service-locations/1/tree',
      });

      assert.equal(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.equal(body.id, 1);
      assert.equal(body.addressLine1, '1042 Maple Street');
      assert.ok(Array.isArray(body.servicePoints));
      assert.equal(body.servicePoints.length, 1);

      const point = body.servicePoints[0];
      assert.equal(point.identifier, 'Main Residence');
      assert.ok(Array.isArray(point.meters));
      assert.equal(point.meters.length, 3);
      assert.ok(point.meters.some((m: any) => m.type === 'electric'));
      assert.ok(point.meters.some((m: any) => m.type === 'water'));
      assert.ok(point.meters.some((m: any) => m.type === 'gas'));
    });

    it('returns 404 if location is not found', async () => {
      const response = await ctx.app.inject({
        method: 'GET',
        url: '/api/service-locations/999999/tree',
      });

      assert.equal(response.statusCode, 404);
      const body = JSON.parse(response.body);
      assert.equal(body.statusCode, 404);
      assert.match(body.message, /service location not found/i);
    });
  });

  describe('PATCH /api/service-locations/:id', () => {
    it('updates service location attributes successfully', async () => {
      const response = await ctx.app.inject({
        method: 'PATCH',
        url: '/api/service-locations/1',
        payload: {
          addressLine1: '1042 Maple Street Apt B',
          addressLine2: '2nd Floor',
          city: 'Boulder',
          state: 'CO',
          postalCode: '80302',
        },
      });

      assert.equal(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.equal(body.id, 1);
      assert.equal(body.addressLine1, '1042 Maple Street Apt B');
      assert.equal(body.addressLine2, '2nd Floor');
      assert.equal(body.city, 'Boulder');
      assert.equal(body.state, 'CO');
      assert.equal(body.postalCode, '80302');
      assert.ok(body.updatedAt);
    });

    it('returns 400 Bad Request if update payload is empty', async () => {
      const response = await ctx.app.inject({
        method: 'PATCH',
        url: '/api/service-locations/1',
        payload: {},
      });

      assert.equal(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.equal(body.statusCode, 400);
      assert.equal(body.message, 'Validation error');
      assert.ok(body.issues.some((i: any) => /at least one field/i.test(i.message)));
    });

    it('returns 400 Bad Request if postal code or state format is invalid', async () => {
      const response = await ctx.app.inject({
        method: 'PATCH',
        url: '/api/service-locations/1',
        payload: {
          state: 'COLORADO',
        },
      });

      assert.equal(response.statusCode, 400);
    });

    it('returns 404 Not Found when updating a non-existent location', async () => {
      const response = await ctx.app.inject({
        method: 'PATCH',
        url: '/api/service-locations/999999',
        payload: {
          city: 'Aspen',
        },
      });

      assert.equal(response.statusCode, 404);
      const body = JSON.parse(response.body);
      assert.match(body.message, /not found/i);
    });
  });
});

