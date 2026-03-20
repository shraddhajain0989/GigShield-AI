# ============================================================================
# GigShield AI — Fraud Model Training Pipeline
# ============================================================================
# Trains an ensemble of Isolation Forest + Local Outlier Factor for
# anomaly-based fraud detection in gig worker insurance claims.
# ============================================================================

import os
import sys
import json
import joblib
import numpy as np
import pandas as pd
from datetime import datetime
from sklearn.ensemble import IsolationForest
from sklearn.neighbors import LocalOutlierFactor
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    precision_score, recall_score, f1_score,
    classification_report, confusion_matrix,
)

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fraud_service.model.dataset import generate_fraud_dataset, get_feature_columns
from fraud_service.config import (
    ISOLATION_FOREST_PATH, LOF_MODEL_PATH, SCALER_PATH,
    FEATURE_NAMES_PATH, TRAINING_SAMPLES, FRAUD_RATIO, RANDOM_STATE,
)


def train_fraud_models(n_samples: int = None, fraud_ratio: float = None, random_state: int = None) -> dict:
    """
    Full fraud model training pipeline:
    1. Generate synthetic fraud dataset
    2. Scale features
    3. Train Isolation Forest (unsupervised anomaly detection)
    4. Train Local Outlier Factor (density-based anomaly detection)
    5. Evaluate on labeled test set
    6. Serialize models
    """
    n_samples = n_samples or TRAINING_SAMPLES
    fraud_ratio = fraud_ratio or FRAUD_RATIO
    random_state = random_state or RANDOM_STATE

    print(f"\n{'='*60}")
    print(f"  GigShield AI — Fraud Detection Model Training")
    print(f"{'='*60}")

    # ── Step 1: Generate Dataset ──
    print(f"\n📊 Generating {n_samples} samples ({fraud_ratio:.0%} fraud)...")
    df, labels = generate_fraud_dataset(n_samples, fraud_ratio, random_state)
    feature_cols = get_feature_columns()

    X = df[feature_cols].values
    y = labels

    print(f"   Features:   {len(feature_cols)}")
    print(f"   Total:      {len(X)}")
    print(f"   Legitimate: {(y == 0).sum()}")
    print(f"   Fraudulent: {(y == 1).sum()}")

    # ── Step 2: Split ──
    print(f"\n📐 Splitting dataset (80/20)...")
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=random_state, stratify=y
    )

    # ── Step 3: Scale ──
    print(f"\n⚖️  Scaling features...")
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    # ── Step 4: Train Isolation Forest ──
    print(f"\n🌲 Training Isolation Forest...")
    if_model = IsolationForest(
        n_estimators=200,
        max_samples="auto",
        contamination=fraud_ratio,
        max_features=1.0,
        n_jobs=-1,
        random_state=random_state,
    )
    if_model.fit(X_train_scaled)

    # Score: more negative = more anomalous
    if_train_scores = if_model.decision_function(X_train_scaled)
    if_test_scores = if_model.decision_function(X_test_scaled)

    # Convert to predictions (-1 = anomaly, 1 = normal)
    if_test_preds = if_model.predict(X_test_scaled)
    if_test_labels = np.where(if_test_preds == -1, 1, 0)  # convert to 0/1

    print(f"   IF Anomalies detected (test): {(if_test_labels == 1).sum()}/{len(if_test_labels)}")

    # ── Step 5: Train Local Outlier Factor ──
    print(f"\n📍 Training Local Outlier Factor...")
    lof_model = LocalOutlierFactor(
        n_neighbors=20,
        contamination=fraud_ratio,
        novelty=True,
        n_jobs=-1,
    )
    lof_model.fit(X_train_scaled)

    lof_test_scores = lof_model.decision_function(X_test_scaled)
    lof_test_preds = lof_model.predict(X_test_scaled)
    lof_test_labels = np.where(lof_test_preds == -1, 1, 0)

    print(f"   LOF Anomalies detected (test): {(lof_test_labels == 1).sum()}/{len(lof_test_labels)}")

    # ── Step 6: Ensemble evaluation ──
    print(f"\n📈 Evaluating ensemble...")

    # Normalize scores to [0, 1] range
    if_norm = _normalize_scores(if_test_scores)
    lof_norm = _normalize_scores(lof_test_scores)

    # Combined score (weighted average: IF=0.6, LOF=0.4)
    ensemble_scores = 0.6 * (1 - if_norm) + 0.4 * (1 - lof_norm)
    ensemble_preds = (ensemble_scores > 0.5).astype(int)

    # Metrics
    metrics = {
        "isolation_forest": {
            "precision": round(precision_score(y_test, if_test_labels, zero_division=0), 4),
            "recall": round(recall_score(y_test, if_test_labels, zero_division=0), 4),
            "f1": round(f1_score(y_test, if_test_labels, zero_division=0), 4),
        },
        "lof": {
            "precision": round(precision_score(y_test, lof_test_labels, zero_division=0), 4),
            "recall": round(recall_score(y_test, lof_test_labels, zero_division=0), 4),
            "f1": round(f1_score(y_test, lof_test_labels, zero_division=0), 4),
        },
        "ensemble": {
            "precision": round(precision_score(y_test, ensemble_preds, zero_division=0), 4),
            "recall": round(recall_score(y_test, ensemble_preds, zero_division=0), 4),
            "f1": round(f1_score(y_test, ensemble_preds, zero_division=0), 4),
        },
    }

    print(f"\n   {'Model':<22} {'Precision':>10} {'Recall':>10} {'F1':>10}")
    print(f"   {'―'*54}")
    for model_name, m in metrics.items():
        print(f"   {model_name:<22} {m['precision']:>10.4f} {m['recall']:>10.4f} {m['f1']:>10.4f}")

    # Confusion matrix for ensemble
    cm = confusion_matrix(y_test, ensemble_preds)
    print(f"\n   Ensemble Confusion Matrix:")
    print(f"   TN={cm[0][0]:>5}  FP={cm[0][1]:>5}")
    print(f"   FN={cm[1][0]:>5}  TP={cm[1][1]:>5}")

    # ── Step 7: Serialize ──
    print(f"\n💾 Saving model artifacts...")
    os.makedirs(os.path.dirname(ISOLATION_FOREST_PATH), exist_ok=True)

    joblib.dump(if_model, ISOLATION_FOREST_PATH)
    joblib.dump(lof_model, LOF_MODEL_PATH)
    joblib.dump(scaler, SCALER_PATH)
    joblib.dump(feature_cols, FEATURE_NAMES_PATH)

    model_version = f"v1.0.0-fraud-{datetime.now().strftime('%Y%m%d')}"

    metadata = {
        "model_version": model_version,
        "trained_at": datetime.now().isoformat(),
        "algorithms": ["IsolationForest", "LocalOutlierFactor"],
        "ensemble_weights": {"isolation_forest": 0.6, "lof": 0.4},
        "n_samples": n_samples,
        "fraud_ratio": fraud_ratio,
        "n_features": len(feature_cols),
        "feature_names": feature_cols,
        "metrics": metrics,
    }
    metadata_path = os.path.join(os.path.dirname(ISOLATION_FOREST_PATH), "fraud_metadata.json")
    with open(metadata_path, "w") as f:
        json.dump(metadata, f, indent=2)

    print(f"   IF Model:  {ISOLATION_FOREST_PATH}")
    print(f"   LOF Model: {LOF_MODEL_PATH}")
    print(f"   Scaler:    {SCALER_PATH}")
    print(f"   Metadata:  {metadata_path}")

    print(f"\n✅ Fraud models trained — version: {model_version}")
    print(f"{'='*60}\n")

    return {
        "message": "Fraud models trained successfully",
        "model_version": model_version,
        "metrics": metrics,
        "samples_used": n_samples,
        "fraud_ratio": fraud_ratio,
    }


def _normalize_scores(scores: np.ndarray) -> np.ndarray:
    """Normalize scores to [0, 1] range. Higher = more normal."""
    s_min, s_max = scores.min(), scores.max()
    if s_max - s_min == 0:
        return np.zeros_like(scores)
    return (scores - s_min) / (s_max - s_min)


if __name__ == "__main__":
    result = train_fraud_models()
    print(json.dumps(result, indent=2))
