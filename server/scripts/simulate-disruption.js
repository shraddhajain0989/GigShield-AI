// ============================================================================
// GigShield AI — Disruption Simulator
// ============================================================================
// Injects simulated disruption events into the trigger engine pipeline.
// This bypasses external API calls and directly evaluates trigger conditions
// against user-selected disruption scenarios.
//
// Usage:
//   node scripts/simulate-disruption.js --type heavy_rain --zone "Andheri West"
//   node scripts/simulate-disruption.js --type all --zone all
//   node scripts/simulate-disruption.js --scenario monsoon
// ============================================================================

require('dotenv').config();
const { query, testConnection } = require('../src/config/db');
const { evaluateAllTriggers } = require('../src/services/trigger-engine/triggers');
const ClaimProcessor = require('../src/services/trigger-engine/processor');
const logger = require('../src/utils/logger');

// ══════════════════════════════════════════════════════════════════════
// DISRUPTION SCENARIOS
// ══════════════════════════════════════════════════════════════════════

const SCENARIOS = {
  heavy_rain: {
    name: '🌧️ Heavy Rainfall (>70mm/3h)',
    envData: {
      weather: {
        temperature: 26, feels_like: 28, humidity: 95,
        rainfall_1h: 35, rainfall_3h: 85, wind_speed: 40,
        description: 'heavy intensity rain',
      },
      rainfall_forecast: { total_rainfall_mm: 120, risk_level: 'high' },
      aqi: null, traffic: null, alerts: null,
    },
  },

  extreme_heat: {
    name: '🔥 Extreme Heat (>42°C)',
    envData: {
      weather: {
        temperature: 46, feels_like: 50, humidity: 15,
        rainfall_1h: 0, rainfall_3h: 0, wind_speed: 8,
        description: 'extreme heat wave',
      },
      aqi: null, traffic: null, alerts: null,
    },
  },

  hazardous_aqi: {
    name: '🌫️ Hazardous Air Quality (AQI > 400)',
    envData: {
      weather: { temperature: 22, feels_like: 20, humidity: 60 },
      aqi: {
        aqi: 450, level: 'Hazardous',
        dominant_pollutant: 'pm25',
        pollutants: { pm25: 380, pm10: 420, no2: 120 },
        station: 'DEMO — Simulated',
      },
      traffic: null, alerts: null,
    },
  },

  flood_warning: {
    name: '🌊 Flood Warning (Government Alert)',
    envData: {
      weather: {
        temperature: 24, feels_like: 24, humidity: 98,
        rainfall_1h: 50, rainfall_3h: 120, wind_speed: 55,
        description: 'extreme rain with flooding',
      },
      aqi: null, traffic: null,
      alerts: {
        alerts: [
          {
            type: 'flood_warning',
            title: 'NDMA Flood Alert — Red Warning',
            severity: 'severe',
            source: 'NDMA (Simulated)',
            description: 'Severe flooding expected. Avoid low-lying areas.',
            issued_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 24 * 3600000).toISOString(),
          },
        ],
      },
    },
  },

  curfew: {
    name: '🚫 Curfew / Section 144',
    envData: {
      weather: { temperature: 30, feels_like: 32, humidity: 60 },
      aqi: null, traffic: null,
      alerts: {
        alerts: [
          {
            type: 'section_144',
            title: 'Section 144 CrPC Imposed',
            severity: 'severe',
            source: 'District Magistrate (Simulated)',
            description: 'Section 144 imposed. Movement restricted until further notice.',
            issued_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 48 * 3600000).toISOString(),
          },
        ],
      },
    },
  },

  // ── Compound scenarios ──
  monsoon: {
    name: '🌀 Monsoon Chaos (Rain + Flood + Gridlock)',
    envData: {
      weather: {
        temperature: 25, feels_like: 27, humidity: 99,
        rainfall_1h: 60, rainfall_3h: 150, wind_speed: 70,
        description: 'torrential monsoon rain',
      },
      rainfall_forecast: { total_rainfall_mm: 200, risk_level: 'extreme' },
      aqi: null,
      traffic: { congestion_index: 0.95, avg_speed_kmh: 3, is_gridlock: true },
      alerts: {
        alerts: [
          { type: 'flood_warning', title: 'IMD Red Alert — Urban Flooding', severity: 'severe', source: 'IMD (Simulated)' },
        ],
      },
    },
  },

  delhi_winter: {
    name: '☁️ Delhi Winter Smog (AQI + Cold)',
    envData: {
      weather: { temperature: 8, feels_like: 3, humidity: 95, rainfall_1h: 0, rainfall_3h: 0 },
      aqi: {
        aqi: 500, level: 'Hazardous',
        dominant_pollutant: 'pm25',
        pollutants: { pm25: 480, pm10: 520, no2: 200 },
        station: 'DEMO — Delhi Winter',
      },
      traffic: { congestion_index: 0.85, avg_speed_kmh: 7 },
      alerts: null,
    },
  },
};

// ══════════════════════════════════════════════════════════════════════
// MAIN SIMULATION
// ══════════════════════════════════════════════════════════════════════

