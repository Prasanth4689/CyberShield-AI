# API Documentation — CyberShield AI

## Base URL

```
http://localhost:5000
```

## Endpoints

### Health Check

```
GET /api/health
```

**Response:**
```json
{
  "status": "healthy",
  "service": "CyberShield AI",
  "alerts_loaded": 10569,
  "metrics_loaded": true
}
```

---

### Dashboard Statistics (KPIs)

```
GET /api/stats
```

**Response:**
```json
{
  "total_events": 10569,
  "anomalies_detected": 847,
  "false_positive_rate": 2.1,
  "mean_risk_score": 14.7,
  "active_entities": 200,
  "alerts_today": 37,
  "critical_alerts": 8
}
```

---

### Alert Queue

```
GET /api/alerts
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `attack_type` | string | Filter by attack type (e.g., `brute_force`) |
| `min_risk` | float | Minimum risk score |
| `max_risk` | float | Maximum risk score |
| `entity_type` | string | Filter by entity type (`user`, `service_account`, `edge_device`) |
| `search` | string | Search across entity_id, source_ip, resource, geo_location |
| `limit` | int | Max results (default: 100) |
| `offset` | int | Pagination offset (default: 0) |

**Response:**
```json
{
  "total": 847,
  "limit": 100,
  "offset": 0,
  "alerts": [
    {
      "id": 42,
      "entity_id": "USR_075",
      "entity_type": "user",
      "timestamp": "2026-07-20 14:32:15",
      "source_ip": "192.168.1.105",
      "geo_location": "Tokyo",
      "resource_accessed": "res_42",
      "auth_method": "password",
      "session_duration": 1200,
      "action_status": "success",
      "risk_score": 87.3,
      "severity": "critical",
      "is_anomaly": true,
      "predicted_attack_type": "impossible_travel",
      "attack_confidence": {
        "impossible_travel": 0.89,
        "brute_force": 0.05,
        "lateral_movement": 0.03
      },
      "explanation": {
        "natural_language": "Flagged due to: Geo-Velocity (km/h), Failed Auth Ratio (1h), Login Burst (5min).",
        "top_factors": [
          {"feature": "geo_velocity_kmh", "display_name": "Geo-Velocity (km/h)", "contribution": 4.21, "direction": "increased risk"},
          {"feature": "failed_auth_ratio_1h", "display_name": "Failed Auth Ratio (1h)", "contribution": 2.87, "direction": "increased risk"}
        ]
      }
    }
  ]
}
```

---

### Alert Detail

```
GET /api/alerts/<alert_id>
```

Returns full detail for a single alert including all fields above.

---

### Entity List

```
GET /api/entities
```

**Response:**
```json
[
  {
    "entity_id": "USR_075",
    "entity_type": "user",
    "total_events": 342,
    "anomaly_count": 12,
    "avg_risk_score": 34.2,
    "max_risk_score": 87.3,
    "last_seen": "2026-07-24 18:45:00",
    "status": "warning"
  }
]
```

---

### Entity History

```
GET /api/entities/<entity_id>/history
```

Returns the last 100 access events for the specified entity, sorted chronologically.

---

### Model Metrics

```
GET /api/model/metrics
```

**Response:**
```json
{
  "binary": {
    "accuracy": 0.9712,
    "precision": 0.8934,
    "recall": 0.8561,
    "f1": 0.8744,
    "auc_roc": 0.9647,
    "precision_at_top_1_percent": 0.92,
    "false_positive_rate": 0.021,
    "confusion_matrix": [[9450, 200], [120, 730]]
  },
  "multiclass": { ... },
  "feature_importance": [
    {"feature": "geo_velocity_kmh", "importance": 0.182}
  ]
}
```

---

### Predict (New Event)

```
POST /api/predict
Content-Type: application/json

{
  "entity_id": "USR_099",
  "timestamp": "2026-07-25T01:00:00",
  "source_ip": "10.0.0.1",
  "resource_accessed": "/api/admin"
}
```

**Response:**
```json
{
  "risk_score": 72.4,
  "is_anomaly": true,
  "predicted_attack_type": "lateral_movement",
  "severity": "high",
  "explanation": {
    "natural_language": "Anomaly detected — risk score 72.4.",
    "top_factors": []
  }
}
```

---

### Export Report

```
GET /api/reports/export
```

Returns a CSV file download of all alerts with columns: id, entity_id, entity_type, timestamp, source_ip, geo_location, resource_accessed, auth_method, session_duration, risk_score, severity, predicted_attack_type, explanation.

---

### Attack Distribution

```
GET /api/attack-distribution
```

Returns count of alerts by attack type.

---

### Risk Timeline

```
GET /api/risk-timeline
```

Returns hourly aggregated event counts and anomaly counts.
