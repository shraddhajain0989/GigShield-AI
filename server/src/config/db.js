// ============================================================================
// GigShield AI — PostgreSQL Connection Pool
// ============================================================================

const { Pool } = require('pg');
const config = require('./env');
const logger = require('../utils/logger');

const poolConfig = config.db.url
  ? {
      connectionString: config.db.url,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    }
  : {
      host: config.db.host,
      port: config.db.port,
      database: config.db.database,
      user: config.db.user,
      password: config.db.password,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };

const pool = new Pool(poolConfig);

// Log pool events
pool.on('connect', () => {
  logger.debug('New client connected to PostgreSQL');
});

pool.on('error', (err) => {
  logger.error('Unexpected PostgreSQL pool error:', err);
  process.exit(-1);
});

/**
 * Execute a query with parameter binding
 * @param {string} text - SQL query string
 * @param {Array} params - Query parameters
 * @returns {Promise<object>} Query result
 */
const query = async (text, params) => {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  logger.debug(`Query executed in ${duration}ms — rows: ${result.rowCount}`);
  return result;
};

/**
 * Get a client from the pool for transactions
 * @returns {Promise<object>} Pool client
 */
const getClient = async () => {
  const client = await pool.connect();
  return client;
};

/**
 * Test database connectivity
 */
const testConnection = async () => {
  try {
    const result = await pool.query('SELECT NOW()');
    logger.info(`✅ PostgreSQL connected — ${result.rows[0].now}`);
    return true;
  } catch (err) {
    logger.error('❌ PostgreSQL connection failed:', err.message);
    return false;
  }
};

module.exports = { pool, query, getClient, testConnection };
