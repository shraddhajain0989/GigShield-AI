# ============================================================================
# GigShield AI — Synthetic Training Dataset Generator
# ============================================================================
# Generates realistic training data for the premium pricing model.
# Data simulates Indian gig worker insurance patterns across metro cities.
# ============================================================================

import numpy as np
import pandas as pd
from typing import Tuple


def generate_dataset(n_samples: int = 10000, random_state: int = 42) -> pd.DataFrame:
    """
    Generate a synthetic dataset for training the premium prediction model.

    The dataset simulates:
    - 10 Indian metro cities with different risk profiles
    - Seasonal rainfall patterns (monsoon vs dry season)
    - Air quality variations (Delhi=worst, Bangalore=moderate)
    - Flood-prone zones (Mumbai, Kolkata, Chennai)
    - Traffic congestion patterns
    - Worker tenure and claim history

    Returns:
        pd.DataFrame with features and target (weekly_premium)
    """
    np.random.seed(random_state)

    # ── City Profiles (lat, lng, base_risk, rain_factor, aqi_factor, flood_factor) ──
    city_profiles = {
        "bangalore": {"lat": 12.97, "lng": 77.59, "risk": 0.55, "rain": 0.6, "aqi": 0.4, "flood": 0.3},
        "mumbai":    {"lat": 19.08, "lng": 72.88, "risk": 0.80, "rain": 0.9, "aqi": 0.5, "flood": 0.8},
        "delhi":     {"lat": 28.61, "lng": 77.21, "risk": 0.70, "rain": 0.4, "aqi": 0.9, "flood": 0.3},
        "kolkata":   {"lat": 22.57, "lng": 88.36, "risk": 0.75, "rain": 0.8, "aqi": 0.6, "flood": 0.7},
        "chennai":   {"lat": 13.08, "lng": 80.27, "risk": 0.65, "rain": 0.7, "aqi": 0.5, "flood": 0.6},
        "pune":      {"lat": 18.52, "lng": 73.86, "risk": 0.45, "rain": 0.5, "aqi": 0.3, "flood": 0.3},
        "hyderabad": {"lat": 17.39, "lng": 78.49, "risk": 0.40, "rain": 0.4, "aqi": 0.3, "flood": 0.2},
        "gurugram":  {"lat": 28.46, "lng": 77.03, "risk": 0.55, "rain": 0.3, "aqi": 0.8, "flood": 0.2},
        "lucknow":   {"lat": 26.85, "lng": 80.95, "risk": 0.50, "rain": 0.4, "aqi": 0.7, "flood": 0.3},
        "ahmedabad": {"lat": 23.02, "lng": 72.57, "risk": 0.45, "rain": 0.3, "aqi": 0.5, "flood": 0.2},
    }

    cities = list(city_profiles.keys())
    records = []

    for _ in range(n_samples):
        # ── Select random city ──
        city = np.random.choice(cities, p=[0.15, 0.18, 0.15, 0.10, 0.10, 0.08, 0.08, 0.06, 0.05, 0.05])
        profile = city_profiles[city]

        # ── Location features (jittered within city) ──
        zone_lat = profile["lat"] + np.random.normal(0, 0.05)
        zone_lng = profile["lng"] + np.random.normal(0, 0.05)
        zone_risk_score = np.clip(profile["risk"] + np.random.normal(0, 0.1), 0.1, 0.95)

        # Map risk score to tier
        if zone_risk_score >= 0.75:
            risk_tier_encoded = 3  # critical
        elif zone_risk_score >= 0.55:
            risk_tier_encoded = 2  # high
        elif zone_risk_score >= 0.35:
            risk_tier_encoded = 1  # medium
        else:
            risk_tier_encoded = 0  # low

        # ── Rainfall features ──
        rain_base = profile["rain"] * 100  # mm base
        avg_rainfall = np.clip(np.random.exponential(rain_base * 0.5), 0, 300)
        max_rainfall = np.clip(avg_rainfall * np.random.uniform(1.2, 3.0), avg_rainfall, 500)

        # ── Flood risk ──
        flood_risk = np.clip(
            profile["flood"] * 0.6 + (avg_rainfall / 300) * 0.3 + np.random.normal(0, 0.05),
            0.0, 1.0
        )

        # ── Air quality ──
        aqi_base = profile["aqi"] * 350
        avg_aqi = np.clip(np.random.normal(aqi_base, aqi_base * 0.3), 20, 480)
        max_aqi = np.clip(avg_aqi * np.random.uniform(1.1, 2.0), avg_aqi, 500)

        # ── Temperature ──
        avg_temp = np.clip(np.random.normal(32, 5), 15, 50)

        # ── Traffic & Delivery ──
        traffic_congestion = np.clip(np.random.beta(3, 3) + profile["risk"] * 0.1, 0.0, 1.0)
        delivery_density = np.clip(np.random.beta(4, 2), 0.0, 1.0)

        # ── Coverage & Disruption ──
        coverage_tier = np.random.choice([0, 1, 2], p=[0.35, 0.45, 0.20])  # basic, standard, premium
        disruption_type = np.random.choice([0, 1, 2, 3, 4])  # rain, heat, aqi, flood, curfew

        # ── Worker history ──
        worker_tenure = np.random.poisson(12)  # weeks
        claim_ratio = np.clip(np.random.exponential(0.1), 0, 0.8)
        fraud_score = np.clip(np.random.exponential(0.05), 0, 0.5)

        # ════════════════════════════════════════════════════
        # TARGET: Calculate realistic premium price
        # ════════════════════════════════════════════════════

        # Base premium by coverage tier
        tier_base = [35, 60, 95][coverage_tier]

        # Risk multiplier (zone risk score has the strongest effect)
        risk_mult = 0.7 + zone_risk_score * 0.8  # 0.7 to 1.5

        # Environment multiplier
        rain_factor = 1.0 + (avg_rainfall / 200) * 0.3        # up to 1.45
        aqi_factor = 1.0 + (avg_aqi / 400) * 0.2              # up to 1.25
        flood_factor = 1.0 + flood_risk * 0.4                  # up to 1.4
        temp_factor = 1.0 + max(0, (avg_temp - 38) / 20) * 0.2  # heat bonus

        # Disruption-specific adjustment
        disruption_weights = [1.0, 0.85, 0.9, 1.3, 1.1]
        disruption_mult = disruption_weights[disruption_type]

        # Traffic & density
        traffic_factor = 1.0 + traffic_congestion * 0.15
        density_factor = 1.0 - delivery_density * 0.05  # higher density = slightly lower risk

        # Worker loyalty discount
        tenure_discount = max(0.85, 1.0 - worker_tenure * 0.003)  # up to 15% discount

        # Fraud surcharge
        fraud_surcharge = 1.0 + fraud_score * 0.5

        # Final premium calculation
        premium = (
            tier_base
            * risk_mult
            * rain_factor
            * aqi_factor
            * flood_factor
            * temp_factor
            * disruption_mult
            * traffic_factor
            * density_factor
            * tenure_discount
            * fraud_surcharge
        )

        # Add random noise (market variation)
        premium += np.random.normal(0, 3)

        # Clamp to guardrails
        premium = np.clip(premium, 30.0, 120.0)

        records.append({
            "zone_latitude": round(zone_lat, 6),
            "zone_longitude": round(zone_lng, 6),
            "zone_risk_score": round(zone_risk_score, 4),
            "risk_tier_encoded": risk_tier_encoded,
            "avg_rainfall_mm": round(avg_rainfall, 2),
            "max_rainfall_mm": round(max_rainfall, 2),
            "flood_risk_score": round(flood_risk, 4),
            "avg_aqi": round(avg_aqi, 2),
            "max_aqi": round(max_aqi, 2),
            "avg_temperature": round(avg_temp, 2),
            "traffic_congestion_index": round(traffic_congestion, 4),
            "delivery_density": round(delivery_density, 4),
            "coverage_tier_encoded": coverage_tier,
            "disruption_type_encoded": disruption_type,
            "worker_tenure_weeks": worker_tenure,
            "claim_history_ratio": round(claim_ratio, 4),
            "worker_fraud_score": round(fraud_score, 4),
            "weekly_premium": round(premium, 2),
        })

    df = pd.DataFrame(records)
    return df


