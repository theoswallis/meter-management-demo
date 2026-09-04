import { sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index.js';

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async (_request, reply) => {
    let dbStatus = 'disconnected';
    let latencyMs = -1;

    const start = Date.now();
    try {
      await db.execute(sql`SELECT 1`);
      dbStatus = 'connected';
      latencyMs = Date.now() - start;
    } catch (error) {
      fastify.log.error({ err: error }, 'Database healthcheck failed');
      return reply.status(503).send({
        status: 'degraded',
        database: 'disconnected',
        error: (error as Error).message,
        timestamp: new Date().toISOString(),
      });
    }

    return {
      status: 'ok',
      database: dbStatus,
      latencyMs,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  });
};
