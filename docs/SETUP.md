# GigShield AI — Setup Instructions

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | ≥ 20 | [nodejs.org](https://nodejs.org) |
| Python | ≥ 3.10 | [python.org](https://python.org) |
| PostgreSQL | ≥ 14 | [postgresql.org](https://postgresql.org) |
| Redis | ≥ 6 (optional) | [redis.io](https://redis.io) |

---

## 1. Clone & Configure

```bash
git clone https://github.com/dkv204p/GigShield-AI.git
cd GigShield-AI
cp .env.example .env
```

Edit `.env` with your values:
```env
DATABASE_URL=postgresql://gigshield:password@localhost:5432/gigshield
JWT_SECRET=your_strong_random_secret
WEATHER_API_KEY=your_openweathermap_key    # Get free at openweathermap.org
AQI_API_KEY=your_waqi_key                  # Get free at aqicn.org/data-platform/token
```

---

## 2. Database Setup

```bash
# Create database
createdb gigshield

# Run migrations
psql -d gigshield -f database/migrations/001_initial_schema.sql
psql -d gigshield -f database/migrations/002_wallet_payments.sql
```

---

## 3. Backend Server

```bash
cd server
npm install

# Run migrations (alternative to psql method)
npm run migrate

# Seed initial data
npm run seed

# Start dev server (with auto-reload)
npm run dev
# → API running at http://localhost:5000
# → Health check: http://localhost:5000/api/health
```

---

## 4. AI Services

```bash
cd ai-services

# Create virtual environment (recommended)
python3 -m venv venv
source venv/bin/activate     # Linux/Mac
# venv\Scripts\activate      # Windows

# Install dependencies
pip install -r requirements.txt

# Start Premium Prediction Service
uvicorn premium_service.main:app --host 0.0.0.0 --port 8001 &
# → http://localhost:8001/docs (Swagger UI)

# Start Fraud Detection Service
uvicorn fraud_service.main:app --host 0.0.0.0 --port 8002 &
# → http://localhost:8002/docs (Swagger UI)
```

---

## 5. Frontend

```bash
cd client
npm install

# Start dev server
npm run dev
# → http://localhost:5173
```

---

## 6. Trigger Engine (Optional)

```bash
cd server
npm run trigger-engine
# Runs cron jobs: 10m scan, 30m AQI, 1h policy expiry
```

---

## 7. Demo Data

```bash
cd server

# Seed demo workers, zones, and policies
npm run demo:seed

# Run the full end-to-end demo
npm run demo:run

# Simulate specific disruptions
npm run demo:simulate -- --type heavy_rain --zone "Andheri West"
npm run demo:simulate -- --type monsoon --zone all
```

### Demo Credentials

| Role | Phone | Password |
|---|---|---|
| Admin | 9999999999 | admin123 |
| Worker (Zomato) | 9876543210 | worker123 |
| Workers (Others) | 9876543211–15 | worker123 |

---

## Docker Setup

```bash
# Start everything with one command
docker compose up -d --build

# Seed demo data
docker compose exec server npm run demo:seed

# View logs
docker compose logs -f server

# Stop all
docker compose down
```

### Service Ports

| Service | Port |
|---|---|
| Frontend (Nginx) | 80 |
| Backend API | 5000 |
| Premium AI | 8001 |
| Fraud AI | 8002 |
| PostgreSQL | 5432 |
| Redis | 6379 |

---

## Troubleshooting

| Issue | Solution |
|---|---|
| `ECONNREFUSED :5432` | Start PostgreSQL: `sudo systemctl start postgresql` |
| `JWT_SECRET not set` | Add `JWT_SECRET` to your `.env` file |
| `Vite build fails` | Use Node.js ≥ 20.19 or 22.12+, or Vite 5 |
| `Python pip fails` | Use `python3 -m pip install` or create a venv |
| `AI service connection refused` | Ensure AI services are running on ports 8001/8002 |
| `CORS errors` | Backend CORS is configured for `localhost:5173` and `localhost:3000` |

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | — | Secret for JWT signing |
| `PORT` | — | `5000` | Backend server port |
| `NODE_ENV` | — | `development` | Environment mode |
| `REDIS_URL` | — | — | Redis connection (optional) |
| `WEATHER_API_KEY` | — | — | OpenWeatherMap API key |
| `AQI_API_KEY` | — | — | WAQI API key |
| `PREMIUM_API_URL` | — | `http://localhost:8001` | Premium AI service URL |
| `FRAUD_API_URL` | — | `http://localhost:8002` | Fraud AI service URL |
| `VITE_API_URL` | — | `http://localhost:5000/api/v1` | Frontend API base URL |
