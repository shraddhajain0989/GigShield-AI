// ============================================================================
// GigShield AI — Database Seed Script
// Populates zones, test workers, and sample policies
// ============================================================================

const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME || 'gigshield_ai',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
});

const seed = async () => {
  const client = await pool.connect();

  try {
    console.log('🌱 Starting database seeding...\n');

    // ── Seed Locations (Indian Metro Zones) ──
    console.log('📍 Seeding locations...');

    const zones = [
      { name: 'Koramangala',     city: 'Bangalore', state: 'Karnataka',    lat: 12.9352, lng: 77.6245, risk: 0.65, tier: 'high' },
      { name: 'HSR Layout',      city: 'Bangalore', state: 'Karnataka',    lat: 12.9116, lng: 77.6389, risk: 0.55, tier: 'medium' },
      { name: 'Indiranagar',     city: 'Bangalore', state: 'Karnataka',    lat: 12.9784, lng: 77.6408, risk: 0.50, tier: 'medium' },
      { name: 'Whitefield',      city: 'Bangalore', state: 'Karnataka',    lat: 12.9698, lng: 77.7500, risk: 0.70, tier: 'high' },
      { name: 'Andheri West',    city: 'Mumbai',    state: 'Maharashtra',  lat: 19.1364, lng: 72.8296, risk: 0.80, tier: 'critical' },
      { name: 'Bandra',          city: 'Mumbai',    state: 'Maharashtra',  lat: 19.0596, lng: 72.8295, risk: 0.75, tier: 'high' },
      { name: 'Powai',           city: 'Mumbai',    state: 'Maharashtra',  lat: 19.1176, lng: 72.9060, risk: 0.70, tier: 'high' },
      { name: 'Connaught Place', city: 'Delhi',     state: 'Delhi',        lat: 28.6315, lng: 77.2167, risk: 0.60, tier: 'high' },
      { name: 'Hauz Khas',       city: 'Delhi',     state: 'Delhi',        lat: 28.5494, lng: 77.2001, risk: 0.55, tier: 'medium' },
      { name: 'Dwarka',          city: 'Delhi',     state: 'Delhi',        lat: 28.5921, lng: 77.0460, risk: 0.50, tier: 'medium' },
      { name: 'Salt Lake',       city: 'Kolkata',   state: 'West Bengal',  lat: 22.5806, lng: 88.4176, risk: 0.85, tier: 'critical' },
      { name: 'Park Street',     city: 'Kolkata',   state: 'West Bengal',  lat: 22.5510, lng: 88.3528, risk: 0.75, tier: 'high' },
      { name: 'T Nagar',         city: 'Chennai',   state: 'Tamil Nadu',   lat: 13.0418, lng: 80.2341, risk: 0.60, tier: 'high' },
      { name: 'Anna Nagar',      city: 'Chennai',   state: 'Tamil Nadu',   lat: 13.0850, lng: 80.2101, risk: 0.55, tier: 'medium' },
      { name: 'Baner',           city: 'Pune',      state: 'Maharashtra',  lat: 18.5590, lng: 73.7868, risk: 0.45, tier: 'medium' },
      { name: 'Koregaon Park',   city: 'Pune',      state: 'Maharashtra',  lat: 18.5362, lng: 73.8932, risk: 0.50, tier: 'medium' },
      { name: 'Cyber City',      city: 'Gurugram',  state: 'Haryana',      lat: 28.4940, lng: 77.0866, risk: 0.55, tier: 'medium' },
      { name: 'Jubilee Hills',   city: 'Hyderabad', state: 'Telangana',    lat: 17.4326, lng: 78.4071, risk: 0.45, tier: 'medium' },
      { name: 'HITEC City',      city: 'Hyderabad', state: 'Telangana',    lat: 17.4435, lng: 78.3772, risk: 0.40, tier: 'low' },
      { name: 'Gomti Nagar',     city: 'Lucknow',   state: 'Uttar Pradesh',lat: 26.8556, lng: 80.9830, risk: 0.50, tier: 'medium' },
    ];

    const zoneIds = [];
    for (const z of zones) {
      const result = await client.query(`
        INSERT INTO locations (zone_name, city, state, latitude, longitude, radius_km, risk_score, risk_tier)
        VALUES ($1, $2, $3, $4, $5, 5.0, $6, $7)
        ON CONFLICT DO NOTHING
        RETURNING id
      `, [z.name, z.city, z.state, z.lat, z.lng, z.risk, z.tier]);

      if (result.rows.length > 0) {
        zoneIds.push(result.rows[0].id);
      }
    }
    console.log(`   ✅ ${zoneIds.length} zones seeded`);

    // ── Seed Admin User ──
    console.log('👤 Seeding admin user...');
    const adminPassword = await bcrypt.hash('admin123', 12);
    await client.query(`
      INSERT INTO users (phone, name, password_hash, platform, role, kyc_status, is_active)
      VALUES ('9999999999', 'Admin User', $1, 'other', 'admin', 'verified', TRUE)
      ON CONFLICT (phone) DO NOTHING
    `, [adminPassword]);
    console.log('   ✅ Admin user: phone=9999999999 password=admin123');

    // ── Seed Test Workers ──
    console.log('👷 Seeding test workers...');
    const workerPassword = await bcrypt.hash('worker123', 12);

    const testWorkers = [
      { phone: '9876543210', name: 'Raj Kumar',      platform: 'zomato',  zone: 0 },
      { phone: '9876543211', name: 'Priya Singh',    platform: 'swiggy',  zone: 1 },
      { phone: '9876543212', name: 'Amit Patel',     platform: 'amazon',  zone: 4 },
      { phone: '9876543213', name: 'Sunita Devi',    platform: 'zepto',   zone: 7 },
      { phone: '9876543214', name: 'Vikram Sharma',  platform: 'blinkit', zone: 10 },
    ];

    for (const w of testWorkers) {
      const zoneId = zoneIds[w.zone] || zoneIds[0] || null;
      await client.query(`
        INSERT INTO users (phone, name, password_hash, platform, zone_id, role, kyc_status, is_active, upi_id)
        VALUES ($1, $2, $3, $4, $5, 'worker', 'verified', TRUE, $6)
        ON CONFLICT (phone) DO NOTHING
      `, [w.phone, w.name, workerPassword, w.platform, zoneId, `${w.phone}@upi`]);
    }
    console.log(`   ✅ ${testWorkers.length} test workers seeded (password: worker123)`);

    // ── Seed Sample Disruption Trigger ──
    console.log('⚡ Seeding sample trigger...');
    if (zoneIds.length > 0) {
      await client.query(`
        INSERT INTO disruption_triggers
          (zone_id, disruption_type, measured_value, threshold_value, ml_confidence, status, severity)
        VALUES ($1, 'extreme_rain', 85.5, 70.0, 0.920, 'confirmed', 'severe')
      `, [zoneIds[4]]); // Andheri West, Mumbai
      console.log('   ✅ Sample rain trigger seeded for Andheri West, Mumbai');
    }

    console.log('\n🎉 Database seeding complete!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Test Credentials:');
    console.log('  Admin  → phone: 9999999999  password: admin123');
    console.log('  Worker → phone: 9876543210  password: worker123');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (err) {
    console.error('❌ Seeding failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

seed();
