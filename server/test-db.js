const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'gigshield_ai',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
});

async function test() {
  console.log('--- Testing DB Connection ---');
  console.log('Host:', process.env.DB_HOST);
  console.log('User:', process.env.DB_USER);
  console.log('DB:', process.env.DB_NAME);

  try {
    const client = await pool.connect();
    console.log('✅ Connection Successful!');
    const res = await client.query('SELECT NOW()');
    console.log('Server Time:', res.rows[0].now);
    
    const dbs = await client.query('SELECT datname FROM pg_database');
    console.log('Available Databases:', dbs.rows.map(r => r.datname).join(', '));
    
    client.release();
  } catch (err) {
    console.error('❌ Connection Failed:', err.message);
    if (err.code === '28P01') {
      console.log('Suggestion: Password authentication failed. Check if the password "gigshield_dev_2026" is correct for user "postgres".');
    } else if (err.code === '3D000') {
      console.log('Suggestion: Database "gigshield_ai" does not exist.');
    }
  } finally {
    await pool.end();
  }
}

test();
