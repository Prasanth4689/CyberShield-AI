# Architecture — CyberShield AI

## System Overview

CyberShield AI is a modular, pipeline-based system for behavioral anomaly detection in cybersecurity access logs. The architecture is designed for:

- **Modularity** — Each component is independent and replaceable
- **Scalability** — Streaming-ready data pipeline architecture
- **Explainability** — SHAP-integrated inference for every alert
- **Analyst Usability** — Professional dashboard for SOC workflows

## Data Flow

```
Raw Access Logs
       │
       ▼
┌──────────────────┐
│  Data Generator   │  Generates synthetic access logs with
│  (data_generator) │  per-entity behavioral profiles and
│                    │  injected attack patterns (2-3%)
└────────┬───────────┘
         │ access_logs.csv
         ▼
┌──────────────────┐
│  Feature Engineer │  Extracts 30+ features:
│  (feature_eng)    │  temporal, geo, behavioral,
│                    │  device, entity-history
└────────┬───────────┘
         │ features.csv
         ▼
┌──────────────────────────────────┐
│         ML Model Ensemble         │
│                                    │
│  ┌──────────────┐  ┌───────────┐  │
│  │ Baseline     │  │ Detection │  │
│  │ (IsoForest + │  │ (XGBoost +│  │
│  │  OCSVM)      │  │  LSTM AE) │  │
│  └──────┬───────┘  └─────┬─────┘  │
│         │                 │         │
│         ▼                 ▼         │
│  ┌──────────────────────────────┐  │
│  │  Risk Score Computation       │  │
│  │  0.6×XGB + 0.4×LSTM → [0,100]│  │
│  └──────────┬───────────────────┘  │
│             │                       │
│  ┌──────────▼───────────────────┐  │
│  │  Attack Classifier (XGBoost) │  │
│  │  7 attack types + SMOTE      │  │
│  └──────────┬───────────────────┘  │
│             │                       │
│  ┌──────────▼───────────────────┐  │
│  │  SHAP Explainer              │  │
│  │  Per-alert feature attribution│  │
│  └──────────┬───────────────────┘  │
└─────────────┼───────────────────────┘
              │ alerts.json + metrics.json
              ▼
┌──────────────────┐     ┌─────────────────┐
│  Flask REST API   │────▶│  Dashboard UI    │
│  /api/alerts      │     │  (HTML/JS/CSS)   │
│  /api/entities    │     │  Chart.js        │
│  /api/predict     │     │  Tailwind CSS    │
│  /api/explain     │     │  Glassmorphism   │
└──────────────────┘     └─────────────────┘
```

## Feature Categories

| Category | Features | Purpose |
|----------|----------|---------|
| Temporal | hour_of_day, day_of_week, is_weekend, is_off_hours, time_since_last_login | Detect time-based anomalies |
| Rolling | login_count_1h/6h/24h, failed_auth_ratio_1h, login_burst_5min | Detect burst and sustained attacks |
| Geo/Network | geo_velocity_kmh, unique_ips_24h, is_new_ip, distance_km | Detect impossible travel, credential stuffing |
| Device | fingerprint_changed, is_new_device, auth_method_changed | Detect device spoofing |
| Behavioral | command_diversity, session_duration_zscore, num_commands | Detect lateral movement, exfiltration |
| Entity History | total_historical_events, is_cold_start, entity_age_days | Handle cold-start problem |
| Anomaly Indicators | geo_anomaly_score, hour_deviation | Composite risk signals |

## Cold-Start Strategy

Entities with fewer than 20 historical events are flagged with `is_cold_start=1`. The models handle this by:
1. Using **population-based baselines** (global mean/std) instead of entity-specific statistics
2. The **Isolation Forest** component is inherently population-based
3. The XGBoost model learns the `is_cold_start` feature as a risk modifier

## Concept Drift Handling

- Sliding-window features (1h, 6h, 24h) naturally adapt to changing behavior
- Entity-relative z-scores compare against the entity's own history
- Architecture supports periodic retraining with new data windows

## Scalability Considerations

The current architecture is designed to be streaming-ready:
- Feature engineering can be applied to individual events
- XGBoost inference is O(1) per event
- SHAP explanations are O(features) per event
- The Flask API can be fronted by gunicorn for concurrency
- Data pipeline can be integrated with Kafka/Spark for production