async function runSimulation(scenarioKey, targetZoneName) {
  const ok = await testConnection();
  if (!ok) { logger.error('DB failed.'); process.exit(1); }

  logger.info('');
  logger.info('╔══════════════════════════════════════════════════════╗');
  logger.info('║  ⚡ GigShield AI — Disruption Simulator              ║');
  logger.info('╚══════════════════════════════════════════════════════╝');

  // Get scenarios to run
  let scenariosToRun = [];
  if (scenarioKey === 'all') {
    scenariosToRun = Object.entries(SCENARIOS);
  } else if (SCENARIOS[scenarioKey]) {
    scenariosToRun = [[scenarioKey, SCENARIOS[scenarioKey]]];
  } else {
    logger.error(`Unknown scenario: "${scenarioKey}"`);
    logger.info(`Available: ${Object.keys(SCENARIOS).join(', ')}`);
    process.exit(1);
  }

  // Get zones
  let zones;
  if (targetZoneName === 'all') {
    const { rows } = await query(`SELECT * FROM locations WHERE is_active = TRUE`);
    zones = rows;
  } else {
    const { rows } = await query(`SELECT * FROM locations WHERE zone_name ILIKE $1`, [`%${targetZoneName}%`]);
    zones = rows;
    if (!zones.length) {
      logger.error(`No zone found matching: "${targetZoneName}"`);
      const { rows: all } = await query(`SELECT zone_name, city FROM locations WHERE is_active = TRUE`);
      logger.info(`Available zones: ${all.map(z => `${z.zone_name} (${z.city})`).join(', ')}`);
      process.exit(1);
    }
  }

  logger.info(`\n   Scenarios: ${scenariosToRun.map(s => s[1].name).join(', ')}`);
  logger.info(`   Zones:     ${zones.map(z => z.zone_name).join(', ')}\n`);

  let totalTriggers = 0;
  let totalClaims = 0;
  let totalPayouts = 0;

  for (const [key, scenario] of scenariosToRun) {
    logger.info(`\n${'─'.repeat(60)}`);
    logger.info(`🎬 SCENARIO: ${scenario.name}`);
    logger.info('─'.repeat(60));

    for (const zone of zones) {
      logger.info(`\n   📍 Zone: ${zone.zone_name} (${zone.city})`);

      // Step 1: Evaluate triggers
      const triggers = evaluateAllTriggers(scenario.envData);

      if (triggers.length === 0) {
        logger.info('   ⊘ No triggers matched for this zone.');
        continue;
      }

      logger.info(`   ⚡ ${triggers.length} trigger(s) detected: ${triggers.map(t => t.disruption_type).join(', ')}`);
      totalTriggers += triggers.length;

      // Step 2: Process each trigger through the claim pipeline
      for (const trigger of triggers) {
        logger.info(`\n   ──── Processing: ${trigger.disruption_type} (severity: ${trigger.severity}) ────`);

        const result = await ClaimProcessor.process(trigger, zone, scenario.envData);

        totalClaims += result.claims_created;
        totalPayouts += result.payouts_initiated;

        logger.info(`   Claims: ${result.claims_created} | Approved: ${result.claims_auto_approved} | Flagged: ${result.claims_flagged} | Payout: ₹${result.total_payout_amount}`);
      }
    }
  }

  // ── Final Summary ──
  logger.info(`\n${'═'.repeat(60)}`);
  logger.info('📊 SIMULATION SUMMARY');
  logger.info('═'.repeat(60));
  logger.info(`   Triggers Detected:  ${totalTriggers}`);
  logger.info(`   Claims Created:     ${totalClaims}`);
  logger.info(`   Payouts Initiated:  ${totalPayouts}`);
  logger.info('═'.repeat(60));

  process.exit(0);
}

// ══════════════════════════════════════════════════════════════════════
// CLI PARSING
// ══════════════════════════════════════════════════════════════════════

const args = process.argv.slice(2);
let scenarioKey = 'heavy_rain';
let zoneName = 'all';

for (let i = 0; i < args.length; i++) {
  if ((args[i] === '--type' || args[i] === '--scenario') && args[i + 1]) {
    scenarioKey = args[i + 1]; i++;
  } else if (args[i] === '--zone' && args[i + 1]) {
    zoneName = args[i + 1]; i++;
  } else if (args[i] === '--help') {
    console.log(`
  GigShield AI — Disruption Simulator

  Usage:
    node scripts/simulate-disruption.js [options]

  Options:
    --type <scenario>   Disruption type (default: heavy_rain)
    --zone <name>       Zone name or "all" (default: all)
    --help              Show this help

  Scenarios:
    heavy_rain       🌧️  Rainfall > 70mm/3h
    extreme_heat     🔥  Temperature > 42°C
    hazardous_aqi    🌫️  AQI > 400
    flood_warning    🌊  Government flood alert
    curfew           🚫  Section 144 imposed
    monsoon          🌀  Rain + Flood + Gridlock (compound)
    delhi_winter     ☁️  AQI 500 + Cold (compound)
    all              Run all scenarios
    `);
    process.exit(0);
  }
}

runSimulation(scenarioKey, zoneName).catch(err => {
  console.error(err);
  process.exit(1);
});
