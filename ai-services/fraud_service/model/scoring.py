# ============================================================================
# GigShield AI — Fraud Scoring Engine
# ============================================================================
# Combines ML anomaly scores with rule-based checks to produce
# a final fraud probability score with granular flag explanations.
# ============================================================================

import os
import json
import numpy as np
import joblib

from fraud_service.config import (
    ISOLATION_FOREST_PATH, LOF_MODEL_PATH, SCALER_PATH,
    FEATURE_NAMES_PATH, FRAUD_FLAG_THRESHOLD, MANUAL_REVIEW_THRESHOLD,
    MAX_SPEED_KMH, GPS_JITTER_THRESHOLD,
)
from fraud_service.model.dataset import get_feature_columns


class FraudScorer:
    """
    Ensemble fraud scorer combining:
    1. Isolation Forest (anomaly detection)
    2. Local Outlier Factor (density-based anomaly)
    3. Rule-based detectors (GPS spoof, speed, duplicates, patterns)
    """

    def __init__(self):
        self.if_model = None
        self.lof_model = None
        self.scaler = None
        self.feature_names = None
        self.model_version = "not_loaded"
        self.is_loaded = False

    def load_models(self) -> bool:
        """Load all fraud detection models from disk."""
        try:
            if not os.path.exists(ISOLATION_FOREST_PATH):
                print(f"⚠️  IF model not found: {ISOLATION_FOREST_PATH}")
                return False

            self.if_model = joblib.load(ISOLATION_FOREST_PATH)
            self.lof_model = joblib.load(LOF_MODEL_PATH)
            self.scaler = joblib.load(SCALER_PATH)
            self.feature_names = joblib.load(FEATURE_NAMES_PATH)

            metadata_path = os.path.join(os.path.dirname(ISOLATION_FOREST_PATH), "fraud_metadata.json")
            if os.path.exists(metadata_path):
                with open(metadata_path, "r") as f:
                    meta = json.load(f)
                    self.model_version = meta.get("model_version", "v1.0.0")

            self.is_loaded = True
            print(f"✅ Fraud models loaded: {self.model_version}")
            return True

        except Exception as e:
            print(f"❌ Failed to load fraud models: {e}")
            return False

    def score(self, features: dict) -> dict:
        """
        Compute fraud score for a claim.

        Pipeline:
        1. Run rule-based checks → generate flags
        2. Prepare feature vector for ML models
        3. Score with Isolation Forest
        4. Score with Local Outlier Factor
        5. Combine ML + rule scores into final probability
        6. Generate recommendation

        Returns:
            dict with fraud_score, flags, recommendation, model_scores, rule_scores
        """
        if not self.is_loaded:
            raise RuntimeError("Models not loaded. Call load_models() first.")

        # ── Step 1: Rule-based checks ──
        flags, rule_scores = self._run_rule_engine(features)

        # ── Step 2: ML feature vector ──
        feature_vector = np.array([[features[f] for f in self.feature_names]])
        feature_vector_scaled = self.scaler.transform(feature_vector)

        # ── Step 3: Isolation Forest score ──
        if_raw_score = self.if_model.decision_function(feature_vector_scaled)[0]
        if_prediction = self.if_model.predict(feature_vector_scaled)[0]
        # Convert: more negative = more anomalous → higher fraud score
        if_fraud_prob = self._score_to_probability(if_raw_score, model_type="if")

        # ── Step 4: LOF score ──
        lof_raw_score = self.lof_model.decision_function(feature_vector_scaled)[0]
        lof_prediction = self.lof_model.predict(feature_vector_scaled)[0]
        lof_fraud_prob = self._score_to_probability(lof_raw_score, model_type="lof")

        # ── Step 5: Combine scores ──
        # Weighted ensemble: IF 35%, LOF 25%, Rules 40%
        rule_score_avg = np.mean(list(rule_scores.values())) if rule_scores else 0.0

        combined_score = (
            0.35 * if_fraud_prob +
            0.25 * lof_fraud_prob +
            0.40 * rule_score_avg
        )

        # Boost if multiple strong flags
        high_confidence_flags = [f for f in flags if f["confidence"] > 0.7]
        if len(high_confidence_flags) >= 2:
            combined_score = min(1.0, combined_score * 1.3)
        if len(high_confidence_flags) >= 3:
            combined_score = min(1.0, combined_score * 1.2)

        final_score = round(np.clip(combined_score, 0.0, 1.0), 4)

        # ── Step 6: Recommendation ──
        if final_score >= FRAUD_FLAG_THRESHOLD:
            recommendation = "auto_block"
            risk_level = "critical"
        elif final_score >= MANUAL_REVIEW_THRESHOLD:
            recommendation = "manual_review"
            risk_level = "high"
        elif final_score >= 0.3:
            recommendation = "manual_review"
            risk_level = "medium"
        else:
            recommendation = "auto_approve"
            risk_level = "low"

        return {
            "fraud_score": final_score,
            "recommendation": recommendation,
            "risk_level": risk_level,
            "flags": flags,
            "model_scores": {
                "isolation_forest": round(if_fraud_prob, 4),
                "isolation_forest_raw": round(float(if_raw_score), 4),
                "lof": round(lof_fraud_prob, 4),
                "lof_raw": round(float(lof_raw_score), 4),
                "rule_engine": round(rule_score_avg, 4),
            },
            "rule_scores": rule_scores,
            "model_version": self.model_version,
        }

    def _run_rule_engine(self, features: dict) -> tuple:
        """
        Execute rule-based fraud checks.
        Returns (flags_list, rule_scores_dict)
        """
        flags = []
        scores = {}

        # ── Rule 1: GPS Spoofing ──
        zone_dist = features.get("zone_distance_km", 0)
        gps_accuracy = features.get("gps_accuracy_meters", 10)

        gps_score = 0.0
        if zone_dist > 50:
            gps_score = min(1.0, zone_dist / 100)
            flags.append({
                "flag_type": "gps_spoofing",
                "confidence": round(gps_score, 3),
                "description": f"Claim location {zone_dist:.1f}km from registered zone (threshold: 10km)",
                "evidence": {"zone_distance_km": zone_dist, "gps_accuracy_m": gps_accuracy},
            })
        elif zone_dist > 15:
            gps_score = (zone_dist - 15) / 70
            flags.append({
                "flag_type": "gps_spoofing",
                "confidence": round(gps_score, 3),
                "description": f"Claim location {zone_dist:.1f}km from zone — moderate distance",
                "evidence": {"zone_distance_km": zone_dist},
            })

        # Suspiciously high GPS accuracy can indicate spoofing
        if gps_accuracy < 2.0 and zone_dist > 10:
            gps_score = max(gps_score, 0.6)
            flags.append({
                "flag_type": "gps_spoofing",
                "confidence": 0.6,
                "description": f"Suspiciously precise GPS ({gps_accuracy}m) at {zone_dist:.1f}km from zone",
                "evidence": {"gps_accuracy_m": gps_accuracy, "zone_distance_km": zone_dist},
            })

        scores["gps_spoofing"] = round(gps_score, 4)

        # ── Rule 2: Impossible Speed ──
        max_speed = features.get("max_movement_speed_kmh", 0)
        speed_score = 0.0
        if max_speed > MAX_SPEED_KMH:
            speed_score = min(1.0, max_speed / 300)
            flags.append({
                "flag_type": "impossible_speed",
                "confidence": round(speed_score, 3),
                "description": f"Movement speed {max_speed:.0f} km/h exceeds max allowed ({MAX_SPEED_KMH} km/h)",
                "evidence": {"max_speed_kmh": max_speed, "threshold_kmh": MAX_SPEED_KMH},
            })
        elif max_speed > 80:
            speed_score = (max_speed - 80) / 220
            flags.append({
                "flag_type": "impossible_speed",
                "confidence": round(speed_score, 3),
                "description": f"Elevated movement speed ({max_speed:.0f} km/h) — uncommon for delivery",
                "evidence": {"max_speed_kmh": max_speed},
            })

        scores["impossible_speed"] = round(speed_score, 4)

        # ── Rule 3: Device Anomaly ──
        unique_devices = features.get("unique_devices_30d", 1)
        device_score = 0.0
        if unique_devices >= 4:
            device_score = min(1.0, unique_devices / 6)
            flags.append({
                "flag_type": "device_anomaly",
                "confidence": round(device_score, 3),
                "description": f"{unique_devices} unique devices in 30 days (possible multi-account)",
                "evidence": {"unique_devices": unique_devices},
            })

        scores["device_anomaly"] = round(device_score, 4)

        # ── Rule 4: IP Anomaly ──
        unique_ips = features.get("unique_ips_30d", 1)
        ip_score = 0.0
        if unique_ips >= 12:
            ip_score = min(1.0, unique_ips / 20)
            flags.append({
                "flag_type": "ip_anomaly",
                "confidence": round(ip_score, 3),
                "description": f"{unique_ips} unique IPs in 30 days (possible VPN/proxy)",
                "evidence": {"unique_ips": unique_ips},
            })

        scores["ip_anomaly"] = round(ip_score, 4)

        # ── Rule 5: Claim Frequency ──
        claims_30d = features.get("total_claims_30d", 0)
        interval = features.get("avg_claim_interval_hours", 168)
        freq_score = 0.0
        if claims_30d >= 6:
            freq_score = min(1.0, claims_30d / 10)
            flags.append({
                "flag_type": "claim_frequency",
                "confidence": round(freq_score, 3),
                "description": f"{claims_30d} claims in 30 days with avg interval {interval:.0f}h",
                "evidence": {"claims_30d": claims_30d, "avg_interval_h": interval},
            })
        elif interval < 48 and claims_30d >= 3:
            freq_score = 0.5
            flags.append({
                "flag_type": "claim_frequency",
                "confidence": 0.5,
                "description": f"Claims every {interval:.0f}h — unusually frequent",
                "evidence": {"claims_30d": claims_30d, "avg_interval_h": interval},
            })

        scores["claim_frequency"] = round(freq_score, 4)

        # ── Rule 6: Suspicious Pattern (policy gaming) ──
        cancel_count = features.get("policy_cancel_count_30d", 0)
        rapid_changes = features.get("rapid_policy_changes", 0)
        pattern_score = 0.0
        if cancel_count >= 3 or rapid_changes >= 3:
            pattern_score = min(1.0, max(cancel_count, rapid_changes) / 6)
            flags.append({
                "flag_type": "suspicious_pattern",
                "confidence": round(pattern_score, 3),
                "description": f"Policy gaming detected: {cancel_count} cancellations, {rapid_changes} rapid changes",
                "evidence": {"cancellations": cancel_count, "rapid_changes": rapid_changes},
            })

        scores["suspicious_pattern"] = round(pattern_score, 4)

        # ── Rule 7: New Account + High Claims ──
        account_age = features.get("account_age_days", 30)
        prev_flags = features.get("previous_fraud_flags", 0)
        timing_score = 0.0
        if account_age < 7 and claims_30d >= 2:
            timing_score = 0.7
            flags.append({
                "flag_type": "timing_anomaly",
                "confidence": 0.7,
                "description": f"New account ({account_age} days) with {claims_30d} claims",
                "evidence": {"account_age_days": account_age, "claims": claims_30d},
            })
        if prev_flags >= 2:
            timing_score = max(timing_score, min(1.0, prev_flags / 4))
            flags.append({
                "flag_type": "timing_anomaly",
                "confidence": round(timing_score, 3),
                "description": f"Worker has {prev_flags} previous fraud flags",
                "evidence": {"previous_flags": prev_flags},
            })

        scores["timing_anomaly"] = round(timing_score, 4)

        return flags, scores

    def _score_to_probability(self, raw_score: float, model_type: str = "if") -> float:
        """
        Convert raw anomaly score to fraud probability [0, 1].
        For both IF and LOF: more negative raw_score = more anomalous.
        """
        # Sigmoid-like transformation centered on 0
        # negative scores → high fraud probability
        # positive scores → low fraud probability
        prob = 1.0 / (1.0 + np.exp(3.0 * raw_score))
        return float(np.clip(prob, 0.0, 1.0))
