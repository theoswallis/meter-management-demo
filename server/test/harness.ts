import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import * as schema from '../src/db/schema.js';
import { seed } from '../src/db/seed.js';

process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, '../drizzle');

export interface TestContextOptions {
  seed?: boolean;
}

export interface TestContext {
  app: FastifyInstance;
  db: ReturnType<typeof drizzle<typeof schema>>;
  pglite: PGlite;
  cleanup: () => Promise<void>;
}

/**
 * Creates an isolated test context with an in-memory PGlite database,
 * executes all migration files in sequence, optionally populates seed data,
 * and initializes a configured Fastify application instance.
 */
export async function createTestContext(
  options: TestContextOptions = {}
): Promise<TestContext> {
  const shouldSeed = options.seed ?? true;

  // 1. Initialize in-memory PGlite instance
  const pglite = new PGlite();

  // 2. Read and apply all SQL migrations in order
  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    const filePath = path.join(migrationsDir, file);
    const sqlContent = fs.readFileSync(filePath, 'utf-8');
    await pglite.exec(sqlContent);
  }

  // 3. Create Drizzle client for PGlite
  const db = drizzle(pglite, { schema });

  // 4. Optionally seed the database with demo scenarios
  if (shouldSeed) {
    const originalLog = console.log;
    if (!process.env.DEBUG_TEST_SEED) {
      console.log = () => {};
    }
    try {
      await seed(db);
    } finally {
      console.log = originalLog;
    }
  }

  // 5. Build Fastify application with the injected PGlite database
  const app = buildApp({ db });

  return {
    app,
    db,
    pglite,
    cleanup: async () => {
      await app.close();
      await pglite.close();
    },
  };
}

/**
 * Fast teardown: truncates all tables and resets identity sequences back to 1.
 * Avoids cold-starting a new PGlite instance and re-applying migrations.
 */
export async function truncateDb(db: any): Promise<void> {
  await db.execute(sql`TRUNCATE TABLE service_locations RESTART IDENTITY CASCADE;`);
}

/**
 * Resets the database to a clean seeded state without re-creating the PGlite instance.
 */
export async function resetAndSeedDb(db: any): Promise<void> {
  await truncateDb(db);
  const originalLog = console.log;
  if (!process.env.DEBUG_TEST_SEED) {
    console.log = () => {};
  }
  try {
    await seed(db);
  } finally {
    console.log = originalLog;
  }
}

