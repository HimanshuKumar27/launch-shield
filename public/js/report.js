/**
 * report.js — Renders audit report from sessionStorage (fresh scan)
 * or Firestore (saved scan via ?scanId= param). Phase 1 uses mock data.
 */

// ── Helpers ────────────────────────────────────────────────────────────────

function scoreColor(score) {
  if (score >= 90) return { text: 'text-emerald-400', bg: 'bg-emerald-500', ring: '#10b981', badge: 'score-badge-good' };
  if (score >= 50) return { text: 'text-amber-400',   bg: 'bg-amber-500',   ring: '#f59e0b', badge: 'score-badge-warning' };
  return              { text: 'text-red-400',     bg: 'bg-red-500',     ring: '#ef4444', badge: 'score-badge-poor' };
}

function auditScoreIcon(score, severity) {
  // score: 0 = fail, 0.5 = warning, 1 = pass, null = informational
  if (score === 1) return `<div class="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
    <svg class="w-4 h-4 text-emerald-400" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
  </div>`;
  if (score === 0) {
    const sev = severity === 'high' ? 'red' : severity === 'medium' ? 'amber' : 'yellow';
    return `<div class="w-7 h-7 rounded-lg bg-${sev}-500/20 border border-${sev}-500/20 flex items-center justify-center flex-shrink-0">
      <svg class="w-4 h-4 text-${sev}-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
    </div>`;
  }
  // info / partial
  return `<div class="w-7 h-7 rounded-lg bg-blue-500/20 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
    <svg class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
  </div>`;
}

function buildAuditItem(audit) {
  const icon = auditScoreIcon(audit.score, audit.severity);
  return `
    <details class="audit-item group" ${audit.score === 1 ? '' : 'open'}>
      <summary class="flex items-start gap-3 cursor-pointer list-none">
        ${icon}
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium text-gray-200 group-hover:text-white transition-colors">${audit.title}</div>
          ${audit.score !== 1 && audit.displayValue ? `<div class="text-xs text-gray-500 mt-0.5">${audit.displayValue}</div>` : ''}
        </div>
        ${audit.score !== 1 ? `<span class="priority-tag ${audit.severity === 'high' ? 'priority-high' : audit.severity === 'medium' ? 'priority-medium' : 'priority-low'} mt-0.5 flex-shrink-0">${audit.severity || 'info'}</span>` : ''}
        <svg class="w-4 h-4 text-gray-600 flex-shrink-0 mt-0.5 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
      </summary>
      <div class="mt-3 ml-10 text-sm text-gray-400 leading-relaxed pb-1">${audit.description}</div>
    </details>`;
}

function formatDate(isoString) {
  try {
    return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(isoString));
  } catch { return '—'; }
}

// ── Main render ────────────────────────────────────────────────────────────

