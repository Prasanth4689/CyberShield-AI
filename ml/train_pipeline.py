"""
CyberShield AI — End-to-End Training Pipeline
==============================================
Single-command orchestrator that generates data, engineers features,
trains all models, evaluates, generates explanations, and exports
dashboard-ready outputs.

Usage:
    python -m ml.train_pipeline         (from project root)
    python ml/train_pipeline.py         (from project root)
"""
import os
import sys
import json
import logging
import warnings
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split

# Suppress noisy warnings during training
warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=UserWarning)

# Ensure project root is on path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

from ml.data_generator import main as generate_data
from ml.feature_engineering import FeatureEngineer
from ml.baseline_model import BaselineProfiler
from ml.detection_model import AnomalyDetector
from ml.classifier import AttackClassifier
from ml.explainer import AlertExplainer
from ml.evaluate import ModelEvaluator

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("cybershield.pipeline")

# ── Directory paths ──────────────────────────────────────────────────────
BASE = PROJECT_ROOT
GENERATED_DIR = os.path.join(BASE, "datasets", "generated")
PROCESSED_DIR = os.path.join(BASE, "datasets", "processed")
MODELS_DIR = os.path.join(BASE, "models")
REPORTS_DIR = os.path.join(BASE, "reports")
FIGURES_DIR = os.path.join(REPORTS_DIR, "figures")

for d in [GENERATED_DIR, PROCESSED_DIR, MODELS_DIR, REPORTS_DIR, FIGURES_DIR]:
    os.makedirs(d, exist_ok=True)


def create_sequences(X_df, seq_length=10):
    """
    Build sliding-window sequences for the LSTM autoencoder.
    Returns array of shape (n_samples, seq_length, n_features).
    """
    features = X_df.values.astype(np.float32)
    n_samples, n_features = features.shape
    sequences = np.zeros((n_samples, seq_length, n_features), dtype=np.float32)
    for i in range(n_samples):
        start = max(0, i - seq_length + 1)
        seq = features[start: i + 1]
        sequences[i, -len(seq):, :] = seq
    return sequences


