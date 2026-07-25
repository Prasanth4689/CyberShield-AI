"""
CyberShield AI — Flask Backend API Server
==========================================
Serves the analyst-facing dashboard and provides REST API endpoints
for alerts, entities, predictions, explanations, and reporting.
"""
import csv
import io
import json
import logging
import os
import sys

from flask import Flask, jsonify, request, send_from_directory, Response
from flask_cors import CORS

# Add project root to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from backend.config import (
    ALERTS_FILE, MODEL_METRICS_FILE, ENTITY_RISK_FILE,
    DASHBOARD_DIR, FIGURES_DIR, REPORTS_DIR,
    SERVER_HOST, SERVER_PORT, DEBUG_MODE,
    ATTACK_TYPES, get_severity, ensure_directories,
)

# ---------------------------------------------------------------------------
# Logging setup
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("cybershield.api")

# ---------------------------------------------------------------------------
# Flask application
# ---------------------------------------------------------------------------
app = Flask(
    __name__,
    static_folder=DASHBOARD_DIR,
    static_url_path="/static",
)
CORS(app)

# ---------------------------------------------------------------------------
# In-memory data cache (loaded from JSON files produced by train_pipeline)
# ---------------------------------------------------------------------------
_alerts_cache: list = []
_metrics_cache: dict = {}
_entity_risk_cache: list = []


def _load_json(filepath: str):
    """Safely load a JSON file, returning empty structure on error."""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        logger.warning("Data file not found: %s — using empty data", filepath)
        return [] if filepath.endswith("alerts.json") or filepath.endswith("entity_risk_summary.json") else {}
    except json.JSONDecodeError as exc:
        logger.error("Invalid JSON in %s: %s", filepath, exc)
        return []


def reload_data():
    """Reload all data files into the in-memory cache."""
    global _alerts_cache, _metrics_cache, _entity_risk_cache
    logger.info("Loading data files...")
    _alerts_cache = _load_json(ALERTS_FILE)
    _metrics_cache = _load_json(MODEL_METRICS_FILE)
    _entity_risk_cache = _load_json(ENTITY_RISK_FILE)
    logger.info(
        "Loaded %d alerts, %d entity risk entries",
        len(_alerts_cache), len(_entity_risk_cache),
    )


# ---------------------------------------------------------------------------
# Dashboard serving
# ---------------------------------------------------------------------------
@app.after_request
def add_no_cache_headers(response):
    """Disable caching for HTML/JS/CSS so Render always serves latest."""
    ct = response.content_type or ''
    if any(t in ct for t in ['text/html', 'javascript', 'text/css']):
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    return response


@app.route("/")
def serve_dashboard():
    """Serve the main dashboard HTML page."""
    return send_from_directory(DASHBOARD_DIR, "index.html")


@app.route("/css/<path:filename>")
def serve_css(filename):
    """Serve dashboard CSS files."""
    return send_from_directory(os.path.join(DASHBOARD_DIR, "css"), filename)


@app.route("/js/<path:filename>")
def serve_js(filename):
    """Serve dashboard JavaScript files."""
    return send_from_directory(os.path.join(DASHBOARD_DIR, "js"), filename)


@app.route("/figures/<path:filename>")
def serve_figures(filename):
    """Serve report figures (plots, charts)."""
    return send_from_directory(FIGURES_DIR, filename)


@app.route("/pdf/<filename>")
def serve_pdfs(filename):
    """Serve PDF deliverables."""
    project_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    filename_map = {
        "presentation": "CyberShield_AI_Idea_Submission.pdf",
        "report": "CyberShield_AI_Solution_Report.pdf",
        "code": "CyberShield_AI_Source_Code_Documentation.pdf",
        "CyberShield_AI_Idea_Submission.pdf": "CyberShield_AI_Idea_Submission.pdf",
        "CyberShield_AI_Solution_Report.pdf": "CyberShield_AI_Solution_Report.pdf",
        "CyberShield_AI_Source_Code_Documentation.pdf": "CyberShield_AI_Source_Code_Documentation.pdf",
    }
    target_file = filename_map.get(filename, filename)
    return send_from_directory(project_dir, target_file, mimetype="application/pdf")


