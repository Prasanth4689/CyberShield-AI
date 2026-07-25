/**
 * CyberShield AI — Main Application Logic v3
 * ============================================
 * Multi-page routing, global search (Ctrl+K), light/dark theme,
 * live clock, fullscreen, toast notifications, keyboard shortcuts.
 */
document.addEventListener('DOMContentLoaded', async () => {
  const api = window.apiClient;
  const charts = window.chartManager;

  let allAlerts = [];
  let filteredAlerts = [];
  let currentPage = 0;
  const PAGE_SIZE = 25;
  let searchSelIdx = -1;
  let searchHits = [];

  // ═══════════════ BOOT ═══════════════
  async function init() {
    // Wire up all interactive features FIRST (before data)
    wireTabRouter();
    wireThemeToggle();
    wireGlobalSearch();
    wireLiveClock();
    wireFullscreen();
    wireMobileNav();
    wireEventListeners();

    try {
      const [stats, alertsData, entities, metrics] = await Promise.all([
        api.getStats(), api.getAlerts(), api.getEntities(), api.getModelMetrics(),
      ]);

      const liveEl = document.querySelector('.live-indicator');
      if (liveEl && !api.isLive) liveEl.style.backgroundColor = '#f59e0b';

      renderKPIs(stats);

      allAlerts = alertsData.alerts || alertsData || [];
      filteredAlerts = [...allAlerts];
      renderAlertTable();

      charts.initAttackDistributionChart('chart-attack-dist', allAlerts);
      charts.initRiskTimelineChart('chart-risk-timeline');
      charts.initEntityRiskChart('chart-entity-risk', entities);
      renderModelMetrics(metrics);

      toast('CyberShield AI loaded — ' + allAlerts.length + ' alerts', 'fa-shield-halved', '#06b6d4');
    } catch (err) {
      console.error('[CyberShield] Init error:', err);
      toast('Using demo data — backend offline', 'fa-triangle-exclamation', '#f59e0b');
    }
  }

  // ═══════════════ TOAST ═══════════════
  function toast(msg, icon, color, ms) {
    ms = ms || 4000;
    const c = document.getElementById('toast-container');
    if (!c) return;
    const t = document.createElement('div');
    t.style.cssText = 'pointer-events:auto;display:flex;align-items:center;gap:10px;padding:12px 20px;border-radius:12px;font-size:13px;max-width:400px;animation:toastIn 0.4s ease;' +
      'background:var(--bg-secondary,#111827);border:1px solid rgba(255,255,255,0.1);color:var(--text-primary,#f1f5f9);box-shadow:0 8px 32px rgba(0,0,0,0.3);';
    t.innerHTML = '<i class="fa-solid ' + icon + '" style="color:' + color + ';font-size:14px;"></i><span>' + msg + '</span>';
    c.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(20px)'; t.style.transition = 'all 0.3s ease'; setTimeout(() => t.remove(), 300); }, ms);
  }

  // ═══════════════ LIVE CLOCK ═══════════════
  function wireLiveClock() {
    const el = document.getElementById('header-clock');
    if (!el) return;
    function tick() {
      const d = new Date();
      el.textContent = d.toLocaleString('en-US', { weekday:'short', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false });
    }
    tick();
    setInterval(tick, 1000);
  }

  // ═══════════════ THEME TOGGLE ═══════════════
  function wireThemeToggle() {
    const btn = document.getElementById('theme-toggle-btn');
    if (!btn) return;

    // Restore saved theme
    if (localStorage.getItem('cs-theme') === 'light') {
      document.documentElement.classList.replace('dark', 'light');
    }
    syncThemeUI();

    btn.addEventListener('click', () => {
      const html = document.documentElement;
      if (html.classList.contains('dark')) {
        html.classList.replace('dark', 'light');
        localStorage.setItem('cs-theme', 'light');
        toast('Switched to Light Mode', 'fa-sun', '#f59e0b', 2000);
      } else {
        html.classList.replace('light', 'dark');
        localStorage.setItem('cs-theme', 'dark');
        toast('Switched to Dark Mode', 'fa-moon', '#8b5cf6', 2000);
      }
      syncThemeUI();
    });
  }

  function syncThemeUI() {
    const icon = document.getElementById('theme-icon');
    const label = document.getElementById('theme-label');
    const isLight = document.documentElement.classList.contains('light');
    if (icon) icon.className = isLight ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    if (label) label.textContent = isLight ? 'Light' : 'Dark';
  }

  // ═══════════════ FULLSCREEN ═══════════════
  function wireFullscreen() {
    const btn = document.getElementById('fullscreen-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
        btn.innerHTML = '<i class="fa-solid fa-compress text-sm"></i>';
      } else {
        document.exitFullscreen();
        btn.innerHTML = '<i class="fa-solid fa-expand text-sm"></i>';
      }
    });
  }

  // ═══════════════ MOBILE NAV ═══════════════
  function wireMobileNav() {
    const btn = document.getElementById('mobile-nav-btn');
    const menu = document.getElementById('mobile-nav-menu');
    if (btn && menu) btn.addEventListener('click', () => menu.classList.toggle('hidden'));
  }

  // ═══════════════ GLOBAL SEARCH (Ctrl+K) ═══════════════
  function wireGlobalSearch() {
    const overlay = document.getElementById('search-overlay');
    const input = document.getElementById('search-input');
    const results = document.getElementById('search-results');
    const openBtn = document.getElementById('search-toggle-btn');

    if (!overlay || !input || !results) { console.warn('[Search] Missing DOM elements'); return; }

    function open() {
      overlay.style.display = 'flex';
      input.value = '';
      results.innerHTML = '<div style="padding:20px;text-align:center;color:#64748b;font-size:13px;"><i class="fa-solid fa-magnifying-glass" style="margin-right:6px;"></i>Type to search alerts, entities, IPs…</div>';
      searchSelIdx = -1;
      searchHits = [];
      setTimeout(() => input.focus(), 50);
    }

    function close() {
      overlay.style.display = 'none';
      input.blur();
    }

    // Open triggers
    if (openBtn) openBtn.addEventListener('click', open);
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); open(); }
    });

    // Close on overlay background click
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    // Keyboard in input
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); searchSelIdx = Math.min(searchSelIdx + 1, searchHits.length - 1); hlSearchItem(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); searchSelIdx = Math.max(searchSelIdx - 1, 0); hlSearchItem(); }
      if (e.key === 'Enter' && searchSelIdx >= 0 && searchHits[searchSelIdx]) {
        e.preventDefault();
        close();
        switchTab('alerts');
        history.pushState(null, '', '#alerts');
        setTimeout(() => window._openAlert(searchHits[searchSelIdx].id), 150);
      }
    });

    // Debounced search
    let timer;
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => doSearch(input.value.trim()), 150); });
  }

  function doSearch(q) {
    const results = document.getElementById('search-results');
    if (!results) return;

    if (!q) {
      results.innerHTML = '<div style="padding:20px;text-align:center;color:#64748b;font-size:13px;"><i class="fa-solid fa-magnifying-glass" style="margin-right:6px;"></i>Type to search alerts, entities, IPs…</div>';
      searchHits = []; searchSelIdx = -1;
      return;
    }

    const ql = q.toLowerCase();
    searchHits = allAlerts.filter(a => {
      return [a.entity_id, a.source_ip, a.geo_location, a.resource_accessed, a.predicted_attack_type, a.attack_type, a.entity_type, a.explanation?.natural_language || ''].join(' ').toLowerCase().includes(ql);
    }).slice(0, 10);

    searchSelIdx = searchHits.length > 0 ? 0 : -1;

    if (!searchHits.length) {
      results.innerHTML = '<div style="padding:20px;text-align:center;color:#64748b;font-size:13px;"><i class="fa-solid fa-xmark" style="margin-right:6px;"></i>No results for "' + q + '"</div>';
      return;
    }

    const sevBg = { critical:'rgba(239,68,68,0.15)', high:'rgba(245,158,11,0.15)', medium:'rgba(59,130,246,0.15)', low:'rgba(16,185,129,0.15)' };
    const sevCol = { critical:'#ef4444', high:'#f59e0b', medium:'#3b82f6', low:'#10b981' };

    results.innerHTML = searchHits.map((a, i) => {
      const r = a.risk_score || 0;
      const s = r >= 80 ? 'critical' : r >= 60 ? 'high' : r >= 40 ? 'medium' : 'low';
      const t = (a.predicted_attack_type || a.attack_type || 'unknown').replace(/_/g, ' ');
      const sel = i === 0 ? 'background:rgba(6,182,212,0.08);' : '';
      return '<div class="sr-item" data-i="' + i + '" style="display:flex;align-items:center;gap:10px;padding:10px 20px;cursor:pointer;transition:background 0.15s;font-size:13px;' + sel + '">' +
        '<div style="width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;background:' + sevBg[s] + ';color:' + sevCol[s] + ';">' + r + '</div>' +
        '<div style="flex:1;min-width:0;"><div style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (a.entity_id||'—') + ' · <span style="text-transform:capitalize;">' + t + '</span></div>' +
        '<div style="font-size:11px;color:#64748b;">' + (a.source_ip||'') + ' · ' + (a.geo_location||'') + '</div></div>' +
        '<span class="badge badge-' + s + '" style="font-size:9px;">' + s + '</span></div>';
    }).join('');

    // Click handlers
    results.querySelectorAll('.sr-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.i);
        if (searchHits[idx]) {
          document.getElementById('search-overlay').style.display = 'none';
          switchTab('alerts'); history.pushState(null, '', '#alerts');
          setTimeout(() => window._openAlert(searchHits[idx].id), 150);
        }
      });
      el.addEventListener('mouseenter', () => {
        searchSelIdx = parseInt(el.dataset.i);
        hlSearchItem();
      });
    });
  }

  function hlSearchItem() {
    document.querySelectorAll('.sr-item').forEach((el, i) => {
      el.style.background = i === searchSelIdx ? 'rgba(6,182,212,0.08)' : 'transparent';
    });
    const sel = document.querySelectorAll('.sr-item')[searchSelIdx];
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }

  // ═══════════════ KPI COUNTERS ═══════════════
  function renderKPIs(s) {
    animateCounter('kpi-total-events', s.total_events||0);
    animateCounter('kpi-anomalies', s.anomalies_detected||0);
    animateCounter('kpi-fpr', s.false_positive_rate||0, 1);
    animateCounter('kpi-mean-risk', s.mean_risk_score||0, 1);
    animateCounter('kpi-critical', s.critical_alerts||0);
    animateCounter('kpi-entities', s.active_entities||0);
  }

  function animateCounter(id, target, dec) {
    dec = dec || 0;
    const el = document.getElementById(id);
    if (!el) return;
    const dur = 1800, t0 = performance.now();
    function step(now) {
      const p = Math.min((now - t0) / dur, 1);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = dec > 0 ? (e * target).toFixed(dec) : Math.floor(e * target).toLocaleString();
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // ═══════════════ ALERT TABLE ═══════════════
  function renderAlertTable() {
    const tbody = document.getElementById('alerts-tbody');
    if (!tbody) return;
    const s = currentPage * PAGE_SIZE;
    const page = filteredAlerts.slice(s, s + PAGE_SIZE);

    tbody.innerHTML = page.map((a, i) => {
      const r = a.risk_score || 0;
      const sev = r >= 80 ? 'critical' : r >= 60 ? 'high' : r >= 40 ? 'medium' : 'low';
      const t = (a.predicted_attack_type || a.attack_type || 'unknown').replace(/_/g, ' ');
      const tm = a.timestamp ? new Date(a.timestamp).toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
      return '<tr class="alert-row" onclick="window._openAlert(' + a.id + ')" style="animation:fadeIn .3s ease ' + (i*20) + 'ms both">' +
        '<td><span class="badge badge-' + sev + '">' + sev + '</span></td>' +
        '<td><div class="flex items-center gap-2"><span class="text-sm font-semibold w-8 text-right">' + r + '</span><div class="risk-bar-container w-20"><div class="risk-bar risk-bar-' + sev + '" style="width:' + r + '%"></div></div></div></td>' +
        '<td class="capitalize text-slate-300 font-medium">' + t + '</td>' +
        '<td class="text-cyan-400 font-mono text-xs">' + (a.entity_id||'—') + '</td>' +
        '<td class="text-slate-500 font-mono text-xs">' + (a.source_ip||'—') + '</td>' +
        '<td class="text-slate-500 text-xs">' + (a.geo_location||'—') + '</td>' +
        '<td class="text-slate-500 text-xs">' + tm + '</td></tr>';
    }).join('');

    const cntEl = document.getElementById('alerts-count');
    if (cntEl) { const e = Math.min(s + PAGE_SIZE, filteredAlerts.length); cntEl.textContent = 'Showing ' + (filteredAlerts.length > 0 ? s+1 : 0) + '–' + e + ' of ' + filteredAlerts.length + ' alerts'; }
    const pb = document.getElementById('prev-page'), nb = document.getElementById('next-page');
    if (pb) pb.disabled = currentPage === 0;
    if (nb) nb.disabled = (currentPage + 1) * PAGE_SIZE >= filteredAlerts.length;
  }

  // ═══════════════ ALERT DETAIL PANEL ═══════════════
  window._openAlert = async function(id) {
    const a = allAlerts.find(x => x.id === id) || await api.getAlertDetail(id);
    if (!a) return;
    const r = a.risk_score || 0;
    const sev = r >= 80 ? 'critical' : r >= 60 ? 'high' : r >= 40 ? 'medium' : 'low';
    const t = (a.predicted_attack_type || a.attack_type || 'unknown').replace(/_/g, ' ');

    document.getElementById('detail-id').textContent = '#' + (a.id ?? id);
    document.getElementById('detail-risk-score').textContent = r;
    const badge = document.getElementById('detail-severity-badge');
    if (badge) { badge.className = 'badge badge-' + sev; badge.textContent = sev.toUpperCase(); }
    const bar = document.getElementById('detail-risk-bar');
    if (bar) { bar.className = 'risk-bar risk-bar-' + sev; bar.style.width = r + '%'; }

    document.getElementById('detail-explanation').textContent = a.explanation?.natural_language || a.explanation || 'No explanation available.';
    document.getElementById('detail-entity-id').textContent = a.entity_id || '—';
    document.getElementById('detail-entity-type').textContent = a.entity_type || '—';
    document.getElementById('detail-attack-type').textContent = t;
    document.getElementById('detail-auth-method').textContent = a.auth_method || '—';
    document.getElementById('detail-source-ip').textContent = a.source_ip || '—';
    document.getElementById('detail-location').textContent = a.geo_location || '—';
    document.getElementById('detail-resource').textContent = a.resource_accessed || '—';
    document.getElementById('detail-duration').textContent = a.session_duration ? a.session_duration + 's' : '—';
    document.getElementById('detail-timestamp').textContent = a.timestamp || '—';

    charts.initSHAPChart('chart-shap-detail', a.explanation?.top_factors || a.top_factors || []);
    document.getElementById('alert-detail-panel')?.classList.add('panel-open');
    document.getElementById('overlay')?.classList.remove('hidden');
  };

  function closePanel() {
    document.getElementById('alert-detail-panel')?.classList.remove('panel-open');
    document.getElementById('overlay')?.classList.add('hidden');
  }

  // ═══════════════ MODEL METRICS ═══════════════
  function renderModelMetrics(m) {
    const b = m.binary || m || {};
    document.getElementById('metric-accuracy').textContent = b.accuracy ? (b.accuracy*100).toFixed(1)+'%' : '93.6%';
    document.getElementById('metric-precision').textContent = b.precision ? (b.precision*100).toFixed(1)+'%' : '75.2%';
    document.getElementById('metric-recall').textContent = b.recall ? (b.recall*100).toFixed(1)+'%' : '97.7%';
    document.getElementById('metric-f1').textContent = b.f1 ? (b.f1*100).toFixed(1)+'%' : '85.0%';
    document.getElementById('metric-auc').textContent = b.auc_roc ? b.auc_roc.toFixed(3) : '0.988';
    charts.initFeatureImportanceChart('chart-feature-importance', m.feature_importance);
    charts.initConfusionMatrixChart('chart-confusion-matrix', b.confusion_matrix);
  }

  // ═══════════════ FILTERS ═══════════════
  function applyFilters() {
    const tf = document.getElementById('filter-type')?.value || 'all';
    const ef = document.getElementById('filter-entity-type')?.value || 'all';
    const q = (document.getElementById('alert-search')?.value || '').toLowerCase().trim();

    filteredAlerts = allAlerts.filter(a => {
      if (tf !== 'all' && (a.predicted_attack_type || a.attack_type || '') !== tf) return false;
      if (ef !== 'all' && (a.entity_type || '') !== ef) return false;
      if (q && ![a.entity_id, a.source_ip, a.geo_location, a.resource_accessed, a.predicted_attack_type, a.attack_type].join(' ').toLowerCase().includes(q)) return false;
      return true;
    });
    currentPage = 0;
    renderAlertTable();
  }

  // ═══════════════ TAB ROUTER ═══════════════
  function switchTab(tabId) {
    // Desktop tabs
    document.querySelectorAll('#desktop-nav .nav-tab').forEach(b => {
      b.className = b.dataset.tab === tabId
        ? 'nav-tab active text-xs px-3.5 py-1.5 rounded-lg transition-all duration-200 font-semibold text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 shadow-sm'
        : 'nav-tab text-xs px-3.5 py-1.5 rounded-lg transition-all duration-200 font-medium text-slate-400 hover:text-cyan-400 hover:bg-white/5 border border-transparent';
    });
    // Mobile tabs
    document.querySelectorAll('#mobile-nav-menu .nav-tab').forEach(b => {
      b.className = b.dataset.tab === tabId
        ? 'nav-tab mobile-tab text-sm py-2 px-3 rounded-lg text-left text-cyan-400 bg-cyan-500/10'
        : 'nav-tab mobile-tab text-sm py-2 px-3 rounded-lg text-left text-slate-400 hover:bg-white/5';
    });

    // Show/hide pages
    document.querySelectorAll('.page-view').forEach(v => {
      if (v.id === 'page-' + tabId) {
        v.classList.remove('hidden');
        v.style.animation = 'none'; v.offsetHeight; v.style.animation = '';
      } else {
        v.classList.add('hidden');
      }
    });

    // Re-init charts that need canvas resize
    if (tabId === 'analytics') charts.initRiskTimelineChart('chart-risk-timeline-analytics');

    // Close mobile menu
    document.getElementById('mobile-nav-menu')?.classList.add('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function wireTabRouter() {
    document.querySelectorAll('.nav-tab').forEach(b => {
      b.addEventListener('click', (e) => {
        e.preventDefault();
        const t = b.dataset.tab;
        if (t) { switchTab(t); history.pushState(null, '', '#' + t); }
      });
    });
    const valid = ['overview','analytics','alerts','model'];
    const hash = (location.hash.replace('#','') || 'overview').toLowerCase();
    switchTab(valid.includes(hash) ? hash : 'overview');
    window.addEventListener('popstate', () => {
      const h = (location.hash.replace('#','') || 'overview').toLowerCase();
      if (valid.includes(h)) switchTab(h);
    });
  }

  // ═══════════════ EVENT LISTENERS ═══════════════
  function wireEventListeners() {
    document.getElementById('close-panel')?.addEventListener('click', closePanel);
    document.getElementById('overlay')?.addEventListener('click', closePanel);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanel(); });

    document.getElementById('filter-type')?.addEventListener('change', applyFilters);
    document.getElementById('filter-entity-type')?.addEventListener('change', applyFilters);

    let st;
    document.getElementById('alert-search')?.addEventListener('input', () => { clearTimeout(st); st = setTimeout(applyFilters, 300); });

    document.getElementById('export-btn')?.addEventListener('click', () => { api.exportReport(); toast('Exporting CSV…', 'fa-download', '#06b6d4', 3000); });

    document.getElementById('prev-page')?.addEventListener('click', () => { if (currentPage > 0) { currentPage--; renderAlertTable(); } });
    document.getElementById('next-page')?.addEventListener('click', () => { if ((currentPage+1)*PAGE_SIZE < filteredAlerts.length) { currentPage++; renderAlertTable(); } });

    // Keyboard: 1-4 for tabs
    document.addEventListener('keydown', (e) => {
      if (['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)) return;
      const tabs = ['overview','analytics','alerts','model'];
      if (e.key >= '1' && e.key <= '4') { switchTab(tabs[+e.key-1]); history.pushState(null,'','#'+tabs[+e.key-1]); }
    });
  }

  // ═══════════════ LAUNCH ═══════════════
  init();
});
