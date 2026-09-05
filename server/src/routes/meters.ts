import { and, asc, count, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { db as defaultDb } from '../db/client.js';
import { meterReadings, meters, serviceLocations, servicePoints } from '../db/schema.js';
import {
  bulkMeterReadingsSchema,
  createMeterReadingSchema,
  createMeterSchema,
  queryMeterReadingsSchema,
  queryUsageSchema,
  updateMeterSchema,
} from '../schemas/apiSchemas.js';

export const meterRoutes: FastifyPluginAsync = async (fastify) => {
  const db = fastify.db || defaultDb;

  // 1. GET /api/service-locations/:id/meters - List all meters for a location
  fastify.get<{ Params: { id: string } }>(
    '/api/service-locations/:id/meters',
    async (request, reply) => {
      const locationId = parseInt(request.params.id, 10);
      if (isNaN(locationId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid service location ID format',
        });
      }

      const location = await db.query.serviceLocations.findFirst({
        where: eq(serviceLocations.id, locationId),
      });

      if (!location) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Service location not found with ID ${locationId}`,
        });
      }

      const locationMeters = await db.query.meters.findMany({
        where: eq(meters.serviceLocationId, locationId),
        orderBy: [asc(meters.id)],
      });

      return locationMeters;
    }
  );

  // 2. GET /api/service-points/:id/meters - List all meters for a service point
  fastify.get<{ Params: { id: string } }>(
    '/api/service-points/:id/meters',
    async (request, reply) => {
      const pointId = parseInt(request.params.id, 10);
      if (isNaN(pointId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid service point ID format',
        });
      }

      const point = await db.query.servicePoints.findFirst({
        where: eq(servicePoints.id, pointId),
      });

      if (!point) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Service point not found with ID ${pointId}`,
        });
      }

      const pointMeters = await db.query.meters.findMany({
        where: eq(meters.servicePointId, pointId),
        orderBy: [asc(meters.id)],
      });

      return pointMeters;
    }
  );

  // 3. GET /api/meters/:id - Get single meter by ID
  fastify.get<{ Params: { id: string } }>('/api/meters/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    if (isNaN(id)) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid meter ID format',
      });
    }

    const meter = await db.query.meters.findFirst({
      where: eq(meters.id, id),
    });

    if (!meter) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Meter not found with ID ${id}`,
      });
    }

    return meter;
  });

  // 3b. PATCH /api/meters/:id - Update meter status or attributes
  fastify.patch<{ Params: { id: string } }>('/api/meters/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    if (isNaN(id)) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid meter ID format',
      });
    }

    const existing = await db.query.meters.findFirst({
      where: eq(meters.id, id),
    });

    if (!existing) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Meter not found with ID ${id}`,
      });
    }

    const input = updateMeterSchema.parse(request.body);

    const updateValues: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (input.status !== undefined) updateValues.status = input.status;
    if (input.serialNumber !== undefined) updateValues.serialNumber = input.serialNumber;
    if (input.installedOn !== undefined) updateValues.installedOn = input.installedOn;
    if (input.servicePointId !== undefined) {
      const point = await db.query.servicePoints.findFirst({
        where: eq(servicePoints.id, input.servicePointId),
      });
      if (!point) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Referenced service point does not exist',
        });
      }
      updateValues.servicePointId = input.servicePointId;
      updateValues.serviceLocationId = point.serviceLocationId;
    }

    const [updated] = await db
      .update(meters)
      .set(updateValues)
      .where(eq(meters.id, id))
      .returning();

    return updated;
  });

  // 4. POST /api/service-points/:id/meters - Nested create meter under service point
  fastify.post<{ Params: { id: string } }>(
    '/api/service-points/:id/meters',
    async (request, reply) => {
      const pointId = parseInt(request.params.id, 10);
      if (isNaN(pointId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid service point ID format',
        });
      }

      const point = await db.query.servicePoints.findFirst({
        where: eq(servicePoints.id, pointId),
      });

      if (!point) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Service point not found with ID ${pointId}`,
        });
      }

      const input = createMeterSchema.parse(request.body);

      const [created] = await db
        .insert(meters)
        .values({
          servicePointId: pointId,
          serviceLocationId: point.serviceLocationId, // Automatically bind parent location
          serialNumber: input.serialNumber,
          type: input.type,
          status: input.status,
          installedOn: input.installedOn,
        })
        .returning();

      return reply.status(201).send(created);
    }
  );

  // 5. POST /api/meters - Top-level create meter
  fastify.post('/api/meters', async (request, reply) => {
    const input = createMeterSchema.parse(request.body);

    if (!input.servicePointId || !input.serviceLocationId) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'servicePointId and serviceLocationId are required in body for top-level meter creation',
      });
    }

    const [created] = await db
      .insert(meters)
      .values({
        servicePointId: input.servicePointId,
        serviceLocationId: input.serviceLocationId,
        serialNumber: input.serialNumber,
        type: input.type,
        status: input.status,
        installedOn: input.installedOn,
      })
      .returning();

    return reply.status(201).send(created);
  });

  // 6. GET /api/meters/:id/readings (and alias /api/meters/:id/reads) - Paginated readings
  const getReadingsHandler = async (
    request: import('fastify').FastifyRequest<{
      Params: { id: string };
    }>,
    reply: import('fastify').FastifyReply
  ) => {
    const meterId = parseInt(request.params.id, 10);
    if (isNaN(meterId)) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid meter ID format',
      });
    }

    const meter = await db.query.meters.findFirst({
      where: eq(meters.id, meterId),
    });

    if (!meter) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Meter not found with ID ${meterId}`,
      });
    }

    const query = queryMeterReadingsSchema.parse(request.query);

    const conditions = [eq(meterReadings.meterId, meterId)];
    if (query.startDate) {
      conditions.push(gte(meterReadings.readAt, query.startDate));
    }
    if (query.endDate) {
      conditions.push(lte(meterReadings.readAt, query.endDate));
    }

    const whereClause = and(...conditions);

    const [totalRecord] = await db
      .select({ value: count() })
      .from(meterReadings)
      .where(whereClause);

    const total = totalRecord?.value ?? 0;

    const readings = await db.query.meterReadings.findMany({
      where: whereClause,
      limit: query.limit,
      offset: query.offset,
      orderBy: [desc(meterReadings.readAt)],
    });

    return {
      data: readings,
      total,
      limit: query.limit,
      offset: query.offset,
    };
  };

  fastify.get('/api/meters/:id/readings', getReadingsHandler);

  // 7. POST /api/meters/:id/readings - Record a reading
  const postReadingHandler = async (
    request: import('fastify').FastifyRequest<{
      Params: { id: string };
    }>,
    reply: import('fastify').FastifyReply
  ) => {
    const meterId = parseInt(request.params.id, 10);
    if (isNaN(meterId)) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid meter ID format',
      });
    }

    const meter = await db.query.meters.findFirst({
      where: eq(meters.id, meterId),
    });

    if (!meter) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Meter not found with ID ${meterId}`,
      });
    }

    const input = createMeterReadingSchema.parse(request.body);

    const [created] = await db
      .insert(meterReadings)
      .values({
        meterId,
        readAt: input.readAt,
        readingValue: input.readingValue,
      })
      .returning();

    return reply.status(201).send(created);
  };

  fastify.post('/api/meters/:id/readings', postReadingHandler);

  // 8. POST /api/meters/:id/readings/bulk - Batch insert readings
  fastify.post<{ Params: { id: string } }>(
    '/api/meters/:id/readings/bulk',
    async (request, reply) => {
      const meterId = parseInt(request.params.id, 10);
      if (isNaN(meterId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid meter ID format',
        });
      }

      const meter = await db.query.meters.findFirst({
        where: eq(meters.id, meterId),
      });

      if (!meter) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Meter not found with ID ${meterId}`,
        });
      }

      const input = bulkMeterReadingsSchema.parse(request.body);

      const records = input.readings.map((r) => ({
        meterId,
        readAt: r.readAt,
        readingValue: r.readingValue,
      }));

      const created = await db.insert(meterReadings).values(records).returning();

      return reply.status(201).send({
        count: created.length,
        data: created,
      });
    }
  );

  // 9. GET /api/meters/:id/usage - Consumption analytics via SQL window view
  fastify.get<{ Params: { id: string } }>('/api/meters/:id/usage', async (request, reply) => {
    const meterId = parseInt(request.params.id, 10);
    if (isNaN(meterId)) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid meter ID format',
      });
    }

    const meter = await db.query.meters.findFirst({
      where: eq(meters.id, meterId),
    });

    if (!meter) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Meter not found with ID ${meterId}`,
      });
    }

    const query = queryUsageSchema.parse(request.query);

    const totalRes = await db.execute(sql`
      SELECT count(*)::int AS count
      FROM meter_reading_usage
      WHERE meter_id = ${meterId};
    `);
    const total = (totalRes.rows[0] as any)?.count ?? 0;

    const result = await db.execute(sql`
      SELECT 
        id,
        meter_id AS "meterId",
        read_at AS "readAt",
        reading_value AS "readingValue",
        previous_reading_value AS "previousReadingValue",
        previous_read_at AS "previousReadAt",
        usage,
        time_elapsed AS "timeElapsed"
      FROM meter_reading_usage
      WHERE meter_id = ${meterId}
      ORDER BY read_at DESC
      LIMIT ${query.limit} OFFSET ${query.offset};
    `);

    return {
      data: result.rows,
      total,
      limit: query.limit,
      offset: query.offset,
    };
  });
};

