// ============================================================================
// GigShield AI — Trigger Detectors
// ============================================================================
// Each detector evaluates environmental data against configurable thresholds
// and returns a trigger verdict with severity, confidence, and evidence.
// ============================================================================

const logger = require('../../utils/logger');

// ── Default thresholds (overridable from DB trigger_thresholds table) ──
const DEFAULT_THRESHOLDS = {
  extreme_rain: {
    rainfall_3h_mm: 70,       // 3-hour rainfall threshold
    rainfall_1h_mm: 30,       // 1-hour intense rainfall
    forecast_24h_mm: 100,     // 24-hour forecast threshold
  },
  extreme_heat: {
    temperature_c: 42,        // temperature threshold
    feels_like_c: 45,         // feels-like threshold
  },
  air_pollution: {
    aqi: 50,                 // AQI threshold (lowered for testing)
    pm25: 50,                // PM2.5 threshold
  },
  flood: {
    flood_warning: true,      // government flood warning
    rainfall_3h_mm: 100,      // extreme rainfall indicating flash flood
  },
  curfew: {
    curfew_alert: true,       // government curfew notice
  },
  traffic: {
    congestion_index: 0.9,    // gridlock threshold
    avg_speed_kmh: 5,         // below 5 km/h = standstill
  },
};

// ══════════════════════════════════════════════════════════════════════
// RAINFALL TRIGGER
// ══════════════════════════════════════════════════════════════════════

function detectRainfall(envData, thresholds = {}) {
  const t = { ...DEFAULT_THRESHOLDS.extreme_rain, ...thresholds };
  const weather = envData.weather;
  const forecast = envData.rainfall_forecast;

  if (!weather) return null;

  const rain3h = weather.rainfall_3h || 0;
  const rain1h = weather.rainfall_1h || 0;
  const forecastTotal = forecast?.total_rainfall_mm || 0;

  let triggered = false;
  let severity = 'none';
  let confidence = 0;
  const evidence = { rain_1h_mm: rain1h, rain_3h_mm: rain3h, forecast_24h_mm: forecastTotal };

  // Check 3-hour rainfall
  if (rain3h >= t.rainfall_3h_mm) {
    triggered = true;
    confidence = Math.min(1.0, rain3h / (t.rainfall_3h_mm * 1.5));
    severity = rain3h >= t.rainfall_3h_mm * 1.5 ? 'severe' : 'moderate';
  }

  // Check 1-hour intense rainfall
  if (rain1h >= t.rainfall_1h_mm) {
    triggered = true;
    confidence = Math.max(confidence, Math.min(1.0, rain1h / (t.rainfall_1h_mm * 1.5)));
    severity = rain1h >= t.rainfall_1h_mm * 2 ? 'severe' : severity;
  }

  // Check forecast
  if (forecastTotal >= t.forecast_24h_mm) {
    triggered = true;
    confidence = Math.max(confidence, 0.7);
    evidence.forecast_triggered = true;
  }

  if (!triggered) return null;

  return {
    disruption_type: 'extreme_rain',
    triggered: true,
    severity,
    confidence: Math.round(confidence * 1000) / 1000,
    measured_value: Math.max(rain3h, rain1h),
    threshold_value: rain3h >= rain1h ? t.rainfall_3h_mm : t.rainfall_1h_mm,
    evidence,
  };
}

// ══════════════════════════════════════════════════════════════════════
// EXTREME HEAT TRIGGER
// ══════════════════════════════════════════════════════════════════════

function detectHeat(envData, thresholds = {}) {
  const t = { ...DEFAULT_THRESHOLDS.extreme_heat, ...thresholds };
  const weather = envData.weather;

  if (!weather) return null;

  const temp = weather.temperature || 0;
  const feelsLike = weather.feels_like || 0;

  let triggered = false;
  let severity = 'none';
  let confidence = 0;

  if (temp >= t.temperature_c || feelsLike >= t.feels_like_c) {
    triggered = true;
    const maxTemp = Math.max(temp, feelsLike);
    confidence = Math.min(1.0, (maxTemp - t.temperature_c + 5) / 15);
    severity = maxTemp >= t.temperature_c + 5 ? 'severe' : 'moderate';
  }

  if (!triggered) return null;

  return {
    disruption_type: 'extreme_heat',
    triggered: true,
    severity,
    confidence: Math.round(confidence * 1000) / 1000,
    measured_value: Math.max(temp, feelsLike),
    threshold_value: t.temperature_c,
    evidence: { temperature_c: temp, feels_like_c: feelsLike, humidity: weather.humidity },
  };
}

// ══════════════════════════════════════════════════════════════════════
// AIR POLLUTION TRIGGER
// ══════════════════════════════════════════════════════════════════════

