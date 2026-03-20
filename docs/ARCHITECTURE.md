# GigShield AI — System Architecture

## High-Level Architecture

```mermaid
graph TB
    subgraph Client["Frontend (React + Vite)"]
        UI[UI Components]
        Charts[Chart.js Dashboards]
        Maps[Leaflet Maps]
        Auth[Auth Context]
    end

    subgraph Server["Backend (Node.js + Express)"]
        API[REST API]
        MW[Middleware<br/>JWT · RBAC · Rate Limit]
        Controllers[Controllers]
        Models[Database Models]
        Razorpay[Razorpay Service<br/>Sandbox]
    end

    subgraph TriggerEngine["Trigger Engine"]
        Scheduler[Cron Scheduler<br/>10m · 30m · 1h]
        APIs[API Aggregator]
        Detectors[Trigger Detectors<br/>Rain · Heat · AQI · Flood · Curfew]
        Processor[Claim Processor]
    end

    subgraph AI["AI Services (Python + FastAPI)"]
        Premium[Premium Prediction<br/>Random Forest<br/>R² = 0.964]
        Fraud[Fraud Detection<br/>Isolation Forest<br/>F1 = 0.926]
    end

    subgraph Data["Data Layer"]
        PG[(PostgreSQL<br/>12 Tables)]
        Redis[(Redis<br/>Cache + Triggers)]
    end

    subgraph External["External APIs"]
        Weather[OpenWeatherMap]
        AQI[WAQI]
        Traffic[Google Maps]
        Gov[NDMA / IMD]
    end

    Client -->|HTTPS| Server
    Server --> PG
    Server --> Redis
    Server -->|REST| AI
    TriggerEngine --> External
    TriggerEngine --> PG
    TriggerEngine -->|Fraud Check| Fraud
    Scheduler --> APIs
    APIs --> Detectors
    Detectors --> Processor
    Processor -->|Create Claims| PG
    Controllers --> Models
    Controllers --> Razorpay
    Controllers -->|Quote| Premium
```

---

## Service Breakdown

### 1. React Frontend (Port 5173 / 80)

| Component | Purpose |
|---|---|
| `AuthContext` | JWT token management, role detection |
| `Layout` | Sidebar navigation (worker vs admin) |
| `usePolling` | Real-time data refresh (20–30s intervals) |
| `chartConfig` | Chart.js dark theme + gradient factories |
| Worker Pages | Dashboard, Policies, Claims, Earnings |
| Admin Pages | Analytics, Claims Monitor, Fraud Alerts, Heatmap, Workers |

### 2. Express Backend (Port 5000)

| Module | Endpoints | Description |
|---|---|---|
| Auth | 4 | Register, Login, JWT refresh, Profile |
| Users | 4 | Profile CRUD, Zone selection, KYC |
| Policies | 5 | Create, Quote, Active, List, Cancel |
| Claims | 4 | List, Detail, Review, Pending |
| Payments | 6 | Premium, Payout, Wallet, History, Revenue, Webhook |
| Admin | 7 | Overview, Workers, Policies, Claims, Risk, Zones |

### 3. Premium AI (Port 8001)

```
Input (17 features) → StandardScaler → Random Forest (200 trees) → Weekly Premium ₹
```

Features: location coordinates, rainfall history, flood risk, AQI levels, traffic congestion, delivery density, worker experience, platform, seasonal factors.

### 4. Fraud AI (Port 8002)

```
Input (20 features) → Preprocessing → Ensemble
                                        ├── Isolation Forest (35%)
                                        ├── LOF (25%)
                                        └── Rule Engine (40%)
                                        → Fraud Score [0, 1]
```

Rules: GPS spoofing, impossible speed, device/IP anomaly, claim frequency, policy gaming, timing anomaly.

### 5. Trigger Engine (Background)

```
Scheduler → API Aggregator → Trigger Detectors → Claim Processor
   │                │                │                  │
   │       ┌────────┼────────┐      │           ┌──────┼──────┐
   │       │        │        │      │           │      │      │
  Cron   Weather   AQI   Traffic  5 Rules    Create  Fraud  Payout
 10/30m   API      API    API    Evaluators  Claim   Check  Simulate
```

---

## Data Flow

### Claim Auto-Processing Pipeline

```mermaid
sequenceDiagram
    participant Cron as ⏰ Cron Scheduler
    participant API as 🌐 External APIs
    participant Trigger as ⚡ Trigger Detector
    participant DB as 🗃️ PostgreSQL
    participant Fraud as 🤖 Fraud AI
    participant Pay as 💳 Razorpay

    Cron->>API: Fetch weather/AQI/traffic/alerts
    API-->>Cron: Environmental data
    Cron->>Trigger: Evaluate conditions
    Trigger-->>Cron: Triggers detected (e.g., rain > 70mm)
    Cron->>DB: Find active policies in zone
    DB-->>Cron: Matching policies
    Cron->>DB: Create claims
    Cron->>Fraud: Send claim for fraud check
    Fraud-->>Cron: Fraud score (e.g., 0.12)
    alt Score < 0.3
        Cron->>DB: Auto-approve claim
        Cron->>Pay: Process payout
        Pay-->>Cron: UTR number
        Cron->>DB: Credit worker wallet
    else Score > 0.8
        Cron->>DB: Block claim (manual review)
    else 0.3 ≤ Score ≤ 0.8
        Cron->>DB: Queue for admin review
    end
```

---

## Database Schema (12 Tables)

```mermaid
erDiagram
    USERS ||--o{ POLICIES : "buys"
    USERS ||--o{ CLAIMS : "has"
    USERS ||--o{ PAYMENTS : "makes"
    USERS ||--|| WORKER_WALLETS : "owns"
    USERS }o--|| LOCATIONS : "works_in"
    POLICIES ||--o{ CLAIMS : "triggers"
    POLICIES }o--|| LOCATIONS : "covers"
    CLAIMS ||--o{ PAYMENTS : "generates"
    CLAIMS ||--o{ FRAUD_LOGS : "flagged_by"
    LOCATIONS ||--o{ WEATHER_EVENTS : "monitors"
    LOCATIONS ||--o{ DISRUPTION_TRIGGERS : "detects"
    WORKER_WALLETS ||--o{ WALLET_TRANSACTIONS : "logs"

    USERS {
        serial id PK
        varchar name
        varchar phone UK
        varchar role
        varchar platform
        int zone_id FK
    }
    POLICIES {
        serial id PK
        varchar policy_number UK
        int worker_id FK
        int zone_id FK
        varchar disruption_type
        decimal premium_amount
        decimal payout_amount
        date week_start
        date week_end
    }
    CLAIMS {
        serial id PK
        varchar claim_number UK
        int policy_id FK
        int worker_id FK
        varchar disruption_type
        decimal claim_amount
        float fraud_score
        varchar status
    }
```
