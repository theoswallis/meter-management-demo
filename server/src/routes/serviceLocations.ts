import { asc, count, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { db as defaultDb } from '../db/client.js';
import { serviceLocations } from '../db/schema.js';
import {
  createServiceLocationSchema,
  queryServiceLocationsSchema,
} from '../schemas/apiSchemas.js';

export const serviceLocationRoutes: FastifyPluginAsync = async (fastify) => {
  const db = fastify.db || defaultDb;

  // 1. GET /api/service-locations - List service locations with pagination
  fastify.get('/api/service-locations', async (request) => {
    const query = queryServiceLocationsSchema.parse(request.query);

    const [totalRecord] = await db.select({ value: count() }).from(serviceLocations);
    const total = totalRecord?.value ?? 0;

    const locations = await db.query.serviceLocations.findMany({
      limit: query.limit,
      offset: query.offset,
      orderBy: [asc(serviceLocations.id)],
    });

    return {
      data: locations,
      total,
      limit: query.limit,
      offset: query.offset,
    };
  });

  // 2. GET /api/service-locations/:id - Get service location by ID
  fastify.get<{ Params: { id: string } }>('/api/service-locations/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    if (isNaN(id)) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid service location ID format',
      });
    }

    const location = await db.query.serviceLocations.findFirst({
      where: eq(serviceLocations.id, id),
    });

    if (!location) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Service location not found with ID ${id}`,
      });
    }

    return location;
  });

  // 3. POST /api/service-locations - Create a new service location
  fastify.post('/api/service-locations', async (request, reply) => {
    const input = createServiceLocationSchema.parse(request.body);

    const [created] = await db
      .insert(serviceLocations)
      .values({
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2,
        city: input.city,
        state: input.state,
        postalCode: input.postalCode,
      })
      .returning();

    return reply.status(201).send(created);
  });

  // 4. GET /api/service-locations/:id/tree - Full topology hierarchy
  fastify.get<{ Params: { id: string } }>('/api/service-locations/:id/tree', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    if (isNaN(id)) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid service location ID format',
      });
    }

    const locationTree = await db.query.serviceLocations.findFirst({
      where: eq(serviceLocations.id, id),
      with: {
        servicePoints: {
          with: {
            meters: true,
          },
        },
      },
    });

    if (!locationTree) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Service location not found with ID ${id}`,
      });
    }

    return locationTree;
  });
};
