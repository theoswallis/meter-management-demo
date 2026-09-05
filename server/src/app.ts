import Fastify from 'fastify';
import { env } from './config/env.js';
import { errorHandler } from './errors/errorHandler.js';
import { healthRoutes } from './routes/health.js';
import { serviceLocationRoutes } from './routes/serviceLocations.js';
import { servicePointRoutes } from './routes/servicePoints.js';
import { meterRoutes } from './routes/meters.js';
import { db as defaultDb } from './db/client.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: any;
  }
}

export interface AppOptions {
  db?: any;
  logger?: boolean | object;
}

export function buildApp(options: AppOptions = {}) {
  const isTest = process.env.NODE_ENV === 'test' || env.NODE_ENV === 'test';
  const app = Fastify({
    logger: options.logger ?? (isTest ? false : { level: 'info' }),
  });

  const database = options.db || defaultDb;
  app.decorate('db', database);

  // Register centralized error handler
  app.setErrorHandler(errorHandler);

  // Root route
  app.get('/', async () => {
    return {
      name: 'meter-management-api',
      status: 'online',
      docs: '/health',
    };
  });

  // Register route plugins
  app.register(healthRoutes);
  app.register(serviceLocationRoutes);
  app.register(servicePointRoutes);
  app.register(meterRoutes);

  return app;
}

