import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const connectionString =
  process.env.DATABASE_URL ||
  `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@localhost:5433/${process.env.POSTGRES_DB}`;

const client = new Client({ connectionString });

async function setupSchema() {
  console.log('📦 Resetting schema with updated 0000 migration...');
  await client.query(`
    DROP TABLE IF EXISTS meter_readings CASCADE;
    DROP TABLE IF EXISTS meters CASCADE;
    DROP TABLE IF EXISTS service_points CASCADE;
    DROP TABLE IF EXISTS service_locations CASCADE;
    DROP TYPE IF EXISTS meter_status CASCADE;
    DROP TYPE IF EXISTS meter_type CASCADE;

    CREATE TYPE meter_type AS ENUM ('water','electric','gas');
    CREATE TYPE meter_status AS ENUM ('active', 'inactive', 'maintenance', 'decommissioned');

    CREATE TABLE service_locations (
      id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      address_line1 text NOT NULL,
      address_line2 text,
      city          text NOT NULL,
      state         char(2) NOT NULL,
      postal_code   text NOT NULL,
      created_at    timestamptz NOT NULL DEFAULT now(),
      updated_at    timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT state_is_upper     CHECK (state = upper(state)),
      CONSTRAINT postal_code_format CHECK (postal_code ~ '^[0-9]{5}(-[0-9]{4})?$')
    );

    CREATE TABLE service_points (
      id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      service_location_id bigint NOT NULL 
                            REFERENCES service_locations(id) ON DELETE RESTRICT,
      identifier          text NOT NULL,
      notes               text,
      created_at          timestamptz NOT NULL DEFAULT now(),
      updated_at          timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT service_points_location_identifier_key UNIQUE (service_location_id, identifier),
      CONSTRAINT service_points_id_location_key UNIQUE (id, service_location_id)
    );
    CREATE INDEX service_points_location_id_idx ON service_points(service_location_id, id);

    CREATE TABLE meters (
      id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      service_point_id    bigint NOT NULL,
      service_location_id bigint NOT NULL,
      serial_number       text NOT NULL,
      type                meter_type NOT NULL,
      status              meter_status NOT NULL DEFAULT 'active',
      installed_on        date NOT NULL DEFAULT CURRENT_DATE,
      created_at          timestamptz NOT NULL DEFAULT now(),
      updated_at          timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT meters_location_serial_key UNIQUE (service_location_id, serial_number),
      CONSTRAINT meters_service_point_location_fkey 
      FOREIGN KEY (service_point_id, service_location_id) 
      REFERENCES service_points(id, service_location_id) 
      ON DELETE RESTRICT
    );
    CREATE INDEX meters_service_point_idx ON meters(service_point_id);

    CREATE TABLE meter_readings (
      id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      meter_id      bigint NOT NULL REFERENCES meters(id) ON DELETE CASCADE,
      read_at       timestamptz NOT NULL,
      reading_value numeric(14,3) NOT NULL,
      created_at    timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT reading_value_positive CHECK (reading_value >= 0)
    );
  `);
  console.log('✅ Schema created.');
}

async function seedData() {
  console.log('🌱 Seeding realistic test dataset for query planner (this takes ~3-5 seconds)...');

  // 1. Seed 2,000 service locations
  await client.query(`
    INSERT INTO service_locations (address_line1, city, state, postal_code)
    SELECT 
      (i || ' Main Street')::text,
      'Denver',
      'CO',
      LPAD((80000 + (i % 200))::text, 5, '0')
    FROM generate_series(1, 2000) AS i;
  `);

  // 2. Seed 5,000 service points (average 2.5 units per location)
  await client.query(`
    INSERT INTO service_points (service_location_id, identifier)
    SELECT 
      1 + ((i - 1) % 2000),
      'Unit ' || ((i - 1) / 2000 + 1)::text
    FROM generate_series(1, 5000) AS i;
  `);

  // 3. Seed 5,000 meters (1 meter per service point)
  await client.query(`
    INSERT INTO meters (service_point_id, service_location_id, serial_number, type, status)
    SELECT 
      sp.id,
      sp.service_location_id,
      'MTR-' || LPAD(sp.id::text, 7, '0'),
      (ARRAY['electric'::meter_type, 'water'::meter_type, 'gas'::meter_type])[1 + (sp.id % 3)],
      'active'::meter_status
    FROM service_points sp;
  `);

  // 4. Seed 100,000 meter readings (20 readings per meter across past 30 days)
  await client.query(`
    INSERT INTO meter_readings (meter_id, read_at, reading_value)
    SELECT 
      m_id,
      NOW() - (step || ' hours')::interval,
      (1000 + (random() * 5000))::numeric(14,3)
    FROM generate_series(1, 5000) AS m_id,
         generate_series(1, 20) AS step;
  `);

  // Update PostgreSQL statistics
  console.log('📊 Running ANALYZE to update PostgreSQL query planner statistics...');
  await client.query('ANALYZE;');
  console.log('✅ Dataset ready: 2,000 locations, 5,000 service points, 5,000 meters, 100,000 readings.\n');
}

