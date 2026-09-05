import { asc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { db as defaultDb } from '../db/client.js';
import { serviceLocations, servicePoints } from '../db/schema.js';
import { createServicePointSchema } from '../schemas/apiSchemas.js';

export const servicePointRoutes: FastifyPluginAsync = async (fastify) => {
  const db = fastify.db || defaultDb;

  // 1. GET /api/service-locations/:id/service-points - List all service points for a location
  fastify.get<{ Params: { id: string } }>(
    '/api/service-locations/:id/service-points',
    async (request, reply) => {
      const locationId = parseInt(request.params.id, 10);
      if (isNaN(locationId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid service location ID format',
        });
      }

      // Verify parent location exists
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

      const points = await db.query.servicePoints.findMany({
        where: eq(servicePoints.serviceLocationId, locationId),
        orderBy: [asc(servicePoints.id)],
      });

      return points;
    }
  );

  // 2. POST /api/service-locations/:id/service-points - Create service point under location
  fastify.post<{ Params: { id: string } }>(
    '/api/service-locations/:id/service-points',
    async (request, reply) => {
      const locationId = parseInt(request.params.id, 10);
      if (isNaN(locationId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid service location ID format',
        });
      }

      // Verify parent location exists
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

      const input = createServicePointSchema.parse(request.body);

      const [created] = await db
        .insert(servicePoints)
        .values({
          serviceLocationId: locationId,
          identifier: input.identifier,
          notes: input.notes,
        })
        .returning();

      return reply.status(201).send(created);
    }
  );

  // 3. GET /api/service-points/:id - Get single service point by ID
  fastify.get<{ Params: { id: string } }>('/api/service-points/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    if (isNaN(id)) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid service point ID format',
      });
    }

    const point = await db.query.servicePoints.findFirst({
      where: eq(servicePoints.id, id),
    });

    if (!point) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Service point not found with ID ${id}`,
      });
    }

    return point;
  });

  // 4. POST /api/service-points - Top-level create service point
  fastify.post('/api/service-points', async (request, reply) => {
    const input = createServicePointSchema.parse(request.body);

    if (!input.serviceLocationId) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'serviceLocationId is required in the body when creating a service point at top level',
      });
    }

    const [created] = await db
      .insert(servicePoints)
      .values({
        serviceLocationId: input.serviceLocationId,
        identifier: input.identifier,
        notes: input.notes,
      })
      .returning();

    return reply.status(201).send(created);
  });
};
