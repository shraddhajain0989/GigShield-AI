-- ============================================================================
-- GigShield AI — Production PostgreSQL Schema
-- Version: 1.0.0
-- Description: Complete database schema for the AI-Powered Parametric
--              Insurance Platform for Gig Delivery Workers in India
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

CREATE TYPE platform_type AS ENUM (
    'zomato', 'swiggy', 'amazon', 'zepto', 'blinkit', 'dunzo', 'other'
);

CREATE TYPE kyc_status_type AS ENUM (
    'pending', 'submitted', 'verified', 'rejected'
);

CREATE TYPE coverage_tier_type AS ENUM (
    'basic', 'standard', 'premium'
);

CREATE TYPE disruption_type AS ENUM (
    'extreme_rain', 'extreme_heat', 'air_pollution', 'flood', 'curfew'
);

CREATE TYPE policy_status_type AS ENUM (
    'pending_payment', 'active', 'expired', 'cancelled', 'claimed'
);

CREATE TYPE claim_status_type AS ENUM (
    'auto_approved', 'under_review', 'approved', 'rejected', 'blocked'
);

CREATE TYPE payout_status_type AS ENUM (
    'pending', 'processing', 'disbursed', 'failed', 'reversed'
);

CREATE TYPE payment_type AS ENUM (
    'premium_collection', 'payout_disbursement', 'refund'
);

CREATE TYPE payment_method_type AS ENUM (
    'upi', 'card', 'wallet', 'net_banking'
);

CREATE TYPE payment_status_type AS ENUM (
    'initiated', 'processing', 'captured', 'failed', 'refunded'
);

CREATE TYPE trigger_status_type AS ENUM (
    'detected', 'confirmed', 'false_positive', 'expired'
);

CREATE TYPE fraud_flag_type AS ENUM (
    'location_spoof', 'multi_account', 'policy_gaming',
    'collusion_ring', 'ghost_worker', 'timing_anomaly'
);

CREATE TYPE fraud_resolution_type AS ENUM (
    'pending', 'cleared', 'confirmed_fraud', 'escalated'
);

CREATE TYPE risk_tier_type AS ENUM (
    'low', 'medium', 'high', 'critical'
);

-- ============================================================================
-- 1. LOCATIONS TABLE
--    Geographic zones used for risk assessment and trigger mapping
-- ============================================================================

CREATE TABLE locations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    zone_name       VARCHAR(100)   NOT NULL UNIQUE,
    city            VARCHAR(100)   NOT NULL,
    state           VARCHAR(100)   NOT NULL,
    pincode         VARCHAR(10),
    latitude        DECIMAL(10,7)  NOT NULL,
    longitude       DECIMAL(10,7)  NOT NULL,
    radius_km       DECIMAL(6,2)   NOT NULL DEFAULT 5.0,
    risk_score      DECIMAL(4,3)   NOT NULL DEFAULT 0.500
        CHECK (risk_score >= 0.000 AND risk_score <= 1.000),
    flood_risk      DECIMAL(4,3)   NOT NULL DEFAULT 0.500
        CHECK (flood_risk >= 0.000 AND flood_risk <= 1.000),
    risk_tier       risk_tier_type NOT NULL DEFAULT 'medium',
    meta            JSONB          DEFAULT '{}'::jsonb,
    -- Metadata: neighboring zones, special notes, boundary polygon coords
    is_active       BOOLEAN        NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_locations_city ON locations (city);
CREATE INDEX idx_locations_state ON locations (state);
CREATE INDEX idx_locations_pincode ON locations (pincode);
CREATE INDEX idx_locations_risk_tier ON locations (risk_tier);
CREATE INDEX idx_locations_coords ON locations (latitude, longitude);
CREATE INDEX idx_locations_active ON locations (is_active) WHERE is_active = TRUE;
CREATE INDEX idx_locations_meta ON locations USING GIN (meta);

COMMENT ON TABLE locations IS 'Geographic zones across Indian metros used for risk scoring and trigger detection';

