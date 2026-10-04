// ── Navbar scroll ──
const navbar = document.getElementById('navbar');
if (navbar) window.addEventListener('scroll', () => navbar.classList.toggle('scrolled', window.scrollY > 40), { passive: true });

// ── Mobile nav ──
const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');
if (navToggle && navLinks) {
  navToggle.addEventListener('click', () => navLinks.classList.toggle('open'));
  navLinks.querySelectorAll('a').forEach(l => l.addEventListener('click', () => navLinks.classList.remove('open')));
}

// ── Active page ──
(function () {
  const page = window.location.pathname.split('/').pop() || 'index.html';
  const map = { 'index.html': 'Home', 'academics.html': 'Academics', 'webapp.html': 'Apps', 'students.html': 'Students', 'blog.html': 'Blog', 'personal.html': 'Personal' };
  const label = map[page];
  if (!label) return;
  document.querySelectorAll('.nav-links a').forEach(a => { if (a.textContent.trim() === label) a.classList.add('active'); });
})();

// ── Scroll reveal ──
const revealEls = document.querySelectorAll('.reveal');
if (revealEls.length) {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
  }, { threshold: 0.12 });
  revealEls.forEach(el => obs.observe(el));
}

// ── Contact form ──
function handleContactSubmit(e) {
  e.preventDefault();
  const btn = e.target.querySelector('.form-submit');
  btn.textContent = 'Message Sent!';
  btn.style.background = 'linear-gradient(145deg, #5BBFB5, #4aa89f)';
  setTimeout(() => { btn.textContent = 'Send Message'; btn.style.background = ''; e.target.reset(); }, 2500);
}

/* ============================================================
   STAGE C — shared upgrades (only active on body.has-tokens)
   ============================================================ */
(function () {
  'use strict';
  if (!document.body.classList.contains('has-tokens')) return;

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- 1. Scroll-progress bar ----------
  const progress = document.querySelector('.nav-progress');
  if (progress) {
    let progressTicking = false;
    const updateProgress = () => {
      const h  = document.documentElement;
      const sh = h.scrollHeight - h.clientHeight;
      const p  = sh > 0 ? (h.scrollTop / sh) * 100 : 0;
      progress.style.width = p.toFixed(2) + '%';
      progressTicking = false;
    };
    window.addEventListener('scroll', () => {
      if (!progressTicking) { progressTicking = true; requestAnimationFrame(updateProgress); }
    }, { passive: true });
    updateProgress();
  }

  // ---------- 2. Sliding active-link pill ----------
  const navList = document.getElementById('navLinks');
  if (navList) {
    // Insert pill element
    const pill = document.createElement('span');
    pill.className = 'nav-pill';
    pill.setAttribute('aria-hidden', 'true');
    navList.prepend(pill);

    const moveTo = (el) => {
      if (!el) { pill.classList.remove('ready'); return; }
      const listRect = navList.getBoundingClientRect();
      const elRect   = el.getBoundingClientRect();
      const x = elRect.left - listRect.left;
      pill.style.transform = `translateX(${x.toFixed(1)}px)`;
      pill.style.width     = `${elRect.width.toFixed(1)}px`;
      pill.classList.add('ready');
    };

    // Initial position = active link
    const activeLink = navList.querySelector('a.active');
    // Delay one frame so layout is settled (especially after font swap)
    requestAnimationFrame(() => requestAnimationFrame(() => moveTo(activeLink)));
    // Re-measure once web fonts / images have loaded (link widths change on font swap)
    const settle = () => moveTo(navList.querySelector('a.active'));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(settle);
    window.addEventListener('load', settle);

    // Hover: slide to hovered link
    navList.querySelectorAll('a').forEach(a => {
      a.addEventListener('mouseenter', () => moveTo(a));
      a.addEventListener('focus',      () => moveTo(a));
    });
    navList.addEventListener('mouseleave', () => moveTo(navList.querySelector('a.active')));
    navList.addEventListener('focusout',   () => moveTo(navList.querySelector('a.active')));

    // Recalculate on resize
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => moveTo(navList.querySelector('a.active')), 120);
    });
  }

  // ---------- 3. Theme toggle (view-transition aware) ----------
  const toggle = document.querySelector('.theme-toggle');
  if (toggle) {
    const root = document.documentElement;
    const stored = localStorage.getItem('theme');
    if (stored === 'dark' || stored === 'light') root.setAttribute('data-theme', stored);

    const applyTheme = (mode) => {
      root.setAttribute('data-theme', mode);
      localStorage.setItem('theme', mode);
      toggle.setAttribute('aria-pressed', mode === 'dark' ? 'true' : 'false');
    };

    toggle.addEventListener('click', () => {
      const next = (root.getAttribute('data-theme') === 'dark') ? 'light' : 'dark';
      if (!prefersReduced && 'startViewTransition' in document) {
        document.startViewTransition(() => applyTheme(next));
      } else {
        applyTheme(next);
      }
    });

    // Initialize aria state
    toggle.setAttribute('aria-pressed', root.getAttribute('data-theme') === 'dark' ? 'true' : 'false');
  }

  // ---------- 4. Stat count-up on scroll ----------
  const counters = document.querySelectorAll('[data-count-to]');
  if (counters.length && 'IntersectionObserver' in window) {
    const animateCount = (el) => {
      const target = parseFloat(el.dataset.countTo);
      if (!isFinite(target)) return;
      if (prefersReduced) { el.textContent = target; return; }
      const duration = 1400;
      const startTime = performance.now();
      const format = (n) => Number.isInteger(target) ? Math.round(n).toString() : n.toFixed(1);
      const step = (now) => {
        const t = Math.min(1, (now - startTime) / duration);
        // easeOutExpo
        const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
        el.textContent = format(target * eased);
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    const countObs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCount(entry.target);
          countObs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.4 });
    counters.forEach(el => countObs.observe(el));
  }
})();

