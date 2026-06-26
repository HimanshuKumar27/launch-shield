/**
 * canvas.js — Lightweight interactive 3D-style particle node field.
 * Zero external dependencies. Uses native HTML5 Canvas API.
 *
 * Usage:
 *   import { initCanvas } from './js/canvas.js';
 *   initCanvas('hero-canvas', { nodeCount: 80, color: '20, 184, 166' });
 */

export function initCanvas(canvasId, opts = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  // ── Options ───────────────────────────────────────────────────────────────
  const options = {
    nodeCount:       opts.nodeCount       ?? 75,
    lineDistance:    opts.lineDistance    ?? 140,
    speed:           opts.speed           ?? 0.35,
    color:           opts.color           ?? '20, 184, 166',   // RGB components
    secondaryColor:  opts.secondaryColor  ?? '45, 212, 191',
    nodeRadius:      opts.nodeRadius      ?? 2.2,
    interactiveRadius: opts.interactiveRadius ?? 160,
    opacity:         opts.opacity         ?? 1,
    ...opts,
  };

  // ── State ─────────────────────────────────────────────────────────────────
  let nodes    = [];
  let mouse    = { x: -9999, y: -9999 };
  let rafId    = null;
  let paused   = false;
  let W = 0, H = 0;

  // ── Resize ────────────────────────────────────────────────────────────────
  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    W = canvas.width  = rect.width  || window.innerWidth;
    H = canvas.height = rect.height || window.innerHeight;
  }

  const ro = new ResizeObserver(resize);
  ro.observe(canvas.parentElement ?? document.body);
  resize();

  // ── Node factory ──────────────────────────────────────────────────────────
  function createNode() {
    const angle = Math.random() * Math.PI * 2;
    const mag   = options.speed * (0.5 + Math.random() * 0.8);
    return {
      x:  Math.random() * W,
      y:  Math.random() * H,
      vx: Math.cos(angle) * mag,
      vy: Math.sin(angle) * mag,
      r:  options.nodeRadius * (0.7 + Math.random() * 0.8),
      // Subtle depth — nodes at different z-levels have different sizes/opacity
      depth: 0.4 + Math.random() * 0.6,
    };
  }

  function initNodes() {
    nodes = Array.from({ length: options.nodeCount }, createNode);
  }
  initNodes();

  // ── Mouse tracking ────────────────────────────────────────────────────────
  function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  }
  function onMouseLeave() {
    mouse.x = -9999; mouse.y = -9999;
  }
  canvas.addEventListener('mousemove', onMouseMove, { passive: true });
  canvas.addEventListener('mouseleave', onMouseLeave, { passive: true });

  // ── Touch tracking (mobile) ────────────────────────────────────────────────
  canvas.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    mouse.x = t.clientX - rect.left;
    mouse.y = t.clientY - rect.top;
  }, { passive: true });

  // ── Pause when tab hidden ─────────────────────────────────────────────────
  document.addEventListener('visibilitychange', () => {
    paused = document.hidden;
    if (!paused && !rafId) loop();
  });

  // ── Draw ──────────────────────────────────────────────────────────────────
  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Update & draw nodes
    for (const n of nodes) {
      // Move
      n.x += n.vx;
      n.y += n.vy;
      // Wrap edges
      if (n.x < 0)  n.x = W;
      if (n.x > W)  n.x = 0;
      if (n.y < 0)  n.y = H;
      if (n.y > H)  n.y = 0;

      // Mouse interaction: gently attract toward cursor
      const dx = mouse.x - n.x;
      const dy = mouse.y - n.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      let highlight = 0;
      if (dist < options.interactiveRadius) {
        const force = (1 - dist / options.interactiveRadius) * 0.012;
        n.vx += dx * force;
        n.vy += dy * force;
        // Dampen to prevent runaway acceleration
        const speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
        if (speed > options.speed * 3) {
          n.vx = (n.vx / speed) * options.speed * 3;
          n.vy = (n.vy / speed) * options.speed * 3;
        }
        highlight = 1 - dist / options.interactiveRadius;
      } else {
        // Drift back toward natural speed
        n.vx *= 0.995;
        n.vy *= 0.995;
        const speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
        if (speed < options.speed * 0.3) {
          n.vx += (Math.random() - 0.5) * 0.02;
          n.vy += (Math.random() - 0.5) * 0.02;
        }
      }

      // Draw node
      const alpha = (0.35 + n.depth * 0.45 + highlight * 0.3) * options.opacity;
      const radius = n.r * n.depth * (1 + highlight * 0.6);

      ctx.beginPath();
      ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);

      if (highlight > 0.2) {
        // Glowing node near cursor
        const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, radius * 3);
        grad.addColorStop(0, `rgba(${options.secondaryColor}, ${alpha})`);
        grad.addColorStop(1, `rgba(${options.color}, 0)`);
        ctx.fillStyle = grad;
        ctx.arc(n.x, n.y, radius * 3, 0, Math.PI * 2);
      } else {
        ctx.fillStyle = `rgba(${options.color}, ${alpha})`;
      }
      ctx.fill();
    }

    // Draw connecting lines between nearby nodes
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < options.lineDistance) {
          const lineAlpha = (1 - dist / options.lineDistance)
            * 0.28
            * ((a.depth + b.depth) / 2)
            * options.opacity;

          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `rgba(${options.color}, ${lineAlpha})`;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }
    }
  }

  // ── Loop ──────────────────────────────────────────────────────────────────
  function loop() {
    if (paused) { rafId = null; return; }
    draw();
    rafId = requestAnimationFrame(loop);
  }
  loop();

  // ── Public API ────────────────────────────────────────────────────────────
  return {
    destroy() {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseleave', onMouseLeave);
    },
    setOpacity(v) { options.opacity = v; },
    resize,
  };
}

/**
 * initScrollReveal — Intersection Observer for .reveal / .reveal-left elements.
 * Call once after DOM is ready.
 */
export function initScrollReveal() {
  const els = document.querySelectorAll('.reveal, .reveal-left');
  if (!els.length) return;

  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        io.unobserve(entry.target); // animate once
      }
    });
  }, { threshold: 0.12 });

  els.forEach(el => io.observe(el));
}

/**
 * initCountUp — Animates numeric text nodes from 0 to their data-target value
 * when they enter the viewport.
 * Usage: <span class="count-up" data-target="84">0</span>
 */
export function initCountUp() {
  const els = document.querySelectorAll('.count-up');
  if (!els.length) return;

  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const target = parseInt(el.dataset.target, 10);
      const duration = 900;
      const start = performance.now();

      function step(now) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        // Ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(eased * target);
        if (progress < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
      io.unobserve(el);
    });
  }, { threshold: 0.5 });

  els.forEach(el => io.observe(el));
}