# ---------------------------------------------------------------------------
# API: Dashboard Statistics
# ---------------------------------------------------------------------------
@app.route("/api/stats")
def api_stats():
    """
    Return high-level KPI statistics for the dashboard.
    Response: {total_events, anomalies_detected, false_positive_rate,
               mean_risk_score, active_entities, alerts_today, critical_alerts}
    """
    alerts = _alerts_cache
    total = len(alerts)
    anomalies = [a for a in alerts if a.get("is_anomaly")]
    risk_scores = [a.get("risk_score", 0) for a in alerts]
    entities = set(a.get("entity_id", "") for a in alerts)

    # Critical = risk_score >= 80
    critical = sum(1 for a in anomalies if a.get("risk_score", 0) >= 80)

    # False positive rate from model metrics (nested under 'binary')
    binary_metrics = _metrics_cache.get("binary", _metrics_cache)
    fpr = binary_metrics.get("false_positive_rate", 0.0)

    stats = {
        "total_events": total,
        "anomalies_detected": len(anomalies),
        "false_positive_rate": round(fpr * 100, 2) if fpr < 1 else round(fpr, 2),
        "mean_risk_score": round(sum(risk_scores) / max(len(risk_scores), 1), 1),
        "active_entities": len(entities),
        "alerts_today": len(anomalies),  # all alerts in this dataset
        "critical_alerts": critical,
    }
    return jsonify(stats)


# ---------------------------------------------------------------------------
# API: Alerts
# ---------------------------------------------------------------------------
@app.route("/api/alerts")
def api_alerts():
    """
    Return ranked alert queue, optionally filtered.
    Query params: attack_type, min_risk, max_risk, entity_type, search, limit, offset
    """
    alerts = _alerts_cache
    filtered = list(alerts)

    # ----- Filters -----
    attack_type = request.args.get("attack_type")
    if attack_type and attack_type != "all":
        filtered = [a for a in filtered if a.get("predicted_attack_type") == attack_type]

    min_risk = request.args.get("min_risk", type=float)
    if min_risk is not None:
        filtered = [a for a in filtered if a.get("risk_score", 0) >= min_risk]

    max_risk = request.args.get("max_risk", type=float)
    if max_risk is not None:
        filtered = [a for a in filtered if a.get("risk_score", 0) <= max_risk]

    entity_type = request.args.get("entity_type")
    if entity_type and entity_type != "all":
        filtered = [a for a in filtered if a.get("entity_type") == entity_type]

    search = request.args.get("search", "").strip().lower()
    if search:
        filtered = [
            a for a in filtered
            if search in str(a.get("entity_id", "")).lower()
            or search in str(a.get("source_ip", "")).lower()
            or search in str(a.get("resource_accessed", "")).lower()
            or search in str(a.get("geo_location", "")).lower()
        ]

    # ----- Sort by risk_score descending -----
    filtered.sort(key=lambda a: a.get("risk_score", 0), reverse=True)

    # ----- Pagination -----
    limit = request.args.get("limit", default=100, type=int)
    offset = request.args.get("offset", default=0, type=int)
    total = len(filtered)
    paginated = filtered[offset: offset + limit]

    # Add severity and id to each alert
    for i, alert in enumerate(paginated):
        alert["severity"] = get_severity(alert.get("risk_score", 0))
        if "id" not in alert:
            alert["id"] = i + offset

    return jsonify({
        "total": total,
        "limit": limit,
        "offset": offset,
        "alerts": paginated,
    })


@app.route("/api/alerts/<int:alert_id>")
def api_alert_detail(alert_id):
    """
    Return full detail for a single alert, including explanation.
    """
    if 0 <= alert_id < len(_alerts_cache):
        alert = dict(_alerts_cache[alert_id])
        alert["id"] = alert_id
        alert["severity"] = get_severity(alert.get("risk_score", 0))
        return jsonify(alert)
    return jsonify({"error": "Alert not found"}), 404


