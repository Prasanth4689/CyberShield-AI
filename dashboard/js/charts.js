/**
 * CyberShield AI — Chart Manager
 * ================================
 * Chart.js configurations for all dashboard visualizations.
 * All charts use the dark theme and vibrant accent colors.
 */
class ChartManager {
  constructor() {
    this.charts = {};
    this.colors = {
      brute_force: '#ef4444',
      impossible_travel: '#f59e0b',
      credential_stuffing: '#8b5cf6',
      lateral_movement: '#06b6d4',
      device_spoofing: '#d946ef',
      low_and_slow_exfiltration: '#10b981',
      insider_drift: '#64748b',
      normal: '#3b82f6',
      // Neutral
      text: '#94a3b8',
      grid: 'rgba(255, 255, 255, 0.06)',
      white: '#f1f5f9',
    };

    // Global Chart.js defaults for dark theme
    Chart.defaults.color = this.colors.text;
    Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
    Chart.defaults.font.size = 11;
  }

  destroyChart(id) {
    if (this.charts[id]) {
      this.charts[id].destroy();
      delete this.charts[id];
    }
  }

  // ── Attack Distribution (Donut) ────────────────────────────
  initAttackDistributionChart(canvasId, alerts) {
    this.destroyChart(canvasId);
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return;

    const counts = {};
    (Array.isArray(alerts) ? alerts : []).forEach(a => {
      const type = a.predicted_attack_type || a.attack_type || 'unknown';
      if (type !== 'normal' && type !== 'none') {
        counts[type] = (counts[type] || 0) + 1;
      }
    });

    const labels = Object.keys(counts);
    const data = Object.values(counts);
    const bgColors = labels.map(l => this.colors[l] || '#64748b');

    this.charts[canvasId] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels.map(l => l.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())),
        datasets: [{
          data,
          backgroundColor: bgColors,
          borderWidth: 0,
          hoverOffset: 8,
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        plugins: {
          legend: {
            position: 'right',
            labels: { color: this.colors.text, boxWidth: 10, padding: 12, font: { size: 10 } },
          },
          tooltip: {
            backgroundColor: 'rgba(17, 24, 39, 0.95)',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            padding: 10,
            titleFont: { weight: 'bold' },
          },
        },
        animation: { animateRotate: true, duration: 1200 },
      },
    });
  }

  // ── Risk Timeline (Area Chart) ─────────────────────────────
  initRiskTimelineChart(canvasId, timelineData) {
    this.destroyChart(canvasId);
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return;

    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(6, 182, 212, 0.35)');
    gradient.addColorStop(1, 'rgba(6, 182, 212, 0.0)');

    const gradient2 = ctx.createLinearGradient(0, 0, 0, 300);
    gradient2.addColorStop(0, 'rgba(239, 68, 68, 0.25)');
    gradient2.addColorStop(1, 'rgba(239, 68, 68, 0.0)');

    // Use provided data or generate mock
    let labels, totalData, anomalyData;
    if (timelineData && timelineData.length > 0) {
      labels = timelineData.map(d => d.hour?.split(' ').pop() || d.hour);
      totalData = timelineData.map(d => d.total_events || 0);
      anomalyData = timelineData.map(d => d.anomaly_count || 0);
    } else {
      labels = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
      totalData = Array.from({ length: 24 }, () => 80 + Math.floor(Math.random() * 120));
      anomalyData = Array.from({ length: 24 }, () => Math.floor(Math.random() * 15));
    }

    this.charts[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Total Events',
            data: totalData,
            borderColor: '#06b6d4',
            backgroundColor: gradient,
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 5,
            borderWidth: 2,
          },
          {
            label: 'Anomalies',
            data: anomalyData,
            borderColor: '#ef4444',
            backgroundColor: gradient2,
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 5,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        scales: {
          x: { grid: { color: this.colors.grid, drawBorder: false }, ticks: { maxTicksLimit: 12 } },
          y: { grid: { color: this.colors.grid, drawBorder: false }, beginAtZero: true },
        },
        plugins: {
          legend: { labels: { boxWidth: 10, padding: 15 } },
          tooltip: { backgroundColor: 'rgba(17,24,39,0.95)', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1 },
        },
        animation: { duration: 1500 },
      },
    });
  }

  // ── Entity Risk (Horizontal Bar) ───────────────────────────
  initEntityRiskChart(canvasId, entities) {
    this.destroyChart(canvasId);
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return;

    const top = (entities || []).slice(0, 10);
    const barColors = top.map(e => {
      const r = e.avg_risk_score || 0;
      if (r >= 80) return '#ef4444';
      if (r >= 60) return '#f59e0b';
      if (r >= 40) return '#3b82f6';
      return '#10b981';
    });

    this.charts[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: top.map(e => e.entity_id),
        datasets: [{
          label: 'Avg Risk Score',
          data: top.map(e => e.avg_risk_score),
          backgroundColor: barColors,
          borderRadius: 6,
          borderSkipped: false,
          barPercentage: 0.7,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { color: this.colors.grid }, max: 100 },
          y: { grid: { display: false }, ticks: { font: { size: 10, family: "'JetBrains Mono', monospace" } } },
        },
        plugins: { legend: { display: false } },
        animation: { duration: 1200 },
      },
    });
  }

  // ── SHAP Feature Attribution (Horizontal Bar) ──────────────
  initSHAPChart(canvasId, topFactors) {
    this.destroyChart(canvasId);
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx || !topFactors || topFactors.length === 0) return;

    const factors = topFactors.slice(0, 8);

    this.charts[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: factors.map(f => f.display_name || f.feature?.replace(/_/g, ' ') || 'Unknown'),
        datasets: [{
          data: factors.map(f => f.contribution || 0),
          backgroundColor: factors.map(f =>
            (f.contribution || 0) > 0 ? 'rgba(239, 68, 68, 0.7)' : 'rgba(6, 182, 212, 0.7)'
          ),
          borderRadius: 4,
          borderSkipped: false,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { color: this.colors.grid }, title: { display: true, text: 'SHAP Contribution', color: this.colors.text, font: { size: 10 } } },
          y: { grid: { display: false }, ticks: { font: { size: 10 } } },
        },
        plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(17,24,39,0.95)' } },
        animation: { duration: 800 },
      },
    });
  }

  // ── Feature Importance (Horizontal Bar) ────────────────────
  initFeatureImportanceChart(canvasId, features) {
    this.destroyChart(canvasId);
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx || !features) return;

    const top = features.slice(0, 10);
    const maxVal = Math.max(...top.map(f => f.importance));

    this.charts[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: top.map(f => (f.feature || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())),
        datasets: [{
          data: top.map(f => f.importance),
          backgroundColor: top.map((_, i) => {
            const colors = ['#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef', '#f59e0b', '#ef4444', '#10b981', '#64748b', '#06b6d4', '#3b82f6'];
            return colors[i % colors.length];
          }),
          borderRadius: 6,
          borderSkipped: false,
          barPercentage: 0.65,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { color: this.colors.grid }, title: { display: true, text: 'Importance', color: this.colors.text } },
          y: { grid: { display: false }, ticks: { font: { size: 10 } } },
        },
        plugins: { legend: { display: false } },
        animation: { duration: 1200 },
      },
    });
  }

  // ── Confusion Matrix (simulated heatmap using bar chart) ───
  initConfusionMatrixChart(canvasId, cm) {
    this.destroyChart(canvasId);
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx || !cm) return;

    // For binary confusion matrix [[TN, FP], [FN, TP]]
    const labels = ['Normal', 'Anomaly'];
    const tn = cm[0]?.[0] || 0, fp = cm[0]?.[1] || 0;
    const fn = cm[1]?.[0] || 0, tp = cm[1]?.[1] || 0;

    this.charts[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['True Normal', 'True Anomaly'],
        datasets: [
          {
            label: 'Predicted Normal',
            data: [tn, fn],
            backgroundColor: ['rgba(16, 185, 129, 0.7)', 'rgba(239, 68, 68, 0.4)'],
            borderRadius: 4,
          },
          {
            label: 'Predicted Anomaly',
            data: [fp, tp],
            backgroundColor: ['rgba(245, 158, 11, 0.4)', 'rgba(6, 182, 212, 0.7)'],
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { display: false }, stacked: false },
          y: { grid: { color: this.colors.grid }, stacked: false },
        },
        plugins: {
          legend: { labels: { boxWidth: 10 } },
          tooltip: {
            backgroundColor: 'rgba(17,24,39,0.95)',
            callbacks: {
              afterBody: (items) => {
                const idx = items[0].dataIndex;
                const dsIdx = items[0].datasetIndex;
                const val = items[0].raw;
                const map = [[`TN: ${tn}`, `FN: ${fn}`], [`FP: ${fp}`, `TP: ${tp}`]];
                return [map[dsIdx][idx]];
              },
            },
          },
        },
        animation: { duration: 1000 },
      },
    });
  }
}

window.chartManager = new ChartManager();
