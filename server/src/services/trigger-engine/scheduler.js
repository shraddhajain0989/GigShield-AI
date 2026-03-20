// ============================================================================
// GigShield AI — Cron Scheduler
// ============================================================================
// Manages scheduled jobs for the trigger engine.
// Uses native setInterval for lightweight scheduling.
// ============================================================================

const logger = require('../../utils/logger');

class Scheduler {
  constructor() {
    this.jobs = new Map();
    this.running = false;
  }

  /**
   * Register a recurring job.
   * @param {string} name - Job name
   * @param {number} intervalMs - Interval in milliseconds
   * @param {Function} handler - Async function to execute
   * @param {Object} options - { runImmediately: bool }
   */
  register(name, intervalMs, handler, options = {}) {
    if (this.jobs.has(name)) {
      logger.warn(`Job "${name}" already registered. Replacing.`);
      this.unregister(name);
    }

    this.jobs.set(name, {
      name,
      intervalMs,
      handler,
      intervalRef: null,
      isRunning: false,
      lastRun: null,
      runCount: 0,
      errorCount: 0,
      runImmediately: options.runImmediately || false,
    });

    logger.info(`📋 Job registered: "${name}" — every ${Math.round(intervalMs / 1000)}s`);
  }

  /**
   * Start all registered jobs.
   */
  start() {
    if (this.running) {
      logger.warn('Scheduler already running.');
      return;
    }

    this.running = true;
    logger.info(`\n🕐 Starting scheduler with ${this.jobs.size} jobs...\n`);

    for (const [name, job] of this.jobs) {
      // Run immediately if configured
      if (job.runImmediately) {
        this._executeJob(job);
      }

      // Set up interval
      job.intervalRef = setInterval(() => {
        this._executeJob(job);
      }, job.intervalMs);
    }
  }

  /**
   * Stop all jobs.
   */
  stop() {
    logger.info('🛑 Stopping scheduler...');
    this.running = false;

    for (const [name, job] of this.jobs) {
      if (job.intervalRef) {
        clearInterval(job.intervalRef);
        job.intervalRef = null;
      }
    }

    logger.info('Scheduler stopped.');
  }

  /**
   * Unregister a specific job.
   */
  unregister(name) {
    const job = this.jobs.get(name);
    if (job) {
      if (job.intervalRef) clearInterval(job.intervalRef);
      this.jobs.delete(name);
      logger.info(`Job "${name}" unregistered.`);
    }
  }

  /**
   * Get status of all jobs.
   */
  getStatus() {
    const status = [];
    for (const [name, job] of this.jobs) {
      status.push({
        name: job.name,
        interval_seconds: Math.round(job.intervalMs / 1000),
        is_running: job.isRunning,
        last_run: job.lastRun,
        run_count: job.runCount,
        error_count: job.errorCount,
      });
    }
    return status;
  }

  /**
   * Execute a single job with error handling and concurrency guard.
   */
  async _executeJob(job) {
    // Prevent overlapping runs
    if (job.isRunning) {
      logger.debug(`⏭ Skipping "${job.name}" — previous run still active.`);
      return;
    }

    job.isRunning = true;
    const startTime = Date.now();

    try {
      await job.handler();
      job.runCount++;
      job.lastRun = new Date().toISOString();

      const duration = Date.now() - startTime;
      logger.debug(`✓ Job "${job.name}" completed in ${duration}ms`);

    } catch (err) {
      job.errorCount++;
      logger.error(`✗ Job "${job.name}" failed: ${err.message}`);
    } finally {
      job.isRunning = false;
    }
  }
}

module.exports = Scheduler;
