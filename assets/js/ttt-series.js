// ═══════════════════════════════════════════════════════════
// HRDC TTT blog series — interactive figures
// Each widget is wired by a data-widget attribute; pages only
// include the markup for the widgets they use.
// ═══════════════════════════════════════════════════════════
(function () {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const SVGNS = 'http://www.w3.org/2000/svg';

  // Run fn once when el scrolls into view.
  function onView(el, fn, threshold = 0.35) {
    if (!('IntersectionObserver' in window)) { fn(); return; }
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { obs.disconnect(); fn(); } });
    }, { threshold });
    obs.observe(el);
  }

  // ── Grow bars + stagger cards on scroll ──
  $$('.bars, .fx-stagger').forEach((el) => onView(el, () => el.classList.add('in'), 0.25));

  // ── Memory pipeline simulator ──
  $$('[data-widget="memory"]').forEach((w) => {
    const stage = $('.mem-stage', w);
    const boxes = { s: $('.mem-box.sensory .mem-slots', w), w: $('.mem-box.working .mem-slots', w), l: $('.mem-box.ltm .mem-slots', w) };
    const out = $('.mem-score', w);
    const scenarios = {
      bullets: { n: 14, attended: 10, rehearsed: 2, label: '14 bullet points, no hook, no quiz' },
      chunks:  { n: 3,  attended: 3,  rehearsed: 3, label: '3 chunks, a wow factor and a quick quiz' },
    };
    let chips = [];
    let timers = [];
    let current = null;

    function slots(container, count) {
      container.innerHTML = '';
      for (let i = 0; i < count; i++) {
        const d = document.createElement('div');
        d.className = 'mem-slot';
        container.appendChild(d);
      }
      return $$('.mem-slot', container);
    }
    const sSlots = slots(boxes.s, 14);
    const wSlots = slots(boxes.w, 7);
    const lSlots = slots(boxes.l, 14);

    function pos(slot) {
      const a = slot.getBoundingClientRect();
      const b = stage.getBoundingClientRect();
      return `translate(${a.left - b.left}px, ${a.top - b.top}px)`;
    }
    function lose(c) { c.classList.add('lost'); c.style.opacity = '0.18'; }
    function later(fn, ms) { timers.push(setTimeout(fn, reduced ? 0 : ms)); }

    function run(key) {
      const sc = scenarios[key];
      current = key;
      timers.forEach(clearTimeout); timers = [];
      chips.forEach((c) => c.remove()); chips = [];
      $$('.w-btn', w).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.run === key)));
      out.innerHTML = `<span>Running: ${sc.label}&hellip;</span>`;

      for (let i = 0; i < sc.n; i++) {
        const c = document.createElement('div');
        c.className = 'mem-chip';
        c.textContent = key === 'chunks' ? 'ABC'[i] : String(i + 1);
        c.style.transform = pos(sSlots[i]);
        c.style.opacity = '0';
        stage.appendChild(c);
        chips.push(c);
        later(() => { c.style.opacity = '1'; }, 60 * i);
      }
      // Step 1: attention filter (sensory -> working memory)
      later(() => {
        chips.forEach((c, i) => {
          if (i >= sc.attended) { lose(c); return; }
          if (i < 7) c.style.transform = pos(wSlots[i]);
          else { c.style.transform = pos(wSlots[6]); lose(c); }
        });
      }, 60 * sc.n + 700);
      // Step 2: rehearsal (working -> long-term)
      later(() => {
        let k = 0;
        chips.forEach((c, i) => {
          if (c.classList.contains('lost')) return;
          if (i < sc.rehearsed) { c.style.transform = pos(lSlots[k++]); c.classList.add('kept'); }
          else lose(c);
        });
        const forgot = sc.n - sc.rehearsed;
        out.innerHTML =
          `<span>Sent: <b>${sc.n}</b></span>` +
          `<span class="bad">Forgotten: <b>${forgot}</b></span>` +
          `<span class="good">Remembered: <b>${sc.rehearsed}</b> (${Math.round((100 * sc.rehearsed) / sc.n)}%)</span>`;
      }, 60 * sc.n + 2000);
    }
    $$('.w-btn', w).forEach((b) => b.addEventListener('click', () => run(b.dataset.run)));
    let rz;
    window.addEventListener('resize', () => { clearTimeout(rz); if (current) rz = setTimeout(() => run(current), 250); });
    onView(w, () => run('bullets'), 0.5);
  });

  // ── Kolb cycle ──
  $$('[data-widget="cycle"]').forEach((w) => {
    const nodes = $$('.node', w);
    const panel = $('.w-panel', w);
    const info = JSON.parse($('script[type="application/json"]', w).textContent);
    function show(k) {
      nodes.forEach((n, j) => { n.classList.toggle('on', j === k); n.setAttribute('aria-pressed', String(j === k)); });
      panel.innerHTML = `<strong>${info[k].t}</strong><br>${info[k].d}`;
      panel.classList.remove('w-fade'); void panel.offsetWidth; panel.classList.add('w-fade');
    }
    nodes.forEach((n, j) => {
      n.setAttribute('tabindex', '0'); n.setAttribute('role', 'button'); n.setAttribute('aria-label', info[j].t);
      const go = () => show(j);
      n.addEventListener('click', go);
      n.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
    show(0);
  });

  // ── Segmented compare toggle ──
  $$('[data-widget="compare"]').forEach((w) => {
    const data = JSON.parse($('script[type="application/json"]', w).textContent);
    const btns = $$('.seg button', w);
    const vals = $$('.compare-list li span:last-child', w);
    function set(mode) {
      btns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
      vals.forEach((v, k) => {
        v.style.opacity = '0';
        setTimeout(() => { v.textContent = data[mode][k]; v.style.opacity = '1'; }, reduced ? 0 : 180);
      });
    }
    btns.forEach((b) => b.addEventListener('click', () => set(b.dataset.mode)));
    set(btns[0].dataset.mode);
  });

  // ── Quiz: training or not? ──
  $$('[data-widget="quiz"]').forEach((w) => {
    const qs = JSON.parse($('script[type="application/json"]', w).textContent);
    const qEl = $('.quiz-q', w), res = $('.quiz-result', w), prog = $('.quiz-progress', w);
    const btns = $$('.w-btn[data-a]', w), next = $('.w-btn[data-next]', w);
    let k = 0, score = 0, answered = false;
    function render() {
      answered = false;
      qEl.textContent = qs[k].q;
      prog.textContent = `Scenario ${k + 1} of ${qs.length} · score ${score}`;
      res.hidden = true; next.hidden = true;
      btns.forEach((b) => { b.disabled = false; b.setAttribute('aria-pressed', 'false'); });
    }
    btns.forEach((b) => b.addEventListener('click', () => {
      if (answered) return;
      answered = true;
      const ok = b.dataset.a === qs[k].a;
      if (ok) score++;
      b.setAttribute('aria-pressed', 'true');
      btns.forEach((x) => { x.disabled = true; });
      res.hidden = false;
      res.className = 'quiz-result w-fade ' + (ok ? 'ok' : 'no');
      res.innerHTML = `<strong>${ok ? 'Correct!' : 'Not quite.'}</strong> ${qs[k].why}`;
      prog.textContent = `Scenario ${k + 1} of ${qs.length} · score ${score}`;
      next.hidden = false;
      next.textContent = k === qs.length - 1 ? 'Play again' : 'Next scenario →';
    }));
    next.addEventListener('click', () => {
      if (k === qs.length - 1) { k = 0; score = 0; } else k++;
      render();
    });
    render();
  });

  // ── ROPES timeline ──
  $$('[data-widget="ropes"]').forEach((w) => {
    const info = JSON.parse($('script[type="application/json"]', w).textContent);
    const segs = $$('.ropes-seg', w), panel = $('.w-panel', w);
    function show(j) {
      segs.forEach((s, i) => s.setAttribute('aria-pressed', String(i === j)));
      panel.innerHTML = `<strong>${info[j].t}</strong> &middot; <em>${info[j].m}</em><br>${info[j].d}`;
      panel.classList.remove('w-fade'); void panel.offsetWidth; panel.classList.add('w-fade');
    }
    segs.forEach((s, j) => { s.setAttribute('aria-label', `${info[j].t}: ${info[j].m}`); s.addEventListener('click', () => show(j)); });
    show(0);
  });

  // ── Wow factor builder ──
  $$('[data-widget="wow"]').forEach((w) => {
    const data = JSON.parse($('script[type="application/json"]', w).textContent);
    const steps = $$('.wow-step', w), next = $('.w-btn[data-next]', w);
    const segBtns = $$('.seg button', w);
    let mode = 'threat', shown = 0;
    function fill() {
      steps.forEach((s, i) => { $('.wtxt', s).textContent = data[mode][i]; s.classList.toggle('shown', i < shown); });
      next.textContent = shown >= steps.length ? 'Replay ↺' : `Reveal step ${shown + 1} →`;
    }
    next.addEventListener('click', () => { shown = shown >= steps.length ? 0 : shown + 1; fill(); });
    segBtns.forEach((b) => b.addEventListener('click', () => {
      mode = b.dataset.mode; shown = 0;
      segBtns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      fill();
    }));
    fill();
    onView(w, () => {
      if (reduced) { shown = steps.length; fill(); return; }
      [1, 2, 3].forEach((n, i) => setTimeout(() => { if (shown < n) { shown = n; fill(); } }, 700 + i * 1200));
    }, 0.6);
  });

  // ── ABCD objective checker ──
  $$('[data-widget="objective"]').forEach((w) => {
    const ta = $('.obj-input', w), flags = $('.obj-flags', w);
    const cells = { A: $('.abcd[data-k="A"]', w), B: $('.abcd[data-k="B"]', w), C: $('.abcd[data-k="C"]', w), D: $('.abcd[data-k="D"]', w) };
    const banned = ['aware', 'know', 'knows', 'understand', 'understands', 'learn', 'learns', 'ensure', 'appreciate'];
    const good = 'define|state|list|explain|describe|identify|compare|calculate|demonstrate|operate|assemble|adjust|create|design|build|apply|analyse|analyze|evaluate|select|prepare|write|draw|configure|install|measure|test|construct|perform|conduct|present|solve|plan|map|sketch|program|wire|connect|classify|choose|accept|listen'.split('|');
    function check() {
      const t = ta.value.toLowerCase();
      const words = t.match(/[a-z]+/g) || [];
      const hits = {
        A: /\b(participants?|learners?|trainees?|students?|staff|operators?|technicians?|engineers?|managers?|supervisors?|you)\b/.test(t),
        B: words.some((x) => good.includes(x)),
        C: /\b(given|using|with|based on|from|provided|under|without|during)\b/.test(t),
        D: /(\d|%|\bat least\b|\bwithin\b|\baccurately\b|\bcorrectly\b|\ball\b|\bwithout error|\bminimum\b|\bper\b)/.test(t),
      };
      Object.keys(hits).forEach((k) => cells[k].classList.toggle('hit', hits[k]));
      const bad = [...new Set(words.filter((x) => banned.includes(x)))];
      const n = Object.values(hits).filter(Boolean).length;
      const names = { A: 'Audience', B: 'Behaviour', C: 'Condition', D: 'Degree' };
      const missing = Object.keys(hits).filter((k) => !hits[k]).map((k) => names[k]);
      if (bad.length) flags.innerHTML = `Too general! Swap out: ${bad.map((b) => `<span class="ban">${b}</span>`).join('')}`;
      else if (!missing.length) flags.innerHTML = '<strong>All four ABCD cues found.</strong> Now check the wording reads as one observable action.';
      else flags.textContent = `Missing: ${missing.join(', ')}.`;
    }
    ta.addEventListener('input', check);
    $$('.w-btn[data-example]', w).forEach((b) => b.addEventListener('click', () => { ta.value = b.dataset.example; check(); }));
    check();
  });

  // ── Content design checklist ──
  $$('[data-widget="checklist"]').forEach((w) => {
    const boxes = $$('input[type=checkbox]', w);
    const prog = $('.prog', w), pct = $('.pct', w), verdict = $('.chk-verdict', w);
    const C = 2 * Math.PI * 50;
    prog.style.strokeDasharray = C;
    function upd() {
      const done = boxes.filter((b) => b.checked).length;
      const starsMissed = boxes.filter((b) => b.dataset.star && !b.checked).length;
      const p = Math.round((100 * done) / boxes.length);
      prog.style.strokeDashoffset = C * (1 - p / 100);
      prog.style.stroke = p === 100 ? 'var(--flow-mid)' : p < 50 ? 'var(--flow-hot)' : 'var(--accent-1)';
      pct.textContent = p + '%';
      verdict.textContent =
        done === 0 ? 'Tick what your current deck already does.'
        : p === 100 ? 'Ready for the assessor. Now go rehearse (three times).'
        : starsMissed ? `${starsMissed} starred item${starsMissed > 1 ? 's' : ''} still open. "Please pay attention to this. Do not make a mistake!!!"`
        : p >= 70 ? 'Nearly there. The small stuff is what the checklist catches.'
        : 'Tick what your current deck already does.';
    }
    boxes.forEach((b) => b.addEventListener('change', upd));
    upd();
  });

  // ── Forgetting curve ──
  $$('[data-widget="curve"]').forEach((w) => {
    const svg = $('svg', w);
    const W = 560, H = 230, L = 40, R = 14, T = 14, B = 34, days = 14;
    const x = (d) => L + (d / days) * (W - L - R);
    const y = (r) => T + (1 - r) * (H - T - B);
    // grid + axes
    let g = '';
    [0, 0.25, 0.5, 0.75, 1].forEach((r) => {
      g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(r)}" y2="${y(r)}"/>` +
           `<text class="lbl" x="${L - 6}" y="${y(r) + 3}" text-anchor="end">${r * 100}%</text>`;
    });
    [0, 1, 2, 4, 7, 10, 14].forEach((d) => { g += `<text class="lbl" x="${x(d)}" y="${H - 14}" text-anchor="middle">${d}</text>`; });
    g += `<text class="lbl" x="${(L + W - R) / 2}" y="${H - 1}" text-anchor="middle">days after training</text>`;
    g += `<line class="axis" x1="${L}" x2="${L}" y1="${T}" y2="${H - B}"/><line class="axis" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/>`;
    svg.innerHTML = g + '<path class="base"/><path class="rev"/><g class="dots"></g>';
    const base = $('.base', svg), rev = $('.rev', svg), dots = $('.dots', svg);

    function path(reviews) {
      // Retention R = exp(-t/S); each review resets to 100% and doubles stability.
      let S = 1.2, last = 0, d = '', pts = [];
      const marks = reviews.slice().sort((a, b) => a - b);
      for (let t = 0; t <= days + 1e-9; t += 0.05) {
        if (marks.length && t >= marks[0]) { pts.push([marks[0], Math.exp(-(marks[0] - last) / S)]); last = marks.shift(); S *= 2.2; pts.push([last, 1]); }
        pts.push([t, Math.exp(-(t - last) / S)]);
      }
      pts.forEach(([t, r], i) => { d += (i ? 'L' : 'M') + x(t).toFixed(1) + ' ' + y(r).toFixed(1); });
      return { d, end: pts[pts.length - 1][1] };
    }
    const b = path([]);
    base.setAttribute('d', b.d);
    const out = $('.curve-out', w);
    function draw(reviews) {
      const p = path(reviews);
      rev.setAttribute('d', p.d);
      dots.innerHTML = reviews.map((d) => `<circle class="dot" cx="${x(d)}" cy="${y(1)}" r="4.5"/>`).join('');
      if (!reduced) {
        const len = rev.getTotalLength();
        rev.style.transition = 'none';
        rev.style.strokeDasharray = len; rev.style.strokeDashoffset = len;
        rev.getBoundingClientRect();
        rev.style.transition = 'stroke-dashoffset 1.6s ease';
        rev.style.strokeDashoffset = 0;
      }
      out.innerHTML = `Retention on day 14: <b>${Math.round(p.end * 100)}%</b> with ${reviews.length || 'no'} review${reviews.length === 1 ? '' : 's'} (vs <b>${Math.max(0, Math.round(b.end * 100))}%</b> with none).`;
    }
    $$('.w-btn', w).forEach((btn) => btn.addEventListener('click', () => {
      $$('.w-btn', w).forEach((x2) => x2.setAttribute('aria-pressed', String(x2 === btn)));
      draw(JSON.parse(btn.dataset.reviews));
    }));
    onView(w, () => $$('.w-btn', w)[1].click());
  });

  // ── 90/20/8 session planner ──
  $$('[data-widget="planner"]').forEach((w) => {
    const range = $('.plan-range', w), track = $('.plan-track', w), lenOut = $('.plan-len', w);
    const stats = { e: $('[data-s="e"]', w), b: $('[data-s="b"]', w), l: $('[data-s="l"]', w) };
    function draw() {
      const total = +range.value;
      lenOut.textContent = total >= 60 ? `${Math.floor(total / 60)} h ${total % 60 ? (total % 60) + ' min' : ''}` : `${total} min`;
      track.innerHTML = '';
      const pct = (m) => (100 * m) / total;
      let t = 0, sinceBreak = 0, breaks = 0, blocks = 0;
      while (t < total) {
        if (sinceBreak >= 90) {
          // A break only makes sense if there is teaching left after it;
          // otherwise just reset the clock (and never emit a zero-length block).
          if (total - t > 10) {
            const b = document.createElement('div'); b.className = 'plan-block brk';
            b.style.left = pct(t) + '%'; b.style.width = pct(10) + '%';
            track.appendChild(b); t += 10; breaks++;
          }
          sinceBreak = 0;
          continue;
        }
        const len = Math.min(20, total - t, 90 - sinceBreak);
        const el = document.createElement('div'); el.className = 'plan-block';
        el.style.left = `calc(${pct(t)}% + 1px)`; el.style.width = `calc(${pct(len)}% - 2px)`;
        track.appendChild(el);
        t += len; sinceBreak += len; blocks++;
      }
      let ticks = 0;
      for (let m = 8; m < total; m += 8) {
        const k = document.createElement('div'); k.className = 'plan-tick'; k.style.left = pct(m) + '%';
        track.appendChild(k); ticks++;
      }
      stats.e.textContent = ticks; stats.b.textContent = breaks; stats.l.textContent = blocks;
    }
    const sr = $('.sr-only', w);
    range.addEventListener('input', draw);
    range.addEventListener('change', () => { sr.textContent = `${lenOut.textContent}: ${stats.l.textContent} teaching blocks, ${stats.b.textContent} breaks, ${stats.e.textContent} engagement points.`; });
    draw();
  });

  // ── Learning pyramid ──
  $$('[data-widget="pyramid"]').forEach((w) => {
    const svg = $('svg', w), tiers = $$('.tier', w), big = $('.pyr-big', w), txt = $('.pyr-txt', w);
    function sel(t) {
      svg.classList.add('has-sel');
      tiers.forEach((x) => x.classList.toggle('sel', x === t));
      tiers.forEach((x) => x.setAttribute('aria-pressed', String(x === t)));
      $('.pyr-name', w).textContent = t.dataset.n;
      txt.innerHTML = t.dataset.d;
      const target = +t.dataset.p;
      if (reduced) { big.textContent = target + '%'; return; }
      const start = performance.now();
      (function step(now) {
        const k = Math.min(1, (now - start) / 600);
        big.textContent = Math.round(target * (1 - Math.pow(1 - k, 3))) + '%';
        if (k < 1) requestAnimationFrame(step);
      })(start);
    }
    tiers.forEach((t) => {
      t.setAttribute('tabindex', '0'); t.setAttribute('role', 'button'); t.setAttribute('aria-label', `${t.dataset.n}: ${t.dataset.p} percent`);
      t.addEventListener('click', () => sel(t));
      t.addEventListener('mouseenter', () => sel(t));
      t.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sel(t); } });
    });
    onView(w, () => sel(tiers[tiers.length - 1]));
  });

  // ── Flip cards ──
  $$('.flip').forEach((f) => f.addEventListener('click', () => {
    f.classList.toggle('on');
    f.setAttribute('aria-pressed', String(f.classList.contains('on')));
  }));

  // ── ROI calculator ──
  $$('[data-widget="roi"]').forEach((w) => {
    const ins = $$('input[type=range]', w);
    const fmt = (n) => 'RM' + Math.round(n).toLocaleString('en-MY');
    function calc() {
      const v = {};
      ins.forEach((i) => { v[i.name] = +i.value; const o = $(`output[for="${i.id}"]`, w); if (o) o.textContent = i.dataset.fmt === 'rm' ? fmt(+i.value) : i.dataset.fmt === 'pct' ? i.value + '%' : (+i.value).toLocaleString('en-MY'); });
      const units = v.units * (v.contrib / 100) * (v.conf / 100);
      const benefit = units * v.value;
      const roi = ((benefit - v.cost) / v.cost) * 100;
      $('[data-o="units"]', w).textContent = Math.round(units).toLocaleString('en-MY') + ' units';
      $('[data-o="benefit"]', w).textContent = fmt(benefit);
      $('[data-o="roi"]', w).textContent = Math.round(roi) + '%';
      $('.roi', w).classList.toggle('neg', roi < 0);
    }
    const sr = $('.sr-only', w);
    ins.forEach((i) => {
      i.addEventListener('input', calc);
      i.addEventListener('change', () => { sr.textContent = `Benefit ${$('[data-o="benefit"]', w).textContent}, ROI ${$('[data-o="roi"]', w).textContent}.`; });
    });
    calc();
  });

  // ── IoT body analogy ──
  $$('[data-widget="body"]').forEach((w) => {
    const info = JSON.parse($('script[type="application/json"]', w).textContent);
    const svg = $('svg', w), hits = $$('.w-hit', w), panel = $('.w-panel', w);
    function show(j) {
      hits.forEach((h, i) => { h.classList.toggle('on', i === j); h.setAttribute('aria-pressed', String(i === j)); });
      svg.classList.toggle('connect', info[j].key === 'connect');
      panel.innerHTML = `<strong>${info[j].t}</strong><br>${info[j].d}`;
      panel.classList.remove('w-fade'); void panel.offsetWidth; panel.classList.add('w-fade');
    }
    hits.forEach((h, j) => {
      h.setAttribute('tabindex', '0'); h.setAttribute('role', 'button'); h.setAttribute('aria-label', info[j].t);
      const go = () => show(j);
      h.addEventListener('click', go);
      h.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
    show(0);
  });

  // ── Nervous-o-meter (illustrative ECG) ──
  $$('[data-widget="ecg"]').forEach((w) => {
    const svg = $('svg', w);
    const phases = JSON.parse($('script[type="application/json"]', w).textContent);
    const W = 640, H = 170, base = 105, segW = W / phases.length;
    let g = '';
    for (let yy = 20; yy < H - 20; yy += 20) g += `<line class="gridl" x1="0" x2="${W}" y1="${yy}" y2="${yy}"/>`;
    let d = `M0 ${base}`, x = 0;
    phases.forEach((p, i) => {
      const x0 = i * segW, x1 = x0 + segW, beat = segW / p.bpmBeats;
      while (x + beat <= x1 + 0.01) {
        const a = p.amp;
        d += ` L${(x + beat * 0.3).toFixed(1)} ${base} L${(x + beat * 0.38).toFixed(1)} ${base - 8} L${(x + beat * 0.44).toFixed(1)} ${base + 10}` +
             ` L${(x + beat * 0.5).toFixed(1)} ${base - a} L${(x + beat * 0.56).toFixed(1)} ${base + 14} L${(x + beat * 0.64).toFixed(1)} ${base}` +
             ` L${(x + beat * 0.8).toFixed(1)} ${base - 6} L${(x + beat).toFixed(1)} ${base}`;
        x += beat;
      }
      if (i) g += `<line class="sep" x1="${x0}" x2="${x0}" y1="8" y2="${H - 22}"/>`;
      g += `<text class="phase" x="${x0 + segW / 2}" y="${H - 6}">${p.label}</text>`;
    });
    svg.innerHTML = g + `<path class="ecg" d="${d}"/>`;
    const path = $('.ecg', svg);
    if (reduced) return;
    const len = path.getTotalLength();
    path.style.strokeDasharray = len; path.style.strokeDashoffset = len;
    onView(w, () => {
      path.style.transition = 'stroke-dashoffset 5s linear';
      path.style.strokeDashoffset = 0;
    }, 0.5);
  });

  // ── Topic chips: scroll to photo + flash ──
  $$('.chip[href^="#"]').forEach((c) => c.addEventListener('click', (e) => {
    const t = document.getElementById(c.getAttribute('href').slice(1));
    if (!t) return;
    e.preventDefault();
    t.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
    t.classList.remove('flash'); void t.offsetWidth; t.classList.add('flash');
    t.setAttribute('tabindex', '-1');
    t.focus({ preventScroll: true });
    history.replaceState(null, '', c.getAttribute('href'));
  }));

  // ── Confetti burst (award photo) ──
  $$('[data-confetti]').forEach((el) => onView(el, () => {
    if (reduced) return;
    const cv = document.createElement('canvas');
    cv.className = 'confetti';
    document.body.appendChild(cv);
    const ctx = cv.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; ctx.scale(dpr, dpr);
    const r = el.getBoundingClientRect();
    const cols = ['#1d5fc4', '#1f9ad0', '#f2aa3a', '#e24a3b', '#2b4cc9', '#c9611f'];
    const parts = Array.from({ length: 140 }, () => ({
      x: r.left + r.width / 2, y: r.top + r.height * 0.3,
      vx: (Math.random() - 0.5) * 11, vy: -Math.random() * 11 - 3,
      s: 4 + Math.random() * 5, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.3,
      c: cols[(Math.random() * cols.length) | 0],
    }));
    const t0 = performance.now();
    (function frame(now) {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      parts.forEach((p) => {
        p.vy += 0.28; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c;
        ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore();
      });
      if (now - t0 < 3200) requestAnimationFrame(frame); else cv.remove();
    })(t0);
  }, 0.6));

  // ── Lightbox for article photos ──
  const imgs = $$('.blog-article-content figure img');
  if (imgs.length) {
    const lb = document.createElement('div');
    lb.className = 'lb';
    lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-modal', 'true'); lb.setAttribute('aria-label', 'Photo viewer');
    lb.innerHTML = '<img alt=""><p class="lb-cap"></p><button class="lb-x" aria-label="Close">×</button><button class="lb-p" aria-label="Previous photo">‹</button><button class="lb-n" aria-label="Next photo">›</button>';
    document.body.appendChild(lb);
    const big = $('img', lb), cap = $('.lb-cap', lb);
    let cur = 0, lastFocus = null;
    const bg = Array.from(document.body.children).filter((el) => el !== lb && el.tagName !== 'SCRIPT');
    const many = imgs.length > 1;
    $('.lb-p', lb).hidden = !many; $('.lb-n', lb).hidden = !many;
    function open(i) {
      cur = (i + imgs.length) % imgs.length;
      big.src = imgs[cur].src; big.alt = imgs[cur].alt;
      const fc = imgs[cur].closest('figure').querySelector('figcaption');
      cap.innerHTML = fc ? fc.innerHTML : '';
      if (!lb.classList.contains('open')) {
        lastFocus = document.activeElement;
        bg.forEach((el) => { el.inert = true; });
        lb.classList.add('open'); $('.lb-x', lb).focus();
      }
    }
    function close() { lb.classList.remove('open'); bg.forEach((el) => { el.inert = false; }); if (lastFocus) lastFocus.focus(); }
    imgs.forEach((im, i) => {
      im.setAttribute('tabindex', '0'); im.setAttribute('role', 'button');
      im.setAttribute('aria-label', `Enlarge photo: ${im.alt}`);
      im.addEventListener('click', () => open(i));
      im.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(i); } });
    });
    $('.lb-x', lb).addEventListener('click', close);
    $('.lb-p', lb).addEventListener('click', () => open(cur - 1));
    $('.lb-n', lb).addEventListener('click', () => open(cur + 1));
    lb.addEventListener('click', (e) => { if (e.target === lb) close(); });
    document.addEventListener('keydown', (e) => {
      if (!lb.classList.contains('open')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'Tab') {
        const f = $$('button:not([hidden])', lb);
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      if (e.key === 'ArrowLeft' && many) open(cur - 1);
      if (e.key === 'ArrowRight' && many) open(cur + 1);
    });
  }
})();
