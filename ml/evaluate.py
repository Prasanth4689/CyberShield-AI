"""
Model Evaluation & Reporting
=============================
Generates all evaluation metrics, plots (confusion matrix, ROC curves,
precision-recall curves, feature importance), and exports results.
"""
import os
import json
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")  # non-interactive backend
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.metrics import (
    confusion_matrix, classification_report,
    roc_curve, precision_recall_curve, auc,
    f1_score, precision_score, recall_score,
    accuracy_score, roc_auc_score,
)
import logging

logger = logging.getLogger("cybershield.evaluate")


class ModelEvaluator:
    """Generates evaluation metrics, plots, and JSON reports."""

    def __init__(self, report_dir: str):
        self.report_dir = report_dir
        self.figures_dir = os.path.join(report_dir, "figures")
        os.makedirs(self.figures_dir, exist_ok=True)
        self.metrics: dict = {}

    # ── Binary anomaly detection ─────────────────────────────────────────
    def evaluate_binary(self, y_true, y_pred, y_prob):
        """Evaluate binary (normal vs anomaly) detection performance."""
        y_true = np.asarray(y_true)
        y_pred = np.asarray(y_pred)
        y_prob = np.asarray(y_prob)

        acc = float(accuracy_score(y_true, y_pred))
        prec = float(precision_score(y_true, y_pred, zero_division=0))
        rec = float(recall_score(y_true, y_pred, zero_division=0))
        f1 = float(f1_score(y_true, y_pred, zero_division=0))

        try:
            auc_val = float(roc_auc_score(y_true, y_prob))
        except ValueError:
            auc_val = 0.0

        # Precision @ top 1% (analyst alert budget)
        n_top = max(1, int(len(y_prob) * 0.01))
        top_indices = np.argsort(y_prob)[-n_top:]
        prec_at_1 = float(np.mean(y_true[top_indices] == 1))

        # False positive rate
        fp = int(np.sum((y_pred == 1) & (y_true == 0)))
        tn = int(np.sum((y_pred == 0) & (y_true == 0)))
        fpr = fp / max(fp + tn, 1)

        self.metrics["binary"] = {
            "accuracy": round(acc, 4),
            "precision": round(prec, 4),
            "recall": round(rec, 4),
            "f1": round(f1, 4),
            "auc_roc": round(auc_val, 4),
            "precision_at_top_1_percent": round(prec_at_1, 4),
            "false_positive_rate": round(fpr, 4),
        }
        logger.info("Binary metrics: %s", self.metrics["binary"])

        # ── ROC curve plot ───────────────────────────────────────────────
        try:
            fpr_arr, tpr_arr, _ = roc_curve(y_true, y_prob)
            plt.figure(figsize=(8, 6))
            plt.plot(fpr_arr, tpr_arr, color="#06b6d4", lw=2,
                     label=f"AUC = {auc_val:.3f}")
            plt.plot([0, 1], [0, 1], "k--", alpha=0.3)
            plt.xlabel("False Positive Rate")
            plt.ylabel("True Positive Rate")
            plt.title("ROC Curve — Anomaly Detection")
            plt.legend(loc="lower right")
            plt.tight_layout()
            plt.savefig(os.path.join(self.figures_dir, "roc_curve.png"), dpi=150)
            plt.close()
        except Exception as e:
            logger.warning("Could not plot ROC curve: %s", e)

        # ── Precision-Recall curve ───────────────────────────────────────
        try:
            prec_arr, rec_arr, _ = precision_recall_curve(y_true, y_prob)
            pr_auc = auc(rec_arr, prec_arr)
            plt.figure(figsize=(8, 6))
            plt.plot(rec_arr, prec_arr, color="#d946ef", lw=2,
                     label=f"PR-AUC = {pr_auc:.3f}")
            plt.xlabel("Recall")
            plt.ylabel("Precision")
            plt.title("Precision-Recall Curve")
            plt.legend()
            plt.tight_layout()
            plt.savefig(os.path.join(self.figures_dir, "precision_recall_curve.png"), dpi=150)
            plt.close()
            self.metrics["binary"]["pr_auc"] = round(float(pr_auc), 4)
        except Exception as e:
            logger.warning("Could not plot PR curve: %s", e)

        # ── Binary confusion matrix ──────────────────────────────────────
        cm = confusion_matrix(y_true, y_pred)
        self.metrics["binary"]["confusion_matrix"] = cm.tolist()
        plt.figure(figsize=(6, 5))
        sns.heatmap(cm, annot=True, fmt="d", cmap="Blues",
                    xticklabels=["Normal", "Anomaly"],
                    yticklabels=["Normal", "Anomaly"])
        plt.title("Binary Confusion Matrix")
        plt.ylabel("True Label")
        plt.xlabel("Predicted Label")
        plt.tight_layout()
        plt.savefig(os.path.join(self.figures_dir, "binary_confusion_matrix.png"), dpi=150)
        plt.close()

        return self.metrics["binary"]

    # ── Multi-class attack-type classification ───────────────────────────
    def evaluate_multiclass(self, y_true, y_pred, classes=None):
        """Evaluate multi-class attack-type classification."""
        report = classification_report(y_true, y_pred, output_dict=True, zero_division=0)
        self.metrics["multiclass"] = report
        logger.info("Multi-class weighted F1: %.4f", report.get("weighted avg", {}).get("f1-score", 0))

        # ── Confusion matrix heatmap ─────────────────────────────────────
        if classes is None:
            classes = sorted(set(list(y_true) + list(y_pred)))
        cm = confusion_matrix(y_true, y_pred, labels=classes)
        self.metrics["multiclass"]["confusion_matrix"] = cm.tolist()
        self.metrics["multiclass"]["classes"] = list(classes)

        plt.figure(figsize=(12, 10))
        short_labels = [c.replace("_", "\n") for c in classes]
        sns.heatmap(cm, annot=True, fmt="d", cmap="YlOrRd",
                    xticklabels=short_labels, yticklabels=short_labels)
        plt.title("Attack-Type Confusion Matrix")
        plt.ylabel("True Label")
        plt.xlabel("Predicted Label")
        plt.tight_layout()
        plt.savefig(os.path.join(self.figures_dir, "confusion_matrix.png"), dpi=150)
        plt.close()

        return report

    # ── Feature importance plot ──────────────────────────────────────────
    def plot_feature_importance(self, importances: dict, title="Feature Importance"):
        """Plot horizontal bar chart of feature importances."""
        sorted_feats = sorted(importances.items(), key=lambda x: x[1], reverse=True)[:20]
        names = [f[0] for f in sorted_feats]
        values = [f[1] for f in sorted_feats]

        self.metrics["feature_importance"] = [
            {"feature": n, "importance": round(float(v), 4)}
            for n, v in sorted_feats
        ]

        plt.figure(figsize=(10, 8))
        colors = plt.cm.viridis(np.linspace(0.3, 0.9, len(names)))
        plt.barh(range(len(names)), values, color=colors)
        plt.yticks(range(len(names)), names)
        plt.xlabel("Importance")
        plt.title(title)
        plt.gca().invert_yaxis()
        plt.tight_layout()
        plt.savefig(os.path.join(self.figures_dir, "feature_importance.png"), dpi=150)
        plt.close()

    # ── Save all metrics ─────────────────────────────────────────────────
    def save_metrics(self, extra_path=None):
        """Save metrics as JSON."""
        # Main report
        path = os.path.join(self.report_dir, "evaluation_metrics.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(self.metrics, f, indent=2, default=str)
        logger.info("Metrics saved to %s", path)

        # Also save a dashboard-friendly copy
        if extra_path:
            os.makedirs(os.path.dirname(extra_path), exist_ok=True)
            with open(extra_path, "w", encoding="utf-8") as f:
                json.dump(self.metrics, f, indent=2, default=str)
            logger.info("Dashboard metrics saved to %s", extra_path)
