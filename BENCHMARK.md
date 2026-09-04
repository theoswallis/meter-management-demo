# Database Indexing & Performance Benchmark

This document details the database performance profiling and indexing strategy for the utility meter management system.

---

## 1. Executive Summary & Objective

In database schema design, indexing decisions are often made based on speculative assumptions or conflicting documentation. To make data-driven decisions before shipping our database migration, we built an empirical profiling test harness to measure the exact execution cost and query plan differences for:

1. **Eliminating redundant composite indexes** on parent-child foreign key relationships.
2. **Indexing hardware asset identifiers (`serial_number`)** for point lookups.
3. **Optimizing high-frequency time-series queries** on meter telemetry data (`meter_readings`).

---

## 2. Methodology & Profiler Architecture

### Why Documentation Often Conflicts
In small development databases (<1,000 rows), PostgreSQL's cost-based query optimizer (CBO) will almost always choose a **Sequential Scan (`Seq Scan`)** over an index seek. Reading a few contiguous disk blocks into memory is cheaper than jumping between index pages and heap pages (`random_page_cost`). Developers who test indexes against tiny tables often mistakenly conclude that their indexes are ignored or unnecessary.

### Test Environment & Dataset
To simulate realistic production conditions:
- **Synthetic Scale:**
  - 2,000 `service_locations`
  - 5,000 `service_points` (~2.5 units per location)
  - 5,000 `meters` (1:1 with service points)
  - 100,000 `meter_readings` (telemetry data over past 30 days)
- **Optimizer Statistics:** `ANALYZE` was run after data population to calibrate table distribution statistics.
- **Profiling Tool:** Instrumented using PostgreSQL's native `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`.
  - Measures true execution time (ms), not just client network round-trip time.
  - Measures **Buffer Pages** (the number of 8KB memory/cache pages accessed).
- **Sampling:** 5 warm-up queries followed by 25 randomized iterations per scenario.

---

## 3. Empirical Results & Findings

### Test 1: Service Points by Location
**Target Query:**
```sql
SELECT id, identifier FROM service_points WHERE service_location_id = $1;
```

| Plan Configuration | Avg Execution Time | Query Plan Node | Buffer Pages Read |
| :--- | :--- | :--- | :--- |
| **With redundant `(service_location_id, id)` index** | 0.065 ms | `Bitmap Heap Scan` | 4 pages |
| **Without redundant index (using `UNIQUE(service_location_id, identifier)`)** | 0.046 ms | `Bitmap Heap Scan` | 4 pages |

**Analysis:**
- **Finding:** Performance is identical with or without `service_points_location_id_idx`.
- **Reasoning:** In a B-tree, any composite index/constraint on `(A, B)` automatically indexes `A` as its leading key. The unique constraint `UNIQUE (service_location_id, identifier)` already serves all queries filtering on `service_location_id = $1`.
- **Optimization Decision:** Drop `service_points_location_id_idx`. Removing redundant indexes saves disk space and eliminates write amplification on every `INSERT`/`UPDATE`.

---

### Test 2: Meter Lookup by Serial Number
**Target Query:**
```sql
SELECT * FROM meters WHERE serial_number = $1;
```

| Plan Configuration | Avg Execution Time | Query Plan Node | Buffer Pages Read |
| :--- | :--- | :--- | :--- |
| **Composite Suffix Only (`UNIQUE(service_location_id, serial_number)`)** | 0.276 ms | `Seq Scan` (Table scan) | 57 pages |
| **With dedicated `UNIQUE(serial_number)`** | 0.035 ms | `Index Scan` (B-tree seek) | 3 pages |
| **Improvement** | **~7.9x faster** | **Logarithmic seek** | **19x fewer I/O pages** |

**Analysis:**
- **Finding:** A composite index `(service_location_id, serial_number)` cannot be used when searching by `serial_number` alone.
- **Reasoning:** B-tree indexes are sorted left-to-right (like a telephone book sorted by Last Name, First Name). Searching by First Name alone requires reading the whole book.
- **Optimization Decision:** Add a dedicated `UNIQUE (serial_number)` constraint/index. This both enforces global physical asset uniqueness and provides sub-millisecond point lookups.

---

### Test 3: Time-Series Meter Readings Query
**Target Query:**
```sql
SELECT id, reading_value, read_at 
FROM meter_readings 
WHERE meter_id = $1 AND read_at >= (NOW() - INTERVAL '10 days') 
ORDER BY read_at DESC;
```

| Plan Configuration | Avg Execution Time | Query Plan Node | Buffer Pages Read |
| :--- | :--- | :--- | :--- |
| **Unindexed `(meter_id, read_at)`** | 3.476 ms | `Sort` + `Seq Scan` | 834 pages |
| **Composite `INDEX (meter_id, read_at DESC)`** | 0.093 ms | `Sort` + `Bitmap Scan` | 23 pages |
| **Improvement** | **~37.4x faster** | **Targeted seek** | **36x fewer I/O pages** |

**Analysis:**
- **Finding:** Without an index, querying readings for a specific meter forces PostgreSQL to scan 100,000 rows across the entire table, filter matches in memory, and execute an explicit sort.
- **Reasoning:** Telemetry tables grow rapidly. The composite index `(meter_id, read_at DESC)` allows PostgreSQL to locate only the relevant meter's partition and read rows already sorted in reverse chronological order.
- **Optimization Decision:** Add `CREATE INDEX meter_readings_meter_id_read_at_idx ON meter_readings(meter_id, read_at DESC);`.

---

## 4. Final Migration Applied

The optimizations validated above were committed to `server/drizzle/0000_faithful_silk_fever.sql`:

1. **`meter_status` Enum & Column:** Added lifecycle tracking (`active`, `inactive`, `maintenance`, `decommissioned`).
2. **`read_at` Timestamp:** Converted from `date` to `timestamptz` for high-frequency smart meter readings.
3. **Removed Redundant Index:** Dropped `service_points_location_id_idx`.
4. **Global Serial Uniqueness:** Added `CONSTRAINT meters_serial_number_key UNIQUE (serial_number)`.
5. **Telemetry Composite Index:** Added `CREATE INDEX meter_readings_meter_id_read_at_idx ON meter_readings(meter_id, read_at DESC)`.

---

## 5. How to Reproduce

To re-run the benchmark suite and see live query plans:

```bash
cd server
npm run benchmark:db
```
