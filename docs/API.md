# GigShield AI — API Documentation

Base URL: `http://localhost:5000/api/v1`

All authenticated endpoints require `Authorization: Bearer <token>` header.

---

## Authentication

### `POST /auth/register` — Register Worker
```json
{
  "name": "Rajesh Kumar",
  "phone": "9876543210",
  "password": "securepass123",
  "platform": "zomato"
}
```
**Response** `201`
```json
{
  "success": true,
  "data": {
    "user": { "id": 1, "name": "Rajesh Kumar", "role": "worker" },
    "token": "eyJhbG..."
  }
}
```

### `POST /auth/login` — Login
```json
{ "phone": "9876543210", "password": "securepass123" }
```

### `GET /auth/me` — Get Current User 🔒

---

## Users 🔒

### `GET /users/profile` — Get Profile
### `PUT /users/profile` — Update Profile
### `POST /users/zone` — Select Work Zone
```json
{ "zone_id": 1 }
```
### `GET /users/zones?city=Mumbai` — List Available Zones
### `POST /users/kyc` — Submit KYC Documents

---

## Policies 🔒

### `POST /policies/quote` — Get Premium Quote
```json
{
  "zone_id": 1,
  "disruption_type": "extreme_rain",
  "coverage_tier": "standard"
}
```
**Response** `200`
```json
{
  "data": {
    "premium_amount": 60,
    "payout_amount": 1000,
    "coverage_tier": "standard",
    "zone": "Andheri West"
  }
}
```

### `POST /policies` — Create & Buy Weekly Policy
```json
{
  "zone_id": 1,
  "disruption_type": "extreme_rain",
  "coverage_tier": "standard",
  "payment_method": "upi"
}
```

### `GET /policies/active` — Get Active Policy
### `GET /policies` — List All Policies
### `GET /policies/:id` — Get Policy Details
### `DELETE /policies/:id` — Cancel Policy
```json
{ "reason": "No longer needed" }
```

---

## Claims 🔒

### `GET /claims` — List Claims
**Query:** `?status=auto_approved&page=1&limit=10`

### `GET /claims/:id` — Get Claim Details
### `PUT /claims/:id/review` — Review Claim (Admin) 🔑
```json
{
  "action": "approve",
  "reason": "Verified with weather data"
}
```

### `GET /claims/pending-review` — Pending Review Queue (Admin) 🔑

---

## Payments 🔒

### `POST /payments/collect-premium` — Pay Premium
```json
{
  "policy_id": 1,
  "payment_method": "upi"
}
```
**Response** `200`
```json
{
  "data": {
    "payment": {
      "transaction_ref": "GS-PAY-ABC123",
      "amount": 60,
      "status": "captured",
      "razorpay_order_id": "order_PK9y8x7w6v5u4t",
      "razorpay_payment_id": "pay_ML2n3m4p5q6r7s"
    }
  }
}
```

### `POST /payments/process-payout` — Process Claim Payout (Admin) 🔑
```json
{ "claim_id": 1 }
```

### `GET /payments/wallet` — Get Wallet Balance
**Response** `200`
```json
{
  "data": {
    "wallet": { "balance": 1000, "total_credited": 2000, "total_debited": 120 },
    "recent_transactions": [...]
  }
}
```

### `GET /payments/history` — Payment History
**Query:** `?direction=outbound&page=1&limit=10`

### `GET /payments/revenue` — Revenue Analytics (Admin) 🔑
**Query:** `?period=week`

### `POST /payments/webhook` — Razorpay Webhook (Public)

---

## Admin 🔑

### `GET /admin/overview` — Platform Overview
**Response** `200`
```json
{
  "data": {
    "total_workers": 156,
    "active_policies": 89,
    "total_claims": 234,
    "fraud_flags": 12,
    "total_revenue": 15680,
    "total_payouts": 42000
  }
}
```

### `GET /admin/workers` — List Workers
**Query:** `?page=1&limit=20`

### `GET /admin/policies` — All Policies
### `GET /admin/claims` — All Claims
**Query:** `?status=blocked`

### `GET /admin/risk-analytics` — Risk Analytics
**Response** `200`
```json
{
  "data": {
    "claims_by_type": [
      { "disruption_type": "extreme_rain", "count": 45 }
    ],
    "high_risk_zones": [
      { "zone_name": "Andheri West", "city": "Mumbai", "risk_score": 0.75 }
    ]
  }
}
```

### `GET /admin/zones` — List Zones
### `POST /admin/zones` — Create Zone
```json
{
  "zone_name": "Whitefield",
  "city": "Bengaluru",
  "state": "Karnataka",
  "latitude": 12.9698,
  "longitude": 77.7500,
  "risk_score": 0.55,
  "flood_risk": 0.3
}
```

---

## AI Services

### Premium Prediction — `http://localhost:8001`

#### `POST /predict-premium`
```json
{
  "latitude": 19.1364,
  "longitude": 72.8296,
  "avg_rainfall_mm": 85,
  "flood_risk_score": 0.8,
  "avg_aqi": 120,
  "traffic_congestion_index": 0.7,
  "delivery_density": 200
}
```
**Response** `200`
```json
{
  "predicted_premium": 72.45,
  "risk_level": "high",
  "confidence": 0.94
}
```

#### `POST /batch-predict` — Batch (up to 50)
#### `POST /train` — Retrain model with hot-reload

### Fraud Detection — `http://localhost:8002`

#### `POST /detect-fraud`
```json
{
  "worker_id": 1,
  "claim_id": 101,
  "claim_amount": 1000,
  "location_lat": 19.1364,
  "location_lng": 72.8296,
  "device_id": "abc-123",
  "ip_address": "103.42.xx.xx"
}
```
**Response** `200`
```json
{
  "fraud_score": 0.12,
  "risk_level": "low",
  "recommendation": "auto_approve",
  "flags": []
}
```

#### `POST /batch-detect` — Batch (up to 50)
#### `POST /train` — Retrain model
#### `GET /health` — Health check

---

## Error Responses

All errors follow a consistent format:

```json
{
  "success": false,
  "message": "Error description",
  "error": { "code": "ERROR_CODE" }
}
```

| Status | Meaning |
|---|---|
| `400` | Bad request / validation error |
| `401` | Missing or invalid JWT |
| `403` | Insufficient permissions |
| `404` | Resource not found |
| `409` | Conflict (duplicate) |
| `429` | Rate limit exceeded |
| `500` | Internal server error |

---

**Legend:** 🔒 = Requires JWT · 🔑 = Admin only
