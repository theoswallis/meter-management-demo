import { buildApp } from './app.js';
import { env } from './config/env.js';
import { pool } from './db/client.js';

const app = buildApp();

async function start() {
  try {
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
