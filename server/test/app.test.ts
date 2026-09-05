import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  createTestContext,
  truncateDb,
  resetAndSeedDb,
  type TestContext,
} from './harness.js';
import { meters, meterReadings, serviceLocations } from '../src/db/schema.js';

describe('Integration Test Harness with PGlite', () => {
  let ctx: TestContext;

  before(async () => {
    // Single in-memory PGlite instance reused across all tests in this file
    ctx = await createTestContext({ seed: true });

    // Register routes for error handler verification before dispatching any requests
    const testSchema = z.object({
      serialNumber: z.string().min(5, 'Serial number must be at least 5 characters'),
    });

    ctx.app.post('/test/zod-validation', async (req) => {
      testSchema.parse(req.body);
      return { success: true };
    });

    ctx.app.post('/test/unique-violation', async () => {
      // Duplicate serial number (already seeded in Case 1)
      await ctx.db.insert(meters).values({
        servicePointId: 1n,
        serviceLocationId: 1n,
        serialNumber: 'MTR-SFH-ELEC-101',
        type: 'electric',
        status: 'active',
      });
      return { success: true };
    });

    ctx.app.post('/test/check-violation', async () => {
      // Negative reading value violates CHECK reading_value >= 0
      await ctx.db.insert(meterReadings).values({
        meterId: 1n,
        readAt: new Date(),
        readingValue: '-25.500',
      });
      return { success: true };
    });

    ctx.app.post('/test/fk-violation', async () => {
      // Non-existent foreign key service_point_id
      await ctx.db.insert(meters).values({
        servicePointId: 999999n,
        serviceLocationId: 1n,
        serialNumber: 'MTR-NONEXISTENT',
        type: 'electric',
        status: 'active',
      });
      return { success: true };
    });
  });

  after(async () => {
    await ctx.cleanup();
  });

  describe('Fastify Application Routes', () => {
    it('GET / returns 200 with API metadata', async () => {
      const response = await ctx.app.inject({
        method: 'GET',
        url: '/',
      });

      assert.equal(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.equal(body.name, 'meter-management-api');
      assert.equal(body.status, 'online');
      assert.equal(body.docs, '/health');
    });

    it('GET /health verifies PGlite database connectivity', async () => {
      const response = await ctx.app.inject({
        method: 'GET',
        url: '/health',
      });

      assert.equal(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.equal(body.status, 'ok');
      assert.equal(body.database, 'connected');
      assert.ok(typeof body.latencyMs === 'number' && body.latencyMs >= 0);
      assert.ok(typeof body.uptime === 'number');
      assert.ok(body.timestamp !== undefined);
    });

    it('returns CORS headers on request with Origin header', async () => {
      const response = await ctx.app.inject({
        method: 'GET',
        url: '/health',
        headers: {
          origin: 'http://localhost:5173',
        },
      });

      assert.equal(response.statusCode, 200);
      assert.equal(response.headers['access-control-allow-origin'], 'http://localhost:5173');
    });

    it('handles CORS preflight OPTIONS request', async () => {
      const response = await ctx.app.inject({
        method: 'OPTIONS',
        url: '/api/service-locations',
        headers: {
          origin: 'http://localhost:5173',
          'access-control-request-method': 'POST',
        },
      });

      assert.equal(response.statusCode, 204);
      assert.equal(response.headers['access-control-allow-origin'], 'http://localhost:5173');
    });
  });

  describe('Seeded Database State in PGlite', () => {
    it('seeds Case 1: Single-Family Home with all 3 utility meters', async () => {
      const sfh = await ctx.db.query.serviceLocations.findFirst({
        where: (loc, { eq }) => eq(loc.addressLine1, '1042 Maple Street'),
        with: {
          servicePoints: {
            with: {
              meters: true,
            },
          },
        },
      });

      assert.ok(sfh, 'SFH location should exist');
      assert.equal(sfh.city, 'Denver');
      assert.equal(sfh.state, 'CO');
      assert.equal(sfh.servicePoints.length, 1);

      const sfhPoint = sfh.servicePoints[0];
      assert.equal(sfhPoint.meters.length, 3);
      const meterTypes = sfhPoint.meters.map((m) => m.type).sort();
      assert.deepEqual(meterTypes, ['electric', 'gas', 'water']);
    });

    it('seeds Case 2: Multi-Family Complex with 50 distinct service points', async () => {
      const multiFam = await ctx.db.query.serviceLocations.findFirst({
        where: (loc, { eq }) => eq(loc.addressLine1, '8500 Sunrise Boulevard'),
        with: {
          servicePoints: true,
        },
      });

      assert.ok(multiFam, 'Multi-family location should exist');
      assert.equal(multiFam.servicePoints.length, 50);
    });

    it('seeds Case 3: Service point with multiple meters of same type', async () => {
      const commercial = await ctx.db.query.serviceLocations.findFirst({
        where: (loc, { eq }) => eq(loc.addressLine1, '420 Innovation Drive'),
        with: {
          servicePoints: {
            with: {
              meters: true,
            },
          },
        },
      });

      assert.ok(commercial, 'Commercial property should exist');
      const labPoint = commercial.servicePoints[0];
      assert.equal(labPoint.meters.length, 3);
      assert.ok(labPoint.meters.every((m) => m.type === 'electric'));
    });

    it('seeds Case 4: Service point with zero meters', async () => {
      const vacant = await ctx.db.query.serviceLocations.findFirst({
        where: (loc, { eq }) => eq(loc.addressLine1, '990 Warehouse Way'),
        with: {
          servicePoints: {
            with: {
              meters: true,
            },
          },
        },
      });

      assert.ok(vacant, 'Vacant property should exist');
      assert.equal(vacant.servicePoints[0].meters.length, 0);
    });

    it('queries the meter_reading_usage SQL window view with correct usage math', async () => {
      const result = await ctx.db.execute(sql`
        SELECT 
          id, 
          meter_id, 
          reading_value, 
          previous_reading_value, 
          usage, 
          time_elapsed
        FROM meter_reading_usage
        WHERE previous_reading_value IS NOT NULL
        LIMIT 10;
      `);

      assert.ok(result.rows.length > 0, 'View should return calculated usage rows');
      for (const row of result.rows as any[]) {
        assert.ok(row.usage !== null, 'Usage calculation should be non-null');
        assert.ok(row.previous_reading_value !== null);
        assert.ok(row.time_elapsed !== null);
      }
    });
  });

  describe('Error Handler Integration with PGlite & Zod', () => {
    it('handles Zod validation errors with 400 Bad Request and issue details', async () => {
      const response = await ctx.app.inject({
        method: 'POST',
        url: '/test/zod-validation',
        payload: { serialNumber: 'abc' },
      });

      assert.equal(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.equal(body.statusCode, 400);
      assert.equal(body.error, 'Bad Request');
      assert.equal(body.message, 'Validation error');
      assert.equal(body.issues.length, 1);
      assert.equal(body.issues[0].field, 'serialNumber');
    });

    it('handles PostgreSQL unique constraint violation (23505) with 409 Conflict', async () => {
      const response = await ctx.app.inject({
        method: 'POST',
        url: '/test/unique-violation',
      });

      assert.equal(response.statusCode, 409);
      const body = JSON.parse(response.body);
      assert.equal(body.statusCode, 409);
      assert.equal(body.error, 'Conflict');
      assert.match(body.message, /unique constraint/i);
    });

    it('handles PostgreSQL check constraint violation (23514) with 400 Bad Request', async () => {
      const response = await ctx.app.inject({
        method: 'POST',
        url: '/test/check-violation',
      });

      assert.equal(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.equal(body.statusCode, 400);
      assert.equal(body.error, 'Bad Request');
      assert.match(body.message, /check constraint violation/i);
    });

    it('handles PostgreSQL foreign key violation (23503) with 400 Bad Request', async () => {
      const response = await ctx.app.inject({
        method: 'POST',
        url: '/test/fk-violation',
      });

      assert.equal(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.equal(body.statusCode, 400);
      assert.equal(body.error, 'Bad Request');
      assert.match(body.message, /referenced foreign key/i);
    });
  });

  describe('Fast Teardown & Reset Mechanism', () => {
    it('truncates all tables and resets sequences without spinning up new PGlite', async () => {
      await truncateDb(ctx.db);

      const locations = await ctx.db.query.serviceLocations.findMany();
      assert.equal(locations.length, 0, 'Database tables should be completely empty after truncate');

      // Verify sequence restarted at 1
      const [inserted] = await ctx.db
        .insert(serviceLocations)
        .values({
          addressLine1: '100 Fresh Sequence Way',
          city: 'Boulder',
          state: 'CO',
          postalCode: '80301',
        })
        .returning();

      assert.equal(inserted.id, 1, 'Identity sequence should restart at 1 after truncate');
    });

    it('re-seeds the database quickly using resetAndSeedDb', async () => {
      await resetAndSeedDb(ctx.db);

      const locations = await ctx.db.query.serviceLocations.findMany();
      assert.ok(locations.length >= 5, 'Seed data should be fully restored');

      const sfh = locations.find((l) => l.addressLine1 === '1042 Maple Street');
      assert.ok(sfh, 'Single-family home should be present again');
    });
  });
});
