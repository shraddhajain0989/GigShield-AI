# ============================================================================
# GigShield AI — Fraud Detection Service Configuration
# ============================================================================

import os
from dotenv import load_dotenv

load_dotenv()

# Server
HOST = os.getenv("FRAUD_HOST", "0.0.0.0")
PORT = int(os.getenv("FRAUD_PORT", "8002"))

# Model paths
ISOLATION_FOREST_PATH = os.getenv("IF_MODEL_PATH", "models/fraud_isolation_forest.pkl")
LOF_MODEL_PATH = os.getenv("LOF_MODEL_PATH", "models/fraud_lof.pkl")
SCALER_PATH = os.getenv("FRAUD_SCALER_PATH", "models/fraud_scaler.pkl")
FEATURE_NAMES_PATH = os.getenv("FRAUD_FEATURES_PATH", "models/fraud_feature_names.pkl")

# Training
TRAINING_SAMPLES = int(os.getenv("FRAUD_TRAINING_SAMPLES", "15000"))
FRAUD_RATIO = float(os.getenv("FRAUD_RATIO", "0.08"))  # 8% fraudulent in training data
RANDOM_STATE = int(os.getenv("RANDOM_STATE", "42"))

# Thresholds
FRAUD_FLAG_THRESHOLD = float(os.getenv("FRAUD_FLAG_THRESHOLD", "0.8"))
MANUAL_REVIEW_THRESHOLD = float(os.getenv("MANUAL_REVIEW_THRESHOLD", "0.5"))

# Rule engine constants
MAX_SPEED_KMH = float(os.getenv("MAX_SPEED_KMH", "120.0"))     # impossible movement
GPS_JITTER_THRESHOLD = float(os.getenv("GPS_JITTER_KM", "0.5"))  # GPS accuracy tolerance
DUPLICATE_WINDOW_HOURS = int(os.getenv("DUPLICATE_WINDOW_H", "24"))
