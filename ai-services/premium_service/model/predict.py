# ============================================================================
# GigShield AI — Premium Prediction Engine
# ============================================================================
# Loads the trained model and provides prediction functionality
# with feature preprocessing, confidence scoring, and factor breakdown.
# ============================================================================

import os
import numpy as np
import joblib
from typing import Optional

from premium_service.config import MODEL_PATH, SCALER_PATH, FEATURE_NAMES_PATH, PREMIUM_MIN, PREMIUM_MAX


class PremiumPredictor:
    """
    Loads the serialized Random Forest model and provides
    premium predictions with confidence scores and factor breakdowns.
    """

    def __init__(self):
        self.model = None
        self.scaler = None
        self.feature_names = None
        self.model_version = "not_loaded"
        self.is_loaded = False

    def load_model(self) -> bool:
        """Load model, scaler, and feature names from disk."""
        try:
            if not os.path.exists(MODEL_PATH):
                print(f"⚠️  Model file not found: {MODEL_PATH}")
                return False

            self.model = joblib.load(MODEL_PATH)
            self.scaler = joblib.load(SCALER_PATH)
            self.feature_names = joblib.load(FEATURE_NAMES_PATH)

            # Load metadata for version
            import json
            metadata_path = os.path.join(os.path.dirname(MODEL_PATH), "metadata.json")
            if os.path.exists(metadata_path):
                with open(metadata_path, "r") as f:
                    metadata = json.load(f)
                    self.model_version = metadata.get("model_version", "v1.0.0")

            self.is_loaded = True
            print(f"✅ Model loaded: {self.model_version}")
            return True

        except Exception as e:
            print(f"❌ Failed to load model: {e}")
            return False

    def _encode_risk_tier(self, risk_tier: str) -> int:
        """Encode risk tier string to integer."""
        mapping = {"low": 0, "medium": 1, "high": 2, "critical": 3}
        return mapping.get(risk_tier, 1)

    def _encode_coverage_tier(self, coverage_tier: str) -> int:
        """Encode coverage tier string to integer."""
        mapping = {"basic": 0, "standard": 1, "premium": 2}
        return mapping.get(coverage_tier, 1)

    def _encode_disruption_type(self, disruption_type: str) -> int:
        """Encode disruption type string to integer."""
        mapping = {
            "extreme_rain": 0,
            "extreme_heat": 1,
            "air_pollution": 2,
            "flood": 3,
            "curfew": 4,
        }
        return mapping.get(disruption_type, 0)

    def _get_payout_amount(self, coverage_tier: str) -> float:
        """Get the maximum payout amount for a coverage tier."""
        payouts = {"basic": 500.0, "standard": 1000.0, "premium": 2000.0}
        return payouts.get(coverage_tier, 500.0)

    def _assess_risk_level(self, premium: float) -> str:
        """Assess overall risk level based on predicted premium."""
        if premium >= 100:
            return "very_high"
        elif premium >= 80:
            return "high"
        elif premium >= 55:
            return "moderate"
        elif premium >= 40:
            return "low"
        else:
            return "very_low"

    def predict(self, features: dict) -> dict:
        """
        Predict weekly premium for given input features.

        Args:
            features: dict with raw input features from the API request

        Returns:
            dict with predicted premium, confidence, risk level, and factor breakdown
        """
        if not self.is_loaded:
            raise RuntimeError("Model not loaded. Call load_model() first.")

        # ── Encode categorical features ──
        feature_vector = np.array([[
            features["zone_latitude"],
            features["zone_longitude"],
            features["zone_risk_score"],
            self._encode_risk_tier(features["risk_tier"]),
            features["avg_rainfall_mm"],
            features["max_rainfall_mm"],
            features["flood_risk_score"],
            features["avg_aqi"],
            features["max_aqi"],
            features["avg_temperature"],
            features["traffic_congestion_index"],
            features["delivery_density"],
            self._encode_coverage_tier(features["coverage_tier"]),
            self._encode_disruption_type(features["disruption_type"]),
            features.get("worker_tenure_weeks", 0),
            features.get("claim_history_ratio", 0.0),
            features.get("worker_fraud_score", 0.0),
        ]])

        # ── Scale features ──
        feature_vector_scaled = self.scaler.transform(feature_vector)

        # ── Predict with all trees (for confidence estimation) ──
        all_tree_predictions = np.array([
            tree.predict(feature_vector_scaled)[0]
            for tree in self.model.estimators_
        ])

        raw_prediction = np.mean(all_tree_predictions)
        prediction_std = np.std(all_tree_predictions)

        # ── Confidence score: lower std = higher confidence ──
        # Normalize: if std < 3 → very confident, if std > 15 → low confidence
        confidence = max(0.0, min(1.0, 1.0 - (prediction_std / 20.0)))

        # ── Apply guardrails ──
        clamped_premium = round(np.clip(raw_prediction, PREMIUM_MIN, PREMIUM_MAX), 2)

        # ── Feature importance breakdown ──
        importances = self.model.feature_importances_
        factor_breakdown = []
        for i, (name, importance) in enumerate(zip(self.feature_names, importances)):
            factor_breakdown.append({
                "factor_name": name,
                "factor_value": float(feature_vector[0][i]),
                "importance": round(float(importance), 4),
            })

        # Sort by importance descending
        factor_breakdown.sort(key=lambda x: x["importance"], reverse=True)

        return {
            "predicted_premium": clamped_premium,
            "premium_before_guardrails": round(raw_prediction, 2),
            "coverage_tier": features["coverage_tier"],
            "disruption_type": features["disruption_type"],
            "payout_amount": self._get_payout_amount(features["coverage_tier"]),
            "confidence_score": round(confidence, 4),
            "risk_level": self._assess_risk_level(clamped_premium),
            "factor_breakdown": factor_breakdown,
            "model_version": self.model_version,
        }