function detectAirPollution(envData, thresholds = {}) {
  const t = { ...DEFAULT_THRESHOLDS.air_pollution, ...thresholds };
  const aqi = envData.aqi;

  if (!aqi) return null;

  const aqiValue = aqi.aqi || 0;
  const pm25 = aqi.pollutants?.pm25 || 0;

  let triggered = false;
  let severity = 'none';
  let confidence = 0;

  if (aqiValue >= t.aqi) {
    triggered = true;
    confidence = Math.min(1.0, aqiValue / 500);
    severity = aqiValue >= 400 ? 'severe' : 'moderate';
  }

  if (pm25 >= t.pm25) {
    triggered = true;
    confidence = Math.max(confidence, Math.min(1.0, pm25 / 400));
  }

  if (!triggered) return null;

  return {
    disruption_type: 'air_pollution',
    triggered: true,
    severity,
    confidence: Math.round(confidence * 1000) / 1000,
    measured_value: aqiValue,
    threshold_value: t.aqi,
    evidence: { aqi: aqiValue, pm25, dominant_pollutant: aqi.dominant_pollutant, station: aqi.station },
  };
}

// ══════════════════════════════════════════════════════════════════════
// FLOOD TRIGGER
// ══════════════════════════════════════════════════════════════════════

function detectFlood(envData, thresholds = {}) {
  const t = { ...DEFAULT_THRESHOLDS.flood, ...thresholds };
  const alerts = envData.alerts;
  const weather = envData.weather;

  let triggered = false;
  let severity = 'none';
  let confidence = 0;
  const evidence = {};

  // Check government flood warnings
  if (alerts?.alerts) {
    const floodAlerts = alerts.alerts.filter(a =>
      a.type === 'flood_warning' || a.type === 'flood_alert'
    );

    if (floodAlerts.length > 0) {
      triggered = true;
      severity = floodAlerts.some(a => a.severity === 'severe') ? 'severe' : 'moderate';
      confidence = severity === 'severe' ? 0.95 : 0.8;
      evidence.government_alerts = floodAlerts.map(a => ({
        title: a.title,
        severity: a.severity,
        source: a.source,
      }));
    }
  }

  // Check extreme rainfall indicating flash flood potential
  const rain3h = weather?.rainfall_3h || 0;
  if (rain3h >= t.rainfall_3h_mm) {
    triggered = true;
    confidence = Math.max(confidence, Math.min(1.0, rain3h / 150));
    severity = 'severe';
    evidence.flash_flood_rainfall_mm = rain3h;
  }

  if (!triggered) return null;

  return {
    disruption_type: 'flood',
    triggered: true,
    severity,
    confidence: Math.round(confidence * 1000) / 1000,
    measured_value: rain3h || (triggered ? 1 : 0),
    threshold_value: t.rainfall_3h_mm,
    evidence,
  };
}

// ══════════════════════════════════════════════════════════════════════
// CURFEW TRIGGER
// ══════════════════════════════════════════════════════════════════════

function detectCurfew(envData, thresholds = {}) {
  const alerts = envData.alerts;

  if (!alerts?.alerts) return null;

  const curfewAlerts = alerts.alerts.filter(a =>
    a.type === 'curfew' || a.type === 'section_144'
  );

  if (curfewAlerts.length === 0) return null;

  return {
    disruption_type: 'curfew',
    triggered: true,
    severity: 'severe',
    confidence: 0.95,
    measured_value: 1,
    threshold_value: 1,
    evidence: {
      alerts: curfewAlerts.map(a => ({
        title: a.title,
        source: a.source,
        description: a.description,
        expires_at: a.expires_at,
      })),
    },
  };
}

// ══════════════════════════════════════════════════════════════════════
// TRIGGER REGISTRY
// ══════════════════════════════════════════════════════════════════════

/**
 * Run all trigger detectors against environmental data.
 * Returns array of triggered disruptions.
 */
function evaluateAllTriggers(envData, customThresholds = {}) {
  const detectors = [
    { name: 'extreme_rain',  fn: detectRainfall,       thresholds: customThresholds.extreme_rain },
    { name: 'extreme_heat',  fn: detectHeat,           thresholds: customThresholds.extreme_heat },
    { name: 'air_pollution', fn: detectAirPollution,   thresholds: customThresholds.air_pollution },
    { name: 'flood',         fn: detectFlood,          thresholds: customThresholds.flood },
    { name: 'curfew',        fn: detectCurfew,         thresholds: customThresholds.curfew },
  ];

  const triggered = [];

  for (const detector of detectors) {
    try {
      const result = detector.fn(envData, detector.thresholds || {});
      if (result && result.triggered) {
        triggered.push(result);
      }
    } catch (err) {
      logger.error(`Trigger detector "${detector.name}" failed: ${err.message}`);
    }
  }

  return triggered;
}

module.exports = {
  evaluateAllTriggers,
  detectRainfall,
  detectHeat,
  detectAirPollution,
  detectFlood,
  detectCurfew,
  DEFAULT_THRESHOLDS,
};