-- ============================================================================
-- 2. USERS TABLE
--    Gig delivery workers (policyholders) and admin users
-- ============================================================================

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone           VARCHAR(15)    NOT NULL UNIQUE,
    email           VARCHAR(255),
    name            VARCHAR(150)   NOT NULL,
    aadhaar_hash    VARCHAR(128)   UNIQUE,
    -- SHA-512 hash of Aadhaar number (PII compliance)
    password_hash   VARCHAR(255),
    platform        platform_type  NOT NULL,
    zone_id         UUID           REFERENCES locations(id) ON DELETE SET NULL,
    upi_id          VARCHAR(100),
    language        VARCHAR(5)     NOT NULL DEFAULT 'en',
    kyc_status      kyc_status_type NOT NULL DEFAULT 'pending',
    kyc_documents   JSONB          DEFAULT '[]'::jsonb,
    -- Array of { type, url, verified_at, rejection_reason }
    fraud_score     DECIMAL(4,3)   NOT NULL DEFAULT 0.000
        CHECK (fraud_score >= 0.000 AND fraud_score <= 1.000),
    device_fingerprint VARCHAR(256),
    role            VARCHAR(20)    NOT NULL DEFAULT 'worker'
        CHECK (role IN ('worker', 'admin', 'super_admin')),
    is_active       BOOLEAN        NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_phone ON users (phone);
CREATE INDEX idx_users_platform ON users (platform);
CREATE INDEX idx_users_zone ON users (zone_id);
CREATE INDEX idx_users_kyc_status ON users (kyc_status);
CREATE INDEX idx_users_role ON users (role);
CREATE INDEX idx_users_fraud_score ON users (fraud_score);
CREATE INDEX idx_users_active ON users (is_active) WHERE is_active = TRUE;
CREATE INDEX idx_users_device_fp ON users (device_fingerprint);
CREATE INDEX idx_users_created ON users (created_at);

COMMENT ON TABLE users IS 'Gig delivery workers (policyholders) and platform administrators';

-- ============================================================================
-- 3. POLICIES TABLE
--    Weekly parametric insurance policies purchased by workers
-- ============================================================================

CREATE TABLE policies (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    policy_number     VARCHAR(30)    NOT NULL UNIQUE,
    -- Human-readable: GS-2026-W12-XXXXX
    worker_id         UUID           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    zone_id           UUID           NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
    coverage_tier     coverage_tier_type NOT NULL,
    disruption_type   disruption_type    NOT NULL,
    premium_amount    DECIMAL(8,2)   NOT NULL
        CHECK (premium_amount >= 30.00 AND premium_amount <= 120.00),
    payout_amount     DECIMAL(10,2)  NOT NULL
        CHECK (payout_amount > 0),
    -- Basic=₹500, Standard=₹1000, Premium=₹2000
    max_claims_per_week INT         NOT NULL DEFAULT 2,
    week_start        DATE           NOT NULL,
    week_end          DATE           NOT NULL,
    status            policy_status_type NOT NULL DEFAULT 'pending_payment',
    auto_renew        BOOLEAN        NOT NULL DEFAULT FALSE,
    pricing_factors   JSONB          DEFAULT '{}'::jsonb,
    -- Snapshot of AI model inputs: { zone_risk, season, tenure, model_version }
    razorpay_subscription_id VARCHAR(100),
    activated_at      TIMESTAMPTZ,
    cancelled_at      TIMESTAMPTZ,
    cancellation_reason TEXT,
    created_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_policy_week CHECK (week_end > week_start),
    CONSTRAINT chk_week_duration CHECK (week_end - week_start = 6)
    -- Mon to Sun = 6 days difference
);

CREATE INDEX idx_policies_worker ON policies (worker_id);
CREATE INDEX idx_policies_zone ON policies (zone_id);
CREATE INDEX idx_policies_status ON policies (status);
CREATE INDEX idx_policies_disruption ON policies (disruption_type);
CREATE INDEX idx_policies_tier ON policies (coverage_tier);
CREATE INDEX idx_policies_week ON policies (week_start, week_end);
CREATE INDEX idx_policies_active ON policies (status, week_start, week_end)
    WHERE status = 'active';
CREATE INDEX idx_policies_auto_renew ON policies (auto_renew)
    WHERE auto_renew = TRUE;
CREATE INDEX idx_policies_created ON policies (created_at);
CREATE INDEX idx_policies_pricing ON policies USING GIN (pricing_factors);

COMMENT ON TABLE policies IS 'Weekly parametric insurance policies — income-loss-only coverage';

-- ============================================================================
-- 4. WEATHER EVENTS TABLE
--    Time-series environmental data ingested from external APIs
-- ============================================================================

