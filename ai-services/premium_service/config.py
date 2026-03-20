# ============================================================================
# GigShield AI — Premium Service Configuration
# ============================================================================

import os
from dotenv import load_dotenv

load_dotenv()

# Server
HOST = os.getenv("AI_HOST", "0.0.0.0")
PORT = int(os.getenv("AI_PORT", "8001"))

# Model
MODEL_PATH = os.getenv("MODEL_PATH", "models/premium_model.pkl")
SCALER_PATH = os.getenv("SCALER_PATH", "models/scaler.pkl")
FEATURE_NAMES_PATH = os.getenv("FEATURE_NAMES_PATH", "models/feature_names.pkl")

# Training
TRAINING_SAMPLES = int(os.getenv("TRAINING_SAMPLES", "10000"))
RANDOM_STATE = int(os.getenv("RANDOM_STATE", "42"))

# Premium guardrails
PREMIUM_MIN = float(os.getenv("PREMIUM_MIN", "30.0"))
PREMIUM_MAX = float(os.getenv("PREMIUM_MAX", "120.0"))
