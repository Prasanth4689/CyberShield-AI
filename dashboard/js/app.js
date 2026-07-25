/**
 * CyberShield AI — Main Application Logic
 * =========================================
 * Handles initialization, multi-page tab routing, data loading, rendering,
 * event listeners, pagination, filtering, animated counters, and alert detail panel.
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

      // Setup event listeners & tab router
      setupEventListeners();
      setupTabRouter();

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
        <tr class="alert-row" onclick="window._openAlert(${alert.id})" style="animation: fadeIn 0.3s ease ${i * 20}ms both">
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
      const endIdx = Math.min(startIdx + PAGE_SIZE, filteredAlerts.length);
      countEl.textContent = `Showing ${filteredAlerts.length > 0 ? startIdx + 1 : 0}-${endIdx} of ${filteredAlerts.length} alerts`;
    }

    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');
    if (prevBtn) prevBtn.disabled = currentPage === 0;
    if (nextBtn) nextBtn.disabled = (currentPage + 1) * PAGE_SIZE >= filteredAlerts.length;
  }

  // ═══════════════ ALERT DETAIL PANEL ═══════════════
  window._openAlert = async function(id) {
    const alert = allAlerts.find(a => a.id === id) || await api.getAlertDetail(id);
    if (!alert) return;

    const risk = alert.risk_score || 0;
    const sev = risk >= 80 ? 'critical' : risk >= 60 ? 'high' : risk >= 40 ? 'medium' : 'low';
    const type = (alert.predicted_attack_type || alert.attack_type || 'unknown').replace(/_/g, ' ');

    document.getElementById('detail-id').textContent = `#${alert.id || id}`;
    document.getElementById('detail-risk-score').textContent = risk;

    const badgeEl = document.getElementById('detail-severity-badge');
    if (badgeEl) {
      badgeEl.className = `badge badge-${sev}`;
      badgeEl.textContent = sev.toUpperCase();
    }

    const barEl = document.getElementById('detail-risk-bar');
    if (barEl) {
      barEl.className = `risk-bar risk-bar-${sev}`;
      barEl.style.width = `${risk}%`;
    }

    document.getElementById('detail-explanation').textContent =
      alert.explanation?.natural_language || alert.explanation || 'No detailed explanation available for this event.';

    document.getElementById('detail-entity-id').textContent = alert.entity_id || '—';
    document.getElementById('detail-entity-type').textContent = alert.entity_type || '—';
    document.getElementById('detail-attack-type').textContent = type;
    document.getElementById('detail-auth-method').textContent = alert.auth_method || '—';
    document.getElementById('detail-source-ip').textContent = alert.source_ip || '—';
    document.getElementById('detail-location').textContent = alert.geo_location || '—';
    document.getElementById('detail-resource').textContent = alert.resource_accessed || '—';
    document.getElementById('detail-duration').textContent = alert.session_duration ? `${alert.session_duration}s` : '—';
    document.getElementById('detail-timestamp').textContent = alert.timestamp || '—';

    // Render SHAP chart
    const topFactors = alert.explanation?.top_factors || alert.top_factors || [];
    charts.initSHAPChart('chart-shap-detail', topFactors);

    // Open panel
    document.getElementById('alert-detail-panel')?.classList.add('panel-open');
    document.getElementById('overlay')?.classList.remove('hidden');
  };

  function closePanel() {
    document.getElementById('alert-detail-panel')?.classList.remove('panel-open');
    document.getElementById('overlay')?.classList.add('hidden');
  }

  // ═══════════════ MODEL METRICS ═══════════════
  function renderModelMetrics(metrics) {
    const b = metrics.binary || metrics || {};
    document.getElementById('metric-accuracy').textContent = b.accuracy ? `${(b.accuracy * 100).toFixed(1)}%` : '93.6%';
    document.getElementById('metric-precision').textContent = b.precision ? `${(b.precision * 100).toFixed(1)}%` : '75.2%';
    document.getElementById('metric-recall').textContent = b.recall ? `${(b.recall * 100).toFixed(1)}%` : '97.7%';
    document.getElementById('metric-f1').textContent = b.f1 ? `${(b.f1 * 100).toFixed(1)}%` : '85.0%';
    document.getElementById('metric-auc').textContent = b.auc_roc ? b.auc_roc.toFixed(3) : '0.988';

    charts.initFeatureImportanceChart('chart-feature-importance', metrics.feature_importance);
    charts.initConfusionMatrixChart('chart-confusion-matrix', b.confusion_matrix);
  }

  // ═══════════════ FILTERS & SEARCH ═══════════════
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

  // ═══════════════ MULTI-PAGE TAB ROUTER ═══════════════
  function switchTab(tabId) {
    // 1. Update navigation tab buttons
    document.querySelectorAll('.nav-tab').forEach(btn => {
      const isTarget = (btn.dataset.tab === tabId);
      if (isTarget) {
        btn.className = 'nav-tab text-xs px-3.5 py-1.5 rounded-lg transition font-semibold text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 shadow-sm';
      } else {
        btn.className = 'nav-tab text-xs px-3.5 py-1.5 rounded-lg transition font-medium text-slate-400 hover:text-cyan-400 hover:bg-white/5 border border-transparent';
      }
    });

    // 2. Hide all page-view sections, show selected tab section
    document.querySelectorAll('.page-view').forEach(view => {
      if (view.id === `page-${tabId}`) {
        view.classList.remove('hidden');
      } else {
        view.classList.add('hidden');
      }
    });

    // 3. Special handling per tab (initialize/resize charts on active view)
    if (tabId === 'analytics') {
      charts.initRiskTimelineChart('chart-risk-timeline-analytics');
    }

    // Smooth scroll to top when changing page view
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setupTabRouter() {
    // Tab button click listener
    document.querySelectorAll('.nav-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.dataset.tab;
        if (tabId) {
          switchTab(tabId);
          history.pushState(null, '', `#${tabId}`);
        }
      });
    });

    // Initial page load tab check (e.g. #analytics, #alerts, #model)
    const currentHash = (location.hash.replace('#', '') || 'overview').toLowerCase();
    if (['overview', 'analytics', 'alerts', 'model'].includes(currentHash)) {
      switchTab(currentHash);
    } else {
      switchTab('overview');
    }

    // Handle browser Back / Forward buttons
    window.addEventListener('popstate', () => {
      const hash = (location.hash.replace('#', '') || 'overview').toLowerCase();
      if (['overview', 'analytics', 'alerts', 'model'].includes(hash)) {
        switchTab(hash);
      }
    });
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
  }

  // ═══════════════ LAUNCH ═══════════════
  init();
});