async function runExplain(query, params = []) {
  const res = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`, params);
  const planObj = res.rows[0]['QUERY PLAN'][0];
  const executionTime = planObj['Execution Time'];
  const nodeType = planObj.Plan['Node Type'];
  const sharedHitBlocks = planObj.Plan['Shared Hit Blocks'] || 0;
  const sharedReadBlocks = planObj.Plan['Shared Read Blocks'] || 0;
  return { executionTime, nodeType, sharedHitBlocks, sharedReadBlocks, raw: planObj };
}

async function benchmarkQuery(label, query, paramsGen, iterations = 25) {
  let totalTime = 0;
  let samplePlan = null;

  // Warmup 5 queries
  for (let i = 0; i < 5; i++) {
    await client.query(query, paramsGen());
  }

  for (let i = 0; i < iterations; i++) {
    const params = paramsGen();
    const plan = await runExplain(query, params);
    totalTime += plan.executionTime;
    if (i === 0) samplePlan = plan;
  }

  const avgTimeMs = totalTime / iterations;
  return {
    label,
    avgTimeMs: Number(avgTimeMs.toFixed(3)),
    nodeType: samplePlan.nodeType,
    buffers: samplePlan.sharedHitBlocks + samplePlan.sharedReadBlocks,
  };
}

async function runBenchmarks() {
  console.log('========================================================================');
  console.log('                   DATABASE INDEX BENCHMARK SUITE                       ');
  console.log('========================================================================\n');

  // --------------------------------------------------------------------------------
  // Scenario 1: Lookup service points by location
  // --------------------------------------------------------------------------------
  console.log('▶ [TEST 1] Service Points by Location: `SELECT * FROM service_points WHERE service_location_id = $1`');
  console.log('   Comparing: WITH vs WITHOUT redundant index `service_points_location_id_idx(service_location_id, id)`');

  const q1 = 'SELECT id, identifier FROM service_points WHERE service_location_id = $1;';
  const r1_with = await benchmarkQuery('With redundant (service_location_id, id) index', q1, () => [Math.floor(Math.random() * 2000) + 1]);

  await client.query('DROP INDEX service_points_location_id_idx;');
  const r1_without = await benchmarkQuery('Without redundant index (using UNIQUE(service_location_id, identifier))', q1, () => [Math.floor(Math.random() * 2000) + 1]);

  console.table([r1_with, r1_without]);
  console.log(`💡 Insight: Notice both execute with nearly identical performance because the UNIQUE constraint`);
  console.log(`   already has (service_location_id) as its leading B-tree key. The extra index is redundant overhead.\n`);

  // Restore index for next tests if needed
  await client.query('CREATE INDEX service_points_location_id_idx ON service_points(service_location_id, id);');

  // --------------------------------------------------------------------------------
  // Scenario 2: Meter lookup by Serial Number alone
  // --------------------------------------------------------------------------------
  console.log('▶ [TEST 2] Meter Lookup by Serial: `SELECT * FROM meters WHERE serial_number = $1`');
  console.log('   Comparing: WITHOUT serial_number index vs WITH dedicated `meters(serial_number)` index');

  const q2 = 'SELECT * FROM meters WHERE serial_number = $1;';
  const r2_without = await benchmarkQuery('Current Schema (no serial index, only UNIQUE(service_location_id, serial_number))', q2, () => [
    'MTR-' + String(Math.floor(Math.random() * 5000) + 1).padStart(7, '0'),
  ]);

  await client.query('CREATE UNIQUE INDEX meters_serial_number_idx ON meters(serial_number);');
  await client.query('ANALYZE meters;');
  const r2_with = await benchmarkQuery('Optimized (with UNIQUE INDEX on serial_number)', q2, () => [
    'MTR-' + String(Math.floor(Math.random() * 5000) + 1).padStart(7, '0'),
  ]);

  console.table([r2_without, r2_with]);
  const speedup2 = (r2_without.avgTimeMs / r2_with.avgTimeMs).toFixed(1);
  console.log(`💡 Insight: Without an index starting with serial_number, PostgreSQL must scan every row in the table`);
  console.log(`   (${r2_without.nodeType}, inspecting ${r2_without.buffers} pages).`);
  console.log(`   With a dedicated index, it switches to ${r2_with.nodeType}, touching only ${r2_with.buffers} pages (${speedup2}x faster)!\n`);

  // --------------------------------------------------------------------------------
  // Scenario 3: Meter Readings by Meter ID and Date Range
  // --------------------------------------------------------------------------------
  console.log('▶ [TEST 3] Meter Readings Time-Series: `SELECT * FROM meter_readings WHERE meter_id = $1 AND read_at >= $2 ORDER BY read_at DESC`');
  console.log('   Comparing: Current schema (no index on meter_id) vs WITH composite `INDEX (meter_id, read_at DESC)`');

  const q3 = `
    SELECT id, reading_value, read_at 
    FROM meter_readings 
    WHERE meter_id = $1 AND read_at >= (NOW() - INTERVAL '10 days') 
    ORDER BY read_at DESC;
  `;
  const r3_without = await benchmarkQuery('Current Schema (no index on meter_readings.meter_id)', q3, () => [Math.floor(Math.random() * 5000) + 1]);

  await client.query('CREATE INDEX meter_readings_meter_time_idx ON meter_readings(meter_id, read_at DESC);');
  await client.query('ANALYZE meter_readings;');
  const r3_with = await benchmarkQuery('Optimized (with composite INDEX on (meter_id, read_at DESC))', q3, () => [Math.floor(Math.random() * 5000) + 1]);

  console.table([r3_without, r3_with]);
  const speedup3 = (r3_without.avgTimeMs / r3_with.avgTimeMs).toFixed(1);
  console.log(`💡 Insight: Searching 100,000 readings without an index forces a ${r3_without.nodeType} reading ${r3_without.buffers} pages + sort.`);
  console.log(`   With the composite index, PostgreSQL performs an ${r3_with.nodeType}, reading only ${r3_with.buffers} buffer pages (${speedup3}x faster)!\n`);

  console.log('========================================================================');
  console.log('                       BENCHMARK COMPLETE                               ');
  console.log('========================================================================');
}

async function main() {
  try {
    await client.connect();
    await setupSchema();
    await seedData();
    await runBenchmarks();
  } catch (err) {
    console.error('❌ Benchmark error:', err);
  } finally {
    await client.end();
  }
}

main();
