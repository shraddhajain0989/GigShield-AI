const { Client } = require('pg');

async function test() {
  // Try connecting via Unix socket (PEER authentication)
  const client = new Client({
    user: 'gigshield',
    password: 'password',
    database: 'postgres',
  });

  try {
    console.log('--- Testing Peer Auth (Unix Socket) ---');
    await client.connect();
    console.log('✅ Connected as devv!');
    
    const dbs = await client.query('SELECT datname FROM pg_database');
    console.log('Databases:', dbs.rows.map(r => r.datname).join(', '));
    
    await client.end();
  } catch (err) {
    console.error('❌ Failed:', err.message);
  }
}

test();
