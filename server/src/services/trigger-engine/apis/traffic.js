// ============================================================================
// GigShield AI — Traffic API Integration (Google Maps / Simulation)
// ============================================================================
// Fetches real-time traffic congestion data for delivery zones.
// ============================================================================

const config = require('../../../config/env');
const logger = require('../../../utils/logger');

const TrafficAPI = {
  /**
   * Fetch traffic congestion index for a zone.
   * Returns a 0-1 congestion score + gridlock detection.
   */
  async getCongestion(lat, lng, zoneName) {
    try {
      if (config.googleMapsKey) {
        return await _fetchGoogleTraffic(lat, lng);
      }
      return null;
    } catch (err) {
      logger.warn(`Traffic API failed for ${zoneName}: ${err.message}`);
      return null;
    }
  },

  /**
   * Check for complete traffic gridlock in a zone.
   */
  isGridlocked(congestionData) {
    return congestionData.congestion_index >= 0.9 ||
           congestionData.avg_speed_kmh < 5 ||
           congestionData.gridlock === true;
  },
};

// ── Google Maps integration (production) ──

async function _fetchGoogleTraffic(lat, lng) {
  const origin = `${lat},${lng}`;
  const destination = `${lat + 0.02},${lng + 0.02}`;  // ~2km away
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&departure_time=now&key=${config.googleMapsKey}`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.status !== 'OK' || !data.routes?.[0]?.legs?.[0]) {
    return null;
  }

  const leg = data.routes[0].legs[0];
  const normalDuration = leg.duration?.value || 600;
  const trafficDuration = leg.duration_in_traffic?.value || normalDuration;

  // Congestion ratio: how much slower than normal
  const congestionRatio = trafficDuration / normalDuration;
  const congestionIndex = Math.min(1.0, Math.max(0, (congestionRatio - 1.0) / 2.0));

  return {
    source: 'google_maps',
    congestion_index: Math.round(congestionIndex * 1000) / 1000,
    avg_speed_kmh: Math.round((leg.distance?.value / 1000) / (trafficDuration / 3600)),
    gridlock: congestionIndex >= 0.9,
    normal_duration_min: Math.round(normalDuration / 60),
    traffic_duration_min: Math.round(trafficDuration / 60),
    delay_factor: Math.round(congestionRatio * 100) / 100,
    timestamp: new Date().toISOString(),
  };
}

module.exports = TrafficAPI;
