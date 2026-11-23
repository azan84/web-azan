/* ============================================================
   ESP32 IoT Simulator — board, components and wiring model
   The ESP32-WROOM-32 DevKit V1 (30 pins) sits in a GVS
   expansion board. Every GPIO on the expansion board has its
   own G (GND), V (selected by the jumper) and S (signal) pin.
   Wires join terminals into nets; the nets decide which GPIO
   each component is on, and whether it has power.
   ============================================================ */
(function (root) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const { GPIO } = root.ESP32Sim;

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function txt(parent, x, y, s, attrs) {
    const t = el('text', Object.assign({ x, y, 'font-family': 'Arial, Helvetica, sans-serif', 'font-size': 7, fill: '#fff', 'text-anchor': 'middle' }, attrs || {}), parent);
    t.textContent = s;
    return t;
  }

  /* ================================================================
     Expansion board + DevKit geometry (board-local units)
     ================================================================ */
  const BOARD = { w: 660, h: 440 };
  const P = 22;                      // header pitch
  const TOP = [23, 22, 1, 3, 21, 19, 18, 5, 17, 16, 4, 2, 15];
  const BOT = ['EN', 36, 39, 34, 35, 32, 33, 25, 26, 27, 14, 12, 13];
  const NAME = { 1: 'TX0', 3: 'RX0', 17: 'TX2', 16: 'RX2', 36: 'VP', 39: 'VN', EN: 'EN' };
  const colName = (c) => NAME[c] || 'D' + c;
  const HX0 = 64;                    // x of the first header column
  const TOPY = { S: 46, V: 68, G: 90 };
  const BOTY = { G: 350, V: 372, S: 394 };

  // terminal list: key -> { x, y, kind, gpio?, v?, label }
  const BT = {};
  TOP.forEach((c, i) => {
    const x = HX0 + i * P;
    BT['S' + c] = { x, y: TOPY.S, kind: 'gpio', gpio: c, label: colName(c) + ' · S (GPIO ' + c + ')' };
    BT['V' + c] = { x, y: TOPY.V, kind: 'vrail', label: colName(c) + ' · V' };
    BT['G' + c] = { x, y: TOPY.G, kind: 'gnd', label: colName(c) + ' · G (GND)' };
  });
  BOT.forEach((c, i) => {
    const x = HX0 + i * P;
    BT['S' + c] = c === 'EN'
      ? { x, y: BOTY.S, kind: 'en', label: 'EN · S (reset)' }
      : { x, y: BOTY.S, kind: 'gpio', gpio: c, label: colName(c) + ' · S (GPIO ' + c + ')' };
    BT['V' + c] = { x, y: BOTY.V, kind: 'vrail', label: colName(c) + ' · V' };
    BT['G' + c] = { x, y: BOTY.G, kind: 'gnd', label: colName(c) + ' · G (GND)' };
  });
  // I2C extension header (2 rows, joined)
  const I2C = [['SCL', 22, 'gpio'], ['SDA', 21, 'gpio'], ['VCC', null, 'vrail'], ['GND', null, 'gnd']];
  I2C.forEach(([n, g, kind], j) => {
    [0, 1].forEach((r) => {
      BT['I2C_' + n + (r + 1)] = { x: 386 + j * P, y: 58 + r * P, kind, gpio: g || undefined, label: 'I2C ' + n + (g ? ' (GPIO ' + g + ')' : kind === 'gnd' ? ' (GND)' : '') };
    });
  });
  // 5 V / 3.3 V power block
  [['5V', 5], ['3V3', 3.3]].forEach(([n, v], j) => {
    [0, 1].forEach((r) => { BT['PWR_' + n + '_' + (r + 1)] = { x: 386 + j * P, y: BOTY.G + r * P, kind: 'supply', v, label: (v === 5 ? '5V' : '3.3V') + ' power pin' }; });
    BT['PWR_GND_' + (j + 1)] = { x: 386 + j * P, y: BOTY.S, kind: 'gnd', label: 'GND power pin' };
  });

  function boardTermInfo(key, jumperV) {
    const t = BT[key];
    if (!t) return null;
    const r = Object.assign({}, t);
    if (t.kind === 'vrail') { r.kind = 'supply'; r.v = jumperV; r.label = t.label + ' (' + (jumperV === 5 ? '5V' : '3.3V') + ', set by jumper)'; }
    return r;
  }

  function drawBoard(g, jumperV) {
    const refs = {};
    // expansion board PCB
    el('rect', { x: 0, y: 0, width: BOARD.w, height: BOARD.h, rx: 14, fill: '#1b1d22', stroke: '#0c0d10', 'stroke-width': 2 }, g);
    el('rect', { x: 6, y: 6, width: BOARD.w - 12, height: BOARD.h - 12, rx: 10, fill: 'none', stroke: '#2d3038', 'stroke-width': 1 }, g);
    [[18, 18], [BOARD.w - 18, 18], [18, BOARD.h - 18], [BOARD.w - 18, BOARD.h - 18]].forEach(([x, y]) => {
      el('circle', { cx: x, cy: y, r: 8, fill: '#e9ecef', stroke: '#9aa0a6', 'stroke-width': 1.5 }, g);
      el('circle', { cx: x, cy: y, r: 4.5, fill: '#f4f5f7' }, g);
    });
    // header blocks
    const block = (x, y, w, h) => el('rect', { x, y, width: w, height: h, rx: 2, fill: '#101114' }, g);
    block(HX0 - 10, TOPY.S - 10, P * 12 + 20, TOPY.G - TOPY.S + 20);
    block(HX0 - 10, BOTY.G - 10, P * 12 + 20, BOTY.S - BOTY.G + 20);
    block(376, 48, P * 3 + 20, P + 20);
    block(376, BOTY.G - 10, P + 20, BOTY.S - BOTY.G + 20);
    // row letters
    [['S', TOPY.S], ['V', TOPY.V], ['G', TOPY.G], ['G', BOTY.G], ['V', BOTY.V], ['S', BOTY.S]].forEach(([s, y]) => {
      el('rect', { x: 26, y: y - 7, width: 14, height: 14, fill: 'none', stroke: '#e6e6e6', 'stroke-width': 1 }, g);
      txt(g, 33, y + 3.5, s, { 'font-size': 9, 'font-weight': 700, fill: '#f0f0f0' });
    });
    // column labels
    TOP.forEach((c, i) => txt(g, HX0 + i * P, 28, colName(c), { 'font-size': 7.5, 'font-weight': 700, fill: '#f0f0f0' }));
    BOT.forEach((c, i) => txt(g, HX0 + i * P, 418, colName(c), { 'font-size': 7.5, 'font-weight': 700, fill: '#f0f0f0' }));
    ['D22', 'D21', 'VCC', 'GND'].forEach((s, j) => txt(g, 386 + j * P, 42, s, { 'font-size': 7, 'font-weight': 700, fill: '#f0f0f0' }));
    ['SCL', 'SDA'].forEach((s, j) => txt(g, 386 + j * P, 112, s, { 'font-size': 7, 'font-weight': 700, fill: '#f0f0f0' }));
    ['5V', '3.3V'].forEach((s, j) => txt(g, 386 + j * P, BOTY.G - 15, s, { 'font-size': 7, 'font-weight': 700, fill: '#f0f0f0' }));
    txt(g, 397, 418, 'GND', { 'font-size': 7, 'font-weight': 700, fill: '#f0f0f0' });

    // DC jack
    el('rect', { x: 540, y: 16, width: 92, height: 82, rx: 6, fill: '#0b0b0d', stroke: '#2a2a2e' }, g);
    el('circle', { cx: 586, cy: 57, r: 20, fill: '#161618', stroke: '#3a3a3e', 'stroke-width': 2 }, g);
    el('circle', { cx: 586, cy: 57, r: 5, fill: '#bbb' }, g);
    txt(g, 586, 110, 'DC 6.5V-16V', { 'font-size': 8, 'font-weight': 700, fill: '#f0f0f0' });
    // capacitors
    [[478, 72], [508, 54]].forEach(([x, y]) => {
      el('circle', { cx: x, cy: y, r: 13, fill: '#c9ccd1', stroke: '#8a8f96' }, g);
      el('path', { d: 'M' + (x - 9) + ' ' + (y - 9) + ' A13 13 0 0 1 ' + (x + 9) + ' ' + (y - 9), fill: 'none', stroke: '#3b3f46', 'stroke-width': 4 }, g);
    });
    // USB-C + PWR LED
    el('rect', { x: 620, y: 290, width: 40, height: 46, rx: 6, fill: '#b9bec5', stroke: '#7d838b' }, g);
    el('rect', { x: 628, y: 302, width: 28, height: 22, rx: 8, fill: '#4b5058' }, g);
    txt(g, 600, 350, 'USB 5V', { 'font-size': 7.5, 'font-weight': 700, fill: '#f0f0f0' });
    refs.pwr = el('rect', { x: 584, y: 388, width: 12, height: 7, rx: 1.5, fill: '#ff3b30' }, g);
    el('circle', { cx: 590, cy: 391.5, r: 9, fill: '#ff3b30', opacity: 0.35, filter: 'url(#ledGlow)' }, g);
    txt(g, 590, 410, 'PWR-LED', { 'font-size': 7, 'font-weight': 700, fill: '#f0f0f0' });

    // jumper 3.3 V / 5 V
    refs.jumperY = { 3.3: 346, V: 368, 5: 390 };
    el('rect', { x: 446, y: 334, width: 22, height: 68, rx: 2, fill: '#101114' }, g);
    [346, 368, 390].forEach((y) => { el('rect', { x: 451, y: y - 5, width: 12, height: 10, fill: '#2a2c31' }, g); el('circle', { cx: 457, cy: y, r: 2.6, fill: '#d4af37' }, g); });
    txt(g, 484, 349, '3.3V', { 'font-size': 7, 'font-weight': 700, fill: '#f0f0f0', 'text-anchor': 'start' });
    txt(g, 476, 371, 'V', { 'font-size': 7, 'font-weight': 700, fill: '#f0f0f0', 'text-anchor': 'start' });
    txt(g, 476, 393, '5V', { 'font-size': 7, 'font-weight': 700, fill: '#f0f0f0', 'text-anchor': 'start' });
    txt(g, 457, 418, 'JUMP', { 'font-size': 7, 'font-weight': 700, fill: '#f0f0f0' });
    refs.jumper = el('rect', { x: 448, y: jumperV === 5 ? 361 : 339, width: 18, height: 36, rx: 3, fill: '#1f1f22', stroke: '#55585f', 'stroke-width': 1, 'data-act': 'jumper', style: 'cursor:pointer' }, g);
    el('title', {}, refs.jumper).textContent = 'Jumper: click to switch the V pins between 3.3 V and 5 V';

    // silk title
    txt(g, 330, 130, 'ESP32-DevKitC GPIO Expansion Board', { 'font-size': 8, fill: '#bfc3c9' });

    /* ---- the DevKit in its socket ---- */
    const dk = el('g', { transform: 'translate(70 138)' }, g);
    el('rect', { x: -6, y: 4, width: 520, height: 12, rx: 1, fill: '#0d0d0f' }, dk);         // socket strips
    el('rect', { x: -6, y: 172, width: 520, height: 12, rx: 1, fill: '#0d0d0f' }, dk);
    el('rect', { x: 0, y: 0, width: 508, height: 188, rx: 6, fill: '#16202b', stroke: '#0a1118', 'stroke-width': 1.5 }, dk);
    // pins along the edges
    for (let i = 0; i < 15; i++) {
      el('circle', { cx: 70 + i * 28, cy: 10, r: 4, fill: '#d4af37', stroke: '#8a6d2a' }, dk);
      el('circle', { cx: 70 + i * 28, cy: 178, r: 4, fill: '#d4af37', stroke: '#8a6d2a' }, dk);
    }
    const dkTop = ['D23', 'D22', 'TX0', 'RX0', 'D21', 'D19', 'D18', 'D5', 'TX2', 'RX2', 'D4', 'D2', 'D15', 'GND', '3V3'];
    const dkBot = ['EN', 'VP', 'VN', 'D34', 'D35', 'D32', 'D33', 'D25', 'D26', 'D27', 'D14', 'D12', 'D13', 'GND', 'VIN'];
    dkTop.forEach((s, i) => txt(dk, 70 + i * 28, 26, s, { 'font-size': 6.5, fill: '#e8edf2' }));
    dkBot.forEach((s, i) => txt(dk, 70 + i * 28, 167, s, { 'font-size': 6.5, fill: '#e8edf2' }));
    // WROOM module with antenna
    el('rect', { x: 8, y: 34, width: 196, height: 120, rx: 3, fill: '#20262d', stroke: '#3a434d' }, dk);
    el('path', { d: 'M16 46 v34 h8 v-26 h8 v26 h8 v-26 h8 v26 h8 v-26 h8 v34', fill: 'none', stroke: '#c9a24a', 'stroke-width': 2.2, 'stroke-linejoin': 'round' }, dk);
    el('rect', { x: 78, y: 40, width: 120, height: 108, rx: 2, fill: 'url(#shieldGrad)', stroke: '#8d969f' }, dk);
    txt(dk, 138, 82, 'ESP32-WROOM-32', { 'font-size': 9, 'font-weight': 700, fill: '#2f3a44', 'font-family': 'Consolas, monospace' });
    txt(dk, 138, 96, 'Wi-Fi + BT · 240 MHz', { 'font-size': 7, fill: '#46525e', 'font-family': 'Consolas, monospace' });
    txt(dk, 138, 108, '4 MB flash', { 'font-size': 7, fill: '#46525e', 'font-family': 'Consolas, monospace' });
    el('rect', { x: 92, y: 118, width: 20, height: 20, fill: '#46525e', opacity: 0.25 }, dk);
    // chips
    el('rect', { x: 300, y: 70, width: 40, height: 40, rx: 2, fill: '#0b0f13', stroke: '#2b3540' }, dk);
    txt(dk, 320, 93, 'CP2102', { 'font-size': 6, fill: '#8796a5' });
    el('rect', { x: 262, y: 118, width: 26, height: 20, rx: 1, fill: '#0b0f13', stroke: '#2b3540' }, dk);
    txt(dk, 275, 131, 'AMS1117', { 'font-size': 4.5, fill: '#8796a5' });
    // LEDs
    el('rect', { x: 392, y: 60, width: 9, height: 6, rx: 1, fill: '#ef4444' }, dk);
    txt(dk, 396, 76, 'PWR', { 'font-size': 6, fill: '#c3ccd5' });
    refs.led2glow = el('circle', { cx: 396, cy: 120, r: 12, fill: '#3b82f6', opacity: 0, filter: 'url(#ledGlow)' }, dk);
    refs.led2 = el('rect', { x: 392, y: 117, width: 9, height: 6, rx: 1, fill: '#1e3a5f' }, dk);
    txt(dk, 396, 136, 'IO2', { 'font-size': 6, fill: '#c3ccd5' });
    // EN / BOOT buttons
    [['EN', 50, 'reset'], ['BOOT', 138, null]].forEach(([s, y, act]) => {
      const b = el('g', act ? { 'data-act': act, style: 'cursor:pointer' } : {}, dk);
      el('rect', { x: 440, y: y - 12, width: 26, height: 24, rx: 2, fill: '#c7ced6', stroke: '#7d8a97' }, b);
      el('circle', { cx: 453, cy: y, r: 7, fill: '#2a323b' }, b);
      if (act) el('title', {}, b).textContent = 'EN (reset): click to restart the board';
      txt(dk, 453, y + 22, s, { 'font-size': 6.5, fill: '#c3ccd5' });
    });
    // micro USB
    el('rect', { x: 486, y: 78, width: 30, height: 32, rx: 3, fill: '#aeb8c2', stroke: '#6b7886' }, dk);
    el('rect', { x: 494, y: 88, width: 18, height: 12, rx: 2, fill: '#5d6a77' }, dk);

    // header pins (drawn last so they sit on top)
    Object.keys(BT).forEach((k) => {
      const t = BT[k];
      el('rect', { x: t.x - 6, y: t.y - 6, width: 12, height: 12, fill: '#2a2c31' }, g);
      el('rect', { x: t.x - 2.6, y: t.y - 2.6, width: 5.2, height: 5.2, fill: '#d4af37' }, g);
    });
    return refs;
  }

  /* ================================================================
     Components
     Each type: size, terminals (local coords), power, signal roles,
     draw(g) -> refs for live updates.
     ================================================================ */
  const LED_COLORS = { red: '#ef4444', green: '#22c55e', blue: '#3b82f6', yellow: '#facc15', white: '#f1f5f9', orange: '#f97316' };
  const legs = (g, list, y0, y1, col) => list.forEach((x) => el('line', { x1: x, y1: y0, x2: x, y2: y1, stroke: col || '#a3a9b0', 'stroke-width': 2.4 }, g));
  const pinRow = (g, list, y, labels, col) => list.forEach((x, i) => {
    el('rect', { x: x - 3, y: y - 12, width: 6, height: 12, fill: col || '#c9a24a' }, g);
    if (labels) txt(g, x, y - 15, labels[i], { 'font-size': 6, fill: '#fff' });
  });

  const TYPES = {
    led: {
      name: 'LED', prefix: 'LED', cat: 'Basic', w: 40, h: 84,
      terms: { A: { x: 14, y: 84, label: 'Anode (+, long leg)' }, K: { x: 28, y: 84, label: 'Cathode (−)' } },
      draw(g, part) {
        const r = {};
        el('path', { d: 'M14 46 V60 l-4 6 V84', fill: 'none', stroke: '#a3a9b0', 'stroke-width': 2.4 }, g);
        el('line', { x1: 28, y1: 46, x2: 28, y2: 84, stroke: '#a3a9b0', 'stroke-width': 2.4 }, g);
        r.glow = el('circle', { cx: 21, cy: 24, r: 22, fill: '#ef4444', opacity: 0, filter: 'url(#ledGlow)' }, g);
        r.dome = el('path', { d: 'M7 46 V22 a14 14 0 0 1 28 0 V46 Z', fill: LED_COLORS[part.color] || '#ef4444', 'fill-opacity': 0.55, stroke: 'rgba(0,0,0,.35)' }, g);
        el('path', { d: 'M12 20 a9 9 0 0 1 7 -8', fill: 'none', stroke: '#fff', 'stroke-opacity': 0.6, 'stroke-width': 2, 'stroke-linecap': 'round' }, g);
        el('rect', { x: 4, y: 44, width: 34, height: 5, rx: 1.5, fill: LED_COLORS[part.color] || '#ef4444', 'fill-opacity': 0.8, stroke: 'rgba(0,0,0,.3)' }, g);
        return r;
      },
    },
    resistor: {
      name: 'Resistor', prefix: 'R', cat: 'Basic', w: 84, h: 20,
      terms: { A: { x: 0, y: 10, label: 'Terminal 1' }, B: { x: 84, y: 10, label: 'Terminal 2' } },
      draw(g) {
        el('line', { x1: 0, y1: 10, x2: 84, y2: 10, stroke: '#a3a9b0', 'stroke-width': 2.4 }, g);
        el('rect', { x: 20, y: 3, width: 44, height: 14, rx: 6, fill: '#d9c08f', stroke: '#9c8458' }, g);
        [['#d32f2f', 27], ['#d32f2f', 34], ['#6d4c41', 41], ['#c9a227', 54]].forEach(([c, x]) => el('rect', { x, y: 3.5, width: 4, height: 13, fill: c }, g));
        return {};
      },
    },
    button: {
      name: 'Pushbutton', prefix: 'BTN', cat: 'Basic', w: 50, h: 62,
      terms: { T1: { x: 11, y: 62, label: 'Terminal 1' }, T2: { x: 39, y: 62, label: 'Terminal 2' } },
      draw(g) {
        const r = {};
        legs(g, [11, 39], 44, 62);
        el('rect', { x: 2, y: 2, width: 46, height: 44, rx: 4, fill: '#2a2f36', stroke: '#11151a' }, g);
        [[8, 8], [42, 8], [8, 40], [42, 40]].forEach(([x, y]) => el('circle', { cx: x, cy: y, r: 2.4, fill: '#7b8590' }, g));
        r.cap = el('circle', { cx: 25, cy: 24, r: 13, fill: '#1f2937', stroke: '#000', 'stroke-width': 1.5, 'data-act': 'press', style: 'cursor:pointer' }, g);
        return r;
      },
    },
    pot: {
      name: 'Potentiometer', prefix: 'POT', cat: 'Basic', w: 64, h: 78,
      terms: { T1: { x: 14, y: 78, label: 'Terminal 1 (GND)' }, W: { x: 32, y: 78, label: 'Wiper (signal)' }, T2: { x: 50, y: 78, label: 'Terminal 2 (3.3V)' } },
      draw(g) {
        const r = {};
        legs(g, [14, 32, 50], 56, 78);
        el('rect', { x: 4, y: 14, width: 56, height: 44, rx: 5, fill: '#1d4ed8' }, g);
        el('circle', { cx: 32, cy: 30, r: 20, fill: '#d6dde4', stroke: '#7d8a97' }, g);
        r.knob = el('line', { x1: 32, y1: 30, x2: 32, y2: 14, stroke: '#1f2937', 'stroke-width': 3.5, 'stroke-linecap': 'round' }, g);
        return r;
      },
    },
    buzzer: {
      name: 'Buzzer', prefix: 'BZR', cat: 'Basic', w: 52, h: 70,
      terms: { P: { x: 18, y: 70, label: 'Positive (+)' }, N: { x: 34, y: 70, label: 'Negative (−)' } },
      draw(g) {
        const r = {};
        legs(g, [18, 34], 48, 70);
        el('circle', { cx: 26, cy: 26, r: 24, fill: '#141821', stroke: '#2e3542' }, g);
        el('circle', { cx: 26, cy: 26, r: 5, fill: '#2e3542' }, g);
        txt(g, 14, 12, '+', { 'font-size': 9, fill: '#cbd5e1' });
        r.w1 = el('path', { d: 'M52 14 q7 12 0 24', fill: 'none', stroke: '#0ea5e9', 'stroke-width': 2.5, 'stroke-linecap': 'round', opacity: 0 }, g);
        r.w2 = el('path', { d: 'M58 8 q11 18 0 36', fill: 'none', stroke: '#0ea5e9', 'stroke-width': 2.5, 'stroke-linecap': 'round', opacity: 0 }, g);
        return r;
      },
    },
    ldr: {
      name: 'Light sensor (LDR module)', short: 'LDR module', prefix: 'LDR', cat: 'Sensors', w: 56, h: 98,
      power: { vcc: 'VCC', gnd: 'GND' }, roles: { pin: 'AO' },
      terms: { VCC: { x: 12, y: 98, label: 'VCC' }, GND: { x: 28, y: 98, label: 'GND' }, AO: { x: 44, y: 98, label: 'AO (analog out)' } },
      draw(g) {
        const r = {};
        el('rect', { x: 0, y: 26, width: 56, height: 72, rx: 3, fill: '#1e40af' }, g);
        pinRow(g, [12, 28, 44], 98, ['VCC', 'GND', 'AO']);
        r.sun = el('circle', { cx: 28, cy: 16, r: 18, fill: '#facc15', opacity: 0.2 }, g);
        el('circle', { cx: 28, cy: 16, r: 11, fill: '#f5f0e1', stroke: '#b7a77a' }, g);
        el('path', { d: 'M21 13 h4 v6 h3 v-6 h3 v6 h3 v-6 h2', fill: 'none', stroke: '#b45309', 'stroke-width': 1.5 }, g);
        el('rect', { x: 14, y: 46, width: 12, height: 12, rx: 6, fill: '#1d4ed8', stroke: '#93c5fd' }, g);
        el('rect', { x: 34, y: 48, width: 12, height: 8, fill: '#0b0f13' }, g);
        return r;
      },
    },
    dht22: {
      name: 'Temp & humidity (DHT11/DHT22)', short: 'DHT11 / DHT22', prefix: 'DHT', cat: 'Sensors', w: 50, h: 96,
      power: { vcc: 'VCC', gnd: 'GND' }, roles: { pin: 'DATA' },
      terms: { VCC: { x: 9, y: 96, label: 'VCC (+)' }, DATA: { x: 25, y: 96, label: 'DATA (out)' }, GND: { x: 41, y: 96, label: 'GND (−)' } },
      draw(g) {
        el('rect', { x: 0, y: 56, width: 50, height: 40, rx: 3, fill: '#1e40af' }, g);
        pinRow(g, [9, 25, 41], 96, ['+', 'out', '−']);
        el('rect', { x: 5, y: 0, width: 40, height: 58, rx: 4, fill: '#7fb3e6', stroke: '#3d76b0' }, g);
        for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) el('rect', { x: 10 + c * 8, y: 6 + r * 9, width: 5, height: 5.5, rx: 1, fill: '#3d76b0' }, g);
        return {};
      },
    },
    pir: {
      name: 'PIR motion sensor (HC-SR501)', short: 'PIR motion', prefix: 'PIR', cat: 'Sensors', w: 80, h: 92,
      power: { vcc: 'VCC', gnd: 'GND', need: 5 }, roles: { pin: 'OUT' },
      terms: { VCC: { x: 22, y: 92, label: 'VCC (5V)' }, OUT: { x: 40, y: 92, label: 'OUT' }, GND: { x: 58, y: 92, label: 'GND' } },
      draw(g) {
        const r = {};
        el('rect', { x: 0, y: 36, width: 80, height: 56, rx: 3, fill: '#15803d' }, g);
        pinRow(g, [22, 40, 58], 92, ['VCC', 'OUT', 'GND']);
        r.ring = el('circle', { cx: 40, cy: 38, r: 38, fill: 'none', stroke: '#ef4444', 'stroke-width': 2.5, opacity: 0 }, g);
        r.dome = el('path', { d: 'M8 60 a32 32 0 0 1 64 0 Z', fill: '#f8fafc', stroke: '#cbd5e1' }, g);
        el('path', { d: 'M20 60 a20 20 0 0 1 40 0 M30 60 a10 10 0 0 1 20 0', fill: 'none', stroke: '#e2e8f0' }, g);
        return r;
      },
    },
    ir: {
      name: 'IR obstacle sensor (FC-51)', short: 'IR obstacle', prefix: 'IR', cat: 'Sensors', w: 48, h: 110,
      power: { vcc: 'VCC', gnd: 'GND' }, roles: { pin: 'OUT' },
      terms: { OUT: { x: 8, y: 110, label: 'OUT' }, GND: { x: 24, y: 110, label: 'GND' }, VCC: { x: 40, y: 110, label: 'VCC' } },
      draw(g) {
        const r = {};
        r.obj = el('rect', { x: 0, y: -26, width: 48, height: 14, rx: 3, fill: '#f59e0b', opacity: 0 }, g);
        el('rect', { x: 0, y: 14, width: 48, height: 96, rx: 3, fill: '#0f2b5b' }, g);
        pinRow(g, [8, 24, 40], 110, ['OUT', 'GND', 'VCC']);
        el('rect', { x: 8, y: 0, width: 12, height: 22, rx: 6, fill: '#e2e8f0' }, g);
        el('rect', { x: 28, y: 0, width: 12, height: 22, rx: 6, fill: '#111827', stroke: '#64748b' }, g);
        el('circle', { cx: 24, cy: 48, r: 8, fill: '#1d4ed8', stroke: '#93c5fd' }, g);
        r.led = el('circle', { cx: 12, cy: 72, r: 3, fill: '#374151' }, g);
        return r;
      },
    },
    hcsr04: {
      name: 'Ultrasonic distance (HC-SR04)', short: 'Ultrasonic', prefix: 'US', cat: 'Sensors', w: 124, h: 80,
      power: { vcc: 'VCC', gnd: 'GND', need: 5 }, roles: { pin: 'TRIG', pin2: 'ECHO' },
      terms: { VCC: { x: 40, y: 80, label: 'VCC (5V)' }, TRIG: { x: 54, y: 80, label: 'TRIG' }, ECHO: { x: 70, y: 80, label: 'ECHO' }, GND: { x: 84, y: 80, label: 'GND' } },
      draw(g) {
        const r = {};
        r.wave = el('path', { d: 'M44 -6 q18 -10 36 0', fill: 'none', stroke: '#0ea5e9', 'stroke-width': 2.5, 'stroke-linecap': 'round', opacity: 0 }, g);
        el('rect', { x: 0, y: 6, width: 124, height: 74, rx: 3, fill: '#1d4ed8' }, g);
        pinRow(g, [40, 54, 70, 84], 80, ['Vcc', 'Trig', 'Echo', 'Gnd']);
        [30, 94].forEach((cx) => {
          el('circle', { cx, cy: 34, r: 24, fill: '#cbd5e1', stroke: '#64748b', 'stroke-width': 1.5 }, g);
          el('circle', { cx, cy: 34, r: 15, fill: '#334155' }, g);
          el('circle', { cx, cy: 34, r: 6, fill: '#1e293b' }, g);
        });
        txt(g, 62, 18, 'HC-SR04', { 'font-size': 6.5, fill: '#dbeafe' });
        return r;
      },
    },
    rain: {
      name: 'Rain sensor (YL-83)', short: 'Rain sensor', prefix: 'RAIN', cat: 'Sensors', w: 86, h: 118,
      power: { vcc: 'VCC', gnd: 'GND' }, roles: { pin: 'AO' },
      terms: { VCC: { x: 27, y: 118, label: 'VCC' }, GND: { x: 43, y: 118, label: 'GND' }, AO: { x: 59, y: 118, label: 'AO (analog out)' } },
      draw(g) {
        const r = {};
        el('rect', { x: 0, y: 0, width: 86, height: 64, rx: 3, fill: '#1e3a8a' }, g);
        for (let y = 8; y < 60; y += 8) el('path', { d: 'M8 ' + y + ' h70', stroke: '#e2e8f0', 'stroke-width': 2 }, g);
        r.drops = el('g', { opacity: 0 }, g);
        [[18, 14], [44, 26], [66, 12], [28, 44], [62, 48]].forEach(([x, y]) => el('ellipse', { cx: x, cy: y, rx: 3.5, ry: 4.5, fill: '#7dd3fc' }, r.drops));
        el('rect', { x: 18, y: 76, width: 50, height: 42, rx: 3, fill: '#1e40af' }, g);
        el('path', { d: 'M36 64 v12 M50 64 v12', stroke: '#94a3b8', 'stroke-width': 2 }, g);
        pinRow(g, [27, 43, 59], 118, ['VCC', 'GND', 'AO']);
        return r;
      },
    },
    soil: {
      name: 'Soil moisture sensor', short: 'Soil moisture', prefix: 'SOIL', cat: 'Sensors', w: 56, h: 120,
      power: { vcc: 'VCC', gnd: 'GND' }, roles: { pin: 'AO' },
      terms: { VCC: { x: 12, y: 120, label: 'VCC' }, GND: { x: 28, y: 120, label: 'GND' }, AO: { x: 44, y: 120, label: 'AO (analog out)' } },
      draw(g) {
        const r = {};
        r.dirt = el('rect', { x: -6, y: 0, width: 68, height: 40, rx: 3, fill: '#a16207' }, g);
        el('path', { d: 'M16 2 v66 M40 2 v66', stroke: '#cbd5e1', 'stroke-width': 8, 'stroke-linecap': 'round' }, g);
        el('rect', { x: 0, y: 62, width: 56, height: 58, rx: 3, fill: '#15803d' }, g);
        pinRow(g, [12, 28, 44], 120, ['VCC', 'GND', 'AO']);
        return r;
      },
    },
    relay: {
      name: 'Relay module (5V, 1 channel)', short: 'Relay', prefix: 'RLY', cat: 'Output', w: 80, h: 110,
      power: { vcc: 'VCC', gnd: 'GND', need: 5 }, roles: { pin: 'IN' },
      terms: { IN: { x: 24, y: 110, label: 'IN (signal)' }, VCC: { x: 40, y: 110, label: 'VCC (5V)' }, GND: { x: 56, y: 110, label: 'GND' } },
      draw(g) {
        const r = {};
        el('rect', { x: 0, y: 0, width: 80, height: 110, rx: 3, fill: '#1e3a8a' }, g);
        el('rect', { x: 10, y: 8, width: 46, height: 52, rx: 2, fill: '#2563eb', stroke: '#1e3a8a' }, g);
        txt(g, 33, 30, 'SRD-05VDC', { 'font-size': 6, fill: '#dbeafe' });
        txt(g, 33, 42, '10A 250VAC', { 'font-size': 5.5, fill: '#dbeafe' });
        [12, 30, 48].forEach((x) => { el('rect', { x: x + 2, y: 66, width: 14, height: 16, fill: '#0f766e' }, g); el('circle', { cx: x + 9, cy: 74, r: 4, fill: '#cbd5e1' }, g); });
        txt(g, 21, 92, 'NC', { 'font-size': 5.5 }); txt(g, 39, 92, 'COM', { 'font-size': 5.5 }); txt(g, 57, 92, 'NO', { 'font-size': 5.5 });
        r.led = el('circle', { cx: 68, cy: 16, r: 4, fill: '#4b5563' }, g);
        r.bulb = el('circle', { cx: 68, cy: 44, r: 8, fill: '#334155', stroke: '#94a3b8' }, g);
        pinRow(g, [24, 40, 56], 110, ['IN', 'VCC', 'GND']);
        return r;
      },
    },
    servo: {
      name: 'Micro servo (SG90)', short: 'Servo', prefix: 'SRV', cat: 'Output', w: 130, h: 64,
      power: { vcc: 'VCC', gnd: 'GND', need: 5, soft: true }, roles: { pin: 'SIG' },
      terms: { GND: { x: 0, y: 22, label: 'GND (brown)' }, VCC: { x: 0, y: 34, label: 'VCC 5V (red)' }, SIG: { x: 0, y: 46, label: 'Signal (orange)' } },
      draw(g) {
        const r = {};
        [['#6b3f1d', 22], ['#dc2626', 34], ['#f59e0b', 46]].forEach(([c, y]) => el('path', { d: 'M0 ' + y + ' H18 C28 ' + y + ' 26 34 36 34', fill: 'none', stroke: c, 'stroke-width': 3 }, g));
        el('rect', { x: 34, y: 14, width: 90, height: 40, rx: 3, fill: '#1d4ed8' }, g);
        el('rect', { x: 28, y: 28, width: 102, height: 10, rx: 2, fill: '#1d4ed8', stroke: '#1e3a8a' }, g);
        el('circle', { cx: 98, cy: 34, r: 13, fill: '#e5e7eb' }, g);
        r.horn = el('g', {}, g);
        el('path', { d: 'M98 34 L98 2', stroke: '#f8fafc', 'stroke-width': 8, 'stroke-linecap': 'round' }, r.horn);
        el('circle', { cx: 98, cy: 34, r: 4, fill: '#6b7280' }, g);
        txt(g, 60, 50, 'SG90', { 'font-size': 7, fill: '#dbeafe' });
        return r;
      },
    },
    lcd: {
      name: 'LCD 16×2 (I2C backpack)', short: 'LCD 16×2 I2C', prefix: 'LCD', cat: 'Output', w: 206, h: 96,
      power: { vcc: 'VCC', gnd: 'GND', need: 5, soft: true }, roles: { pin: 'SDA', pin2: 'SCL' },
      terms: { GND: { x: 0, y: 26, label: 'GND' }, VCC: { x: 0, y: 40, label: 'VCC (5V)' }, SDA: { x: 0, y: 54, label: 'SDA' }, SCL: { x: 0, y: 68, label: 'SCL' } },
      draw(g) {
        const r = {};
        el('rect', { x: 12, y: 0, width: 194, height: 96, rx: 4, fill: '#15803d' }, g);
        el('rect', { x: 0, y: 18, width: 24, height: 58, rx: 2, fill: '#111827' }, g);
        [['GND', 26], ['VCC', 40], ['SDA', 54], ['SCL', 68]].forEach(([s, y]) => { el('rect', { x: 0, y: y - 3, width: 10, height: 6, fill: '#c9a24a' }, g); txt(g, 18, y + 2, s, { 'font-size': 4.5 }); });
        el('rect', { x: 32, y: 14, width: 166, height: 68, rx: 3, fill: '#0b0f13' }, g);
        r.scr = el('rect', { x: 38, y: 20, width: 154, height: 56, rx: 2, fill: '#3b5bdb' }, g);
        r.rows = [0, 1].map((i) => txt(g, 42, 42 + i * 22, '', { 'font-size': 15, fill: '#e0e7ff', 'text-anchor': 'start', 'font-family': 'Consolas, "Courier New", monospace', style: 'white-space:pre' }));
        return r;
      },
    },
    motor: {
      name: 'DC motor + L298N driver (12 V battery included)', short: 'DC motor + L298N', prefix: 'MOT', cat: 'Output', w: 170, h: 112,
      power: { gnd: 'GND' }, roles: { pin: 'IN1', pin2: 'IN2', pin3: 'ENA' },
      terms: { ENA: { x: 30, y: 112, label: 'ENA (speed, PWM)' }, IN1: { x: 46, y: 112, label: 'IN1' }, IN2: { x: 62, y: 112, label: 'IN2' }, GND: { x: 94, y: 112, label: 'GND (join with ESP32 GND)' } },
      draw(g) {
        const r = {};
        el('rect', { x: 0, y: 20, width: 104, height: 92, rx: 3, fill: '#b91c1c' }, g);
        el('rect', { x: 30, y: 30, width: 44, height: 40, rx: 2, fill: '#111827' }, g);
        el('path', { d: 'M30 34 h-8 M30 42 h-8 M30 50 h-8 M30 58 h-8 M30 66 h-8', stroke: '#111827', 'stroke-width': 3 }, g);
        txt(g, 52, 53, 'L298N', { 'font-size': 7, fill: '#e5e7eb' });
        pinRow(g, [30, 46, 62], 112, ['ENA', 'IN1', 'IN2']);
        pinRow(g, [94], 112, ['GND'], '#2a2c31');
        txt(g, 88, 84, '12V', { 'font-size': 6 });
        el('rect', { x: 112, y: 44, width: 34, height: 36, rx: 4, fill: '#9ca3af', stroke: '#6b7280' }, g);
        el('rect', { x: 146, y: 56, width: 8, height: 12, fill: '#d1d5db' }, g);
        r.fan = el('g', {}, g);
        [0, 120, 240].forEach((a) => el('ellipse', { cx: 160, cy: 50, rx: 4, ry: 12, fill: '#f8fafc', stroke: '#64748b', transform: 'rotate(' + a + ' 160 62)' }, r.fan));
        el('circle', { cx: 160, cy: 62, r: 3, fill: '#334155' }, g);
        el('path', { d: 'M104 50 C110 50 108 54 112 54 M104 70 C110 70 108 66 112 66', fill: 'none', stroke: '#111', 'stroke-width': 2 }, g);
        return r;
      },
    },
  };
  const CATS = ['Basic', 'Sensors', 'Output'];

  function defaultValue(type) {
    switch (type) {
      case 'pot': return 2048;
      case 'ldr': return 300;
      case 'dht22': return { t: 25, h: 60 };
      case 'hcsr04': return 60;
      case 'rain': return 0;
      case 'soil': return 30;
      default: return 0;
    }
  }
  const HUES = ['#e11d48', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#4f46e5'];
  function makePart(type, parts, x, y, extra) {
    const t = TYPES[type];
    let n = 1;
    while (parts.some((p) => p.label === t.prefix + n)) n++;
    const p = {
      id: type + '-' + Math.random().toString(36).slice(2, 8),
      type, label: t.prefix + n, x: Math.round(x || 0), y: Math.round(y || 0), rot: 0,
      value: defaultValue(type), hue: HUES[parts.length % HUES.length],
    };
    if (type === 'lcd') p.addr = '0x27';
    if (type === 'led') p.color = 'red';
    if (type === 'buzzer') p.sound = false;
    if (type === 'dht22') p.model = 'DHT22';
    return Object.assign(p, extra || {});
  }

  /* ---------- geometry ---------- */
  function rotPt(x, y, w, h, rot) {
    const cx = w / 2, cy = h / 2, dx = x - cx, dy = y - cy;
    switch (((rot || 0) % 360 + 360) % 360) {
      case 90: return [cx - dy, cy + dx];
      case 180: return [cx - dx, cy - dy];
      case 270: return [cx + dy, cy - dx];
      default: return [x, y];
    }
  }
  function termPos(part, key) {
    const t = TYPES[part.type];
    const tm = t && t.terms[key];
    if (!tm) return null;
    const [x, y] = rotPt(tm.x, tm.y, t.w, t.h, part.rot);
    return { x: part.x + x, y: part.y + y };
  }
  function boardTermPos(board, key) {
    const t = BT[key];
    return t ? { x: board.x + t.x, y: board.y + t.y } : null;
  }
  function endPos(state, end) {
    if (end.part === 'board') return boardTermPos(state.board, end.term);
    const p = state.parts.find((x) => x.id === end.part);
    return p ? termPos(p, end.term) : null;
  }
  function partBox(part) {
    const t = TYPES[part.type];
    const r = ((part.rot || 0) % 180) !== 0;
    const w = r ? t.h : t.w, h = r ? t.w : t.h;
    return { x: part.x + (t.w - w) / 2, y: part.y + (t.h - h) / 2, w, h };
  }

  /* ================================================================
     Netlist: union-find over terminals, then decide each part's pins
     ================================================================ */
  function solve(state) {
    const parent = {};
    const find = (a) => { if (parent[a] === undefined) parent[a] = a; while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    const union = (a, b) => { const x = find(a), y = find(b); if (x !== y) parent[x] = y; };
    const key = (e) => (e.part === 'board' ? 'B:' + e.term : e.part + ':' + e.term);
    const jumperV = state.board.jumper === '5V' ? 5 : 3.3;
    const partsById = {};
    state.parts.forEach((p) => { partsById[p.id] = p; });

    // board-internal joins: I2C rows, I2C SCL/SDA = D22/D21 S pins, power pins
    union('B:I2C_SCL1', 'B:I2C_SCL2'); union('B:I2C_SDA1', 'B:I2C_SDA2'); union('B:I2C_VCC1', 'B:I2C_VCC2'); union('B:I2C_GND1', 'B:I2C_GND2');
    union('B:I2C_SCL1', 'B:S22'); union('B:I2C_SDA1', 'B:S21');
    const wires = state.wires.filter((w) => (w.a.part === 'board' || partsById[w.a.part]) && (w.b.part === 'board' || partsById[w.b.part]));
    wires.forEach((w) => union(key(w.a), key(w.b)));

    // nets before resistors are bridged (to know if an LED has a series resistor)
    const preRoot = {};
    const resistorKeys = [];
    state.parts.forEach((p) => { if (p.type === 'resistor') { resistorKeys.push(p.id + ':A', p.id + ':B'); } });
    const allKeys = new Set(Object.keys(parent));
    state.parts.forEach((p) => Object.keys(TYPES[p.type].terms).forEach((k) => allKeys.add(p.id + ':' + k)));
    Object.keys(BT).forEach((k) => allKeys.add('B:' + k));
    allKeys.forEach((k) => { preRoot[k] = find(k); });
    const resistorNets = new Set(resistorKeys.map((k) => preRoot[k]));
    state.parts.forEach((p) => { if (p.type === 'resistor') union(p.id + ':A', p.id + ':B'); });

    // describe each net
    const nets = {};
    allKeys.forEach((k) => {
      const r = find(k);
      const n = nets[r] || (nets[r] = { gpios: new Set(), supplies: new Set(), gnd: false, en: false, members: [] });
      n.members.push(k);
      if (k.startsWith('B:')) {
        const t = boardTermInfo(k.slice(2), jumperV);
        if (t.kind === 'gpio') n.gpios.add(t.gpio);
        else if (t.kind === 'supply') n.supplies.add(t.v);
        else if (t.kind === 'gnd') n.gnd = true;
        else if (t.kind === 'en') n.en = true;
      }
    });
    const netOf = (part, term) => nets[find(part.id + ':' + term)];
    const wired = new Set();
    wires.forEach((w) => { wired.add(key(w.a)); wired.add(key(w.b)); });

    // shorts are judged on nets before resistors are bridged (a resistor is not a wire)
    const preNets = {};
    allKeys.forEach((k) => {
      const r = preRoot[k];
      const n = preNets[r] || (preNets[r] = { gpios: new Set(), supplies: new Set(), gnd: false, en: false, members: [] });
      n.members.push(k);
      if (k.startsWith('B:')) {
        const t = boardTermInfo(k.slice(2), jumperV);
        if (t.kind === 'gpio') n.gpios.add(t.gpio);
        else if (t.kind === 'supply') n.supplies.add(t.v);
        else if (t.kind === 'gnd') n.gnd = true;
      }
    });
    const issues = [];
    Object.values(preNets).forEach((n) => {
      if (n.gnd && n.supplies.size) issues.push({ level: 'err', msg: 'Short circuit: a ' + Array.from(n.supplies).map((v) => v + ' V').join(' / ') + ' pin is wired straight to GND.' });
      else if (n.supplies.size > 1) issues.push({ level: 'err', msg: 'Short circuit: the 3.3 V and 5 V supplies are wired together.' });
      if (n.gpios.size > 1) issues.push({ level: 'warn', msg: 'GPIO ' + Array.from(n.gpios).join(' and ') + ' are wired together.' });
      if (n.gpios.size && (n.gnd || n.supplies.size) && n.members.length > 1) {
        const onlyBoard = n.members.every((m) => m.startsWith('B:') || /:(GND|VCC|K|N|T1|T2)$/.test(m));
        if (onlyBoard) issues.push({ level: 'warn', msg: 'GPIO ' + Array.from(n.gpios).join(', ') + ' is wired straight to ' + (n.gnd ? 'GND' : 'the supply') + '.' });
      }
    });

    const info = {};
    const gpioOf = (n) => (n && n.gpios.size ? Array.from(n.gpios)[0] : null);
    const supplyOf = (n) => (n && n.supplies.size === 1 ? Array.from(n.supplies)[0] : null);
    const describe = (n, selfKey) => {
      if (!n) return 'not connected';
      const bits = [];
      if (n.gpios.size) bits.push(Array.from(n.gpios).map((g) => 'GPIO ' + g).join(' + '));
      if (n.supplies.size) bits.push(Array.from(n.supplies).map((v) => (v === 5 ? '5V' : '3.3V')).join(' + '));
      if (n.gnd) bits.push('GND');
      if (n.en) bits.push('EN');
      const others = n.members.filter((m) => m !== selfKey && !m.startsWith('B:')).map((m) => {
        const [pid, t] = m.split(':');
        const pp = partsById[pid];
        return pp ? pp.label + ' ' + t : m;
      });
      if (!bits.length && others.length) bits.push(others.slice(0, 3).join(', '));
      return bits.length ? bits.join(' · ') : 'not connected';
    };

    state.parts.forEach((p) => {
      const t = TYPES[p.type];
      const inf = { conns: {}, issues: [], powered: true, supplyV: null };
      Object.keys(t.terms).forEach((k) => {
        const kk = p.id + ':' + k;
        inf.conns[k] = wired.has(kk) || p.type === 'resistor' ? describe(nets[find(kk)], kk) : 'not connected';
      });
      const out = { pin: null, pin2: null, pin3: null, activeHigh: false, alwaysOn: false, reversed: false, potReversed: false, supplyV: null };

      if (t.power) {
        const vn = t.power.vcc ? netOf(p, t.power.vcc) : null;
        const gn = netOf(p, t.power.gnd);
        const v = vn ? supplyOf(vn) : 5;
        if (t.power.vcc && v === null) { inf.powered = false; inf.issues.push('VCC is not connected to 3.3V, 5V or a V pin.'); }
        if (!gn || !gn.gnd) { inf.powered = false; inf.issues.push('GND is not connected to a G / GND pin.'); }
        if (inf.powered && t.power.need === 5 && v < 5) {
          if (t.power.soft) inf.issues.push('Runs on 5 V; at 3.3 V it is weak or dim. Move VCC to 5V (or set the jumper to 5V).');
          else { inf.powered = false; inf.issues.push('Needs 5 V but VCC gets 3.3 V. Move VCC to 5V, or set the jumper to 5V.'); }
        }
        if (inf.powered) {
          out.supplyV = t.power.vcc ? v : null;
          ['pin', 'pin2', 'pin3'].forEach((f) => {
            const term = t.roles && t.roles[f];
            if (!term) return;
            const n = netOf(p, term);
            const g = gpioOf(n);
            out[f] = g;
            if (g !== null && n && (n.gnd || n.supplies.size) && !(p.type === 'motor' && f === 'pin3')) {
              out[f] = null;
              inf.issues.push(term + ' is on GPIO ' + g + ' but is also wired to ' + (n.gnd ? 'GND' : 'the supply') + ', so the signal is stuck.');
            }
            if (g === null && wired.has(p.id + ':' + term) && !(p.type === 'motor' && f === 'pin3')) {
              if (n && (n.gnd || n.supplies.size)) inf.issues.push(term + ' is wired to ' + (n.gnd ? 'GND' : 'the supply') + ', not to a GPIO S pin.');
            }
          });
          if (p.type === 'motor') {
            const en = netOf(p, 'ENA');
            if (!wired.has(p.id + ':ENA') || (en && supplyOf(en) && !en.gpios.size)) out.pin3 = '';        // jumper / tied high: full speed
            else if (en && en.gnd) { out.pin = null; out.pin2 = null; out.pin3 = null; inf.issues.push('ENA is tied to GND, so the L298N is disabled.'); }
            else if (out.pin3 === null) { out.pin = null; out.pin2 = null; inf.issues.push('ENA is wired but not to a GPIO or the supply, so the L298N is disabled.'); }
          }
        }
        if (inf.powered && ['ldr', 'rain', 'soil'].includes(p.type) && v === 5) inf.issues.push('Powered from 5 V, so AO can rise above 3.3 V: the ESP32 ADC saturates at 4095 and can be damaged. Use 3.3V.');
        if (inf.powered && p.type === 'hcsr04' && out.pin2 !== null) inf.issues.push('ECHO outputs 5 V. On a real ESP32 add a 1 kΩ / 2 kΩ divider on ECHO.');
      } else if (p.type === 'led') {
        const a = netOf(p, 'A'), k = netOf(p, 'K');
        const ga = gpioOf(a), gk = gpioOf(k);
        if (ga !== null && k.gnd) out.pin = ga;
        else if (supplyOf(a) && k.gnd) out.alwaysOn = true;
        else if (gk !== null && a.gnd) { out.reversed = true; inf.issues.push('The LED is in backwards: the long leg (anode) must go to the GPIO, the short leg (cathode) to GND.'); }
        else if (ga !== null && !k.gnd) inf.issues.push('The cathode (−) is not connected to GND.');
        else if (wired.has(p.id + ':A') || wired.has(p.id + ':K')) inf.issues.push('Connect the anode (+) to a GPIO S pin and the cathode (−) to GND.');
        if ((out.pin !== null || out.alwaysOn) && !resistorNets.has(preRoot[p.id + ':A']) && !resistorNets.has(preRoot[p.id + ':K'])) {
          inf.issues.push('No series resistor: add a 220 Ω resistor or the LED (and the GPIO) can be damaged.');
        }
      } else if (p.type === 'button') {
        const a = netOf(p, 'T1'), b = netOf(p, 'T2');
        const g1 = gpioOf(a), g2 = gpioOf(b);
        if (g1 !== null && (b.gnd || supplyOf(b))) { out.pin = g1; out.activeHigh = !b.gnd; }
        else if (g2 !== null && (a.gnd || supplyOf(a))) { out.pin = g2; out.activeHigh = !a.gnd; }
        else if (wired.has(p.id + ':T1') || wired.has(p.id + ':T2')) inf.issues.push('Wire one leg to a GPIO S pin and the other leg to GND (use INPUT_PULLUP).');
      } else if (p.type === 'pot') {
        const a = netOf(p, 'T1'), b = netOf(p, 'T2'), w = netOf(p, 'W');
        const sa = supplyOf(a), sb = supplyOf(b);
        if ((a.gnd && sb) || (b.gnd && sa)) {
          out.pin = gpioOf(w);
          out.potReversed = !!(sa && b.gnd);
          out.supplyV = sa || sb;
          if (out.supplyV === 5) inf.issues.push('The pot is across 5 V, so the wiper can exceed 3.3 V and the ADC saturates. Use 3.3V.');
        } else if (wired.has(p.id + ':W') || wired.has(p.id + ':T1') || wired.has(p.id + ':T2')) {
          inf.powered = false;
          inf.issues.push('Connect one outer leg to GND and the other to 3.3V; the middle leg (wiper) goes to an ADC pin.');
        }
      } else if (p.type === 'buzzer') {
        const a = netOf(p, 'P'), k = netOf(p, 'N');
        const ga = gpioOf(a);
        if (ga !== null && k.gnd) out.pin = ga;
        else if (supplyOf(a) && k.gnd) out.alwaysOn = true;
        else if (wired.has(p.id + ':P') || wired.has(p.id + ':N')) inf.issues.push('Connect + to a GPIO S pin and − to GND.');
      }

      // pin-specific advice
      const info2 = GPIO[out.pin] || {};
      if (out.pin !== null && ['led', 'relay', 'buzzer', 'servo'].includes(p.type) && info2.inputOnly) inf.issues.push('GPIO ' + out.pin + ' is input-only, so it cannot drive this part.');
      if (out.pin !== null && ['pot', 'ldr', 'rain', 'soil'].includes(p.type)) {
        if (!info2.adc) inf.issues.push('GPIO ' + out.pin + ' has no ADC, so analogRead() returns 0. Use GPIO 32–39.');
        else if (info2.adc === 'ADC2') inf.issues.push('GPIO ' + out.pin + ' is on ADC2, which reads 0 once WiFi starts. Use GPIO 32–39 (ADC1).');
      }
      if (p.type === 'motor') [out.pin, out.pin2, out.pin3].forEach((n) => { if (n !== null && n !== '' && (GPIO[n] || {}).inputOnly) inf.issues.push('GPIO ' + n + ' is input-only, so it cannot drive the L298N.'); });
      if (p.type === 'hcsr04' && out.pin !== null && (GPIO[out.pin] || {}).inputOnly) inf.issues.push('TRIG is on input-only GPIO ' + out.pin + ', so the sensor is never triggered.');
      if (p.type === 'dht22' && out.pin !== null && info2.inputOnly) inf.issues.push('GPIO ' + out.pin + ' is input-only, but the DHT data line must also be driven by the ESP32 to start a reading.');
      if (p.type === 'lcd' && [out.pin, out.pin2].some((n) => n !== null && (GPIO[n] || {}).inputOnly)) inf.issues.push('I2C needs pins that can drive the line; GPIO 34–39 are input-only.');
      if (p.type === 'lcd' && out.pin !== null && (out.pin !== 21 || out.pin2 !== 22)) inf.issues.push('SDA/SCL are not on GPIO 21/22. Call Wire.begin(' + out.pin + ', ' + out.pin2 + ') before lcd.init().');
      if ((out.pin === 1 || out.pin === 3) && p.type !== 'resistor') inf.issues.push('GPIO ' + out.pin + ' is the USB serial line, which clashes with the Serial Monitor.');
      if ([0, 2, 5, 12, 15].includes(out.pin) && ['button', 'pir', 'ir', 'dht22'].includes(p.type)) inf.issues.push('GPIO ' + out.pin + ' is a strapping pin: holding it at boot can stop the ESP32 from starting or uploading.');

      inf.out = out;
      info[p.id] = inf;
    });

    // two parts driving the same GPIO
    const byPin = {};
    state.parts.forEach((p) => { const o = info[p.id].out; [o.pin, o.pin2, o.pin3].forEach((n) => { if (n !== null && n !== '' && n !== undefined) (byPin[n] = byPin[n] || []).push(p); }); });
    Object.keys(byPin).forEach((n) => {
      const list = byPin[n];
      if (list.length > 1 && !list.every((p) => p.type === 'lcd')) list.forEach((p) => info[p.id].issues.push('Shares GPIO ' + n + ' with ' + list.filter((q) => q !== p).map((q) => q.label).join(', ') + '.'));
    });

    return { info, issues, nets, find, jumperV };
  }

  // write derived pins onto the part objects the runtime reads
  function applySolve(state, res) {
    state.parts.forEach((p) => {
      const o = res.info[p.id].out;
      p.pin = o.pin; p.pin2 = o.pin2; p.pin3 = o.pin3;
      p.activeHigh = o.activeHigh; p.alwaysOn = o.alwaysOn; p.potReversed = o.potReversed; p.supplyV = o.supplyV;
    });
  }

  /* ================================================================
     Auto-layout + auto-wiring for the bundled examples
     ex.parts: [{ type, pin, pin2, pin3, ... }]
     ================================================================ */
  function colOf(gpio) {
    let i = TOP.indexOf(+gpio);
    if (i >= 0) return { side: 'top', x: HX0 + i * P, col: TOP[i] };
    i = BOT.indexOf(+gpio);
    if (i >= 0) return { side: 'bot', x: HX0 + i * P, col: BOT[i] };
    return null;
  }
  function autoBuild(defs, board) {
    const parts = [];
    const wires = [];
    const placed = { top: [], bot: [] };
    const mkWire = (a, b, color) => wires.push({ id: 'w' + Math.random().toString(36).slice(2, 8), a, b, pts: [], color });
    defs.forEach((d) => {
      const extra = Object.assign({}, d);
      delete extra.type; delete extra.pin; delete extra.pin2; delete extra.pin3;
      if (extra.value && typeof extra.value === 'object') extra.value = Object.assign({}, extra.value);
      const p = makePart(d.type, parts, 0, 0, extra);
      p._want = { pin: d.pin, pin2: d.pin2, pin3: d.pin3 };
      parts.push(p);
    });
    // placement: by the header column of the first signal pin
    parts.forEach((p) => {
      const t = TYPES[p.type];
      const c = colOf(p._want.pin) || { side: 'top', x: 300 };
      const side = p.type === 'lcd' ? 'right' : c.side;
      p._side = side;
      p._cx = c.x;
    });
    const bySide = (s) => parts.filter((p) => p._side === s).sort((a, b) => a._cx - b._cx);
    let cursor = -40;
    bySide('top').forEach((p) => {
      const t = TYPES[p.type];
      let x = Math.max(cursor, board.x + p._cx - t.w / 2);
      p.x = Math.round(x); p.y = Math.round(board.y - t.h - (p.type === 'led' ? 160 : 90));
      cursor = x + t.w + 26;
    });
    cursor = -40;
    bySide('bot').forEach((p) => {
      const t = TYPES[p.type];
      let x = Math.max(cursor, board.x + p._cx - t.w / 2);
      p.rot = 180;
      p.x = Math.round(x); p.y = Math.round(board.y + BOARD.h + (p.type === 'led' ? 160 : 90));
      cursor = x + t.w + 26;
    });
    let ry = board.y - 140;
    bySide('right').forEach((p) => {
      const t = TYPES[p.type];
      p.x = board.x + BOARD.w + 70; p.y = ry; ry += t.h + 40;
    });

    // wiring
    let bendStep = 0;
    parts.forEach((p) => {
      const t = TYPES[p.type];
      const want = p._want;
      const col = colOf(want.pin);
      const near = (g) => { const c = colOf(g); return c ? c.col : null; };
      const route = (from, to, color) => {
        const a = termPos(p, from.term);
        const b = boardTermPos(board, to.term);
        const w = { id: 'w' + Math.random().toString(36).slice(2, 8), a: from, b: to, pts: [], color };
        if (a && b && p._side !== 'right') {
          const top = p._side === 'top';
          const ym = top ? Math.min(a.y, b.y) + 16 + (bendStep % 4) * 9 : Math.max(a.y, b.y) - 16 - (bendStep % 4) * 9;
          if (Math.abs(a.x - b.x) > 2) w.pts = [[a.x, ym], [b.x, ym]];
          bendStep++;
        } else if (a && b) {
          const xm = a.x - 24 - (bendStep % 4) * 8;
          w.pts = [[xm, a.y], [xm, b.y]];
          bendStep++;
        }
        wires.push(w);
      };
      const P_ = (term) => ({ part: p.id, term });
      const B_ = (term) => ({ part: 'board', term });
      const vccFor = (need5) => (need5 ? B_('PWR_5V_' + (bendStep % 2 + 1)) : col ? B_('V' + col.col) : B_('PWR_3V3_1'));
      const gndFor = () => (col ? B_('G' + col.col) : B_('PWR_GND_1'));
      if (p.type === 'led') {
        // resistor on the cathode side keeps the drawing tidy: anode → S, cathode → R → G
        route(P_('A'), B_('S' + near(want.pin)), '#16a34a');
        const r = makePart('resistor', parts, 0, 0, { label: 'R' + (parts.filter((q) => q.type === 'resistor').length + 1) });
        const k = termPos(p, 'K');
        r.rot = 90;
        // a vertical resistor spans y-32 … y+52 around its own origin
        r.x = Math.round(k.x - TYPES.resistor.w / 2);
        r.y = p._side === 'top' ? Math.round(k.y + 50) : Math.round(k.y - 70);
        parts.push(r);
        const rA = termPos(r, 'A'), rB = termPos(r, 'B');
        const first = p._side === 'top' ? (rA.y < rB.y ? 'A' : 'B') : (rA.y > rB.y ? 'A' : 'B');
        const second = first === 'A' ? 'B' : 'A';
        mkWire(P_('K'), { part: r.id, term: first }, '#1f2937');
        const rp = termPos(r, second), gp = boardTermPos(board, 'G' + near(want.pin));
        const w = { id: 'w' + Math.random().toString(36).slice(2, 8), a: { part: r.id, term: second }, b: B_('G' + near(want.pin)), pts: [], color: '#1f2937' };
        if (rp && gp && Math.abs(rp.x - gp.x) > 2) { const ym = p._side === 'top' ? rp.y + 10 + (bendStep % 3) * 5 : rp.y - 10 - (bendStep % 3) * 5; w.pts = [[rp.x, ym], [gp.x, ym]]; }
        bendStep++;
        wires.push(w);
      } else if (p.type === 'button') {
        route(P_('T1'), B_('S' + near(want.pin)), '#16a34a');
        route(P_('T2'), gndFor(), '#1f2937');
      } else if (p.type === 'buzzer') {
        route(P_('P'), B_('S' + near(want.pin)), '#16a34a');
        route(P_('N'), gndFor(), '#1f2937');
      } else if (p.type === 'pot') {
        route(P_('T1'), gndFor(), '#1f2937');
        route(P_('W'), B_('S' + near(want.pin)), '#16a34a');
        route(P_('T2'), B_('PWR_3V3_' + (bendStep % 2 + 1)), '#dc2626');
      } else if (p.type === 'lcd') {
        mkWireL(p, 'GND', 'I2C_GND1', '#1f2937');
        mkWireL(p, 'VCC', 'PWR_5V_1', '#dc2626');
        mkWireL(p, 'SDA', want.pin === 21 ? 'I2C_SDA1' : 'S' + near(want.pin), '#2563eb');
        mkWireL(p, 'SCL', want.pin2 === 22 ? 'I2C_SCL1' : 'S' + near(want.pin2), '#eab308');
      } else if (t.power) {
        const need5 = t.power.need === 5;
        const analog = ['ldr', 'rain', 'soil'].includes(p.type);
        if (t.power.vcc) route(P_(t.power.vcc), analog ? B_('PWR_3V3_' + (bendStep % 2 + 1)) : vccFor(need5), '#dc2626');
        route(P_(t.power.gnd), gndFor(), '#1f2937');
        const cols = ['#16a34a', '#f97316', '#2563eb'];
        ['pin', 'pin2', 'pin3'].forEach((f, i) => {
          const term = t.roles[f];
          const g = want[f];
          if (!term || g === undefined || g === null || g === '') return;
          const c = near(g);
          if (c !== null) route(P_(term), B_('S' + c), cols[i]);
        });
      }
      function mkWireL(part, term, bterm, color) {
        const a = termPos(part, term), b = boardTermPos(board, bterm);
        const w = { id: 'w' + Math.random().toString(36).slice(2, 8), a: { part: part.id, term }, b: { part: 'board', term: bterm }, pts: [], color };
        if (a && b) { const xm = a.x - 20 - (bendStep % 4) * 9; w.pts = [[xm, a.y], [xm, b.y - 36 - (bendStep % 4) * 6], [b.x, b.y - 36 - (bendStep % 4) * 6]]; }
        bendStep++;
        wires.push(w);
      }
    });
    parts.forEach((p) => { delete p._want; delete p._side; delete p._cx; });
    return { parts, wires };
  }

  root.CircuitModel = {
    TYPES, CATS, BOARD, BT, LED_COLORS, el, txt, drawBoard, makePart, termPos, boardTermPos, endPos, partBox,
    solve, applySolve, autoBuild, boardTermInfo, rotPt,
  };
})(window);