def get_feature_columns() -> list:
    """Return the ordered list of feature column names used by the model."""
    return [
        "zone_latitude",
        "zone_longitude",
        "zone_risk_score",
        "risk_tier_encoded",
        "avg_rainfall_mm",
        "max_rainfall_mm",
        "flood_risk_score",
        "avg_aqi",
        "max_aqi",
        "avg_temperature",
        "traffic_congestion_index",
        "delivery_density",
        "coverage_tier_encoded",
        "disruption_type_encoded",
        "worker_tenure_weeks",
        "claim_history_ratio",
        "worker_fraud_score",
    ]


def get_target_column() -> str:
    """Return the target column name."""
    return "weekly_premium"


if __name__ == "__main__":
    """Generate and preview the dataset."""
    df = generate_dataset(n_samples=1000)
    print(f"\nDataset shape: {df.shape}")
    print(f"\nFeature columns:\n{get_feature_columns()}")
    print(f"\nTarget column: {get_target_column()}")
    print(f"\nDataset stats:")
    print(df.describe().round(2))
    print(f"\nTarget distribution:")
    print(f"  Min:    ₹{df['weekly_premium'].min():.2f}")
    print(f"  Max:    ₹{df['weekly_premium'].max():.2f}")
    print(f"  Mean:   ₹{df['weekly_premium'].mean():.2f}")
    print(f"  Median: ₹{df['weekly_premium'].median():.2f}")
    print(f"  Std:    ₹{df['weekly_premium'].std():.2f}")
