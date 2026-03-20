# ============================================================================
# GigShield AI — FastAPI Premium Prediction Service
# ============================================================================
# AI-powered dynamic premium calculation for parametric insurance.
# Uses a Random Forest Regressor trained on simulated Indian gig worker data.
# ============================================================================

import os
import sys
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# Ensure the parent directory is in the path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from premium_service.schemas import (
    PremiumRequest,
    PremiumResponse,
    FactorBreakdown,
    HealthResponse,
    TrainResponse,
)
from premium_service.model.predict import PremiumPredictor
from premium_service.model.train import train_model
from premium_service.config import HOST, PORT

# ── Global predictor instance ──
predictor = PremiumPredictor()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: load model if available, train if not."""
    print("\n🚀 Starting GigShield AI Premium Service...")

    if not predictor.load_model():
        print("⚠️  No trained model found. Training a new one...")
        train_model()
        predictor.load_model()

    yield

    print("🛑 Shutting down Premium Service...")


# ── FastAPI App ──
app = FastAPI(
    title="GigShield AI — Premium Prediction Service",
    description=(
        "AI-powered dynamic premium calculation for parametric insurance. "
        "Uses Random Forest Regressor to predict weekly premiums based on "
        "location risk, weather history, air quality, traffic, and worker profile."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS ──
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


@app.get("/health", response_model=HealthResponse, tags=["System"])
async def health_check():
    """Health check endpoint with model status."""
    return HealthResponse(
        status="healthy" if predictor.is_loaded else "model_not_loaded",
        model_loaded=predictor.is_loaded,
        model_version=predictor.model_version,
        features_count=len(predictor.feature_names) if predictor.feature_names else 0,
        training_samples=10000,
    )


@app.post("/api/v1/predict-premium", response_model=PremiumResponse, tags=["Prediction"])
async def predict_premium(request: PremiumRequest):
    """
    Predict the weekly insurance premium for a gig delivery worker.

    Takes environmental, location, and worker profile features as input
    and returns a dynamically calculated premium with confidence score
    and factor importance breakdown.

    **Premium range:** ₹30 — ₹120 per week.
    """
    if not predictor.is_loaded:
        raise HTTPException(
            status_code=503,
            detail="Model not loaded. Please train the model first via POST /api/v1/train.",
        )

    try:
        # Convert Pydantic model to dict for prediction
        features = {
            "zone_latitude": request.zone_latitude,
            "zone_longitude": request.zone_longitude,
            "zone_risk_score": request.zone_risk_score,
            "risk_tier": request.risk_tier.value,
            "avg_rainfall_mm": request.avg_rainfall_mm,
            "max_rainfall_mm": request.max_rainfall_mm,
            "flood_risk_score": request.flood_risk_score,
            "avg_aqi": request.avg_aqi,
            "max_aqi": request.max_aqi,
            "avg_temperature": request.avg_temperature,
            "traffic_congestion_index": request.traffic_congestion_index,
            "delivery_density": request.delivery_density,
            "coverage_tier": request.coverage_tier.value,
            "disruption_type": request.disruption_type.value,
            "worker_tenure_weeks": request.worker_tenure_weeks,
            "claim_history_ratio": request.claim_history_ratio,
            "worker_fraud_score": request.worker_fraud_score,
        }

        result = predictor.predict(features)

        return PremiumResponse(
            predicted_premium=result["predicted_premium"],
            premium_before_guardrails=result["premium_before_guardrails"],
            coverage_tier=result["coverage_tier"],
            disruption_type=result["disruption_type"],
            payout_amount=result["payout_amount"],
            confidence_score=result["confidence_score"],
            risk_level=result["risk_level"],
            factor_breakdown=[
                FactorBreakdown(**f) for f in result["factor_breakdown"]
            ],
            model_version=result["model_version"],
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")


@app.post("/api/v1/train", response_model=TrainResponse, tags=["Training"])
async def retrain_model(n_samples: int = 10000):
    """
    Retrain the premium prediction model with fresh synthetic data.

    This regenerates the training dataset, trains a new Random Forest model,
    evaluates it, and hot-swaps the production model.

    **Note:** In production, this would use real historical data.
    """
    try:
        result = train_model(n_samples=n_samples)

        # Hot-reload the model
        predictor.load_model()

        return TrainResponse(**result)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Training failed: {str(e)}")


@app.post("/api/v1/batch-predict", tags=["Prediction"])
async def batch_predict(requests: list[PremiumRequest]):
    """
    Predict premiums for multiple workers in a single request.
    Useful for the admin dashboard to recalculate premiums for a zone.

    Maximum 100 predictions per batch.
    """
    if not predictor.is_loaded:
        raise HTTPException(status_code=503, detail="Model not loaded.")

    if len(requests) > 100:
        raise HTTPException(status_code=400, detail="Maximum 100 predictions per batch.")

    results = []
    for req in requests:
        features = {
            "zone_latitude": req.zone_latitude,
            "zone_longitude": req.zone_longitude,
            "zone_risk_score": req.zone_risk_score,
            "risk_tier": req.risk_tier.value,
            "avg_rainfall_mm": req.avg_rainfall_mm,
            "max_rainfall_mm": req.max_rainfall_mm,
            "flood_risk_score": req.flood_risk_score,
            "avg_aqi": req.avg_aqi,
            "max_aqi": req.max_aqi,
            "avg_temperature": req.avg_temperature,
            "traffic_congestion_index": req.traffic_congestion_index,
            "delivery_density": req.delivery_density,
            "coverage_tier": req.coverage_tier.value,
            "disruption_type": req.disruption_type.value,
            "worker_tenure_weeks": req.worker_tenure_weeks,
            "claim_history_ratio": req.claim_history_ratio,
            "worker_fraud_score": req.worker_fraud_score,
        }
        result = predictor.predict(features)
        results.append({
            "predicted_premium": result["predicted_premium"],
            "confidence_score": result["confidence_score"],
            "risk_level": result["risk_level"],
            "coverage_tier": result["coverage_tier"],
            "disruption_type": result["disruption_type"],
        })

    return {"success": True, "predictions": results, "count": len(results)}


# ── Run directly ──
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("premium_service.main:app", host=HOST, port=PORT, reload=True)
