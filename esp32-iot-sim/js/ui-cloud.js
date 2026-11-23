/* ============================================================
   ESP32 IoT Simulator — IoT Cloud pane
   Laid out like the Arduino Cloud web app: a side menu with
   Things, Dashboards, Devices and Triggers. Adding a variable
   regenerates thingProperties.h and adds the callback stub to
   the sketch, the same way the real Thing editor does.
   ============================================================ */
(function (root) {
  'use strict';

  const h = root.CircuitUI.h;
  const NS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function icon(d, size) {
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('width', size || 20);
    s.setAttribute('height', size || 20);
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '1.8');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true');
    d.split('|').forEach((p) => svg('path', { d: p }, s));
    return s;
  }
  const IC = {
    home: 'M3 11l9-7 9 7|M5 10v10h14V10',
    thing: 'M12 3l8 4.5v9L12 21l-8-4.5v-9z|M12 12l8-4.5|M12 12v9|M12 12L4 7.5',
    dash: 'M4 4h7v9H4z|M13 4h7v5h-7z|M13 11h7v9h-7z|M4 15h7v5H4z',
    device: 'M7 3h10v18H7z|M10 18h4|M9 3v2|M15 3v2',
    trigger: 'M13 2L4 14h7l-1 8 9-12h-7z',
    plus: 'M12 5v14|M5 12h14',
    back: 'M15 18l-6-6 6-6',
    edit: 'M4 20h4L19 9l-4-4L4 16z|M14 6l4 4',
    lock: 'M6 11h12v9H6z|M8 11V8a4 4 0 0 1 8 0v3',
    dots: 'M12 5h.01|M12 12h.01|M12 19h.01',
    trash: 'M4 7h16|M10 11v6|M14 11v6|M6 7l1 13h10l1-13|M9 7V4h6v3',
    code: 'M8 8l-4 4 4 4|M16 8l4 4-4 4',
    wifi: 'M2 9a15 15 0 0 1 20 0|M5 12.5a10 10 0 0 1 14 0|M8.5 16a5 5 0 0 1 7 0|M12 19.5h.01',
    bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4z|M10 21h4',
    x: 'M6 6l12 12|M18 6L6 18',
  };

  /* ---------------- variable types ---------------- */
  const VAR_TYPES = [
    { group: 'Basic types', items: [['bool', 'Boolean'], ['String', 'Character String'], ['float', 'Floating Point Number'], ['int', 'Integer Number']] },
    { group: 'Specialized types', items: [['CloudSwitch', 'Switch'], ['CloudLight', 'Light'], ['CloudMotionSensor', 'Motion sensor'], ['CloudCounter', 'Counter'],
      ['CloudTemperatureSensor', 'Temperature sensor (°C)'], ['CloudRelativeHumidity', 'Relative humidity (%)'], ['CloudPercentage', 'Percentage (%)'], ['CloudIlluminance', 'Illuminance (lux)']] },
  ];
  const TYPE_LABEL = {};
  VAR_TYPES.forEach((g) => g.items.forEach(([t, l]) => { TYPE_LABEL[t] = l; }));
  const UNITS = { CloudTemperatureSensor: '°C', CloudTemperature: '°C', CloudRelativeHumidity: '%', CloudPercentage: '%', CloudIlluminance: 'lux', CloudPressure: 'hPa' };
  const RANGES = { CloudTemperatureSensor: [-10, 50], CloudTemperature: [-10, 50], CloudRelativeHumidity: [0, 100], CloudPercentage: [0, 100], CloudIlluminance: [0, 1000], CloudPressure: [900, 1100] };

  function kindOf(p) { return p.kind === 'str' ? 'str' : p.kind === 'bool' ? 'bool' : p.kind === 'int' ? 'int' : 'float'; }
  function kindOfType(t) {
    if (['bool', 'CloudSwitch', 'CloudLight', 'CloudMotionSensor', 'CloudContactSensor', 'CloudSmartPlug'].includes(t)) return 'bool';
    if (t === 'String') return 'str';
    if (t === 'int' || t === 'CloudCounter') return 'int';
    return 'float';
  }
  function writable(p) { return p.perm === 'READWRITE' || p.perm === 'WRITE'; }

  /* ---------------- widgets ---------------- */
  const WIDGETS = {
    switch: { name: 'Switch', kinds: ['bool'], write: true, icon: 'M5 9h14a3 3 0 0 1 0 6H5a3 3 0 0 1 0-6z|M16 12h.01' },
    push: { name: 'Push Button', kinds: ['bool'], write: true, icon: 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16|M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8' },
    slider: { name: 'Slider', kinds: ['int', 'float'], write: true, icon: 'M4 12h16|M9 9v6' },
    stepper: { name: 'Stepper', kinds: ['int', 'float'], write: true, icon: 'M4 8h16v8H4z|M8 12h2|M15 11v2|M14 12h2' },
    value: { name: 'Value', kinds: ['int', 'float', 'str', 'bool'], icon: 'M7 8h10|M7 12h10|M7 16h6' },
    led: { name: 'LED', kinds: ['bool'], icon: 'M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10' },
    status: { name: 'Status', kinds: ['bool'], icon: 'M5 12l4 4 10-10' },
    gauge: { name: 'Gauge', kinds: ['int', 'float'], icon: 'M4 16a8 8 0 0 1 16 0|M12 16l4-5' },
    percentage: { name: 'Percentage', kinds: ['int', 'float'], icon: 'M12 3a9 9 0 1 0 9 9|M12 3v9h9' },
    chart: { name: 'Chart', kinds: ['int', 'float', 'bool'], wide: true, icon: 'M4 19h16|M5 15l4-5 4 3 6-7' },
    messenger: { name: 'Messenger', kinds: ['str'], wide: true, icon: 'M4 5h16v11H8l-4 4z' },
  };
  const ORDER = ['switch', 'push', 'slider', 'stepper', 'value', 'led', 'status', 'gauge', 'percentage', 'chart', 'messenger'];

  function defaultWidgetsFor(p) {
    const k = kindOf(p);
    if (k === 'bool') return writable(p) ? ['switch'] : ['led'];
    if (k === 'str') return ['messenger'];
    if (writable(p)) return ['slider'];
    if (RANGES[p.type]) return ['gauge', 'chart'];
    return ['value', 'chart'];
  }
  function rangeOf(w, p) {
    if (w.min !== undefined && w.max !== undefined && +w.max > +w.min) return [+w.min, +w.max];
    return (p && RANGES[p.type]) || [0, 100];
  }
  function fmt(p, v) {
    if (v === null || v === undefined) return '—';
    const k = kindOf(p);
    if (k === 'bool') return v ? 'true' : 'false';
    if (k === 'str') return String(v);
    if (typeof v !== 'number' || Number.isNaN(v)) return 'nan';
    if (k === 'int') return String(Math.trunc(v));
    const r = Math.round(v * 100) / 100;
    return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/0$/, '');
  }
  function ago(t) {
    if (!t) return '—';
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 2) return 'just now';
    if (s < 60) return s + ' sec ago';
    return Math.round(s / 60) + ' min ago';
  }
  const uid = (p) => p + Math.random().toString(36).slice(2, 8);

  /* ================================================================
     thingProperties.h  ↔  variable list
     ================================================================ */
  function parseThing(files) {
    const src = files['thingProperties.h'] || '';
    const dl = /DEVICE_LOGIN_NAME\s*\[\s*\]\s*=\s*"([^"]*)"/.exec(src);
    const types = {};
    src.split('\n').forEach((l) => {
      const m = /^\s*((?:(?:unsigned|signed|const|long|short)\s+)*[A-Za-z_]\w*)\s+([A-Za-z_]\w*)\s*;/.exec(l);
      if (m && !/^(return|void)$/.test(m[1])) types[m[2]] = m[1].replace(/^const\s+/, '').replace(/\s+/g, ' ');
    });
    const vars = [];
    const re = /ArduinoCloud\s*\.\s*addProperty\s*\(\s*([A-Za-z_]\w*)\s*,\s*([A-Za-z_][\w:]*)\s*,\s*([^,)]+?)\s*(?:,\s*([A-Za-z_]\w*)\s*)?(?:,\s*([^,)]+?)\s*)?\)/g;
    let m;
    while ((m = re.exec(src))) {
      const pol = m[3];
      let policy = 'change', period = 0;
      const pm = /(\d+(?:\.\d+)?)\s*\*\s*(SECONDS|MINUTES|HOURS)/.exec(pol);
      if (pm) { policy = 'periodic'; period = +pm[1] * (pm[2] === 'MINUTES' ? 60 : pm[2] === 'HOURS' ? 3600 : 1); }
      else if (/^\d+$/.test(pol.trim())) { policy = 'periodic'; period = +pol.trim(); }
      const perm = /ReadWrite|READWRITE/.test(m[2]) ? 'READWRITE' : /Write|WRITE/.test(m[2]) ? 'WRITE' : 'READ';
      vars.push({ name: m[1], type: types[m[1]] || 'float', perm, policy, period, cb: m[4] && m[4] !== 'NULL' ? m[4] : null, delta: m[5] ? +m[5] || 0 : 0 });
    }
    return { exists: !!files['thingProperties.h'], deviceLogin: dl ? dl[1] : '', vars };
  }
  function cbName(name) { return 'on' + name.charAt(0).toUpperCase() + name.slice(1) + 'Change'; }
  function generateThing(deviceLogin, vars) {
    const protos = vars.filter((v) => v.perm === 'READWRITE' && v.cb).map((v) => 'void ' + v.cb + '();').join('\n');
    const decls = vars.map((v) => v.type + ' ' + v.name + ';').join('\n');
    const props = vars.map((v) => {
      const pol = v.policy === 'periodic' ? Math.max(1, Math.round(v.period || 1)) + ' * SECONDS' : 'ON_CHANGE';
      const cb = v.perm === 'READWRITE' && v.cb ? v.cb : 'NULL';
      const delta = v.policy === 'change' && v.delta ? ', ' + v.delta : '';
      return '  ArduinoCloud.addProperty(' + v.name + ', ' + v.perm + ', ' + pol + ', ' + cb + delta + ');';
    }).join('\n');
    return '// Code generated by Arduino IoT Cloud, DO NOT EDIT.\n\n#include <ArduinoIoTCloud.h>\n#include <Arduino_ConnectionHandler.h>\n#include "arduino_secrets.h"\n\n' +
      'const char DEVICE_LOGIN_NAME[]  = "' + (deviceLogin || '4b1e0f6a-esp32-sim') + '";\n\n' +
      'const char SSID[]               = SECRET_SSID;          // Network SSID (name)\n' +
      'const char PASS[]               = SECRET_OPTIONAL_PASS; // Network password\n' +
      'const char DEVICE_KEY[]         = SECRET_DEVICE_KEY;    // Secret device password\n' +
      (protos ? '\n' + protos + '\n' : '') + '\n' + decls + (decls ? '\n' : '') + '\nvoid initProperties(){\n\n  ArduinoCloud.setBoardId(DEVICE_LOGIN_NAME);\n  ArduinoCloud.setSecretDeviceKey(DEVICE_KEY);\n' +
      props + (props ? '\n' : '') + '\n}\n\nWiFiConnectionHandler ArduinoIoTPreferredConnection(SSID, PASS);\n';
  }
  function updateSketch(sketch, vars, added, old) {
    let s = sketch;
    if (old && added && old.name !== added.name) {
      // a rename carries the sketch along: the variable and its callback
      s = s.replace(new RegExp('\\b' + old.name + '\\b', 'g'), added.name);
      if (old.cb && added.cb && old.cb !== added.cb) s = s.replace(new RegExp('\\b' + old.cb + '\\b', 'g'), added.cb);
    }
    // refresh the "Variables description" comment the Cloud keeps at the top
    const head = /(Arduino IoT Cloud Variables description[\s\S]*?)(\n\s*Variables which are marked as READ\/WRITE)/.exec(s);
    if (head) {
      const body = head[1].split('\n');
      const first = body.shift();
      const kept = body.filter((l) => !/^\s*[A-Za-z_]\w*\s+[A-Za-z_]\w*\s*;/.test(l));
      while (kept.length && !kept[kept.length - 1].trim()) kept.pop();
      const list = vars.map((v) => '  ' + v.type + ' ' + v.name + ';' + (v.perm === 'READWRITE' ? '  // READ/WRITE' : '  // READ'));
      const rebuilt = [first].concat(kept.length ? kept : [''], kept.length ? [''] : [], list).join('\n');
      s = s.slice(0, head.index) + rebuilt + '\n' + s.slice(head.index + head[1].length);
    }
    if (added && !/#include\s+"thingProperties\.h"/.test(s)) {
      // turn a plain sketch into a cloud sketch, as a new Thing sketch would be
      s = '#include "thingProperties.h"\n\n' + s;
      s = s.replace(/void\s+setup\s*\(\s*\)\s*\{/, (m) => m + '\n  // Defined in thingProperties.h\n  initProperties();\n  // Connect to Arduino IoT Cloud\n  ArduinoCloud.begin(ArduinoIoTPreferredConnection);\n');
      s = s.replace(/void\s+loop\s*\(\s*\)\s*\{/, (m) => m + '\n  ArduinoCloud.update();\n');
    }
    if (added && added.perm === 'READWRITE' && added.cb && !new RegExp('void\\s+' + added.cb + '\\s*\\(').test(s)) {
      const nm = added.name.charAt(0).toUpperCase() + added.name.slice(1);
      s = s.replace(/\s*$/, '\n') + '\n/*\n  Since ' + nm + ' is READ_WRITE variable, ' + added.cb + '() is\n  executed every time a new value is received from IoT Cloud.\n*/\nvoid ' + added.cb + '()  {\n  // Add your code here to act upon ' + nm + ' change\n}\n';
    }
    return s;
  }
  const SECRETS_TEMPLATE = '#define SECRET_SSID "SimLab-WiFi"\n#define SECRET_OPTIONAL_PASS "esp32sim"\n#define SECRET_DEVICE_KEY "SIMULATED-DEVICE-KEY"\n';
  function readSecrets(files) {
    const s = files['arduino_secrets.h'] || '';
    const g = (k) => { const m = new RegExp('#define\\s+' + k + '\\s+"([^"]*)"').exec(s); return m ? m[1] : ''; };
    return { ssid: g('SECRET_SSID'), pass: g('SECRET_OPTIONAL_PASS'), key: g('SECRET_DEVICE_KEY') };
  }
  function writeSecrets(files, ssid, pass) {
    let s = files['arduino_secrets.h'] || SECRETS_TEMPLATE;
    const set = (k, v) => {
      const re = new RegExp('(#define\\s+' + k + '\\s+)"[^"]*"');
      if (re.test(s)) s = s.replace(re, '$1"' + v.replace(/["\\]/g, '') + '"');
      else s += '#define ' + k + ' "' + v.replace(/["\\]/g, '') + '"\n';
    };
    set('SECRET_SSID', ssid);
    set('SECRET_OPTIONAL_PASS', pass);
    return s;
  }

  /* ================================================================
     Pane
     ================================================================ */
  let api = null;
  let host = null;
  let view = 'thing';
  let thingTab = 'setup';
  let editMode = false;
  let ticks = [];          // per-frame updaters for the current view
  let modalEl = null;

  function mount(container, a) {
    api = a;
    host = container;
    view = api.getState().cloudView || 'thing';
    render();
  }

  function nav(v) {
    view = v;
    editMode = false;
    const st = api.getState();
    st.cloudView = v;
    api.save();
    render();
  }

  function render() {
    host.innerHTML = '';
    ticks = [];
    const st = api.getState();
    const items = [['thing', 'Things', IC.thing], ['dashboard', 'Dashboards', IC.dash], ['devices', 'Devices', IC.device], ['triggers', 'Triggers', IC.trigger]];
    const rail = h('nav', { class: 'ac-rail', 'aria-label': 'IoT Cloud menu' },
      h('div', { class: 'ac-logo', title: 'IoT Cloud (simulated)' }, logo()),
      ...items.map(([k, l, ic]) => {
        const on = view === k || (k === 'thing' && view === 'things') || (k === 'dashboard' && view === 'dashboards');
        const b = h('button', { class: 'ac-nav' + (on ? ' on' : ''), type: 'button', 'aria-current': on ? 'page' : null, title: l, onclick: () => nav(k === 'thing' ? 'thing' : k) }, icon(ic, 20), h('span', null, l));
        if (k === 'triggers' && st._unseenAlerts) b.append(h('i', { class: 'ac-dot' }, String(st._unseenAlerts)));
        return b;
      }));
    const main = h('div', { class: 'ac-main' });
    host.append(rail, main);
    if (view === 'thing') renderThing(main);
    else if (view === 'things') renderThings(main);
    else if (view === 'dashboard') renderDashboard(main);
    else if (view === 'dashboards') renderDashboards(main);
    else if (view === 'devices') renderDevices(main);
    else if (view === 'triggers') renderTriggers(main);
  }
  function logo() {
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 32 32');
    s.setAttribute('width', 28);
    s.setAttribute('height', 28);
    s.setAttribute('aria-hidden', 'true');
    svg('circle', { cx: 16, cy: 16, r: 15, fill: '#008184' }, s);
    svg('path', { d: 'M10 20h12a4 4 0 0 0 0-8 6 6 0 0 0-11.3-1.6A4.8 4.8 0 0 0 10 20z', fill: '#fff' }, s);
    return s;
  }
  function pageHead(main, title, crumbs, right) {
    const head = h('header', { class: 'ac-head' });
    const left = h('div', { class: 'ac-titlebox' });
    if (crumbs) left.append(h('button', { class: 'ac-crumb', type: 'button', onclick: crumbs[1] }, icon(IC.back, 14), crumbs[0]));
    left.append(title);
    head.append(left);
    if (right) head.append(h('div', { class: 'ac-head-r' }, ...[].concat(right)));
    main.append(head);
    return head;
  }
  function devicePill() {
    const d = api.device();
    const pill = h('span', { class: 'ac-status', 'data-state': d.status }, h('i'), d.status === 'online' ? 'Online' : d.status === 'connecting' ? 'Connecting' : 'Offline');
    ticks.push(() => {
      const s = api.device().status;
      if (pill.dataset.state !== s) {
        pill.dataset.state = s;
        pill.lastChild.textContent = s === 'online' ? 'Online' : s === 'connecting' ? 'Connecting' : 'Offline';
      }
    });
    return pill;
  }

  /* ---------------- Things ---------------- */
  function renderThings(main) {
    const st = api.getState();
    const t = parseThing(st.files);
    pageHead(main, h('h2', null, 'Things'), null, h('button', { class: 'ac-btn', type: 'button', onclick: () => nav('thing') }, icon(IC.plus, 16), 'THING'));
    const tbl = h('div', { class: 'ac-card ac-table' },
      h('div', { class: 'ac-tr ac-th' }, h('span', null, 'Name'), h('span', null, 'Device'), h('span', null, 'Variables')),
      h('button', { class: 'ac-tr link', type: 'button', onclick: () => nav('thing') }, h('span', { class: 'b' }, st.thingName), h('span', null, 'ESP32-Sim'), h('span', null, String(t.vars.length))));
    main.append(h('div', { class: 'ac-body' }, tbl));
  }

  function renderThing(main) {
    const st = api.getState();
    const name = h('input', { class: 'ac-title-in', type: 'text', value: st.thingName, 'aria-label': 'Thing name', maxlength: 40 });
    name.addEventListener('change', () => { st.thingName = name.value.trim() || 'Untitled'; api.save(); });
    pageHead(main, name, ['Things', () => nav('things')], devicePill());
    const tabs = h('div', { class: 'ac-tabs', role: 'tablist' });
    [['setup', 'Setup'], ['sketch', 'Sketch'], ['metadata', 'Metadata']].forEach(([k, l]) => {
      tabs.append(h('button', { class: 'ac-tab' + (thingTab === k ? ' on' : ''), role: 'tab', 'aria-selected': String(thingTab === k), type: 'button', onclick: () => { thingTab = k; render(); } }, l));
    });
    main.append(tabs);
    const body = h('div', { class: 'ac-body' });
    main.append(body);
    if (thingTab === 'setup') thingSetup(body);
    else if (thingTab === 'sketch') thingSketch(body);
    else thingMeta(body);
  }

  function thingSetup(body) {
    const st = api.getState();
    const t = parseThing(st.files);
    const props = api.props();
    const card = h('section', { class: 'ac-card' });
    const add = h('button', { class: 'ac-btn small', type: 'button', onclick: () => variableDialog(null) }, 'ADD');
    card.append(h('div', { class: 'ac-card-h' }, h('h3', null, 'Cloud Variables'), add));
    if (!t.vars.length) {
      card.append(h('div', { class: 'ac-empty' },
        h('p', null, t.exists ? 'No variables yet.' : 'This sketch is not linked to the cloud (there is no thingProperties.h).'),
        h('p', { class: 'muted' }, 'Add a variable and the Thing writes thingProperties.h and the callback for you.')));
    } else {
      const tbl = h('div', { class: 'ac-table vars' }, h('div', { class: 'ac-tr ac-th' }, h('span', null, 'Name'), h('span', null, 'Last Value'), h('span', null, 'Last Update'), h('span')));
      t.vars.forEach((v) => {
        const p = props.find((x) => x.name === v.name) || { name: v.name, kind: kindOfType(v.type), type: v.type, perm: v.perm };
        const val = h('span', { class: 'mono' }, '—');
        const when = h('span', { class: 'muted' }, '—');
        const menu = h('button', { class: 'ac-icon', type: 'button', 'aria-label': 'Variable options for ' + v.name, title: 'Edit or delete', onclick: (e) => rowMenu(e, v) }, icon(IC.dots, 18));
        tbl.append(h('div', { class: 'ac-tr' },
          h('span', null, h('b', null, v.name), h('small', null, v.type + ' ' + v.name + ';'), h('small', { class: 'perm' }, (v.perm === 'READWRITE' ? 'Read & Write' : 'Read Only') + ' · ' + (v.policy === 'periodic' ? 'every ' + v.period + ' s' : 'on change'))),
          val, when, menu));
        ticks.push((store) => {
          const rec = store[v.name];
          const s = rec ? fmt(p, rec.value) : '—';
          if (val.textContent !== s) val.textContent = s;
          const a = rec ? ago(rec.t) : '—';
          if (when.textContent !== a) when.textContent = a;
        });
      });
      card.append(tbl);
    }
    body.append(card);

    // device + network
    const d = api.device();
    const devCard = h('section', { class: 'ac-card' },
      h('div', { class: 'ac-card-h' }, h('h3', null, 'Associated Device')),
      h('div', { class: 'ac-dev' }, h('div', { class: 'ac-dev-ic' }, icon(IC.device, 22)),
        h('div', null, h('b', null, 'ESP32-Sim'), h('div', { class: 'muted' }, 'ESP32 Dev Module · ID ' + (d.deviceId || '—'))), devicePill()));
    const sec = readSecrets(st.files);
    const net = h('section', { class: 'ac-card' },
      h('div', { class: 'ac-card-h' }, h('h3', null, 'Network'), h('button', { class: 'ac-link', type: 'button', onclick: networkDialog }, 'Change')),
      h('dl', { class: 'ac-dl' }, h('dt', null, 'Wi-Fi Name'), h('dd', null, sec.ssid || '—'), h('dt', null, 'Password'), h('dd', null, sec.pass ? '•'.repeat(Math.min(12, sec.pass.length)) : '—')));
    body.append(devCard, net);
  }

  function rowMenu(e, v) {
    closeMenu();
    const r = e.currentTarget.getBoundingClientRect();
    const hr = host.getBoundingClientRect();
    const m = h('div', { class: 'ac-menu', role: 'menu', style: 'top:' + (r.bottom - hr.top + 4) + 'px;right:' + (hr.right - r.right) + 'px' },
      h('button', { type: 'button', role: 'menuitem', onclick: () => { closeMenu(); variableDialog(v); } }, 'Edit'),
      h('button', { type: 'button', role: 'menuitem', class: 'danger', onclick: () => { closeMenu(); deleteVariable(v); } }, 'Delete'));
    host.append(m);
    setTimeout(() => document.addEventListener('pointerdown', outside), 0);
    function outside(ev) { if (!m.contains(ev.target)) closeMenu(); }
    m._off = () => document.removeEventListener('pointerdown', outside);
  }
  function closeMenu() { host.querySelectorAll('.ac-menu').forEach((m) => { if (m._off) m._off(); m.remove(); }); }

  function variableDialog(existing) {
    const st = api.getState();
    const t = parseThing(st.files);
    const nameIn = h('input', { type: 'text', value: existing ? existing.name : '', placeholder: 'e.g. temperature', 'aria-label': 'Name', maxlength: 40, autocomplete: 'off' });
    const typeSel = h('select', { 'aria-label': 'Variable type' }, ...VAR_TYPES.map((g) => h('optgroup', { label: g.group }, ...g.items.map(([v, l]) => h('option', { value: v, selected: existing && existing.type === v ? '' : null }, l)))));
    if (!existing) typeSel.value = 'bool';
    const decl = h('code', { class: 'ac-decl' });
    const permRW = h('input', { type: 'radio', name: 'perm', value: 'READWRITE' });
    const permR = h('input', { type: 'radio', name: 'perm', value: 'READ' });
    (existing && existing.perm !== 'READWRITE' ? permR : permRW).checked = true;
    const polC = h('input', { type: 'radio', name: 'pol', value: 'change' });
    const polP = h('input', { type: 'radio', name: 'pol', value: 'periodic' });
    (existing && existing.policy === 'periodic' ? polP : polC).checked = true;
    const thr = h('input', { type: 'number', min: 0, step: 'any', value: existing ? existing.delta || 0 : 0, 'aria-label': 'Threshold' });
    const every = h('input', { type: 'number', min: 1, step: 1, value: existing && existing.period ? existing.period : 1, 'aria-label': 'Seconds' });
    const err = h('p', { class: 'ac-err', hidden: true });
    const upd = () => {
      decl.textContent = typeSel.value + ' ' + (nameIn.value.trim() || 'name') + ';';
      const numeric = ['int', 'float'].includes(kindOfType(typeSel.value));
      thr.parentElement.hidden = !polC.checked || !numeric;
      if (!numeric) thr.value = 0;
      every.parentElement.hidden = !polP.checked;
    };
    [nameIn, typeSel, polC, polP].forEach((x) => x.addEventListener('input', upd));
    [polC, polP].forEach((x) => x.addEventListener('change', upd));
    const form = h('form', { class: 'ac-form' },
      h('label', { class: 'ac-field' }, h('span', null, 'Name'), nameIn),
      h('label', { class: 'ac-field' }, h('span', null, 'Select variable type'), typeSel),
      h('div', { class: 'ac-field' }, h('span', null, 'Declaration'), decl),
      h('fieldset', { class: 'ac-field' }, h('legend', null, 'Variable Permission'),
        h('label', { class: 'ac-radio' }, permRW, ' Read & Write'), h('label', { class: 'ac-radio' }, permR, ' Read Only')),
      h('fieldset', { class: 'ac-field' }, h('legend', null, 'Variable Update Policy'),
        h('label', { class: 'ac-radio' }, polC, ' On change'), h('label', { class: 'ac-radio' }, polP, ' Periodically'),
        h('label', { class: 'ac-inline' }, h('span', null, 'Threshold'), thr),
        h('label', { class: 'ac-inline' }, h('span', null, 'Every'), every, h('span', null, 's'))),
      err);
    upd();
    modal(existing ? 'Edit variable' : 'Add variable', form, [['CANCEL', null], [existing ? 'SAVE' : 'ADD VARIABLE', () => {
      const name = nameIn.value.trim();
      if (!/^[A-Za-z_]\w*$/.test(name)) { err.textContent = 'Use letters, digits and _ only, starting with a letter.'; err.hidden = false; return false; }
      if (t.vars.some((v) => v.name === name && (!existing || existing.name !== name))) { err.textContent = 'A variable called ' + name + ' already exists.'; err.hidden = false; return false; }
      if (['int', 'float', 'bool', 'String', 'void', 'loop', 'setup', 'delay', 'millis', 'Serial', 'WiFi', 'ArduinoCloud', 'HIGH', 'LOW', 'true', 'false'].includes(name)) { err.textContent = name + ' is a reserved word.'; err.hidden = false; return false; }
      const v = {
        name, type: typeSel.value, perm: permRW.checked ? 'READWRITE' : 'READ',
        policy: polP.checked ? 'periodic' : 'change', period: Math.max(1, +every.value || 1), delta: polC.checked ? Math.max(0, +thr.value || 0) : 0,
      };
      v.cb = v.perm === 'READWRITE' ? (existing && existing.cb && existing.name === name ? existing.cb : cbName(name)) : null;
      const list = t.vars.slice();
      if (existing) list.splice(list.findIndex((x) => x.name === existing.name), 1, v);
      else list.push(v);
      api.setThing(t.deviceLogin, list, v, existing);
      return true;
    }]]);
    setTimeout(() => nameIn.focus(), 30);
  }
  function deleteVariable(v) {
    const st = api.getState();
    const t = parseThing(st.files);
    modal('Delete variable', h('p', null, 'Delete ', h('b', null, v.name), '? It is removed from thingProperties.h. Code in the sketch that uses it is left for you to tidy up.'),
      [['CANCEL', null], ['DELETE', () => { api.setThing(t.deviceLogin, t.vars.filter((x) => x.name !== v.name), null, v); return true; }, 'danger']]);
  }
  function networkDialog() {
    const st = api.getState();
    const sec = readSecrets(st.files);
    const ssid = h('input', { type: 'text', value: sec.ssid, 'aria-label': 'Wi-Fi Name', autocomplete: 'off' });
    const pass = h('input', { type: 'text', value: sec.pass, 'aria-label': 'Password', autocomplete: 'off' });
    modal('Configure network', h('div', { class: 'ac-form' },
      h('label', { class: 'ac-field' }, h('span', null, 'Wi-Fi Name *'), ssid),
      h('label', { class: 'ac-field' }, h('span', null, 'Password'), pass),
      h('p', { class: 'muted' }, 'Saved to arduino_secrets.h as SECRET_SSID and SECRET_OPTIONAL_PASS. The board joins only if they match the router on the Devices page. Use a 2.4 GHz network; campus Wi-Fi with a login page blocks IoT boards.')),
    [['CANCEL', null], ['SAVE', () => { api.setSecrets(ssid.value, pass.value); return true; }]]);
  }

  function thingSketch(body) {
    const st = api.getState();
    const src = st.files['sketch.ino'] || '';
    body.append(h('section', { class: 'ac-card' },
      h('div', { class: 'ac-card-h' }, h('h3', null, 'sketch.ino'), h('button', { class: 'ac-btn small', type: 'button', onclick: () => api.openCode() }, icon(IC.code, 14), 'OPEN FULL EDITOR')),
      h('pre', { class: 'ac-code' }, src.split('\n').slice(0, 60).join('\n') + (src.split('\n').length > 60 ? '\n…' : ''))));
  }
  function thingMeta(body) {
    const d = api.device();
    body.append(h('section', { class: 'ac-card' }, h('div', { class: 'ac-card-h' }, h('h3', null, 'Metadata')),
      h('dl', { class: 'ac-dl' }, h('dt', null, 'Thing ID'), h('dd', { class: 'mono' }, d.thingId), h('dt', null, 'Device ID'), h('dd', { class: 'mono' }, d.deviceId || '—'),
        h('dt', null, 'Timezone'), h('dd', null, 'Asia/Kuala_Lumpur'), h('dt', null, 'Board'), h('dd', null, 'ESP32 Dev Module (ESP32-WROOM-32, 30 pins)'))));
  }

  /* ---------------- Dashboards ---------------- */
  function renderDashboards(main) {
    const st = api.getState();
    pageHead(main, h('h2', null, 'Dashboards'));
    const tbl = h('div', { class: 'ac-card ac-table' },
      h('div', { class: 'ac-tr ac-th' }, h('span', null, 'Name'), h('span', null, 'Widgets'), h('span')),
      h('button', { class: 'ac-tr link', type: 'button', onclick: () => nav('dashboard') }, h('span', { class: 'b' }, st.dashboard.name), h('span', null, String(st.dashboard.widgets.length)), h('span')));
    main.append(h('div', { class: 'ac-body' }, tbl));
  }

  function renderDashboard(main) {
    const st = api.getState();
    const dash = st.dashboard;
    const name = h('input', { class: 'ac-title-in', type: 'text', value: dash.name, 'aria-label': 'Dashboard name', maxlength: 40 });
    name.addEventListener('change', () => { dash.name = name.value.trim() || 'Untitled'; api.save(); });
    const modeBtn = h('button', { class: 'ac-icon toggle' + (editMode ? ' on' : ''), type: 'button', 'aria-pressed': String(editMode), title: editMode ? 'Done editing (lock)' : 'Edit dashboard', onclick: () => { editMode = !editMode; render(); } }, icon(editMode ? IC.lock : IC.edit, 18));
    const right = [devicePill(), modeBtn];
    if (editMode) right.splice(1, 0, h('button', { class: 'ac-btn small', type: 'button', onclick: addWidgetMenu }, icon(IC.plus, 14), 'ADD'));
    pageHead(main, name, ['Dashboards', () => nav('dashboards')], right);
    const grid = h('div', { class: 'ac-grid' + (editMode ? ' editing' : '') });
    const body = h('div', { class: 'ac-body dash' }, grid);
    main.append(body);
    const props = api.props();
    if (!dash.widgets.length) {
      grid.append(h('div', { class: 'ac-empty wide' },
        h('p', null, 'This dashboard has no widgets yet.'),
        h('p', { class: 'muted' }, editMode ? 'Click ADD to place a widget and link it to a cloud variable.' : 'Click the pencil to edit, then ADD a widget.'),
        editMode ? null : h('button', { class: 'ac-btn small', type: 'button', onclick: () => { editMode = true; render(); } }, icon(IC.edit, 14), 'EDIT')));
    }
    dash.widgets.forEach((w) => {
      const p = props.find((x) => x.name === w.var);
      makeWidget(grid, w, p);
    });
    const dev = api.device();
    grid.classList.toggle('offline', dev.status !== 'online');
    ticks.push(() => grid.classList.toggle('offline', api.device().status !== 'online'));
  }

  function addWidgetMenu() {
    const props = api.props();
    const list = h('div', { class: 'ac-wpick' });
    list.append(h('button', { class: 'ac-wtile things', type: 'button', onclick: () => {
      closeModal();
      const dash = api.getState().dashboard;
      props.forEach((p) => defaultWidgetsFor(p).forEach((t) => dash.widgets.push({ id: uid('wd'), type: t, var: p.name, title: p.name })));
      api.save(); render();
    } }, icon(IC.thing, 22), h('b', null, 'Thing'), h('span', null, 'one widget per variable')));
    ORDER.forEach((t) => {
      const W = WIDGETS[t];
      list.append(h('button', { class: 'ac-wtile', type: 'button', onclick: () => { closeModal(); widgetDialog({ id: uid('wd'), type: t, var: '', title: W.name }, true); } }, icon(W.icon, 22), h('b', null, W.name)));
    });
    modal('Add widget', list, [['CANCEL', null]]);
  }

  function widgetDialog(w, isNew) {
    const props = api.props();
    const W = WIDGETS[w.type];
    const ok = props.filter((p) => W.kinds.includes(kindOf(p)));
    const title = h('input', { type: 'text', value: w.title || W.name, 'aria-label': 'Widget name', maxlength: 32 });
    const varSel = h('select', { 'aria-label': 'Linked variable' }, h('option', { value: '' }, ok.length ? 'Select a variable…' : 'No compatible variable'), ...ok.map((p) => h('option', { value: p.name, selected: w.var === p.name ? '' : null }, p.name + ' · ' + (TYPE_LABEL[p.type] || p.type) + (writable(p) ? '' : ' (read only)'))));
    const numeric = ['slider', 'stepper', 'gauge', 'percentage'].includes(w.type);
    const p0 = props.find((x) => x.name === w.var);
    const [mn, mx] = rangeOf(w, p0);
    const minIn = h('input', { type: 'number', value: mn, 'aria-label': 'Minimum', step: 'any' });
    const maxIn = h('input', { type: 'number', value: mx, 'aria-label': 'Maximum', step: 'any' });
    const err = h('p', { class: 'ac-err', hidden: true });
    const note = h('p', { class: 'muted' });
    const upd = () => {
      const p = props.find((x) => x.name === varSel.value);
      note.textContent = p && W.write && !writable(p) ? 'This variable is Read Only, so the widget only shows its value.' : '';
      if (numeric && p && w.min === undefined && RANGES[p.type]) { minIn.value = RANGES[p.type][0]; maxIn.value = RANGES[p.type][1]; }
    };
    varSel.addEventListener('change', upd);
    const form = h('div', { class: 'ac-form' },
      h('label', { class: 'ac-field' }, h('span', null, 'Widget name'), title),
      h('label', { class: 'ac-field' }, h('span', null, 'Linked variable'), varSel),
      numeric ? h('div', { class: 'ac-field' }, h('span', null, 'Value range'), h('div', { class: 'ac-range' }, h('label', null, 'Min ', minIn), h('label', null, 'Max ', maxIn))) : null,
      note, err);
    upd();
    modal(W.name + ' widget', form, [['CANCEL', null], ['DONE', () => {
      if (!varSel.value) { err.textContent = 'Link the widget to a variable.'; err.hidden = false; return false; }
      if (numeric && !(+maxIn.value > +minIn.value)) { err.textContent = 'Max must be larger than Min.'; err.hidden = false; return false; }
      w.var = varSel.value;
      w.title = title.value.trim() || W.name;
      if (numeric) { w.min = +minIn.value; w.max = +maxIn.value; }
      const dash = api.getState().dashboard;
      if (isNew) dash.widgets.push(w);
      api.save();
      render();
      return true;
    }]]);
  }

  function makeWidget(grid, w, p) {
    const W = WIDGETS[w.type];
    if (!W) return;
    const body = h('div', { class: 'w-body' });
    const card = h('div', { class: 'ac-widget' + (W.wide ? ' wide' : '') + ' t-' + w.type, 'data-id': w.id },
      h('div', { class: 'w-head' }, h('span', { class: 'w-title', title: w.title }, w.title)), body);
    grid.append(card);
    if (editMode) {
      const menu = h('div', { class: 'w-tools' },
        h('button', { class: 'ac-icon', type: 'button', title: 'Widget settings', 'aria-label': 'Settings for ' + w.title, onclick: () => widgetDialog(w, false) }, icon(IC.edit, 15)),
        h('button', { class: 'ac-icon', type: 'button', title: 'Move left', 'aria-label': 'Move ' + w.title + ' earlier', onclick: () => moveWidget(w, -1) }, icon('M15 18l-6-6 6-6', 15)),
        h('button', { class: 'ac-icon', type: 'button', title: 'Move right', 'aria-label': 'Move ' + w.title + ' later', onclick: () => moveWidget(w, 1) }, icon('M9 18l6-6-6-6', 15)),
        h('button', { class: 'ac-icon', type: 'button', title: 'Delete widget', 'aria-label': 'Delete ' + w.title, onclick: () => { const d = api.getState().dashboard; d.widgets = d.widgets.filter((x) => x !== w); api.save(); render(); } }, icon(IC.trash, 15)));
      card.querySelector('.w-head').append(menu);
    }
    if (!p) {
      body.append(h('p', { class: 'w-unlinked' }, w.var ? 'Variable “' + w.var + '” is not in this Thing.' : 'No linked variable'));
      return;
    }
    const canWrite = writable(p) && !editMode;
    const unit = UNITS[p.type] || '';
    let update = () => {};

    if (w.type === 'switch') {
      const sw = h('button', { class: 'w-switch', type: 'button', role: 'switch', 'aria-checked': 'false', 'aria-label': w.title, disabled: canWrite ? null : '' }, h('span', { class: 'knob' }), h('span', { class: 'lab on' }, 'ON'), h('span', { class: 'lab off' }, 'OFF'));
      sw.addEventListener('click', () => { const next = sw.getAttribute('aria-checked') !== 'true'; sw.setAttribute('aria-checked', String(next)); api.write(p.name, next); });
      body.append(sw);
      update = (rec) => { sw.setAttribute('aria-checked', String(!!(rec && rec.value))); };
    } else if (w.type === 'push') {
      const b = h('button', { class: 'w-push', type: 'button', 'aria-label': w.title, disabled: canWrite ? null : '' }, 'PUSH');
      const down = (e) => { e.preventDefault(); b.classList.add('down'); api.write(p.name, true); };
      const up = () => { if (!b.classList.contains('down')) return; b.classList.remove('down'); api.write(p.name, false); };
      b.addEventListener('pointerdown', down);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointerleave', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) down(e); });
      b.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') up(); });
      b.addEventListener('blur', up);
      body.append(b);
    } else if (w.type === 'led') {
      const led = h('div', { class: 'w-led' });
      body.append(led);
      update = (rec) => led.classList.toggle('on', !!(rec && rec.value));
    } else if (w.type === 'status') {
      const s = h('div', { class: 'w-statusic' });
      body.append(s);
      update = (rec) => { const v = !!(rec && rec.value); s.classList.toggle('on', v); s.textContent = rec ? (v ? '✓' : '✕') : ''; };
    } else if (w.type === 'value') {
      const kind = kindOf(p);
      if (canWrite && kind !== 'bool') {
        const inp = h('input', { class: 'w-valin', type: kind === 'str' ? 'text' : 'number', step: 'any', 'aria-label': w.title });
        let focused = false;
        inp.addEventListener('focus', () => { focused = true; });
        inp.addEventListener('blur', () => { focused = false; });
        inp.addEventListener('change', () => { api.write(p.name, kind === 'str' ? inp.value : kind === 'int' ? Math.round(+inp.value) : +inp.value); });
        body.append(inp, unit ? h('span', { class: 'w-unit' }, unit) : null);
        update = (rec) => { if (!focused) inp.value = rec ? (kind === 'str' ? rec.value : fmt(p, rec.value)) : ''; };
      } else {
        const big = h('div', { class: 'w-big' }, '—');
        body.append(big);
        update = (rec) => { const s = rec ? fmt(p, rec.value) + (unit ? ' ' + unit : '') : '—'; if (big.textContent !== s) big.textContent = s; };
      }
    } else if (w.type === 'slider') {
      const [mn, mx] = rangeOf(w, p);
      const val = h('div', { class: 'w-sval' }, '—');
      const r = h('input', { type: 'range', min: mn, max: mx, step: kindOf(p) === 'int' ? 1 : (mx - mn) / 200, 'aria-label': w.title, disabled: canWrite ? null : '' });
      let dragging = false;
      r.addEventListener('input', () => { dragging = true; val.textContent = fmt(p, +r.value) + (unit ? ' ' + unit : ''); });
      r.addEventListener('change', () => { dragging = false; api.write(p.name, kindOf(p) === 'int' ? Math.round(+r.value) : +r.value); });
      body.append(val, r, h('div', { class: 'w-minmax' }, h('span', null, String(mn)), h('span', null, String(mx))));
      update = (rec) => {
        if (dragging) return;
        if (rec && typeof rec.value === 'number') r.value = rec.value;
        const s = rec ? fmt(p, rec.value) + (unit ? ' ' + unit : '') : '—';
        if (val.textContent !== s) val.textContent = s;
      };
    } else if (w.type === 'stepper') {
      const [mn, mx] = rangeOf(w, p);
      const val = h('div', { class: 'w-big' }, '—');
      let cur = null;
      const step = (d) => { const v = Math.max(mn, Math.min(mx, (cur === null ? mn : cur) + d)); cur = v; api.write(p.name, kindOf(p) === 'int' ? Math.round(v) : v); };
      body.append(h('div', { class: 'w-stepper' },
        h('button', { type: 'button', 'aria-label': 'Decrease', disabled: canWrite ? null : '', onclick: () => step(-1) }, '−'), val,
        h('button', { type: 'button', 'aria-label': 'Increase', disabled: canWrite ? null : '', onclick: () => step(1) }, '+')));
      update = (rec) => { cur = rec && typeof rec.value === 'number' ? rec.value : cur; const s = rec ? fmt(p, rec.value) : '—'; if (val.textContent !== s) val.textContent = s; };
    } else if (w.type === 'gauge') {
      const [mn, mx] = rangeOf(w, p);
      const s = document.createElementNS(NS, 'svg');
      s.setAttribute('viewBox', '0 0 160 96');
      s.setAttribute('class', 'w-gauge');
      const R = 60, L = Math.PI * R;
      svg('path', { d: 'M20 84 A60 60 0 0 1 140 84', fill: 'none', stroke: '#dae3e3', 'stroke-width': 12 }, s);
      const arc = svg('path', { d: 'M20 84 A60 60 0 0 1 140 84', fill: 'none', stroke: '#008184', 'stroke-width': 12, 'stroke-dasharray': '0 ' + L }, s);
      const tv = svg('text', { x: 80, y: 74, 'text-anchor': 'middle', class: 'g-val' }, s);
      const lo = svg('text', { x: 20, y: 96, 'text-anchor': 'middle', class: 'g-lim' }, s);
      const hi = svg('text', { x: 140, y: 96, 'text-anchor': 'middle', class: 'g-lim' }, s);
      lo.textContent = mn; hi.textContent = mx;
      body.append(s);
      update = (rec) => {
        const v = rec ? +rec.value : NaN;
        const f = Number.isFinite(v) ? Math.max(0, Math.min(1, (v - mn) / (mx - mn || 1))) : 0;
        arc.setAttribute('stroke-dasharray', (f * L).toFixed(1) + ' ' + L);
        tv.textContent = rec ? fmt(p, v) + (unit ? ' ' + unit : '') : '—';
      };
    } else if (w.type === 'percentage') {
      const [mn, mx] = rangeOf(w, p);
      const s = document.createElementNS(NS, 'svg');
      s.setAttribute('viewBox', '0 0 100 100');
      s.setAttribute('class', 'w-pct');
      const C = 2 * Math.PI * 40;
      svg('circle', { cx: 50, cy: 50, r: 40, fill: 'none', stroke: '#dae3e3', 'stroke-width': 9 }, s);
      const arc = svg('circle', { cx: 50, cy: 50, r: 40, fill: 'none', stroke: '#008184', 'stroke-width': 9, 'stroke-dasharray': '0 ' + C, transform: 'rotate(-90 50 50)' }, s);
      const tv = svg('text', { x: 50, y: 56, 'text-anchor': 'middle', class: 'g-val' }, s);
      body.append(s);
      update = (rec) => {
        const v = rec ? +rec.value : NaN;
        const f = Number.isFinite(v) ? Math.max(0, Math.min(1, (v - mn) / (mx - mn || 1))) : 0;
        arc.setAttribute('stroke-dasharray', (f * C).toFixed(1) + ' ' + C);
        tv.textContent = rec ? Math.round(f * 100) + '%' : '—';
      };
    } else if (w.type === 'chart') {
      const W_ = 320, H_ = 120;
      const SPANS = { LIVE: 60e3, '1H': 3600e3, '1D': 86400e3, '7D': 7 * 86400e3, '15D': 15 * 86400e3 };
      let span = 'LIVE';
      let lastRec = null;
      const ranges = h('div', { class: 'w-ranges', role: 'group', 'aria-label': 'Time range' });
      Object.keys(SPANS).forEach((t) => {
        const b = h('button', { type: 'button', class: t === span ? 'on' : '', 'aria-pressed': String(t === span) }, t);
        b.addEventListener('click', () => { span = t; ranges.querySelectorAll('button').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); }); update(lastRec); });
        ranges.append(b);
      });
      card.querySelector('.w-head').append(ranges);
      const s = document.createElementNS(NS, 'svg');
      s.setAttribute('viewBox', '0 0 ' + W_ + ' ' + H_);
      s.setAttribute('preserveAspectRatio', 'none');
      s.setAttribute('class', 'w-chart');
      [0.25, 0.5, 0.75].forEach((f) => svg('line', { x1: 0, x2: W_, y1: H_ * f, y2: H_ * f, stroke: '#e6eded', 'vector-effect': 'non-scaling-stroke' }, s));
      const area = svg('path', { d: '', fill: 'rgba(0,129,132,.10)' }, s);
      const line = svg('polyline', { points: '', fill: 'none', stroke: '#008184', 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': kindOf(p) === 'bool' ? 'miter' : 'round' }, s);
      const axis = h('div', { class: 'w-axis' }, h('span'), h('span'), h('span'));
      body.append(s, axis);
      update = (rec) => {
        lastRec = rec;
        const now = Date.now();
        const num = rec ? rec.history.filter((x) => typeof x.v === 'number' && Number.isFinite(x.v)) : [];
        const cut = now - SPANS[span];
        const hist = num.filter((x) => x.t >= cut).slice(-240);
        const before = num.filter((x) => x.t < cut).pop();
        if (before) hist.unshift({ t: cut, v: before.v }); // value held from before the window
        if (!hist.length) { line.setAttribute('points', ''); area.setAttribute('d', ''); axis.children[1].textContent = 'Waiting for data'; axis.children[0].textContent = ''; axis.children[2].textContent = ''; return; }
        const digital = kindOf(p) === 'bool';
        let mn, mx;
        if (digital) { mn = -0.15; mx = 1.15; } // fixed OFF/ON rails for a square-wave plot
        else {
          mn = Math.min(...hist.map((x) => x.v)); mx = Math.max(...hist.map((x) => x.v));
          if (mx - mn < 1e-9) { mn -= 1; mx += 1; }
          const pad = (mx - mn) * 0.12; mn -= pad; mx += pad;
        }
        const t1 = now, t0 = span === 'LIVE' ? Math.min(hist[0].t, t1 - 60000) : t1 - SPANS[span];
        const X = (t) => ((t - t0) / (t1 - t0 || 1)) * W_;
        const Y = (v) => H_ - ((v - mn) / (mx - mn)) * H_;
        const pts = [];
        hist.forEach((x, i) => {
          // bool: hold the previous level until the change, then jump vertically (step / square signal)
          if (digital && i > 0) pts.push(X(x.t).toFixed(1) + ',' + Y(hist[i - 1].v ? 1 : 0).toFixed(1));
          pts.push(X(x.t).toFixed(1) + ',' + Y(digital ? (x.v ? 1 : 0) : x.v).toFixed(1));
        });
        const lastV = hist[hist.length - 1].v;
        pts.push(W_ + ',' + Y(digital ? (lastV ? 1 : 0) : lastV).toFixed(1));
        line.setAttribute('points', pts.join(' '));
        area.setAttribute('d', 'M' + X(hist[0].t).toFixed(1) + ',' + H_ + ' L' + pts.join(' L') + ' L' + W_ + ',' + H_ + ' Z');
        const tf = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        axis.children[0].textContent = tf(t0);
        axis.children[1].textContent = 'now ' + fmt(p, hist[hist.length - 1].v) + (unit ? ' ' + unit : '');
        axis.children[2].textContent = tf(t1);
      };
    } else if (w.type === 'messenger') {
      const list = h('div', { class: 'w-msgs', role: 'log', 'aria-label': w.title + ' messages' });
      body.append(list);
      if (canWrite) {
        const inp = h('input', { type: 'text', placeholder: 'Type a message', 'aria-label': 'Message for ' + p.name });
        const f = h('form', { class: 'w-msgform' }, inp, h('button', { class: 'ac-btn small', type: 'submit' }, 'SEND'));
        f.addEventListener('submit', (e) => { e.preventDefault(); if (!inp.value) return; api.write(p.name, inp.value); inp.value = ''; });
        body.append(f);
      }
      let shown = '';
      update = (rec) => {
        const hist = rec ? rec.history : [];
        const key = hist.length ? hist[hist.length - 1].t + ':' + hist.length : '0';
        if (key === shown) return;
        shown = key;
        list.innerHTML = '';
        if (!hist.length) list.append(h('span', { class: 'muted' }, 'No messages yet'));
        hist.slice(-30).forEach((m) => list.append(h('div', { class: 'msg' + (m.src === 'dashboard' ? ' me' : ''), title: new Date(m.t).toLocaleTimeString() }, String(m.v))));
        list.scrollTop = list.scrollHeight;
      };
    }
    ticks.push((store) => update(store[p.name] || null));
  }
  function moveWidget(w, d) {
    const list = api.getState().dashboard.widgets;
    const i = list.indexOf(w), j = i + d;
    if (i < 0 || j < 0 || j >= list.length) return;
    list.splice(i, 1);
    list.splice(j, 0, w);
    api.save();
    render();
  }

  /* ---------------- Devices ---------------- */
  function renderDevices(main) {
    const st = api.getState();
    const d = api.device();
    const n = st.network;
    pageHead(main, h('h2', null, 'Devices'));
    const body = h('div', { class: 'ac-body' });
    const stats = h('dd', { class: 'mono' }, '—');
    const seen = h('dd', null, '—');
    ticks.push(() => {
      const dv = api.device();
      const s = dv.stats ? dv.stats.up + ' sent · ' + dv.stats.down + ' received' : '—';
      if (stats.textContent !== s) stats.textContent = s;
      const a = dv.status === 'online' ? 'now' : dv.lastSeen ? ago(dv.lastSeen) : '—';
      if (seen.textContent !== a) seen.textContent = a;
    });
    body.append(h('section', { class: 'ac-card' },
      h('div', { class: 'ac-dev' }, h('div', { class: 'ac-dev-ic' }, icon(IC.device, 22)), h('div', null, h('b', null, 'ESP32-Sim'), h('div', { class: 'muted' }, 'ESP32 Dev Module')), devicePill()),
      h('dl', { class: 'ac-dl' }, h('dt', null, 'Device ID'), h('dd', { class: 'mono' }, d.deviceId || '—'), h('dt', null, 'Thing'), h('dd', null, st.thingName),
        h('dt', null, 'Last activity'), seen, h('dt', null, 'Messages'), stats)));

    const sw = h('button', { class: 'ac-toggle', type: 'button', role: 'switch', 'aria-checked': String(n.routerOn), 'aria-label': 'Router power' }, h('span'));
    sw.addEventListener('click', () => { n.routerOn = !n.routerOn; sw.setAttribute('aria-checked', String(n.routerOn)); api.save(); });
    const ssid = h('input', { type: 'text', value: n.ssid, autocomplete: 'off', 'aria-label': 'Router network name' });
    const pass = h('input', { type: 'text', value: n.pass, autocomplete: 'off', 'aria-label': 'Router password' });
    const lat = h('input', { type: 'range', min: 0, max: 3000, step: 50, value: n.latency, 'aria-label': 'Cloud latency' });
    const latV = h('b', null, n.latency + ' ms');
    ssid.addEventListener('input', () => { n.ssid = ssid.value; api.save(); });
    pass.addEventListener('input', () => { n.pass = pass.value; api.save(); });
    lat.addEventListener('input', () => { n.latency = +lat.value; latV.textContent = n.latency + ' ms'; api.save(); });
    body.append(h('section', { class: 'ac-card sim' },
      h('div', { class: 'ac-card-h' }, h('h3', null, icon(IC.wifi, 16), ' Lab Wi-Fi router (simulated)'), sw),
      h('p', { class: 'muted' }, 'Switch the router off while the sketch runs to watch the board drop off and reconnect. The board joins only when the Thing\'s network settings match.'),
      h('div', { class: 'ac-form' },
        h('label', { class: 'ac-field' }, h('span', null, 'Network name (SSID)'), ssid),
        h('label', { class: 'ac-field' }, h('span', null, 'Password'), pass),
        h('label', { class: 'ac-field' }, h('span', null, 'Cloud round-trip latency: ', latV), lat))));
    main.append(body);
  }

  /* ---------------- Triggers ---------------- */
  function condText(t) {
    if (t.when === 'true') return 'is true';
    if (t.when === 'false') return 'is false';
    if (t.when === 'contains') return 'contains "' + (t.text || '') + '"';
    return 'changes';
  }
  function renderTriggers(main) {
    const st = api.getState();
    st._unseenAlerts = 0;
    pageHead(main, h('h2', null, 'Triggers'), null, h('button', { class: 'ac-btn', type: 'button', onclick: triggerDialog }, icon(IC.plus, 16), 'TRIGGER'));
    const body = h('div', { class: 'ac-body' });
    const props = api.props();
    if (!st.triggers.length) {
      body.append(h('section', { class: 'ac-card' }, h('div', { class: 'ac-empty' },
        h('p', null, 'No triggers yet.'),
        h('p', { class: 'muted' }, 'A trigger watches one bool or String cloud variable and sends an email or a push notification when its condition is met, with no extra code on the board. (On the real Cloud this needs the Maker plan.)'))));
    } else {
      const tbl = h('div', { class: 'ac-card ac-table' }, h('div', { class: 'ac-tr ac-th' }, h('span', null, 'Trigger'), h('span', null, 'Action'), h('span')));
      st.triggers.forEach((t) => {
        const ok = props.some((p) => p.name === t.name);
        tbl.append(h('div', { class: 'ac-tr' },
          h('span', null, h('b', null, t.name + ' ' + condText(t)), h('small', null, ok ? '“' + t.msg + '”' : 'Variable not found in this Thing, so the trigger is idle.')),
          h('span', null, [t.email && 'Email', t.push && 'Push'].filter(Boolean).join(' + ')),
          h('button', { class: 'ac-icon', type: 'button', 'aria-label': 'Delete trigger', title: 'Delete', onclick: () => { api.removeTrigger(t); render(); } }, icon(IC.trash, 16))));
      });
      body.append(tbl);
    }
    const alerts = api.alerts();
    const box = h('section', { class: 'ac-card' }, h('div', { class: 'ac-card-h' }, h('h3', null, 'Notifications sent')));
    if (!alerts.length) box.append(h('p', { class: 'muted pad' }, 'None yet.'));
    alerts.slice().reverse().slice(0, 40).forEach((a) => box.append(h('div', { class: 'ac-alert' }, icon(a.channels.includes('email') ? 'M4 6h16v12H4z|M4 7l8 6 8-6' : IC.bell, 16), h('div', null, h('b', null, a.text), h('small', null, a.channels.join(' + ') + ' · ' + new Date(a.t).toLocaleTimeString())))));
    body.append(box);
    main.append(body);
  }
  function triggerDialog() {
    const props = api.props().filter((p) => kindOf(p) === 'bool' || kindOf(p) === 'str');
    if (!props.length) {
      modal('Create trigger', h('p', null, 'Only bool and String variables can fire a trigger. Add one in the Thing first, for example a Read Only bool called motion.'), [['OK', null]]);
      return;
    }
    const varSel = h('select', { 'aria-label': 'Cloud variable' }, ...props.map((p) => h('option', { value: p.name }, p.name + ' (' + (kindOf(p) === 'bool' ? 'bool' : 'String') + ')')));
    const whenSel = h('select', { 'aria-label': 'Condition' });
    const text = h('input', { type: 'text', placeholder: 'text', 'aria-label': 'Text to look for' });
    const fillWhen = () => {
      const p = props.find((x) => x.name === varSel.value);
      whenSel.innerHTML = '';
      (kindOf(p) === 'bool' ? [['true', 'is true'], ['false', 'is false'], ['any', 'changes']] : [['any', 'changes'], ['contains', 'contains']]).forEach(([v, l]) => whenSel.append(h('option', { value: v }, l)));
      text.parentElement && (text.parentElement.hidden = whenSel.value !== 'contains');
    };
    const email = h('input', { type: 'checkbox' }); email.checked = true;
    const push = h('input', { type: 'checkbox' }); push.checked = true;
    const msg = h('textarea', { rows: 2, 'aria-label': 'Message' }, 'Alert: {variable.name} is {variable.value}');
    const err = h('p', { class: 'ac-err', hidden: true });
    const form = h('div', { class: 'ac-form' },
      h('label', { class: 'ac-field' }, h('span', null, 'Cloud variable'), varSel),
      h('label', { class: 'ac-field' }, h('span', null, 'Condition'), whenSel),
      h('label', { class: 'ac-field', hidden: true }, h('span', null, 'Text'), text),
      h('fieldset', { class: 'ac-field' }, h('legend', null, 'Actions'), h('label', { class: 'ac-radio' }, email, ' Send email'), h('label', { class: 'ac-radio' }, push, ' Send push notification (IoT Remote app)')),
      h('label', { class: 'ac-field' }, h('span', null, 'Message — use {variable.value} and {variable.name}'), msg), err);
    varSel.addEventListener('change', fillWhen);
    whenSel.addEventListener('change', () => { text.parentElement.hidden = whenSel.value !== 'contains'; });
    fillWhen();
    modal('Create trigger', form, [['CANCEL', null], ['SAVE', () => {
      if (!email.checked && !push.checked) { err.textContent = 'Pick at least one action.'; err.hidden = false; return false; }
      api.addTrigger({ id: uid('t'), name: varSel.value, when: whenSel.value, text: text.value, email: email.checked, push: push.checked, msg: msg.value });
      render();
      return true;
    }]]);
  }
  function triggerFires(t, prev, value) {
    if (prev === undefined && typeof value === 'boolean') prev = false;
    if (t.when === 'true') return value === true && prev !== true;
    if (t.when === 'false') return value === false && prev !== false;
    if (t.when === 'contains') return typeof value === 'string' && value.includes(t.text || '');
    return prev === undefined ? false : prev !== value || typeof value === 'string';
  }
  function triggerMessage(t, value) {
    return String(t.msg || '').replace(/\{\s*(?:variable|value|[A-Za-z_]\w*)\.value\s*\}|\{\s*value\s*\}/g, String(value)).replace(/\{\s*variable\.name\s*\}/g, t.name);
  }

  /* ---------------- modal ---------------- */
  let modalOpener = null;
  function modal(title, content, buttons) {
    const opener = modalEl ? modalOpener : document.activeElement;
    closeModal();
    modalOpener = opener;
    const actions = h('div', { class: 'ac-modal-actions' });
    const box = h('div', { class: 'ac-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'ac-modal-h' }, h('h3', null, title), h('button', { class: 'ac-icon', type: 'button', 'aria-label': 'Close', onclick: closeModal }, icon(IC.x, 18))),
      h('div', { class: 'ac-modal-b' }, content), actions);
    buttons.forEach(([label, fn, cls]) => {
      const b = h('button', { class: fn ? 'ac-btn' + (cls ? ' ' + cls : '') : 'ac-btn ghost', type: 'button' }, label);
      b.addEventListener('click', () => { if (!fn || fn() !== false) closeModal(); });
      actions.append(b);
    });
    modalEl = h('div', { class: 'ac-scrim', onclick: (e) => { if (e.target === modalEl) closeModal(); } }, box);
    modalEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
      if (e.key === 'Tab') {
        const f = Array.from(box.querySelectorAll('button, input, select, textarea')).filter((x) => !x.disabled && x.offsetParent !== null);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      if (e.key === 'Enter' && e.target.tagName === 'INPUT' && buttons.length > 1) { e.preventDefault(); actions.lastChild.click(); }
    });
    host.append(modalEl);
    const first = box.querySelector('input, select, textarea, button.ac-btn');
    if (first) setTimeout(() => first.focus(), 20);
  }
  function closeModal() {
    if (!modalEl) return;
    modalEl.remove();
    modalEl = null;
    const o = modalOpener;
    modalOpener = null;
    if (o && o.isConnected && o.focus) o.focus();
  }

  function tick(store) { for (const f of ticks) f(store); }
  function badge() {
    const n = api.getState()._unseenAlerts || 0;
    const b = host.querySelector('.ac-nav[title="Triggers"]');
    if (!b) return;
    let d = b.querySelector('.ac-dot');
    if (!n) { if (d) d.remove(); return; }
    if (!d) { d = h('i', { class: 'ac-dot' }); b.append(d); }
    d.textContent = String(n);
  }
  function isEditing() { return !!modalEl; }

  root.CloudUI = {
    mount, render, tick, nav, isEditing, badge, triggerFires, triggerMessage,
    parseThing, generateThing, updateSketch, writeSecrets, readSecrets, defaultWidgetsFor, WIDGETS,
  };
})(window);