# ---------------------------------------------------------------------------
# API: Entities
# ---------------------------------------------------------------------------
@app.route("/api/entities")
def api_entities():
    """
    Return list of entities with risk summaries.
    """
    if _entity_risk_cache:
        return jsonify(_entity_risk_cache)

    # Compute from alerts if entity_risk_summary not available
    entity_map = {}
    for alert in _alerts_cache:
        eid = alert.get("entity_id", "unknown")
        if eid not in entity_map:
            entity_map[eid] = {
                "entity_id": eid,
                "entity_type": alert.get("entity_type", "user"),
                "total_events": 0,
                "anomaly_count": 0,
                "risk_scores": [],
                "last_seen": alert.get("timestamp", ""),
            }
        entity_map[eid]["total_events"] += 1
        if alert.get("is_anomaly"):
            entity_map[eid]["anomaly_count"] += 1
        entity_map[eid]["risk_scores"].append(alert.get("risk_score", 0))
        # Track most recent timestamp
        ts = alert.get("timestamp", "")
        if ts > entity_map[eid]["last_seen"]:
            entity_map[eid]["last_seen"] = ts

    result = []
    for eid, data in entity_map.items():
        scores = data.pop("risk_scores")
        data["avg_risk_score"] = round(sum(scores) / max(len(scores), 1), 1)
        data["max_risk_score"] = round(max(scores) if scores else 0, 1)
        data["status"] = "critical" if data["avg_risk_score"] > 60 else (
            "warning" if data["avg_risk_score"] > 30 else "normal"
        )
        result.append(data)

    result.sort(key=lambda e: e["avg_risk_score"], reverse=True)
    return jsonify(result)


@app.route("/api/entities/<entity_id>/history")
def api_entity_history(entity_id):
    """
    Return access history timeline for a specific entity.
    """
    history = [
        a for a in _alerts_cache
        if a.get("entity_id") == entity_id
    ]
    history.sort(key=lambda a: a.get("timestamp", ""))
    # Limit to last 100 events for performance
    return jsonify(history[-100:])


# ---------------------------------------------------------------------------
# API: Predictions (for new events)
# ---------------------------------------------------------------------------
@app.route("/api/predict", methods=["POST"])
def api_predict():
    """
    Score a new access event submitted as JSON.
    In production, this would run the ML pipeline in real-time.
    For the hackathon demo, returns a simulated prediction.
    """
    event = request.get_json(silent=True)
    if not event:
        return jsonify({"error": "No JSON body provided"}), 400

    # Simulated prediction response
    import random
    risk_score = random.uniform(5, 95)
    is_anomaly = risk_score > 50
    attack_type = random.choice(ATTACK_TYPES) if is_anomaly else "normal"

    return jsonify({
        "risk_score": round(risk_score, 1),
        "is_anomaly": is_anomaly,
        "predicted_attack_type": attack_type,
        "severity": get_severity(risk_score),
        "explanation": {
            "natural_language": f"Risk score: {risk_score:.1f}. "
                                f"{'Anomaly detected' if is_anomaly else 'Normal activity'}.",
            "top_factors": [],
        },
    })


# ---------------------------------------------------------------------------
# API: Explainability
# ---------------------------------------------------------------------------
@app.route("/api/explain/<int:alert_id>")
def api_explain(alert_id):
    """
    Return SHAP-based explanation for a specific alert.
    """
    if 0 <= alert_id < len(_alerts_cache):
        alert = _alerts_cache[alert_id]
        explanation = alert.get("explanation", {})
        return jsonify({
            "alert_id": alert_id,
            "entity_id": alert.get("entity_id"),
            "risk_score": alert.get("risk_score"),
            "attack_type": alert.get("predicted_attack_type"),
            "explanation": explanation,
        })
    return jsonify({"error": "Alert not found"}), 404


# ---------------------------------------------------------------------------
# API: Model Performance Metrics
# ---------------------------------------------------------------------------
@app.route("/api/model/metrics")
def api_model_metrics():
    """Return model evaluation metrics (accuracy, F1, confusion matrix, etc.)."""
    return jsonify(_metrics_cache)


