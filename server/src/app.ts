import Fastify from 'fastify';
import { env } from './config/env.js';
import { healthRoutes } from './routes/health.js';

export function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'test' ? 'silent' : 'info',
    },
  });

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

  return app;
}
