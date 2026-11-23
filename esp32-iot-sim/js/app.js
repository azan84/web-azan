/* ============================================================
   ESP32 IoT Simulator — app wiring
   ============================================================ */
(function () {
  'use strict';

  const { Sim } = window.ESP32Sim;
  const { compile } = window.SketchCompiler;
  const EXAMPLES = window.SIM_EXAMPLES;
  const M = window.CircuitModel;
  const CUI = window.CircuitUI;
  const Cloud = window.CloudUI;
  const h = CUI.h;
  const $ = (id) => document.getElementById(id);

  const STORE_KEY = 'esp32-iot-sim:v2';
  const FILE_ORDER = ['sketch.ino', 'thingProperties.h', 'arduino_secrets.h'];
  const NET_DEFAULT = { routerOn: true, ssid: 'SimLab-WiFi', pass: 'esp32sim', latency: 250 };
  const OLD_WIDGET = { switch: 'switch', status: 'led', value: 'value', gauge: 'gauge', chart: 'chart', slider: 'slider', messenger: 'messenger' };

  /* ---------------- state ---------------- */
  let state = null;
  function freshState(exId) {
    const ex = EXAMPLES.find((e) => e.id === exId) || EXAMPLES.find((e) => e.id === 'm7-iot-led') || EXAMPLES[0];
    const board = { x: 0, y: 0, jumper: '3V3' };
    const built = M.autoBuild(ex.parts || [], board);
    const widgets = [];
    Object.keys(ex.widgets || {}).forEach((name) => {
      (ex.widgets[name] || []).forEach((t) => {
        const w = { id: 'wd' + Math.random().toString(36).slice(2, 8), type: OLD_WIDGET[t] || t, var: name, title: name };
        const r = (ex.sliders && ex.sliders[name]) || null;
        if (r && ['slider', 'gauge', 'stepper', 'percentage'].includes(w.type)) { w.min = r[0]; w.max = r[1]; }
        widgets.push(w);
      });
    });
    if (!ex.widgets && ex.files['thingProperties.h']) {
      Cloud.parseThing(ex.files).vars.forEach((v) => {
        const p = { name: v.name, type: v.type, perm: v.perm, kind: kindOfType(v.type) };
        Cloud.defaultWidgetsFor(p).forEach((t) => widgets.push({ id: 'wd' + Math.random().toString(36).slice(2, 8), type: t, var: v.name, title: v.name }));
      });
    }
    const tm = /Thing "([^"]+)"/.exec(ex.files['sketch.ino'] || '');
    const short = ex.title.replace(/^[\w\s]*·\s*/, '');
    return {
      v: 2,
      geom: 2,
      exampleId: ex.id,
      project: short,
      thingName: tm ? tm[1] : short,
      files: Object.assign({}, ex.files),
      activeFile: 'sketch.ino',
      parts: built.parts,
      wires: built.wires,
      board,
      view: { x: 40, y: 40, z: 0.8, fit: true },
      dashboard: { name: (tm ? tm[1] : short) + ' dashboard', widgets },
      triggers: (ex.triggers || []).map((t) => Object.assign({ id: 't' + Math.random().toString(36).slice(2, 8) }, t)),
      network: Object.assign({}, NET_DEFAULT),
      baud: ex.baud || 9600,
      cloudView: widgets.length ? 'dashboard' : 'thing',
      codeOpen: false,
      lastWireColor: '#16a34a',
    };
  }
  function loadState() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && s.v === 2 && s.files && s.files['sketch.ino'] !== undefined && Array.isArray(s.parts)) {
          s.parts = s.parts.filter((p) => M.TYPES[p.type]);
          s.wires = Array.isArray(s.wires) ? s.wires : [];
          s.board = Object.assign({ x: 0, y: 0, jumper: '3V3' }, s.board || {});
          if (!s.geom) {
            // saved before parts had plug-in leads: a half-pitch nudge keeps them unplugged
            s.parts.forEach((p) => { if (M.pluggedPins(s, p).length) { p.x += 11; p.y += 11; } });
            s.geom = 2;
          }
          s.view = Object.assign({ x: 40, y: 40, z: 0.8 }, s.view || {});
          s.dashboard = s.dashboard && Array.isArray(s.dashboard.widgets) ? s.dashboard : { name: 'Dashboard', widgets: [] };
          s.triggers = Array.isArray(s.triggers) ? s.triggers : [];
          s.network = Object.assign({}, NET_DEFAULT, s.network || {});
          s.thingName = s.thingName || 'Untitled';
          s.project = s.project || 'ESP32 project';
          delete s._unseenAlerts;
          return s;
        }
      }
    } catch (e) { /* storage unavailable */ }
    return freshState('m7-iot-led');
  }
  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        const copy = Object.assign({}, state, { parts: state.parts.map((p) => { const c = Object.assign({}, p); delete c.state; delete c._live; return c; }) });
        delete copy._unseenAlerts;
        localStorage.setItem(STORE_KEY, JSON.stringify(copy));
      } catch (e) { /* ignore */ }
    }, 300);
  }
  state = loadState();

  /* ---------------- simulator ---------------- */
  let compiled = null;
  let serialBuf = [];
  let atLineStart = true;
  let warnCount = 0;
  let dashDirty = true;
  let lastSeen = 0;

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
      if (/is not defined|was not declared/.test(msg)) hint = ' (check the spelling, or that the library function is supported by the simulator)';
      if (/is not a function/.test(msg)) hint = ' (this function or method is not available in the simulator)';
      log('err', 'Runtime error: ' + msg + hint);
      setStatus('error', 'Crashed');
      setRunning(false);
    },
    onStart() {},
    cloudStatus(s) { if (s === 'online') lastSeen = Date.now(); dashDirty = true; },
    cloudValue(name, rec) { dashDirty = true; checkTriggers(name, rec.value); },
    cloudProps() { dashDirty = true; },
    propMeta(name) { return compiled && compiled.globals[name]; },
  });
  function syncSim() {
    sim.parts = state.parts;
    sim.network = state.network;
  }
  syncSim();

  /* ---------------- audio for buzzers ---------------- */
  let audioCtx = null;
  const oscs = {};
  function ensureAudio() {
    if (!audioCtx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) audioCtx = new AC(); }
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
  function silenceAll() { Object.keys(oscs).forEach((id) => setTone(id, 0)); }

  /* ---------------- circuit canvas ---------------- */
  function renderIssues() {
    const res = CUI.solvedInfo();
    const box = $('issues');
    if (!res || !res.issues.length) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = '';
    res.issues.forEach((i) => box.append(h('div', { class: i.level }, (i.level === 'err' ? '⛔ ' : '⚠ ') + i.msg)));
  }
  CUI.mount({ svg: $('canvas'), host: $('stage'), inspector: $('inspector'), palette: $('palette'), tip: $('tip') }, () => state, {
    changed(kind) {
      save();
      renderIssues();
      if ((kind === 'wire' || kind === 'move') && sim.running) sim.partChanged(); // a move can plug/unplug pins
    },
    input() { sim.partChanged(); save(); },
    reset() { if (sim.running) run(); else toast('Board', 'EN pressed. Start the simulation to run the sketch.'); },
    isRunning() { return sim.running; },
    audio: ensureAudio,
    tone: setTone,
    hint(text) { const el = $('stageHint'); el.hidden = !text; el.textContent = text || ''; },
    historyChanged(u, r) { $('tbUndo').disabled = !u; $('tbRedo').disabled = !r; },
    selection(sel) {
      const isPart = sel && sel.kind === 'part';
      $('tbRotate').disabled = !isPart || (state.parts.find((p) => p.id === sel.id) || {}).type === 'breadboard';
      $('tbDelete').disabled = !sel || sel.kind === 'board';
    },
    wireColor() { syncWireSel(); },
    paletteAdded() { if (window.matchMedia('(max-width: 960px)').matches) $('palette').classList.remove('open'); },
  });
  $('tbRotate').addEventListener('click', () => CUI.rotateSelected());
  $('tbDelete').addEventListener('click', () => CUI.removeSelected());
  $('tbUndo').addEventListener('click', () => CUI.undo());
  $('tbRedo').addEventListener('click', () => CUI.redo());
  $('tbFit').addEventListener('click', () => { CUI.fit(); save(); });
  $('tbZoomIn').addEventListener('click', () => { CUI.zoomBy(1.2); save(); });
  $('tbZoomOut').addEventListener('click', () => { CUI.zoomBy(1 / 1.2); save(); });
  CUI.WIRE_COLORS.forEach(([n, c]) => $('tbWire').append(h('option', { value: c }, n)));
  function syncWireSel() { $('tbWire').value = state.lastWireColor || '#16a34a'; $('tbWireSw').style.background = $('tbWire').value; }
  $('tbWire').addEventListener('change', () => { CUI.setWireColor($('tbWire').value); syncWireSel(); });
  $('tbRotate').disabled = true;
  $('tbDelete').disabled = true;

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
  let settingDocs = false;
  function buildDocs() {
    for (const k of Object.keys(docs)) delete docs[k];
    if (!cm) return;
    fileList().forEach((f) => {
      const d = window.CodeMirror.Doc(state.files[f], 'text/x-c++src');
      d.on('change', () => { if (settingDocs) return; state.files[f] = d.getValue(); onEdit(); });
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
      const b = h('button', { class: 'ftab' + (f === state.activeFile ? ' on' : ''), role: 'tab', 'aria-selected': String(f === state.activeFile), type: 'button' }, f);
      b.addEventListener('click', () => showFile(f));
      box.append(b);
    });
  }
  let errMark = null;
  function clearErrMark() {
    if (errMark && cm) errMark.doc.removeLineClass(errMark.line, 'background', 'cm-error-line');
    errMark = null;
    document.querySelectorAll('#fileTabs .ftab.has-error').forEach((t) => t.classList.remove('has-error'));
  }
  function markError(file, line) {
    clearErrMark();
    if (!file || !line) return;
    openCode(true);
    showFile(file);
    if (cm && docs[file]) {
      const d = docs[file];
      d.addLineClass(line - 1, 'background', 'cm-error-line');
      errMark = { doc: d, line: line - 1 };
      cm.scrollIntoView({ line: line - 1, ch: 0 }, 80);
      d.setCursor({ line: line - 1, ch: 0 });
    }
    const tab = Array.from(document.querySelectorAll('#fileTabs .ftab')).find((t) => t.textContent === file);
    if (tab) tab.classList.add('has-error');
  }
  let metaTimer = null;
  function onEdit() {
    save();
    if (sim.running) $('dirtyHint').hidden = false;
    clearTimeout(metaTimer);
    metaTimer = setTimeout(refreshMeta, 500);
  }

  /* ---------------- cloud variables (static view of the Thing) ---------------- */
  let staticProps = [];
  function kindOfType(t) {
    if (['bool', 'CloudSwitch', 'CloudLight', 'CloudMotionSensor', 'CloudContactSensor', 'CloudSmartPlug'].includes(t)) return 'bool';
    if (t === 'String') return 'str';
    if (t === 'int' || t === 'CloudCounter' || t === 'long') return 'int';
    return 'float';
  }
  function refreshMeta() {
    const thing = Cloud.parseThing(state.files);
    let fromCompile = [];
    try { fromCompile = compile(state.files, 'sketch.ino').cloudProps; } catch (e) { /* keep the thingProperties view */ }
    const list = thing.vars.map((v) => {
      const c = fromCompile.find((x) => x.name === v.name);
      return { name: v.name, perm: v.perm, type: v.type, kind: c && c.kind ? c.kind : kindOfType(v.type) };
    });
    fromCompile.forEach((c) => { if (!list.some((x) => x.name === c.name)) list.push(c); });
    staticProps = list;
    if (!Cloud.isEditing()) Cloud.render();
    dashDirty = true;
  }
  function deviceIdOf() {
    const src = state.files['thingProperties.h'] || state.files['sketch.ino'] || '';
    const m = /DEVICE_LOGIN_NAME\s*\[\s*\]\s*=\s*"([^"]*)"/.exec(src);
    return m ? m[1] : '';
  }
  function deviceStatus() {
    if (!sim.running || !sim.cloud) return 'offline';
    if (sim.cloud.connected) return 'online';
    return sim.cloud.begun ? 'connecting' : 'offline';
  }
  function setFile(name, text) {
    state.files[name] = text;
    if (cm) {
      if (!docs[name]) { buildDocs(); }
      else if (docs[name].getValue() !== text) { settingDocs = true; docs[name].setValue(text); settingDocs = false; }
    }
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
      const a = h('button', { class: 'loc', type: 'button' }, loc.file + (loc.line ? ':' + loc.line : ''));
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
      if (kind === 'err') { openCode(true); switchConsole('output'); }
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
    if (serialOut.childNodes.length > 4000) while (serialOut.childNodes.length > 3000) serialOut.removeChild(serialOut.firstChild);
    if ($('autoScroll').checked) serialOut.scrollTop = serialOut.scrollHeight;
  }
  function serialSys(msg) {
    serialOut.append(h('span', { class: 'sys' }, (atLineStart ? '' : '\n') + msg + '\n'));
    atLineStart = true;
    if ($('autoScroll').checked) serialOut.scrollTop = serialOut.scrollHeight;
  }
  function switchConsole(which) {
    document.querySelectorAll('[data-console]').forEach((t) => t.setAttribute('aria-pressed', String(t.dataset.console === which)));
    document.querySelectorAll('[data-console-body]').forEach((b) => { b.hidden = b.dataset.consoleBody !== which; });
    document.querySelector('.console-tools').style.visibility = which === 'serial' ? 'visible' : 'hidden';
    $('console').dataset.open = which;
  }
  document.querySelectorAll('[data-console]').forEach((t) => t.addEventListener('click', () => {
    const which = t.dataset.console;
    if ($('console').dataset.open === which) { $('console').dataset.open = 'none'; t.setAttribute('aria-pressed', 'false'); document.querySelectorAll('[data-console-body]').forEach((b) => { b.hidden = true; }); setTimeout(() => cm && cm.refresh(), 0); return; }
    switchConsole(which);
    setTimeout(() => cm && cm.refresh(), 0);
  }));
  $('clearSerial').addEventListener('click', () => { serialOut.innerHTML = ''; atLineStart = true; });
  $('baudSel').addEventListener('change', () => { state.baud = +$('baudSel').value; baudNoted = false; save(); });
  $('serialForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = $('serialInput');
    const end = $('lineEnd').value.replace('\\r', '\r').replace('\\n', '\n');
    if (!sim.running) { serialSys('[the simulation is not running: press Start Simulation]'); return; }
    sim.serialInput(inp.value + end);
    inp.value = '';
  });

  /* ---------------- code panel ---------------- */
  function openCode(on) {
    const p = $('codePanel');
    const show = on === undefined ? p.hidden : on;
    p.hidden = !show;
    $('codeBtn').setAttribute('aria-pressed', String(show));
    $('codeBtn').classList.toggle('on', show);
    state.codeOpen = show;
    if (window.matchMedia('(max-width: 960px)').matches && $('app').dataset.mob !== 'cloud') highlightMob(show ? 'code' : 'circuit');
    if (show && cm) setTimeout(() => cm.refresh(), 0);
    save();
  }
  $('codeBtn').addEventListener('click', () => openCode());
  $('codeClose').addEventListener('click', () => { openCode(false); if (window.matchMedia('(max-width: 960px)').matches) setMob('circuit'); });
  $('dlBtn').addEventListener('click', () => {
    const blob = new Blob([state.files['sketch.ino'] || ''], { type: 'text/plain' });
    const a = h('a', { href: URL.createObjectURL(blob), download: (state.project || 'sketch').replace(/[^\w-]+/g, '_') + '.ino' });
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  });
  $('libBtn').addEventListener('click', () => {
    clearLog();
    log('', 'Libraries the simulator understands: Arduino core, WiFi, ArduinoIoTCloud + Arduino_ConnectionHandler, DHT sensor library (DHT11/DHT22), ESP32Servo, Wire, LiquidCrystal_I2C.');
    openCode(true);
    switchConsole('output');
  });
  // resize the code panel by dragging its left edge
  (function () {
    const grip = $('codeResize');
    let sx = 0, sw = 0;
    grip.addEventListener('pointerdown', (e) => {
      sx = e.clientX; sw = $('codePanel').getBoundingClientRect().width;
      grip.setPointerCapture(e.pointerId);
      const move = (ev) => { const w = Math.max(320, Math.min(window.innerWidth * 0.8, sw - (ev.clientX - sx))); $('codePanel').style.width = w + 'px'; };
      const up = () => { grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); if (cm) cm.refresh(); };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
    });
  })();

  /* ---------------- status / run ---------------- */
  function setStatus(s, text) {
    const p = $('statusPill');
    p.dataset.state = s;
    p.textContent = text || '';
  }
  let simStart = 0;
  function setRunning(on) {
    const b = $('simBtn');
    b.classList.toggle('running', on);
    b.querySelector('span').textContent = on ? 'Stop Simulation' : 'Start Simulation';
    $('simTime').hidden = !on;
    if (on) simStart = performance.now();
    if (!on) { silenceAll(); dashDirty = true; }
  }
  let runToken = 0;
  async function run() {
    const token = ++runToken;
    ensureAudio();
    clearErrMark();
    clearLog();
    baudNoted = false;
    $('dirtyHint').hidden = true;
    setStatus('compiling', 'Compiling…');
    await sim.stop();
    let c;
    const t0 = performance.now();
    try {
      c = compile(state.files, 'sketch.ino');
    } catch (e) {
      log('err', 'error: ' + e.message, { file: e.file, line: e.line });
      if (e.file) markError(e.file, e.line);
      setStatus('error', 'Compile error');
      setRunning(false);
      return;
    }
    compiled = c;
    c.warnings.forEach((w) => log('warn', '⚠ ' + w));
    CUI.resolve();
    renderIssues();
    const res = CUI.solvedInfo();
    if (res && res.issues.some((i) => i.level === 'err')) log('warn', '⚠ The circuit has a short circuit. A real board would brown out or be damaged. Check the wires marked on the workplane.');
    log('ok', '✓ Compiled in ' + Math.max(1, Math.round(performance.now() - t0)) + ' ms (' + c.functions.length + ' functions, ' + c.cloudProps.length + ' cloud variables).');
    log('', 'Uploading to simulated ESP32-WROOM-32 (240 MHz, 4 MB flash)…  Hard resetting via RTS pin…');
    refreshMeta();
    serialSys('---- board reset ' + new Date().toLocaleTimeString() + ' ----');
    if ($('console').dataset.open !== 'none') switchConsole('serial');
    setStatus('running', '');
    setRunning(true);
    syncSim();
    for (const k of Object.keys(lastVal)) delete lastVal[k];
    // the cloud keeps its values between runs; start trigger edges from them so a restart does not fire alerts
    Object.keys(sim.cloudStore).forEach((k) => { if (sim.cloudStore[k].value !== null) lastVal[k] = sim.cloudStore[k].value; });
    const p = sim.start(c);
    p.then(() => {
      if (token === runToken && !sim.running && $('statusPill').dataset.state === 'running') { setStatus('idle', ''); setRunning(false); }
    });
  }
  async function stop() {
    runToken++;
    await sim.stop();
    setStatus('idle', '');
    setRunning(false);
    serialSys('---- simulation stopped ----');
  }
  $('simBtn').addEventListener('click', () => { if (sim.running) stop(); else run(); });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); }
  });

  /* ---------------- cloud pane ---------------- */
  const alerts = [];
  const lastVal = {};
  function checkTriggers(name, value) {
    const prev = lastVal[name];
    lastVal[name] = value;
    let fired = false;
    for (const t of state.triggers) {
      if (t.name !== name || !Cloud.triggerFires(t, prev, value)) continue;
      const text = Cloud.triggerMessage(t, value);
      const channels = [t.email && 'email', t.push && 'push'].filter(Boolean);
      alerts.push({ t: Date.now(), text, channels });
      if (alerts.length > 100) alerts.shift();
      toast((t.push ? 'IoT Remote · ' : 'Email · ') + state.thingName, text);
      fired = true;
    }
    if (fired) {
      if (state.cloudView !== 'triggers') { state._unseenAlerts = (state._unseenAlerts || 0) + 1; Cloud.badge(); }
      else if (!Cloud.isEditing()) Cloud.render();
    }
  }
  function toast(title, text) {
    const t = h('div', { class: 'toast', role: 'status' }, h('b', null, title), h('span', null, text));
    $('toasts').append(t);
    while ($('toasts').childElementCount > 3) $('toasts').firstElementChild.remove();
    setTimeout(() => t.remove(), 5500);
  }
  Cloud.mount($('cloud'), {
    getState: () => state,
    save,
    props: () => staticProps,
    device: () => ({ status: deviceStatus(), deviceId: deviceIdOf(), thingId: sim.cloud ? sim.cloud.thingId : 'a3f1c2e0-5b7d-4e9a-9c11-0d2f6b7e8a41', stats: sim.cloud ? sim.cloud.stats : null, lastSeen }),
    write(name, value) {
      const meta = staticProps.find((p) => p.name === name);
      if (meta && !(meta.perm === 'READWRITE' || meta.perm === 'WRITE')) return;
      sim.dashboardWrite(name, value);
      dashDirty = true;
      if (!sim.running) toast('Device offline', 'The value is stored in the cloud. The board picks it up when it connects.');
    },
    alerts: () => alerts,
    addTrigger(t) { state.triggers.push(t); save(); },
    removeTrigger(t) { state.triggers = state.triggers.filter((x) => x !== t); save(); },
    openCode() { openCode(true); showFile('sketch.ino'); },
    setSecrets(ssid, pass) {
      setFile('arduino_secrets.h', Cloud.writeSecrets(state.files, ssid, pass));
      if (!docs['arduino_secrets.h']) buildDocs();
      renderTabs();
      save();
      onEdit();
      toast('Network', 'arduino_secrets.h updated.');
    },
    setThing(deviceLogin, vars, added, old) {
      const had = state.files['thingProperties.h'] !== undefined;
      setFile('thingProperties.h', Cloud.generateThing(deviceLogin, vars));
      if (state.files['arduino_secrets.h'] === undefined) setFile('arduino_secrets.h', '#define SECRET_SSID "SimLab-WiFi"\n#define SECRET_OPTIONAL_PASS "esp32sim"\n#define SECRET_DEVICE_KEY "SIMULATED-DEVICE-KEY"\n');
      setFile('sketch.ino', Cloud.updateSketch(state.files['sketch.ino'] || '', vars, added, old));
      if (old && added && old.name !== added.name) {
        state.dashboard.widgets.forEach((w) => { if (w.var === old.name) w.var = added.name; });
        state.triggers.forEach((t) => { if (t.name === old.name) t.name = added.name; });
      }
      if (fileList().some((f) => !docs[f])) buildDocs();
      showFile(state.activeFile);
      save();
      onEdit();
      refreshMeta();
      toast('Thing updated', added ? (old ? 'Variable ' + added.name + ' saved.' : 'Your sketch is updated: ' + added.name + ' added' + (added.cb ? ' with ' + added.cb + '()' : '') + '.') : 'Variable removed from thingProperties.h.');
      if (!had) {
        clearLog();
        log('', 'The sketch is now a cloud sketch: #include "thingProperties.h", initProperties() and ArduinoCloud.begin() were added to setup(), and ArduinoCloud.update() to loop().');
      }
      if (old && added && old.name !== added.name) log('', 'Renamed ' + old.name + ' → ' + added.name + ' everywhere in sketch.ino' + (old.cb && added.cb ? ' (callback ' + old.cb + '() → ' + added.cb + '())' : '') + '.');
    },
  });

  /* ---------------- examples ---------------- */
  function fillExamples() {
    const sel = $('exampleSel');
    sel.innerHTML = '';
    sel.append(h('option', { value: '', disabled: '' }, 'Examples…'));
    const groups = {};
    EXAMPLES.forEach((ex) => {
      const g = ex.group || 'Getting started';
      if (!groups[g]) { groups[g] = h('optgroup', { label: g }); sel.append(groups[g]); }
      groups[g].append(h('option', { value: ex.id }, ex.title));
    });
    sel.append(h('optgroup', { label: 'Start fresh' }, h('option', { value: '__blank' }, 'Blank cloud project (no parts)')));
    sel.value = '';
    sel.addEventListener('change', async () => {
      const id = sel.value;
      sel.value = '';
      if (!id) return;
      const ex = EXAMPLES.find((e) => e.id === id);
      const title = id === '__blank' ? 'a blank project' : '"' + ex.title + '"';
      if (!window.confirm('Open ' + title + '? Your current circuit, code and dashboard will be replaced.')) return;
      await loadExample(id);
    });
  }
  function blankState() {
    const s = freshState('blink');
    s.exampleId = '__blank';
    s.project = 'My ESP32 project';
    s.thingName = 'My Thing';
    s.parts = []; s.wires = [];
    s.dashboard = { name: 'My dashboard', widgets: [] };
    s.triggers = [];
    s.cloudView = 'thing';
    s.baud = 9600;
    s.files = {
      'sketch.ino': '/*\n  Sketch generated by the Arduino IoT Cloud Thing "My Thing"\n\n  Arduino IoT Cloud Variables description\n\n  The following variables are automatically generated and updated when changes are made to the Thing\n\n  Variables which are marked as READ/WRITE in the Cloud Thing will also have functions\n  which are called when their values are changed from the Dashboard.\n  These functions are generated with the Thing and added at the end of this sketch.\n*/\n\n#include "thingProperties.h"\n\nvoid setup() {\n  // Initialize serial and wait for port to open:\n  Serial.begin(9600);\n  delay(1500);\n\n  // Defined in thingProperties.h\n  initProperties();\n\n  // Connect to Arduino IoT Cloud\n  ArduinoCloud.begin(ArduinoIoTPreferredConnection);\n  setDebugMessageLevel(2);\n  ArduinoCloud.printDebugInfo();\n}\n\nvoid loop() {\n  ArduinoCloud.update();\n  // Your code here\n}\n',
      'thingProperties.h': Cloud.generateThing('4b1e0f6a-esp32-sim', []),
      'arduino_secrets.h': '#define SECRET_SSID "SimLab-WiFi"\n#define SECRET_OPTIONAL_PASS "esp32sim"\n#define SECRET_DEVICE_KEY "SIMULATED-DEVICE-KEY"\n',
    };
    return s;
  }
  async function loadExample(id) {
    runToken++;
    await sim.stop();
    setRunning(false);
    setStatus('idle', '');
    state = id === '__blank' ? blankState() : freshState(id);
    sim.cloudStore = {};
    alerts.length = 0;
    syncSim();
    save();
    applyState(true);
    clearLog();
    if (id !== '__blank') {
      const ex = EXAMPLES.find((e) => e.id === id);
      log('', 'Opened example: ' + ex.title + '. ' + ex.blurb);
    } else {
      log('', 'Blank project. Drag parts onto the workplane, add cloud variables in Things → Setup, then build your dashboard.');
    }
    log('', 'Press Start Simulation (Ctrl+Enter).');
    if (state.codeOpen) switchConsole('output');
  }
  function applyState(fitView) {
    buildDocs();
    showFile(state.activeFile || 'sketch.ino');
    $('baudSel').value = String(state.baud);
    $('projName').value = state.project;
    syncWireSel();
    CUI.load(state);
    if (fitView || state.view.fit) { requestAnimationFrame(() => { CUI.fit(); state.view.fit = false; save(); }); }
    renderIssues();
    refreshMeta();
    Cloud.nav(state.cloudView || 'thing');
    openCode(!!state.codeOpen);
  }
  $('projName').addEventListener('change', () => { state.project = $('projName').value.trim() || 'ESP32 project'; save(); });

  /* ---------------- layout: splitter + mobile tabs ---------------- */
  (function () {
    const split = $('split');
    const cloud = $('cloud');
    let saved = null;
    try { saved = +localStorage.getItem('esp32-iot-sim:cloudW'); } catch (e) { /* ignore */ }
    if (saved) cloud.style.width = saved + 'px';
    const setW = (w) => {
      w = Math.max(340, Math.min(window.innerWidth - 420, w));
      cloud.style.width = w + 'px';
      try { localStorage.setItem('esp32-iot-sim:cloudW', String(Math.round(w))); } catch (e) { /* ignore */ }
    };
    split.addEventListener('pointerdown', (e) => {
      const sx = e.clientX, sw = cloud.getBoundingClientRect().width;
      split.setPointerCapture(e.pointerId);
      const move = (ev) => setW(sw - (ev.clientX - sx));
      const up = () => { split.removeEventListener('pointermove', move); split.removeEventListener('pointerup', up); if (cm) cm.refresh(); };
      split.addEventListener('pointermove', move);
      split.addEventListener('pointerup', up);
    });
    split.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') setW(cloud.getBoundingClientRect().width + 24);
      if (e.key === 'ArrowRight') setW(cloud.getBoundingClientRect().width - 24);
    });
  })();
  function highlightMob(which) {
    $('app').dataset.mob = which;
    document.querySelectorAll('button[data-mob]').forEach((b) => b.classList.toggle('on', b.dataset.mob === which));
  }
  function setMob(which) {
    highlightMob(which);
    if (which === 'code') { $('codePanel').hidden = false; $('codeBtn').setAttribute('aria-pressed', 'true'); state.codeOpen = true; if (cm) setTimeout(() => cm.refresh(), 0); }
    if (which === 'circuit') { $('codePanel').hidden = true; $('codeBtn').setAttribute('aria-pressed', 'false'); state.codeOpen = false; }
  }
  document.querySelectorAll('button[data-mob]').forEach((b) => b.addEventListener('click', () => setMob(b.dataset.mob)));
  // palette toggle on narrow screens
  $('palette').addEventListener('click', (e) => { if (e.target === $('palette') && window.matchMedia('(max-width: 960px)').matches) $('palette').classList.toggle('open'); });

  /* ---------------- help ---------------- */
  $('helpBtn').addEventListener('click', () => {
    const d = $('helpDlg');
    if (d.showModal) d.showModal(); else d.setAttribute('open', '');
  });

  /* ---------------- frame loop ---------------- */
  let lastDash = 0;
  function frame(t) {
    flushSerial();
    CUI.update(sim);
    if (sim.running) {
      const ms = Math.floor(performance.now() - simStart);
      const s = $('simTime').lastElementChild;
      const txt = [Math.floor(ms / 3600000), Math.floor(ms / 60000) % 60, Math.floor(ms / 1000) % 60].map((n) => String(n).padStart(2, '0')).join(':') + '.' + String(ms % 1000).padStart(3, '0');
      s.textContent = txt;
      if (sim.cloud && sim.cloud.connected) lastSeen = Date.now();
    }
    if (dashDirty || t - lastDash > 500) {
      Cloud.tick(sim.cloudStore);
      dashDirty = false;
      lastDash = t;
    }
    requestAnimationFrame(frame);
  }

  /* ---------------- boot ---------------- */
  fillExamples();
  applyState(false);
  setStatus('idle', '');
  log('', 'Welcome! Open an example from the menu, or drag parts onto the workplane. Press Start Simulation (Ctrl+Enter) to run the sketch.');
  if (!(window.CodeMirror)) log('warn', '⚠ The code editor could not load, so a plain text box is used.');
  if ($('console').dataset.open === 'serial') switchConsole('serial');
  window.addEventListener('resize', () => { if (cm) cm.refresh(); });
  window.matchMedia('(max-width: 960px)').addEventListener('change', (e) => { if (e.matches && $('app').dataset.mob !== 'cloud') highlightMob($('codePanel').hidden ? 'circuit' : 'code'); });
  if (window.matchMedia('(max-width: 960px)').matches) highlightMob($('codePanel').hidden ? 'circuit' : 'code');
  requestAnimationFrame(frame);
})();
