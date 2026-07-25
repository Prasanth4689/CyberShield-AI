/**
 * CyberShield AI — Main Application Logic
 * =========================================
 * Handles: multi-page tab routing, global search (Ctrl+K), light/dark theme,
 * live clock, fullscreen toggle, toast notifications, data loading, rendering,
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
  let searchSelectedIdx = -1;
  let searchResults = [];

  // ═══════════════ INITIALIZATION ═══════════════
  async function init() {
    try {
      // Setup features immediately (before data loads)
      setupTabRouter();
      setupThemeToggle();
      setupGlobalSearch();
      setupLiveClock();
      setupFullscreen();
      setupMobileNav();
      setupEventListeners();

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

      // Welcome toast
      showToast('CyberShield AI loaded successfully', 'fa-shield-halved', 'cyan');

    } catch (err) {
      console.error('[CyberShield] Init error:', err);
      showToast('Error loading data — using demo mode', 'fa-triangle-exclamation', 'amber');
    }
  }

  // ═══════════════ TOAST NOTIFICATIONS ═══════════════
  function showToast(message, icon = 'fa-circle-check', color = 'emerald', durationMs = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <div class="w-7 h-7 rounded-lg bg-${color}-500/20 flex items-center justify-center flex-shrink-0">
        <i class="fa-solid ${icon} text-${color}-400 text-xs"></i>
      </div>
      <span>${message}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-exit');
      setTimeout(() => toast.remove(), 300);
    }, durationMs);
  }

  // ═══════════════ LIVE CLOCK ═══════════════
  function setupLiveClock() {
    const clockEl = document.getElementById('header-clock');
    if (!clockEl) return;

    function updateClock() {
      const now = new Date();
      clockEl.textContent = now.toLocaleString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      });
    }
    updateClock();
    setInterval(updateClock, 1000);
  }

  // ═══════════════ THEME TOGGLE (LIGHT / DARK) ═══════════════
  function setupThemeToggle() {
    const toggle = document.getElementById('theme-toggle');
    if (!toggle) return;

    // Restore saved theme
    const saved = localStorage.getItem('cybershield-theme');
    if (saved === 'light') {
      document.documentElement.classList.replace('dark', 'light');
    }
    updateThemeIcon();

    toggle.addEventListener('click', () => {
      const html = document.documentElement;
      if (html.classList.contains('dark')) {
        html.classList.replace('dark', 'light');
        localStorage.setItem('cybershield-theme', 'light');
        showToast('Switched to Light Mode', 'fa-sun', 'amber', 2000);
      } else {
        html.classList.replace('light', 'dark');
        localStorage.setItem('cybershield-theme', 'dark');
        showToast('Switched to Dark Mode', 'fa-moon', 'purple', 2000);
      }
      updateThemeIcon();
    });
  }

  function updateThemeIcon() {
    const knob = document.querySelector('#theme-toggle .toggle-knob i');
    if (!knob) return;
    if (document.documentElement.classList.contains('light')) {
      knob.className = 'fa-solid fa-sun text-[10px]';
    } else {
      knob.className = 'fa-solid fa-moon text-[10px]';
    }
  }

  // ═══════════════ FULLSCREEN TOGGLE ═══════════════
  function setupFullscreen() {
    const btn = document.getElementById('fullscreen-toggle');
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
        btn.innerHTML = '<i class="fa-solid fa-compress"></i>';
        showToast('Entered fullscreen mode', 'fa-expand', 'blue', 2000);
      } else {
        document.exitFullscreen();
        btn.innerHTML = '<i class="fa-solid fa-expand"></i>';
      }
    });
  }

  // ═══════════════ MOBILE NAV ═══════════════
  function setupMobileNav() {
    const toggle = document.getElementById('mobile-nav-toggle');
    const menu = document.getElementById('mobile-nav-menu');
    if (!toggle || !menu) return;

    toggle.addEventListener('click', () => {
      menu.classList.toggle('hidden');
    });
  }

  // ═══════════════ GLOBAL SEARCH (Ctrl+K) ═══════════════
  function setupGlobalSearch() {
    const overlay = document.getElementById('global-search-overlay');
    const input = document.getElementById('global-search-input');
    const resultsBox = document.getElementById('global-search-results');
    const searchBtn = document.getElementById('search-toggle');
    if (!overlay || !input) return;

    function openSearch() {
      overlay.classList.add('active');
      input.value = '';
      resultsBox.innerHTML = '';
      searchSelectedIdx = -1;
      setTimeout(() => input.focus(), 100);
    }

    function closeSearch() {
      overlay.classList.remove('active');
      input.blur();
    }

    // Open search
    searchBtn?.addEventListener('click', openSearch);

    // Ctrl+K shortcut
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        openSearch();
      }
    });

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeSearch();
    });

    // Close on Escape
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeSearch();
        return;
      }

      // Arrow navigation
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        searchSelectedIdx = Math.min(searchSelectedIdx + 1, searchResults.length - 1);
        highlightSearchResult();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        searchSelectedIdx = Math.max(searchSelectedIdx - 1, 0);
        highlightSearchResult();
      } else if (e.key === 'Enter' && searchSelectedIdx >= 0 && searchResults[searchSelectedIdx]) {
        e.preventDefault();
        const result = searchResults[searchSelectedIdx];
        closeSearch();
        // Navigate to alerts page and open detail
        switchTab('alerts');
        history.pushState(null, '', '#alerts');
        setTimeout(() => window._openAlert(result.id), 200);
      }
    });

    // Search input with debounce
    let searchTimer;
    input.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => performGlobalSearch(input.value.trim()), 200);
    });
  }

  function performGlobalSearch(query) {
    const resultsBox = document.getElementById('global-search-results');
    if (!resultsBox) return;

    if (!query) {
      resultsBox.innerHTML = '<div class="search-empty"><i class="fa-solid fa-magnifying-glass text-slate-600 mr-2"></i>Type to search across alerts, entities, IPs…</div>';
      searchResults = [];
      searchSelectedIdx = -1;
      return;
    }

    const q = query.toLowerCase();
    searchResults = allAlerts.filter(a => {
      const searchable = [
        a.entity_id, a.source_ip, a.geo_location, a.resource_accessed,
        a.predicted_attack_type, a.attack_type, a.entity_type,
        a.explanation?.natural_language || '',
      ].join(' ').toLowerCase();
      return searchable.includes(q);
    }).slice(0, 12);

    searchSelectedIdx = searchResults.length > 0 ? 0 : -1;

    if (searchResults.length === 0) {
      resultsBox.innerHTML = '<div class="search-empty"><i class="fa-solid fa-xmark text-slate-600 mr-2"></i>No matching alerts found</div>';
      return;
    }

    resultsBox.innerHTML = searchResults.map((alert, i) => {
      const risk = alert.risk_score || 0;
      const sev = risk >= 80 ? 'critical' : risk >= 60 ? 'high' : risk >= 40 ? 'medium' : 'low';
      const sevColors = { critical: 'bg-red-500/20 text-red-400', high: 'bg-amber-500/20 text-amber-400', medium: 'bg-blue-500/20 text-blue-400', low: 'bg-emerald-500/20 text-emerald-400' };
      const type = (alert.predicted_attack_type || alert.attack_type || 'unknown').replace(/_/g, ' ');

      return `<div class="search-result-item ${i === 0 ? 'selected' : ''}" data-idx="${i}">
        <div class="sr-icon ${sevColors[sev]}">${risk}</div>
        <div class="flex-1 min-w-0">
          <div class="font-medium truncate">${highlightMatch(alert.entity_id || '—', q)} · <span class="capitalize">${highlightMatch(type, q)}</span></div>
          <div class="sr-meta">${highlightMatch(alert.source_ip || '', q)} · ${highlightMatch(alert.geo_location || '', q)}</div>
        </div>
        <span class="badge badge-${sev} text-[9px]">${sev}</span>
      </div>`;
    }).join('');

    // Click handler for results
    resultsBox.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', () => {
        const idx = parseInt(item.dataset.idx);
        const result = searchResults[idx];
        if (result) {
          document.getElementById('global-search-overlay')?.classList.remove('active');
          switchTab('alerts');
          history.pushState(null, '', '#alerts');
          setTimeout(() => window._openAlert(result.id), 200);
        }
      });
    });
  }

  function highlightMatch(text, query) {
    if (!query || !text) return text;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text;
    return text.substring(0, idx) + '<mark style="background:rgba(6,182,212,0.3);color:inherit;padding:0 1px;border-radius:2px;">' + text.substring(idx, idx + query.length) + '</mark>' + text.substring(idx + query.length);
  }

  function highlightSearchResult() {
    const items = document.querySelectorAll('.search-result-item');
    items.forEach((item, i) => {
      item.classList.toggle('selected', i === searchSelectedIdx);
    });
    // Scroll into view
    items[searchSelectedIdx]?.scrollIntoView({ block: 'nearest' });
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
      countEl.textContent = `Showing ${filteredAlerts.length > 0 ? startIdx + 1 : 0}–${endIdx} of ${filteredAlerts.length} alerts`;
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
    // 1. Update desktop navigation tab buttons
    document.querySelectorAll('#desktop-nav .nav-tab').forEach(btn => {
      if (btn.dataset.tab === tabId) {
        btn.className = 'nav-tab active text-xs px-3.5 py-1.5 rounded-lg transition-all duration-200 font-semibold text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 shadow-sm';
      } else {
        btn.className = 'nav-tab text-xs px-3.5 py-1.5 rounded-lg transition-all duration-200 font-medium text-slate-400 hover:text-cyan-400 hover:bg-white/5 border border-transparent';
      }
    });

    // 2. Update mobile navigation
    document.querySelectorAll('#mobile-nav-menu .nav-tab').forEach(btn => {
      if (btn.dataset.tab === tabId) {
        btn.className = 'nav-tab mobile-tab text-sm py-2 px-3 rounded-lg text-left text-cyan-400 bg-cyan-500/10';
      } else {
        btn.className = 'nav-tab mobile-tab text-sm py-2 px-3 rounded-lg text-left text-slate-400 hover:bg-white/5';
      }
    });

    // 3. Hide all page-view sections, show selected
    document.querySelectorAll('.page-view').forEach(view => {
      if (view.id === `page-${tabId}`) {
        view.classList.remove('hidden');
        // Re-trigger animation
        view.style.animation = 'none';
        view.offsetHeight; // force reflow
        view.style.animation = '';
      } else {
        view.classList.add('hidden');
      }
    });

    // 4. Special handling per tab (re-init charts that might need canvas resize)
    if (tabId === 'analytics') {
      charts.initRiskTimelineChart('chart-risk-timeline-analytics');
    }

    // Close mobile menu
    document.getElementById('mobile-nav-menu')?.classList.add('hidden');

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setupTabRouter() {
    // Tab button click listeners — ALL nav-tabs (desktop + mobile)
    document.querySelectorAll('.nav-tab').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const tabId = btn.dataset.tab;
        if (tabId) {
          switchTab(tabId);
          history.pushState(null, '', `#${tabId}`);
        }
      });
    });

    // Initial page load: check hash
    const currentHash = (location.hash.replace('#', '') || 'overview').toLowerCase();
    const validTabs = ['overview', 'analytics', 'alerts', 'model'];
    switchTab(validTabs.includes(currentHash) ? currentHash : 'overview');

    // Handle browser Back / Forward
    window.addEventListener('popstate', () => {
      const hash = (location.hash.replace('#', '') || 'overview').toLowerCase();
      if (validTabs.includes(hash)) {
        switchTab(hash);
      }
    });
  }

  // ═══════════════ EVENT LISTENERS ═══════════════
  function setupEventListeners() {
    // Close panel
    document.getElementById('close-panel')?.addEventListener('click', closePanel);
    document.getElementById('overlay')?.addEventListener('click', closePanel);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closePanel();
    });

    // Filters
    document.getElementById('filter-type')?.addEventListener('change', applyFilters);
    document.getElementById('filter-entity-type')?.addEventListener('change', applyFilters);

    // Alert search with debounce
    let searchTimer;
    document.getElementById('alert-search')?.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(applyFilters, 300);
    });

    // Export
    document.getElementById('export-btn')?.addEventListener('click', () => {
      api.exportReport();
      showToast('Exporting alert data as CSV…', 'fa-download', 'cyan', 3000);
    });

    // Pagination
    document.getElementById('prev-page')?.addEventListener('click', () => {
      if (currentPage > 0) { currentPage--; renderAlertTable(); }
    });
    document.getElementById('next-page')?.addEventListener('click', () => {
      if ((currentPage + 1) * PAGE_SIZE < filteredAlerts.length) { currentPage++; renderAlertTable(); }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Number keys 1-4 for tab switching (when not in input)
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
      const tabs = ['overview', 'analytics', 'alerts', 'model'];
      if (e.key >= '1' && e.key <= '4') {
        switchTab(tabs[parseInt(e.key) - 1]);
        history.pushState(null, '', `#${tabs[parseInt(e.key) - 1]}`);
      }
    });
  }

  // ═══════════════ LAUNCH ═══════════════
  init();
});
