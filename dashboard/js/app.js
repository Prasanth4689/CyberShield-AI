/**
 * CyberShield AI — Main Application Logic
 * =========================================
 * Handles initialization, data loading, rendering, event listeners,
 * pagination, filtering, animated counters, and alert detail panel.
 */
document.addEventListener('DOMContentLoaded', async () => {
  const api = window.apiClient;
  const charts = window.chartManager;

  // State
  let allAlerts = [];
  let filteredAlerts = [];
  let currentPage = 0;
  const PAGE_SIZE = 25;

  // ═══════════════ INITIALIZATION ═══════════════
  async function init() {
    try {
      // Load all data in parallel
      const [stats, alertsData, entities, metrics] = await Promise.all([
        api.getStats(),
        api.getAlerts(),
        api.getEntities(),
        api.getModelMetrics(),
      ]);

      // Update live indicator based on backend availability
      const liveEl = document.querySelector('.live-indicator');
      if (liveEl && !api.isLive) {
        liveEl.style.backgroundColor = '#f59e0b';
      }

      // Render KPIs
      renderKPIs(stats);

      // Process alerts
      allAlerts = alertsData.alerts || alertsData || [];
      filteredAlerts = [...allAlerts];
      renderAlertTable();

      // Charts
      charts.initAttackDistributionChart('chart-attack-dist', allAlerts);
      charts.initRiskTimelineChart('chart-risk-timeline');
      charts.initEntityRiskChart('chart-entity-risk', entities);

      // Model performance
      renderModelMetrics(metrics);

      // Setup event listeners
      setupEventListeners();

    } catch (err) {
      console.error('[CyberShield] Init error:', err);
    }
  }

  // ═══════════════ KPI RENDERING ═══════════════
  function renderKPIs(stats) {
    animateCounter('kpi-total-events', stats.total_events || 0);
    animateCounter('kpi-anomalies', stats.anomalies_detected || 0);
    animateCounter('kpi-fpr', stats.false_positive_rate || 0, 1);
    animateCounter('kpi-mean-risk', stats.mean_risk_score || 0, 1);
    animateCounter('kpi-critical', stats.critical_alerts || 0);
    animateCounter('kpi-entities', stats.active_entities || 0);
  }

  function animateCounter(id, target, decimals = 0) {
    const el = document.getElementById(id);
    if (!el) return;
    const duration = 1800;
    const start = performance.now();

    function step(now) {
      const progress = Math.min((now - start) / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = eased * target;
      el.textContent = decimals > 0 ? current.toFixed(decimals) : Math.floor(current).toLocaleString();
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // ═══════════════ ALERT TABLE ═══════════════
  function renderAlertTable() {
    const tbody = document.getElementById('alerts-tbody');
    if (!tbody) return;

    const startIdx = currentPage * PAGE_SIZE;
    const pageAlerts = filteredAlerts.slice(startIdx, startIdx + PAGE_SIZE);

    tbody.innerHTML = pageAlerts.map((alert, i) => {
      const risk = alert.risk_score || 0;
      const sev = risk >= 80 ? 'critical' : risk >= 60 ? 'high' : risk >= 40 ? 'medium' : 'low';
      const type = (alert.predicted_attack_type || alert.attack_type || 'unknown').replace(/_/g, ' ');
      const time = alert.timestamp ? new Date(alert.timestamp).toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      }) : '—';

      return `
        <tr class="alert-row" onclick="window._openAlert(${alert.id})" style="animation: fadeIn 0.3s ease ${i * 30}ms both">
          <td><span class="badge badge-${sev}">${sev}</span></td>
          <td>
            <div class="flex items-center gap-2">
              <span class="text-sm font-semibold w-8 text-right">${risk}</span>
              <div class="risk-bar-container w-20">
                <div class="risk-bar risk-bar-${sev}" style="width:${risk}%"></div>
              </div>
            </div>
          </td>
          <td class="capitalize text-slate-300 font-medium">${type}</td>
          <td class="text-cyan-400 font-mono text-xs">${alert.entity_id || '—'}</td>
          <td class="text-slate-500 font-mono text-xs">${alert.source_ip || '—'}</td>
          <td class="text-slate-500 text-xs">${alert.geo_location || '—'}</td>
          <td class="text-slate-500 text-xs">${time}</td>
        </tr>`;
    }).join('');

    // Update count & pagination
    const countEl = document.getElementById('alerts-count');
    if (countEl) {
      countEl.textContent = `Showing ${startIdx + 1}–${Math.min(startIdx + PAGE_SIZE, filteredAlerts.length)} of ${filteredAlerts.length} alerts`;
    }

    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');
    if (prevBtn) prevBtn.disabled = currentPage === 0;
    if (nextBtn) nextBtn.disabled = startIdx + PAGE_SIZE >= filteredAlerts.length;
  }

  // ═══════════════ MODEL METRICS ═══════════════
  function renderModelMetrics(metrics) {
    const binary = metrics?.binary || metrics || {};

    setMetric('metric-accuracy', binary.accuracy, '%');
    setMetric('metric-precision', binary.precision, '%');
    setMetric('metric-recall', binary.recall, '%');
    setMetric('metric-f1', binary.f1, '%');
    setMetric('metric-auc', binary.auc_roc || binary.auc, '');

    // Feature importance chart
    const fi = metrics?.feature_importance || [];
    if (fi.length > 0) {
      charts.initFeatureImportanceChart('chart-feature-importance', fi);
    }

    // Confusion matrix chart
    const cm = binary.confusion_matrix;
    if (cm) {
      charts.initConfusionMatrixChart('chart-confusion-matrix', cm);
    }
  }

  function setMetric(id, value, suffix) {
    const el = document.getElementById(id);
    if (!el || value === undefined) return;
    if (suffix === '%') {
      el.textContent = (value * 100).toFixed(1) + '%';
    } else {
      el.textContent = typeof value === 'number' ? value.toFixed(4) : value;
    }
  }

  // ═══════════════ ALERT DETAIL PANEL ═══════════════
  window._openAlert = async function(id) {
    const panel = document.getElementById('alert-detail-panel');
    const overlay = document.getElementById('overlay');
    if (!panel || !overlay) return;

    // Find alert in current data
    let alert = allAlerts.find(a => a.id == id);
    if (!alert) {
      try { alert = await api.getAlertDetail(id); } catch (_) {}
    }
    if (!alert) return;

    const risk = alert.risk_score || 0;
    const sev = risk >= 80 ? 'critical' : risk >= 60 ? 'high' : risk >= 40 ? 'medium' : 'low';

    // Populate detail fields
    setText('detail-id', alert.entity_id || `#${id}`);
    setText('detail-entity', alert.entity_id || '—');
    setText('detail-attack-type', (alert.predicted_attack_type || alert.attack_type || '—').replace(/_/g, ' '));
    setText('detail-ip', alert.source_ip || '—');
    setText('detail-location', alert.geo_location || '—');
    setText('detail-resource', alert.resource_accessed || '—');
    setText('detail-auth', alert.auth_method || '—');
    setText('detail-session', alert.session_duration ? `${Math.round(alert.session_duration)}s` : '—');
    setText('detail-risk-score', risk);
    setText('detail-timestamp', alert.timestamp ? new Date(alert.timestamp).toLocaleString() : '—');

    // Severity badge
    const sevBadge = document.getElementById('detail-severity-badge');
    if (sevBadge) {
      sevBadge.className = `badge badge-${sev}`;
      sevBadge.textContent = sev.toUpperCase();
    }

    // Risk bar
    const riskBar = document.getElementById('detail-risk-bar');
    if (riskBar) {
      riskBar.style.width = '0%';
      riskBar.className = `risk-bar risk-bar-${sev} h-full rounded-full transition-all duration-500`;
      setTimeout(() => { riskBar.style.width = `${risk}%`; }, 100);
    }

    // Explanation
    const explEl = document.getElementById('detail-explanation');
    if (explEl) {
      const expl = alert.explanation || {};
      explEl.textContent = expl.natural_language || 'No explanation available.';
    }

    // SHAP chart
    const factors = alert.explanation?.top_factors || [];
    charts.initSHAPChart('chart-shap', factors);

    // Show panel
    panel.classList.add('panel-open');
    overlay.classList.remove('hidden');
  };

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value ?? '—';
  }

  function closePanel() {
    const panel = document.getElementById('alert-detail-panel');
    const overlay = document.getElementById('overlay');
    if (panel) panel.classList.remove('panel-open');
    if (overlay) overlay.classList.add('hidden');
  }

  // ═══════════════ FILTERING ═══════════════
  function applyFilters() {
    const typeFilter = document.getElementById('filter-type')?.value || 'all';
    const entityFilter = document.getElementById('filter-entity-type')?.value || 'all';
    const search = (document.getElementById('alert-search')?.value || '').toLowerCase().trim();

    filteredAlerts = allAlerts.filter(a => {
      if (typeFilter !== 'all') {
        const aType = a.predicted_attack_type || a.attack_type || '';
        if (aType !== typeFilter) return false;
      }
      if (entityFilter !== 'all') {
        if ((a.entity_type || '') !== entityFilter) return false;
      }
      if (search) {
        const searchable = [
          a.entity_id, a.source_ip, a.geo_location, a.resource_accessed,
          a.predicted_attack_type, a.attack_type,
        ].join(' ').toLowerCase();
        if (!searchable.includes(search)) return false;
      }
      return true;
    });

    currentPage = 0;
    renderAlertTable();
  }

  // ═══════════════ EVENT LISTENERS ═══════════════
  function setupEventListeners() {
    // Close panel
    document.getElementById('close-panel')?.addEventListener('click', closePanel);
    document.getElementById('overlay')?.addEventListener('click', closePanel);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanel(); });

    // Filters
    document.getElementById('filter-type')?.addEventListener('change', applyFilters);
    document.getElementById('filter-entity-type')?.addEventListener('change', applyFilters);

    // Search with debounce
    let searchTimer;
    document.getElementById('alert-search')?.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(applyFilters, 300);
    });

    // Export
    document.getElementById('export-btn')?.addEventListener('click', () => api.exportReport());

    // Pagination
    document.getElementById('prev-page')?.addEventListener('click', () => {
      if (currentPage > 0) { currentPage--; renderAlertTable(); }
    });
    document.getElementById('next-page')?.addEventListener('click', () => {
      if ((currentPage + 1) * PAGE_SIZE < filteredAlerts.length) { currentPage++; renderAlertTable(); }
    });

    // Smooth scroll for nav links
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.querySelector(link.getAttribute('href'));
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  // ═══════════════ LAUNCH ═══════════════
  init();
});
