"""
Configuration management for the CyberShield AI backend.
Centralized settings for file paths, model parameters, and server configuration.
"""
import os

# Base directory (project root)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Directory paths
DATASETS_DIR = os.path.join(BASE_DIR, "datasets")
GENERATED_DIR = os.path.join(DATASETS_DIR, "generated")
PROCESSED_DIR = os.path.join(DATASETS_DIR, "processed")
MODELS_DIR = os.path.join(BASE_DIR, "models")
REPORTS_DIR = os.path.join(BASE_DIR, "reports")
FIGURES_DIR = os.path.join(REPORTS_DIR, "figures")
DASHBOARD_DIR = os.path.join(BASE_DIR, "dashboard")

# Data files
ACCESS_LOGS_FILE = os.path.join(GENERATED_DIR, "access_logs.csv")
ENTITY_PROFILES_FILE = os.path.join(GENERATED_DIR, "entity_profiles.json")
FEATURES_FILE = os.path.join(PROCESSED_DIR, "features.csv")
ALERTS_FILE = os.path.join(PROCESSED_DIR, "alerts.json")
MODEL_METRICS_FILE = os.path.join(PROCESSED_DIR, "model_metrics.json")
ENTITY_RISK_FILE = os.path.join(PROCESSED_DIR, "entity_risk_summary.json")
EVALUATION_METRICS_FILE = os.path.join(REPORTS_DIR, "evaluation_metrics.json")

# Model files
BASELINE_MODEL_FILE = os.path.join(MODELS_DIR, "baseline_model.joblib")
DETECTION_MODEL_FILE = os.path.join(MODELS_DIR, "detection_xgb.joblib")
LSTM_MODEL_FILE = os.path.join(MODELS_DIR, "detection_lstm.keras")
CLASSIFIER_MODEL_FILE = os.path.join(MODELS_DIR, "classifier_xgb.joblib")
FEATURE_ENGINEER_FILE = os.path.join(MODELS_DIR, "feature_engineer.joblib")
SCALER_FILE = os.path.join(MODELS_DIR, "scaler.joblib")

# Server configuration
SERVER_HOST = "0.0.0.0"
SERVER_PORT = 5000
DEBUG_MODE = True

# Attack type labels
ATTACK_TYPES = [
    "brute_force",
    "impossible_travel",
    "credential_stuffing",
    "lateral_movement",
    "device_spoofing",
    "low_and_slow_exfiltration",
    "insider_drift",
]

# Severity thresholds for risk scores
SEVERITY_THRESHOLDS = {
    "critical": 80,
    "high": 60,
    "medium": 40,
    "low": 0,
}

# Color mapping for attack types (used in reports)
ATTACK_COLORS = {
    "brute_force": "#ef4444",
    "impossible_travel": "#f59e0b",
    "credential_stuffing": "#8b5cf6",
    "lateral_movement": "#06b6d4",
    "device_spoofing": "#d946ef",
    "low_and_slow_exfiltration": "#10b981",
    "insider_drift": "#64748b",
    "normal": "#3b82f6",
}


def get_severity(risk_score: float) -> str:
    """Map a risk score (0-100) to a severity label."""
    if risk_score >= SEVERITY_THRESHOLDS["critical"]:
        return "critical"
    elif risk_score >= SEVERITY_THRESHOLDS["high"]:
        return "high"
    elif risk_score >= SEVERITY_THRESHOLDS["medium"]:
        return "medium"
    return "low"


def ensure_directories():
    """Create all required directories if they don't exist."""
    dirs = [
        DATASETS_DIR, GENERATED_DIR, PROCESSED_DIR,
        MODELS_DIR, REPORTS_DIR, FIGURES_DIR, DASHBOARD_DIR,
    ]
    for d in dirs:
        os.makedirs(d, exist_ok=True)
