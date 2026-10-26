/* ============================================================
   motion.js — "Flow motion" layer (pairs with motion.css)
   ------------------------------------------------------------
   · Scroll reveals with per-batch stagger (only for content that
     starts below the fold, so nothing visible ever blinks out)
   · Streamline underlines that draw beneath section headings
   · Cursor spotlight + gentle 3D tilt on cards
   · Magnetic buttons and pressure-pulse ripples on press
   · Smart navbar (hides on scroll down, returns on scroll up)
   · Publications stream in after every search / filter
   · A Kármán vortex street drifting through the footer
   No dependencies. Reduced motion → static, nothing hidden.
   ============================================================ */
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var hasIO = 'IntersectionObserver' in window;
  var SVGNS = 'http://www.w3.org/2000/svg';
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var below = function (el) { return el.getBoundingClientRect().top > window.innerHeight * 0.96; };

  // ---------- Shared gradient for drawn strokes ----------
  var defs = document.createElementNS(SVGNS, 'svg');
  defs.setAttribute('aria-hidden', 'true');
  defs.setAttribute('width', '0'); defs.setAttribute('height', '0');
  defs.style.position = 'absolute';
  defs.innerHTML = '<defs><linearGradient id="m-flow-grad" x1="0" x2="1" y1="0" y2="0">' +
    '<stop offset="0" stop-color="var(--flow-cold)"/><stop offset=".4" stop-color="var(--flow-mid)"/>' +
    '<stop offset=".75" stop-color="var(--flow-warm)"/><stop offset="1" stop-color="var(--flow-hot)"/>' +
    '</linearGradient></defs>';
  // stop-color via var() is not honoured everywhere as an attribute → set as style too
  $$('stop', defs).forEach(function (s) { s.style.stopColor = s.getAttribute('stop-color'); });
  document.body.appendChild(defs);

  // ---------- Card enhancements (spotlight / tilt) ----------
  var SPOT = '.grant-card, .sup-card, .course-card, .blog-card, .pub-item, .contact-info, .contact-form';
  var TILT = '.blog-card, .grant-card, .sup-card, .course-card';

  function enhance(el) {
    if (el.matches(SPOT)) el.classList.add('m-spot', 'm-glow');
    if (!reduce && fine && el.matches(TILT)) el.classList.add('m-tilt');
  }

  // ---------- Scroll reveals ----------
  var REVEAL = [
    ['.v3-h2, .section-title, .v3-intro, .v3-about-grid p, .grants-section-heading, .sup-section-label, .banner-desc', 'm-text'],
    ['.research-card, .v3-explore-link, .v3-timeline li, .grant-card, .sup-card, .course-card, .blog-card, .pub-controls, .contact-info, .contact-form, .gallery-item, .sim-caption', ''],
    ['.sim-media', 'm-wipe']
  ];
  var pending = [];

  function done(el) {
    el.classList.remove('m-rv', 'm-in', 'm-text', 'm-wipe');
    el.style.removeProperty('--m-d');
    enhance(el);
  }

  if (!reduce && hasIO) {
    var revealObs = new IntersectionObserver(function (entries) {
      var hits = entries.filter(function (e) { return e.isIntersecting; }).map(function (e) { return e.target; });
      hits.forEach(function (t) { revealObs.unobserve(t); });
      hits = hits.reduce(function (all, t) { return all.concat(t._mTargets || [t]); }, []);
      hits.sort(function (a, b) { return a.compareDocumentPosition(b) & 4 ? -1 : 1; });
      hits.forEach(function (el, i) {
        var d = Math.min(i, 6) * 80;
        el.style.setProperty('--m-d', d + 'ms');
        el.classList.add('m-in');
        setTimeout(function () { done(el); }, d + 1250);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });

    REVEAL.forEach(function (pair) {
      $$(pair[0]).forEach(function (el) {
        if (el.closest('.v3-hero') || el.classList.contains('m-rv') || !el.getClientRects().length) return;
        if (!below(el)) { enhance(el); return; }
        el.classList.remove('reveal');               // v3-pages pins .reveal visible with !important
        el.classList.add('m-rv');
        if (pair[1]) el.classList.add(pair[1]);
        pending.push(el);
        // A fully clipped element never intersects, so a wipe watches its parent instead
        var watch = pair[1] === 'm-wipe' && el.parentElement ? el.parentElement : el;
        (watch._mTargets = watch._mTargets || []).push(el);
        revealObs.observe(watch);
      });
    });
    window.addEventListener('beforeprint', function () { pending.forEach(done); });
  }
  // Whatever was not armed for a reveal gets its hover enhancements now
  $$(SPOT + ',' + TILT).forEach(function (el) { if (!el.classList.contains('m-rv')) enhance(el); });

  // ---------- Streamline underline beneath headings; timeline spine ----------
  var drawObs = hasIO && !reduce ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      drawObs.unobserve(e.target);
      e.target.classList.add('m-in');
    });
  }, { threshold: 0.15 }) : null;

  $$('.v3-h2, .section-title').forEach(function (h) {
    if (h.querySelector('.m-stream')) return;
    var svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', 'm-stream');
    svg.setAttribute('viewBox', '0 0 120 12');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.innerHTML = '<path d="M2 6 C 14 1, 24 1, 34 6 S 54 11, 64 6 S 84 1, 94 6 S 112 10, 118 6"/>';
    h.appendChild(svg);
    if (drawObs) { svg.classList.add('m-armed'); drawObs.observe(svg); }
  });
  $$('.v3-timeline').forEach(function (tl) {
    if (drawObs) { tl.classList.add('m-armed'); drawObs.observe(tl); }
  });

  // ---------- Stat counters: warm flash when the count lands (count-up lives in script.js) ----------
  if (!reduce && hasIO) {
    var statObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        statObs.unobserve(e.target);
        setTimeout(function () { e.target.classList.add('m-landed'); }, 1250);
      });
    }, { threshold: 0.4 });
    $$('.v3-stats dd').forEach(function (dd) { statObs.observe(dd); });
  }

  // ---------- Pointer effects (fine pointers only) ----------
  if (fine) {
    var spotEl = null, px = 0, py = 0, raf = 0;
    var paint = function () {
      raf = 0;
      if (!spotEl) return;
      var r = spotEl.getBoundingClientRect();
      var x = px - r.left, y = py - r.top;
      spotEl.style.setProperty('--mx', x.toFixed(1) + 'px');
      spotEl.style.setProperty('--my', y.toFixed(1) + 'px');
      if (spotEl.classList.contains('m-tilt')) {
        var nx = x / r.width - 0.5, ny = y / r.height - 0.5;
        var mag = Math.min(1, Math.hypot(nx, ny) * 2);
        spotEl.style.setProperty('--rx', (-ny).toFixed(3));
        spotEl.style.setProperty('--ry', nx.toFixed(3));
        spotEl.style.setProperty('--ra', (mag * 5).toFixed(2) + 'deg');
        spotEl.classList.add('m-tracking');
      }
    };
    var release = function (el) {
      if (!el) return;
      el.classList.remove('m-tracking');
      el.style.removeProperty('--rx'); el.style.removeProperty('--ry'); el.style.removeProperty('--ra');
    };
    document.addEventListener('pointermove', function (e) {
      var t = e.target.closest ? e.target.closest('.m-spot, .research-card') : null;
      if (t !== spotEl) { release(spotEl); spotEl = t; }
      if (!spotEl) return;
      px = e.clientX; py = e.clientY;
      if (!raf) raf = requestAnimationFrame(paint);
    }, { passive: true });
    document.addEventListener('pointerleave', function () { release(spotEl); spotEl = null; });

    // Magnetic buttons: pulled a little toward the cursor, spring back on release
    if (!reduce) {
      $$('.v3-btn, .theme-toggle, .contact-link-btn, .form-submit').forEach(function (b) {
        var home = null, mx = 0, my = 0, frame = 0;
        b.classList.add('m-mag');
        var pull = function () {
          frame = 0;
          if (!home) return;
          b.style.setProperty('--tx', ((mx - home.cx) * 0.22).toFixed(1) + 'px');
          b.style.setProperty('--ty', ((my - home.cy) * 0.32).toFixed(1) + 'px');
          b.classList.add('m-tracking');
        };
        b.addEventListener('pointerenter', function () {
          // Measure the resting position once per hover (the rect moves with the pull)
          var r = b.getBoundingClientRect(), cs = getComputedStyle(b).translate.split(' ');
          home = { cx: r.left + r.width / 2 - (parseFloat(cs[0]) || 0), cy: r.top + r.height / 2 - (parseFloat(cs[1]) || 0) };
        });
        b.addEventListener('pointermove', function (e) {
          mx = e.clientX; my = e.clientY;
          if (home && !frame) frame = requestAnimationFrame(pull);
        });
        b.addEventListener('pointerleave', function () {
          home = null;
          b.classList.remove('m-tracking');
          b.style.removeProperty('--tx'); b.style.removeProperty('--ty');
        });
      });
    }
  }

  // ---------- Pressure-pulse ripple on press ----------
  if (!reduce) {
    document.addEventListener('pointerdown', function (e) {
      var b = e.target.closest ? e.target.closest('.v3-btn, .pub-filter-btn, .contact-link-btn, .form-submit') : null;
      if (!b) return;
      b.classList.add('m-ripple-host');
      var r = b.getBoundingClientRect();
      var s = document.createElement('span');
      s.className = 'm-ripple';
      s.setAttribute('aria-hidden', 'true');
      s.style.setProperty('--rx', (e.clientX - r.left) + 'px');
      s.style.setProperty('--ry', (e.clientY - r.top) + 'px');
      s.style.setProperty('--rs', (Math.max(r.width, r.height) * 2.4 / 12).toFixed(1));
      b.appendChild(s);
      var gone = setTimeout(function () { s.remove(); }, 900);
      s.addEventListener('animationend', function () { clearTimeout(gone); s.remove(); });
    }, { passive: true });
  }

  // ---------- Smart navbar ----------
  var nav = document.getElementById('navbar');
  if (nav && !reduce) {
    var lastY = window.scrollY, navTick = false;
    var links = document.getElementById('navLinks');
    window.addEventListener('scroll', function () {
      if (navTick) return;
      navTick = true;
      requestAnimationFrame(function () {
        navTick = false;
        var y = window.scrollY, dy = y - lastY;
        if (Math.abs(dy) < 6) return;
        var keep = y < 320 || (links && links.classList.contains('open')) || nav.contains(document.activeElement);
        nav.classList.toggle('m-nav-hidden', !keep && dy > 0);
        lastY = y;
      });
    }, { passive: true });
    nav.addEventListener('focusin', function () { nav.classList.remove('m-nav-hidden'); });
  }

  // ---------- Publications: re-stream the list after every filter ----------
  var pubList = document.getElementById('pubList');
  if (pubList && 'MutationObserver' in window) {
    new MutationObserver(function (muts) {
      var i = 0;
      muts.forEach(function (m) {
        Array.prototype.forEach.call(m.addedNodes, function (n) {
          if (n.nodeType !== 1 || !n.classList.contains('pub-item')) return;
          enhance(n);
          n.style.setProperty('--i', Math.min(i++, 14));
          n.classList.add('m-pop');
        });
      });
    }).observe(pubList, { childList: true });
  }

  // ---------- Hero: the pause button stills every hero motion ----------
  var hero = document.querySelector('.v3-hero');
  var heroToggle = hero && hero.querySelector('[data-tuft-toggle]');
  if (heroToggle) {
    heroToggle.addEventListener('click', function () {
      setTimeout(function () { hero.classList.toggle('m-paused', heroToggle.getAttribute('aria-pressed') === 'true'); }, 0);
    });
  }

  // ---------- Footer: Kármán vortex street ----------
  var footer = document.querySelector('.footer');
  if (footer && !footer.querySelector('.m-street')) {
    var street = document.createElementNS(SVGNS, 'svg');
    street.setAttribute('class', 'm-street');
    street.setAttribute('viewBox', '0 0 1400 120');
    street.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    street.setAttribute('aria-hidden', 'true');
    street.setAttribute('focusable', 'false');
    var wave = function (y, a) {
      var d = 'M0 ' + y;
      for (var x = 0; x < 1400; x += 175) d += (x === 0 ? ' Q ' + 87.5 + ' ' + (y - a) + ' 175 ' + y : ' T ' + (x + 175) + ' ' + y);
      return d;
    };
    var spiral = 'M0 0 a3 3 0 1 1 3 3 a6 6 0 1 1 -6 -6 a9 9 0 1 1 9 9 a12 12 0 1 1 -12 -12';
    var vx = '';
    for (var k = 0; k < 6; k++) {
      var top = k % 2 === 0;
      vx += '<g transform="translate(0 ' + (top ? 46 : 78) + ')"><g class="vx' + (top ? '' : ' vb') +
            '" style="animation-delay:' + (-k * 2.35).toFixed(2) + 's"><path d="' + spiral + '" ' +
            (top ? '' : 'transform="scale(1 -1)"') + '/></g></g>';
    }
    street.innerHTML = '<path class="s1" d="' + wave(30, 10) + '"/><path class="s2" d="' + wave(62, 7) + '"/>' +
                       '<path class="s3" d="' + wave(94, 12) + '"/>' + vx;
    footer.insertBefore(street, footer.firstChild);
    if (hasIO) {
      new IntersectionObserver(function (es) {
        street.classList.toggle('m-off', !es[es.length - 1].isIntersecting);
      }).observe(footer);
    }
  }
})();
