# CyberShield AI — AI-Powered Behavioral Anomaly Detection for Cybersecurity

<p align="center">
  <strong>🛡️ Real-time behavioral anomaly detection with explainable AI</strong><br>
  Built for Honeywell Hackathon 2026
</p>

---

## 🎯 Problem Statement

Design and build an AI/ML system that models "normal" access and connection behaviour for users and devices, detects intrusions or compromised-credential activity in near real-time, and classifies the type of anomaly (e.g., credential misuse, lateral movement, brute force, impossible travel, device spoofing) — with an explainable risk score.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CyberShield AI Architecture                │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Synthetic Data    Feature          ML Pipeline               │
│  Generator    ──►  Engineering  ──► ┌────────────────────┐    │
│  (50K events)      (30+ features)   │ Baseline Profiler  │    │
│                                     │ (IsoForest + OCSVM)│    │
│                                     ├────────────────────┤    │
│                                     │ Detection Model    │    │
│                                     │ (XGBoost + LSTM)   │    │
│                                     ├────────────────────┤    │
│                                     │ Attack Classifier  │    │
│                                     │ (Multi-class XGB)  │    │
│                                     ├────────────────────┤    │
│                                     │ Explainability     │    │
│                                     │ (SHAP TreeExplainer)│   │
│                                     └────────┬───────────┘    │
│                                              │                 │
│  Flask REST API  ◄───────────────────────────┘                │
│  ├── /api/alerts                                              │
│  ├── /api/entities                                            │
│  ├── /api/predict                                             │
│  ├── /api/explain                                             │
│  └── /api/model/metrics                                       │
│           │                                                    │
│           ▼                                                    │
│  Analyst Dashboard (HTML/JS/Tailwind)                         │
│  KPIs | Alert Queue | Charts | SHAP | Filters | Export        │
└─────────────────────────────────────────────────────────────┘
```

## 📋 Key Features

### ML Pipeline
- **Synthetic Data Generator** — 50,000+ events across 200 entities with 7 attack patterns
- **Feature Engineering** — 30+ features (temporal, geo-spatial, behavioral, device, entity-history)
- **Baseline Profiling** — Isolation Forest + One-Class SVM ensemble for unsupervised anomaly detection
- **Detection Model** — XGBoost + LSTM Autoencoder ensemble with weighted scoring
- **Attack Classification** — Multi-class XGBoost with SMOTE for imbalanced attack-type classification
- **SHAP Explainability** — Per-alert feature attribution with natural language explanations

### Attack Types Detected
| Attack | Description |
|--------|-------------|
| Brute Force | Rapid failed-auth attempts from one source |
| Impossible Travel | Geographically distant logins within implausible time |
| Credential Stuffing | Many accounts targeted from few IPs |
| Lateral Movement | Unusual resource access sequence |
| Device Spoofing | Mismatched device fingerprints |
| Low-and-Slow Exfiltration | Gradual off-hours data access |
| Insider Drift | Expanding privilege footprint |

### Dashboard
- Dark-mode glassmorphism UI
- Real-time KPI cards with animated counters
- Attack distribution donut chart
- Risk timeline (24h)
- Entity risk heatmap
- Ranked alert queue with severity badges
- Sliding detail panel with SHAP attribution
- Search, filter, pagination
- CSV export

## 🚀 Quick Start

### Prerequisites
- Python 3.10+
- pip

### Installation

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Run the full training pipeline
python ml/train_pipeline.py

# 3. Launch the dashboard
python backend/app.py

# 4. Open browser
# Navigate to http://localhost:5000
```

### One-Command Run

```bash
python run.py all    # Train models + launch dashboard
python run.py train  # Train models only
python run.py serve  # Launch dashboard only
```

## 📁 Project Structure

```
Honeywell/
├── backend/              # Flask API server
│   ├── app.py            # REST API endpoints
│   └── config.py         # Configuration management
├── ml/                   # Machine Learning pipeline
│   ├── data_generator.py # Synthetic data generation
│   ├── feature_engineering.py # Feature extraction
│   ├── baseline_model.py # Isolation Forest + OCSVM
│   ├── detection_model.py # XGBoost + LSTM ensemble
│   ├── classifier.py     # Attack-type classifier
│   ├── explainer.py      # SHAP explainability
│   ├── evaluate.py       # Metrics & visualization
│   └── train_pipeline.py # End-to-end orchestrator
├── dashboard/            # Analyst-facing dashboard
│   ├── index.html        # Main page
│   ├── css/styles.css    # Dark-mode styles
│   └── js/               # Application logic
├── datasets/             # Generated & processed data
├── models/               # Trained model files
├── reports/              # Evaluation metrics & figures
├── docs/                 # Documentation
├── requirements.txt      # Python dependencies
└── run.py                # Single entry point
```

## 📊 Evaluation Metrics

| Metric | Description |
|--------|-------------|
| Accuracy | Overall classification accuracy |
| Precision | True positives / (True positives + False positives) |
| Recall | True positives / (True positives + False negatives) |
| F1 Score | Harmonic mean of precision and recall |
| AUC-ROC | Area under ROC curve |
| Precision@1% | Precision at top 1% alert budget |
| False Positive Rate | False positives / (False positives + True negatives) |

## 🔬 Key Design Decisions

### Handling Class Imbalance
- SMOTE oversampling for attack-type classifier
- `scale_pos_weight` in XGBoost for binary detection
- Stratified train/test split preserving class ratios

### Cold-Start Problem
- Population-based baselines for new entities (< 20 events)
- `is_cold_start` feature flag for the model
- Entity age tracking

### Concept Drift
- Sliding-window feature engineering (rolling counts)
- Entity-relative z-scores (not global thresholds)
- Expandable retraining architecture

### Explainability
- SHAP TreeExplainer for feature attribution
- Human-readable natural language explanations
- Per-alert waterfall plots

## 📄 License

Built for Honeywell Hackathon 2026 by Kota Bhanu Prasanth Reddy.

## 🛠️ Tech Stack

| Component | Technology |
|-----------|-----------|
| ML Framework | scikit-learn, XGBoost, TensorFlow/Keras |
| Data Processing | pandas, NumPy |
| Explainability | SHAP |
| Backend | Flask, Flask-CORS |
| Frontend | HTML5, Tailwind CSS, Chart.js |
| Data Generation | Faker |
| Visualization | matplotlib, seaborn |
