# ============================================================================
# GigShield AI — Fraud Data Preprocessing Pipeline
# ============================================================================
# Transforms raw fraud check request data into model-ready features.
# Computes derived features: distances, speeds, ratios, and anomaly signals.
# ============================================================================

import math
import numpy as np
from datetime import datetime


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calculate Haversine distance between two lat/lng points in km."""
    R = 6371.0
    lat1_r, lat2_r = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)

    a = math.sin(dlat / 2) ** 2 + \
        math.cos(lat1_r) * math.cos(lat2_r) * math.sin(dlng / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return R * c


def compute_max_speed(location_history: list) -> float:
    """
    Compute maximum movement speed from location history.
    Returns speed in km/h. If insufficient data, returns 0.
    """
    if not location_history or len(location_history) < 2:
        return 0.0

    max_speed = 0.0

    for i in range(1, len(location_history)):
        prev = location_history[i - 1]
        curr = location_history[i]

        dist_km = haversine_km(
            prev["latitude"], prev["longitude"],
            curr["latitude"], curr["longitude"]
        )

        try:
            t1 = datetime.fromisoformat(prev["timestamp"])
            t2 = datetime.fromisoformat(curr["timestamp"])
            time_diff_h = abs((t2 - t1).total_seconds()) / 3600.0

            if time_diff_h > 0.001:  # avoid division by zero
                speed = dist_km / time_diff_h
                max_speed = max(max_speed, speed)
        except (ValueError, KeyError):
            continue

    return max_speed


def compute_location_std(location_history: list) -> float:
    """
    Compute standard deviation of location spread in km.
    High std = teleporting / GPS spoofing.
    """
    if not location_history or len(location_history) < 2:
        return 0.0

    lats = [p["latitude"] for p in location_history]
    lngs = [p["longitude"] for p in location_history]

    center_lat = np.mean(lats)
    center_lng = np.mean(lngs)

    distances = [
        haversine_km(center_lat, center_lng, lat, lng)
        for lat, lng in zip(lats, lngs)
    ]

    return float(np.std(distances))


def preprocess_request(request_data: dict) -> dict:
    """
    Transform raw fraud check request into model features.

    Steps:
    1. Compute zone distance (Haversine)
    2. Compute max movement speed from location history
    3. Compute location spread (std)
    4. Extract GPS accuracy
    5. Compute behavioral ratios
    6. Derive timing features

    Returns:
        dict of 20 model-ready features
    """
    # ── 1. Zone distance ──
    zone_distance = haversine_km(
        request_data["registered_zone_lat"],
        request_data["registered_zone_lng"],
        request_data["claim_location_lat"],
        request_data["claim_location_lng"],
    )

    # ── 2. Max movement speed from history ──
    location_history = request_data.get("location_history") or []
    loc_history_dicts = [
        {
            "latitude": p.latitude if hasattr(p, "latitude") else p["latitude"],
            "longitude": p.longitude if hasattr(p, "longitude") else p["longitude"],
            "timestamp": p.timestamp if hasattr(p, "timestamp") else p["timestamp"],
        }
        for p in location_history
    ]
    max_speed = compute_max_speed(loc_history_dicts)

    # ── 3. Location spread ──
    location_std = compute_location_std(loc_history_dicts)

    # ── 4. GPS accuracy ──
    avg_accuracy = 10.0
    if loc_history_dicts:
        accuracies = []
        for p in location_history:
            acc = p.accuracy_meters if hasattr(p, "accuracy_meters") else p.get("accuracy_meters", 10.0)
            accuracies.append(acc)
        avg_accuracy = np.mean(accuracies) if accuracies else 10.0

    # ── 5. Behavioral ratios ──
    total_claims = request_data.get("total_claims_30d", 0)
    total_policies = max(request_data.get("total_policies_30d", 1), 1)
    claim_to_policy_ratio = total_claims / total_policies

    # ── 6. Timing features ──
    try:
        claim_dt = datetime.fromisoformat(request_data["claim_timestamp"])
        claim_hour = claim_dt.hour
        is_weekend = 1 if claim_dt.weekday() >= 5 else 0
    except (ValueError, KeyError):
        claim_hour = 12
        is_weekend = 0

    # ── 7. Claim amount z-score (simplified) ──
    claim_amount = request_data.get("claim_amount", 1000)
    amount_mean = 1000
    amount_std = 500
    claim_amount_zscore = (claim_amount - amount_mean) / amount_std

    # ── 8. Claim to average ratio ──
    claim_to_avg_ratio = claim_amount / amount_mean

    # ── 9. Rapid policy changes ──
    cancel_count = request_data.get("policy_cancel_count_30d", 0)
    rapid_changes = max(0, cancel_count + total_policies - 5) if total_policies > 4 else 0

    return {
        "zone_distance_km": round(zone_distance, 3),
        "max_movement_speed_kmh": round(max_speed, 2),
        "location_std_km": round(location_std, 3),
        "gps_accuracy_meters": round(avg_accuracy, 1),
        "unique_devices_30d": request_data.get("unique_devices_30d", 1),
        "unique_ips_30d": request_data.get("unique_ips_30d", 1),
        "total_claims_30d": total_claims,
        "total_policies_30d": total_policies,
        "policy_cancel_count_30d": cancel_count,
        "avg_claim_interval_hours": request_data.get("avg_claim_interval_hours", 168.0),
        "claim_to_policy_ratio": round(claim_to_policy_ratio, 3),
        "account_age_days": request_data.get("account_age_days", 30),
        "previous_fraud_flags": request_data.get("previous_fraud_flags", 0),
        "deliveries_last_7d": request_data.get("deliveries_last_7d", 20),
        "avg_daily_active_hours": request_data.get("avg_daily_active_hours", 8.0),
        "claim_hour": claim_hour,
        "is_weekend_claim": is_weekend,
        "claim_amount_zscore": round(claim_amount_zscore, 3),
        "claim_to_avg_ratio": round(claim_to_avg_ratio, 3),
        "rapid_policy_changes": rapid_changes,
    }
