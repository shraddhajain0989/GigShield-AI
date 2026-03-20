# ============================================================================
# GigShield AI — Model Training Pipeline
# ============================================================================
# Trains a Random Forest Regressor for weekly premium prediction.
# Includes data preprocessing, feature scaling, hyperparameter tuning,
# model evaluation, and serialization.
# ============================================================================

import os
import sys
import json
import joblib
import numpy as np
import pandas as pd
from datetime import datetime
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    mean_absolute_error,
    mean_squared_error,
    r2_score,
    median_absolute_error,
)

# Add parent to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from model.dataset import generate_dataset, get_feature_columns, get_target_column
from config import MODEL_PATH, SCALER_PATH, FEATURE_NAMES_PATH, TRAINING_SAMPLES, RANDOM_STATE


def train_model(n_samples: int = None, random_state: int = None) -> dict:
    """
    Full training pipeline:
    1. Generate synthetic dataset
    2. Split into train/test
    3. Scale features
    4. Train Random Forest Regressor
    5. Evaluate on test set
    6. Serialize model + scaler + feature names

    Returns:
        dict with training metrics and model info
    """
    n_samples = n_samples or TRAINING_SAMPLES
    random_state = random_state or RANDOM_STATE

    print(f"\n{'='*60}")
    print(f"  GigShield AI — Premium Pricing Model Training")
    print(f"{'='*60}")

    # ── Step 1: Generate Dataset ──
    print(f"\n📊 Generating {n_samples} training samples...")
    df = generate_dataset(n_samples=n_samples, random_state=random_state)

    feature_cols = get_feature_columns()
    target_col = get_target_column()

    X = df[feature_cols].values
    y = df[target_col].values

    print(f"   Features: {len(feature_cols)}")
    print(f"   Samples:  {len(X)}")
    print(f"   Target range: ₹{y.min():.2f} — ₹{y.max():.2f} (mean: ₹{y.mean():.2f})")

    # ── Step 2: Train/Test Split ──
    print(f"\n📐 Splitting dataset (80/20)...")
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=random_state
    )
    print(f"   Train: {len(X_train)} samples")
    print(f"   Test:  {len(X_test)} samples")

    # ── Step 3: Feature Scaling ──
    print(f"\n⚖️  Scaling features (StandardScaler)...")
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    # ── Step 4: Train Random Forest ──
    print(f"\n🌲 Training Random Forest Regressor...")
    model = RandomForestRegressor(
        n_estimators=200,
        max_depth=20,
        min_samples_split=5,
        min_samples_leaf=3,
        max_features="sqrt",
        n_jobs=-1,
        random_state=random_state,
        oob_score=True,
    )
    model.fit(X_train_scaled, y_train)

    # ── Step 5: Evaluate ──
    print(f"\n📈 Evaluating model...")
    y_pred_train = model.predict(X_train_scaled)
    y_pred_test = model.predict(X_test_scaled)

    metrics = {
        "train_mae": round(mean_absolute_error(y_train, y_pred_train), 4),
        "test_mae": round(mean_absolute_error(y_test, y_pred_test), 4),
        "train_rmse": round(np.sqrt(mean_squared_error(y_train, y_pred_train)), 4),
        "test_rmse": round(np.sqrt(mean_squared_error(y_test, y_pred_test)), 4),
        "train_r2": round(r2_score(y_train, y_pred_train), 4),
        "test_r2": round(r2_score(y_test, y_pred_test), 4),
        "test_median_ae": round(median_absolute_error(y_test, y_pred_test), 4),
        "oob_score": round(model.oob_score_, 4),
    }

    # Cross-validation
    print(f"   Running 5-fold cross-validation...")
    cv_scores = cross_val_score(model, X_train_scaled, y_train, cv=5, scoring="neg_mean_absolute_error")
    metrics["cv_mae_mean"] = round(-cv_scores.mean(), 4)
    metrics["cv_mae_std"] = round(cv_scores.std(), 4)

    # Feature importance
    importances = model.feature_importances_
    feature_importance = sorted(
        zip(feature_cols, importances), key=lambda x: x[1], reverse=True
    )

    print(f"\n   {'Metric':<25} {'Value':>10}")
    print(f"   {'―'*36}")
    print(f"   {'Train MAE':<25} {'₹' + str(metrics['train_mae']):>10}")
    print(f"   {'Test MAE':<25} {'₹' + str(metrics['test_mae']):>10}")
    print(f"   {'Test RMSE':<25} {'₹' + str(metrics['test_rmse']):>10}")
    print(f"   {'Test R²':<25} {metrics['test_r2']:>10}")
    print(f"   {'Test Median AE':<25} {'₹' + str(metrics['test_median_ae']):>10}")
    print(f"   {'OOB Score':<25} {metrics['oob_score']:>10}")
    print(f"   {'CV MAE (5-fold)':<25} {'₹' + str(metrics['cv_mae_mean']) + ' ± ' + str(metrics['cv_mae_std']):>10}")

    print(f"\n🔑 Feature Importance (Top 10):")
    for i, (feat, imp) in enumerate(feature_importance[:10], 1):
        bar = "█" * int(imp * 100)
        print(f"   {i:2d}. {feat:<30} {imp:.4f}  {bar}")

    # ── Step 6: Serialize Model ──
    print(f"\n💾 Saving model artifacts...")
    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)

    joblib.dump(model, MODEL_PATH)
    joblib.dump(scaler, SCALER_PATH)
    joblib.dump(feature_cols, FEATURE_NAMES_PATH)

    print(f"   Model:    {MODEL_PATH}")
    print(f"   Scaler:   {SCALER_PATH}")
    print(f"   Features: {FEATURE_NAMES_PATH}")

    # Save training metadata
    model_version = f"v1.0.0-rf-{datetime.now().strftime('%Y%m%d')}"
    metadata = {
        "model_version": model_version,
        "trained_at": datetime.now().isoformat(),
        "algorithm": "RandomForestRegressor",
        "n_estimators": 200,
        "max_depth": 20,
        "n_samples": n_samples,
        "n_features": len(feature_cols),
        "feature_names": feature_cols,
        "feature_importance": {feat: round(imp, 6) for feat, imp in feature_importance},
        "metrics": metrics,
        "premium_range": {"min": 30.0, "max": 120.0},
    }

    metadata_path = os.path.join(os.path.dirname(MODEL_PATH), "metadata.json")
    with open(metadata_path, "w") as f:
        json.dump(metadata, f, indent=2)
    print(f"   Metadata: {metadata_path}")

    print(f"\n✅ Model trained successfully — version: {model_version}")
    print(f"{'='*60}\n")

    return {
        "message": "Model trained successfully",
        "model_version": model_version,
        "metrics": metrics,
        "samples_used": n_samples,
        "features_used": feature_cols,
    }


if __name__ == "__main__":
    result = train_model()
    print(json.dumps(result, indent=2))
