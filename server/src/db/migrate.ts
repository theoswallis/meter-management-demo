import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsFolder = path.resolve(__dirname, '../../drizzle');

export async function runMigrations() {
  console.log('⏳ Running database migrations from:', migrationsFolder);
  await migrate(db, { migrationsFolder });
  console.log('✅ Database migrations applied successfully.');
}

// Only execute when invoked directly via CLI
if (process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  runMigrations()
    .catch((err) => {
      console.error('❌ Migration failed:', err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
