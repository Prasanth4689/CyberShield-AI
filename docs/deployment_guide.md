# Deployment Guide — CyberShield AI

## Prerequisites

- **Python 3.10+** (tested with 3.14)
- **pip** package manager
- 4 GB RAM minimum (8 GB recommended for training)
- Modern web browser (Chrome, Firefox, Edge)

## Step-by-Step Installation

### 1. Clone / Extract the Project

```bash
cd /path/to/Honeywell
```

### 2. Install Python Dependencies

```bash
pip install -r requirements.txt
```

**Required packages:**
- numpy, pandas, scikit-learn, xgboost
- faker (synthetic data generation)
- shap (explainability)
- imbalanced-learn (SMOTE)
- matplotlib, seaborn (visualization)
- flask, flask-cors (backend API)
- joblib, tqdm (utilities)

**Optional:**
- tensorflow (LSTM Autoencoder — system falls back to XGBoost-only if unavailable)

### 3. Train the ML Models

```bash
python -m ml.train_pipeline
```

This will:
1. Generate 50,000+ synthetic access log events
2. Extract 30+ behavioral features
3. Train Isolation Forest + One-Class SVM baseline
4. Train XGBoost + LSTM anomaly detector
5. Train multi-class attack-type classifier
6. Generate SHAP explanations
7. Evaluate all models and save metrics
8. Export dashboard-ready alerts JSON

**Expected output files:**
```
datasets/generated/access_logs.csv          (raw synthetic data)
datasets/generated/entity_profiles.json     (entity behavioral profiles)
datasets/processed/features.csv             (engineered features)
datasets/processed/alerts.json              (dashboard-ready alerts)
datasets/processed/model_metrics.json       (evaluation metrics)
datasets/processed/entity_risk_summary.json (entity risk aggregation)
models/baseline_model.pkl                   (baseline profiler)
models/xgb_detector.pkl                     (XGBoost detector)
models/attack_classifier.pkl                (attack classifier)
reports/evaluation_metrics.json             (full metrics report)
reports/figures/roc_curve.png               (ROC curve plot)
reports/figures/precision_recall_curve.png   (PR curve plot)
reports/figures/confusion_matrix.png         (confusion matrix)
reports/figures/feature_importance.png       (feature importance)
reports/figures/shap_summary.png            (SHAP summary)
```

### 4. Launch the Dashboard

```bash
python backend/app.py
```

The server starts at **http://localhost:5000**.

### 5. Open the Dashboard

Navigate to `http://localhost:5000` in your browser.

## One-Command Run

```bash
python run.py all     # Train + Launch
python run.py train   # Train only
python run.py serve   # Launch only
```

## Production Deployment Notes

### Using Gunicorn (Linux/Mac)
```bash
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 backend.app:app
```

### Using Waitress (Windows)
```bash
pip install waitress
waitress-serve --host=0.0.0.0 --port=5000 backend.app:app
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CYBERSHIELD_PORT` | 5000 | Server port |
| `CYBERSHIELD_HOST` | 0.0.0.0 | Server host |
| `CYBERSHIELD_DEBUG` | True | Debug mode |

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `ModuleNotFoundError` | Run `pip install -r requirements.txt` |
| Port 5000 in use | Change port in `backend/config.py` |
| TensorFlow not available | System falls back to XGBoost-only (fully functional) |
| No data files found | Run `python -m ml.train_pipeline` first |
| Dashboard shows mock data | Start the backend server first |
