// ============================================================================
// GigShield AI — Air Quality Index API Integration (WAQI)
// ============================================================================
// Fetches real-time air quality data from the World AQI Project.
// ============================================================================

const config = require('../../../config/env');
const logger = require('../../../utils/logger');

const API_KEY = config.aqiApiKey || 'demo';
const BASE_URL = 'https://api.waqi.info';

const AqiAPI = {
  /**
   * Fetch current AQI for a lat/lng coordinate.
   */
  async getCurrentAQI(lat, lng) {
    try {
      const url = `${BASE_URL}/feed/geo:${lat};${lng}/?token=${API_KEY}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`AQI API error: ${response.status}`);
      }

      const data = await response.json();

      if (data.status !== 'ok' || !data.data) {
        return _simulateAQI(lat, lng);
      }

      const d = data.data;
      return {
        source: 'waqi',
        aqi: d.aqi || 0,
        dominant_pollutant: d.dominentpol || 'pm25',
        pollutants: {
          pm25: d.iaqi?.pm25?.v || 0,
          pm10: d.iaqi?.pm10?.v || 0,
          o3: d.iaqi?.o3?.v || 0,
          no2: d.iaqi?.no2?.v || 0,
          so2: d.iaqi?.so2?.v || 0,
          co: d.iaqi?.co?.v || 0,
        },
        station: d.city?.name || 'Unknown',
        timestamp: new Date().toISOString(),
        coordinates: { lat, lng },
      };
    } catch (err) {
      logger.warn(`AQI API failed for (${lat}, ${lng}): ${err.message}`);
      return null;
    }
  },

  /**
   * Get AQI severity level.
   */
  getAQILevel(aqi) {
    if (aqi <= 50)  return { level: 'good',           color: 'green',   risk: 0.0 };
    if (aqi <= 100) return { level: 'moderate',        color: 'yellow',  risk: 0.1 };
    if (aqi <= 150) return { level: 'unhealthy_sensitive', color: 'orange', risk: 0.3 };
    if (aqi <= 200) return { level: 'unhealthy',       color: 'red',     risk: 0.6 };
    if (aqi <= 300) return { level: 'very_unhealthy',  color: 'purple',  risk: 0.8 };
    return               { level: 'hazardous',         color: 'maroon',  risk: 1.0 };
  },
};

module.exports = AqiAPI;