def main():
    logger.info("=" * 65)
    logger.info("  CyberShield AI — Training Pipeline")
    logger.info("=" * 65)

    # ── 1. Generate synthetic data ───────────────────────────────────────
    access_logs_path = os.path.join(GENERATED_DIR, "access_logs.csv")
    if not os.path.exists(access_logs_path):
        logger.info("Step 1/9: Generating synthetic data…")
        generate_data()
    else:
        logger.info("Step 1/9: Synthetic data already exists — skipping generation")

    # ── 2. Feature engineering ───────────────────────────────────────────
    logger.info("Step 2/9: Engineering features…")
    df = pd.read_csv(access_logs_path)
    fe = FeatureEngineer()
    df_features = fe.fit_transform(df)

    # Save processed features
    df_features.to_csv(os.path.join(PROCESSED_DIR, "features.csv"), index=False)
    logger.info("  → %d events, %d features", len(df_features), len(df_features.columns))

    # ── 3. Prepare train/test split ──────────────────────────────────────
    logger.info("Step 3/9: Preparing train/test split…")

    # Select numeric-only feature columns (exclude metadata and target)
    exclude_cols = {
        "entity_id", "entity_type", "timestamp", "source_ip", "geo_location",
        "resource_accessed", "auth_method", "command_sequence",
        "device_fingerprint", "label", "action_status", "lat", "lon",
        "prev_lat", "prev_lon", "distance_km",
    }
    numeric_cols = df_features.select_dtypes(include=[np.number]).columns.tolist()
    feature_cols = [c for c in numeric_cols if c not in exclude_cols]

    X = df_features[feature_cols].copy()
    y_binary = (df_features["label"] != "normal").astype(int)
    y_multi = df_features["label"].copy()

    # Replace any remaining inf/NaN
    X.replace([np.inf, -np.inf], 0, inplace=True)
    X.fillna(0, inplace=True)

    # Stratified split
    (
        X_train, X_test,
        y_train_bin, y_test_bin,
        y_train_multi, y_test_multi,
        idx_train, idx_test,
    ) = train_test_split(
        X, y_binary, y_multi,
        df_features.index,
        test_size=0.2,
        stratify=y_binary,
        random_state=42,
    )

    df_test = df_features.loc[idx_test].copy()

    logger.info(
        "  → Train: %d (anomalies: %d) | Test: %d (anomalies: %d)",
        len(X_train), y_train_bin.sum(),
        len(X_test), y_test_bin.sum(),
    )

    # Build sequences for LSTM
    logger.info("  → Building LSTM sequences…")
    X_train_seq = create_sequences(X_train)
    X_test_seq = create_sequences(X_test)

    # ── 4. Baseline profiling model ──────────────────────────────────────
    logger.info("Step 4/9: Training baseline model (Isolation Forest + One-Class SVM)…")
    X_train_normal = X_train[y_train_bin == 0]
    baseline = BaselineProfiler()
    baseline.fit(X_train_normal)
    baseline.save(os.path.join(MODELS_DIR, "baseline_model.pkl"))
    logger.info("  → Baseline model trained on %d normal events", len(X_train_normal))

    # ── 5. Detection model (XGBoost + LSTM ensemble) ─────────────────────
    logger.info("Step 5/9: Training detection model (XGBoost + LSTM Autoencoder)…")
    detector = AnomalyDetector()
    detector.train(X_train, y_train_bin, X_train_seq)
    detector.save(
        os.path.join(MODELS_DIR, "xgb_detector.pkl"),
        os.path.join(MODELS_DIR, "lstm_autoencoder.h5"),
    )

    # Predict on test set
    risk_scores, is_anomaly = detector.predict(X_test, X_test_seq)
    logger.info(
        "  → Detection: %d anomalies flagged out of %d test events",
        int(np.sum(is_anomaly)), len(X_test),
    )

    # ── 6. Attack-type classifier ────────────────────────────────────────
    logger.info("Step 6/9: Training attack-type classifier…")
    X_train_anom = X_train[y_train_bin == 1]
    y_train_anom_multi = y_train_multi[y_train_bin == 1]

    classifier = AttackClassifier()
    if len(X_train_anom) > 0:
        classifier.train(X_train_anom, y_train_anom_multi)
        classifier.save(os.path.join(MODELS_DIR, "attack_classifier.pkl"))
        logger.info("  → Classifier trained on %d anomalous events", len(X_train_anom))
    else:
        logger.warning("  → No anomalous training data — classifier not trained")

    # Predict attack types on flagged test events
    predicted_types = np.full(len(X_test), "normal", dtype=object)
    confidences = np.empty(len(X_test), dtype=object)
    for i in range(len(X_test)):
        confidences[i] = {}

    test_anom_idx = np.where(is_anomaly)[0]
    if len(test_anom_idx) > 0 and len(X_train_anom) > 0:
        X_test_anom = X_test.iloc[test_anom_idx]
        preds, confs = classifier.predict(X_test_anom)
        predicted_types[test_anom_idx] = preds
        for j, idx in enumerate(test_anom_idx):
            confidences[idx] = confs[j]

    # ── 7. Evaluation ────────────────────────────────────────────────────
    logger.info("Step 7/9: Evaluating models…")
    evaluator = ModelEvaluator(REPORTS_DIR)

    # Binary evaluation
    evaluator.evaluate_binary(
        y_test_bin.values,
        is_anomaly.astype(int),
        risk_scores / 100.0,
    )

    # Multi-class evaluation (on flagged anomalies only)
    if len(test_anom_idx) > 0 and len(X_train_anom) > 0:
        true_anom_multi = y_test_multi.iloc[test_anom_idx].values
        pred_anom_multi = predicted_types[test_anom_idx]
        evaluator.evaluate_multiclass(
            true_anom_multi,
            pred_anom_multi,
            classes=classifier.le.classes_,
        )

    # Feature importance
    try:
        fi = dict(zip(feature_cols, detector.xgb_clf.feature_importances_))
        evaluator.plot_feature_importance(fi, "XGBoost Feature Importance — Anomaly Detection")
    except Exception as e:
        logger.warning("Could not plot feature importance: %s", e)

    # Save metrics
    evaluator.save_metrics(extra_path=os.path.join(PROCESSED_DIR, "model_metrics.json"))

    # ── 8. SHAP explanations ─────────────────────────────────────────────
    logger.info("Step 8/9: Generating SHAP explanations…")
    explainer = AlertExplainer(detector.xgb_clf, feature_cols)

    # Generate explanations for all test events
    explanations = explainer.generate_explanation(X_test)

    # Global SHAP summary plot (on a sample to keep it fast)
    sample_size = min(500, len(X_test))
    explainer.generate_summary_plot(
        X_test.iloc[:sample_size],
        os.path.join(FIGURES_DIR, "shap_summary.png"),
    )

    # ── 9. Export dashboard-ready data ───────────────────────────────────
    logger.info("Step 9/9: Exporting dashboard-ready data…")

    alerts_list = []
    for i in range(len(X_test)):
        row = df_test.iloc[i]
        expl = explanations[i] if i < len(explanations) else {
            "top_factors": [], "natural_language": "", "shap_values": []
        }
        # Remove raw shap_values from the export (too large)
        expl_clean = {
            "top_factors": expl.get("top_factors", []),
            "natural_language": expl.get("natural_language", ""),
        }

        alert = {
            "id": i,
            "entity_id": str(row.get("entity_id", "")),
            "entity_type": str(row.get("entity_type", "")),
            "timestamp": str(row.get("timestamp", "")),
            "source_ip": str(row.get("source_ip", "")),
            "geo_location": str(row.get("geo_location", "")),
            "resource_accessed": str(row.get("resource_accessed", "")),
            "auth_method": str(row.get("auth_method", "")),
            "session_duration": float(row.get("session_duration", 0)),
            "action_status": str(row.get("action_status", "")),
            "command_sequence": str(row.get("command_sequence", "")),
            "device_fingerprint": str(row.get("device_fingerprint", "")),
            "risk_score": round(float(risk_scores[i]), 1),
            "is_anomaly": bool(is_anomaly[i]),
            "predicted_attack_type": str(predicted_types[i]),
            "attack_confidence": confidences[i] if isinstance(confidences[i], dict) else {},
            "explanation": expl_clean,
            "true_label": str(y_test_multi.iloc[i]),
        }
        alerts_list.append(alert)

    # Save alerts JSON
    with open(os.path.join(PROCESSED_DIR, "alerts.json"), "w", encoding="utf-8") as f:
        json.dump(alerts_list, f, indent=2, default=str)

    # Entity risk summary
    entity_risk = {}
    for alert in alerts_list:
        eid = alert["entity_id"]
        if eid not in entity_risk:
            entity_risk[eid] = {
                "entity_id": eid,
                "entity_type": alert["entity_type"],
                "total_events": 0,
                "anomaly_count": 0,
                "risk_scores": [],
                "last_seen": alert["timestamp"],
            }
        entity_risk[eid]["total_events"] += 1
        if alert["is_anomaly"]:
            entity_risk[eid]["anomaly_count"] += 1
        entity_risk[eid]["risk_scores"].append(alert["risk_score"])
        if alert["timestamp"] > entity_risk[eid]["last_seen"]:
            entity_risk[eid]["last_seen"] = alert["timestamp"]

    entity_risk_list = []
    for eid, data in entity_risk.items():
        scores = data.pop("risk_scores")
        data["avg_risk_score"] = round(sum(scores) / max(len(scores), 1), 1)
        data["max_risk_score"] = round(max(scores) if scores else 0, 1)
        data["status"] = (
            "critical" if data["avg_risk_score"] > 60
            else "warning" if data["avg_risk_score"] > 30
            else "normal"
        )
        entity_risk_list.append(data)

    entity_risk_list.sort(key=lambda e: e["avg_risk_score"], reverse=True)
    with open(os.path.join(PROCESSED_DIR, "entity_risk_summary.json"), "w", encoding="utf-8") as f:
        json.dump(entity_risk_list, f, indent=2)

    # ── Summary ──────────────────────────────────────────────────────────
    metrics = evaluator.metrics
    binary = metrics.get("binary", {})
    logger.info("=" * 65)
    logger.info("  PIPELINE COMPLETE — Results Summary")
    logger.info("=" * 65)
    logger.info("  Total events generated:   %d", len(df_features))
    logger.info("  Training events:          %d", len(X_train))
    logger.info("  Test events:              %d", len(X_test))
    logger.info("  Anomalies detected:       %d / %d", int(np.sum(is_anomaly)), len(X_test))
    logger.info("  ── Binary Detection Metrics ──")
    logger.info("  Accuracy:                 %.4f", binary.get("accuracy", 0))
    logger.info("  Precision:                %.4f", binary.get("precision", 0))
    logger.info("  Recall:                   %.4f", binary.get("recall", 0))
    logger.info("  F1 Score:                 %.4f", binary.get("f1", 0))
    logger.info("  AUC-ROC:                  %.4f", binary.get("auc_roc", 0))
    logger.info("  Precision@Top1%%:          %.4f", binary.get("precision_at_top_1_percent", 0))
    logger.info("  False Positive Rate:      %.4f", binary.get("false_positive_rate", 0))
    logger.info("  ── Outputs ──")
    logger.info("  Alerts JSON:              %s", os.path.join(PROCESSED_DIR, "alerts.json"))
    logger.info("  Metrics JSON:             %s", os.path.join(PROCESSED_DIR, "model_metrics.json"))
    logger.info("  Figures:                  %s", FIGURES_DIR)
    logger.info("  Models:                   %s", MODELS_DIR)
    logger.info("=" * 65)


if __name__ == "__main__":
    main()
