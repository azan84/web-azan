/* ============================================================
   Tuft field — cursor-reactive, potential-flow-inspired background
   ------------------------------------------------------------
   Thousands of short "wool tufts" sit in a uniform stream (left → right).
   The cursor and any [data-flow-obstacle] element act as circular
   cylinders. Each tuft points along the local velocity of superposed
   cylinder doublets,  δ(u − iv) = −(a + ib) R² / z²  with (a, b) the
   stream relative to the cylinder, and is coloured by local speed:
   stagnation (slow) → blue, accelerated flank (fast) → amber/red,
   free stream → faint grey. A sine flutter behind each cylinder evokes
   a Kármán wake; clicking sends an expanding pressure-like pulse.
   (An artistic approximation, not a CFD solution.)

   Markup:  <section data-tuftfield [data-tuft-intensity="0.6"]>
              <canvas data-tuft-canvas aria-hidden="true"></canvas>
              <img data-flow-obstacle …>          (optional, any number)
              <button data-tuft-toggle aria-pressed="false">…</button>  (optional pause)
            </section>
   No dependencies. Pauses off-screen / hidden tab. Reduced motion → one static frame.
   ============================================================ */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var darkScheme = window.matchMedia('(prefers-color-scheme: dark)');
  var noHover = window.matchMedia('(hover: none)');      // touch: show an idle drifting cylinder
  var DPR_CAP = 2;
  var MAX_TUFTS = 3200;

  // Diverging speed colormap (slow → free stream → fast), sRGB stops
  var STOPS = [
    [0.00, [43, 76, 201]],   // stagnation: deep blue
    [0.30, [31, 154, 208]],  // cyan
    [0.50, [140, 150, 165]], // free stream: neutral grey (alpha keeps it faint)
    [0.72, [242, 170, 58]],  // amber
    [1.00, [226, 74, 59]]    // peak speed: red
  ];
  var BUCKETS = 24, ALPHAS = 8;   // ≤ 192 strokes per frame; empty batches skipped
  var STYLES = buildStyles();

  function buildStyles() {
    var out = [];
    for (var i = 0; i < BUCKETS; i++) {
      var t = i / (BUCKETS - 1), a = STOPS[0], b = STOPS[STOPS.length - 1];
      for (var k = 0; k < STOPS.length - 1; k++) {
        if (t >= STOPS[k][0] && t <= STOPS[k + 1][0]) { a = STOPS[k]; b = STOPS[k + 1]; break; }
      }
      var f = (t - a[0]) / ((b[0] - a[0]) || 1);
      var rgb = [0, 1, 2].map(function (c) { return Math.round(a[1][c] + (b[1][c] - a[1][c]) * f); }).join(',');
      for (var j = 0; j < ALPHAS; j++) {
        out.push('rgba(' + rgb + ',' + Math.min(0.95, (j + 0.5) / ALPHAS).toFixed(3) + ')');
      }
    }
    return out;
  }

  function Field(host, canvas, ctx) {
    this.host = host;
    this.canvas = canvas;
    this.ctx = ctx;
    var I = parseFloat(host.getAttribute('data-tuft-intensity') || '1');
    this.intensity = isFinite(I) ? Math.max(0, Math.min(1, I)) : 1;
    this.obstacleEls = Array.prototype.slice.call(host.querySelectorAll('[data-flow-obstacle]'));
    this.obstacles = [];
    this.pointer = { x: 0, y: 0, vx: 0, vy: 0, active: false, lastT: 0 };
    this.cursorCyl = { x: 0, y: 0, R: 64, ux: 1, uy: 0, wake: 1 };
    this.ghostCyl = { x: 0, y: 0, R: 40, ux: 1, uy: 0, wake: 0.6 };
    this.cyl = [];
    this.pulses = [];
    this.running = false;
    this.paused = false;
    this.visible = !('IntersectionObserver' in window);
    this.t = 0;
    this.spring = 0.14;
    this.w = 0; this.h = 0; this.dpr = 0; this.n = 0;
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.pointerEvents = 'none';
    this.bind();
    this.resize();
    this.start();
  }

  Field.prototype.bind = function () {
    var self = this;

    var resetPointer = function () {
      var p = self.pointer;
      p.active = false; p.vx = p.vy = p.lastT = 0;
    };
    this.resetPointer = resetPointer;

    var onMove = function (e) {
      if (!self.running || e.isPrimary === false) return;
      var r = self.host.getBoundingClientRect();
      var x = e.clientX - r.left, y = e.clientY - r.top;
      var now = performance.now(), p = self.pointer;
      if (p.active && p.lastT) {
        var dt = Math.max(8, now - p.lastT);
        // smoothed pointer velocity (px/ms) → moving-cylinder strength
        p.vx = p.vx * 0.7 + ((x - p.x) / dt) * 0.3;
        p.vy = p.vy * 0.7 + ((y - p.y) / dt) * 0.3;
      }
      p.x = x; p.y = y; p.lastT = now; p.active = true;
    };

    // Host-scoped: content above the canvas still bubbles its pointer events here
    this.host.addEventListener('pointermove', onMove, { passive: true });
    this.host.addEventListener('pointerleave', resetPointer);
    window.addEventListener('blur', resetPointer);
    document.addEventListener('pointerup', function (e) { if (e.pointerType !== 'mouse') resetPointer(); }, { passive: true });
    document.addEventListener('pointercancel', resetPointer, { passive: true });
    this.host.addEventListener('pointerdown', function (e) {
      if (!self.running || e.isPrimary === false || e.button !== 0) return;
      if (e.target.closest('a, button, input, textarea, select, label')) return;
      onMove(e);
      self.pulses.push({ x: self.pointer.x, y: self.pointer.y, r: 0, life: 1 });
      if (self.pulses.length > 4) self.pulses.shift();
    });

    // Optional pause control (WCAG 2.2.2)
    this.toggle = this.host.querySelector('[data-tuft-toggle]');
    if (this.toggle) {
      this.toggle.hidden = reduceMotion.matches;
      this.toggle.addEventListener('click', function () {
        self.paused = !self.paused;
        self.toggle.setAttribute('aria-pressed', String(self.paused));
        var label = self.toggle.querySelector('[data-tuft-toggle-label]');
        if (label) label.textContent = self.paused ? 'Play flow' : 'Pause flow';
        resetPointer();
        self.pulses.length = 0;
        self.stop(); self.start();
      });
    }

    // Geometry invalidation (coalesced to one per frame)
    var pending = 0;
    var refresh = function () {
      if (pending) return;
      pending = requestAnimationFrame(function () {
        pending = 0;
        if (self.visible && !document.hidden) self.resize();
      });
    };
    if ('ResizeObserver' in window) {
      var ro = new ResizeObserver(refresh);
      ro.observe(this.host);
      this.obstacleEls.forEach(function (el) { ro.observe(el); });
    }
    window.addEventListener('resize', refresh, { passive: true });
    window.addEventListener('scroll', function () { resetPointer(); }, { passive: true });
    window.addEventListener('load', refresh);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(refresh);
    var dprQuery = null;
    var watchDpr = function () {
      if (dprQuery && dprQuery.removeEventListener) dprQuery.removeEventListener('change', watchDpr);
      dprQuery = window.matchMedia('(resolution: ' + (window.devicePixelRatio || 1) + 'dppx)');
      if (dprQuery.addEventListener) dprQuery.addEventListener('change', watchDpr);
      refresh();
    };
    watchDpr();

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        self.visible = es[es.length - 1].isIntersecting;
        if (self.visible) self.start(); else self.stop();
      }, { threshold: 0 }).observe(this.host);
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) self.stop(); else self.start();
    });

    var restart = function () {
      resetPointer(); self.pulses.length = 0;
      if (self.toggle) self.toggle.hidden = reduceMotion.matches;
      self.stop(); self.start();
    };
    if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', restart);

    // Theme changes: redraw immediately when not animating
    var refreshTheme = function () { if (!self.running && self.visible && !document.hidden) self.drawStatic(); };
    if (darkScheme.addEventListener) darkScheme.addEventListener('change', refreshTheme);
    if ('MutationObserver' in window) {
      new MutationObserver(refreshTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    }
  };

  Field.prototype.resize = function () {
    var r = this.host.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    var w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    var sizeChanged = w !== this.w || h !== this.h;
    if (sizeChanged || dpr !== this.dpr) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.ctx.setTransform(this.canvas.width / w, 0, 0, this.canvas.height / h, 0, 0);
    }
    this.w = w; this.h = h; this.dpr = dpr;
    this.measureObstacles(r);
    if (sizeChanged) this.seed();
    if (!this.running) this.drawStatic();
  };

  Field.prototype.measureObstacles = function (hostRect) {
    var r = hostRect || this.host.getBoundingClientRect();
    this.obstacles = this.obstacleEls.map(function (el) {
      var b = el.getBoundingClientRect();
      if (!b.width || !b.height) return null;
      return { x: b.left - r.left + b.width / 2, y: b.top - r.top + b.height / 2,
               R: Math.min(b.width, b.height) / 2 + 10, ux: 1, uy: 0, wake: 1 };
    }).filter(Boolean);
  };

  // Jittered grid → even coverage without visible rows (cheap blue-noise look)
  Field.prototype.seed = function () {
    var gap = 22;
    while (Math.ceil(this.w / gap + 1) * Math.ceil(this.h / gap + 1) > MAX_TUFTS) gap += 1;
    var cols = Math.ceil(this.w / gap) + 1, rows = Math.ceil(this.h / gap) + 1;
    var n = cols * rows, hx = new Float32Array(n), hy = new Float32Array(n), ph = new Float32Array(n);
    var i = 0;
    for (var row = 0; row < rows; row++) {
      for (var col = 0; col < cols; col++) {
        hx[i] = col * gap + (Math.random() - 0.5) * gap * 0.9;
        hy[i] = row * gap + (Math.random() - 0.5) * gap * 0.9;
        ph[i] = Math.random() * Math.PI * 2;
        i++;
      }
    }
    this.n = n; this.hx = hx; this.hy = hy; this.ph = ph;
    this.px = new Float32Array(hx); this.py = new Float32Array(hy);   // displaced positions
    this.heads = new Int32Array(BUCKETS * ALPHAS);
    this.next = new Int32Array(n);
    this.seg = new Float32Array(n * 4);
  };

  // Reuses cylinder records: static obstacles + cursor (or touch ghost)
  Field.prototype.updateCylinders = function () {
    var list = this.cyl;
    list.length = 0;
    for (var i = 0; i < this.obstacles.length; i++) list.push(this.obstacles[i]);
    var p = this.pointer;
    if (p.active) {
      // Moving cylinder: doublet uses the stream relative to the cursor (capped, artistic scale)
      var vx = Math.max(-3, Math.min(3, p.vx * 6)), vy = Math.max(-3, Math.min(3, p.vy * 6));
      var c = this.cursorCyl;
      c.x = p.x; c.y = p.y; c.R = 64 + Math.min(36, Math.sqrt(vx * vx + vy * vy) * 10);
      c.ux = 1 - vx; c.uy = -vy;
      list.push(c);
    } else if (noHover.matches) {
      var g = this.ghostCyl, t = this.t * 0.00012;
      g.x = this.w * (0.5 + 0.38 * Math.sin(t * 2.1));
      g.y = this.h * (0.82 + 0.1 * Math.sin(t * 3.3 + 1));
      list.push(g);
    }
    return list;
  };

  Field.prototype.frame = function (now) {
    var dt = Math.min(48, now - (this.lastNow || now));
    this.lastNow = now;
    this.t += dt;
    var k = dt / (1000 / 60);                       // frame-rate independent relaxation
    var decay = Math.pow(0.92, k);
    this.pointer.vx *= decay; this.pointer.vy *= decay;
    this.spring = 1 - Math.pow(0.86, k);
    for (var q = this.pulses.length - 1; q >= 0; q--) {
      var pu = this.pulses[q];
      pu.r += dt * 0.55; pu.life -= dt / 1400;
      if (pu.life <= 0) this.pulses.splice(q, 1);
    }
    this.draw(this.updateCylinders(), true);
  };

  Field.prototype.draw = function (cyl, animate) {
    var ctx = this.ctx, w = this.w, h = this.h;
    ctx.clearRect(0, 0, w, h);
    var theme = document.documentElement.getAttribute('data-theme');
    var dark = theme === 'dark' || ((theme === null || theme === '') && darkScheme.matches);
    var I = this.intensity, t = this.t * 0.001;
    var heads = this.heads, next = this.next, seg = this.seg;
    heads.fill(-1);
    var alphaFloor = dark ? 0.16 : 0.2;
    var pulses = animate ? this.pulses : [];
    var spring = this.spring;

    tuft: for (var i = 0; i < this.n; i++) {
      var hx = this.hx[i], hy = this.hy[i];
      var x = this.px[i], y = this.py[i];
      var u = 1, v = 0, flutter = 0, pushx = 0, pushy = 0;
      var c, C;

      // Home positions inside a body are pushed to its surface
      for (c = 0; c < cyl.length; c++) {
        C = cyl[c];
        var hdx = hx - C.x, hdy = hy - C.y, hr2 = hdx * hdx + hdy * hdy, Rin = C.R * 1.04;
        if (hr2 < Rin * Rin) {
          var hr = Math.sqrt(hr2) || 1, s = (Rin - hr) / hr;
          pushx += hdx * s; pushy += hdy * s;
        }
      }

      for (c = 0; c < cyl.length; c++) {
        C = cyl[c];
        var dx = x - C.x, dy = y - C.y;
        var r2 = dx * dx + dy * dy, R2 = C.R * C.R;
        if (r2 > R2 * 100) continue;                // negligible beyond ~10R
        if (r2 < R2) {
          // Inside the body this frame: hide it while the spring carries it out
          if (animate) { this.px[i] += (hx + pushx - x) * spring; this.py[i] += (hy + pushy - y) * spring; }
          else { this.px[i] = hx + pushx; this.py[i] = hy + pushy; }
          continue tuft;
        }
        // Relative stream a + ib:  δ(u − iv) = −(a + ib) R² / z²
        var k2 = R2 / (r2 * r2);
        var xx = dx * dx - dy * dy, xy2 = 2 * dx * dy;
        u += -(C.ux * xx + C.uy * xy2) * k2;
        v += -(C.ux * xy2 - C.uy * xx) * k2;
        if (C.wake && dx > C.R * 0.6 && dx < C.R * 9) {
          var band = Math.exp(-(dy * dy) / (R2 * 1.6));
          var dec = Math.exp(-(dx - C.R) / (C.R * 5));
          flutter += C.wake * band * dec * Math.sin(dx / (C.R * 0.9) - t * 4.2 + this.ph[i] * 0.15);
        }
      }
      v += flutter * 0.9;

      // Click pulses: radial kick in a thin expanding ring
      for (var q = 0; q < pulses.length; q++) {
        var P = pulses[q];
        var pdx = x - P.x, pdy = y - P.y, pd2 = pdx * pdx + pdy * pdy;
        var lo = P.r - 40, hi = P.r + 40;
        if (pd2 > hi * hi || (lo > 0 && pd2 < lo * lo)) continue;
        var pd = Math.sqrt(pd2) || 1;
        var ring = Math.exp(-((pd - P.r) * (pd - P.r)) / 324) * P.life;
        u += (pdx / pd) * ring * 2.2; v += (pdy / pd) * ring * 2.2;
        pushx += (pdx / pd) * ring * 10; pushy += (pdy / pd) * ring * 10;
      }

      var tx = hx + pushx, ty = hy + pushy;
      if (animate) { this.px[i] += (tx - x) * spring; this.py[i] += (ty - y) * spring; }
      else { this.px[i] = tx; this.py[i] = ty; }
      x = this.px[i]; y = this.py[i];

      var speed = Math.sqrt(u * u + v * v) || 1e-6;
      var dev = Math.min(1, (Math.abs(speed - 1) + Math.abs(flutter) * 0.5) * 1.7);   // 0 = free stream
      var bucket = Math.round(Math.max(0, Math.min(1, speed / 2)) * (BUCKETS - 1));    // speed 0..2 → colormap
      var len = 1.4 + dev * 11 * I;
      var half = len / speed * 0.5, ex = u * half, ey = v * half;
      var a = Math.min(0.95, alphaFloor + dev * 0.85 * I);
      var group = bucket * ALPHAS + Math.min(ALPHAS - 1, Math.floor(a * ALPHAS));
      var o = i * 4;
      seg[o] = x - ex; seg[o + 1] = y - ey; seg[o + 2] = x + ex; seg[o + 3] = y + ey;
      next[i] = heads[group];
      heads[group] = i;
    }

    ctx.lineCap = 'round';
    ctx.lineWidth = 1.35;
    for (var g = 0; g < heads.length; g++) {
      if (heads[g] === -1) continue;
      ctx.beginPath();
      for (var j = heads[g]; j !== -1; j = next[j]) {
        var off = j * 4;
        ctx.moveTo(seg[off], seg[off + 1]);
        ctx.lineTo(seg[off + 2], seg[off + 3]);
      }
      ctx.strokeStyle = STYLES[g];
      ctx.stroke();
    }
  };

  Field.prototype.drawStatic = function () {
    if (!this.n) return;
    this.measureObstacles();
    this.draw(this.obstacles, false);
  };

  Field.prototype.start = function () {
    if (this.running || !this.visible || document.hidden) return;
    if (reduceMotion.matches || this.paused) { this.drawStatic(); return; }
    this.running = true;
    var self = this;
    var loop = function (now) {
      if (!self.running) return;
      self.frame(now);
      self.raf = requestAnimationFrame(loop);
    };
    this.lastNow = performance.now();
    this.raf = requestAnimationFrame(loop);
  };
  Field.prototype.stop = function () {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.resetPointer) this.resetPointer();
  };

  function init() {
    var hosts = document.querySelectorAll('[data-tuftfield]');
    for (var i = 0; i < hosts.length; i++) {
      if (hosts[i].__tuft) continue;
      var canvas = hosts[i].querySelector('[data-tuft-canvas]');
      var ctx = canvas && canvas.getContext && canvas.getContext('2d');
      if (!ctx) continue;
      hosts[i].__tuft = new Field(hosts[i], canvas, ctx);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
