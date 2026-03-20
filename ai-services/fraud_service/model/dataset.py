# ============================================================================
# GigShield AI — Fraud Synthetic Dataset Generator
# ============================================================================
# Creates realistic gig worker behavioral data with injected fraud patterns:
#   - GPS spoofing (claim location far from zone)
#   - Impossible travel speeds
#   - Device/IP hopping (multiple devices or IPs)
#   - Suspiciously frequent claims
#   - Policy gaming (buy-cancel-rebuy)
# ============================================================================

import numpy as np
import pandas as pd
from typing import Tuple


def generate_fraud_dataset(
    n_samples: int = 15000,
    fraud_ratio: float = 0.08,
    random_state: int = 42,
) -> Tuple[pd.DataFrame, np.ndarray]:
    """
    Generate a synthetic dataset with legitimate and fraudulent worker behavior.

    Returns:
        (DataFrame with features, labels array: 0=legitimate, 1=fraud)
    """
    np.random.seed(random_state)

    n_fraud = int(n_samples * fraud_ratio)
    n_legit = n_samples - n_fraud

    records = []

    # ══════════════════════════════════════════════════════
    # LEGITIMATE WORKERS
    # ══════════════════════════════════════════════════════
    for _ in range(n_legit):
        records.append(_generate_legitimate_record())

    # ══════════════════════════════════════════════════════
    # FRAUDULENT WORKERS (various fraud patterns)
    # ══════════════════════════════════════════════════════
    fraud_types = [
        "gps_spoof", "impossible_speed", "device_hopping",
        "claim_frequency", "policy_gaming", "ip_anomaly"
    ]

    for i in range(n_fraud):
        fraud_type = fraud_types[i % len(fraud_types)]
        records.append(_generate_fraud_record(fraud_type))

    df = pd.DataFrame(records)

    # Shuffle
    df = df.sample(frac=1, random_state=random_state).reset_index(drop=True)

    labels = df["is_fraud"].values
    df = df.drop(columns=["is_fraud"])

    return df, labels


def _generate_legitimate_record() -> dict:
    """Generate a legitimate worker's behavioral record."""
    # Normal zone distance (claim near registered zone)
    zone_distance_km = abs(np.random.normal(1.5, 1.0))
    zone_distance_km = np.clip(zone_distance_km, 0.1, 8.0)

    # Normal movement speed
    max_speed_kmh = np.random.exponential(25)
    max_speed_kmh = np.clip(max_speed_kmh, 5, 80)

    # Location consistency
    location_std_km = abs(np.random.normal(1.0, 0.5))

    # Normal device behavior
    unique_devices = np.random.choice([1, 1, 1, 1, 2], p=[0.6, 0.15, 0.1, 0.1, 0.05])
    unique_ips = np.random.poisson(3) + 1

    # Normal claiming
    claims_30d = np.random.poisson(1.5)
    policies_30d = np.random.poisson(3) + 1
    cancel_count = np.random.choice([0, 0, 0, 0, 1], p=[0.7, 0.1, 0.1, 0.05, 0.05])
    claim_interval = np.random.exponential(168) + 24  # hours

    # Account maturity
    account_age = np.random.poisson(60) + 7
    prev_flags = np.random.choice([0, 0, 0, 0, 1], p=[0.8, 0.05, 0.05, 0.05, 0.05])

    # Activity
    deliveries_7d = np.random.poisson(20) + 5
    daily_hours = np.clip(np.random.normal(8, 2), 2, 14)

    # Timing features
    claim_hour = np.random.choice(range(6, 23))
    is_weekend = np.random.choice([0, 1], p=[0.7, 0.3])

    # Claim amount consistency
    claim_amount = np.random.choice([500, 1000, 2000], p=[0.35, 0.45, 0.20])
    claim_to_avg_ratio = np.clip(np.random.normal(1.0, 0.15), 0.5, 1.5)

    return {
        "zone_distance_km": round(zone_distance_km, 3),
        "max_movement_speed_kmh": round(max_speed_kmh, 2),
        "location_std_km": round(location_std_km, 3),
        "gps_accuracy_meters": round(np.clip(np.random.exponential(10), 3, 50), 1),
        "unique_devices_30d": unique_devices,
        "unique_ips_30d": min(unique_ips, 8),
        "total_claims_30d": claims_30d,
        "total_policies_30d": policies_30d,
        "policy_cancel_count_30d": cancel_count,
        "avg_claim_interval_hours": round(claim_interval, 1),
        "claim_to_policy_ratio": round(claims_30d / max(policies_30d, 1), 3),
        "account_age_days": account_age,
        "previous_fraud_flags": prev_flags,
        "deliveries_last_7d": deliveries_7d,
        "avg_daily_active_hours": round(daily_hours, 1),
        "claim_hour": claim_hour,
        "is_weekend_claim": is_weekend,
        "claim_amount_zscore": round(np.random.normal(0, 0.5), 3),
        "claim_to_avg_ratio": round(claim_to_avg_ratio, 3),
        "rapid_policy_changes": 0,
        "is_fraud": 0,
    }