# ---------------------------------------------------------------------------
# API: Report Export
# ---------------------------------------------------------------------------
@app.route("/api/reports/export")
def api_export_report():
    """
    Export filtered alerts as a CSV file download.
    Supports the same filters as /api/alerts.
    """
    alerts = list(_alerts_cache)

    # Apply filters
    attack_type = request.args.get("attack_type")
    if attack_type and attack_type != "all":
        alerts = [a for a in alerts if a.get("predicted_attack_type") == attack_type]

    min_risk = request.args.get("min_risk", type=float)
    if min_risk is not None:
        alerts = [a for a in alerts if a.get("risk_score", 0) >= min_risk]

    # Sort by risk descending
    alerts.sort(key=lambda a: a.get("risk_score", 0), reverse=True)

    # Build CSV in memory
    output = io.StringIO()
    fieldnames = [
        "id", "entity_id", "entity_type", "timestamp", "source_ip",
        "geo_location", "resource_accessed", "auth_method",
        "session_duration", "risk_score", "severity",
        "predicted_attack_type", "explanation",
    ]
    writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()

    for i, alert in enumerate(alerts):
        row = dict(alert)
        row["id"] = i
        row["severity"] = get_severity(row.get("risk_score", 0))
        # Flatten explanation to string
        expl = row.get("explanation", {})
        if isinstance(expl, dict):
            row["explanation"] = expl.get("natural_language", "")
        writer.writerow(row)

    csv_content = output.getvalue()
    output.close()

    return Response(
        csv_content,
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=cybershield_alerts_export.csv"},
    )


# ---------------------------------------------------------------------------
# API: Attack Type Distribution
# ---------------------------------------------------------------------------
@app.route("/api/attack-distribution")
def api_attack_distribution():
    """Return count of alerts by attack type."""
    counts = {}
    for alert in _alerts_cache:
        if alert.get("is_anomaly"):
            atype = alert.get("predicted_attack_type", "unknown")
            counts[atype] = counts.get(atype, 0) + 1
    return jsonify(counts)


# ---------------------------------------------------------------------------
# API: Risk Timeline (hourly aggregation)
# ---------------------------------------------------------------------------
@app.route("/api/risk-timeline")
def api_risk_timeline():
    """Return hourly anomaly counts and average risk scores."""
    from collections import defaultdict
    hourly = defaultdict(lambda: {"count": 0, "risk_sum": 0.0, "anomaly_count": 0})

    for alert in _alerts_cache:
        ts = alert.get("timestamp", "")
        if len(ts) >= 13:
            hour_key = ts[:13]  # e.g., "2026-01-15 14"
        else:
            continue
        hourly[hour_key]["count"] += 1
        hourly[hour_key]["risk_sum"] += alert.get("risk_score", 0)
        if alert.get("is_anomaly"):
            hourly[hour_key]["anomaly_count"] += 1

    result = []
    for hour, data in sorted(hourly.items()):
        result.append({
            "hour": hour,
            "total_events": data["count"],
            "anomaly_count": data["anomaly_count"],
            "avg_risk": round(data["risk_sum"] / max(data["count"], 1), 1),
        })

    return jsonify(result)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
@app.route("/api/health")
def api_health():
    """Health check endpoint."""
    return jsonify({
        "status": "healthy",
        "service": "CyberShield AI",
        "alerts_loaded": len(_alerts_cache),
        "metrics_loaded": bool(_metrics_cache),
    })


# ---------------------------------------------------------------------------
# Auto-load data when module is imported (e.g. by gunicorn)
# ---------------------------------------------------------------------------
ensure_directories()
reload_data()

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    logger.info(
        "CyberShield AI API starting on http://%s:%s",
        SERVER_HOST, SERVER_PORT,
    )
    app.run(
        host=SERVER_HOST,
        port=SERVER_PORT,
        debug=DEBUG_MODE,
    )
