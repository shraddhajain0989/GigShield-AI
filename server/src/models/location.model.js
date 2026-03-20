// ============================================================================
// GigShield AI — Location / Zone Model
// ============================================================================

const { query } = require('../config/db');

const LocationModel = {
  /**
   * Get all active zones
   */
  async findAll() {
    const sql = `
      SELECT id, zone_name, city, state, pincode, latitude, longitude,
             radius_km, risk_score, risk_tier, is_active
      FROM locations
      WHERE is_active = TRUE
      ORDER BY city, zone_name
    `;
    const result = await query(sql);
    return result.rows;
  },

  /**
   * Find zone by ID
   */
  async findById(id) {
    const sql = `
      SELECT id, zone_name, city, state, pincode, latitude, longitude,
             radius_km, risk_score, risk_tier, meta, is_active
      FROM locations WHERE id = $1
    `;
    const result = await query(sql, [id]);
    return result.rows[0] || null;
  },

  /**
   * Find zones by city
   */
  async findByCity(city) {
    const sql = `
      SELECT id, zone_name, city, state, pincode, latitude, longitude,
             radius_km, risk_score, risk_tier
      FROM locations
      WHERE LOWER(city) = LOWER($1) AND is_active = TRUE
      ORDER BY zone_name
    `;
    const result = await query(sql, [city]);
    return result.rows;
  },

  /**
   * Find nearest zone by lat/lng
   */
  async findNearest(lat, lng) {
    const sql = `
      SELECT id, zone_name, city, state, risk_score, risk_tier,
             (6371 * acos(
               cos(radians($1)) * cos(radians(latitude)) *
               cos(radians(longitude) - radians($2)) +
               sin(radians($1)) * sin(radians(latitude))
             )) AS distance_km
      FROM locations
      WHERE is_active = TRUE
      ORDER BY distance_km
      LIMIT 1
    `;
    const result = await query(sql, [lat, lng]);
    return result.rows[0] || null;
  },

  /**
   * Create a new zone (admin)
   */
  async create({ zone_name, city, state, pincode, latitude, longitude, radius_km, risk_score, risk_tier }) {
    const sql = `
      INSERT INTO locations (zone_name, city, state, pincode, latitude, longitude, radius_km, risk_score, risk_tier)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    const result = await query(sql, [
      zone_name, city, state, pincode, latitude, longitude,
      radius_km || 5.0, risk_score || 0.5, risk_tier || 'medium',
    ]);
    return result.rows[0];
  },

  /**
   * Get zone risk statistics (admin)
   */
  async getRiskStats() {
    const sql = `
      SELECT
        risk_tier,
        COUNT(*) as zone_count,
        ROUND(AVG(risk_score)::numeric, 3) as avg_risk_score,
        COUNT(DISTINCT city) as cities
      FROM locations
      WHERE is_active = TRUE
      GROUP BY risk_tier
      ORDER BY
        CASE risk_tier
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
        END
    `;
    const result = await query(sql);
    return result.rows;
  },
};

module.exports = LocationModel;
