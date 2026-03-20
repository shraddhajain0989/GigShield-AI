// ============================================================================
// GigShield AI — Request Validation Middleware
// ============================================================================

/**
 * Validate required fields in request body
 * @param {string[]} requiredFields - Array of required field names
 */
const validateBody = (requiredFields) => {
  return (req, res, next) => {
    const missing = [];

    for (const field of requiredFields) {
      if (req.body[field] === undefined || req.body[field] === null || req.body[field] === '') {
        missing.push(field);
      }
    }

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missing.join(', ')}`,
      });
    }

    next();
  };
};

/**
 * Validate ENUM field value
 * @param {string} field - Field name in request body
 * @param {string[]} allowedValues - Array of allowed values
 */
const validateEnum = (field, allowedValues) => {
  return (req, res, next) => {
    const value = req.body[field];
    if (value && !allowedValues.includes(value)) {
      return res.status(400).json({
        success: false,
        message: `Invalid value for '${field}'. Allowed: ${allowedValues.join(', ')}`,
      });
    }
    next();
  };
};

/**
 * Validate UUID format
 */
const validateUUID = (paramName) => {
  return (req, res, next) => {
    const value = req.params[paramName] || req.body[paramName];
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (value && !uuidRegex.test(value)) {
      return res.status(400).json({
        success: false,
        message: `Invalid UUID format for '${paramName}'.`,
      });
    }
    next();
  };
};

module.exports = { validateBody, validateEnum, validateUUID };