/* ===== Sim videos: autoplay in view, pause out of view =====
   Muted + playsinline videos may autoplay programmatically, so each .sim-media
   video starts when ~a third of it is visible and pauses when scrolled away.
   A pause the USER makes is respected (no restart on re-entry) — scripted
   play/pause is marked with a per-video flag that the queued media event
   consumes, distinguishing it from clicks on the controls. Reduced-motion
   users keep click-to-play only. */
(function () {
  const videos = document.querySelectorAll('.sim-media video');
  if (!videos.length || !('IntersectionObserver' in window)) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  videos.forEach((v) => {
    v.addEventListener('pause', () => {
      if (v.dataset.scriptedPause) {
        delete v.dataset.scriptedPause;
      } else if (!v.ended) {
        v.dataset.userPaused = '1';
      }
    });
    v.addEventListener('play', () => {
      if (v.dataset.scriptedPlay) {
        delete v.dataset.scriptedPlay;
      } else {
        delete v.dataset.userPaused; // user pressed play — resume auto behaviour
      }
    });
  });

  const obs = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const v = entry.target;
      if (entry.isIntersecting) {
        if (v.paused && !v.dataset.userPaused) {
          v.dataset.scriptedPlay = '1';
          v.dataset.autoplayAttempted = '1';
          const p = v.play();
          if (p && p.catch) {
            p.catch(() => {
              // Autoplay vetoed (rare with muted) — leave the controls to the user.
              delete v.dataset.scriptedPlay;
            });
          }
        }
      } else if (!v.paused) {
        v.dataset.scriptedPause = '1';
        v.pause();
      }
    });
  }, { threshold: 0.35 });

  videos.forEach((v) => obs.observe(v));
})();

// ── Research cards: play the icon micro-animations only on hover / focus ──
(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.querySelectorAll('.research-card').forEach(function (card) {
    card.addEventListener('mouseenter', function () { card.classList.add('fx-play'); });
    card.addEventListener('mouseleave', function () { card.classList.remove('fx-play'); });
    card.addEventListener('focusin',  function () { card.classList.add('fx-play'); });
    card.addEventListener('focusout', function () { card.classList.remove('fx-play'); });
  });
})();
