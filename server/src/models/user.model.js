// ============================================================================
// GigShield AI — User Model (Database Queries)
// ============================================================================

const { query } = require('../config/db');
const bcrypt = require('bcryptjs');

const UserModel = {
  /**
   * Create a new worker/user
   */
  async create({ phone, name, password, platform, language = 'en', role = 'worker' }) {
    const hashedPassword = await bcrypt.hash(password, 12);

    const sql = `
      INSERT INTO users (phone, name, password_hash, platform, language, role, kyc_status, fraud_score, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, 'pending', 0.000, TRUE)
      RETURNING id, phone, name, platform, language, role, kyc_status, is_active, created_at
    `;
    const result = await query(sql, [phone, name, hashedPassword, platform, language, role]);
    return result.rows[0];
  },

  /**
   * Find user by phone number
   */
  async findByPhone(phone) {
    const sql = `
      SELECT id, phone, name, password_hash, platform, zone_id, upi_id,
             language, kyc_status, fraud_score, role, is_active, created_at
      FROM users WHERE phone = $1
    `;
    const result = await query(sql, [phone]);
    return result.rows[0] || null;
  },

  /**
   * Find user by ID
   */
  async findById(id) {
    const sql = `
      SELECT u.id, u.phone, u.name, u.platform, u.zone_id, u.upi_id,
             u.language, u.kyc_status, u.kyc_documents, u.fraud_score,
             u.device_fingerprint, u.role, u.is_active, u.last_login_at,
             u.created_at, u.updated_at,
             l.zone_name, l.city, l.state, l.risk_tier
      FROM users u
      LEFT JOIN locations l ON u.zone_id = l.id
      WHERE u.id = $1
    `;
    const result = await query(sql, [id]);
    return result.rows[0] || null;
  },

  /**
   * Update user profile
   */
  async updateProfile(id, fields) {
    const allowedFields = ['name', 'upi_id', 'language', 'platform', 'device_fingerprint'];
    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(fields)) {
      if (allowedFields.includes(key) && value !== undefined) {
        setClauses.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (setClauses.length === 0) return null;

    values.push(id);
    const sql = `
      UPDATE users SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, phone, name, platform, zone_id, upi_id, language, kyc_status, role
    `;
    const result = await query(sql, values);
    return result.rows[0];
  },

  /**
   * Assign worker to a zone
   */
  async assignZone(userId, zoneId) {
    const sql = `
      UPDATE users SET zone_id = $1 WHERE id = $2
      RETURNING id, phone, name, zone_id
    `;
    const result = await query(sql, [zoneId, userId]);
    return result.rows[0];
  },

  /**
   * Update KYC status
   */
  async updateKyc(userId, status, documents = null) {
    const sql = `
      UPDATE users
      SET kyc_status = $1,
          kyc_documents = COALESCE($2, kyc_documents)
      WHERE id = $3
      RETURNING id, kyc_status, kyc_documents
    `;
    const result = await query(sql, [status, documents ? JSON.stringify(documents) : null, userId]);
    return result.rows[0];
  },

  /**
   * Update last login timestamp
   */
  async updateLastLogin(userId) {
    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [userId]);
  },

  /**
   * Get all workers (admin)
   */
  async findAll({ page = 1, limit = 20, platform, kycStatus, role = 'worker' }) {
    let sql = `
      SELECT u.id, u.phone, u.name, u.platform, u.zone_id, u.kyc_status,
             u.fraud_score, u.role, u.is_active, u.created_at,
             l.zone_name, l.city, l.risk_tier
      FROM users u
      LEFT JOIN locations l ON u.zone_id = l.id
      WHERE u.role = $1
    `;
    const values = [role];
    let paramIndex = 2;

    if (platform) {
      sql += ` AND u.platform = $${paramIndex}`;
      values.push(platform);
      paramIndex++;
    }

    if (kycStatus) {
      sql += ` AND u.kyc_status = $${paramIndex}`;
      values.push(kycStatus);
      paramIndex++;
    }

    sql += ` ORDER BY u.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    values.push(limit, (page - 1) * limit);

    const result = await query(sql, values);

    // Get total count
    let countSql = `SELECT COUNT(*) FROM users WHERE role = $1`;
    const countValues = [role];
    if (platform) {
      countSql += ` AND platform = $2`;
      countValues.push(platform);
    }
    const countResult = await query(countSql, countValues);

    return {
      workers: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
    };
  },
};

module.exports = UserModel;
