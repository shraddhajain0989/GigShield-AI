// ============================================================================
// GigShield AI — Database Migration Script
// Reads and executes the SQL schema file
// ============================================================================

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME || 'gigshield_ai',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
});

const migrate = async () => {
  const client = await pool.connect();

  try {
    console.log('🚀 Starting database migration...\n');

    // Check if the schema already has the users table
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'users'
      )
    `);

    if (tableCheck.rows[0].exists) {
      console.log('⚠️  Tables already exist. Adding missing columns if needed...\n');

      // Add password_hash column if it doesn't exist (our schema didn't have it)
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'users' AND column_name = 'password_hash'
          ) THEN
            ALTER TABLE users ADD COLUMN password_hash VARCHAR(256);
          END IF;
        END $$;
      `);

      // Add payouts table if it doesn't exist
      await client.query(`
        CREATE TABLE IF NOT EXISTS payouts (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          claim_id UUID REFERENCES claims(id) ON DELETE SET NULL,
          worker_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
          status VARCHAR(20) NOT NULL DEFAULT 'pending',
          razorpay_payout_id VARCHAR(100),
          upi_transaction_id VARCHAR(100),
          disbursed_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      console.log('✅ Schema updates applied.\n');
    } else {
      // Read the main schema file
      const schemaPath = path.join(__dirname, '..', '..', 'database', 'migrations', '001_initial_schema.sql');

      if (!fs.existsSync(schemaPath)) {
        console.error(`❌ Schema file not found: ${schemaPath}`);
        process.exit(1);
      }

      const schema = fs.readFileSync(schemaPath, 'utf8');

      // Execute the schema
      await client.query(schema);

      // Add password_hash column (not in original schema)
      await client.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(256);
      `);

      // Create payouts table
      await client.query(`
        CREATE TABLE IF NOT EXISTS payouts (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          claim_id UUID REFERENCES claims(id) ON DELETE SET NULL,
          worker_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
          status VARCHAR(20) NOT NULL DEFAULT 'pending',
          razorpay_payout_id VARCHAR(100),
          upi_transaction_id VARCHAR(100),
          disbursed_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      console.log('✅ Database schema created successfully.\n');
    }

    // List created tables
    const tables = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    console.log('📋 Tables in database:');
    tables.rows.forEach((row, i) => {
      console.log(`   ${i + 1}. ${row.table_name}`);
    });

    console.log(`\n✅ Migration complete. ${tables.rows.length} tables ready.\n`);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

migrate();
