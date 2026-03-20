# ============================================================================
# GigShield AI — FastAPI Fraud Detection Service
# ============================================================================
# AI-powered fraud detection for parametric insurance claims.
# Combines Isolation Forest + LOF anomaly models with rule-based checks.
# ============================================================================

import os
import sys
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fraud_service.schemas import (
    FraudCheckRequest, FraudCheckResponse, FraudFlag,
    FraudHealthResponse, FraudTrainResponse,
)
from fraud_service.model.scoring import FraudScorer
from fraud_service.model.preprocessing import preprocess_request
from fraud_service.model.train import train_fraud_models
from fraud_service.config import HOST, PORT

# ── Global scorer instance ──
scorer = FraudScorer()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: load models if available, train if not."""
    print("\n🚀 Starting GigShield AI Fraud Detection Service...")

    if not scorer.load_models():
        print("⚠️  No trained fraud models found. Training new ones...")
        train_fraud_models()
        scorer.load_models()

    yield
    print("🛑 Shutting down Fraud Detection Service...")


# ── FastAPI App ──
app = FastAPI(
    title="GigShield AI — Fraud Detection Service",
    description=(
        "AI-powered fraud detection for parametric insurance claims. "
        "Uses Isolation Forest + Local Outlier Factor ensemble with "
        "rule-based GPS spoofing, impossible speed, and behavioral anomaly detection."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://localhost:5000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ══════════════════════════════════════════════════════════════════════
# ENDPOINTS
# ══════════════════════════════════════════════════════════════════════


@app.get("/health", response_model=FraudHealthResponse, tags=["System"])
async def health_check():
    """Health check with model loading status."""
    return FraudHealthResponse(
        status="healthy" if scorer.is_loaded else "models_not_loaded",
        models_loaded=scorer.is_loaded,
        model_version=scorer.model_version,
        isolation_forest_loaded=scorer.if_model is not None,
        lof_loaded=scorer.lof_model is not None,
    )


@app.post("/api/v1/detect-fraud", response_model=FraudCheckResponse, tags=["Fraud Detection"])
async def detect_fraud(request: FraudCheckRequest):
    """
    Analyze a claim for potential fraud.

    **Pipeline:**
    1. Preprocess raw data → compute distances, speeds, behavioral ratios
    2. Run 7 rule-based checks (GPS spoof, speed, devices, IPs, frequency, patterns, timing)
    3. Score with Isolation Forest (anomaly detection)
    4. Score with Local Outlier Factor (density-based)
    5. Combine into weighted ensemble score

    **Thresholds:**
    - `score > 0.8` → `auto_block` (critical)
    - `score 0.3–0.8` → `manual_review` (medium/high)
    - `score < 0.3` → `auto_approve` (low)

    Returns fraud probability **0.0 – 1.0** with detailed flags and evidence.
    """
    if not scorer.is_loaded:
        raise HTTPException(
            status_code=503,
            detail="Models not loaded. Train via POST /api/v1/train first.",
        )

    try:
        # Step 1: Preprocess → extract 20 features from raw input
        features = preprocess_request(request.model_dump())

        # Step 2: Score
        result = scorer.score(features)

        # Build response
        fraud_flags = [
            FraudFlag(
                flag_type=f["flag_type"],
                confidence=f["confidence"],
                description=f["description"],
                evidence=f.get("evidence", {}),
            )
            for f in result["flags"]
        ]

        return FraudCheckResponse(
            fraud_score=result["fraud_score"],
            recommendation=result["recommendation"],
            risk_level=result["risk_level"],
            flags=fraud_flags,
            model_scores=result["model_scores"],
            rule_scores=result["rule_scores"],
            model_version=result["model_version"],
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Fraud detection failed: {str(e)}")


@app.post("/api/v1/batch-detect", tags=["Fraud Detection"])
async def batch_detect(requests: list[FraudCheckRequest]):
    """
    Batch fraud detection for multiple claims (e.g., during a trigger event).
    Maximum 50 claims per batch.
    """
    if not scorer.is_loaded:
        raise HTTPException(status_code=503, detail="Models not loaded.")

    if len(requests) > 50:
        raise HTTPException(status_code=400, detail="Maximum 50 per batch.")

    results = []
    for req in requests:
        features = preprocess_request(req.model_dump())
        result = scorer.score(features)
        results.append({
            "worker_id": req.worker_id,
            "claim_id": req.claim_id,
            "fraud_score": result["fraud_score"],
            "recommendation": result["recommendation"],
            "risk_level": result["risk_level"],
            "flags_count": len(result["flags"]),
        })

    # Sort by fraud score descending
    results.sort(key=lambda x: x["fraud_score"], reverse=True)

    return {
        "success": True,
        "count": len(results),
        "auto_block": sum(1 for r in results if r["recommendation"] == "auto_block"),
        "manual_review": sum(1 for r in results if r["recommendation"] == "manual_review"),
        "auto_approve": sum(1 for r in results if r["recommendation"] == "auto_approve"),
        "results": results,
    }


@app.post("/api/v1/train", response_model=FraudTrainResponse, tags=["Training"])
async def retrain_models(n_samples: int = 15000, fraud_ratio: float = 0.08):
    """
    Retrain fraud detection models with fresh synthetic data.
    Hot-swaps the production models after training.
    """
    try:
        result = train_fraud_models(n_samples=n_samples, fraud_ratio=fraud_ratio)
        scorer.load_models()  # hot-reload
        return FraudTrainResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Training failed: {str(e)}")


# ── Run directly ──
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("fraud_service.main:app", host=HOST, port=PORT, reload=True)
