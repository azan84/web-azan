/* ============================================================
   ESP32 IoT Simulator — circuit canvas (Tinkercad-style editor)
   Drag parts from the Components panel, click a pin to start a
   wire, click empty space to bend it, click another pin to end.
   ============================================================ */
(function (root) {
  'use strict';

  const M = root.CircuitModel;
  const { TYPES, CATS, LED_COLORS, el } = M;

  const WIRE_COLORS = [
    ['Black', '#1f2937'], ['Red', '#dc2626'], ['Orange', '#f97316'], ['Yellow', '#eab308'], ['Green', '#16a34a'],
    ['Turquoise', '#14b8a6'], ['Blue', '#2563eb'], ['Purple', '#7c3aed'], ['Pink', '#ec4899'], ['Brown', '#92400e'],
    ['Grey', '#9ca3af'], ['White', '#f8fafc'],
  ];

  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (k === 'class') e.className = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (v !== false && v !== null && v !== undefined) e.setAttribute(k, v);
    }
    for (const kid of kids) if (kid !== null && kid !== undefined && kid !== false) e.append(kid);
    return e;
  }
  const uid = (p) => p + Math.random().toString(36).slice(2, 8);
  const snap = (v, s) => Math.round(v / (s || 5)) * (s || 5);

  let S = null;           // app state (parts, wires, board, view)
  let hooks = null;
  let dom = null;
  let world = null, layers = null;
  let solved = null;
  let boardRefs = null;
  const partRefs = {};
  let sel = null;         // { kind: 'part'|'wire'|'board', id }
  let drawing = null;     // { from: end, pts: [[x,y]], cursor: {x,y} }
  let drag = null;
  const undoStack = [], redoStack = [];

  /* ---------------- coordinates ---------------- */
  function toWorld(cx, cy) {
    const r = dom.svg.getBoundingClientRect();
    return { x: (cx - r.left - S.view.x) / S.view.z, y: (cy - r.top - S.view.y) / S.view.z };
  }
  function applyView() {
    world.setAttribute('transform', 'translate(' + S.view.x.toFixed(1) + ' ' + S.view.y.toFixed(1) + ') scale(' + S.view.z.toFixed(4) + ')');
    const g = 20 * S.view.z;
    dom.svg.style.backgroundSize = g + 'px ' + g + 'px';
    dom.svg.style.backgroundPosition = S.view.x + 'px ' + S.view.y + 'px';
  }
  function fit() {
    const r = dom.svg.getBoundingClientRect();
    if (!r.width || !r.height) return;
    let x0 = S.board.x, y0 = S.board.y, x1 = S.board.x + M.BOARD.w, y1 = S.board.y + M.BOARD.h;
    S.parts.forEach((p) => { const b = M.partBox(p); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); });
    S.wires.forEach((w) => w.pts.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }));
    const pad = 40;
    const z = Math.max(0.25, Math.min(1.6, Math.min((r.width - pad * 2) / (x1 - x0), (r.height - pad * 2) / (y1 - y0))));
    S.view.z = z;
    S.view.x = (r.width - (x1 - x0) * z) / 2 - x0 * z;
    S.view.y = (r.height - (y1 - y0) * z) / 2 - y0 * z;
    applyView();
  }
  function zoomAt(cx, cy, factor) {
    const r = dom.svg.getBoundingClientRect();
    const px = cx - r.left, py = cy - r.top;
    const z = Math.max(0.2, Math.min(3, S.view.z * factor));
    S.view.x = px - (px - S.view.x) * (z / S.view.z);
    S.view.y = py - (py - S.view.y) * (z / S.view.z);
    S.view.z = z;
    applyView();
  }

  /* ---------------- undo ---------------- */
  function snapshot() {
    return JSON.stringify({
      parts: S.parts.map((p) => { const c = Object.assign({}, p); delete c.state; return c; }),
      wires: S.wires, board: S.board,
    });
  }
  function pushUndo() {
    undoStack.push(snapshot());
    if (undoStack.length > 80) undoStack.shift();
    redoStack.length = 0;
    hooks.historyChanged && hooks.historyChanged(undoStack.length, redoStack.length);
  }
  function restore(json) {
    const o = JSON.parse(json);
    S.parts.splice(0, S.parts.length, ...o.parts);
    S.wires.splice(0, S.wires.length, ...o.wires);
    Object.assign(S.board, o.board);
    sel = null;
    render();
    hooks.changed('wire');
  }
  function undo() { if (!undoStack.length) return; redoStack.push(snapshot()); restore(undoStack.pop()); hooks.historyChanged && hooks.historyChanged(undoStack.length, redoStack.length); }
  function redo() { if (!redoStack.length) return; undoStack.push(snapshot()); restore(redoStack.pop()); hooks.historyChanged && hooks.historyChanged(undoStack.length, redoStack.length); }
  function clearHistory() { undoStack.length = 0; redoStack.length = 0; hooks.historyChanged && hooks.historyChanged(0, 0); }

  /* ---------------- solve ---------------- */
  function resolve() {
    solved = M.solve(S);
    M.applySolve(S, solved);
    return solved;
  }

  /* ---------------- render ---------------- */
  function endKey(e) { return e.part === 'board' ? 'B:' + e.term : e.part + ':' + e.term; }
  function termLabel(e) {
    if (e.part === 'board') { const t = M.boardTermInfo(e.term, S.board.jumper === '5V' ? 5 : 3.3); return t ? t.label : e.term; }
    const p = S.parts.find((x) => x.id === e.part);
    if (!p) return e.term;
    const t = TYPES[p.type].terms[e.term];
    return p.label + ' · ' + (t ? t.label : e.term);
  }

  function render() {
    resolve();
    layers.board.innerHTML = '';
    layers.parts.innerHTML = '';
    layers.wires.innerHTML = '';
    layers.terms.innerHTML = '';
    layers.ui.innerHTML = '';

    // board
    const bg = el('g', { transform: 'translate(' + S.board.x + ' ' + S.board.y + ')', class: 'board', 'data-board': '1' }, layers.board);
    boardRefs = M.drawBoard(bg, S.board.jumper === '5V' ? 5 : 3.3);
    if (sel && sel.kind === 'board') el('rect', { x: S.board.x - 6, y: S.board.y - 6, width: M.BOARD.w + 12, height: M.BOARD.h + 12, rx: 16, class: 'sel-box' }, layers.ui);

    // parts
    for (const k of Object.keys(partRefs)) delete partRefs[k];
    S.parts.forEach((p) => {
      const t = TYPES[p.type];
      const g = el('g', { class: 'part', 'data-part': p.id, transform: 'translate(' + p.x + ' ' + p.y + ') rotate(' + (p.rot || 0) + ' ' + t.w / 2 + ' ' + t.h / 2 + ')' }, layers.parts);
      el('rect', { x: -4, y: -4, width: t.w + 8, height: t.h + 8, fill: 'transparent' }, g);
      partRefs[p.id] = t.draw(g, p) || {};
      const inf = solved.info[p.id];
      if (inf && inf.issues.length) {
        const b = M.partBox(p);
        const warn = el('g', { class: 'part-badge', transform: 'translate(' + (b.x + b.w - 2) + ' ' + (b.y - 2) + ')' }, layers.ui);
        el('circle', { r: 8, fill: '#f59e0b', stroke: '#fff', 'stroke-width': 1.5 }, warn);
        M.txt(warn, 0, 3.5, '!', { 'font-size': 11, 'font-weight': 700 });
        el('title', {}, warn).textContent = inf.issues.join('\n');
      }
      if (sel && sel.kind === 'part' && sel.id === p.id) {
        const b = M.partBox(p);
        el('rect', { x: b.x - 6, y: b.y - 6, width: b.w + 12, height: b.h + 12, rx: 4, class: 'sel-box' }, layers.ui);
      }
    });

    // wires
    S.wires = S.wires.filter((w) => M.endPos(S, w.a) && M.endPos(S, w.b));
    S.wires.forEach((w) => drawWire(w));

    // terminals (hit targets above everything)
    Object.keys(M.BT).forEach((k) => {
      const t = M.BT[k];
      termEl(S.board.x + t.x, S.board.y + t.y, { part: 'board', term: k });
    });
    S.parts.forEach((p) => Object.keys(TYPES[p.type].terms).forEach((k) => {
      const pos = M.termPos(p, k);
      termEl(pos.x, pos.y, { part: p.id, term: k });
    }));
    if (drawing) drawTemp();
    renderInspector();
  }

  function termEl(x, y, end) {
    const r = el('rect', { x: x - 5.5, y: y - 5.5, width: 11, height: 11, class: 'term', 'data-term': endKey(end) }, layers.terms);
    r._end = end;
    return r;
  }

  function wirePath(pts) { return 'M' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L'); }
  function wirePoints(w) {
    const a = M.endPos(S, w.a), b = M.endPos(S, w.b);
    return [[a.x, a.y]].concat(w.pts, [[b.x, b.y]]);
  }
  function drawWire(w) {
    const pts = wirePoints(w);
    const d = wirePath(pts);
    const g = el('g', { class: 'wire' + (sel && sel.kind === 'wire' && sel.id === w.id ? ' selected' : ''), 'data-wire': w.id }, layers.wires);
    el('path', { d, class: 'wire-hit' }, g);
    el('path', { d, class: 'wire-edge' }, g);
    el('path', { d, class: 'wire-core', stroke: w.color || '#16a34a' }, g);
    [pts[0], pts[pts.length - 1]].forEach(([x, y]) => el('circle', { cx: x, cy: y, r: 3.2, fill: w.color || '#16a34a', stroke: 'rgba(0,0,0,.45)', 'stroke-width': 1 }, g));
    if (sel && sel.kind === 'wire' && sel.id === w.id) {
      w.pts.forEach((p, i) => {
        const c = el('circle', { cx: p[0], cy: p[1], r: 5, class: 'bend', 'data-bend': i, 'data-wire': w.id }, layers.ui);
        c._wire = w;
      });
    }
  }
  function drawTemp() {
    const a = M.endPos(S, drawing.from);
    if (!a) return;
    const pts = [[a.x, a.y]].concat(drawing.pts, [[drawing.cursor.x, drawing.cursor.y]]);
    el('path', { d: wirePath(pts), class: 'wire-temp', stroke: drawing.color }, layers.ui);
    drawing.pts.forEach(([x, y]) => el('circle', { cx: x, cy: y, r: 3, fill: drawing.color }, layers.ui));
  }
  function refreshTemp() {
    layers.ui.querySelectorAll('.wire-temp').forEach((n) => n.remove());
    if (drawing) drawTemp();
  }

  /* ---------------- live visuals ---------------- */
  function update(sim) {
    const run = sim.running;
    if (boardRefs) {
      const v2 = run ? (sim.pinOutput(2) || 0) : 0;
      boardRefs.led2.setAttribute('fill', v2 > 0 ? '#60a5fa' : '#1e3a5f');
      boardRefs.led2glow.setAttribute('opacity', (v2 * 0.9).toFixed(2));
    }
    for (const p of S.parts) {
      const r = partRefs[p.id];
      if (!r) continue;
      switch (p.type) {
        case 'led': {
          let lvl = 0;
          if (run && p.pin !== null) lvl = sim.pinOutput(p.pin) || 0;
          if (run && p.alwaysOn) lvl = 1;
          const col = LED_COLORS[p.color] || LED_COLORS.red;
          r.dome.setAttribute('fill', col);
          r.dome.setAttribute('fill-opacity', (0.5 + 0.5 * lvl).toFixed(2));
          r.glow.setAttribute('fill', col);
          r.glow.setAttribute('opacity', (lvl * 0.9).toFixed(2));
          p._live = lvl <= 0 ? 'off' : lvl >= 1 ? 'on' : Math.round(lvl * 100) + ' % (PWM)';
          break;
        }
        case 'button':
          r.cap.setAttribute('r', p.value ? 11 : 13);
          r.cap.setAttribute('fill', p.value ? '#111827' : '#1f2937');
          p._live = p.value ? 'pressed' : 'released';
          break;
        case 'pot': {
          const a = -135 + (p.value / 4095) * 270;
          r.knob.setAttribute('transform', 'rotate(' + a.toFixed(1) + ' 32 30)');
          p._live = p.pin !== null ? 'analogRead ≈ ' + sim.analogValue(p) : 'wiper not on a GPIO';
          break;
        }
        case 'ldr':
          r.sun.setAttribute('opacity', (0.12 + Math.min(1, p.value / 1000) * 0.75).toFixed(2));
          p._live = p.pin !== null ? 'analogRead ≈ ' + sim.analogValue(p) : 'AO not on a GPIO';
          break;
        case 'rain':
        case 'soil':
          if (r.drops) r.drops.setAttribute('opacity', Math.min(1, p.value / 60).toFixed(2));
          if (r.dirt) r.dirt.setAttribute('fill', p.value > 60 ? '#451a03' : p.value > 30 ? '#713f12' : '#a16207');
          p._live = p.pin !== null ? 'analogRead ≈ ' + sim.analogValue(p) : 'AO not on a GPIO';
          break;
        case 'pir':
          r.ring.setAttribute('opacity', p.value ? 0.9 : 0);
          r.dome.setAttribute('fill', p.value ? '#fee2e2' : '#f8fafc');
          p._live = 'OUT ' + (p.value ? 'HIGH (motion)' : 'LOW');
          break;
        case 'ir':
          r.led.setAttribute('fill', p.value && p.pin !== null ? '#22c55e' : '#374151');
          r.obj.setAttribute('opacity', p.value ? 1 : 0);
          p._live = 'OUT ' + (p.value ? 'LOW (object seen)' : 'HIGH');
          break;
        case 'relay': {
          const on = run && p.pin !== null && (sim.pinOutput(p.pin) || 0) > 0.5;
          r.led.setAttribute('fill', on ? '#ef4444' : '#4b5563');
          r.bulb.setAttribute('fill', on ? '#fde047' : '#334155');
          p._live = on ? 'ON (COM→NO closed)' : 'OFF';
          break;
        }
        case 'buzzer': {
          let freq = 0;
          if (run && p.pin !== null) {
            const tone = sim.toneOn(p.pin);
            freq = tone ? tone.freq : (sim.pinOutput(p.pin) || 0) > 0.5 ? 2300 : 0;
          }
          if (run && p.alwaysOn) freq = 2300;
          const t = performance.now() / 120;
          r.w1.setAttribute('opacity', freq ? (0.5 + 0.5 * Math.sin(t)).toFixed(2) : 0);
          r.w2.setAttribute('opacity', freq ? (0.5 + 0.5 * Math.sin(t + 1.5)).toFixed(2) : 0);
          p._live = freq ? Math.round(freq) + ' Hz' : 'silent';
          hooks.tone(p.id, p.sound && freq ? freq : 0);
          break;
        }
        case 'hcsr04': {
          const d = +p.value;
          const trig = p.pin !== null ? sim.pins[p.pin] : null;
          const pulsing = run && trig && trig.fellAt && performance.now() - trig.fellAt < 150;
          r.wave.setAttribute('opacity', pulsing ? 0.9 : 0);
          p._live = d < 2 || d > 400 ? 'out of range: no echo' : 'echo ' + Math.round(d * 2 / 0.0343) + ' µs';
          break;
        }
        case 'lcd': {
          const l = run && p.pin !== null ? sim.lcdFor(p) : null;
          const on = !!(l && l.on);
          const lit = !!(l && l.light);
          r.scr.setAttribute('fill', lit ? '#4c6ef5' : '#22356f');
          for (let i = 0; i < 2; i++) {
            const s = on ? (l.buf[i] || '').slice(0, 16).padEnd(16, ' ') : '';
            if (r.rows[i].textContent !== s) r.rows[i].textContent = s;
          }
          p._live = l ? (lit ? 'backlight on' : 'backlight off') : run ? 'not initialised' : '—';
          break;
        }
        case 'motor': {
          const m = run ? sim.motorState(p) : { dir: 0, speed: 0, brake: false };
          r.rot = ((r.rot || 0) + m.dir * m.speed * 24) % 360;
          r.fan.setAttribute('transform', 'rotate(' + r.rot.toFixed(1) + ' 160 62)');
          p._live = m.brake ? 'brake' : !m.dir || m.speed <= 0 ? 'stopped' : (m.dir > 0 ? 'forward' : 'reverse') + ' · ' + Math.round(m.speed * 100) + ' %';
          break;
        }
        case 'servo': {
          const a = run && p.pin !== null ? sim.servoAngle(p.pin) : null;
          const ang = a === null ? 90 : a;
          r.horn.setAttribute('transform', 'rotate(' + (90 - ang).toFixed(1) + ' 98 34)');
          p._live = a === null ? 'not attached' : Math.round(a) + '°';
          break;
        }
        case 'dht22':
          p._live = (+p.value.t).toFixed(1) + ' °C · ' + Math.round(p.value.h) + ' %RH';
          break;
        default: break;
      }
    }
    if (inspLive && sel && sel.kind === 'part') {
      const p = S.parts.find((x) => x.id === sel.id);
      if (p && inspLive.textContent !== (p._live || '—')) inspLive.textContent = p._live || '—';
    }
  }

  /* ---------------- inspector ---------------- */
  let inspLive = null;
  function renderInspector() {
    const box = dom.inspector;
    box.innerHTML = '';
    inspLive = null;
    if (!sel) { box.hidden = true; return; }
    box.hidden = false;
    const close = h('button', { class: 'insp-x', type: 'button', 'aria-label': 'Close', onclick: () => { select(null); } }, '×');

    if (sel.kind === 'board') {
      const radios = h('div', { class: 'seg' });
      [['3V3', '3.3V'], ['5V', '5V']].forEach(([v, l]) => {
        radios.append(h('button', { type: 'button', class: S.board.jumper === v ? 'on' : '', onclick: () => { pushUndo(); S.board.jumper = v; render(); hooks.changed('wire'); } }, l));
      });
      box.append(h('div', { class: 'insp-head' }, h('b', null, 'ESP32 DevKit V1 + expansion board'), close),
        h('div', { class: 'insp-row' }, h('span', null, 'V pins (jumper)'), radios),
        h('p', { class: 'insp-note' }, 'Every GPIO has its own S (signal), V and G (GND) pin. The jumper sets the V pins to 3.3 V or 5 V. The 5V / 3.3V block and the I2C header (D22 = SCL, D21 = SDA) are on the right.'),
        h('p', { class: 'insp-note' }, 'GPIO 34, 35, VP (36) and VN (39) are input-only. ADC2 pins stop reading once WiFi is on, so use GPIO 32–39 for analog sensors. Click EN on the DevKit to reset it.'));
      return;
    }
    if (sel.kind === 'wire') {
      const w = S.wires.find((x) => x.id === sel.id);
      if (!w) { box.hidden = true; return; }
      const sw = h('div', { class: 'swatches' });
      WIRE_COLORS.forEach(([n, c]) => sw.append(h('button', { type: 'button', title: n, 'aria-label': n, 'aria-pressed': String(w.color === c), style: 'background:' + c, onclick: () => { setWireColor(c); hooks.wireColor && hooks.wireColor(c); } })));
      box.append(h('div', { class: 'insp-head' }, h('b', null, 'Wire'), close),
        h('div', { class: 'insp-row' }, h('span', null, 'Color'), sw),
        h('p', { class: 'insp-note' }, termLabel(w.a) + '  ↔  ' + termLabel(w.b)),
        h('p', { class: 'insp-note muted' }, 'Drag the white handles to move bends. Delete removes the wire.'),
        h('div', { class: 'insp-actions' }, h('button', { class: 'tc-btn', type: 'button', onclick: removeSelected }, 'Delete wire')));
      return;
    }
    const p = S.parts.find((x) => x.id === sel.id);
    if (!p) { box.hidden = true; return; }
    const t = TYPES[p.type];
    const inf = solved && solved.info[p.id];
    const name = h('input', { type: 'text', value: p.label, 'aria-label': 'Name', maxlength: 16 });
    name.addEventListener('change', () => { p.label = name.value.trim() || p.label; hooks.changed('look'); render(); });
    box.append(h('div', { class: 'insp-head' }, h('b', null, t.name), close));
    box.append(h('div', { class: 'insp-row' }, h('span', null, 'Name'), name));

    if (p.type === 'led') {
      const s = h('select', { 'aria-label': 'Color' }, ...Object.keys(LED_COLORS).map((c) => h('option', { value: c, selected: p.color === c ? '' : null }, c[0].toUpperCase() + c.slice(1))));
      s.addEventListener('change', () => { p.color = s.value; render(); hooks.changed('look'); });
      box.append(h('div', { class: 'insp-row' }, h('span', null, 'Color'), s));
    }
    if (p.type === 'resistor') box.append(h('div', { class: 'insp-row' }, h('span', null, 'Resistance'), h('span', { class: 'mono' }, '220 Ω')));
    if (p.type === 'lcd') {
      const s = h('select', { 'aria-label': 'I2C address' }, ...['0x27', '0x3F'].map((a) => h('option', { value: a, selected: (p.addr || '0x27') === a ? '' : null }, a)));
      s.addEventListener('change', () => { p.addr = s.value; hooks.changed('look'); });
      box.append(h('div', { class: 'insp-row' }, h('span', null, 'I2C address'), s));
    }
    if (p.type === 'buzzer') {
      const cb = h('input', { type: 'checkbox' });
      cb.checked = !!p.sound;
      cb.addEventListener('change', () => { p.sound = cb.checked; if (cb.checked) hooks.audio(); hooks.changed('look'); });
      box.append(h('div', { class: 'insp-row' }, h('span', null, 'Sound'), h('label', { class: 'chk' }, cb, ' play through speakers')));
    }

    // simulation inputs
    const slider = (label, min, max, step, get, set, unit) => {
      const r = h('input', { type: 'range', min, max, step, value: get(), 'aria-label': label });
      const v = h('span', { class: 'mono' }, get() + (unit || ''));
      r.addEventListener('input', () => { set(+r.value); v.textContent = r.value + (unit || ''); hooks.input(); });
      box.append(h('div', { class: 'insp-row col' }, h('div', { class: 'insp-lab' }, h('span', null, label), v), r));
    };
    if (p.type === 'pot') slider('Knob position', 0, 4095, 1, () => p.value, (v) => { p.value = v; });
    if (p.type === 'ldr') slider('Light level', 0, 1000, 1, () => p.value, (v) => { p.value = v; }, ' lux');
    if (p.type === 'dht22') {
      slider('Temperature', -10, 60, 0.5, () => p.value.t, (v) => { p.value.t = v; }, ' °C');
      slider('Humidity', 0, 100, 1, () => p.value.h, (v) => { p.value.h = v; }, ' %');
      box.append(h('p', { class: 'insp-note muted' }, 'DHT11 reports 0–50 °C and 20–90 % in whole steps; DHT22 −40–80 °C, 0–100 %, 0.1 steps (set by DHT11 / DHT22 in the sketch).'));
    }
    if (p.type === 'hcsr04') slider('Object distance', 0, 450, 1, () => p.value, (v) => { p.value = v; }, ' cm');
    if (p.type === 'rain') slider('Rain on the plate', 0, 100, 1, () => p.value, (v) => { p.value = v; }, ' %');
    if (p.type === 'soil') slider('Soil moisture', 0, 100, 1, () => p.value, (v) => { p.value = v; }, ' %');
    if (p.type === 'pir') {
      const b = h('button', { class: 'tc-btn', type: 'button' }, 'Wave a hand (3 s)');
      b.addEventListener('click', () => { triggerPir(p); });
      box.append(h('div', { class: 'insp-row' }, h('span', null, 'Motion'), b));
    }
    if (p.type === 'ir') {
      const cb = h('input', { type: 'checkbox' });
      cb.checked = !!p.value;
      cb.addEventListener('change', () => { p.value = cb.checked ? 1 : 0; hooks.input(); });
      box.append(h('div', { class: 'insp-row' }, h('span', null, 'Obstacle'), h('label', { class: 'chk' }, cb, ' object in front')));
    }
    if (p.type === 'button') box.append(h('p', { class: 'insp-note muted' }, 'Press and hold the button cap on the canvas.'));

    inspLive = h('span', { class: 'mono live' }, p._live || '—');
    box.append(h('div', { class: 'insp-row' }, h('span', null, 'State'), inspLive));

    // connections
    if (inf) {
      const list = h('div', { class: 'conns' });
      Object.keys(t.terms).forEach((k) => {
        list.append(h('div', { class: 'conn' + (inf.conns[k] === 'not connected' ? ' off' : '') }, h('span', null, t.terms[k].label), h('span', { class: 'mono' }, inf.conns[k])));
      });
      box.append(h('div', { class: 'insp-sub' }, 'Connections'), list);
      if (inf.issues.length) box.append(h('div', { class: 'insp-warn' }, ...inf.issues.map((s) => h('div', null, s))));
    }
    box.append(h('div', { class: 'insp-actions' },
      h('button', { class: 'tc-btn', type: 'button', onclick: rotateSelected }, 'Rotate'),
      h('button', { class: 'tc-btn', type: 'button', onclick: removeSelected }, 'Delete')));
  }

  const pirTimers = {};
  function triggerPir(p) {
    p.value = 1; hooks.input();
    clearTimeout(pirTimers[p.id]);
    pirTimers[p.id] = setTimeout(() => { p.value = 0; hooks.input(); }, 3000);
  }

  /* ---------------- selection & edits ---------------- */
  function select(s) {
    sel = s;
    render();
    hooks.selection && hooks.selection(sel);
  }
  function removeSelected() {
    if (!sel) return;
    if (sel.kind === 'part') {
      pushUndo();
      const i = S.parts.findIndex((p) => p.id === sel.id);
      if (i >= 0) { hooks.tone(S.parts[i].id, 0); S.parts.splice(i, 1); }
      S.wires = S.wires.filter((w) => w.a.part !== sel.id && w.b.part !== sel.id);
    } else if (sel.kind === 'wire') {
      pushUndo();
      S.wires = S.wires.filter((w) => w.id !== sel.id);
    } else return;
    sel = null;
    render();
    hooks.changed('wire');
  }
  function rotateSelected() {
    if (!sel || sel.kind !== 'part') return;
    const p = S.parts.find((x) => x.id === sel.id);
    if (!p) return;
    pushUndo();
    p.rot = ((p.rot || 0) + 90) % 360;
    render();
    hooks.changed('move');
  }
  function addPart(type, x, y) {
    const t = TYPES[type];
    pushUndo();
    const p = M.makePart(type, S.parts, snap(x - t.w / 2), snap(y - t.h / 2));
    S.parts.push(p);
    sel = { kind: 'part', id: p.id };
    render();
    hooks.changed('wire');
    return p;
  }
  function addAtCenter(type) {
    const r = dom.svg.getBoundingClientRect();
    const c = toWorld(r.left + r.width / 2, r.top + r.height / 2);
    const jitter = (S.parts.length % 5) * 18;
    return addPart(type, c.x + jitter, c.y - jitter);
  }
  function autoColor(end) {
    if (end.part === 'board') {
      const t = M.boardTermInfo(end.term, 3.3);
      if (t && t.kind === 'gnd') return '#1f2937';
      if (t && t.kind === 'supply') return '#dc2626';
    } else {
      const p = S.parts.find((x) => x.id === end.part);
      const k = end.term;
      if (p && /^(GND|K|N)$/.test(k)) return '#1f2937';
      if (p && /^(VCC)$/.test(k)) return '#dc2626';
    }
    return S.lastWireColor || '#16a34a';
  }
  function setWireColor(c) {
    S.lastWireColor = c;
    if (sel && sel.kind === 'wire') {
      const w = S.wires.find((x) => x.id === sel.id);
      if (w) { pushUndo(); w.color = c; render(); }
    }
    if (drawing) { drawing.color = c; refreshTemp(); }
    hooks.changed('look');
  }

  /* ---------------- pointer handling ---------------- */
  let tipT = null;
  function showTip(e, text) {
    const r = dom.host.getBoundingClientRect();
    dom.tip.textContent = text;
    dom.tip.hidden = false;
    dom.tip.style.left = (e.clientX - r.left + 14) + 'px';
    dom.tip.style.top = (e.clientY - r.top + 14) + 'px';
  }
  function hideTip() { dom.tip.hidden = true; }

  function onDown(e) {
    if (e.button === 1 || e.button === 2) {
      if (drawing) { drawing = null; render(); hooks.hint(null); return; }
      drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: S.view.x, vy: S.view.y, moved: false };
      dom.svg.setPointerCapture(e.pointerId);
      return;
    }
    const tgt = e.target;
    const w = toWorld(e.clientX, e.clientY);

    const act = tgt.closest && tgt.closest('[data-act]');
    if (act && !drawing) {
      const a = act.getAttribute('data-act');
      if (a === 'jumper') { pushUndo(); S.board.jumper = S.board.jumper === '5V' ? '3V3' : '5V'; render(); hooks.changed('wire'); return; }
      if (a === 'reset') { hooks.reset(); return; }
      if (a === 'press') {
        const pg = tgt.closest('[data-part]');
        const p = pg && S.parts.find((x) => x.id === pg.getAttribute('data-part'));
        if (p) {
          e.preventDefault();
          p.value = 1; hooks.input();
          drag = { kind: 'press', part: p };
          dom.svg.setPointerCapture(e.pointerId);
          if (!sel || sel.id !== p.id) { sel = { kind: 'part', id: p.id }; render(); }
          return;
        }
      }
    }

    const term = tgt.classList && tgt.classList.contains('term') ? tgt : null;
    if (term) {
      const end = term._end;
      if (drawing) {
        if (endKey(end) === endKey(drawing.from)) { drawing = null; render(); hooks.hint(null); return; }
        pushUndo();
        const nw = { id: uid('w'), a: drawing.from, b: end, pts: drawing.pts.map(([x, y]) => [snap(x), snap(y)]), color: drawing.color };
        S.wires.push(nw);
        drawing = null;
        sel = { kind: 'wire', id: nw.id };
        hooks.hint(null);
        render();
        hooks.changed('wire');
        return;
      }
      drawing = { from: end, pts: [], cursor: w, color: autoColor(end) };
      sel = null;
      hooks.hint('Click empty space to bend the wire, click a pin to finish it. Esc or right-click cancels.');
      render();
      return;
    }
    if (drawing) {
      drawing.pts.push([snap(w.x), snap(w.y)]);
      refreshTemp();
      return;
    }
    if (tgt.classList && tgt.classList.contains('bend')) {
      const wr = S.wires.find((x) => x.id === tgt.getAttribute('data-wire'));
      if (wr) {
        pushUndo();
        drag = { kind: 'bend', wire: wr, i: +tgt.getAttribute('data-bend'), moved: false };
        dom.svg.setPointerCapture(e.pointerId);
      }
      return;
    }
    const wg = tgt.closest && tgt.closest('[data-wire]');
    if (wg) {
      const wr = S.wires.find((x) => x.id === wg.getAttribute('data-wire'));
      if (wr) {
        // dragging the wire body adds a bend point at the click position
        const already = sel && sel.kind === 'wire' && sel.id === wr.id;
        select({ kind: 'wire', id: wr.id });
        if (already) {
          const pts = wirePoints(wr);
          let best = 0, bd = Infinity;
          for (let i = 0; i < pts.length - 1; i++) {
            const d = segDist(w, pts[i], pts[i + 1]);
            if (d < bd) { bd = d; best = i; }
          }
          pushUndo();
          wr.pts.splice(best, 0, [snap(w.x), snap(w.y)]);
          drag = { kind: 'bend', wire: wr, i: best, moved: false };
          dom.svg.setPointerCapture(e.pointerId);
          render();
        }
      }
      return;
    }
    const pg = tgt.closest && tgt.closest('[data-part]');
    if (pg) {
      const p = S.parts.find((x) => x.id === pg.getAttribute('data-part'));
      if (!p) return;
      if (!sel || sel.id !== p.id) select({ kind: 'part', id: p.id });
      if (p.type === 'pir' && hooks.isRunning()) triggerPir(p);
      if (p.type === 'ir' && hooks.isRunning()) { p.value = p.value ? 0 : 1; hooks.input(); renderInspector(); }
      drag = { kind: 'part', part: p, ox: w.x - p.x, oy: w.y - p.y, moved: false, snap: snapshot() };
      dom.svg.setPointerCapture(e.pointerId);
      return;
    }
    const bg = tgt.closest && tgt.closest('[data-board]');
    if (bg) {
      if (!sel || sel.kind !== 'board') select({ kind: 'board' });
      drag = { kind: 'board', ox: w.x - S.board.x, oy: w.y - S.board.y, moved: false, snap: snapshot() };
      dom.svg.setPointerCapture(e.pointerId);
      return;
    }
    if (sel) select(null);
    drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: S.view.x, vy: S.view.y, moved: false };
    dom.svg.setPointerCapture(e.pointerId);
    dom.svg.classList.add('panning');
  }
  function segDist(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / L));
    const x = a[0] + t * dx, y = a[1] + t * dy;
    return Math.hypot(p.x - x, p.y - y);
  }
  function onMove(e) {
    const w = toWorld(e.clientX, e.clientY);
    if (drawing) { drawing.cursor = w; refreshTemp(); }
    const term = e.target.classList && e.target.classList.contains('term') ? e.target : null;
    if (term && !drag) showTip(e, termLabel(term._end));
    else if (!drag || drag.kind !== 'part') hideTip();
    if (!drag) return;
    if (drag.kind === 'pan') {
      S.view.x = drag.vx + (e.clientX - drag.sx);
      S.view.y = drag.vy + (e.clientY - drag.sy);
      drag.moved = true;
      applyView();
    } else if (drag.kind === 'part') {
      const nx = snap(w.x - drag.ox), ny = snap(w.y - drag.oy);
      if (nx === drag.part.x && ny === drag.part.y) return;
      drag.part.x = nx; drag.part.y = ny; drag.moved = true;
      renderFast();
    } else if (drag.kind === 'board') {
      const nx = snap(w.x - drag.ox), ny = snap(w.y - drag.oy);
      if (nx === S.board.x && ny === S.board.y) return;
      const dx = nx - S.board.x, dy = ny - S.board.y;
      S.board.x = nx; S.board.y = ny; drag.moved = true;
      // bends of wires plugged into the board move with it
      S.wires.forEach((wr) => { if (wr.a.part === 'board' || wr.b.part === 'board') wr.pts = wr.pts.map(([x, y]) => [x + dx, y + dy]); });
      renderFast();
    } else if (drag.kind === 'bend') {
      drag.wire.pts[drag.i] = [snap(w.x), snap(w.y)];
      drag.moved = true;
      renderFast();
    }
  }
  let fastPending = false;
  function renderFast() {
    if (fastPending) return;
    fastPending = true;
    requestAnimationFrame(() => { fastPending = false; render(); });
  }
  function onUp(e) {
    if (!drag) return;
    const d = drag;
    drag = null;
    dom.svg.classList.remove('panning');
    try { dom.svg.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (d.kind === 'press') { d.part.value = 0; hooks.input(); return; }
    if ((d.kind === 'part' || d.kind === 'board') && d.moved) {
      undoStack.push(d.snap); redoStack.length = 0;
      hooks.historyChanged && hooks.historyChanged(undoStack.length, redoStack.length);
      hooks.changed('move');
    }
    if (d.kind === 'bend' && d.moved) hooks.changed('move');
  }

  /* ---------------- components panel ---------------- */
  function thumb(type) {
    const t = TYPES[type];
    const pad = 8;
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', (-pad - (type === 'ir' ? 0 : 0)) + ' ' + (-pad - (type === 'hcsr04' || type === 'ir' ? 10 : 0)) + ' ' + (t.w + pad * 2) + ' ' + (t.h + pad * 2 + (type === 'hcsr04' || type === 'ir' ? 10 : 0)));
    s.setAttribute('aria-hidden', 'true');
    const g = el('g', {}, s);
    t.draw(g, { color: 'red', value: 0 });
    return s;
  }
  function renderPalette() {
    const box = dom.palette;
    box.innerHTML = '';
    const catSel = h('select', { 'aria-label': 'Component category' }, h('option', { value: '' }, 'All'), ...CATS.map((c) => h('option', { value: c }, c)));
    const search = h('input', { type: 'search', placeholder: 'Search', 'aria-label': 'Search components' });
    const grid = h('div', { class: 'pal-grid' });
    const fill = () => {
      grid.innerHTML = '';
      const q = search.value.trim().toLowerCase();
      Object.keys(TYPES).forEach((k) => {
        const t = TYPES[k];
        if (catSel.value && t.cat !== catSel.value) return;
        if (q && !(t.name.toLowerCase().includes(q) || k.includes(q))) return;
        const tile = h('button', { class: 'pal-tile', type: 'button', title: t.name + ' — drag onto the workplane, or click to add', 'data-type': k }, thumb(k), h('span', null, t.short || t.name));
        tile.addEventListener('pointerdown', (e) => startPaletteDrag(e, k));
        grid.append(tile);
      });
      if (!grid.childElementCount) grid.append(h('p', { class: 'muted' }, 'No component matches.'));
    };
    catSel.addEventListener('change', fill);
    search.addEventListener('input', fill);
    const closeBtn = h('button', { class: 'pal-close', type: 'button', 'aria-label': 'Close components', onclick: (e) => { e.stopPropagation(); box.classList.remove('open'); } }, '×');
    box.append(h('div', { class: 'pal-head' }, h('h2', null, 'Components'), catSel, closeBtn), h('div', { class: 'pal-search' }, search), grid);
    fill();
  }
  function startPaletteDrag(e, type) {
    if (e.button !== 0) return;
    const sx = e.clientX, sy = e.clientY;
    let ghost = null;
    const move = (ev) => {
      if (!ghost && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6) {
        ghost = h('div', { class: 'pal-ghost' }, thumb(type));
        document.body.append(ghost);
      }
      if (ghost) { ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px'; }
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (ghost) {
        ghost.remove();
        const r = dom.svg.getBoundingClientRect();
        if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) {
          const w = toWorld(ev.clientX, ev.clientY);
          addPart(type, w.x, w.y);
          hooks.paletteAdded && hooks.paletteAdded();
        }
      } else {
        addAtCenter(type);
        hooks.paletteAdded && hooks.paletteAdded();
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  /* ---------------- keyboard ---------------- */
  function onKey(e) {
    const a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable || (a.closest && a.closest('.CodeMirror, .tc-code, .ac')))) return;
    if (e.key === 'Escape' && drawing) { drawing = null; render(); hooks.hint(null); e.preventDefault(); return; }
    if (e.key === 'Escape' && sel) { select(null); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); removeSelected(); return; }
    if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey && sel && sel.kind === 'part') { e.preventDefault(); rotateSelected(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
  }

  /* ---------------- mount ---------------- */
  function mount(d, getState, h_) {
    dom = d;
    hooks = h_;
    S = getState();
    const svg = dom.svg;
    svg.innerHTML = '';
    const defs = el('defs', {}, svg);
    const f = el('filter', { id: 'ledGlow', x: '-100%', y: '-100%', width: '300%', height: '300%' }, defs);
    el('feGaussianBlur', { stdDeviation: '5' }, f);
    const sg = el('linearGradient', { id: 'shieldGrad', x1: 0, y1: 0, x2: 1, y2: 1 }, defs);
    el('stop', { offset: 0, 'stop-color': '#dfe4e9' }, sg);
    el('stop', { offset: 1, 'stop-color': '#a3adb7' }, sg);
    world = el('g', {}, svg);
    layers = {
      board: el('g', {}, world), parts: el('g', {}, world), wires: el('g', {}, world),
      terms: el('g', {}, world), ui: el('g', {}, world),
    };
    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointercancel', onUp);
    svg.addEventListener('contextmenu', (e) => e.preventDefault());
    svg.addEventListener('pointerleave', hideTip);
    svg.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    window.addEventListener('keydown', onKey);
    renderPalette();
  }
  function load(state) {
    S = state;
    sel = null; drawing = null; drag = null;
    clearHistory();
    render();
    applyView();
  }

  root.CircuitUI = {
    mount, load, render, update, fit, zoomBy: (f) => { const r = dom.svg.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, f); },
    undo, redo, rotateSelected, setWireColor, WIRE_COLORS, removeSelected, resolve, solvedInfo: () => solved, selected: () => sel, h,
    cancelWire: () => { if (drawing) { drawing = null; render(); hooks.hint(null); } },
  };
})(window);
