// ============================================================================
// GigShield AI — External API Aggregator
// ============================================================================
// Single entry point to fetch all environmental data for a zone.
// ============================================================================

const WeatherAPI = require('./weather');
const AqiAPI = require('./aqi');
const TrafficAPI = require('./traffic');
const AlertsAPI = require('./alerts');
const logger = require('../../../utils/logger');

const APIAggregator = {
  /**
   * Fetch all environmental data for a zone in parallel.
   * Returns a unified environmental snapshot.
   */
  async fetchZoneData(zone) {
    const { latitude, longitude, zone_name, state } = zone;

    logger.debug(`Fetching environmental data for zone: ${zone_name}`);

    const [weather, aqi, traffic, alerts, rainfall] = await Promise.allSettled([
      WeatherAPI.getCurrentWeather(latitude, longitude),
      AqiAPI.getCurrentAQI(latitude, longitude),
      TrafficAPI.getCongestion(latitude, longitude, zone_name),
      AlertsAPI.getActiveAlerts(latitude, longitude, state),
      WeatherAPI.getRainfallForecast(latitude, longitude),
    ]);

    return {
      zone_id: zone.id,
      zone_name,
      city: zone.city,
      state: zone.state,
      coordinates: { lat: latitude, lng: longitude },
      weather: weather.status === 'fulfilled' ? weather.value : null,
      aqi: aqi.status === 'fulfilled' ? aqi.value : null,
      traffic: traffic.status === 'fulfilled' ? traffic.value : null,
      alerts: alerts.status === 'fulfilled' ? alerts.value : null,
      rainfall_forecast: rainfall.status === 'fulfilled' ? rainfall.value : null,
      fetched_at: new Date().toISOString(),
      errors: [
        weather.status === 'rejected' ? `weather: ${weather.reason}` : null,
        aqi.status === 'rejected' ? `aqi: ${aqi.reason}` : null,
        traffic.status === 'rejected' ? `traffic: ${traffic.reason}` : null,
        alerts.status === 'rejected' ? `alerts: ${alerts.reason}` : null,
        rainfall.status === 'rejected' ? `rainfall: ${rainfall.reason}` : null,
      ].filter(Boolean),
    };
  },
};

module.exports = { APIAggregator, WeatherAPI, AqiAPI, TrafficAPI, AlertsAPI };
