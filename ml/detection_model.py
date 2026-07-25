"""
Detection Model — XGBoost + LSTM Autoencoder Ensemble
=====================================================
Primary anomaly detection model combining gradient boosting with
sequence-aware autoencoder. Falls back to XGBoost-only if TensorFlow
is unavailable.
"""
import os
import numpy as np
import xgboost as xgb
import joblib
import logging

logger = logging.getLogger("cybershield.detector")

# Attempt TensorFlow import — graceful fallback if unavailable
try:
    from tensorflow.keras.models import Sequential, load_model
    from tensorflow.keras.layers import LSTM, Dense, RepeatVector, TimeDistributed, Input
    HAS_TENSORFLOW = True
except ImportError:
    HAS_TENSORFLOW = False
    logger.info("TensorFlow not available — using XGBoost-only detection")


class AnomalyDetector:
    """
    Ensemble anomaly detector combining:
      - XGBoost binary classifier (primary)
      - LSTM Autoencoder (sequence-aware, optional)

    Risk score = 0.6 × XGBoost_probability + 0.4 × normalized_LSTM_error
    If LSTM is unavailable, risk score = XGBoost_probability × 100.
    """

    def __init__(self):
        # XGBoost with class-weight handling for extreme imbalance
        self.xgb_clf = xgb.XGBClassifier(
            n_estimators=200,
            max_depth=6,
            learning_rate=0.1,
            scale_pos_weight=50,  # ~2% anomaly rate → 50:1 ratio
            eval_metric="logloss",
            use_label_encoder=False,
            tree_method="hist",
            random_state=42,
            verbosity=0,
        )
        self.lstm_autoencoder = None
        self.lstm_threshold = None
        self._use_lstm = HAS_TENSORFLOW

    def _build_lstm(self, n_features: int, seq_length: int = 10):
        """Build a 2-layer LSTM Autoencoder for sequence reconstruction."""
        if not HAS_TENSORFLOW:
            return None
        model = Sequential([
            Input(shape=(seq_length, n_features)),
            LSTM(64, activation="relu", return_sequences=False),
            RepeatVector(seq_length),
            LSTM(64, activation="relu", return_sequences=True),
            TimeDistributed(Dense(n_features)),
        ])
        model.compile(optimizer="adam", loss="mse")
        return model

    def train(self, X_train, y_train, X_train_seq=None):
        """
        Train both models.
        Args:
            X_train: DataFrame/array of features for XGBoost
            y_train: Binary labels (0=normal, 1=anomaly)
            X_train_seq: 3D array (samples, seq_length, features) for LSTM
        """
        # ── XGBoost ──────────────────────────────────────────────────
        logger.info("Training XGBoost classifier (%d samples)…", len(X_train))
        self.xgb_clf.fit(X_train, y_train)
        logger.info("  → XGBoost training complete")

        # ── LSTM Autoencoder (trained on NORMAL data only) ───────────
        if self._use_lstm and X_train_seq is not None:
            logger.info("Training LSTM Autoencoder…")
            try:
                # Train only on normal sequences
                normal_mask = (np.asarray(y_train) == 0)
                X_normal_seq = X_train_seq[normal_mask]

                if len(X_normal_seq) > 100:
                    self.lstm_autoencoder = self._build_lstm(
                        X_train_seq.shape[2], X_train_seq.shape[1]
                    )
                    self.lstm_autoencoder.fit(
                        X_normal_seq, X_normal_seq,
                        epochs=5,
                        batch_size=64,
                        validation_split=0.1,
                        verbose=0,
                    )
                    # Compute reconstruction error threshold (95th percentile of normal)
                    recon = self.lstm_autoencoder.predict(X_normal_seq, verbose=0)
                    errors = np.mean(np.square(X_normal_seq - recon), axis=(1, 2))
                    self.lstm_threshold = float(np.percentile(errors, 95))
                    logger.info("  → LSTM training complete (threshold=%.4f)", self.lstm_threshold)
                else:
                    logger.warning("  → Not enough normal sequences for LSTM — skipping")
                    self._use_lstm = False
            except Exception as e:
                logger.warning("  → LSTM training failed: %s — using XGBoost only", e)
                self._use_lstm = False
        else:
            self._use_lstm = False

    def predict(self, X_test, X_test_seq=None):
        """
        Predict anomalies and compute risk scores.
        Returns:
            risk_scores: array of float [0-100]
            is_anomaly: boolean array
        """
        # XGBoost probability of anomaly (class 1)
        xgb_prob = self.xgb_clf.predict_proba(X_test)[:, 1]

        if self._use_lstm and self.lstm_autoencoder is not None and X_test_seq is not None:
            try:
                reconstructions = self.lstm_autoencoder.predict(X_test_seq, verbose=0)
                lstm_errors = np.mean(np.square(X_test_seq - reconstructions), axis=(1, 2))
                # Normalize errors to [0, 1] using threshold
                max_err = max(np.max(lstm_errors), self.lstm_threshold * 2, 1e-9)
                lstm_normalized = np.clip(lstm_errors / max_err, 0, 1)
                # Weighted ensemble
                risk_scores = (0.6 * xgb_prob + 0.4 * lstm_normalized) * 100
            except Exception as e:
                logger.warning("LSTM prediction failed: %s — using XGBoost only", e)
                risk_scores = xgb_prob * 100
        else:
            # XGBoost-only scoring
            risk_scores = xgb_prob * 100

        risk_scores = np.clip(risk_scores, 0, 100)
        is_anomaly = risk_scores > 50

        return risk_scores, is_anomaly

    def save(self, xgb_path: str, lstm_path: str = None):
        """Save trained models to disk."""
        os.makedirs(os.path.dirname(xgb_path), exist_ok=True)
        joblib.dump(self.xgb_clf, xgb_path)
        logger.info("XGBoost model saved to %s", xgb_path)

        if self.lstm_autoencoder and lstm_path:
            try:
                self.lstm_autoencoder.save(lstm_path)
                logger.info("LSTM model saved to %s", lstm_path)
            except Exception as e:
                logger.warning("Could not save LSTM model: %s", e)

    def load(self, xgb_path: str, lstm_path: str = None):
        """Load trained models from disk."""
        self.xgb_clf = joblib.load(xgb_path)
        if lstm_path and os.path.exists(lstm_path) and HAS_TENSORFLOW:
            try:
                self.lstm_autoencoder = load_model(lstm_path)
                self._use_lstm = True
            except Exception as e:
                logger.warning("Could not load LSTM model: %s", e)
                self._use_lstm = False
