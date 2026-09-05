import { sql } from 'drizzle-orm';
import { db as defaultDb, pool } from './client.js';
import {
  meters,
  meterReadings,
  serviceLocations,
  servicePoints,
} from './schema.js';

// Helper to compute timestamps relative to current runtime
function daysAgo(days: number, hour = 8, minute = 0): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function daysAgoDateStr(days: number): string {
  return daysAgo(days).toISOString().split('T')[0];
}

export async function seed(db: any = defaultDb) {
  console.log('🌱 Starting database seeding for demo scenarios...\n');

  // 0. Clean slate
  console.log('🧹 Truncating existing tables and restarting identities...');
  await db.execute(sql`TRUNCATE TABLE service_locations RESTART IDENTITY CASCADE;`);

  // ============================================================================
  // SECTION 1: TOPOLOGY & STRUCTURAL SCENARIOS
  // ============================================================================
  console.log('\n--- [1/3] Seeding Topology & Structural Scenarios ---');

  // Case 1: Single-Family Home (1 location, exactly 1 service point, all 3 meter types)
  console.log('  ▸ Case 1: Single-Family Home (1 location -> 1 service point -> standard full utilities)');
  const [sfhLoc] = await db
    .insert(serviceLocations)
    .values({
      addressLine1: '1042 Maple Street',
      city: 'Denver',
      state: 'CO',
      postalCode: '80203',
    })
    .returning();

  const [sfhPoint] = await db
    .insert(servicePoints)
    .values({
      serviceLocationId: sfhLoc.id,
      identifier: 'Main Residence',
      notes: 'Single family residential property',
    })
    .returning();

  const [sfhElec, sfhWater, sfhGas] = await db
    .insert(meters)
    .values([
      {
        servicePointId: sfhPoint.id,
        serviceLocationId: sfhLoc.id,
        serialNumber: 'MTR-SFH-ELEC-101',
        type: 'electric',
        status: 'active',
        installedOn: daysAgoDateStr(180),
      },
      {
        servicePointId: sfhPoint.id,
        serviceLocationId: sfhLoc.id,
        serialNumber: 'MTR-SFH-WAT-102',
        type: 'water',
        status: 'active',
        installedOn: daysAgoDateStr(180),
      },
      {
        servicePointId: sfhPoint.id,
        serviceLocationId: sfhLoc.id,
        serialNumber: 'MTR-SFH-GAS-103',
        type: 'gas',
        status: 'active',
        installedOn: daysAgoDateStr(180),
      },
    ])
    .returning();

  // Baseline readings for SFH meters over 15 days
  for (let i = 15; i >= 0; i--) {
    await db.insert(meterReadings).values([
      { meterId: sfhElec.id, readAt: daysAgo(i), readingValue: (12400 + (15 - i) * 18.5).toFixed(3) },
      { meterId: sfhWater.id, readAt: daysAgo(i), readingValue: (320 + (15 - i) * 0.45).toFixed(3) },
      { meterId: sfhGas.id, readAt: daysAgo(i), readingValue: (850 + (15 - i) * 1.2).toFixed(3) },
    ]);
  }

  // Case 2: Multi-Family Complex (1 location with 50 distinct service points)
  console.log('  ▸ Case 2: Multi-Family Complex (1 location -> 50 distinct service points / apartments)');
  const [mfLoc] = await db
    .insert(serviceLocations)
    .values({
      addressLine1: '8500 Sunrise Boulevard',
      city: 'Denver',
      state: 'CO',
      postalCode: '80238',
    })
    .returning();

  const mfPointsData = Array.from({ length: 50 }, (_, idx) => {
    const floor = Math.floor(idx / 10) + 1;
    const room = (idx % 10) + 1;
    const unitNumber = `${floor}${room < 10 ? '0' : ''}${room}`;
    return {
      serviceLocationId: mfLoc.id,
      identifier: `Apt ${unitNumber}`,
      notes: `Building A Floor ${floor}`,
    };
  });
  const mfPoints = await db.insert(servicePoints).values(mfPointsData).returning();

  // Attach electric meters to each apartment in the multi-family complex
  const mfMetersData = mfPoints.map((pt: any, idx: number) => ({
    servicePointId: pt.id,
    serviceLocationId: mfLoc.id,
    serialNumber: `MTR-MF-ELEC-${1000 + idx}`,
    type: 'electric' as const,
    status: 'active' as const,
    installedOn: daysAgoDateStr(365),
  }));
  const mfMeters = await db.insert(meters).values(mfMetersData).returning();

  // Seed sample readings for the first 5 units
  for (const m of mfMeters.slice(0, 5)) {
    for (let i = 5; i >= 0; i--) {
      await db.insert(meterReadings).values({
        meterId: m.id,
        readAt: daysAgo(i),
        readingValue: (4500 + (5 - i) * 12.2).toFixed(3),
      });
    }
  }

  // Case 3: Sub-metered Service Point (Multiple meters of the SAME utility type)
  console.log('  ▸ Case 3: Sub-metered Service Point (Multiple meters of the SAME utility type: General + EV + HVAC)');
  const [subLoc] = await db
    .insert(serviceLocations)
    .values({
      addressLine1: '420 Innovation Drive',
      city: 'Boulder',
      state: 'CO',
      postalCode: '80301',
    })
    .returning();

  const [subPoint] = await db
    .insert(servicePoints)
    .values({
      serviceLocationId: subLoc.id,
      identifier: 'Commercial Suite 100',
      notes: 'Light industrial workshop with dedicated sub-metered sub-panels',
    })
    .returning();

  const [subElecMain, subElecEV, subElecHVAC] = await db
    .insert(meters)
    .values([
      {
        servicePointId: subPoint.id,
        serviceLocationId: subLoc.id,
        serialNumber: 'MTR-SUB-ELEC-MAIN',
        type: 'electric',
        status: 'active',
        installedOn: daysAgoDateStr(120),
      },
      {
        servicePointId: subPoint.id,
        serviceLocationId: subLoc.id,
        serialNumber: 'MTR-SUB-ELEC-EV',
        type: 'electric',
        status: 'active',
        installedOn: daysAgoDateStr(90),
      },
      {
        servicePointId: subPoint.id,
        serviceLocationId: subLoc.id,
        serialNumber: 'MTR-SUB-ELEC-HVAC',
        type: 'electric',
        status: 'active',
        installedOn: daysAgoDateStr(120),
      },
    ])
    .returning();

  for (let i = 10; i >= 0; i--) {
    await db.insert(meterReadings).values([
      { meterId: subElecMain.id, readAt: daysAgo(i), readingValue: (8200 + (10 - i) * 25.0).toFixed(3) },
      { meterId: subElecEV.id, readAt: daysAgo(i), readingValue: (3100 + (10 - i) * 48.0).toFixed(3) },
      { meterId: subElecHVAC.id, readAt: daysAgo(i), readingValue: (14200 + (10 - i) * 62.5).toFixed(3) },
    ]);
  }

  // Case 4: Unmetered Service Point (0 meters attached)
  console.log('  ▸ Case 4: Unmetered Service Point (Service point with zero meters attached)');
  const [unmeteredLoc] = await db
    .insert(serviceLocations)
    .values({
      addressLine1: '990 Warehouse Way',
      city: 'Denver',
      state: 'CO',
      postalCode: '80216',
    })
    .returning();

  await db.insert(servicePoints).values({
    serviceLocationId: unmeteredLoc.id,
    identifier: 'Storage Bay 4',
    notes: 'Unfinished dry storage bay - meter installation pending utility hookup',
  });

  // Case 5: Partial Utility Service Point (One meter type absent, e.g. All-Electric with no Gas)
  console.log('  ▸ Case 5: Partial Utility Service Point (Electric + Water present, Gas absent)');
  const [partialLoc] = await db
    .insert(serviceLocations)
    .values({
      addressLine1: '710 Solar Vista Lane',
      city: 'Denver',
      state: 'CO',
      postalCode: '80205',
    })
    .returning();

  const [partialPoint] = await db
    .insert(servicePoints)
    .values({
      serviceLocationId: partialLoc.id,
      identifier: 'Net-Zero Eco Loft',
      notes: '100% all-electric structure with heat pump and induction - no gas connection',
    })
    .returning();

  const [partialElec, partialWater] = await db
    .insert(meters)
    .values([
      {
        servicePointId: partialPoint.id,
        serviceLocationId: partialLoc.id,
        serialNumber: 'MTR-ECO-ELEC-301',
        type: 'electric',
        status: 'active',
        installedOn: daysAgoDateStr(100),
      },
      {
        servicePointId: partialPoint.id,
        serviceLocationId: partialLoc.id,
        serialNumber: 'MTR-ECO-WAT-302',
        type: 'water',
        status: 'active',
        installedOn: daysAgoDateStr(100),
      },
      // Intentionally NO gas meter
    ])
    .returning();

  for (let i = 7; i >= 0; i--) {
    await db.insert(meterReadings).values([
      { meterId: partialElec.id, readAt: daysAgo(i), readingValue: (2100 + (7 - i) * 14.2).toFixed(3) },
      { meterId: partialWater.id, readAt: daysAgo(i), readingValue: (180 + (7 - i) * 0.35).toFixed(3) },
    ]);
  }

  // ============================================================================
  // SECTION 2: HARDWARE LIFECYCLE SCENARIOS
  // ============================================================================
  console.log('\n--- [2/3] Seeding Hardware Lifecycle Scenarios ---');

  // Case 6: Meter Replacement (Old meter decommissioned, new meter installed on same service point)
  console.log('  ▸ Case 6: Meter Replacement (Old decommissioned meter + New active replacement on same service point)');
  const [replaceLoc] = await db
    .insert(serviceLocations)
    .values({
      addressLine1: '335 Willowbrook Lane',
      city: 'Denver',
      state: 'CO',
      postalCode: '80206',
    })
    .returning();

  const [replacePoint] = await db
    .insert(servicePoints)
    .values({
      serviceLocationId: replaceLoc.id,
      identifier: 'Residential Unit',
      notes: 'Water meter upgraded to smart AMI meter 15 days ago',
    })
    .returning();

  // Old meter (retired 15 days ago)
  const [oldMeter] = await db
    .insert(meters)
    .values({
      servicePointId: replacePoint.id,
      serviceLocationId: replaceLoc.id,
      serialNumber: 'MTR-WAT-REPLACED-LEGACY',
      type: 'water',
      status: 'decommissioned',
      installedOn: daysAgoDateStr(730),
    })
    .returning();

  // Old meter readings up to replacement date (Day -30 to Day -15)
  for (let i = 30; i >= 15; i--) {
    await db.insert(meterReadings).values({
      meterId: oldMeter.id,
      readAt: daysAgo(i),
      readingValue: (8920.0 + (30 - i) * 0.52).toFixed(3), // Ends at 8927.800
    });
  }

  // New replacement meter (installed 15 days ago)
  const [newMeter] = await db
    .insert(meters)
    .values({
      servicePointId: replacePoint.id,
      serviceLocationId: replaceLoc.id,
      serialNumber: 'MTR-WAT-REPLACED-SMART',
      type: 'water',
      status: 'active',
      installedOn: daysAgoDateStr(15),
    })
    .returning();

  // New meter readings from Day -15 to today (starts fresh from 0.000)
  for (let i = 15; i >= 0; i--) {
    await db.insert(meterReadings).values({
      meterId: newMeter.id,
      readAt: daysAgo(i),
      readingValue: ((15 - i) * 0.48).toFixed(3), // Starts at 0.000, increments to 7.200
    });
  }

  // ============================================================================
  // SECTION 3: TELEMETRY & CONSUMPTION ANOMALY SCENARIOS
  // ============================================================================
  console.log('\n--- [3/3] Seeding Telemetry & Consumption Anomaly Scenarios ---');

  // Case 7: Meter Rollover (Dial reaches max capacity 99,999 and rolls over past 0)
  console.log('  ▸ Case 7: Meter Dial Rollover (Cumulative counter exceeds 99,999.000 and wraps back to 0.000)');
  const [rolloverLoc] = await db
    .insert(serviceLocations)
    .values({
      addressLine1: '12 Pioneer Pass',
      city: 'Denver',
      state: 'CO',
      postalCode: '80204',
    })
    .returning();

  const [rolloverPoint] = await db
    .insert(servicePoints)
    .values({
      serviceLocationId: rolloverLoc.id,
      identifier: 'Main Service',
      notes: 'Mechanical electric meter with 5-digit register that rolled over recently',
    })
    .returning();

  const [rolloverMeter] = await db
    .insert(meters)
    .values({
      servicePointId: rolloverPoint.id,
      serviceLocationId: rolloverLoc.id,
      serialNumber: 'MTR-ELEC-ROLLOVER-999',
      type: 'electric',
      status: 'active',
      installedOn: daysAgoDateStr(1200),
    })
    .returning();

  const rolloverReadings = [
    { daysAgo: 6, value: '99965.200' },
    { daysAgo: 5, value: '99982.500' },
    { daysAgo: 4, value: '99995.800' },
    { daysAgo: 3, value: '00008.400' }, // ROLLOVER OCCURRED!
    { daysAgo: 2, value: '00024.100' },
    { daysAgo: 1, value: '00041.300' },
    { daysAgo: 0, value: '00058.700' },
  ];
  for (const r of rolloverReadings) {
    await db.insert(meterReadings).values({
      meterId: rolloverMeter.id,
      readAt: daysAgo(r.daysAgo),
      readingValue: r.value,
    });
  }

  // Case 8: Obvious Consumption Spike (Water pipe burst / leak)
  console.log('  ▸ Case 8: Obvious Consumption Spike (Sudden 30x consumption surge due to pipe rupture)');
  const [spikeLoc] = await db
    .insert(serviceLocations)
    .values({
      addressLine1: '455 Spruce Court',
      city: 'Denver',
      state: 'CO',
      postalCode: '80210',
    })
    .returning();

  const [spikePoint] = await db
    .insert(servicePoints)
    .values({
      serviceLocationId: spikeLoc.id,
      identifier: 'Main Residence',
      notes: 'Water pipe leak in basement occurred on day -4',
    })
    .returning();

  const [spikeMeter] = await db
    .insert(meters)
    .values({
      servicePointId: spikePoint.id,
      serviceLocationId: spikeLoc.id,
      serialNumber: 'MTR-WAT-BURST-404',
      type: 'water',
      status: 'active',
      installedOn: daysAgoDateStr(240),
    })
    .returning();

  // 10 days of normal baseline (~0.45 m3/day), then 4 days of massive pipe leak (~25 m3/day)
  let currentWaterTotal = 410.0;
  for (let i = 14; i >= 0; i--) {
    if (i > 4) {
      currentWaterTotal += 0.45; // Normal daily use
    } else {
      currentWaterTotal += 28.5; // Severe continuous leak!
    }
    await db.insert(meterReadings).values({
      meterId: spikeMeter.id,
      readAt: daysAgo(i),
      readingValue: currentWaterTotal.toFixed(3),
    });
  }

  // Case 9: Stuck Dial / Frozen Meter (Checking in on schedule, but reading value is completely flat)
  console.log('  ▸ Case 9: Stuck Dial / Flatlined Meter (Reporting healthy telemetry, but reading value is frozen)');
  const [stuckLoc] = await db
    .insert(serviceLocations)
    .values({
      addressLine1: '612 Granite Road',
      city: 'Denver',
      state: 'CO',
      postalCode: '80212',
    })
    .returning();

  const [stuckPoint] = await db
    .insert(servicePoints)
    .values({
      serviceLocationId: stuckLoc.id,
      identifier: 'Unit 10',
      notes: 'Commercial kitchen gas line with suspected jammed mechanical counter',
    })
    .returning();

  const [stuckMeter] = await db
    .insert(meters)
    .values({
      servicePointId: stuckPoint.id,
      serviceLocationId: stuckLoc.id,
      serialNumber: 'MTR-GAS-JAMMED-202',
      type: 'gas',
      status: 'maintenance',
      installedOn: daysAgoDateStr(400),
    })
    .returning();

  // 14 consecutive daily readings with the exact same frozen value: 1420.550
  for (let i = 14; i >= 0; i--) {
    await db.insert(meterReadings).values({
      meterId: stuckMeter.id,
      readAt: daysAgo(i),
      readingValue: '1420.550',
    });
  }

  // Case 10: Data Collector Outage (Long reporting gap followed by resumed check-ins)
  console.log('  ▸ Case 10: Data Collector Outage (20-day communication blackout, followed by recovery)');
  const [outageLoc] = await db
    .insert(serviceLocations)
    .values({
      addressLine1: '908 Pinecrest Ridge',
      city: 'Denver',
      state: 'CO',
      postalCode: '80214',
    })
    .returning();

  const [outagePoint] = await db
    .insert(servicePoints)
    .values({
      serviceLocationId: outageLoc.id,
      identifier: 'Cabin 4',
      notes: 'Remote gateway transceiver lost power for 20 days during storm',
    })
    .returning();

  const [outageMeter] = await db
    .insert(meters)
    .values({
      servicePointId: outagePoint.id,
      serviceLocationId: outageLoc.id,
      serialNumber: 'MTR-ELEC-OUTAGE-505',
      type: 'electric',
      status: 'active',
      installedOn: daysAgoDateStr(300),
    })
    .returning();

  // Readings before outage (Day -45 to Day -21): steady consumption
  let elecCum = 5200.0;
  for (let i = 45; i >= 21; i--) {
    elecCum += 15.2;
    await db.insert(meterReadings).values({
      meterId: outageMeter.id,
      readAt: daysAgo(i),
      readingValue: elecCum.toFixed(3),
    });
  }

  // OUTAGE PERIOD: No readings recorded from Day -20 through Day -3 (gateway down)

  // Gateway restored: Day -2 through today. Notice the value jumped because the physical meter kept ticking!
  elecCum += 310.5; // 20 days worth of accumulated usage caught up on reconnection
  for (let i = 2; i >= 0; i--) {
    elecCum += 16.0;
    await db.insert(meterReadings).values({
      meterId: outageMeter.id,
      readAt: daysAgo(i),
      readingValue: elecCum.toFixed(3),
    });
  }

  console.log('\n========================================================================');
  console.log('🎉 SEEDING COMPLETE: All 10 demo scenarios populated successfully!');
  console.log('========================================================================\n');
}

async function main() {
  try {
    await seed();
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
    console.log('🔌 Closed database connection pool.');
  }
}

// Only run main directly if invoked via CLI
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  main();
}

