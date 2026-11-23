/* ============================================================
   ESP32 IoT Cloud Simulator — dashboard and Thing views
   ============================================================ */
(function (root) {
  'use strict';

  const { h } = root.BoardUI;
  const NS = 'http://www.w3.org/2000/svg';

  const UNITS = {
    CloudTemperatureSensor: '°C', CloudTemperature: '°C', CloudRelativeHumidity: '%', CloudPercentage: '%',
    CloudIlluminance: 'lux', CloudPressure: 'hPa',
  };
  const RANGES = {
    CloudTemperatureSensor: [-10, 50], CloudTemperature: [-10, 50], CloudRelativeHumidity: [0, 100], CloudPercentage: [0, 100],
    CloudIlluminance: [0, 1000], CloudPressure: [900, 1100],
  };
  const WIDGETS = {
    bool: ['switch', 'status', 'value', 'chart'],
    int: ['value', 'gauge', 'chart', 'slider'],
    float: ['value', 'gauge', 'chart', 'slider'],
    str: ['messenger', 'value'],
  };
  const WIDGET_NAMES = { switch: 'Switch', status: 'Status', value: 'Value', gauge: 'Gauge', chart: 'Chart', slider: 'Slider', messenger: 'Messenger' };

  function kindOf(p) { return p.kind === 'str' ? 'str' : p.kind === 'bool' ? 'bool' : p.kind === 'int' ? 'int' : 'float'; }
  function writable(p) { return p.perm === 'READWRITE' || p.perm === 'WRITE'; }

  function defaultWidgets(p) {
    const k = kindOf(p);
    if (k === 'bool') return writable(p) ? ['switch'] : ['status'];
    if (k === 'str') return ['messenger'];
    if (writable(p)) return ['slider', 'value'];
    if (RANGES[p.type]) return ['gauge', 'chart'];
    return ['value', 'chart'];
  }
  function rangeOf(p, prefs) {
    return (prefs.ranges && prefs.ranges[p.name]) || RANGES[p.type] || [0, 100];
  }
  function fmt(p, v) {
    if (v === null || v === undefined) return '—';
    const k = kindOf(p);
    if (k === 'bool') return v ? 'ON' : 'OFF';
    if (k === 'str') return String(v) || '""';
    if (typeof v !== 'number' || Number.isNaN(v)) return 'nan';
    return k === 'int' ? String(Math.trunc(v)) : (Math.round(v * 100) / 100).toFixed(Number.isInteger(v) ? 0 : 1);
  }
  function ago(t) {
    if (!t) return 'no data yet';
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 2) return 'just now';
    if (s < 60) return s + ' s ago';
    return Math.round(s / 60) + ' min ago';
  }
  function svg(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  /* ---------- dashboard ---------- */
  function renderDashboard(container, props, prefs, api) {
    container.innerHTML = '';
    const updaters = [];
    props.forEach((p) => {
      const list = (prefs.widgets && prefs.widgets[p.name]) || defaultWidgets(p);
      list.forEach((w) => {
        if (!WIDGETS[kindOf(p)].includes(w)) return;
        const u = makeWidget(container, p, w, prefs, api);
        if (u) updaters.push(u);
      });
    });
    return (store) => updaters.forEach((u) => u(store[u.name] || null));
  }

  function makeWidget(container, p, w, prefs, api) {
    const unit = UNITS[p.type] || '';
    const foot = h('div', { class: 'w-foot' }, '');
    const body = h('div', { class: 'w-body' });
    const card = h('div', { class: 'widget' + (w === 'chart' || w === 'messenger' ? ' wide' : ''), 'data-w': w },
      h('div', { class: 'w-head' }, h('span', { class: 'w-name', title: p.name }, p.name), h('span', { class: 'w-kind' }, WIDGET_NAMES[w])),
      body, foot);
    container.append(card);
    const canWrite = writable(p);
    let update;

    if (w === 'switch') {
      const sw = h('button', { class: 'switch big', type: 'button', role: 'switch', 'aria-checked': 'false', 'aria-label': p.name });
      sw.append(h('span'));
      if (!canWrite) { sw.disabled = true; sw.title = 'READ-only variable'; }
      sw.addEventListener('click', () => {
        const next = sw.getAttribute('aria-checked') !== 'true';
        sw.setAttribute('aria-checked', String(next));
        api.write(p.name, next);
      });
      const lab = h('span', { class: 'var-val' }, 'OFF');
      body.append(sw, lab);
      update = (rec) => {
        const v = rec ? !!rec.value : false;
        sw.setAttribute('aria-checked', String(v));
        lab.textContent = rec ? (v ? 'ON' : 'OFF') : '—';
      };
    } else if (w === 'status') {
      const led = h('div', { class: 'w-led' });
      const lab = h('span', { class: 'var-val' }, '—');
      body.append(led, lab);
      update = (rec) => {
        const v = rec ? !!rec.value : false;
        led.classList.toggle('on', v);
        lab.textContent = rec ? (v ? 'true' : 'false') : '—';
      };
    } else if (w === 'value') {
      const big = h('div', { class: 'w-big' }, '—');
      body.append(big);
      update = (rec) => {
        big.textContent = '';
        big.append(fmt(p, rec ? rec.value : null));
        if (unit && rec) big.append(h('span', { class: 'w-unit' }, unit));
      };
    } else if (w === 'gauge') {
      const s = document.createElementNS(NS, 'svg');
      s.setAttribute('viewBox', '0 0 140 84');
      const R = 52, L = Math.PI * R;
      svg('path', { d: 'M18 74 A52 52 0 0 1 122 74', fill: 'none', stroke: 'var(--sunk-2)', 'stroke-width': 11, 'stroke-linecap': 'round' }, s);
      const arc = svg('path', { d: 'M18 74 A52 52 0 0 1 122 74', fill: 'none', stroke: 'var(--accent)', 'stroke-width': 11, 'stroke-linecap': 'round', 'stroke-dasharray': '0 ' + L }, s);
      const txt = svg('text', { x: 70, y: 66, 'text-anchor': 'middle', 'font-size': 20, 'font-weight': 600, fill: 'var(--ink)', 'font-family': 'IBM Plex Sans, sans-serif' }, s);
      const [mn, mx] = rangeOf(p, prefs);
      const lo = svg('text', { x: 18, y: 83, 'text-anchor': 'middle', 'font-size': 8, fill: 'var(--ink-4)', 'font-family': 'IBM Plex Mono, monospace' }, s);
      const hi = svg('text', { x: 122, y: 83, 'text-anchor': 'middle', 'font-size': 8, fill: 'var(--ink-4)', 'font-family': 'IBM Plex Mono, monospace' }, s);
      lo.textContent = mn; hi.textContent = mx;
      body.append(s);
      update = (rec) => {
        const v = rec ? +rec.value : NaN;
        const f = Number.isFinite(v) ? Math.max(0, Math.min(1, (v - mn) / (mx - mn || 1))) : 0;
        arc.setAttribute('stroke-dasharray', (f * L).toFixed(1) + ' ' + L);
        txt.textContent = rec ? fmt(p, v) + (unit ? ' ' + unit : '') : '—';
      };
    } else if (w === 'chart') {
      const W = 300, H = 92;
      const s = document.createElementNS(NS, 'svg');
      s.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      s.setAttribute('preserveAspectRatio', 'none');
      s.style.height = '96px';
      [0.25, 0.5, 0.75].forEach((f) => svg('line', { x1: 0, x2: W, y1: H * f, y2: H * f, stroke: 'var(--line)', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }, s));
      const area = svg('path', { d: '', fill: 'var(--accent-soft)' }, s);
      const line = svg('polyline', { points: '', fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round' }, s);
      const scale = h('div', { class: 'w-foot', style: 'text-align:left;align-self:stretch' }, '');
      body.style.alignItems = 'stretch';
      body.append(s, scale);
      update = (rec) => {
        const hist = rec ? rec.history.filter((x) => typeof x.v === 'number' && Number.isFinite(x.v)).slice(-80) : [];
        if (hist.length < 1) { line.setAttribute('points', ''); area.setAttribute('d', ''); scale.textContent = 'waiting for data…'; return; }
        let mn = Math.min(...hist.map((x) => x.v)), mx = Math.max(...hist.map((x) => x.v));
        if (mx - mn < 1e-9) { mn -= 1; mx += 1; }
        const pad = (mx - mn) * 0.12; mn -= pad; mx += pad;
        const t1 = Date.now(), t0 = Math.min(hist[0].t, t1 - 30000);
        const X = (t) => ((t - t0) / (t1 - t0 || 1)) * W;
        const Y = (v) => H - ((v - mn) / (mx - mn)) * H;
        // step-hold to "now" so the last value stays visible
        const pts = hist.map((x) => X(x.t).toFixed(1) + ',' + Y(x.v).toFixed(1));
        pts.push(W + ',' + Y(hist[hist.length - 1].v).toFixed(1));
        line.setAttribute('points', pts.join(' '));
        area.setAttribute('d', 'M' + X(hist[0].t).toFixed(1) + ',' + H + ' L' + pts.join(' L') + ' L' + W + ',' + H + ' Z');
        scale.textContent = 'last ' + Math.round((t1 - t0) / 1000) + ' s · min ' + fmt(p, Math.min(...hist.map((x) => x.v))) + ' · max ' + fmt(p, Math.max(...hist.map((x) => x.v))) + (unit ? ' ' + unit : '');
      };
    } else if (w === 'slider') {
      const [mn, mx] = rangeOf(p, prefs);
      const r = h('input', { type: 'range', min: mn, max: mx, step: kindOf(p) === 'int' ? 1 : (mx - mn) / 200, 'aria-label': p.name });
      const big = h('div', { class: 'w-big' }, '—');
      if (!canWrite) { r.disabled = true; r.title = 'READ-only variable'; }
      let dragging = false;
      r.addEventListener('input', () => { dragging = true; big.textContent = fmt(p, +r.value); });
      r.addEventListener('change', () => { dragging = false; api.write(p.name, kindOf(p) === 'int' ? Math.round(+r.value) : +r.value); });
      body.append(big, r);
      update = (rec) => {
        if (dragging) return;
        if (rec && typeof rec.value === 'number') r.value = rec.value;
        big.textContent = '';
        big.append(fmt(p, rec ? rec.value : null));
        if (unit && rec) big.append(h('span', { class: 'w-unit' }, unit));
      };
    } else if (w === 'messenger') {
      const list = h('div', { class: 'msg-list', role: 'log', 'aria-label': p.name + ' messages' });
      body.style.alignItems = 'stretch';
      body.style.justifyContent = 'flex-start';
      body.append(list);
      if (canWrite) {
        const inp = h('input', { type: 'text', placeholder: 'Send to device…', 'aria-label': 'Message for ' + p.name });
        const f = h('form', { class: 'msg-form' }, inp, h('button', { class: 'btn small', type: 'submit' }, 'Send'));
        f.addEventListener('submit', (e) => { e.preventDefault(); if (!inp.value) return; api.write(p.name, inp.value); inp.value = ''; });
        body.append(f);
      }
      let shown = -1;
      update = (rec) => {
        const hist = rec ? rec.history : [];
        const key = hist.length ? hist[hist.length - 1].t + ':' + hist.length : 0;
        if (key === shown) return;
        shown = key;
        list.innerHTML = '';
        if (!hist.length) list.append(h('span', { class: 'var-val' }, 'No messages yet'));
        hist.slice(-30).forEach((m) => {
          const d = new Date(m.t);
          list.append(h('div', { class: 'msg' + (m.src === 'dashboard' ? ' me' : ''), title: d.toLocaleTimeString() }, String(m.v)));
        });
        list.scrollTop = list.scrollHeight;
      };
    }
    const wrapped = (rec) => {
      update(rec);
      foot.textContent = rec ? ago(rec.t) : 'no data yet';
    };
    Object.defineProperty(wrapped, 'name', { value: p.name });
    return wrapped;
  }

  /* ---------- Thing view ---------- */
  function renderThing(container, props, prefs, info, api) {
    container.innerHTML = '';
    const dl = h('dl', { class: 'thing-meta' },
      h('dt', null, 'Device'), h('dd', null, 'ESP32 Dev Module (simulated)'),
      h('dt', null, 'Device ID'), h('dd', null, info.deviceId || '—'),
      h('dt', null, 'Thing ID'), h('dd', null, info.thingId || '—'),
      h('dt', null, 'Messages'), h('dd', { id: 'thingStats' }, '—'));
    container.append(dl);
    if (!props.length) {
      container.append(h('p', { class: 'net-note' }, 'This sketch registers no cloud variables. Arduino Cloud lists them in thingProperties.h as ArduinoCloud.addProperty(name, PERMISSION, POLICY, callback).'));
      return;
    }
    const list = h('div', { class: 'var-list' });
    props.forEach((p) => {
      const k = kindOf(p);
      const cur = (prefs.widgets && prefs.widgets[p.name]) || defaultWidgets(p);
      const row = h('div', { class: 'var-row' }, h('span', { class: 'muted' }, 'Widgets:'));
      WIDGETS[k].forEach((w) => {
        const cb = h('input', { type: 'checkbox' });
        cb.checked = cur.includes(w);
        cb.addEventListener('change', () => {
          const now = new Set((prefs.widgets && prefs.widgets[p.name]) || defaultWidgets(p));
          if (cb.checked) now.add(w); else now.delete(w);
          api.setWidgets(p.name, WIDGETS[k].filter((x) => now.has(x)));
        });
        row.append(h('label', null, cb, WIDGET_NAMES[w]));
      });
      const card = h('div', { class: 'var' },
        h('div', { class: 'var-top' },
          h('span', null, h('span', { class: 'var-name' }, p.name), ' ', h('span', { class: 'var-type' }, p.type)),
          h('span', { class: 'var-perm' + (writable(p) ? ' rw' : '') }, p.perm === 'READWRITE' ? 'READ & WRITE' : p.perm === 'WRITE' ? 'WRITE' : 'READ ONLY')),
        row);
      if (k === 'int' || k === 'float') {
        const [mn, mx] = rangeOf(p, prefs);
        const a = h('input', { type: 'number', value: mn, 'aria-label': p.name + ' minimum' });
        const b = h('input', { type: 'number', value: mx, 'aria-label': p.name + ' maximum' });
        const set = () => { if (+b.value > +a.value) api.setRange(p.name, [+a.value, +b.value]); };
        a.addEventListener('change', set);
        b.addEventListener('change', set);
        card.append(h('div', { class: 'var-row' }, h('span', { class: 'muted' }, 'Gauge / slider range'), a, '–', b));
      }
      list.append(card);
    });
    container.append(list);
  }

  root.CloudUI = { renderDashboard, renderThing, defaultWidgets };
})(window);
