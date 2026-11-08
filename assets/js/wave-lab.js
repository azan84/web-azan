/* Academics — submerged-breakwater card: view switcher, in-view autoplay and
   the freeboard explorer. Energy split comes from the OpenFOAM design study
   (medium mesh, B = 0.75 m): transmitted = Kt², reflected = Kr², rest dissipated. */
(function () {
  var card = document.querySelector('[data-wave-lab]');
  if (!card) return;

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var stage = card.querySelector('.wl-stage');
  var views = Array.prototype.slice.call(card.querySelectorAll('.wl-view'));
  var tabs = Array.prototype.slice.call(card.querySelectorAll('.wl-tab'));
  var active = views[0];
  var inView = false;
  var quiet = false;   // true while we pause/play programmatically

  function setPlaying(v, on) {
    if (!v || v.tagName !== 'VIDEO') return;
    quiet = true;
    if (on) {
      var p = v.play();
      if (p && p.catch) p.catch(function () {});
    } else {
      v.pause();
    }
    setTimeout(function () { quiet = false; }, 0);
  }

  views.forEach(function (v) {
    if (v.tagName !== 'VIDEO') return;
    v.addEventListener('pause', function () { if (!quiet) v.dataset.userPaused = '1'; });
    v.addEventListener('play', function () { if (!quiet) delete v.dataset.userPaused; });
  });

  function show(name, autoplay) {
    views.forEach(function (v) {
      var on = v.dataset.view === name;
      v.hidden = !on;
      v.classList.toggle('is-active', on);
      if (on) active = v; else setPlaying(v, false);
    });
    tabs.forEach(function (t) { t.setAttribute('aria-pressed', String(t.dataset.show === name)); });
    if (autoplay && !reduce && !active.dataset.userPaused) setPlaying(active, true);
  }

  tabs.forEach(function (t) {
    t.addEventListener('click', function () { show(t.dataset.show, true); });
  });

  // Play the active clip only while the stage is on screen.
  if (!reduce && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      inView = entries[0].isIntersecting;
      if (inView && !active.dataset.userPaused) setPlaying(active, true);
      if (!inView) setPlaying(active, false);
    }, { threshold: 0.35 }).observe(stage);
  }

  // ---------- Freeboard explorer ----------
  var RUNS = [
    { f: 0.65, kt: 0.97934, kr: 0.12941, tag: '', note: 'Deep crest: the wave hardly notices the structure.' },
    { f: 0.50, kt: 0.96122, kr: 0.21669, tag: 'paper geometry', note: 'The wave rides over the crest without breaking.', link: ['render', 'Watch the 3D render'] },
    { f: 0.35, kt: 0.92082, kr: 0.27954, tag: '', note: 'More energy reflects off the slope, but the wave still does not break.' },
    { f: 0.20, kt: 0.83425, kr: 0.34781, tag: 'breaking', note: 'The wave starts to break. Its height ratio Ht/Hi here is 0.87, the value the paper quotes for F = 0.50 m.' },
    { f: 0.10, kt: 0.73649, kr: 0.38490, tag: 'breaking', note: 'A plunging breaker forms in the lee and burns off nearly a third of the energy.', link: ['breaking', 'See it break'] }
  ];

  var range = card.querySelector('[data-wl-range]');
  if (!range) return;
  var $ = function (s) { return card.querySelector(s); };
  var outF = $('[data-wl-f]'), tag = $('[data-wl-tag]'), note = $('[data-wl-note]');
  var water = $('[data-wl-water]'), surface = $('[data-wl-surface]'), bw = $('[data-wl-bw]');
  var dim = $('[data-wl-dim] line'), dimLbl = $('[data-wl-dim] text');
  var seg = {}, out = {};
  ['t', 'r', 'd'].forEach(function (k) { seg[k] = $('[data-wl-seg="' + k + '"]'); out[k] = $('[data-wl-out="' + k + '"]'); });
  out.kt = $('[data-wl-out="kt"]');

  // Schematic scale: 50 px per metre across, 80 px per metre up; bed at y = 140.
  var BED = 140, SX = 50, SZ = 80, D = 1.15, XC = 5.2, HALF_CREST = 0.375;
  var px = function (x) { return (x * SX).toFixed(1); };
  var pz = function (z) { return (BED - z * SZ).toFixed(1); };

  // Surface: still water plus a schematic sech² solitary hump upstream (H = 0.30 m).
  var surf = [];
  for (var x = 0; x <= 8.0001; x += 0.1) {
    var c = 1 / Math.cosh(1.4 * (x - 2.0));
    surf.push(px(x) + ',' + pz(D + 0.30 * c * c));
  }
  surface.setAttribute('d', 'M' + surf.join(' L'));
  water.setAttribute('d', 'M' + surf.join(' L') + ' L' + px(8) + ',' + BED + ' L0,' + BED + ' Z');

  var pct = function (v) { return (v * 100).toFixed(1) + ' %'; };

  function update() {
    var run = RUNS[+range.value];
    var h = D - run.f, b = HALF_CREST + h;   // 1:1 side slopes
    bw.setAttribute('d', 'M' + px(XC - b) + ',' + BED + ' L' + px(XC - HALF_CREST) + ',' + pz(h) +
      ' L' + px(XC + HALF_CREST) + ',' + pz(h) + ' L' + px(XC + b) + ',' + BED + ' Z');

    var xd = XC * SX + HALF_CREST * SX + 14;
    dim.setAttribute('x1', xd); dim.setAttribute('x2', xd);
    dim.setAttribute('y1', pz(D)); dim.setAttribute('y2', pz(h));
    dimLbl.setAttribute('x', xd + 5);
    dimLbl.setAttribute('y', ((+pz(D) + +pz(h)) / 2 + 3.5).toFixed(1));

    var t = run.kt * run.kt, r = run.kr * run.kr, d = Math.max(0, 1 - t - r);
    seg.t.style.flexBasis = (t * 100) + '%';
    seg.r.style.flexBasis = (r * 100) + '%';
    seg.d.style.flexBasis = (d * 100) + '%';
    out.t.textContent = pct(t); out.r.textContent = pct(r); out.d.textContent = pct(d);
    out.kt.textContent = run.kt.toFixed(3);

    outF.textContent = run.f.toFixed(2);
    range.setAttribute('aria-valuetext', run.f.toFixed(2) + ' metres');
    tag.textContent = run.tag;
    tag.classList.toggle('is-breaking', run.tag === 'breaking');

    note.textContent = run.note + ' ';
    if (run.link) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = run.link[1] + ' →';
      btn.addEventListener('click', function () {
        show(run.link[0], true);
        stage.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
      });
      note.appendChild(btn);
    }
  }

  range.addEventListener('input', update);
  update();
})();
