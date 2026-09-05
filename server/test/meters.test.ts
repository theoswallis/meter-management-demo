import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, type TestContext } from './harness.js';

describe('Meters API', () => {
  let ctx: TestContext;

  before(async () => {
    ctx = await createTestContext({ seed: true });
  });

  after(async () => {
    await ctx.cleanup();
  });

  describe('GET /api/service-locations/:id/meters', () => {
    it('returns all meters installed across all service points at a location', async () => {
      // Location 1 is SFH, has 3 meters (electric, water, gas)
      const response = await ctx.app.inject({
        method: 'GET',
        url: '/api/service-locations/1/meters',
      });

      assert.equal(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.ok(Array.isArray(body));
      assert.equal(body.length, 3);
      assert.ok(body.every((m: any) => m.serviceLocationId === 1));

      const types = body.map((m: any) => m.type).sort();
      assert.deepEqual(types, ['electric', 'gas', 'water']);
    });

    it('returns 404 if the service location does not exist', async () => {
      const response = await ctx.app.inject({
        method: 'GET',
        url: '/api/service-locations/999999/meters',
      });

      assert.equal(response.statusCode, 404);
      const body = JSON.parse(response.body);
      assert.equal(body.statusCode, 404);
      assert.match(body.message, /service location not found/i);
    });
  });

  describe('GET /api/service-points/:id/meters', () => {
    it('returns all meters installed at a specific service point', async () => {
      // Service Point 1 (SFH Main Residence) has 3 meters
      const response = await ctx.app.inject({
        method: 'GET',
        url: '/api/service-points/1/meters',
      });

      assert.equal(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.ok(Array.isArray(body));
      assert.equal(body.length, 3);
      assert.ok(body.every((m: any) => m.servicePointId === 1));
    });

    it('returns empty array if the service point exists but has no meters', async () => {
      // In seed data, Case 4 is an unmetered service point
      // Let's find unmetered location '990 Warehouse Way'
      const vacantPoint = await ctx.db.query.servicePoints.findFirst({
        where: (pt, { eq }) => eq(pt.identifier, 'Storage Bay 4'),
      });
      assert.ok(vacantPoint);

      const response = await ctx.app.inject({
        method: 'GET',
        url: `/api/service-points/${vacantPoint.id}/meters`,
      });

      assert.equal(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.deepEqual(body, []);
    });

    it('returns 404 if the service point does not exist', async () => {
      const response = await ctx.app.inject({
        method: 'GET',
        url: '/api/service-points/999999/meters',
      });

      assert.equal(response.statusCode, 404);
      const body = JSON.parse(response.body);
      assert.equal(body.statusCode, 404);
      assert.match(body.message, /service point not found/i);
    });
  });

  describe('GET /api/meters/:id', () => {
    it('returns 200 and the meter details when found', async () => {
      const response = await ctx.app.inject({
        method: 'GET',
        url: '/api/meters/1',
      });

      assert.equal(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.equal(body.id, 1);
      assert.ok(body.serialNumber);
      assert.ok(body.type);
      assert.ok(body.status);
    });

    it('returns 404 when the meter is not found', async () => {
      const response = await ctx.app.inject({
        method: 'GET',
        url: '/api/meters/999999',
      });

      assert.equal(response.statusCode, 404);
      const body = JSON.parse(response.body);
      assert.equal(body.statusCode, 404);
      assert.match(body.message, /meter not found/i);
    });
  });

  describe('POST /api/service-points/:id/meters (Nested)', () => {
    it('creates a new meter, automatically inheriting serviceLocationId from the service point', async () => {
      const payload = {
        serialNumber: 'MTR-TEST-SOLAR-GEN-01',
        type: 'electric',
        status: 'active',
      };

      const response = await ctx.app.inject({
        method: 'POST',
        url: '/api/service-points/1/meters',
        payload,
      });

      assert.equal(response.statusCode, 201);
      const body = JSON.parse(response.body);
      assert.ok(typeof body.id === 'number');
      assert.equal(body.servicePointId, 1);
      assert.equal(body.serviceLocationId, 1); // Inherited from parent service point!
      assert.equal(body.serialNumber, payload.serialNumber);
      assert.equal(body.type, payload.type);
    });

    it('returns 409 Conflict if serial number already exists', async () => {
      const payload = {
        serialNumber: 'MTR-SFH-ELEC-101', // Pre-existing in seed Case 1
        type: 'electric',
      };

      const response = await ctx.app.inject({
        method: 'POST',
        url: '/api/service-points/1/meters',
        payload,
      });

      assert.equal(response.statusCode, 409);
      const body = JSON.parse(response.body);
      assert.equal(body.statusCode, 409);
      assert.equal(body.error, 'Conflict');
    });

    it('returns 400 Bad Request if invalid meter type is provided', async () => {
      const payload = {
        serialNumber: 'MTR-INVALID-TYPE',
        type: 'nuclear', // Invalid enum
      };

      const response = await ctx.app.inject({
        method: 'POST',
        url: '/api/service-points/1/meters',
        payload,
      });

      assert.equal(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.equal(body.statusCode, 400);
      assert.equal(body.message, 'Validation error');
    });
  });

  describe('POST /api/meters (Top-level)', () => {
    it('creates a meter when servicePointId and serviceLocationId are provided in body', async () => {
      const payload = {
        servicePointId: 1,
        serviceLocationId: 1,
        serialNumber: 'MTR-TEST-TOPLEVEL-01',
        type: 'water',
        status: 'active',
      };

      const response = await ctx.app.inject({
        method: 'POST',
        url: '/api/meters',
        payload,
      });

      assert.equal(response.statusCode, 201);
      const body = JSON.parse(response.body);
      assert.equal(body.serialNumber, payload.serialNumber);
      assert.equal(body.servicePointId, 1);
      assert.equal(body.serviceLocationId, 1);
    });

    it('returns 400 Bad Request if composite foreign key is mismatched (point belongs to different location)', async () => {
      const payload = {
        servicePointId: 1, // Belongs to location 1
        serviceLocationId: 2, // Mismatch!
        serialNumber: 'MTR-TEST-MISMATCH',
        type: 'gas',
      };

      const response = await ctx.app.inject({
        method: 'POST',
        url: '/api/meters',
        payload,
      });

      assert.equal(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.equal(body.statusCode, 400);
      assert.match(body.message, /foreign key|does not exist/i);
    });
  });

  describe('PATCH /api/meters/:id (Meter Lifecycle & Updates)', () => {
    it('updates meter status to decommissioned (simulating retirement)', async () => {
      const response = await ctx.app.inject({
        method: 'PATCH',
        url: '/api/meters/1',
        payload: {
          status: 'decommissioned',
        },
      });

      assert.equal(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.equal(body.id, 1);
      assert.equal(body.status, 'decommissioned');
      assert.ok(body.updatedAt);
    });

    it('updates meter serial number', async () => {
      const response = await ctx.app.inject({
        method: 'PATCH',
        url: '/api/meters/1',
        payload: {
          serialNumber: 'MTR-SFH-ELEC-RENAMED',
        },
      });

      assert.equal(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.equal(body.serialNumber, 'MTR-SFH-ELEC-RENAMED');
    });

    it('returns 400 Bad Request if update payload is empty', async () => {
      const response = await ctx.app.inject({
        method: 'PATCH',
        url: '/api/meters/1',
        payload: {},
      });

      assert.equal(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.equal(body.statusCode, 400);
      assert.equal(body.message, 'Validation error');
    });

    it('returns 404 when updating a non-existent meter', async () => {
      const response = await ctx.app.inject({
        method: 'PATCH',
        url: '/api/meters/999999',
        payload: {
          status: 'maintenance',
        },
      });

      assert.equal(response.statusCode, 404);
      const body = JSON.parse(response.body);
      assert.equal(body.statusCode, 404);
      assert.match(body.message, /meter not found/i);
    });

    it('returns 409 Conflict if updated serial number collides with existing meter', async () => {
      // Meter 2 has serialNumber 'MTR-SFH-WAT-102'
      const response = await ctx.app.inject({
        method: 'PATCH',
        url: '/api/meters/1',
        payload: {
          serialNumber: 'MTR-SFH-WAT-102',
        },
      });

      assert.equal(response.statusCode, 409);
      const body = JSON.parse(response.body);
      assert.equal(body.statusCode, 409);
      assert.equal(body.error, 'Conflict');
    });
  });
});

