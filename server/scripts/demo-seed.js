// ============================================================================
// GigShield AI — Demo Seed Script
// ============================================================================
// Seeds the database with demo data for showcasing the platform.
//
// Usage: node scripts/demo-seed.js
// ============================================================================

require('dotenv').config();
const { query, testConnection } = require('../src/config/db');
const bcrypt = require('bcryptjs');
const { generatePolicyNumber, getCurrentWeekRange, getPayoutAmount } = require('../src/utils/helpers');
const logger = require('../src/utils/logger');

async function seed() {
  logger.info('');
  logger.info('╔══════════════════════════════════════════════════════╗');
  logger.info('║  🌱 GigShield AI — Demo Seed                        ║');
  logger.info('╚══════════════════════════════════════════════════════╝');

  const ok = await testConnection();
  if (!ok) { logger.error('DB connection failed.'); process.exit(1); }

  const password = await bcrypt.hash('worker123', 10);
  const adminPass = await bcrypt.hash('admin123', 10);
  const { weekStart, weekEnd } = getCurrentWeekRange();

  // ── 1. Demo Zones ──
  logger.info('📍 Creating demo zones...');
  const zones = [
    { name: 'Andheri West',   city: 'Mumbai',    state: 'Maharashtra',   lat: 19.1364, lng: 72.8296, risk: 0.75, flood: 0.8  },
    { name: 'Koramangala',    city: 'Bengaluru',  state: 'Karnataka',    lat: 12.9352, lng: 77.6245, risk: 0.45, flood: 0.3  },
    { name: 'Connaught Place',city: 'New Delhi',  state: 'Delhi',        lat: 28.6315, lng: 77.2167, risk: 0.85, flood: 0.5  },
    { name: 'Salt Lake',      city: 'Kolkata',    state: 'West Bengal',  lat: 22.5808, lng: 88.4186, risk: 0.70, flood: 0.9  },
    { name: 'T. Nagar',       city: 'Chennai',    state: 'Tamil Nadu',   lat: 13.0418, lng: 80.2341, risk: 0.65, flood: 0.7  },
    { name: 'Baner',          city: 'Pune',       state: 'Maharashtra',  lat: 18.5590, lng: 73.7868, risk: 0.40, flood: 0.2  },
  ];

  const zoneIds = [];
  for (const z of zones) {
    const { rows } = await query(
      `INSERT INTO locations (zone_name, city, state, latitude, longitude, risk_score, flood_risk, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
       ON CONFLICT (zone_name) DO UPDATE SET risk_score = $6
       RETURNING id`,
      [z.name, z.city, z.state, z.lat, z.lng, z.risk, z.flood]
    );
    zoneIds.push(rows[0].id);
  }
  logger.info(`   ✓ ${zoneIds.length} zones created`);

  // ── 2. Admin User ──
  logger.info('👤 Creating admin user...');
  const { rows: [admin] } = await query(
    `INSERT INTO users (name, phone, password_hash, role, platform, is_active)
     VALUES ('Admin GigShield', '9999999999', $1, 'admin', 'other', TRUE)
     ON CONFLICT (phone) DO UPDATE SET password_hash = $1
     RETURNING id`,
    [adminPass]
  );
  logger.info(`   ✓ Admin created (phone: 9999999999 / pass: admin123)`);

  // ── 3. Demo Workers ──
  logger.info('👷 Creating demo workers...');
  const workers = [
    { name: 'Rajesh Kumar',     phone: '9876543210', platform: 'zomato',  zone: 0 },
    { name: 'Priya Sharma',     phone: '9876543211', platform: 'swiggy',  zone: 1 },
    { name: 'Arjun Patel',      phone: '9876543212', platform: 'amazon',  zone: 2 },
    { name: 'Deepa Nair',       phone: '9876543213', platform: 'zepto',   zone: 3 },
    { name: 'Vikram Singh',     phone: '9876543214', platform: 'blinkit', zone: 4 },
    { name: 'Anita Devi',       phone: '9876543215', platform: 'zomato',  zone: 5 },
  ];

  const workerIds = [];
  for (const w of workers) {
    const { rows } = await query(
      `INSERT INTO users (name, phone, password_hash, role, platform, zone_id, upi_id, is_active)
       VALUES ($1, $2, $3, 'worker', $4, $5, $6, TRUE)
       ON CONFLICT (phone) DO UPDATE SET zone_id = $5, password_hash = $3
       RETURNING id`,
      [w.name, w.phone, password, w.platform, zoneIds[w.zone], `${w.phone}@upi`]
    );
    workerIds.push(rows[0].id);
  }
  logger.info(`   ✓ ${workerIds.length} workers created (pass: worker123)`);

  // ── 4. Active Policies ──
  logger.info('📋 Creating active policies...');
  const disruptions = ['extreme_rain', 'flood', 'air_pollution', 'extreme_heat', 'curfew', 'extreme_rain'];
  const tiers = ['standard', 'premium', 'basic', 'standard', 'premium', 'basic'];

  for (let i = 0; i < workerIds.length; i++) {
    const { rows: existing } = await query(
      `SELECT id FROM policies WHERE worker_id = $1 AND week_start = $2 AND disruption_type = $3 LIMIT 1`,
      [workerIds[i], weekStart, disruptions[i]]
    );
    if (existing.length > 0) continue;

    const payout = getPayoutAmount(tiers[i]);
    const premium = Math.round(payout * 0.06); // ~6% of payout
    await query(
      `INSERT INTO policies
        (policy_number, worker_id, zone_id, disruption_type, coverage_tier,
         premium_amount, payout_amount, week_start, week_end, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')`,
      [
        generatePolicyNumber(), workerIds[i], zoneIds[i],
        disruptions[i], tiers[i], premium, payout, weekStart, weekEnd,
      ]
    );
  }
  logger.info(`   ✓ ${workerIds.length} active policies for this week`);

  // ── 5. Wallets ──
  logger.info('💰 Creating worker wallets...');
  for (const wId of workerIds) {
    await query(
      `INSERT INTO worker_wallets (worker_id, balance, total_credited, total_debited)
       VALUES ($1, 0, 0, 0)
       ON CONFLICT (worker_id) DO NOTHING`,
      [wId]
    );
  }
  logger.info(`   ✓ ${workerIds.length} wallets initialized`);

  logger.info('');
  logger.info('╔══════════════════════════════════════════════════════╗');
  logger.info('║  ✅ Demo seed complete!                              ║');
  logger.info('║                                                      ║');
  logger.info('║  Admin:  9999999999 / admin123                       ║');
  logger.info('║  Workers: 9876543210–15 / worker123                  ║');
  logger.info('║  Zones:  Mumbai, Bengaluru, Delhi, Kolkata,          ║');
  logger.info('║          Chennai, Pune                               ║');
  logger.info('╚══════════════════════════════════════════════════════╝');

  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
