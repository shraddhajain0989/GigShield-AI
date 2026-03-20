// ============================================================================
// GigShield AI — Trigger Engine Standalone Runner
// ============================================================================
// Starts the trigger engine as a standalone background process.
// Can run independently from the main Express server.
//
// Usage: node src/services/trigger-engine/runner.js
// ============================================================================

require('dotenv').config();
const { testConnection } = require('../../config/db');
const logger = require('../../utils/logger');
const TriggerEngine = require('./index');

const engine = new TriggerEngine();

async function main() {
  logger.info('');
  logger.info('╔══════════════════════════════════════════════════════╗');
  logger.info('║  🛡️  GigShield AI — Trigger Engine (Standalone)      ║');
  logger.info('╚══════════════════════════════════════════════════════╝');
  logger.info('');

  // Test database connection
  const dbOk = await testConnection();
  if (!dbOk) {
    logger.error('Database connection failed. Exiting.');
    process.exit(1);
  }

  // Start the engine
  await engine.start();

  // Status endpoint (simple log every 5 minutes)
  setInterval(() => {
    const status = engine.getStatus();
    logger.info(`
    📊 ENGINE STATUS
    Running:      ${status.is_running}
    Scan cycles:  ${status.cycle_count}
    Triggers:     ${status.total_triggers_detected}
    Claims:       ${status.total_claims_created}
    Jobs:         ${status.jobs.map(j => `${j.name}(runs:${j.run_count}, errors:${j.error_count})`).join(', ')}
    `);
  }, 5 * 60 * 1000);
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Stopping trigger engine...');
  engine.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received. Stopping trigger engine...');
  engine.stop();
  process.exit(0);
});

process.on('unhandledRejection', (err) => {
  logger.error('Unhandled rejection in trigger engine:', err);
});

main().catch(err => {
  logger.error('Failed to start trigger engine:', err);
  process.exit(1);
});
