/**
 * CyberShield AI — API Client
 * ============================
 * Communicates with the Flask backend. Falls back to comprehensive
 * mock data when the backend is unavailable (for standalone demo).
 */
class ApiClient {
  constructor() {
    this.BASE_URL = 'http://localhost:5000';
    this._backendAvailable = null; // tri-state: null=unknown, true/false
  }

  /**
   * Generic fetch with automatic fallback to mock data.
   */
  async _fetch(endpoint, mockFn) {
    // Try real backend first
    try {
      const res = await fetch(`${this.BASE_URL}${endpoint}`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this._backendAvailable = true;
      return await res.json();
    } catch (_) {
      this._backendAvailable = false;
      console.log(`[API] Backend unavailable for ${endpoint} — using mock data`);
      return mockFn();
    }
  }

  get isLive() { return this._backendAvailable === true; }

  // ── Stats KPIs ─────────────────────────────────────────────
  async getStats() {
    return this._fetch('/api/stats', () => ({
      total_events: 52847,
      anomalies_detected: 1043,
      false_positive_rate: 2.1,
      mean_risk_score: 14.7,
      active_entities: 200,
      alerts_today: 37,
      critical_alerts: 8,
    }));
  }

  // ── Alerts ─────────────────────────────────────────────────
  async getAlerts(filters = {}) {
    let url = '/api/alerts?limit=200';
    if (filters.attack_type && filters.attack_type !== 'all') url += `&attack_type=${filters.attack_type}`;
    if (filters.entity_type && filters.entity_type !== 'all') url += `&entity_type=${filters.entity_type}`;
    if (filters.search) url += `&search=${encodeURIComponent(filters.search)}`;

    return this._fetch(url, () => {
      const types = ['brute_force','impossible_travel','credential_stuffing','lateral_movement','device_spoofing','low_and_slow_exfiltration','insider_drift'];
      const cities = ['New York','London','Tokyo','Paris','Sydney','Mumbai','Berlin','Toronto','Singapore','Dubai','Moscow','São Paulo'];
      const resources = ['/api/v1/users','/api/v1/admin','/db/finance','/api/v1/data','/ssh/prod-01','/ftp/backup','/api/v1/config','/rdp/workstation-12'];
      const entityTypes = ['user','user','user','service_account','edge_device'];
      const alerts = [];

      for (let i = 0; i < 50; i++) {
        const risk = Math.floor(Math.random() * 100);
        const type = types[Math.floor(Math.random() * types.length)];
        const sev = risk >= 80 ? 'critical' : risk >= 60 ? 'high' : risk >= 40 ? 'medium' : 'low';
        const eType = entityTypes[Math.floor(Math.random() * entityTypes.length)];
        const prefix = eType === 'user' ? 'USR' : eType === 'service_account' ? 'SVC' : 'DEV';
        const hours = Math.floor(Math.random() * 24);
        const date = new Date(Date.now() - Math.random() * 86400000 * 7);
        date.setHours(hours);

        const explanationTexts = {
          brute_force: `Detected ${5 + Math.floor(Math.random()*15)} rapid failed authentication attempts within 2 minutes from IP ${this._randIP()}.`,
          impossible_travel: `Login from ${cities[0]} followed by ${cities[4]} within ${5+Math.floor(Math.random()*20)} minutes — geo-velocity ${3000+Math.floor(Math.random()*10000)} km/h.`,
          credential_stuffing: `${10+Math.floor(Math.random()*20)} distinct accounts targeted from same IP with ${80+Math.floor(Math.random()*15)}% failure rate.`,
          lateral_movement: `Entity accessed ${8+Math.floor(Math.random()*12)} unusual resources in sequence, deviating from baseline behavior profile.`,
          device_spoofing: `Device fingerprint mismatch detected — OS/MAC changed from historical baseline. Possible spoofed device.`,
          low_and_slow_exfiltration: `Gradual off-hours data access pattern detected over ${3+Math.floor(Math.random()*10)} days — download volume increasing.`,
          insider_drift: `Entity privilege footprint expanded by ${20+Math.floor(Math.random()*30)}% over past 2 weeks — accessing new resource categories.`,
        };

        const topFactors = [
          { feature: 'geo_velocity_kmh', display_name: 'Geo-Velocity (km/h)', contribution: (Math.random()*5).toFixed(2) * 1, direction: 'increased risk' },
          { feature: 'failed_auth_ratio_1h', display_name: 'Failed Auth Ratio (1h)', contribution: (Math.random()*4).toFixed(2) * 1, direction: 'increased risk' },
          { feature: 'login_burst_5min', display_name: 'Login Burst (5min)', contribution: (Math.random()*3).toFixed(2) * 1, direction: 'increased risk' },
          { feature: 'fingerprint_changed', display_name: 'Device Fingerprint Changed', contribution: (Math.random()*2).toFixed(2) * 1, direction: 'increased risk' },
          { feature: 'is_off_hours', display_name: 'Off-Hours Access', contribution: -(Math.random()*1.5).toFixed(2) * 1, direction: 'decreased risk' },
        ];

        alerts.push({
          id: i,
          entity_id: `${prefix}_${String(Math.floor(Math.random()*200)).padStart(3,'0')}`,
          entity_type: eType,
          timestamp: date.toISOString(),
          risk_score: risk,
          severity: sev,
          is_anomaly: risk > 40,
          predicted_attack_type: type,
          source_ip: this._randIP(),
          geo_location: cities[Math.floor(Math.random() * cities.length)],
          resource_accessed: resources[Math.floor(Math.random() * resources.length)],
          auth_method: ['password','token','certificate','biometric'][Math.floor(Math.random()*4)],
          session_duration: Math.floor(Math.random() * 7200),
          action_status: Math.random() > 0.3 ? 'success' : 'failure',
          explanation: {
            natural_language: explanationTexts[type],
            top_factors: topFactors,
          },
        });
      }
      return { alerts: alerts.sort((a, b) => b.risk_score - a.risk_score), total: alerts.length };
    });
  }

  async getAlertDetail(id) {
    return this._fetch(`/api/alerts/${id}`, async () => {
      const data = await this.getAlerts();
      const alerts = data.alerts || data;
      return alerts.find(a => a.id == id) || alerts[0];
    });
  }

  // ── Entities ───────────────────────────────────────────────
  async getEntities() {
    return this._fetch('/api/entities', () => {
      const entities = [];
      for (let i = 0; i < 15; i++) {
        const prefix = i < 10 ? 'USR' : i < 13 ? 'SVC' : 'DEV';
        entities.push({
          entity_id: `${prefix}_${String(i).padStart(3,'0')}`,
          entity_type: prefix === 'USR' ? 'user' : prefix === 'SVC' ? 'service_account' : 'edge_device',
          total_events: 100 + Math.floor(Math.random() * 2000),
          anomaly_count: Math.floor(Math.random() * 15),
          avg_risk_score: Math.floor(Math.random() * 65),
          max_risk_score: 40 + Math.floor(Math.random() * 60),
          last_seen: new Date(Date.now() - Math.random() * 3600000).toISOString(),
          status: i < 3 ? 'critical' : i < 6 ? 'warning' : 'normal',
        });
      }
      return entities.sort((a, b) => b.avg_risk_score - a.avg_risk_score);
    });
  }

  // ── Model Metrics ──────────────────────────────────────────
  async getModelMetrics() {
    return this._fetch('/api/model/metrics', () => ({
      binary: {
        accuracy: 0.9712,
        precision: 0.8934,
        recall: 0.8561,
        f1: 0.8744,
        auc_roc: 0.9647,
        precision_at_top_1_percent: 0.92,
        false_positive_rate: 0.021,
        confusion_matrix: [[9450, 200], [120, 730]],
      },
      feature_importance: [
        { feature: 'geo_velocity_kmh', importance: 0.182 },
        { feature: 'failed_auth_ratio_1h', importance: 0.156 },
        { feature: 'login_burst_5min', importance: 0.128 },
        { feature: 'fingerprint_changed', importance: 0.097 },
        { feature: 'session_duration_zscore', importance: 0.084 },
        { feature: 'is_off_hours', importance: 0.072 },
        { feature: 'command_diversity', importance: 0.061 },
        { feature: 'unique_ips_24h', importance: 0.054 },
        { feature: 'is_new_ip', importance: 0.048 },
        { feature: 'hour_deviation', importance: 0.041 },
      ],
    }));
  }

  // ── Export ──────────────────────────────────────────────────
  async exportReport() {
    try {
      const res = await fetch(`${this.BASE_URL}/api/reports/export`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'cybershield_alerts.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (_) {
      // Fallback: export mock data as CSV
      const data = await this.getAlerts();
      const alerts = data.alerts || data;
      const headers = ['id','entity_id','entity_type','timestamp','risk_score','predicted_attack_type','source_ip','geo_location','resource_accessed'];
      let csv = headers.join(',') + '\n';
      alerts.forEach(a => {
        csv += headers.map(h => `"${(a[h]||'').toString().replace(/"/g,'""')}"`).join(',') + '\n';
      });
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a2 = document.createElement('a');
      a2.href = url;
      a2.download = 'cybershield_alerts.csv';
      a2.click();
      URL.revokeObjectURL(url);
    }
  }

  _randIP() {
    return `${Math.floor(Math.random()*223)+1}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}`;
  }
}

window.apiClient = new ApiClient();
