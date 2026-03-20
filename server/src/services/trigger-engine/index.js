// ============================================================================
// GigShield AI — Trigger Engine Orchestrator
// ============================================================================
// Main orchestrator that ties together:
//   - Cron scheduler (timing)
//   - API aggregator (data fetching)
//   - Trigger detectors (threshold evaluation)
//   - Claim processor (policy matching → fraud → payout)
//
// Runs as a background service polling all active zones.
// ============================================================================

const { query } = require('../../config/db');
const logger = require('../../utils/logger');
const Scheduler = require('./scheduler');
const { APIAggregator } = require('./apis');
const { evaluateAllTriggers } = require('./triggers');
const ClaimProcessor = require('./processor');

class TriggerEngine {
  constructor() {
    this.scheduler = new Scheduler();
    this.isRunning = false;
    this.cycleCount = 0;
    this.totalTriggersDetected = 0;
    this.totalClaimsCreated = 0;
  }

  /**
   * Initialize and start the trigger engine.
   */
  async start() {
    logger.info(`
    ╔══════════════════════════════════════════════════════╗
    ║     ⚡ GigShield AI — Trigger Engine Starting        ║
    ╚══════════════════════════════════════════════════════╝
    `);

    this.isRunning = true;

    // ── Register cron jobs ──

    // Primary: Environmental scan every 10 minutes
    this.scheduler.register(
      'environmental-scan',
      10 * 60 * 1000,  // 10 minutes
      () => this.runEnvironmentalScan(),
      { runImmediately: true }
    );

    // Secondary: Policy expiry check every hour
    this.scheduler.register(
      'policy-expiry',
      60 * 60 * 1000,  // 1 hour
      () => this.runPolicyExpiryCheck(),
      { runImmediately: false }
    );

    // Tertiary: AQI fast-check every 30 minutes
    // (AQI can spike rapidly in Delhi/NCR)
    this.scheduler.register(
      'aqi-rapid-check',
      30 * 60 * 1000,  // 30 minutes
      () => this.runAQIRapidCheck(),
      { runImmediately: false }
    );

    // Start all scheduled jobs
    this.scheduler.start();
  }

  /**
   * Stop the engine gracefully.
   */
  stop() {
    this.isRunning = false;
    this.scheduler.stop();
    logger.info('Trigger engine stopped.');
  }

  /**
   * Get engine status for admin dashboard.
   */
  getStatus() {
    return {
      is_running: this.isRunning,
      cycle_count: this.cycleCount,
      total_triggers_detected: this.totalTriggersDetected,
      total_claims_created: this.totalClaimsCreated,
      jobs: this.scheduler.getStatus(),
    };
  }

  // ══════════════════════════════════════════════════════════════════
  // MAIN SCAN JOB
  // ══════════════════════════════════════════════════════════════════

  /**
   * Primary job: scan all active zones for disruptions.
   */
  async runEnvironmentalScan() {
    this.cycleCount++;
    const cycleId = this.cycleCount;
    const startTime = Date.now();

    logger.info(`\n${'═'.repeat(60)}`);
    logger.info(`🔄 ENVIRONMENTAL SCAN #${cycleId} — ${new Date().toISOString()}`);
    logger.info('═'.repeat(60));

    try {
      // Get all active zones
      const zones = await this._getActiveZones();
      logger.info(`   Scanning ${zones.length} active zones...`);

      let totalTriggers = 0;
      let totalClaims = 0;

      for (const zone of zones) {
        try {
          // Step 1: Fetch environmental data
          const envData = await APIAggregator.fetchZoneData(zone);

          // Step 2: Evaluate all triggers
          const triggers = evaluateAllTriggers(envData);

          if (triggers.length === 0) {
            logger.debug(`   ✓ ${zone.zone_name}: No disruptions detected`);
            continue;
          }

          logger.info(`   ⚡ ${zone.zone_name}: ${triggers.length} trigger(s) detected`);
          totalTriggers += triggers.length;

          // Step 3: Process each trigger
          for (const trigger of triggers) {
            const result = await ClaimProcessor.process(trigger, zone, envData);
            totalClaims += result.claims_created;
          }

        } catch (zoneErr) {
          logger.error(`   ✗ Error scanning ${zone.zone_name}: ${zoneErr.message}`);
        }
      }

      this.totalTriggersDetected += totalTriggers;
      this.totalClaimsCreated += totalClaims;

      const duration = Date.now() - startTime;
      logger.info(`\n   📊 Scan #${cycleId} complete in ${duration}ms`);
      logger.info(`   Triggers: ${totalTriggers} | Claims: ${totalClaims}`);
      logger.info('═'.repeat(60) + '\n');

    } catch (err) {
      logger.error(`Environmental scan #${cycleId} failed: ${err.message}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // AQI RAPID CHECK (for Delhi/NCR smog spikes)
  // ══════════════════════════════════════════════════════════════════

  async runAQIRapidCheck() {
    try {
      const zones = await this._getActiveZones();
      
      // Only check zones with active air_pollution policies
      const { rows: aqiZones } = await query(`
        SELECT DISTINCT l.* FROM locations l
        JOIN policies p ON l.id = p.zone_id
        WHERE p.disruption_type = 'air_pollution'
          AND p.status = 'active'
          AND l.is_active = TRUE
          AND CURRENT_DATE BETWEEN p.week_start AND p.week_end
      `);

      if (aqiZones.length === 0) return;

      logger.info(`🌫 AQI Rapid Check: ${aqiZones.length} zones with active AQI policies`);

      const { AqiAPI } = require('./apis');

      for (const zone of aqiZones) {
        const aqi = await AqiAPI.getCurrentAQI(zone.latitude, zone.longitude);
        if (aqi.aqi >= 300) {
          logger.warn(`   ⚠️ HAZARDOUS AQI ${aqi.aqi} in ${zone.zone_name}`);

          // Build minimal env data for trigger evaluation
          const envData = { aqi, weather: null, traffic: null, alerts: null };
          const triggers = evaluateAllTriggers(envData);

          for (const trigger of triggers) {
            await ClaimProcessor.process(trigger, zone, envData);
          }
        }
      }
    } catch (err) {
      logger.error(`AQI rapid check failed: ${err.message}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // POLICY EXPIRY JOB
  // ══════════════════════════════════════════════════════════════════

  async runPolicyExpiryCheck() {
    try {
      const { rows } = await query(`
        UPDATE policies
        SET status = 'expired', updated_at = NOW()
        WHERE status = 'active' AND week_end < CURRENT_DATE
        RETURNING id, policy_number
      `);

      if (rows.length > 0) {
        logger.info(`📅 Expired ${rows.length} policies past their week_end date.`);
      }
    } catch (err) {
      logger.error(`Policy expiry check failed: ${err.message}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════════════

  async _getActiveZones() {
    const { rows } = await query(`
      SELECT l.* FROM locations l
      WHERE l.is_active = TRUE
      ORDER BY l.risk_score DESC
    `);
    return rows;
  }
}

module.exports = TriggerEngine;
