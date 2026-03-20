# ============================================================================
# GigShield AI — Fraud Detection Pydantic Schemas
# ============================================================================

from pydantic import BaseModel, Field
from typing import Optional, List
from enum import Enum


class FraudFlagType(str, Enum):
    gps_spoofing = "gps_spoofing"
    duplicate_claim = "duplicate_claim"
    impossible_speed = "impossible_speed"
    suspicious_pattern = "suspicious_pattern"
    device_anomaly = "device_anomaly"
    ip_anomaly = "ip_anomaly"
    timing_anomaly = "timing_anomaly"
    claim_frequency = "claim_frequency"


class LocationPoint(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    timestamp: str = Field(..., description="ISO 8601 timestamp")
    accuracy_meters: float = Field(default=10.0, ge=0)


class FraudCheckRequest(BaseModel):
    """Input for fraud detection analysis"""

    # Identity
    worker_id: str = Field(..., description="Worker UUID")
    claim_id: str = Field(..., description="Claim UUID")
    policy_id: str = Field(..., description="Policy UUID")

    # Location data
    registered_zone_lat: float = Field(..., ge=-90, le=90)
    registered_zone_lng: float = Field(..., ge=-180, le=180)
    claim_location_lat: float = Field(..., ge=-90, le=90)
    claim_location_lng: float = Field(..., ge=-180, le=180)
    location_history: Optional[List[LocationPoint]] = Field(
        default=None, description="Recent location trail (last 24h)"
    )

    # Device & Network
    device_id: str = Field(..., description="Device fingerprint hash")
    ip_address: str = Field(..., description="IP address at claim time")
    user_agent: Optional[str] = Field(default=None)

    # Claim context
    claim_amount: float = Field(..., gt=0)
    disruption_type: str = Field(...)
    claim_timestamp: str = Field(..., description="ISO 8601")

    # Worker behavioral history
    total_claims_30d: int = Field(default=0, ge=0, description="Claims in last 30 days")
    total_policies_30d: int = Field(default=0, ge=0, description="Policies in last 30 days")
    policy_cancel_count_30d: int = Field(default=0, ge=0, description="Policy cancellations in 30d")
    avg_claim_interval_hours: float = Field(default=168.0, ge=0, description="Avg hours between claims")
    unique_devices_30d: int = Field(default=1, ge=1, description="Unique device IDs in 30 days")
    unique_ips_30d: int = Field(default=1, ge=1, description="Unique IPs in 30 days")
    account_age_days: int = Field(default=30, ge=0)
    previous_fraud_flags: int = Field(default=0, ge=0)

    # Delivery activity
    deliveries_last_7d: int = Field(default=20, ge=0)
    avg_daily_active_hours: float = Field(default=8.0, ge=0, le=24)
    platform: str = Field(default="zomato")

    class Config:
        json_schema_extra = {
            "example": {
                "worker_id": "550e8400-e29b-41d4-a716-446655440000",
                "claim_id": "660e8400-e29b-41d4-a716-446655440001",
                "policy_id": "770e8400-e29b-41d4-a716-446655440002",
                "registered_zone_lat": 19.1364,
                "registered_zone_lng": 72.8296,
                "claim_location_lat": 19.1380,
                "claim_location_lng": 72.8310,
                "device_id": "abc123def456",
                "ip_address": "103.42.56.78",
                "claim_amount": 1000.0,
                "disruption_type": "extreme_rain",
                "claim_timestamp": "2026-03-17T14:30:00+05:30",
                "total_claims_30d": 2,
                "total_policies_30d": 4,
                "policy_cancel_count_30d": 0,
                "avg_claim_interval_hours": 168.0,
                "unique_devices_30d": 1,
                "unique_ips_30d": 2,
                "account_age_days": 45,
                "previous_fraud_flags": 0,
                "deliveries_last_7d": 25,
                "avg_daily_active_hours": 9.5,
                "platform": "zomato",
            }
        }


class FraudFlag(BaseModel):
    flag_type: FraudFlagType
    confidence: float = Field(ge=0.0, le=1.0)
    description: str
    evidence: dict = Field(default_factory=dict)


class FraudCheckResponse(BaseModel):
    fraud_score: float = Field(..., ge=0.0, le=1.0, description="Combined fraud probability")
    recommendation: str = Field(description="auto_approve | manual_review | auto_block")
    risk_level: str = Field(description="low | medium | high | critical")
    flags: List[FraudFlag]
    model_scores: dict = Field(description="Individual model scores")
    rule_scores: dict = Field(description="Rule engine scores")
    model_version: str


class FraudHealthResponse(BaseModel):
    status: str
    models_loaded: bool
    model_version: str
    isolation_forest_loaded: bool
    lof_loaded: bool


class FraudTrainResponse(BaseModel):
    message: str
    model_version: str
    metrics: dict
    samples_used: int
    fraud_ratio: float
