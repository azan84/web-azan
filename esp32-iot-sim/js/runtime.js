/* ============================================================
   ESP32 IoT Cloud Simulator — runtime
   A logic-level model of an ESP32-WROOM-32 DevKit, its GPIO,
   ADC, PWM, a few common peripherals, WiFi and an
   Arduino-Cloud-style property sync engine.
   ============================================================ */
(function (root) {
  'use strict';

  const STOP = Symbol('stop');

  /* ---------- ESP32 DevKit V1 (30-pin) pin facts ---------- */
  const GPIO = {
    0: { adc: 'ADC2', note: 'boot strap' }, 1: { note: 'TX0 (Serial)' }, 2: { adc: 'ADC2', note: 'on-board LED' }, 3: { note: 'RX0 (Serial)' },
    4: { adc: 'ADC2' }, 5: { note: 'boot strap' }, 12: { adc: 'ADC2', note: 'boot strap' }, 13: { adc: 'ADC2' }, 14: { adc: 'ADC2' },
    15: { adc: 'ADC2', note: 'boot strap' }, 16: {}, 17: {}, 18: {}, 19: {}, 21: { note: 'I2C SDA' }, 22: { note: 'I2C SCL' }, 23: {},
    25: { adc: 'ADC2', note: 'DAC1' }, 26: { adc: 'ADC2', note: 'DAC2' }, 27: { adc: 'ADC2' },
    32: { adc: 'ADC1' }, 33: { adc: 'ADC1' }, 34: { adc: 'ADC1', inputOnly: true }, 35: { adc: 'ADC1', inputOnly: true },
    36: { adc: 'ADC1', inputOnly: true, note: 'VP' }, 39: { adc: 'ADC1', inputOnly: true, note: 'VN' },
  };
  const FLASH_PINS = [6, 7, 8, 9, 10, 11];

  const C = {
    HIGH: 1, LOW: 0, INPUT: 1, OUTPUT: 3, INPUT_PULLUP: 5, INPUT_PULLDOWN: 9,
    RISING: 1, FALLING: 2, CHANGE: 3, LED_BUILTIN: 2,
    DHT11: 11, DHT22: 22, DHT21: 21, AM2301: 21,
    READ: 1, WRITE: 2, READWRITE: 3, ON_CHANGE: -1, SECONDS: 1, MINUTES: 60, HOURS: 3600,
    DEC: 10, HEX: 16, OCT: 8, BIN: 2,
    WL_IDLE_STATUS: 0, WL_NO_SSID_AVAIL: 1, WL_SCAN_COMPLETED: 2, WL_CONNECTED: 3, WL_CONNECT_FAILED: 4, WL_CONNECTION_LOST: 5, WL_DISCONNECTED: 6,
    WIFI_STA: 1, WIFI_AP: 2, WIFI_AP_STA: 3, WIFI_OFF: 0,
    PI: Math.PI, HALF_PI: Math.PI / 2, TWO_PI: Math.PI * 2, DEG_TO_RAD: Math.PI / 180, RAD_TO_DEG: 180 / Math.PI,
    DBG_NONE: -1, DBG_ERROR: 0, DBG_WARNING: 1, DBG_INFO: 2, DBG_DEBUG: 3, DBG_VERBOSE: 4,
  };

  function fmtNum(v, digits) {
    if (v && typeof v === 'object' && '__f' in v) {
      v = v.__f;
      if (digits === undefined && typeof v === 'number' && Number.isFinite(v)) return v.toFixed(2);
    }
    if (typeof v === 'boolean') return v ? '1' : '0';
    if (typeof v !== 'number') return String(v);
    if (Number.isNaN(v)) return 'nan';
    if (!Number.isFinite(v)) return v > 0 ? 'inf' : '-inf';
    if (digits === undefined) return Number.isInteger(v) ? String(v) : v.toFixed(2);
    if (digits === 16) return Math.trunc(v >>> 0).toString(16).toUpperCase();
    if (digits === 2) return Math.trunc(v >>> 0).toString(2);
    if (digits === 8) return Math.trunc(v >>> 0).toString(8);
    if (digits === 10) return String(Math.trunc(v));
    return v.toFixed(digits);
  }

  function printf(fmt, args) {
    let ai = 0;
    return String(fmt).replace(/%([-+ 0#]*)(\d+)?(?:\.(\d+))?(l{0,2}|h{0,2}|z)?([diufFeEgGxXoscp%])/g, (all, flags, width, prec, len, conv) => {
      if (conv === '%') return '%';
      let v = args[ai++];
      let s;
      switch (conv) {
        case 'd': case 'i': case 'u': s = String(Math.trunc(Number(v))); break;
        case 'f': case 'F': s = Number(v).toFixed(prec === undefined ? 6 : +prec); break;
        case 'e': case 'E': s = Number(v).toExponential(prec === undefined ? 6 : +prec); if (conv === 'E') s = s.toUpperCase(); break;
        case 'g': case 'G': s = String(Number(v)); break;
        case 'x': s = (Number(v) >>> 0).toString(16); break;
        case 'X': s = (Number(v) >>> 0).toString(16).toUpperCase(); break;
        case 'o': s = (Number(v) >>> 0).toString(8); break;
        case 'c': s = typeof v === 'number' ? String.fromCharCode(v) : String(v)[0] || ''; break;
        case 's': s = String(v); if (prec !== undefined) s = s.slice(0, +prec); break;
        default: s = String(v);
      }
      if (width && s.length < +width) {
        const pad = flags.includes('0') && !flags.includes('-') && conv !== 's' ? '0' : ' ';
        s = flags.includes('-') ? s.padEnd(+width, ' ') : s.padStart(+width, pad);
      }
      return s;
    });
  }

  // Arduino String helpers used by sketches (String is a JS string here)
  function installStringHelpers() {
    const P = String.prototype;
    const def = (name, fn) => { if (!P[name]) Object.defineProperty(P, name, { value: fn, configurable: true, writable: true }); };
    def('toInt', function () { const n = parseInt(this, 10); return Number.isNaN(n) ? 0 : n; });
    def('toFloat', function () { const n = parseFloat(this); return Number.isNaN(n) ? 0 : n; });
    def('toDouble', function () { const n = parseFloat(this); return Number.isNaN(n) ? 0 : n; });
    def('equals', function (o) { return String(this) === String(o); });
    def('equalsIgnoreCase', function (o) { return String(this).toLowerCase() === String(o).toLowerCase(); });
    def('compareTo', function (o) { return String(this) < String(o) ? -1 : String(this) > String(o) ? 1 : 0; });
    def('isEmpty', function () { return this.length === 0; });
  }

  class Sim {
    constructor(hooks) {
      this.hooks = hooks || {};
      this.parts = [];
      this.network = { routerOn: true, ssid: 'SimLab-WiFi', pass: 'esp32sim', latency: 250 };
      this.cloudStore = {};      // name -> { value, t, history: [] } (survives runs, like a real cloud)
      this.resetState();
      installStringHelpers();
    }

    /* ---------- state ---------- */
    resetState() {
      this.running = false;
      this.stopped = true;
      this.pins = {};
      this.ledc = { channels: {}, pinChannel: {} };
      this.servos = [];
      this.tones = {};
      this.interrupts = {};
      this.serialBaud = 0;
      this.serialRx = '';
      this.pendingSleeps = new Set();
      this.t0 = performance.now();
      this.ops = 0;
      this.lastYield = performance.now();
      this.warned = new Set();
      this.wifi = { status: 0, ssid: '', pass: '', since: 0, mode: 1, attempting: false };
      this.cloud = null;
      for (const p of this.parts) {
        p.state = {};
      }
    }

    pin(n) {
      if (!this.pins[n]) this.pins[n] = { mode: null, out: 0, pwm: null, lastIn: null };
      return this.pins[n];
    }

    warnOnce(key, msg) {
      if (this.warned.has(key)) return;
      this.warned.add(key);
      if (this.hooks.warn) this.hooks.warn(msg);
    }

    millis() { return Math.floor(performance.now() - this.t0); }

    partsOn(pin) { return this.parts.filter((p) => +p.pin === +pin); }

    /* ---------- electrical model ---------- */
    inputLevel(n) {
      const p = this.pin(n);
      if (p.mode === C.OUTPUT) return p.out;
      const parts = this.partsOn(n);
      for (const part of parts) {
        if (part.type === 'button') {
          if (part.value) return 0;                        // wired to GND
          if (p.mode === C.INPUT_PULLUP) return 1;
          if (p.mode === C.INPUT_PULLDOWN) return 0;
          this.warnOnce('float' + n, 'GPIO ' + n + ': the button is wired to GND but the pin has no pull-up, so it floats when released. Use pinMode(' + n + ', INPUT_PULLUP).');
          return Math.random() < 0.5 ? 1 : 0;
        }
        if (part.type === 'pir') return part.value ? 1 : 0;
        if (part.type === 'dht22') return 1;
        if (part.type === 'pot' || part.type === 'ldr') return this.analogValue(part) > 2048 ? 1 : 0;
      }
      if (p.mode === C.INPUT_PULLUP) return 1;
      if (p.mode === C.INPUT_PULLDOWN) return 0;
      return Math.random() < 0.5 ? 1 : 0; // floating
    }

    analogValue(part) {
      if (part.type === 'pot') return Math.round(+part.value || 0);
      if (part.type === 'ldr') {
        // brighter light → lower LDR resistance → higher voltage on a 10k divider
        const lux = Math.max(0, +part.value || 0);
        const rLdr = 500000 / Math.pow(Math.max(lux, 0.1), 0.8);
        const v = 3.3 * 10000 / (10000 + rLdr);
        return Math.max(0, Math.min(4095, Math.round(v / 3.3 * 4095)));
      }
      return 0;
    }

    checkInterrupts() {
      for (const k of Object.keys(this.interrupts)) {
        const n = +k;
        const irq = this.interrupts[k];
        const lvl = this.inputLevel(n);
        if (irq.last === null) { irq.last = lvl; continue; }
        if (lvl !== irq.last) {
          const rising = lvl === 1;
          irq.last = lvl;
          if (irq.mode === C.CHANGE || (irq.mode === C.RISING && rising) || (irq.mode === C.FALLING && !rising)) {
            Promise.resolve().then(() => irq.fn()).catch((e) => { if (e !== STOP) this.fail(e); });
          }
        }
      }
    }

    // called by the UI when a part changes value (button press etc.)
    partChanged() { if (this.running) this.checkInterrupts(); }

    /* ---------- outputs the UI reads ---------- */
    pinOutput(n) {
      // returns 0..1 drive level for an output pin, or null when not driven
      const p = this.pins[n];
      if (!p) return null;
      if (p.pwm !== null && p.pwm !== undefined) return p.pwm;
      if (p.mode === C.OUTPUT) return p.out ? 1 : 0;
      return null;
    }
    toneOn(n) { return this.tones[n] || null; }
    servoAngle(n) {
      const s = this.servos.find((x) => x.pin === +n && x._on);
      return s ? s.angle : null;
    }

    /* ---------- run control ---------- */
    async start(compiled) {
      await this.stop();
      this.resetState();
      this.stopped = false;
      this.running = true;
      const api = this.buildApi();
      let prog;
      try {
        prog = await compiled.factory(api);
      } catch (e) {
        if (e !== STOP) this.fail(e);
        return;
      }
      if (this.hooks.onStart) this.hooks.onStart();
      try {
        if (prog.setup) await prog.setup();
        while (!this.stopped) {
          if (prog.loop) await prog.loop();
          else await this.sleep(50);
          this.checkInterrupts();
          if (performance.now() - this.lastYield > 12) await this.yieldNow();
        }
      } catch (e) {
        if (e !== STOP) this.fail(e);
      }
    }

    fail(e) {
      this.stopped = true;
      this.running = false;
      this.flushSleeps();
      if (this.hooks.onError) this.hooks.onError(e);
    }

    async stop() {
      this.stopped = true;
      this.running = false;
      this.flushSleeps();
      if (this.cloud && this.cloud.connected) this.cloudSetOnline(false);
      for (const k of Object.keys(this.tones)) delete this.tones[k];
      await new Promise((r) => setTimeout(r, 0));
    }

    flushSleeps() {
      for (const r of this.pendingSleeps) r();
      this.pendingSleeps.clear();
    }

    sleep(ms) {
      if (this.stopped) return Promise.reject(STOP);
      return new Promise((resolve, reject) => {
        let done = false;
        const fin = () => {
          if (done) return;
          done = true;
          clearTimeout(t);
          this.pendingSleeps.delete(fin);
          this.lastYield = performance.now();
          if (this.stopped) reject(STOP); else resolve();
        };
        const t = setTimeout(fin, Math.max(0, ms));
        this.pendingSleeps.add(fin);
      });
    }

    async yieldNow() {
      this.lastYield = performance.now();
      await new Promise((r) => setTimeout(r, 0));
      if (this.stopped) throw STOP;
    }

    /* ---------- serial ---------- */
    serialWrite(text) {
      if (!this.serialBaud) {
        this.warnOnce('serialbegin', 'Serial.print() was called before Serial.begin() — on a real board nothing would appear.');
        return;
      }
      if (this.hooks.serial) this.hooks.serial(text, this.serialBaud);
    }
    serialInput(text) { this.serialRx += text; }

    /* ---------- WiFi model ---------- */
    wifiStep() {
      const w = this.wifi;
      const net = this.network;
      const now = this.millis();
      if (w.status === C.WL_CONNECTED && !net.routerOn) {
        w.status = C.WL_CONNECTION_LOST;
        w.since = now;
      }
      if (w.attempting && w.status !== C.WL_CONNECTED && now - w.since >= 1400) {
        if (!net.routerOn || w.ssid !== net.ssid) { w.status = C.WL_NO_SSID_AVAIL; w.since = now; w.attempting = false; }
        else if (w.pass !== net.pass) { w.status = C.WL_CONNECT_FAILED; w.since = now; w.attempting = false; }
        else { w.status = C.WL_CONNECTED; w.since = now; w.attempting = false; }
      }
      return w.status;
    }
    wifiBegin(ssid, pass) {
      this.wifi.ssid = String(ssid || '');
      this.wifi.pass = String(pass || '');
      this.wifi.attempting = true;
      this.wifi.status = C.WL_DISCONNECTED;
      this.wifi.since = this.millis();
    }

    /* ---------- cloud model ---------- */
    cloudLog(level, msg) {
      if (!this.cloud) return;
      if (this.cloud.debugLevel >= level) this.serialWrite(msg + '\r\n');
    }

    cloudSetOnline(on) {
      const c = this.cloud;
      if (!c) return;
      c.connected = on;
      if (this.hooks.cloudStatus) this.hooks.cloudStatus(on ? 'online' : 'offline', c);
    }

    cloudSend(prop, value) {
      const c = this.cloud;
      const lat = Math.max(0, +this.network.latency || 0);
      const v = typeof value === 'number' || typeof value === 'boolean' ? value : String(value);
      setTimeout(() => {
        const rec = this.cloudStore[prop.name] || (this.cloudStore[prop.name] = { value: null, t: 0, history: [] });
        rec.value = v;
        rec.t = Date.now();
        if (typeof v === 'number' || typeof v === 'boolean') {
          rec.history.push({ t: rec.t, v: +v, src: 'device' });
          if (rec.history.length > 240) rec.history.shift();
        } else {
          rec.history.push({ t: rec.t, v, src: 'device' });
          if (rec.history.length > 50) rec.history.shift();
        }
        if (this.hooks.cloudValue) this.hooks.cloudValue(prop.name, rec, 'device');
      }, lat / 2);
      prop.lastSent = v;
      prop.lastSentAt = this.millis();
      if (c) c.stats.up++;
    }

    // dashboard → device
    dashboardWrite(name, value) {
      const rec = this.cloudStore[name] || (this.cloudStore[name] = { value: null, t: 0, history: [] });
      rec.value = value;
      rec.t = Date.now();
      rec.history.push({ t: rec.t, v: typeof value === 'string' ? value : +value, src: 'dashboard' });
      if (rec.history.length > 240) rec.history.shift();
      if (this.hooks.cloudValue) this.hooks.cloudValue(name, rec, 'dashboard');
      const c = this.cloud;
      if (!c || !c.connected) return false;
      const prop = c.props.find((p) => p.name === name);
      if (!prop) return false;
      const lat = Math.max(0, +this.network.latency || 0);
      setTimeout(() => { if (this.cloud === c) c.inbox.push({ prop, value }); }, lat / 2);
      return true;
    }

    async cloudUpdate() {
      const c = this.cloud;
      if (!c || !c.begun) {
        this.warnOnce('cloudnobegin', 'ArduinoCloud.update() called before ArduinoCloud.begin() — nothing will connect.');
        return;
      }
      const now = this.millis();
      const w = this.wifi;
      this.wifiStep();

      if (c.state === 'INIT') {
        this.wifiBegin(c.conn.ssid, c.conn.pass);
        c.state = 'WIFI';
        c.stateAt = now;
        this.cloudLog(C.DBG_INFO, 'WiFi.status(): ' + w.status);
        if (!c.conn.ssid) this.cloudLog(C.DBG_ERROR, 'ERROR: SECRET_SSID is empty — fill it in arduino_secrets.h');
        this.cloudLog(C.DBG_INFO, 'Connecting to "' + c.conn.ssid + '"');
      } else if (c.state === 'WIFI') {
        if (w.status === C.WL_CONNECTED) {
          this.cloudLog(C.DBG_INFO, 'Connected to "' + c.conn.ssid + '"');
          c.state = 'CLOUD';
          c.stateAt = now;
        } else if (!w.attempting) {
          if (now - c.stateAt > 500) {
            this.cloudLog(C.DBG_INFO, 'WiFi.status(): ' + w.status);
            this.cloudLog(C.DBG_ERROR, 'Connection to "' + c.conn.ssid + '" failed' + (w.status === C.WL_CONNECT_FAILED ? ' (wrong password?)' : ' (network not found)'));
            this.cloudLog(C.DBG_INFO, 'Retrying in  "2000" milliseconds');
            c.state = 'WIFI_WAIT';
            c.stateAt = now;
          }
        }
      } else if (c.state === 'WIFI_WAIT') {
        if (now - c.stateAt >= 2000) { c.state = 'INIT'; }
      } else if (c.state === 'CLOUD') {
        if (w.status !== C.WL_CONNECTED) { c.state = 'INIT'; return; }
        if (now - c.stateAt >= 900 + (+this.network.latency || 0)) {
          if (!c.deviceKey) {
            this.cloudLog(C.DBG_ERROR, 'ArduinoIoTCloudTCP::handle_ConnectMqttBroker could not connect: device key missing (SECRET_DEVICE_KEY)');
            c.state = 'CLOUD_WAIT';
            c.stateAt = now;
            return;
          }
          this.cloudLog(C.DBG_INFO, 'Connected to Arduino IoT Cloud');
          this.cloudLog(C.DBG_INFO, 'Thing ID: ' + c.thingId);
          c.state = 'CONNECTED';
          c.stateAt = now;
          this.cloudSetOnline(true);
          // first sync: cloud wins for writable properties
          for (const p of c.props) {
            p.lastSent = undefined;
            const rec = this.cloudStore[p.name];
            if ((p.perm & C.WRITE) && rec && rec.value !== null && rec.value !== undefined) {
              c.inbox.push({ prop: p, value: rec.value, sync: true });
            }
          }
        }
      } else if (c.state === 'CLOUD_WAIT') {
        if (now - c.stateAt >= 3000) { c.state = 'CLOUD'; c.stateAt = now; }
      } else if (c.state === 'CONNECTED') {
        if (w.status !== C.WL_CONNECTED) {
          this.cloudLog(C.DBG_INFO, 'Disconnected from Arduino IoT Cloud');
          this.cloudLog(C.DBG_INFO, 'WiFi.status(): ' + w.status);
          this.cloudSetOnline(false);
          c.state = 'INIT';
          return;
        }
        // inbound: dashboard → device, then fire callbacks
        while (c.inbox.length) {
          const { prop, value } = c.inbox.shift();
          let v = value;
          if (prop.kind === 'bool') v = !!v;
          else if (prop.kind === 'int') v = Math.trunc(+v);
          else if (prop.kind === 'float') v = +v;
          else v = String(v);
          prop.binding.set(v);
          prop.lastSent = v;
          c.stats.down++;
          if (prop.cb) await prop.cb();
        }
        // outbound: device → dashboard
        for (const p of c.props) {
          if (!(p.perm & C.READ)) continue;
          let v;
          try { v = p.binding.get(); } catch (e) { continue; }
          if (p.policy === 'periodic') {
            if (p.lastSentAt === undefined || p.lastSent === undefined || now - p.lastSentAt >= p.period * 1000) this.cloudSend(p, v);
          } else {
            let changed = p.lastSent === undefined || v !== p.lastSent;
            if (changed && p.delta && typeof v === 'number' && typeof p.lastSent === 'number') {
              changed = Math.abs(v - p.lastSent) >= p.delta;
            }
            if (typeof v === 'number' && Number.isNaN(v) && Number.isNaN(p.lastSent)) changed = false;
            if (changed) this.cloudSend(p, v);
          }
        }
      }
    }

    /* ---------- API exposed to sketches ---------- */
    buildApi() {
      const sim = this;
      const api = Object.assign({}, C);

      const checkPin = (n, fn) => {
        n = +n;
        if (FLASH_PINS.includes(n)) sim.warnOnce('flash' + n, 'GPIO ' + n + ' is connected to the on-module SPI flash on ESP32-WROOM-32 — using it will crash a real board.');
        else if (!(n in GPIO)) sim.warnOnce('nopin' + n, fn + '(' + n + '): GPIO ' + n + ' does not exist on the ESP32 DevKit.');
        return n;
      };

      api.__tick = async () => {
        if (sim.stopped) throw STOP;
        if ((++sim.ops & 255) === 0 && performance.now() - sim.lastYield > 12) {
          sim.checkInterrupts();
          await sim.yieldNow();
        }
      };
      api.__int = (v) => {
        if (typeof v === 'boolean') return v ? 1 : 0;
        if (typeof v === 'string') return v.length === 1 ? v.charCodeAt(0) : (parseInt(v, 10) || 0);
        const n = Math.trunc(+v);
        return Number.isFinite(n) ? n : 0;
      };
      api.__float = (v) => (typeof v === 'boolean' ? (v ? 1 : 0) : +v);
      api.__char = (v) => (typeof v === 'number' ? String.fromCharCode(v) : String(v));
      api.__F = (v) => ({ __f: v });
      api.__String = (v, d) => {
        if (v === undefined) return '';
        if (v && typeof v === 'object' && '__f' in v) { v = v.__f; if (d === undefined && typeof v === 'number' && Number.isFinite(v)) return v.toFixed(2); }
        if (typeof v === 'number') {
          if (d === C.HEX || d === C.BIN || d === C.OCT) return fmtNum(v, d);
          if (d !== undefined) return v.toFixed(d);
          return fmtNum(v);
        }
        if (typeof v === 'boolean') return v ? '1' : '0';
        if (v && typeof v.toString === 'function') return v.toString();
        return String(v);
      };
      api.__arr = (dims, def) => {
        const make = (k) => Array.from({ length: +dims[k] || 0 }, () => (k + 1 < dims.length ? make(k + 1) : def));
        return make(0);
      };
      api.__sizeof = (v) => (Array.isArray(v) ? v.length * 4 : typeof v === 'string' ? v.length + 1 : 4);
      api.F = (s) => s;

      /* time */
      api.millis = () => sim.millis();
      api.micros = () => Math.floor((performance.now() - sim.t0) * 1000);
      api.delay = (ms) => sim.sleep(+ms || 0);
      api.delayMicroseconds = (us) => (us >= 2000 ? sim.sleep(us / 1000) : api.__tick());
      api.yield = () => sim.yieldNow();

      /* math */
      api.map = (x, a, b, c, d) => (b - a === 0 ? c : Math.trunc((x - a) * (d - c) / (b - a) + c));
      api.constrain = (x, a, b) => (x < a ? a : x > b ? b : x);
      api.min = (a, b) => (a < b ? a : b);
      api.max = (a, b) => (a > b ? a : b);
      api.abs = Math.abs; api.pow = Math.pow; api.sqrt = Math.sqrt; api.sq = (x) => x * x;
      api.sin = Math.sin; api.cos = Math.cos; api.tan = Math.tan; api.atan2 = Math.atan2;
      api.floor = Math.floor; api.ceil = Math.ceil; api.round = Math.round; api.fabs = Math.abs; api.log = Math.log; api.exp = Math.exp;
      api.isnan = (v) => Number.isNaN(+v);
      api.isinf = (v) => !Number.isFinite(+v) && !Number.isNaN(+v);
      api.random = (a, b) => (b === undefined ? Math.floor(Math.random() * a) : Math.floor(a + Math.random() * (b - a)));
      api.randomSeed = () => {};
      api.bitRead = (v, b) => (v >> b) & 1;
      api.bitSet = (v, b) => v | (1 << b);
      api.bitClear = (v, b) => v & ~(1 << b);
      api.bit = (b) => 1 << b;
      api.highByte = (v) => (v >> 8) & 0xff; api.lowByte = (v) => v & 0xff;
      api.isDigit = (c) => /[0-9]/.test(c); api.isAlpha = (c) => /[A-Za-z]/.test(c); api.isSpace = (c) => /\s/.test(c);

      /* GPIO */
      api.pinMode = (n, mode) => {
        n = checkPin(n, 'pinMode');
        const info = GPIO[n] || {};
        if (info.inputOnly && mode === C.OUTPUT) sim.warnOnce('io' + n, 'GPIO ' + n + ' is input-only on the ESP32 — pinMode(' + n + ', OUTPUT) has no effect on a real board.');
        if (info.inputOnly && (mode === C.INPUT_PULLUP || mode === C.INPUT_PULLDOWN)) sim.warnOnce('iopu' + n, 'GPIO ' + n + ' has no internal pull-up/pull-down resistors — add an external one.');
        const p = sim.pin(n);
        p.mode = info.inputOnly && mode !== C.INPUT ? C.INPUT : mode;
        if (info.inputOnly && (mode === C.INPUT_PULLUP || mode === C.INPUT_PULLDOWN)) p.mode = C.INPUT;
        if (mode === C.OUTPUT) p.pwm = null;
        if (mode !== C.OUTPUT && sim.partsOn(n).some((x) => x.type === 'button' || x.type === 'pir')) sim.pin(n).lastIn = sim.inputLevel(n);
      };
      api.digitalWrite = (n, v) => {
        n = checkPin(n, 'digitalWrite');
        const p = sim.pin(n);
        if (p.mode !== C.OUTPUT) {
          if (p.mode === null) sim.warnOnce('dwmode' + n, 'digitalWrite(' + n + ', …) without pinMode(' + n + ', OUTPUT) — the pin will not drive the load.');
          return;
        }
        if ((GPIO[n] || {}).inputOnly) return;
        p.out = v ? 1 : 0;
        p.pwm = null;
        if (sim.ledc.pinChannel[n] !== undefined) delete sim.ledc.pinChannel[n];
      };
      api.digitalRead = (n) => {
        n = checkPin(n, 'digitalRead');
        return sim.inputLevel(n);
      };
      api.analogRead = (n) => {
        n = checkPin(n, 'analogRead');
        const info = GPIO[n] || {};
        if (!info.adc) {
          sim.warnOnce('noadc' + n, 'analogRead(' + n + '): GPIO ' + n + ' is not an ADC pin. Use GPIO 32–39 (ADC1).');
          return 0;
        }
        if (info.adc === 'ADC2' && sim.wifi.status === C.WL_CONNECTED) {
          sim.warnOnce('adc2' + n, 'analogRead(' + n + '): GPIO ' + n + ' is on ADC2, which cannot be used while WiFi is on. Move the sensor to an ADC1 pin (GPIO 32–39).');
          return 0;
        }
        const part = sim.partsOn(n).find((x) => x.type === 'pot' || x.type === 'ldr');
        if (part) {
          const noise = Math.round((Math.random() - 0.5) * 12);
          return Math.max(0, Math.min(4095, sim.analogValue(part) + noise));
        }
        return Math.floor(Math.random() * 180); // floating ADC
      };
      api.analogReadMilliVolts = (n) => Math.round(api.analogRead(n) / 4095 * 3300);
      api.analogReadResolution = () => {};
      api.analogSetAttenuation = () => {};
      api.analogWrite = (n, duty) => {
        n = checkPin(n, 'analogWrite');
        if ((GPIO[n] || {}).inputOnly) { sim.warnOnce('aw' + n, 'analogWrite(' + n + '): GPIO ' + n + ' is input-only.'); return; }
        const p = sim.pin(n);
        p.mode = C.OUTPUT;
        p.pwm = Math.max(0, Math.min(255, +duty || 0)) / 255;
      };
      api.dacWrite = (n, v) => {
        n = +n;
        if (n !== 25 && n !== 26) { sim.warnOnce('dac' + n, 'dacWrite(' + n + '): only GPIO 25 and 26 have a DAC.'); return; }
        const p = sim.pin(n);
        p.mode = C.OUTPUT;
        p.pwm = Math.max(0, Math.min(255, +v || 0)) / 255;
      };

      /* LEDC (core 2.x channel API and core 3.x pin API) */
      api.ledcSetup = (ch, freq, res) => { sim.ledc.channels[ch] = { freq, res: res || 8, duty: 0, pins: [] }; return freq; };
      api.ledcAttachPin = (n, ch) => {
        n = checkPin(n, 'ledcAttachPin');
        const c = sim.ledc.channels[ch] || (sim.ledc.channels[ch] = { freq: 5000, res: 8, duty: 0, pins: [] });
        c.pins.push(n);
        sim.ledc.pinChannel[n] = ch;
        sim.pin(n).mode = C.OUTPUT;
        sim.pin(n).pwm = 0;
      };
      api.ledcAttach = (n, freq, res) => {
        n = checkPin(n, 'ledcAttach');
        const key = 'pin' + n;
        sim.ledc.channels[key] = { freq, res: res || 8, duty: 0, pins: [n] };
        sim.ledc.pinChannel[n] = key;
        sim.pin(n).mode = C.OUTPUT;
        sim.pin(n).pwm = 0;
        return true;
      };
      api.ledcAttachChannel = (n, freq, res, ch) => { api.ledcSetup(ch, freq, res); api.ledcAttachPin(n, ch); return true; };
      api.ledcWrite = (chOrPin, duty) => {
        let c = sim.ledc.channels['pin' + chOrPin] || sim.ledc.channels[chOrPin];
        if (!c) { sim.warnOnce('ledc' + chOrPin, 'ledcWrite(' + chOrPin + ', …) before ledcAttach()/ledcSetup().'); return; }
        const maxv = Math.pow(2, c.res) - 1;
        c.duty = Math.max(0, Math.min(maxv, +duty || 0));
        for (const n of c.pins) sim.pin(n).pwm = c.duty / maxv;
      };
      api.ledcWriteTone = (chOrPin, freq) => {
        const c = sim.ledc.channels['pin' + chOrPin] || sim.ledc.channels[chOrPin];
        if (!c) return;
        for (const n of c.pins) { if (freq > 0) sim.tones[n] = { freq }; else delete sim.tones[n]; }
      };
      api.ledcDetach = (n) => { delete sim.ledc.pinChannel[n]; sim.pin(n).pwm = null; };

      api.tone = (n, freq, dur) => {
        n = checkPin(n, 'tone');
        sim.pin(n).mode = C.OUTPUT;
        sim.tones[n] = { freq: +freq || 1000 };
        if (dur) setTimeout(() => { delete sim.tones[n]; }, +dur);
      };
      api.noTone = (n) => { delete sim.tones[+n]; };

      api.attachInterrupt = (n, fn, mode) => {
        n = +n;
        sim.interrupts[n] = { fn, mode, last: null };
      };
      api.detachInterrupt = (n) => { delete sim.interrupts[+n]; };
      api.digitalPinToInterrupt = (n) => +n;
      api.noInterrupts = () => {};
      api.interrupts = () => {};

      /* Serial */
      const Serial = {
        begin(baud) { sim.serialBaud = +baud || 115200; },
        end() { sim.serialBaud = 0; },
        print(v, d) { sim.serialWrite(fmtNum(v, d)); return String(v).length; },
        println(v, d) { sim.serialWrite((v === undefined ? '' : fmtNum(v, d)) + '\r\n'); },
        printf(fmt, ...args) { sim.serialWrite(printf(fmt, args)); },
        write(v) { sim.serialWrite(typeof v === 'number' ? String.fromCharCode(v) : String(v)); },
        flush() {},
        available() { return sim.serialRx.length; },
        read() { if (!sim.serialRx.length) return -1; const c = sim.serialRx.charCodeAt(0); sim.serialRx = sim.serialRx.slice(1); return c; },
        peek() { return sim.serialRx.length ? sim.serialRx.charCodeAt(0) : -1; },
        readString() { const s = sim.serialRx; sim.serialRx = ''; return s; },
        readStringUntil(term) {
          const t = typeof term === 'number' ? String.fromCharCode(term) : String(term);
          const k = sim.serialRx.indexOf(t);
          if (k < 0) { const s = sim.serialRx; sim.serialRx = ''; return s; }
          const s = sim.serialRx.slice(0, k);
          sim.serialRx = sim.serialRx.slice(k + 1);
          return s;
        },
        parseInt() { const m = /-?\d+/.exec(sim.serialRx); if (!m) { sim.serialRx = ''; return 0; } sim.serialRx = sim.serialRx.slice(m.index + m[0].length); return parseInt(m[0], 10); },
        parseFloat() { const m = /-?\d+(\.\d+)?/.exec(sim.serialRx); if (!m) { sim.serialRx = ''; return 0; } sim.serialRx = sim.serialRx.slice(m.index + m[0].length); return parseFloat(m[0]); },
        setTimeout() {},
        valueOf() { return 1; },
      };
      api.Serial = Serial;

      /* WiFi */
      const ip = { toString: () => (sim.wifi.status === C.WL_CONNECTED ? '192.168.4.' + (20 + (sim.network.ssid.length % 50)) : '0.0.0.0') };
      api.WiFi = {
        mode(m) { sim.wifi.mode = m; return true; },
        begin(ssid, pass) { sim.wifiBegin(ssid, pass); return sim.wifi.status; },
        status() { return sim.wifiStep(); },
        isConnected() { return sim.wifiStep() === C.WL_CONNECTED; },
        disconnect() { sim.wifi.status = C.WL_DISCONNECTED; sim.wifi.attempting = false; return true; },
        reconnect() { sim.wifiBegin(sim.wifi.ssid, sim.wifi.pass); return true; },
        localIP() { return ip; },
        RSSI() { return sim.wifi.status === C.WL_CONNECTED ? -48 - Math.floor(Math.random() * 8) : 0; },
        SSID() { return sim.wifi.status === C.WL_CONNECTED ? sim.wifi.ssid : ''; },
        macAddress() { return '24:0A:C4:5E:17:9C'; },
        setHostname() { return true; },
        scanNetworks() { return sim.network.routerOn ? 1 : 0; },
      };

      /* Arduino Cloud */
      api.setDebugMessageLevel = (lvl) => { if (sim.cloud) sim.cloud.debugLevel = lvl; else sim.pendingDebug = lvl; };
      api.Permission = { Read: C.READ, Write: C.WRITE, ReadWrite: C.READWRITE };
      api.WiFiConnectionHandler = function WiFiConnectionHandler(ssid, pass) { this.ssid = ssid; this.pass = pass; this.kind = 'wifi'; };
      const ensureCloud = () => {
        if (!sim.cloud) {
          sim.cloud = {
            props: [], inbox: [], begun: false, connected: false, state: 'IDLE', stateAt: 0,
            debugLevel: sim.pendingDebug !== undefined ? sim.pendingDebug : C.DBG_ERROR,
            boardId: '', deviceKey: '', thingId: 'a3f1c2e0-5b7d-4e9a-9c11-0d2f6b7e8a41', conn: null, stats: { up: 0, down: 0 },
          };
        }
        return sim.cloud;
      };
      api.ArduinoCloud = {
        setBoardId(id) { ensureCloud().boardId = String(id); },
        setSecretDeviceKey(k) { ensureCloud().deviceKey = String(k); },
        setThingId(id) { ensureCloud().thingId = String(id); },
        addProperty(binding, perm, policy, cb, delta) {
          const c = ensureCloud();
          const meta = (sim.hooks.propMeta && sim.hooks.propMeta(binding.name)) || { kind: typeof binding.get() === 'boolean' ? 'bool' : typeof binding.get() === 'string' ? 'str' : 'float' };
          const p = {
            name: binding.name, binding, perm: perm || C.READWRITE, kind: meta.kind, type: meta.type,
            policy: policy === undefined || policy === C.ON_CHANGE || policy < 0 ? 'change' : 'periodic',
            period: policy > 0 ? policy : 0, cb: typeof cb === 'function' ? cb : null, delta: +delta || 0,
          };
          const old = c.props.findIndex((x) => x.name === p.name);
          if (old >= 0) c.props.splice(old, 1);
          c.props.push(p);
          if (sim.hooks.cloudProps) sim.hooks.cloudProps(c.props);
          const chain = {
            onUpdate(fn) { p.cb = fn; return chain; },
            onSync() { return chain; },
            publishOnChange(d) { p.policy = 'change'; p.delta = +d || 0; return chain; },
            publishEvery(s) { p.policy = 'periodic'; p.period = +s || 1; return chain; },
          };
          return chain;
        },
        begin(conn) {
          const c = ensureCloud();
          if (!conn || conn.kind !== 'wifi') sim.warnOnce('nocon', 'ArduinoCloud.begin() needs a WiFiConnectionHandler (see thingProperties.h).');
          c.conn = conn || { ssid: '', pass: '' };
          c.begun = true;
          c.state = 'INIT';
          c.stateAt = sim.millis();
          if (sim.hooks.cloudStatus) sim.hooks.cloudStatus('connecting', c);
          return 1;
        },
        update() { return sim.cloudUpdate(); },
        connected() { return !!(sim.cloud && sim.cloud.connected); },
        printDebugInfo() {
          const c = ensureCloud();
          sim.cloudLog(C.DBG_INFO, '***** Arduino IoT Cloud - configuration info *****');
          sim.cloudLog(C.DBG_INFO, 'Device ID: ' + (c.boardId || '(not set)'));
          sim.cloudLog(C.DBG_INFO, 'MQTT Broker: iot.arduino.cc:8884 (simulated)');
        },
        getThingId() { return ensureCloud().thingId; },
        getInternalTime() { return Math.floor(Date.now() / 1000); },
        getLocalTime() { return Math.floor(Date.now() / 1000); },
      };

      /* DHT sensor */
      api.DHT = function DHT(pin, type) {
        this.pin = +pin;
        this.type = type;
        this.begun = false;
      };
      api.DHT.prototype.begin = function () { this.begun = true; };
      const dhtPart = (self) => {
        if (!self.begun) sim.warnOnce('dhtbegin', 'dht.begin() was not called in setup().');
        return sim.partsOn(self.pin).find((x) => x.type === 'dht22');
      };
      api.DHT.prototype.readTemperature = function (f) {
        const p = dhtPart(this);
        if (!p) return NaN;
        const t = +p.value.t + (Math.random() - 0.5) * 0.2;
        const v = f ? t * 9 / 5 + 32 : t;
        return Math.round(v * 10) / 10;
      };
      api.DHT.prototype.readHumidity = function () {
        const p = dhtPart(this);
        if (!p) return NaN;
        return Math.round((+p.value.h + (Math.random() - 0.5) * 0.6) * 10) / 10;
      };
      api.DHT.prototype.computeHeatIndex = function (t, h) { return t + 0.05 * h; };

      /* Servo (ESP32Servo) */
      api.Servo = function Servo() { this.pin = -1; this.angle = 90; this._on = false; sim.servos.push(this); };
      api.Servo.prototype.attach = function (pin) { this.pin = +checkPin(pin, 'servo.attach'); this._on = true; return 1; };
      api.Servo.prototype.detach = function () { this._on = false; };
      api.Servo.prototype.write = function (a) { this.angle = Math.max(0, Math.min(180, +a || 0)); };
      api.Servo.prototype.writeMicroseconds = function (us) { this.angle = Math.max(0, Math.min(180, (us - 544) / (2400 - 544) * 180)); };
      api.Servo.prototype.read = function () { return Math.round(this.angle); };
      api.Servo.prototype.attached = function () { return this._on; };
      api.Servo.prototype.setPeriodHertz = function () {};

      api.ESP = { restart() { throw STOP; }, getFreeHeap() { return 237000; }, getChipModel() { return 'ESP32-D0WDQ6'; }, getCpuFreqMHz() { return 240; } };

      return api;
    }
  }

  root.ESP32Sim = { Sim, GPIO, FLASH_PINS, STOP, C };
})(window);
