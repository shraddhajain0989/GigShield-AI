// ============================================================================
// GigShield AI — Server Entry Point
// ============================================================================

const app = require('./src/app');
const config = require('./src/config/env');
const { testConnection } = require('./src/config/db');
const logger = require('./src/utils/logger');

const PORT = config.port;

const startServer = async () => {
  // Test database connection
  const dbConnected = await testConnection();
  if (!dbConnected) {
    logger.error('Failed to connect to database. Server not started.');
    process.exit(1);
  }

  // Start Express server
  app.listen(PORT, () => {
    logger.info(`
    ╔══════════════════════════════════════════════════════╗
    ║         🛡️  GigShield AI — API Server               ║
    ╠══════════════════════════════════════════════════════╣
    ║  Environment : ${config.nodeEnv.padEnd(37)}║
    ║  Port        : ${String(PORT).padEnd(37)}║
    ║  Health      : http://localhost:${PORT}/api/health${' '.repeat(Math.max(0, 13 - String(PORT).length))}║
    ║  API Base    : http://localhost:${PORT}/api/v1${' '.repeat(Math.max(0, 16 - String(PORT).length))}║
    ╚══════════════════════════════════════════════════════╝
    `);
  });
};

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received. Shutting down gracefully...');
  process.exit(0);
});

process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Rejection:', err);
  process.exit(1);
});

startServer();