CREATE TABLE weather_events (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    zone_id         UUID           NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    event_type      disruption_type NOT NULL,
    temperature_c   DECIMAL(5,2),
    rainfall_mm     DECIMAL(7,2),
    humidity_pct    DECIMAL(5,2),
    wind_speed_kmh  DECIMAL(6,2),
    aqi_value       INT,
    pm25            DECIMAL(6,2),
    pm10            DECIMAL(6,2),
    flood_level     INT,
    -- CWC flood alert level (0-4)
    measured_value  DECIMAL(10,2)  NOT NULL,
    -- The specific value that matters for trigger (e.g., rainfall_mm, aqi_value)
    threshold_value DECIMAL(10,2)  NOT NULL,
    -- The threshold configured for this disruption type
    is_threshold_breached BOOLEAN  NOT NULL DEFAULT FALSE,
    data_source     VARCHAR(100)   NOT NULL,
    -- 'openweathermap', 'waqi', 'imd', 'cpcb', 'cwc'
    raw_response    JSONB          NOT NULL DEFAULT '{}'::jsonb,
    -- Full API response snapshot for audit
    recorded_at     TIMESTAMPTZ    NOT NULL,
    -- Timestamp from the data source
    ingested_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_weather_zone ON weather_events (zone_id);
CREATE INDEX idx_weather_type ON weather_events (event_type);
CREATE INDEX idx_weather_recorded ON weather_events (recorded_at DESC);
CREATE INDEX idx_weather_zone_time ON weather_events (zone_id, recorded_at DESC);
CREATE INDEX idx_weather_breach ON weather_events (is_threshold_breached)
    WHERE is_threshold_breached = TRUE;
CREATE INDEX idx_weather_source ON weather_events (data_source);
CREATE INDEX idx_weather_ingested ON weather_events (ingested_at DESC);
CREATE INDEX idx_weather_raw ON weather_events USING GIN (raw_response);

-- Partition by month for performance (production)
-- CREATE TABLE weather_events_2026_03 PARTITION OF weather_events
--     FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

COMMENT ON TABLE weather_events IS 'Environmental readings ingested every 10-15 min from weather, AQI, and flood APIs';

-- ============================================================================
-- 5. DISRUPTION TRIGGERS TABLE
--    Confirmed disruption events that auto-trigger claims
-- ============================================================================

CREATE TABLE disruption_triggers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    zone_id         UUID           NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
    disruption_type disruption_type NOT NULL,
    measured_value  DECIMAL(10,2)  NOT NULL,
    threshold_value DECIMAL(10,2)  NOT NULL,
    ml_confidence   DECIMAL(4,3)   NOT NULL
        CHECK (ml_confidence >= 0.000 AND ml_confidence <= 1.000),
    status          trigger_status_type NOT NULL DEFAULT 'detected',
    severity        VARCHAR(20)    NOT NULL DEFAULT 'moderate'
        CHECK (severity IN ('minor', 'moderate', 'severe', 'extreme')),
    affected_policies_count INT    NOT NULL DEFAULT 0,
    total_payout_amount     DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    weather_event_ids       UUID[] DEFAULT '{}',
    -- References to supporting weather_events
    source_data     JSONB          NOT NULL DEFAULT '{}'::jsonb,
    -- Aggregated evidence: multiple station readings, time window, etc.
    notes           TEXT,
    confirmed_by    UUID           REFERENCES users(id),
    -- NULL for auto-confirmed, admin user_id for manual confirmation
    triggered_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    confirmed_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    -- Cooldown expiry for this zone+type combo
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_triggers_zone ON disruption_triggers (zone_id);
CREATE INDEX idx_triggers_type ON disruption_triggers (disruption_type);
CREATE INDEX idx_triggers_status ON disruption_triggers (status);
CREATE INDEX idx_triggers_confidence ON disruption_triggers (ml_confidence);
CREATE INDEX idx_triggers_triggered ON disruption_triggers (triggered_at DESC);
CREATE INDEX idx_triggers_zone_type ON disruption_triggers (zone_id, disruption_type);
CREATE INDEX idx_triggers_active ON disruption_triggers (status, zone_id)
    WHERE status IN ('detected', 'confirmed');
CREATE INDEX idx_triggers_source ON disruption_triggers USING GIN (source_data);

COMMENT ON TABLE disruption_triggers IS 'Confirmed disruption events that auto-trigger parametric insurance claims';

-- ============================================================================
-- 6. CLAIMS TABLE
--    Auto-generated claims when a disruption trigger fires
-- ============================================================================

CREATE TABLE claims (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    claim_number    VARCHAR(30)    NOT NULL UNIQUE,
    -- Human-readable: GS-CLM-2026-XXXXX
    policy_id       UUID           NOT NULL REFERENCES policies(id) ON DELETE RESTRICT,
    worker_id       UUID           NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    trigger_id      UUID           NOT NULL REFERENCES disruption_triggers(id) ON DELETE RESTRICT,
    zone_id         UUID           NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
    disruption_type disruption_type NOT NULL,
    claim_amount    DECIMAL(10,2)  NOT NULL
        CHECK (claim_amount > 0),
    fraud_score     DECIMAL(4,3)   NOT NULL DEFAULT 0.000
        CHECK (fraud_score >= 0.000 AND fraud_score <= 1.000),
    status          claim_status_type NOT NULL DEFAULT 'under_review',
    auto_triggered  BOOLEAN        NOT NULL DEFAULT TRUE,
    -- TRUE = system auto-created; FALSE = rare manual override
    fraud_flags     JSONB          DEFAULT '[]'::jsonb,
    -- Array of { flag_type, confidence, details }
    review_notes    TEXT,
    reviewed_by     UUID           REFERENCES users(id),
    reviewed_at     TIMESTAMPTZ,
    evidence        JSONB          DEFAULT '{}'::jsonb,
    -- Snapshot: trigger data, weather readings, worker location at time
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_claims_policy ON claims (policy_id);
CREATE INDEX idx_claims_worker ON claims (worker_id);
CREATE INDEX idx_claims_trigger ON claims (trigger_id);
CREATE INDEX idx_claims_zone ON claims (zone_id);
CREATE INDEX idx_claims_status ON claims (status);
CREATE INDEX idx_claims_fraud_score ON claims (fraud_score);
CREATE INDEX idx_claims_disruption ON claims (disruption_type);
CREATE INDEX idx_claims_review ON claims (status)
    WHERE status = 'under_review';
CREATE INDEX idx_claims_worker_date ON claims (worker_id, created_at DESC);
CREATE INDEX idx_claims_created ON claims (created_at DESC);
CREATE INDEX idx_claims_fraud_flags ON claims USING GIN (fraud_flags);
CREATE INDEX idx_claims_evidence ON claims USING GIN (evidence);

COMMENT ON TABLE claims IS 'Auto-triggered parametric insurance claims — no manual filing by workers';

-- ============================================================================
-- 7. PAYMENTS TABLE
--    All financial transactions: premium collections & payout disbursements
-- ============================================================================

CREATE TABLE payments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_ref VARCHAR(50)    NOT NULL UNIQUE,
    -- Internal reference: GS-PAY-XXXXXXXXXX
    worker_id       UUID           NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    policy_id       UUID           REFERENCES policies(id) ON DELETE SET NULL,
    claim_id        UUID           REFERENCES claims(id) ON DELETE SET NULL,
    payment_type    payment_type   NOT NULL,
    payment_method  payment_method_type,
    amount          DECIMAL(10,2)  NOT NULL
        CHECK (amount > 0),
    currency        VARCHAR(3)     NOT NULL DEFAULT 'INR',
    status          payment_status_type NOT NULL DEFAULT 'initiated',
    direction       VARCHAR(10)    NOT NULL
        CHECK (direction IN ('inbound', 'outbound')),
    -- inbound = premium collected; outbound = payout disbursed

    -- Razorpay integration fields
    razorpay_order_id    VARCHAR(100),
    razorpay_payment_id  VARCHAR(100),
    razorpay_payout_id   VARCHAR(100),
    razorpay_signature   VARCHAR(256),

    -- UPI specific
    upi_transaction_id   VARCHAR(100),
    beneficiary_upi_id   VARCHAR(100),

    -- Metadata
    gateway_response     JSONB     DEFAULT '{}'::jsonb,
    -- Full Razorpay webhook payload for audit
    failure_reason       TEXT,
    retry_count          INT       NOT NULL DEFAULT 0,
    max_retries          INT       NOT NULL DEFAULT 3,

    initiated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    captured_at     TIMESTAMPTZ,
    failed_at       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_worker ON payments (worker_id);
CREATE INDEX idx_payments_policy ON payments (policy_id);
CREATE INDEX idx_payments_claim ON payments (claim_id);
CREATE INDEX idx_payments_type ON payments (payment_type);
CREATE INDEX idx_payments_status ON payments (status);
CREATE INDEX idx_payments_direction ON payments (direction);
CREATE INDEX idx_payments_razorpay_order ON payments (razorpay_order_id);
CREATE INDEX idx_payments_razorpay_payment ON payments (razorpay_payment_id);
CREATE INDEX idx_payments_razorpay_payout ON payments (razorpay_payout_id);
CREATE INDEX idx_payments_worker_date ON payments (worker_id, created_at DESC);
CREATE INDEX idx_payments_created ON payments (created_at DESC);
CREATE INDEX idx_payments_pending ON payments (status)
    WHERE status IN ('initiated', 'processing');
CREATE INDEX idx_payments_gateway ON payments USING GIN (gateway_response);

COMMENT ON TABLE payments IS 'All financial transactions — premium inflows and payout outflows via Razorpay sandbox';

-- ============================================================================
-- 8. FRAUD LOGS TABLE
--    Detailed audit trail of all fraud detection activities
-- ============================================================================

CREATE TABLE fraud_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    worker_id       UUID           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    claim_id        UUID           REFERENCES claims(id) ON DELETE SET NULL,
    policy_id       UUID           REFERENCES policies(id) ON DELETE SET NULL,
    flag_type       fraud_flag_type NOT NULL,
    severity        VARCHAR(20)    NOT NULL DEFAULT 'medium'
        CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    fraud_score     DECIMAL(4,3)   NOT NULL
        CHECK (fraud_score >= 0.000 AND fraud_score <= 1.000),
    confidence      DECIMAL(4,3)   NOT NULL
        CHECK (confidence >= 0.000 AND confidence <= 1.000),

    -- Detection details
    detection_method VARCHAR(50)   NOT NULL
        CHECK (detection_method IN (
            'rule_engine', 'isolation_forest', 'graph_analysis',
            'manual_review', 'cross_reference'
        )),
    rule_triggered   VARCHAR(200),
    -- e.g., "policy_purchased_within_2h_of_forecast"

    -- Evidence
    evidence        JSONB          NOT NULL DEFAULT '{}'::jsonb,
    -- {
    --   location_data: { reported_lat, reported_lng, expected_zone },
    --   timing_data: { purchase_time, forecast_available_at },
    --   device_data: { fingerprint, ip, user_agent },
    --   graph_data: { cluster_id, connected_workers }
    -- }

    -- Resolution
    resolution      fraud_resolution_type NOT NULL DEFAULT 'pending',
    resolution_notes TEXT,
    resolved_by     UUID           REFERENCES users(id),
    resolved_at     TIMESTAMPTZ,

    -- Impact
    blocked_amount  DECIMAL(10,2)  DEFAULT 0.00,
    -- Amount prevented from payout due to this flag

    created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fraud_worker ON fraud_logs (worker_id);
CREATE INDEX idx_fraud_claim ON fraud_logs (claim_id);
CREATE INDEX idx_fraud_policy ON fraud_logs (policy_id);
CREATE INDEX idx_fraud_type ON fraud_logs (flag_type);
CREATE INDEX idx_fraud_severity ON fraud_logs (severity);
CREATE INDEX idx_fraud_score ON fraud_logs (fraud_score DESC);
CREATE INDEX idx_fraud_resolution ON fraud_logs (resolution);
CREATE INDEX idx_fraud_pending ON fraud_logs (resolution)
    WHERE resolution = 'pending';
CREATE INDEX idx_fraud_method ON fraud_logs (detection_method);
CREATE INDEX idx_fraud_created ON fraud_logs (created_at DESC);
CREATE INDEX idx_fraud_evidence ON fraud_logs USING GIN (evidence);
CREATE INDEX idx_fraud_worker_date ON fraud_logs (worker_id, created_at DESC);

COMMENT ON TABLE fraud_logs IS 'Audit trail of all fraud detection signals — rule-based, ML, and graph analysis';

-- ============================================================================
-- 9. WORKER ACTIVITY TABLE
--    Tracks worker behavior for risk profiling and fraud detection
-- ============================================================================

CREATE TABLE worker_activity (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    worker_id       UUID           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_type   VARCHAR(50)    NOT NULL
        CHECK (activity_type IN (
            'login', 'policy_purchase', 'policy_cancel', 'policy_renew',
            'payout_received', 'profile_update', 'kyc_submission',
            'location_check', 'app_open', 'support_ticket'
        )),
    zone_id         UUID           REFERENCES locations(id) ON DELETE SET NULL,

    -- Location at time of activity
    latitude        DECIMAL(10,7),
    longitude       DECIMAL(10,7),
    ip_address      INET,
    user_agent      TEXT,
    device_id       VARCHAR(256),

    -- Activity-specific metadata
    metadata        JSONB          DEFAULT '{}'::jsonb,
    -- Examples:
    -- policy_purchase: { policy_id, premium, tier, disruption_type }
    -- login:           { method: "otp", device_type: "android" }
    -- location_check:  { accuracy_m, provider: "gps" }
    -- payout_received: { amount, claim_id, trigger_type }

    session_id      VARCHAR(100),
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activity_worker ON worker_activity (worker_id);
CREATE INDEX idx_activity_type ON worker_activity (activity_type);
CREATE INDEX idx_activity_zone ON worker_activity (zone_id);
CREATE INDEX idx_activity_created ON worker_activity (created_at DESC);
CREATE INDEX idx_activity_worker_date ON worker_activity (worker_id, created_at DESC);
CREATE INDEX idx_activity_worker_type ON worker_activity (worker_id, activity_type);
CREATE INDEX idx_activity_device ON worker_activity (device_id);
CREATE INDEX idx_activity_session ON worker_activity (session_id);
CREATE INDEX idx_activity_location ON worker_activity (latitude, longitude)
    WHERE latitude IS NOT NULL;
CREATE INDEX idx_activity_metadata ON worker_activity USING GIN (metadata);

COMMENT ON TABLE worker_activity IS 'Behavioral audit trail for risk profiling, fraud detection, and analytics';

-- ============================================================================
-- TRIGGER CONFIGURATION TABLE (Bonus — admin-configurable thresholds)
-- ============================================================================

CREATE TABLE trigger_thresholds (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    disruption_type disruption_type NOT NULL,
    metric_name     VARCHAR(50)    NOT NULL,
    -- 'rainfall_mm', 'temperature_c', 'aqi_value', 'flood_level'
    threshold_value DECIMAL(10,2)  NOT NULL,
    comparison      VARCHAR(5)     NOT NULL DEFAULT '>='
        CHECK (comparison IN ('>', '>=', '<', '<=', '=')),
    sustained_minutes INT          NOT NULL DEFAULT 0,
    -- How long the condition must persist (e.g., 240 min for heat)
    cooldown_hours  INT            NOT NULL DEFAULT 24,
    -- Minimum gap between consecutive triggers for same zone+type
    min_confidence  DECIMAL(4,3)   NOT NULL DEFAULT 0.850,
    is_active       BOOLEAN        NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_threshold_type_metric UNIQUE (disruption_type, metric_name)
);

COMMENT ON TABLE trigger_thresholds IS 'Admin-configurable disruption trigger thresholds and cooldown rules';

-- ============================================================================
-- SEED: Default trigger thresholds
-- ============================================================================

INSERT INTO trigger_thresholds (disruption_type, metric_name, threshold_value, comparison, sustained_minutes, cooldown_hours, min_confidence) VALUES
    ('extreme_rain',   'rainfall_mm',   70.00,  '>=', 0,   48, 0.850),
    ('extreme_heat',   'temperature_c', 45.00,  '>=', 240, 24, 0.900),
    ('air_pollution',  'aqi_value',     400.00, '>=', 360, 24, 0.800),
    ('flood',          'flood_level',   3.00,   '>=', 0,   72, 0.900),
    ('curfew',         'curfew_active', 1.00,   '=',  0,   24, 0.950);

-- ============================================================================
-- UPDATED_AT AUTO-UPDATE TRIGGER FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER trg_locations_updated
    BEFORE UPDATE ON locations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_users_updated
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_policies_updated
    BEFORE UPDATE ON policies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_disruption_triggers_updated
    BEFORE UPDATE ON disruption_triggers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_claims_updated
    BEFORE UPDATE ON claims
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_payments_updated
    BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_fraud_logs_updated
    BEFORE UPDATE ON fraud_logs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_trigger_thresholds_updated
    BEFORE UPDATE ON trigger_thresholds
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- VIEWS — Common queries materialized for performance
-- ============================================================================

-- Active policies with worker and zone info
CREATE VIEW v_active_policies AS
SELECT
    p.id AS policy_id,
    p.policy_number,
    p.coverage_tier,
    p.disruption_type,
    p.premium_amount,
    p.payout_amount,
    p.week_start,
    p.week_end,
    u.id AS worker_id,
    u.name AS worker_name,
    u.phone AS worker_phone,
    u.platform,
    l.zone_name,
    l.city,
    l.risk_tier
FROM policies p
JOIN users u ON p.worker_id = u.id
JOIN locations l ON p.zone_id = l.id
WHERE p.status = 'active'
  AND CURRENT_DATE BETWEEN p.week_start AND p.week_end;

-- Pending fraud cases for admin review
CREATE VIEW v_pending_fraud_review AS
SELECT
    f.id AS fraud_log_id,
    f.flag_type,
    f.severity,
    f.fraud_score,
    f.confidence,
    f.detection_method,
    f.evidence,
    f.created_at AS flagged_at,
    c.claim_number,
    c.claim_amount,
    c.status AS claim_status,
    u.name AS worker_name,
    u.phone AS worker_phone,
    u.platform,
    l.zone_name,
    l.city
FROM fraud_logs f
JOIN users u ON f.worker_id = u.id
LEFT JOIN claims c ON f.claim_id = c.id
LEFT JOIN locations l ON c.zone_id = l.id
WHERE f.resolution = 'pending'
ORDER BY f.fraud_score DESC, f.created_at ASC;

-- Admin KPI overview
CREATE VIEW v_admin_kpis AS
SELECT
    (SELECT COUNT(*) FROM users WHERE role = 'worker' AND is_active = TRUE) AS total_active_workers,
    (SELECT COUNT(*) FROM policies WHERE status = 'active'
        AND CURRENT_DATE BETWEEN week_start AND week_end) AS active_policies,
    (SELECT COALESCE(SUM(premium_amount), 0) FROM policies
        WHERE status IN ('active', 'claimed', 'expired')
        AND week_start >= DATE_TRUNC('month', CURRENT_DATE)) AS monthly_premium_collected,
    (SELECT COALESCE(SUM(amount), 0) FROM payments
        WHERE payment_type = 'payout_disbursement' AND status = 'captured'
        AND created_at >= DATE_TRUNC('month', CURRENT_DATE)) AS monthly_payouts_disbursed,
    (SELECT COUNT(*) FROM claims
        WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)) AS monthly_claims,
    (SELECT COUNT(*) FROM fraud_logs
        WHERE resolution = 'pending') AS pending_fraud_reviews,
    (SELECT COUNT(*) FROM disruption_triggers
        WHERE status = 'confirmed'
        AND triggered_at >= DATE_TRUNC('week', CURRENT_DATE)) AS weekly_triggers;

-- ============================================================================
-- RELATIONSHIP SUMMARY
-- ============================================================================
--
--  locations ──────┬──< users             (a worker belongs to one zone)
--                  ├──< policies          (a policy is for one zone)
--                  ├──< weather_events    (weather data per zone)
--                  ├──< disruption_triggers (triggers fire per zone)
--                  ├──< claims            (claims reference a zone)
--                  └──< worker_activity   (activity may have a zone)
--
--  users ──────────┬──< policies          (a worker has many policies)
--                  ├──< claims            (a worker has many claims)
--                  ├──< payments          (a worker has many payments)
--                  ├──< fraud_logs        (a worker may have fraud flags)
--                  └──< worker_activity   (a worker has activity history)
--
--  policies ───────┬──< claims            (a policy may generate claims)
--                  ├──< payments          (premium payments link to policy)
--                  └──< fraud_logs        (fraud may reference a policy)
--
--  disruption_triggers ──< claims         (a trigger causes many claims)
--
--  claims ─────────┬──< payments          (a claim generates a payout)
--                  └──< fraud_logs        (a claim may have fraud flags)
--
-- ============================================================================
