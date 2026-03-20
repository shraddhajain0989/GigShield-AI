# ============================================================================
# GigShield AI — Pydantic Request/Response Schemas
# ============================================================================

from pydantic import BaseModel, Field
from typing import Optional, Dict, List
from enum import Enum


class CoverageTier(str, Enum):
    basic = "basic"
    standard = "standard"
    premium = "premium"


class DisruptionType(str, Enum):
    extreme_rain = "extreme_rain"
    extreme_heat = "extreme_heat"
    air_pollution = "air_pollution"
    flood = "flood"
    curfew = "curfew"


class RiskTier(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class PremiumRequest(BaseModel):
    """Input features for premium prediction"""

    # Location & Zone
    zone_latitude: float = Field(..., ge=-90, le=90, description="Zone center latitude")
    zone_longitude: float = Field(..., ge=-180, le=180, description="Zone center longitude")
    zone_risk_score: float = Field(..., ge=0.0, le=1.0, description="Zone risk score (0-1)")
    risk_tier: RiskTier = Field(..., description="Zone risk tier")

    # Environmental factors
    avg_rainfall_mm: float = Field(..., ge=0, description="Average weekly rainfall in mm")
    max_rainfall_mm: float = Field(..., ge=0, description="Peak rainfall in last 30 days (mm)")
    flood_risk_score: float = Field(..., ge=0.0, le=1.0, description="Flood risk probability (0-1)")
    avg_aqi: float = Field(..., ge=0, le=500, description="Average Air Quality Index")
    max_aqi: float = Field(..., ge=0, le=500, description="Peak AQI in last 30 days")
    avg_temperature: float = Field(..., ge=-10, le=55, description="Average temperature (°C)")

    # Traffic & delivery
    traffic_congestion_index: float = Field(..., ge=0.0, le=1.0, description="Traffic congestion (0-1)")
    delivery_density: float = Field(..., ge=0.0, le=1.0, description="Delivery demand density (0-1)")

    # Policy details
    coverage_tier: CoverageTier = Field(..., description="Coverage tier")
    disruption_type: DisruptionType = Field(..., description="Disruption type to insure against")

    # Worker history
    worker_tenure_weeks: int = Field(default=0, ge=0, description="Weeks since worker joined")
    claim_history_ratio: float = Field(default=0.0, ge=0.0, le=1.0, description="Past claims / past policies")
    worker_fraud_score: float = Field(default=0.0, ge=0.0, le=1.0, description="Worker's fraud risk score")

    class Config:
        json_schema_extra = {
            "example": {
                "zone_latitude": 19.1364,
                "zone_longitude": 72.8296,
                "zone_risk_score": 0.75,
                "risk_tier": "high",
                "avg_rainfall_mm": 45.2,
                "max_rainfall_mm": 120.0,
                "flood_risk_score": 0.6,
                "avg_aqi": 180.0,
                "max_aqi": 320.0,
                "avg_temperature": 32.5,
                "traffic_congestion_index": 0.7,
                "delivery_density": 0.8,
                "coverage_tier": "standard",
                "disruption_type": "extreme_rain",
                "worker_tenure_weeks": 12,
                "claim_history_ratio": 0.15,
                "worker_fraud_score": 0.05,
            }
        }


class FactorBreakdown(BaseModel):
    """Breakdown of how each factor contributes to the premium"""

    factor_name: str
    factor_value: float
    importance: float = Field(description="Feature importance (0-1)")


class PremiumResponse(BaseModel):
    """Predicted premium output"""

    predicted_premium: float = Field(description="Predicted weekly premium in ₹")
    premium_before_guardrails: float = Field(description="Raw model prediction before clamping")
    coverage_tier: str
    disruption_type: str
    payout_amount: float = Field(description="Maximum payout if trigger fires")
    confidence_score: float = Field(description="Model confidence (0-1)")
    risk_level: str = Field(description="Overall risk assessment")
    factor_breakdown: List[FactorBreakdown]
    model_version: str


class HealthResponse(BaseModel):
    """Health check response"""

    status: str
    model_loaded: bool
    model_version: str
    features_count: int
    training_samples: int


class TrainResponse(BaseModel):
    """Model training response"""

    message: str
    model_version: str
    metrics: Dict[str, float]
    samples_used: int
    features_used: List[str]