function renderReport(scan) {
  // ── Site Preview ─────────────────────────────────────────────────────────
  document.title = (scan.siteMeta?.title || scan.url) + ' — LaunchShield';

  const { siteMeta = {}, scores = {}, performance = {}, accessibility = {}, seo = {}, security = {}, ux = {}, recommendations = [] } = scan;

  // Title
  document.getElementById('site-title').textContent = siteMeta.title || new URL(scan.url).hostname;
  document.getElementById('site-description').textContent = siteMeta.description || '';
  document.getElementById('site-url-display').textContent = scan.url;
  document.getElementById('scan-time-display').textContent = formatDate(scan.createdAt);

  // Favicon
  if (siteMeta.faviconUrl) {
    const favicon = document.getElementById('site-favicon');
    favicon.src = siteMeta.faviconUrl;
    favicon.alt = 'Site favicon';
    favicon.classList.remove('hidden');
  }

  // Screenshot
  const img = document.getElementById('site-screenshot');
  img.classList.add('animate-fade-in'); // Add smooth fade-in
  
  // Use fast thum.io as default unless we have a premium ScreenshotOne API URL
  let finalScreenshotUrl = siteMeta.screenshotUrl;
  if (!finalScreenshotUrl || finalScreenshotUrl.includes('api.microlink.io')) {
    finalScreenshotUrl = `https://image.thum.io/get/width/1280/crop/800/${scan.url}`;
  }

  img.onerror = () => {
    console.warn('Screenshot URL failed to load.');
    img.classList.add('hidden');
    document.getElementById('screenshot-placeholder').classList.remove('hidden');
  };
  
  img.onload = () => {
    img.classList.remove('hidden');
    document.getElementById('screenshot-placeholder').classList.add('hidden');
  };
  
  img.src = finalScreenshotUrl;
  img.alt = 'Screenshot of ' + scan.url;

  // Status badge
  if (siteMeta.statusCode) {
    const badge = document.getElementById('site-status-badge');
    const dot   = document.getElementById('status-dot');
    const text  = document.getElementById('status-text');
    const isOk  = siteMeta.statusCode < 400;
    text.textContent = siteMeta.statusCode + (isOk ? ' OK' : ' Error');
    badge.classList.add(isOk ? 'bg-emerald-500/20' : 'bg-red-500/20', isOk ? 'text-emerald-400' : 'text-red-400', isOk ? 'border-emerald-500/20' : 'border-red-500/20');
    dot.classList.add(isOk ? 'bg-emerald-400' : 'bg-red-400');
    badge.classList.remove('hidden');
    badge.classList.add('inline-flex');
  }

  // ── Overall score donut ──────────────────────────────────────────────────
  const overall = scores.overall ?? 0;
  document.getElementById('overall-score-num').textContent = overall;
  const circumference = 238.76;
  const offset = circumference - (overall / 100) * circumference;
  const ring = document.getElementById('overall-ring');
  ring.style.strokeDashoffset = offset;
  ring.style.stroke = scoreColor(overall).ring;

  // ── Sub-scores row ───────────────────────────────────────────────────────
  const subscoreData = [
    { key: 'performance',  label: 'Performance',   icon: '⚡' },
    { key: 'accessibility',label: 'Accessibility',  icon: '♿' },
    { key: 'seo',          label: 'SEO',            icon: '🔍' },
    { key: 'security',     label: 'Security',       icon: '🛡' },
    { key: 'ux',           label: 'Best Practices', icon: '✓' },
  ];
  const subscoresRow = document.getElementById('subscores-row');
  subscoresRow.innerHTML = subscoreData.map(({ key, label }) => {
    const s = scores[key] ?? 0;
    const c = scoreColor(s);
    return `
      <button class="card p-4 text-center hover:border-primary-500/30 transition-all duration-300 hover:-translate-y-0.5 cursor-pointer"
              onclick="switchTab('${key}')" aria-label="View ${label} details">
        <div class="text-2xl font-black ${c.text} mb-1">${s}</div>
        <div class="text-xs text-gray-500 font-medium mb-1">${label}</div>
        <div class="h-1 rounded-full bg-dark-800 overflow-hidden">
          <div class="h-full rounded-full ${c.bg} transition-all duration-700" style="width:${s}%"></div>
        </div>
      </button>`;
  }).join('');

  // ── Update tab score badges ──────────────────────────────────────────────
  const tabBadges = {
    'perf-score-badge': scores.performance,
    'a11y-score-badge': scores.accessibility,
    'seo-score-badge':  scores.seo,
    'sec-score-badge':  scores.security,
    'ux-score-badge':   scores.ux,
  };
  Object.entries(tabBadges).forEach(([id, score]) => {
    const el = document.getElementById(id);
    if (!el || score == null) return;
    el.textContent = score;
    const c = scoreColor(score);
    el.className = `score-badge ${c.badge} w-6 h-6 text-xs`;
  });

  // ── AI Recommendations ───────────────────────────────────────────────────
  const recList = document.getElementById('recommendations-list');
  if (recommendations.length === 0) {
    recList.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">No recommendations generated.</p>';
  } else {
    recList.innerHTML = recommendations.map(rec => `
      <div class="flex items-start gap-3 p-4 rounded-xl bg-dark-900/60 border border-dark-800">
        <span class="priority-tag priority-${rec.priority} mt-0.5 flex-shrink-0">${rec.priority}</span>
        <div class="flex-1">
          <span class="text-xs text-gray-600 uppercase tracking-wider font-medium mr-2">${rec.category}</span>
          <p class="text-sm text-gray-300 leading-relaxed mt-1">${rec.text}</p>
        </div>
      </div>`).join('');
  }

  // ── Performance tab ──────────────────────────────────────────────────────
  // CWV
  const cwv = {
    fcp: { el: 'cwv-fcp-val', val: performance.fcp, good: v => parseFloat(v) < 1.8 },
    lcp: { el: 'cwv-lcp-val', val: performance.lcp, good: v => parseFloat(v) < 2.5 },
    si:  { el: 'cwv-si-val',  val: performance.speedIndex, good: v => parseFloat(v) < 3.4 },
    tbt: { el: 'cwv-tbt-val', val: performance.tbt, good: v => parseFloat(v) < 200 },
    cls: { el: 'cwv-cls-val', val: performance.cls, good: v => parseFloat(v) < 0.1 },
  };
  Object.values(cwv).forEach(({ el, val, good }) => {
    if (!val && val !== 0) return;
    const elem = document.getElementById(el);
    const isGood = good(String(val));
    elem.textContent = val;
    elem.className = `text-2xl font-black mb-1 ${isGood ? 'text-emerald-400' : 'text-amber-400'}`;
  });

  // Audit items
  document.getElementById('perf-audits').innerHTML =
    (performance.audits || []).map(buildAuditItem).join('');

  // ── Accessibility tab ────────────────────────────────────────────────────
  document.getElementById('a11y-audits').innerHTML =
    (accessibility.audits || []).map(buildAuditItem).join('');

  // ── SEO tab ──────────────────────────────────────────────────────────────
  const seoChecks = [
    { key: 'titleTag',       label: 'Title Tag',        },
    { key: 'metaDescription',label: 'Meta Description', },
    { key: 'canonicalTag',   label: 'Canonical Tag',    },
    { key: 'openGraphTags',  label: 'Open Graph Tags',  },
    { key: 'robotsTxt',      label: 'robots.txt',       },
    { key: 'sitemapXml',     label: 'Sitemap XML',      },
    { key: 'structuredData', label: 'Structured Data',  },
  ];
  document.getElementById('seo-meta-grid').innerHTML = seoChecks.map(({ key, label }) => {
    const val = seo[key];
    const ok = val === true || val === 'partial';
    return `
      <div class="card p-3 text-center border-dark-700 ${ok ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/20 bg-red-500/5'}">
        <div class="${ok ? 'text-emerald-400' : 'text-red-400'} mb-1">
          ${ok ? '✓' : '✕'}
        </div>
        <div class="text-[11px] font-medium text-gray-400">${label}</div>
      </div>`;
  }).join('');

  document.getElementById('seo-audits').innerHTML =
    (seo.audits || []).map(buildAuditItem).join('');

  // ── Security tab ─────────────────────────────────────────────────────────
  const secItems = [
    { key: 'httpsEnabled', label: 'HTTPS', val: security.httpsEnabled },
    { key: 'sslValid',     label: 'SSL Valid', val: security.sslValid },
    { key: 'mixedContent', label: 'No Mixed Content', val: security.mixedContentWarnings === 0 },
  ];
  document.getElementById('security-overview').innerHTML = secItems.map(({ label, val }) => `
    <div class="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border ${val ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}">
      ${val ? '✓' : '✕'} ${label}
    </div>`).join('');

  const headers = security.headers || {};
  const headerRows = [
    { key: 'csp',           label: 'Content-Security-Policy', severity: 'high',   desc: 'Prevents XSS and data injection attacks. One of the most important security headers.' },
    { key: 'hsts',          label: 'Strict-Transport-Security', severity: 'medium', desc: 'Forces browsers to use HTTPS for all future requests to this domain.' },
    { key: 'xFrameOptions', label: 'X-Frame-Options',         severity: 'medium', desc: 'Prevents clickjacking attacks by controlling whether the page can be framed.' },
    { key: 'xContentType',  label: 'X-Content-Type-Options',  severity: 'medium', desc: 'Prevents MIME-type sniffing, reducing exposure to drive-by download attacks.' },
    { key: 'referrerPolicy',label: 'Referrer-Policy',         severity: 'low',    desc: 'Controls how much referrer information is sent with requests.' },
  ];
  document.getElementById('security-headers').innerHTML = headerRows.map(({ key, label, severity, desc }) => {
    const h = headers[key] || {};
    const present = h.present;
    return buildAuditItem({
      title: label,
      score: present ? 1 : 0,
      severity: present ? null : severity,
      description: present
        ? `✓ Present: <code class="text-xs bg-dark-800 px-1 rounded">${h.value || 'set'}</code> — ${desc}`
        : `✗ Missing — ${desc}`,
      displayValue: present ? h.value : 'Not set',
    });
  }).join('');

  // ── Best Practices tab ───────────────────────────────────────────────────
  document.getElementById('ux-audits').innerHTML =
    (ux.audits || []).map(buildAuditItem).join('');
}

// ── Tab switching ──────────────────────────────────────────────────────────

function switchTab(tabKey) {
  const tabs = ['performance', 'accessibility', 'seo', 'security', 'ux'];
  const btnMap = { performance: 'btn-performance', accessibility: 'btn-accessibility', seo: 'btn-seo', security: 'btn-security', ux: 'btn-ux' };
  tabs.forEach(t => {
    document.getElementById('tab-' + t).classList.toggle('hidden', t !== tabKey);
    const btn = document.getElementById(btnMap[t]);
    btn.classList.toggle('tab-btn-active', t === tabKey);
    btn.setAttribute('aria-selected', t === tabKey ? 'true' : 'false');
  });
  // Scroll tab into view on mobile
  document.getElementById(btnMap[tabKey])?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}

// ── Tab click listeners ────────────────────────────────────────────────────
['performance','accessibility','seo','security','ux'].forEach(tab => {
  const btnId = { performance: 'btn-performance', accessibility: 'btn-accessibility', seo: 'btn-seo', security: 'btn-security', ux: 'btn-ux' };
  document.getElementById(btnId[tab])?.addEventListener('click', () => switchTab(tab));
});

// Export renderReport globally for module scripts
window.renderReport = renderReport;
window.switchTab = switchTab;

