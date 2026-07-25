"""
Feature Engineering Pipeline
=============================
Transforms raw access logs into ML-ready features covering temporal,
geo/network, behavioral, device, and entity-history dimensions.
"""
import os
import numpy as np
import pandas as pd
from math import radians, cos, sin, asin, sqrt
import logging

logger = logging.getLogger("cybershield.features")


def haversine(lon1, lat1, lon2, lat2):
    """Calculate the great-circle distance in km between two points on Earth."""
    if pd.isna(lon1) or pd.isna(lat1) or pd.isna(lon2) or pd.isna(lat2):
        return 0.0
    lon1, lat1, lon2, lat2 = map(radians, [float(lon1), float(lat1), float(lon2), float(lat2)])
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    c = 2 * asin(sqrt(min(1.0, a)))  # clamp for floating point safety
    return 6371.0 * c


class FeatureEngineer:
    """
    Extracts behavioural, temporal, geo-spatial, and device features
    from raw access-log events.
    """

    def __init__(self):
        self.entity_stats = {}

    def fit_transform(self, df: pd.DataFrame) -> pd.DataFrame:
        """Main entry: takes raw log DataFrame, returns feature-enriched DataFrame."""
        df = df.copy()
        logger.info("Starting feature engineering on %d events…", len(df))

        # ── Ensure proper types ──────────────────────────────────────────
        df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
        df.sort_values(["entity_id", "timestamp"], inplace=True)
        df.reset_index(drop=True, inplace=True)

        # ── 1. Temporal features ─────────────────────────────────────────
        df["hour_of_day"] = df["timestamp"].dt.hour
        df["day_of_week"] = df["timestamp"].dt.dayofweek
        df["is_weekend"] = df["day_of_week"].isin([5, 6]).astype(int)
        df["is_off_hours"] = ((df["hour_of_day"] < 6) | (df["hour_of_day"] > 22)).astype(int)

        # Time since previous event for the same entity
        df["time_since_last_login"] = (
            df.groupby("entity_id")["timestamp"]
            .diff()
            .dt.total_seconds()
            .fillna(0)
        )

        # Rolling login counts using a simple expanding window approach
        # (avoids buggy groupby-rolling on DatetimeIndex)
        df["login_count_1h"] = self._rolling_count(df, window_sec=3600)
        df["login_count_6h"] = self._rolling_count(df, window_sec=21600)
        df["login_count_24h"] = self._rolling_count(df, window_sec=86400)

        # Failed auth ratio in last 1 hour window (per entity)
        df["is_failure"] = (df["action_status"] == "failure").astype(int)
        df["failed_auth_ratio_1h"] = self._rolling_failure_rate(df, window_sec=3600)

        # ── 2. Geo / Network features ───────────────────────────────────
        df["prev_lat"] = df.groupby("entity_id")["lat"].shift(1)
        df["prev_lon"] = df.groupby("entity_id")["lon"].shift(1)

        df["distance_km"] = df.apply(
            lambda r: haversine(r["lon"], r["lat"], r["prev_lon"], r["prev_lat"]),
            axis=1,
        )
        # Geo-velocity: km/h between consecutive logins
        df["geo_velocity_kmh"] = np.where(
            df["time_since_last_login"] > 0,
            df["distance_km"] / (df["time_since_last_login"] / 3600.0),
            0.0,
        )
        # Cap extreme velocities at 30 000 km/h (low-earth orbit)
        df["geo_velocity_kmh"] = df["geo_velocity_kmh"].clip(upper=30000)

        # Unique IPs seen so far per entity (cumulative)
        df["unique_ips_24h"] = self._cumulative_nunique(df, "entity_id", "source_ip")
        # Is this IP new for the entity?
        df["is_new_ip"] = (
            ~df.duplicated(subset=["entity_id", "source_ip"], keep="first")
        ).astype(int)

        # ── 3. Device features ───────────────────────────────────────────
        df["fingerprint_changed"] = (
            df["device_fingerprint"]
            != df.groupby("entity_id")["device_fingerprint"].shift(1)
        ).astype(int)
        df["is_new_device"] = (
            ~df.duplicated(subset=["entity_id", "device_fingerprint"], keep="first")
        ).astype(int)
        df["auth_method_changed"] = (
            df["auth_method"]
            != df.groupby("entity_id")["auth_method"].shift(1)
        ).astype(int)

        # ── 4. Behavioral features ───────────────────────────────────────
        df["command_diversity"] = df["command_sequence"].apply(
            lambda x: len(set(str(x).split(","))) if pd.notna(x) else 0
        )
        df["num_commands"] = df["command_sequence"].apply(
            lambda x: len(str(x).split(",")) if pd.notna(x) else 0
        )

        # Session-duration z-score per entity
        ent_mean = df.groupby("entity_id")["session_duration"].transform("mean")
        ent_std = df.groupby("entity_id")["session_duration"].transform("std").replace(0, 1).fillna(1)
        df["session_duration_zscore"] = (df["session_duration"] - ent_mean) / ent_std

        # ── 5. Entity-history / cold-start features ──────────────────────
        df["total_historical_events"] = df.groupby("entity_id").cumcount() + 1
        df["is_cold_start"] = (df["total_historical_events"] < 20).astype(int)
        df["entity_age_days"] = (
            df.groupby("entity_id")["timestamp"]
            .transform(lambda s: (s - s.min()).dt.total_seconds() / 86400.0)
        )

        # Per-entity aggregated stats (expanding means)
        df["avg_session_duration"] = ent_mean
        df["std_session_duration"] = ent_std
        df["typical_hour_mean"] = df.groupby("entity_id")["hour_of_day"].transform("mean")
        df["typical_hour_std"] = df.groupby("entity_id")["hour_of_day"].transform("std").fillna(1)

        # Hour deviation from entity's typical hour
        df["hour_deviation"] = abs(df["hour_of_day"] - df["typical_hour_mean"])

        # ── 6. Anomaly indicator features ────────────────────────────────
        # Login burst: events in last 5 minutes
        df["login_burst_5min"] = self._rolling_count(df, window_sec=300)

        # Geo anomaly: distance from entity's most common location
        df["geo_anomaly_score"] = df["distance_km"].clip(upper=20000) / 20000.0

        # ── Cleanup ──────────────────────────────────────────────────────
        df.drop(columns=["prev_lat", "prev_lon", "is_failure"], errors="ignore", inplace=True)
        df.fillna(0, inplace=True)

        # Replace inf with 0
        df.replace([np.inf, -np.inf], 0, inplace=True)

        logger.info("Feature engineering complete: %d features", len(df.columns))
        return df

    # ── Helper: cumulative unique count per entity ─────────────────────
    @staticmethod
    def _cumulative_nunique(df: pd.DataFrame, group_col: str, value_col: str) -> pd.Series:
        """
        For each row, count how many unique values of *value_col* the
        entity (group_col) has seen up to and including this row.
        """
        counts = pd.Series(0, index=df.index, dtype=int)
        for eid, grp in df.groupby(group_col):
            seen = set()
            result = np.zeros(len(grp), dtype=int)
            for i, val in enumerate(grp[value_col].values):
                seen.add(val)
                result[i] = len(seen)
            counts.iloc[grp.index] = result
        return counts

    # ── Helper: rolling event count per entity ───────────────────────────
    @staticmethod
    def _rolling_count(df: pd.DataFrame, window_sec: int) -> pd.Series:
        """
        For each row, count how many events the same entity had
        within the preceding *window_sec* seconds (inclusive).
        Uses a vectorised approach: for each entity-group, compute
        the cumulative count and subtract the count at t-window.
        """
        counts = pd.Series(0, index=df.index, dtype=int)
        for eid, grp in df.groupby("entity_id"):
            ts = grp["timestamp"].values.astype("int64") // 10 ** 9  # epoch seconds
            n = len(ts)
            result = np.ones(n, dtype=int)
            j = 0
            for i in range(n):
                while ts[j] < ts[i] - window_sec:
                    j += 1
                result[i] = i - j + 1
            counts.iloc[grp.index] = result
        return counts

    @staticmethod
    def _rolling_failure_rate(df: pd.DataFrame, window_sec: int) -> pd.Series:
        """
        For each row, compute the fraction of events in the preceding
        *window_sec* seconds (same entity) that were failures.
        """
        rates = pd.Series(0.0, index=df.index)
        for eid, grp in df.groupby("entity_id"):
            ts = grp["timestamp"].values.astype("int64") // 10 ** 9
            fails = grp["is_failure"].values
            n = len(ts)
            result = np.zeros(n)
            j = 0
            for i in range(n):
                while ts[j] < ts[i] - window_sec:
                    j += 1
                window_fails = fails[j: i + 1]
                result[i] = window_fails.sum() / max(len(window_fails), 1)
            rates.iloc[grp.index] = result
        return rates


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    fe = FeatureEngineer()
    df = pd.read_csv(r"c:\Users\bhanu\OneDrive\Desktop\Honeywell\datasets\generated\access_logs.csv")
    df_features = fe.fit_transform(df)
    os.makedirs(r"c:\Users\bhanu\OneDrive\Desktop\Honeywell\datasets\processed", exist_ok=True)
    df_features.to_csv(r"c:\Users\bhanu\OneDrive\Desktop\Honeywell\datasets\processed\features.csv", index=False)
    print(f"Features extracted and saved — {len(df_features.columns)} columns.")
