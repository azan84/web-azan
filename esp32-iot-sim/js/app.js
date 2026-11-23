/* ============================================================
   ESP32 IoT Cloud Simulator — app wiring
   ============================================================ */
(function () {
  'use strict';

  const { Sim } = window.ESP32Sim;
  const { compile } = window.SketchCompiler;
  const EXAMPLES = window.SIM_EXAMPLES;
  const B = window.BoardUI;
  const CloudUI = window.CloudUI;
  const h = B.h;
  const $ = (id) => document.getElementById(id);

  const STORE_KEY = 'esp32-iot-sim:v1';
  const FILE_ORDER = ['sketch.ino', 'thingProperties.h', 'arduino_secrets.h'];

  /* ---------------- state ---------------- */
  let state = null;
  function freshState(exId) {
    const ex = EXAMPLES.find((e) => e.id === exId) || EXAMPLES[1];
    const parts = [];
    ex.parts.forEach((p) => {
      const extra = Object.assign({}, p);
      delete extra.type; delete extra.pin;
      if (extra.value && typeof extra.value === 'object') extra.value = Object.assign({}, extra.value);
      parts.push(B.makePart(p.type, parts, p.pin, extra));
    });
    const ranges = {};
    if (ex.sliders) Object.assign(ranges, ex.sliders);
    if (ex.id === 'servo-ldr') ranges.light = [0, 4095];
    return {
      v: 1,
      exampleId: ex.id,
      files: Object.assign({}, ex.files),
      activeFile: 'sketch.ino',
      parts,
      widgets: Object.assign({}, ex.widgets || {}),
      ranges,
      network: { routerOn: true, ssid: 'SimLab-WiFi', pass: 'esp32sim', latency: 250 },
      baud: ex.baud || 9600,
    };
  }
  function loadState() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && s.v === 1 && s.files && s.files['sketch.ino'] !== undefined) {
          s.parts = (s.parts || []).filter((p) => B.TYPES[p.type]);
          s.widgets = s.widgets || {};
          s.ranges = s.ranges || {};
          s.network = Object.assign({ routerOn: true, ssid: 'SimLab-WiFi', pass: 'esp32sim', latency: 250 }, s.network || {});
          return s;
        }
      }
    } catch (e) { /* storage unavailable */ }
    return freshState('cloud-led');
  }
  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
    }, 300);
  }
  state = loadState();

  /* ---------------- simulator ---------------- */
  let compiled = null;
  let staticMeta = { cloudProps: [], globals: {}, deviceId: '' };
  let serialBuf = [];
  let atLineStart = true;
  let warnCount = 0;
  let dashDirty = true;

  const sim = new Sim({
    serial(text, baud) {
      let t = text;
      if (+baud !== +state.baud) {
        t = t.replace(/[^\r\n]/g, () => '�ÿ¿½ðÀø¤'[Math.floor(Math.random() * 8)]);
        noteBaudMismatch(baud);
      }
      serialBuf.push(t);
    },
    warn(msg) { log('warn', '⚠ ' + msg); },
    onError(e) {
      const msg = e && e.message ? e.message : String(e);
      let hint = '';
      if (/is not defined/.test(msg)) hint = ' — check the spelling, or that the library function is supported by the simulator.';
      if (/is not a function/.test(msg)) hint = ' — this function or method is not available in the simulator.';
      log('err', 'Runtime error: ' + msg + hint);
      setStatus('error', 'Crashed');
      setRunning(false);
    },
    onStart() {},
    cloudStatus(s) { setDevice(s); dashDirty = true; },
    cloudValue() { dashDirty = true; },
    cloudProps() { dashDirty = true; },
    propMeta(name) { return compiled && compiled.globals[name]; },
  });
  sim.parts = state.parts;
  sim.network = state.network;

  /* ---------------- editor ---------------- */
  const host = $('editorHost');
  let cm = null;
  const docs = {};
  let fallback = null;
  if (window.CodeMirror) {
    cm = window.CodeMirror(host, {
      mode: 'text/x-c++src', lineNumbers: true, indentUnit: 2, tabSize: 2, smartIndent: true,
      matchBrackets: true, autoCloseBrackets: true, lineWrapping: false,
      extraKeys: { 'Ctrl-Enter': () => run(), 'Cmd-Enter': () => run(), Tab: (c) => c.replaceSelection('  ') },
    });
  } else {
    fallback = h('textarea', { class: 'fallback', spellcheck: 'false', 'aria-label': 'Sketch source' });
    host.append(fallback);
    fallback.addEventListener('input', () => { state.files[state.activeFile] = fallback.value; onEdit(); });
  }
  function fileList() {
    return FILE_ORDER.filter((f) => state.files[f] !== undefined).concat(Object.keys(state.files).filter((f) => !FILE_ORDER.includes(f)));
  }
  function buildDocs() {
    for (const k of Object.keys(docs)) delete docs[k];
    if (!cm) return;
    fileList().forEach((f) => {
      const d = window.CodeMirror.Doc(state.files[f], 'text/x-c++src');
      d.on('change', () => { state.files[f] = d.getValue(); onEdit(); });
      docs[f] = d;
    });
  }
  function showFile(f) {
    if (state.files[f] === undefined) f = 'sketch.ino';
    state.activeFile = f;
    if (cm) { cm.swapDoc(docs[f]); setTimeout(() => cm.refresh(), 0); }
    else fallback.value = state.files[f];
    renderTabs();
    save();
  }
  function renderTabs() {
    const box = $('fileTabs');
    box.innerHTML = '';
    fileList().forEach((f) => {
      const b = h('button', { class: 'tab' + (f === state.activeFile ? ' active' : ''), role: 'tab', 'aria-selected': String(f === state.activeFile), type: 'button' }, f);
      b.addEventListener('click', () => showFile(f));
      box.append(b);
    });
  }
  let errMark = null;
  function clearErrMark() {
    if (errMark && cm) { errMark.doc.removeLineClass(errMark.line, 'background', 'cm-error-line'); }
    errMark = null;
    document.querySelectorAll('#fileTabs .tab.has-error').forEach((t) => t.classList.remove('has-error'));
  }
  function markError(file, line) {
    clearErrMark();
    if (!file || !line) return;
    showFile(file);
    if (cm && docs[file]) {
      const d = docs[file];
      d.addLineClass(line - 1, 'background', 'cm-error-line');
      errMark = { doc: d, line: line - 1 };
      cm.scrollIntoView({ line: line - 1, ch: 0 }, 80);
      d.setCursor({ line: line - 1, ch: 0 });
    }
    const tab = Array.from(document.querySelectorAll('#fileTabs .tab')).find((t) => t.textContent === file);
    if (tab) tab.classList.add('has-error');
  }

  let metaTimer = null;
  function onEdit() {
    save();
    if (sim.running) $('dirtyHint').hidden = false;
    clearTimeout(metaTimer);
    metaTimer = setTimeout(refreshMeta, 500);
  }

  function refreshMeta() {
    try {
      const c = compile(state.files, 'sketch.ino');
      staticMeta = { cloudProps: c.cloudProps, globals: c.globals, deviceId: deviceIdOf() };
    } catch (e) {
      staticMeta.deviceId = deviceIdOf();
    }
    renderCloud();
  }
  function deviceIdOf() {
    const src = state.files['thingProperties.h'] || state.files['sketch.ino'] || '';
    const m = /DEVICE_LOGIN_NAME\s*\[\s*\]\s*=\s*"([^"]*)"/.exec(src);
    return m ? m[1] : '';
  }

  /* ---------------- console ---------------- */
  const serialOut = $('serialOut');
  const outputLog = $('outputLog');
  let baudNoted = false;
  function noteBaudMismatch(baud) {
    if (baudNoted) return;
    baudNoted = true;
    log('warn', '⚠ The sketch calls Serial.begin(' + baud + ') but the Serial Monitor is set to ' + state.baud + ' baud, so the text looks garbled. Change the baud rate in the Serial Monitor.');
  }
  function log(kind, msg, loc) {
    const line = h('div', { class: 'log ' + kind });
    if (loc && loc.file) {
      const a = h('span', { class: 'loc', role: 'button', tabindex: '0' }, loc.file + (loc.line ? ':' + loc.line : ''));
      a.addEventListener('click', () => markError(loc.file, loc.line));
      line.append(a, ': ');
    }
    line.append(msg);
    outputLog.append(line);
    outputLog.scrollTop = outputLog.scrollHeight;
    if (kind === 'warn' || kind === 'err') {
      warnCount++;
      const badge = $('outBadge');
      badge.hidden = false;
      badge.textContent = String(warnCount);
      badge.classList.toggle('err', kind === 'err' || badge.classList.contains('err'));
      if (kind === 'err') switchConsole('output');
    }
  }
  function clearLog() {
    outputLog.innerHTML = '';
    warnCount = 0;
    $('outBadge').hidden = true;
    $('outBadge').classList.remove('err');
  }
  function flushSerial() {
    if (!serialBuf.length) return;
    const text = serialBuf.join('');
    serialBuf = [];
    const stamp = $('timestamps').checked;
    const frag = document.createDocumentFragment();
    const parts = text.replace(/\r\n/g, '\n').replace(/\r/g, '').split(/(\n)/);
    for (const p of parts) {
      if (p === '') continue;
      if (p === '\n') { frag.append('\n'); atLineStart = true; continue; }
      if (atLineStart && stamp) {
        const d = new Date();
        frag.append(h('span', { class: 'ts' }, d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0') + ' -> '));
      }
      frag.append(p);
      atLineStart = false;
    }
    serialOut.append(frag);
    // keep the monitor light
    if (serialOut.childNodes.length > 4000) {
      while (serialOut.childNodes.length > 3000) serialOut.removeChild(serialOut.firstChild);
    }
    if ($('autoScroll').checked) serialOut.scrollTop = serialOut.scrollHeight;
  }
  function serialSys(msg) {
    serialOut.append(h('span', { class: 'sys' }, (atLineStart ? '' : '\n') + msg + '\n'));
    atLineStart = true;
    if ($('autoScroll').checked) serialOut.scrollTop = serialOut.scrollHeight;
  }
  function switchConsole(which) {
    document.querySelectorAll('[data-console]').forEach((t) => {
      const on = t.dataset.console === which;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', String(on));
    });
    document.querySelectorAll('[data-console-body]').forEach((b) => { b.hidden = b.dataset.consoleBody !== which; });
    document.querySelector('.console-tools').style.visibility = which === 'serial' ? 'visible' : 'hidden';
  }
  document.querySelectorAll('[data-console]').forEach((t) => t.addEventListener('click', () => switchConsole(t.dataset.console)));
  $('clearSerial').addEventListener('click', () => { serialOut.innerHTML = ''; atLineStart = true; });
  $('baudSel').value = String(state.baud);
  $('baudSel').addEventListener('change', () => { state.baud = +$('baudSel').value; baudNoted = false; save(); });
  $('serialForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = $('serialInput');
    const end = $('lineEnd').value.replace('\\r', '\r').replace('\\n', '\n');
    if (!sim.running) { serialSys('[board not running — press Upload & run first]'); return; }
    sim.serialInput(inp.value + end);
    inp.value = '';
  });

  /* ---------------- status ---------------- */
  function setStatus(s, text) {
    const p = $('statusPill');
    p.dataset.state = s;
    p.textContent = text;
  }
  function setRunning(on) {
    $('runBtn').querySelector('span').textContent = on ? 'Re-upload' : 'Upload & run';
    $('stopBtn').disabled = !on;
    if (!on) { setDevice('offline'); B.silenceAll(); }
  }
  function setDevice(s) {
    const d = $('deviceStatus');
    d.dataset.state = s;
    d.querySelector('.txt').textContent = s === 'online' ? 'Device online' : s === 'connecting' ? 'Connecting…' : 'Device offline';
    $('dashboard').classList.toggle('offline', s !== 'online');
  }

  /* ---------------- run / stop ---------------- */
  let runToken = 0;
  async function run() {
    const token = ++runToken;
    clearErrMark();
    clearLog();
    baudNoted = false;
    $('dirtyHint').hidden = true;
    setStatus('compiling', 'Translating…');
    await sim.stop();
    let c;
    const t0 = performance.now();
    try {
      c = compile(state.files, 'sketch.ino');
    } catch (e) {
      const loc = { file: e.file, line: e.line };
      log('err', 'error: ' + e.message, loc);
      if (e.file) markError(e.file, e.line);
      setStatus('error', 'Compile error');
      setRunning(false);
      return;
    }
    compiled = c;
    staticMeta = { cloudProps: c.cloudProps, globals: c.globals, deviceId: deviceIdOf() };
    c.warnings.forEach((w) => log('warn', '⚠ ' + w));
    log('ok', '✓ Sketch translated in ' + Math.max(1, Math.round(performance.now() - t0)) + ' ms (' + c.functions.length + ' functions, ' + c.cloudProps.length + ' cloud variables).');
    log('', 'Uploading to simulated ESP32-WROOM-32 (240 MHz, 4 MB flash)…  Hard resetting via RTS pin…');
    renderCloud();
    serialSys('---- board reset ' + new Date().toLocaleTimeString() + ' ----');
    switchConsole('serial');
    setStatus('running', 'Running');
    setRunning(true);
    sim.parts = state.parts;
    sim.network = state.network;
    const p = sim.start(c);
    p.then(() => {
      if (token === runToken && !sim.running && $('statusPill').dataset.state === 'running') { setStatus('idle', 'Stopped'); setRunning(false); }
    });
  }
  async function stop() {
    await sim.stop();
    setStatus('idle', 'Stopped');
    setRunning(false);
    serialSys('---- stopped ----');
  }
  $('runBtn').addEventListener('click', run);
  $('stopBtn').addEventListener('click', stop);
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); }
  });

  /* ---------------- parts ---------------- */
  let partCards = {};
  function renderCircuit() {
    B.renderBoard($('boardSvg'), state.parts);
    partCards = B.renderParts($('parts'), state.parts, {
      changed(rebuild) { save(); if (rebuild) renderCircuit(); },
      rerender() { renderCircuit(); },
      remove(part) {
        const i = state.parts.indexOf(part);
        if (i >= 0) state.parts.splice(i, 1);
        save();
        renderCircuit();
      },
      input() { sim.partChanged(); save(); },
      audio() { B.ensureAudio(); },
    });
  }
  $('addPart').addEventListener('click', () => {
    const t = $('partType').value;
    state.parts.push(B.makePart(t, state.parts));
    save();
    renderCircuit();
    const last = $('parts').lastElementChild;
    if (last) last.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  /* ---------------- cloud ---------------- */
  let dashUpdate = () => {};
  function cloudPropsNow() { return staticMeta.cloudProps || []; }
  function renderCloud() {
    const props = cloudPropsNow();
    const prefs = { widgets: state.widgets, ranges: state.ranges };
    dashUpdate = CloudUI.renderDashboard($('dashboard'), props, prefs, {
      write(name, value) {
        sim.dashboardWrite(name, value);
        dashDirty = true;
      },
    });
    CloudUI.renderThing($('thingView'), props, prefs, { deviceId: staticMeta.deviceId, thingId: sim.cloud ? sim.cloud.thingId : 'a3f1c2e0-5b7d-4e9a-9c11-0d2f6b7e8a41' }, {
      setWidgets(name, list) { state.widgets[name] = list; save(); renderCloud(); },
      setRange(name, r) { state.ranges[name] = r; save(); renderCloud(); },
    });
    $('dashboard').classList.toggle('offline', !(sim.cloud && sim.cloud.connected));
    dashDirty = true;
  }
  document.querySelectorAll('[data-cloud]').forEach((t) => t.addEventListener('click', () => {
    document.querySelectorAll('[data-cloud]').forEach((x) => {
      const on = x === t;
      x.classList.toggle('active', on);
      x.setAttribute('aria-selected', String(on));
    });
    document.querySelectorAll('[data-cloud-body]').forEach((b) => { b.hidden = b.dataset.cloudBody !== t.dataset.cloud; });
  }));

  /* ---------------- network ---------------- */
  function bindNetwork() {
    const n = state.network;
    const rb = $('routerBtn');
    rb.setAttribute('aria-checked', String(n.routerOn));
    rb.onclick = () => {
      n.routerOn = !n.routerOn;
      rb.setAttribute('aria-checked', String(n.routerOn));
      save();
    };
    $('netSsid').value = n.ssid;
    $('netPass').value = n.pass;
    $('netLat').value = n.latency;
    $('latVal').textContent = n.latency + ' ms';
    $('netSsid').oninput = () => { n.ssid = $('netSsid').value; save(); };
    $('netPass').oninput = () => { n.pass = $('netPass').value; save(); };
    $('netLat').oninput = () => { n.latency = +$('netLat').value; $('latVal').textContent = n.latency + ' ms'; save(); };
  }

  /* ---------------- examples ---------------- */
  function fillExamples() {
    const sel = $('exampleSel');
    sel.innerHTML = '';
    EXAMPLES.forEach((ex) => {
      const o = h('option', { value: ex.id }, ex.title);
      if (ex.id === state.exampleId) o.selected = true;
      sel.append(o);
    });
    sel.addEventListener('change', async () => {
      const ex = EXAMPLES.find((e) => e.id === sel.value);
      const original = EXAMPLES.find((e) => e.id === state.exampleId);
      const edited = !original || Object.keys(state.files).some((f) => state.files[f] !== original.files[f]);
      if (edited && !window.confirm('Load "' + ex.title + '"? Your edits to the current sketch will be replaced.')) {
        sel.value = state.exampleId;
        return;
      }
      await loadExample(ex.id);
    });
  }
  async function loadExample(id) {
    await sim.stop();
    setRunning(false);
    setStatus('idle', 'Idle');
    state = freshState(id);
    sim.parts = state.parts;
    sim.network = state.network;
    sim.cloudStore = {};
    save();
    applyState();
    clearLog();
    const ex = EXAMPLES.find((e) => e.id === id);
    log('', 'Loaded example: ' + ex.title + '. ' + ex.blurb);
    log('', 'Press Upload & run (Ctrl+Enter).');
    switchConsole('output');
  }
  function applyState() {
    buildDocs();
    showFile(state.activeFile || 'sketch.ino');
    $('baudSel').value = String(state.baud);
    $('exampleSel').value = state.exampleId;
    bindNetwork();
    renderCircuit();
    refreshMeta();
  }

  /* ---------------- theme & help ---------------- */
  $('themeBtn').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', cur);
    try { localStorage.setItem('theme', cur); } catch (e) { /* ignore */ }
  });
  $('helpBtn').addEventListener('click', () => {
    const d = $('helpDlg');
    if (d.showModal) d.showModal(); else d.setAttribute('open', '');
  });

  /* ---------------- frame loop ---------------- */
  let lastDash = 0;
  function frame(t) {
    flushSerial();
    B.updateBoard(sim);
    B.updateParts(sim, state.parts, partCards);
    if (dashDirty || t - lastDash > 1000) {
      dashUpdate(sim.cloudStore);
      dashDirty = false;
      lastDash = t;
      const st = $('thingStats');
      if (st) st.textContent = sim.cloud ? sim.cloud.stats.up + ' up · ' + sim.cloud.stats.down + ' down' : '—';
    }
    requestAnimationFrame(frame);
  }

  /* ---------------- boot ---------------- */
  fillExamples();
  applyState();
  setStatus('idle', 'Idle');
  log('', 'Welcome! Pick an example from the menu or edit the sketch, then press Upload & run (Ctrl+Enter).');
  switchConsole('serial');
  requestAnimationFrame(frame);
})();
