/**
 * charts.js — Chart.js score visualizations for LaunchShield.
 * Loaded by report.html. Charts are initialized after report data is rendered.
 * Phase 5 will call initCharts(scan) with real data.
 */

// Chart defaults
if (typeof Chart !== 'undefined') {
  Chart.defaults.color = '#9ca3af';
  Chart.defaults.font.family = 'Inter, system-ui, sans-serif';
  Chart.defaults.font.size = 12;
}

/**
 * Returns Chart.js color for a score value.
 */
function chartScoreColor(score, alpha = 1) {
  if (score >= 90) return `rgba(16, 185, 129, ${alpha})`;  // emerald
  if (score >= 50) return `rgba(245, 158, 11, ${alpha})`;  // amber
  return              `rgba(239, 68, 68, ${alpha})`;       // red
}

/**
 * Initialize radar chart — 5 sub-scores overview.
 * @param {string} canvasId - ID of <canvas> element
 * @param {Object} scores - { performance, accessibility, seo, security, ux }
 */
window.initRadarChart = function(canvasId, scores) {
  const ctx = document.getElementById(canvasId);
  if (!ctx || typeof Chart === 'undefined') return null;

  const labels = ['Performance', 'Accessibility', 'SEO', 'Security', 'Best Practices'];
  const data   = [scores.performance, scores.accessibility, scores.seo, scores.security, scores.ux];

  return new Chart(ctx, {
    type: 'radar',
    data: {
      labels,
      datasets: [{
        label: 'Score',
        data,
        borderColor: '#0d9488',
        backgroundColor: 'rgba(13,148,136,0.15)',
        borderWidth: 2,
        pointBackgroundColor: data.map(v => chartScoreColor(v)),
        pointBorderColor: data.map(v => chartScoreColor(v)),
        pointRadius: 4,
        pointHoverRadius: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        r: {
          min: 0, max: 100,
          ticks: { stepSize: 25, display: false },
          grid:  { color: 'rgba(255,255,255,0.05)' },
          angleLines: { color: 'rgba(255,255,255,0.05)' },
          pointLabels: { color: '#9ca3af', font: { size: 11, weight: '500' } },
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${ctx.raw}`,
          }
        }
      },
      animation: { duration: 800, easing: 'easeOutQuart' },
    }
  });
};

/**
 * Initialize horizontal bar chart for sub-scores.
 * @param {string} canvasId
 * @param {Object} scores
 */
window.initBarChart = function(canvasId, scores) {
  const ctx = document.getElementById(canvasId);
  if (!ctx || typeof Chart === 'undefined') return null;

  const labels = ['Performance', 'Accessibility', 'SEO', 'Security', 'Best Practices'];
  const data   = [scores.performance, scores.accessibility, scores.seo, scores.security, scores.ux];

  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: data.map(v => chartScoreColor(v, 0.8)),
        borderColor:     data.map(v => chartScoreColor(v, 1)),
        borderWidth: 1,
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          min: 0, max: 100,
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { callback: v => v },
        },
        y: {
          grid: { display: false },
          ticks: { color: '#9ca3af' },
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` Score: ${ctx.raw}`,
          }
        }
      },
      animation: { duration: 700, easing: 'easeOutQuart' },
    }
  });
};

/**
 * Draw a simple SVG donut progress ring inline (no Chart.js dependency).
 * Used for sub-score cards. Returns SVG string.
 * @param {number} score - 0-100
 * @param {number} size - SVG size in px
 * @param {number} strokeWidth
 */
window.scoreDonutSVG = function(score, size = 56, strokeWidth = 6) {
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score / 100) * circumference;
  let color = '#10b981';
  if (score < 90) color = '#f59e0b';
  if (score < 50) color = '#ef4444';
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="-rotate-90" aria-hidden="true">
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="#1f2937" stroke-width="${strokeWidth}"/>
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${color}" stroke-width="${strokeWidth}"
        stroke-dasharray="${circumference.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"
        stroke-linecap="round" class="transition-all duration-700"/>
    </svg>`;
};
