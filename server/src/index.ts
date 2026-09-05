import { buildApp } from './app.js';
import { env } from './config/env.js';
import { pool } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { seed } from './db/seed.js';

const app = buildApp();

async function start() {
  try {
    if (env.NODE_ENV !== 'test') {
      await runMigrations();

      // Automatically seed demo scenarios on initial launch if database is clean
      const countRes = await pool.query('SELECT count(*)::int AS count FROM service_locations;');
      const locationCount = countRes.rows[0]?.count ?? 0;
      if (locationCount === 0) {
        app.log.info('🌱 Database is clean on startup. Auto-seeding 10 demo scenarios...');
        await seed(app.db);
        app.log.info('✅ Demo data auto-seeded successfully.');
      }
    }
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`🚀 Server listening at http://${env.HOST}:${env.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Graceful shutdown handling
const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
for (const signal of signals) {
  process.on(signal, async () => {
    app.log.info(`Received ${signal}, initiating graceful shutdown...`);
    try {
      await app.close();
      await pool.end();
      app.log.info('Server and database pool closed successfully.');
      process.exit(0);
    } catch (err) {
      app.log.error(err, 'Error during shutdown');
      process.exit(1);
    }
  });
}

start();
