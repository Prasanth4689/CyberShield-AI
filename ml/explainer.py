"""
Explainability Layer — SHAP-based Feature Attribution
=======================================================
Provides per-alert SHAP explanations with natural-language summaries,
waterfall plots, and global summary plots for SOC analyst consumption.
"""
import os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import logging

logger = logging.getLogger("cybershield.explainer")

# Human-readable feature name mapping
FEATURE_DISPLAY_NAMES = {
    "geo_velocity_kmh": "Geo-Velocity (km/h)",
    "distance_km": "Distance from Last Login",
    "time_since_last_login": "Time Since Last Login",
    "login_count_1h": "Logins in Last Hour",
    "login_count_6h": "Logins in Last 6 Hours",
    "login_count_24h": "Logins in Last 24 Hours",
    "failed_auth_ratio_1h": "Failed Auth Ratio (1h)",
    "is_off_hours": "Off-Hours Access",
    "is_weekend": "Weekend Access",
    "hour_of_day": "Hour of Day",
    "session_duration_zscore": "Session Duration Anomaly",
    "fingerprint_changed": "Device Fingerprint Changed",
    "is_new_device": "New Device Detected",
    "is_new_ip": "New IP Address",
    "unique_ips_24h": "Unique IPs (24h)",
    "command_diversity": "Command Diversity",
    "is_cold_start": "New Entity (Cold Start)",
    "login_burst_5min": "Login Burst (5min)",
    "auth_method_changed": "Auth Method Changed",
    "hour_deviation": "Hour Deviation from Norm",
    "geo_anomaly_score": "Geo-Location Anomaly",
    "total_historical_events": "Total Historical Events",
    "entity_age_days": "Entity Age (Days)",
}


def _display_name(feature: str) -> str:
    """Return a human-readable name for a feature."""
    return FEATURE_DISPLAY_NAMES.get(feature, feature.replace("_", " ").title())


class AlertExplainer:
    """
    SHAP-based explainability for XGBoost anomaly detection.
    Produces per-alert explanations and global summary visuals.
    """

    def __init__(self, model, feature_names: list):
        self.model = model
        self.feature_names = list(feature_names)
        # Lazily initialise SHAP explainer
        self._explainer = None

    def _get_explainer(self):
        if self._explainer is None:
            try:
                import shap
                self._explainer = shap.TreeExplainer(self.model)
            except Exception as e:
                logger.error("Failed to create SHAP TreeExplainer: %s", e)
                self._explainer = None
        return self._explainer

    def generate_explanation(self, event_features_df) -> list:
        """
        Generate per-event explanations.

        Returns a list of dicts, each containing:
          - top_factors: list of {feature, display_name, contribution, direction}
          - natural_language: human-readable explanation string
          - shap_values: raw SHAP values list
        """
        explainer = self._get_explainer()
        if explainer is None:
            # Fallback: return feature-importance-based explanations
            return self._fallback_explanations(event_features_df)

        try:
            import shap
            shap_values = explainer.shap_values(event_features_df)
        except Exception as e:
            logger.warning("SHAP computation failed: %s — using fallback", e)
            return self._fallback_explanations(event_features_df)

        explanations = []
        for i in range(len(event_features_df)):
            try:
                sv = shap_values[i]
                # Handle multi-output (binary classifier returns list of 2 arrays)
                if isinstance(shap_values, list):
                    sv = shap_values[1][i] if len(shap_values) == 2 else shap_values[0][i]
                elif len(sv.shape) > 1:
                    sv = sv[:, 1] if sv.shape[1] >= 2 else sv[:, 0]

                sv = np.asarray(sv).flatten()

                # Top 5 most influential features
                top_k = min(5, len(sv))
                top_indices = np.argsort(np.abs(sv))[-top_k:][::-1]

                top_factors = []
                nl_parts = []
                for idx in top_indices:
                    feat = self.feature_names[idx] if idx < len(self.feature_names) else f"feature_{idx}"
                    val = float(sv[idx])
                    direction = "increased risk" if val > 0 else "decreased risk"
                    display = _display_name(feat)
                    top_factors.append({
                        "feature": feat,
                        "display_name": display,
                        "contribution": round(val, 4),
                        "direction": direction,
                    })
                    if val > 0:
                        nl_parts.append(display)

                if nl_parts:
                    nl = "Flagged due to: " + ", ".join(nl_parts[:3]) + "."
                else:
                    nl = "No significant anomaly factors detected."

                explanations.append({
                    "top_factors": top_factors,
                    "natural_language": nl,
                    "shap_values": sv.tolist(),
                })
            except Exception as exc:
                logger.debug("Explanation for event %d failed: %s", i, exc)
                explanations.append({
                    "top_factors": [],
                    "natural_language": "Explanation unavailable.",
                    "shap_values": [],
                })

        logger.info("Generated %d SHAP explanations", len(explanations))
        return explanations

    def _fallback_explanations(self, event_features_df) -> list:
        """Feature-importance based fallback when SHAP is unavailable."""
        try:
            importances = self.model.feature_importances_
        except AttributeError:
            importances = np.ones(len(self.feature_names)) / len(self.feature_names)

        top_idx = np.argsort(importances)[-5:][::-1]
        explanations = []
        for i in range(len(event_features_df)):
            row = event_features_df.iloc[i]
            top_factors = []
            nl_parts = []
            for idx in top_idx:
                feat = self.feature_names[idx] if idx < len(self.feature_names) else f"feature_{idx}"
                display = _display_name(feat)
                top_factors.append({
                    "feature": feat,
                    "display_name": display,
                    "contribution": round(float(importances[idx]), 4),
                    "direction": "increased risk",
                })
                nl_parts.append(display)
            explanations.append({
                "top_factors": top_factors,
                "natural_language": "Key factors: " + ", ".join(nl_parts[:3]) + ".",
                "shap_values": [],
            })
        return explanations

    def generate_summary_plot(self, X, save_path: str):
        """Generate and save a global SHAP summary plot."""
        explainer = self._get_explainer()
        if explainer is None:
            logger.warning("Cannot generate summary plot — no SHAP explainer")
            return

        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        try:
            import shap
            shap_values = explainer.shap_values(X)
            # Handle binary classifier output
            if isinstance(shap_values, list) and len(shap_values) == 2:
                shap_values = shap_values[1]
            plt.figure(figsize=(12, 8))
            shap.summary_plot(shap_values, X, show=False, max_display=20)
            plt.tight_layout()
            plt.savefig(save_path, dpi=150, bbox_inches="tight")
            plt.close()
            logger.info("SHAP summary plot saved to %s", save_path)
        except Exception as e:
            logger.warning("Failed to generate SHAP summary plot: %s", e)

    def generate_waterfall_plot(self, event_index: int, X, save_path: str):
        """Generate and save a SHAP waterfall plot for a single event."""
        explainer = self._get_explainer()
        if explainer is None:
            return

        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        try:
            import shap
            shap_values = explainer(X.iloc[[event_index]])
            plt.figure(figsize=(10, 6))
            shap.plots.waterfall(shap_values[0], show=False, max_display=10)
            plt.tight_layout()
            plt.savefig(save_path, dpi=150, bbox_inches="tight")
            plt.close()
        except Exception as e:
            logger.warning("Failed to generate waterfall plot: %s", e)
