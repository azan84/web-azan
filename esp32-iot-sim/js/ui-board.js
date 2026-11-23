/* ============================================================
   ESP32 IoT Cloud Simulator — board drawing and parts panel
   ============================================================ */
(function (root) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const { GPIO } = root.ESP32Sim;

  const LEFT = ['EN', 36, 39, 34, 35, 32, 33, 25, 26, 27, 14, 12, 13, 'GND', 'VIN'];
  const RIGHT = [23, 22, 1, 3, 21, 19, 18, 5, 17, 16, 4, 2, 15, 'GND', '3V3'];
  const PIN_LABEL = { 36: 'VP', 39: 'VN', 1: 'TX0', 3: 'RX0', 17: 'TX2', 16: 'RX2' };
  const PIN_Y0 = 70, PIN_DY = 28, LX = 100, RX = 320;

  const TAG_COLORS = ['#e11d48', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#4f46e5'];
  const LED_COLORS = { red: '#ef4444', green: '#22c55e', blue: '#3b82f6', yellow: '#facc15', white: '#f8fafc' };

  const TYPES = {
    led: { name: 'LED', prefix: 'LED', pins: [26, 25, 27, 33, 32, 23, 22, 21, 19, 18, 5] },
    button: { name: 'Push button', prefix: 'BTN', pins: [27, 14, 13, 33, 32, 23, 22, 21, 19] },
    pot: { name: 'Potentiometer', prefix: 'POT', pins: [34, 35, 32, 33, 36, 39] },
    ldr: { name: 'Light sensor (LDR)', prefix: 'LDR', pins: [35, 34, 32, 33, 36, 39] },
    dht22: { name: 'DHT22 sensor', prefix: 'DHT', pins: [4, 15, 16, 17, 23] },
    pir: { name: 'PIR motion sensor', prefix: 'PIR', pins: [14, 13, 27, 33, 32] },
    relay: { name: 'Relay module', prefix: 'RLY', pins: [26, 25, 23, 22, 21] },
    buzzer: { name: 'Buzzer', prefix: 'BZR', pins: [13, 12, 23, 22] },
    servo: { name: 'Servo (SG90)', prefix: 'SRV', pins: [18, 19, 5, 23] },
  };

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== false && attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, attrs[k]);
    }
    for (const kid of kids) if (kid !== null && kid !== undefined) e.append(kid);
    return e;
  }

  function defaultValue(type) {
    switch (type) {
      case 'pot': return 2048;
      case 'ldr': return 300;
      case 'dht22': return { t: 25, h: 60 };
      default: return 0;
    }
  }

  function makePart(type, parts, pin, extra) {
    const t = TYPES[type];
    const used = new Set(parts.map((p) => +p.pin));
    let n = 1;
    while (parts.some((p) => p.label === t.prefix + n)) n++;
    const usedHues = new Set(parts.map((p) => p.hue));
    let hue = TAG_COLORS.find((c) => !usedHues.has(c)) || TAG_COLORS[parts.length % TAG_COLORS.length];
    const p = {
      id: type + '-' + Math.random().toString(36).slice(2, 8),
      type,
      label: t.prefix + n,
      pin: pin !== undefined ? +pin : (t.pins.find((x) => !used.has(x)) ?? t.pins[0]),
      hue,
      value: defaultValue(type),
    };
    if (type === 'led') p.color = 'red';
    if (type === 'buzzer') p.sound = false;
    return Object.assign(p, extra || {});
  }

  function pinPos(pin) {
    let i = LEFT.indexOf(+pin);
    if (i >= 0) return { x: LX, y: PIN_Y0 + i * PIN_DY, side: 'L' };
    i = RIGHT.indexOf(+pin);
    if (i >= 0) return { x: RX, y: PIN_Y0 + i * PIN_DY, side: 'R' };
    return null;
  }

  /* ---------------- board ---------------- */
  const board = { svg: null, pinDots: {}, led2: null, led2glow: null };

  function renderBoard(svg, parts) {
    board.svg = svg;
    svg.innerHTML = '';
    board.pinDots = {};
    const defs = el('defs', {}, svg);
    const glow = el('filter', { id: 'bGlow', x: '-100%', y: '-100%', width: '300%', height: '300%' }, defs);
    el('feGaussianBlur', { stdDeviation: '4' }, glow);
    const shield = el('linearGradient', { id: 'bShield', x1: '0', y1: '0', x2: '1', y2: '1' }, defs);
    el('stop', { offset: '0', 'stop-color': '#d7dde3' }, shield);
    el('stop', { offset: '1', 'stop-color': '#9aa6b2' }, shield);

    // PCB
    el('rect', { x: 80, y: 10, width: 260, height: 500, rx: 14, fill: 'var(--pcb)', stroke: 'var(--pcb-edge)', 'stroke-width': 2 }, svg);
    // mounting holes
    [[96, 26], [324, 26], [96, 494], [324, 494]].forEach(([x, y]) => el('circle', { cx: x, cy: y, r: 6, fill: 'var(--bg)', stroke: '#3b5168', 'stroke-width': 1.5 }, svg));

    // WROOM module
    el('rect', { x: 140, y: 18, width: 140, height: 190, rx: 4, fill: '#1c2a38', stroke: '#33475b' }, svg);
    const ant = 'M150 30 h22 v18 h12 v-18 h12 v18 h12 v-18 h12 v18 h12 v-18 h12 v18 h14';
    el('path', { d: ant, fill: 'none', stroke: '#c9a24a', 'stroke-width': 2.2, 'stroke-linejoin': 'round' }, svg);
    el('rect', { x: 146, y: 64, width: 128, height: 138, rx: 3, fill: 'url(#bShield)' }, svg);
    const t1 = el('text', { x: 210, y: 118, 'text-anchor': 'middle', 'font-family': 'IBM Plex Mono, monospace', 'font-size': 11, 'font-weight': 600, fill: '#33404d' }, svg);
    t1.textContent = 'ESP32-WROOM-32';
    const t2 = el('text', { x: 210, y: 136, 'text-anchor': 'middle', 'font-family': 'IBM Plex Mono, monospace', 'font-size': 9, fill: '#4b5865' }, svg);
    t2.textContent = 'Wi-Fi + BT · 240 MHz';
    const t3 = el('text', { x: 210, y: 152, 'text-anchor': 'middle', 'font-family': 'IBM Plex Mono, monospace', 'font-size': 9, fill: '#4b5865' }, svg);
    t3.textContent = '4 MB flash';

    // small chips
    el('rect', { x: 182, y: 250, width: 56, height: 40, rx: 3, fill: '#0b1218', stroke: '#2b3a49' }, svg);
    const tc = el('text', { x: 210, y: 274, 'text-anchor': 'middle', 'font-family': 'IBM Plex Mono, monospace', 'font-size': 8, fill: '#7f93a7' }, svg);
    tc.textContent = 'CP2102';
    el('rect', { x: 196, y: 320, width: 28, height: 18, rx: 2, fill: '#0b1218', stroke: '#2b3a49' }, svg);

    // buttons
    [[150, 'EN'], [270, 'BOOT']].forEach(([x, lbl]) => {
      el('rect', { x: x - 13, y: 428, width: 26, height: 20, rx: 3, fill: '#c7ced6', stroke: '#7d8a97' }, svg);
      el('circle', { cx: x, cy: 438, r: 6, fill: '#28323c' }, svg);
      const t = el('text', { x, y: 462, 'text-anchor': 'middle', 'font-family': 'IBM Plex Mono, monospace', 'font-size': 9, fill: '#9fb0c2' }, svg);
      t.textContent = lbl;
    });
    // LEDs
    el('rect', { x: 166, y: 396, width: 12, height: 8, rx: 1.5, fill: '#ef4444' }, svg);
    const tp = el('text', { x: 172, y: 418, 'text-anchor': 'middle', 'font-family': 'IBM Plex Mono, monospace', 'font-size': 8, fill: '#9fb0c2' }, svg);
    tp.textContent = 'PWR';
    board.led2glow = el('circle', { cx: 248, cy: 400, r: 12, fill: '#3b82f6', opacity: 0, filter: 'url(#bGlow)' }, svg);
    board.led2 = el('rect', { x: 242, y: 396, width: 12, height: 8, rx: 1.5, fill: '#1e3a5f' }, svg);
    const tl = el('text', { x: 248, y: 418, 'text-anchor': 'middle', 'font-family': 'IBM Plex Mono, monospace', 'font-size': 8, fill: '#9fb0c2' }, svg);
    tl.textContent = 'IO2';

    // USB
    el('rect', { x: 184, y: 478, width: 52, height: 34, rx: 4, fill: '#aeb8c2', stroke: '#6b7886' }, svg);
    el('rect', { x: 194, y: 492, width: 32, height: 8, rx: 2, fill: '#5d6a77' }, svg);

    // headers + labels
    const drawCol = (list, x, side) => {
      el('rect', { x: x - 10, y: PIN_Y0 - 12, width: 20, height: PIN_DY * (list.length - 1) + 24, rx: 3, fill: '#0b1218' }, svg);
      list.forEach((p, i) => {
        const y = PIN_Y0 + i * PIN_DY;
        const name = typeof p === 'number' ? (PIN_LABEL[p] ? PIN_LABEL[p] : 'D' + p) : p;
        const lab = el('text', {
          x: side === 'L' ? x + 16 : x - 16, y: y + 3.5, 'text-anchor': side === 'L' ? 'start' : 'end',
          'font-family': 'IBM Plex Mono, monospace', 'font-size': 10, fill: '#c3d0dc',
        }, svg);
        lab.textContent = name;
        const dot = el('circle', { cx: x, cy: y, r: 5.5, fill: '#c9a24a', stroke: '#8a6d2a', 'stroke-width': 1 }, svg);
        if (typeof p === 'number') {
          const title = el('title', {}, dot);
          const info = GPIO[p] || {};
          title.textContent = 'GPIO ' + p + (info.adc ? ' · ' + info.adc : '') + (info.inputOnly ? ' · input only' : '') + (info.note ? ' · ' + info.note : '');
          board.pinDots[p] = dot;
        }
      });
    };
    drawCol(LEFT, LX, 'L');
    drawCol(RIGHT, RX, 'R');

    // wire tags for connected parts
    const byPin = {};
    parts.forEach((p) => { (byPin[p.pin] = byPin[p.pin] || []).push(p); });
    Object.keys(byPin).forEach((pin) => {
      const pos = pinPos(pin);
      if (!pos) return;
      const list = byPin[pin];
      const label = list.map((p) => p.label).join('+');
      const w = label.length * 6.6 + 12;
      const hue = list[0].hue;
      if (pos.side === 'L') {
        el('line', { x1: pos.x - 6, y1: pos.y, x2: 74, y2: pos.y, stroke: hue, 'stroke-width': 2.5, 'stroke-linecap': 'round' }, svg);
        el('rect', { x: 72 - w, y: pos.y - 9, width: w, height: 18, rx: 5, fill: hue }, svg);
        const t = el('text', { x: 72 - w / 2, y: pos.y + 4, 'text-anchor': 'middle', 'font-family': 'IBM Plex Mono, monospace', 'font-size': 10.5, 'font-weight': 600, fill: '#fff' }, svg);
        t.textContent = label;
      } else {
        el('line', { x1: pos.x + 6, y1: pos.y, x2: 346, y2: pos.y, stroke: hue, 'stroke-width': 2.5, 'stroke-linecap': 'round' }, svg);
        el('rect', { x: 348, y: pos.y - 9, width: w, height: 18, rx: 5, fill: hue }, svg);
        const t = el('text', { x: 348 + w / 2, y: pos.y + 4, 'text-anchor': 'middle', 'font-family': 'IBM Plex Mono, monospace', 'font-size': 10.5, 'font-weight': 600, fill: '#fff' }, svg);
        t.textContent = label;
      }
      const dot = board.pinDots[pin];
      if (dot) { dot.setAttribute('stroke', hue); dot.setAttribute('stroke-width', 2.5); }
    });
    // widen viewBox when tags need more room
    let minX = 0, maxX = 420;
    Object.keys(byPin).forEach((pin) => {
      const pos = pinPos(pin);
      if (!pos) return;
      const w = byPin[pin].map((p) => p.label).join('+').length * 6.6 + 12;
      if (pos.side === 'L') minX = Math.min(minX, 72 - w - 4);
      else maxX = Math.max(maxX, 348 + w + 4);
    });
    svg.setAttribute('viewBox', minX + ' 0 ' + (maxX - minX) + ' 520');
  }

  function updateBoard(sim) {
    for (const k in board.pinDots) {
      const dot = board.pinDots[k];
      const lvl = sim.running ? sim.pinOutput(+k) : null;
      const isTone = sim.running && sim.toneOn(+k);
      if (lvl === null && !isTone) { dot.setAttribute('fill', '#c9a24a'); continue; }
      const v = isTone ? 1 : lvl;
      dot.setAttribute('fill', v > 0 ? 'rgb(255,' + Math.round(140 + 80 * v) + ',' + Math.round(40 * (1 - v)) + ')' : '#5b6773');
    }
    const l2 = sim.running ? sim.pinOutput(2) : null;
    const v2 = l2 || 0;
    board.led2.setAttribute('fill', v2 > 0 ? '#60a5fa' : '#1e3a5f');
    board.led2glow.setAttribute('opacity', (v2 * 0.9).toFixed(2));
  }

  /* ---------------- parts panel ---------------- */
  function pinOptions(sel) {
    const pins = Object.keys(GPIO).map(Number).sort((a, b) => a - b);
    return pins.map((p) => {
      const info = GPIO[p];
      let s = 'GPIO ' + p;
      if (info.inputOnly) s += ' · in only';
      else if (info.adc) s += ' · ' + info.adc;
      if (p === 1 || p === 3) s += ' · Serial';
      const o = h('option', { value: p }, s);
      if (+sel === p) o.selected = true;
      return o;
    });
  }

  function staticWarnings(part, parts) {
    const w = [];
    const info = GPIO[part.pin] || {};
    const outTypes = ['led', 'relay', 'buzzer', 'servo'];
    if (outTypes.includes(part.type) && info.inputOnly) w.push('GPIO ' + part.pin + ' is input-only, so it cannot drive this ' + TYPES[part.type].name.toLowerCase() + '.');
    if ((part.type === 'pot' || part.type === 'ldr') && !info.adc) w.push('GPIO ' + part.pin + ' has no ADC, so analogRead() returns 0.');
    if ((part.type === 'pot' || part.type === 'ldr') && info.adc === 'ADC2') w.push('ADC2 pin: it reads 0 once WiFi is connected. Use GPIO 32–39.');
    if (part.type === 'button' && info.inputOnly) w.push('GPIO ' + part.pin + ' has no internal pull-up, so the button will float.');
    if (part.pin === 1 || part.pin === 3) w.push('GPIO ' + part.pin + ' is the USB serial line, which clashes with the Serial Monitor.');
    if ([0, 2, 12, 15].includes(+part.pin) && ['button', 'pir'].includes(part.type)) w.push('Strapping pin: holding it at boot can stop the ESP32 from starting.');
    const others = parts.filter((p) => p !== part && +p.pin === +part.pin);
    if (others.length) w.push('Shares GPIO ' + part.pin + ' with ' + others.map((o) => o.label).join(', ') + '.');
    return w;
  }

  function vis(type) {
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 64 64');
    s.setAttribute('class', 'vis');
    s.setAttribute('aria-hidden', 'true');
    const refs = {};
    switch (type) {
      case 'led':
        el('line', { x1: 26, y1: 44, x2: 26, y2: 62, stroke: '#9aa6b2', 'stroke-width': 2 }, s);
        el('line', { x1: 38, y1: 44, x2: 38, y2: 58, stroke: '#9aa6b2', 'stroke-width': 2 }, s);
        refs.glow = el('circle', { cx: 32, cy: 26, r: 22, fill: '#ef4444', opacity: 0 }, s);
        refs.glow.style.filter = 'blur(6px)';
        refs.dome = el('path', { d: 'M18 44 V24 a14 14 0 0 1 28 0 V44 Z', fill: '#ef4444', 'fill-opacity': 0.35, stroke: 'rgba(0,0,0,.25)' }, s);
        el('rect', { x: 15, y: 42, width: 34, height: 5, rx: 2, fill: 'rgba(0,0,0,.18)' }, s);
        break;
      case 'button':
        el('rect', { x: 8, y: 8, width: 48, height: 48, rx: 6, fill: '#2a3440', stroke: '#11181f' }, s);
        [[12, 12], [52, 12], [12, 52], [52, 52]].forEach(([x, y]) => el('circle', { cx: x, cy: y, r: 2, fill: '#6b7886' }, s));
        refs.cap = el('circle', { cx: 32, cy: 32, r: 14, fill: '#e11d48', stroke: '#7f1d1d', 'stroke-width': 2 }, s);
        break;
      case 'pot':
        el('rect', { x: 8, y: 14, width: 48, height: 42, rx: 6, fill: '#1d4ed8', opacity: 0.85 }, s);
        el('circle', { cx: 32, cy: 34, r: 16, fill: '#dfe5ea', stroke: '#7d8a97' }, s);
        refs.knob = el('line', { x1: 32, y1: 34, x2: 32, y2: 21, stroke: '#1f2937', 'stroke-width': 3, 'stroke-linecap': 'round' }, s);
        break;
      case 'ldr':
        refs.sun = el('circle', { cx: 32, cy: 32, r: 24, fill: '#facc15', opacity: 0.2 }, s);
        el('circle', { cx: 32, cy: 32, r: 15, fill: '#f5f0e1', stroke: '#b7a77a' }, s);
        el('path', { d: 'M22 28 h6 v8 h4 v-8 h4 v8 h4 v-8 h3', fill: 'none', stroke: '#b45309', 'stroke-width': 2 }, s);
        break;
      case 'dht22':
        el('rect', { x: 14, y: 4, width: 36, height: 48, rx: 4, fill: '#e8f1fb', stroke: '#7aa0c8' }, s);
        for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) el('rect', { x: 19 + c * 7.5, y: 9 + r * 8, width: 4.5, height: 5, rx: 1, fill: '#7aa0c8' }, s);
        [22, 28, 34, 40].forEach((x) => el('line', { x1: x + 1, y1: 52, x2: x + 1, y2: 62, stroke: '#9aa6b2', 'stroke-width': 2 }, s));
        break;
      case 'pir':
        el('rect', { x: 8, y: 36, width: 48, height: 20, rx: 3, fill: '#15803d' }, s);
        refs.dome = el('path', { d: 'M12 38 a20 20 0 0 1 40 0 Z', fill: '#f8fafc', stroke: '#cbd5e1' }, s);
        refs.ring = el('circle', { cx: 32, cy: 26, r: 26, fill: 'none', stroke: '#ef4444', 'stroke-width': 2, opacity: 0 }, s);
        break;
      case 'relay':
        el('rect', { x: 6, y: 10, width: 52, height: 44, rx: 4, fill: '#1e40af' }, s);
        el('rect', { x: 12, y: 16, width: 30, height: 32, rx: 2, fill: '#2563eb', stroke: '#1e3a8a' }, s);
        const tt = el('text', { x: 27, y: 35, 'text-anchor': 'middle', 'font-size': 7, 'font-family': 'IBM Plex Mono, monospace', fill: '#dbeafe' }, s);
        tt.textContent = 'SRD-5V';
        refs.led = el('circle', { cx: 50, cy: 20, r: 3.5, fill: '#4b5563' }, s);
        refs.bulb = el('circle', { cx: 50, cy: 42, r: 6, fill: '#334155', stroke: '#94a3b8' }, s);
        break;
      case 'buzzer':
        el('circle', { cx: 30, cy: 34, r: 20, fill: '#111827', stroke: '#374151' }, s);
        el('circle', { cx: 30, cy: 34, r: 4, fill: '#374151' }, s);
        refs.w1 = el('path', { d: 'M52 24 q6 10 0 20', fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2.5, 'stroke-linecap': 'round', opacity: 0 }, s);
        refs.w2 = el('path', { d: 'M57 18 q9 16 0 32', fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2.5, 'stroke-linecap': 'round', opacity: 0 }, s);
        break;
      case 'servo':
        el('rect', { x: 8, y: 20, width: 48, height: 30, rx: 3, fill: '#1d4ed8' }, s);
        el('circle', { cx: 22, cy: 35, r: 9, fill: '#e5e7eb' }, s);
        refs.horn = el('g', {}, s);
        el('path', { d: 'M22 35 L22 10', stroke: '#f8fafc', 'stroke-width': 6, 'stroke-linecap': 'round' }, refs.horn);
        el('circle', { cx: 22, cy: 35, r: 3, fill: '#6b7280' }, s);
        break;
      default:
        break;
    }
    return { svg: s, refs };
  }

  function renderParts(container, parts, api) {
    container.innerHTML = '';
    const cards = {};
    parts.forEach((part) => {
      const t = TYPES[part.type];
      if (!t) return;
      const pinSel = h('select', { 'aria-label': part.label + ' pin', title: 'GPIO pin this part is wired to' }, ...pinOptions(part.pin));
      pinSel.addEventListener('change', () => { part.pin = +pinSel.value; api.changed(true); });
      const head = h('div', { class: 'part-head' },
        h('span', { class: 'part-tag', style: 'background:' + part.hue }, part.label),
        h('span', { class: 'part-name' }, t.name),
        pinSel,
        h('button', { class: 'part-x', type: 'button', 'aria-label': 'Remove ' + part.label, title: 'Remove', onclick: () => api.remove(part) }, '×'),
      );
      const v = vis(part.type);
      const ctrl = h('div', { class: 'part-ctrl' });
      const refs = v.refs;

      if (part.type === 'led') {
        const sw = h('div', { class: 'colors', role: 'group', 'aria-label': 'LED colour' });
        Object.keys(LED_COLORS).forEach((c) => {
          const b = h('button', { type: 'button', style: 'background:' + LED_COLORS[c], 'aria-label': c, 'aria-pressed': String(part.color === c), title: c });
          b.addEventListener('click', () => { part.color = c; api.changed(false); api.rerender(); });
          sw.append(b);
        });
        refs.state = h('span', { class: 'val' }, 'off');
        ctrl.append(h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Anode → GPIO, 220 Ω to GND'), ), h('div', { class: 'row' }, sw, refs.state));
      } else if (part.type === 'button') {
        const b = h('button', { class: 'press', type: 'button', 'aria-pressed': 'false' }, 'Hold to press');
        const down = (e) => { e.preventDefault(); part.value = 1; b.setAttribute('aria-pressed', 'true'); api.input(); };
        const up = () => { if (!part.value) return; part.value = 0; b.setAttribute('aria-pressed', 'false'); api.input(); };
        b.addEventListener('pointerdown', down);
        b.addEventListener('pointerup', up);
        b.addEventListener('pointerleave', up);
        b.addEventListener('pointercancel', up);
        b.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) down(e); });
        b.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') up(); });
        refs.state = h('span', { class: 'val' }, 'HIGH');
        ctrl.append(b, h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Other leg to GND · reads'), refs.state));
      } else if (part.type === 'pot' || part.type === 'ldr') {
        const isPot = part.type === 'pot';
        const r = h('input', { type: 'range', min: 0, max: isPot ? 4095 : 1000, step: 1, value: part.value, 'aria-label': part.label + (isPot ? ' position' : ' light level') });
        refs.num = h('span', { class: 'val' });
        refs.adc = h('span', { class: 'val' });
        r.addEventListener('input', () => { part.value = +r.value; api.input(); });
        ctrl.append(h('div', { class: 'row' }, h('span', { class: 'muted' }, isPot ? 'Wiper' : 'Light'), refs.num), r, h('div', { class: 'row' }, h('span', { class: 'muted' }, 'analogRead ≈'), refs.adc));
      } else if (part.type === 'dht22') {
        const rt = h('input', { type: 'range', min: -10, max: 60, step: 0.5, value: part.value.t, 'aria-label': part.label + ' temperature' });
        const rh = h('input', { type: 'range', min: 0, max: 100, step: 1, value: part.value.h, 'aria-label': part.label + ' humidity' });
        refs.t = h('span', { class: 'val' });
        refs.h = h('span', { class: 'val' });
        rt.addEventListener('input', () => { part.value.t = +rt.value; api.input(); });
        rh.addEventListener('input', () => { part.value.h = +rh.value; api.input(); });
        ctrl.append(h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Temperature'), refs.t), rt, h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Humidity'), refs.h), rh);
      } else if (part.type === 'pir') {
        const b = h('button', { class: 'press', type: 'button', 'aria-pressed': 'false' }, 'Wave a hand');
        let timer = null;
        b.addEventListener('click', () => {
          part.value = 1; api.input();
          clearTimeout(timer);
          timer = setTimeout(() => { part.value = 0; api.input(); }, 3000);
        });
        refs.btn = b;
        refs.state = h('span', { class: 'val' }, 'LOW');
        ctrl.append(b, h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Output holds HIGH for 3 s'), refs.state));
      } else if (part.type === 'relay') {
        refs.state = h('span', { class: 'val' }, 'OFF');
        ctrl.append(h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Coil (IN) · lamp on NO contact'), refs.state));
      } else if (part.type === 'buzzer') {
        const lab = h('label', { class: 'mini-check' });
        const cb = h('input', { type: 'checkbox' });
        cb.checked = !!part.sound;
        cb.addEventListener('change', () => { part.sound = cb.checked; api.changed(false); if (cb.checked) api.audio(); });
        lab.append(cb, ' Play sound');
        refs.state = h('span', { class: 'val' }, 'silent');
        ctrl.append(h('div', { class: 'row' }, lab, refs.state), h('span', { class: 'muted' }, 'Uses tone() or a plain HIGH'));
      } else if (part.type === 'servo') {
        refs.state = h('span', { class: 'val' }, '—');
        ctrl.append(h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Angle'), refs.state), h('span', { class: 'muted' }, 'Signal → GPIO, 5 V supply'));
      }

      const body = h('div', { class: 'part-body' }, v.svg, ctrl);
      const card = h('div', { class: 'part', 'data-id': part.id }, head, body);
      const warns = staticWarnings(part, parts);
      if (warns.length) card.append(h('div', { class: 'part-warn' }, '⚠ ' + warns.join(' ')));
      container.append(card);
      cards[part.id] = refs;
    });
    return cards;
  }

  /* ---------------- live part visuals ---------------- */
  let audioCtx = null;
  const oscs = {};
  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }
  function setTone(id, freq) {
    if (!audioCtx) return;
    let o = oscs[id];
    if (freq && !o) {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = 'square';
      g.gain.value = 0.03;
      osc.connect(g).connect(audioCtx.destination);
      osc.start();
      o = oscs[id] = { osc, g };
    }
    if (o && freq) o.osc.frequency.setTargetAtTime(freq, audioCtx.currentTime, 0.005);
    if (o && !freq) { o.osc.stop(); o.osc.disconnect(); delete oscs[id]; }
  }

  function updateParts(sim, parts, cards) {
    for (const part of parts) {
      const r = cards[part.id];
      if (!r) continue;
      const run = sim.running;
      switch (part.type) {
        case 'led': {
          const lvl = run ? (sim.pinOutput(part.pin) || 0) : 0;
          const col = LED_COLORS[part.color] || LED_COLORS.red;
          r.dome.setAttribute('fill', col);
          r.dome.setAttribute('fill-opacity', (0.3 + 0.7 * lvl).toFixed(2));
          r.glow.setAttribute('fill', col);
          r.glow.setAttribute('opacity', (lvl * 0.85).toFixed(2));
          r.state.textContent = lvl <= 0 ? 'off' : lvl >= 1 ? 'on' : Math.round(lvl * 100) + ' %';
          break;
        }
        case 'button': {
          r.cap.setAttribute('r', part.value ? 12 : 14);
          r.cap.setAttribute('fill', part.value ? '#9f1239' : '#e11d48');
          const pm = sim.pins[part.pin];
          r.state.textContent = run && pm && pm.mode !== null ? (sim.inputLevel(part.pin) ? 'HIGH' : 'LOW') : (part.value ? 'pressed' : 'released');
          break;
        }
        case 'pot': {
          const a = -135 + (part.value / 4095) * 270;
          r.knob.setAttribute('transform', 'rotate(' + a.toFixed(1) + ' 32 34)');
          r.num.textContent = Math.round(part.value / 40.95) + ' %';
          r.adc.textContent = String(sim.analogValue(part));
          break;
        }
        case 'ldr': {
          r.sun.setAttribute('opacity', (0.12 + Math.min(1, part.value / 1000) * 0.75).toFixed(2));
          r.num.textContent = part.value + ' lux';
          r.adc.textContent = String(sim.analogValue(part));
          break;
        }
        case 'dht22':
          r.t.textContent = (+part.value.t).toFixed(1) + ' °C';
          r.h.textContent = Math.round(part.value.h) + ' %';
          break;
        case 'pir':
          r.ring.setAttribute('opacity', part.value ? 0.9 : 0);
          r.dome.setAttribute('fill', part.value ? '#fee2e2' : '#f8fafc');
          r.btn.setAttribute('aria-pressed', String(!!part.value));
          r.state.textContent = part.value ? 'HIGH' : 'LOW';
          break;
        case 'relay': {
          const on = run && (sim.pinOutput(part.pin) || 0) > 0.5;
          r.led.setAttribute('fill', on ? '#ef4444' : '#4b5563');
          r.bulb.setAttribute('fill', on ? '#fde047' : '#334155');
          r.state.textContent = on ? 'ON' : 'OFF';
          break;
        }
        case 'buzzer': {
          const tone = run ? sim.toneOn(part.pin) : null;
          const high = run && (sim.pinOutput(part.pin) || 0) > 0.5;
          const freq = tone ? tone.freq : high ? 2300 : 0;
          const t = performance.now() / 120;
          r.w1.setAttribute('opacity', freq ? (0.5 + 0.5 * Math.sin(t)).toFixed(2) : 0);
          r.w2.setAttribute('opacity', freq ? (0.5 + 0.5 * Math.sin(t + 1.5)).toFixed(2) : 0);
          r.state.textContent = freq ? Math.round(freq) + ' Hz' : 'silent';
          setTone(part.id, part.sound && freq ? freq : 0);
          break;
        }
        case 'servo': {
          const a = run ? sim.servoAngle(part.pin) : null;
          const ang = a === null ? 90 : a;
          r.horn.setAttribute('transform', 'rotate(' + (ang - 90).toFixed(1) + ' 22 35)');
          r.state.textContent = a === null ? 'not attached' : Math.round(a) + '°';
          break;
        }
        default: break;
      }
    }
    // stop sounds of removed buzzers
    for (const id of Object.keys(oscs)) if (!parts.some((p) => p.id === id)) setTone(id, 0);
  }
  function silenceAll() { for (const id of Object.keys(oscs)) setTone(id, 0); }

  root.BoardUI = { TYPES, makePart, renderBoard, updateBoard, renderParts, updateParts, ensureAudio, silenceAll, h };
})(window);