def _generate_fraud_record(fraud_type: str) -> dict:
    """Generate a fraudulent record with specific fraud pattern."""
    record = _generate_legitimate_record()
    record["is_fraud"] = 1

    if fraud_type == "gps_spoof":
        # Claim location suspiciously far from registered zone
        record["zone_distance_km"] = np.random.uniform(20, 200)
        record["gps_accuracy_meters"] = np.random.uniform(0.5, 3.0)  # suspiciously accurate
        record["location_std_km"] = np.random.uniform(15, 80)

    elif fraud_type == "impossible_speed":
        # Movement speed that's physically impossible
        record["max_movement_speed_kmh"] = np.random.uniform(150, 500)
        record["zone_distance_km"] = np.random.uniform(10, 100)

    elif fraud_type == "device_hopping":
        # Multiple devices in short period = multiple accounts
        record["unique_devices_30d"] = np.random.randint(3, 8)
        record["unique_ips_30d"] = np.random.randint(8, 25)
        record["previous_fraud_flags"] = np.random.randint(1, 4)

    elif fraud_type == "claim_frequency":
        # Abnormally frequent claims
        record["total_claims_30d"] = np.random.randint(6, 15)
        record["avg_claim_interval_hours"] = np.random.uniform(6, 24)
        record["claim_to_policy_ratio"] = np.random.uniform(1.5, 4.0)
        record["account_age_days"] = np.random.randint(3, 14)  # new account

    elif fraud_type == "policy_gaming":
        # Buy/cancel around predicted triggers
        record["policy_cancel_count_30d"] = np.random.randint(3, 8)
        record["rapid_policy_changes"] = np.random.randint(3, 10)
        record["total_policies_30d"] = np.random.randint(6, 12)
        record["claim_to_policy_ratio"] = np.random.uniform(0.8, 2.0)

    elif fraud_type == "ip_anomaly":
        # VPN/proxy usage patterns
        record["unique_ips_30d"] = np.random.randint(10, 30)
        record["unique_devices_30d"] = np.random.randint(2, 5)
        record["zone_distance_km"] = np.random.uniform(5, 50)

    # Add noise so patterns aren't too clean
    for key in record:
        if key not in ["is_fraud"] and isinstance(record[key], (int, float)):
            record[key] = abs(record[key] + np.random.normal(0, 0.01 * abs(record[key] + 0.01)))

    return record


def get_feature_columns() -> list:
    """Return ordered list of model feature columns."""
    return [
        "zone_distance_km",
        "max_movement_speed_kmh",
        "location_std_km",
        "gps_accuracy_meters",
        "unique_devices_30d",
        "unique_ips_30d",
        "total_claims_30d",
        "total_policies_30d",
        "policy_cancel_count_30d",
        "avg_claim_interval_hours",
        "claim_to_policy_ratio",
        "account_age_days",
        "previous_fraud_flags",
        "deliveries_last_7d",
        "avg_daily_active_hours",
        "claim_hour",
        "is_weekend_claim",
        "claim_amount_zscore",
        "claim_to_avg_ratio",
        "rapid_policy_changes",
    ]


if __name__ == "__main__":
    df, labels = generate_fraud_dataset(n_samples=5000)
    print(f"\nDataset shape: {df.shape}")
    print(f"Fraud ratio: {labels.mean():.2%}")
    print(f"\nFeature columns ({len(get_feature_columns())}):")
    for f in get_feature_columns():
        print(f"  - {f}")
    print(f"\nStats:\n{df.describe().round(3)}")
