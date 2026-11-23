/* ============================================================
   ESP32 IoT Cloud Simulator — sketch translator
   Turns a teaching subset of Arduino C++ into async JavaScript
   that runs against the simulated board in runtime.js.
   It is not a real C++ compiler: it handles the constructs used
   in typical Arduino / Arduino Cloud sketches.
   ============================================================ */
(function (root) {
  'use strict';

  const BOOL_TYPES = ['bool', 'boolean', 'CloudSwitch', 'CloudLight', 'CloudMotionSensor', 'CloudContactSensor', 'CloudSmartPlug'];
  const INT_TYPES = ['int', 'long', 'short', 'byte', 'word', 'unsigned', 'signed', 'size_t', 'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t',
    'int8_t', 'int16_t', 'int32_t', 'int64_t', 'CloudCounter'];
  const FLOAT_TYPES = ['float', 'double'];
  const STR_TYPES = ['String', 'char'];
  const OBJ_TYPES = ['DHT', 'Servo', 'WiFiConnectionHandler'];
  const VOID_TYPES = ['void', 'auto'];
  const UNSUPPORTED_CLOUD = ['CloudColor', 'CloudLocation', 'CloudSchedule', 'CloudColoredLight', 'CloudDimmedLight', 'CloudTelevision', 'CloudTime'];

  const BASE_WORDS = [].concat(BOOL_TYPES, INT_TYPES, FLOAT_TYPES, STR_TYPES, OBJ_TYPES, VOID_TYPES)
    .filter((w) => w !== 'unsigned' && w !== 'signed')
    .sort((a, b) => b.length - a.length);
  const QUAL = '(?:(?:const|static|volatile|constexpr|unsigned|signed)\\s+)*';
  const BASE = '(?:long\\s+long|long\\s+int|short\\s+int|Cloud[A-Za-z]+|' + BASE_WORDS.join('|') + ')';
  const TYPE_RE = new RegExp('(?<![\\w.$])(' + QUAL + BASE + '|unsigned|signed)(\\s*[*&]\\s*|\\s+)(?=[A-Za-z_])', 'g');

  const KEYWORDS = new Set(['if', 'else', 'for', 'while', 'do', 'switch', 'case', 'return', 'break', 'continue', 'default',
    'new', 'delete', 'true', 'false', 'sizeof', 'typedef', 'struct', 'class', 'operator', 'const', 'static']);

  class CompileError extends Error {
    constructor(msg, file, line) { super(msg); this.file = file; this.line = line; }
  }

  function kindOf(typeStr) {
    const words = typeStr.replace(/[*&]/g, ' ').trim().split(/\s+/).filter((w) => !['const', 'static', 'volatile', 'constexpr'].includes(w));
    const last = words[words.length - 1] || '';
    if (words.length > 1 && (words[0] === 'unsigned' || words[0] === 'signed') && last === 'char') return 'int';
    if (last === 'char' && /\*/.test(typeStr)) return 'str';
    if (BOOL_TYPES.includes(last)) return 'bool';
    if (INT_TYPES.includes(last) || last === 'long' || last === 'int') return 'int';
    if (FLOAT_TYPES.includes(last)) return 'float';
    if (STR_TYPES.includes(last)) return 'str';
    if (OBJ_TYPES.includes(last)) return 'obj';
    if (VOID_TYPES.includes(last)) return 'void';
    if (/^Cloud/.test(last)) return 'float';
    return 'float';
  }
  function baseName(typeStr) {
    const words = typeStr.replace(/[*&]/g, ' ').trim().split(/\s+/);
    return words[words.length - 1];
  }

  /* Build a line map so errors can point back to the right file. */
  function buildSource(files, main) {
    const map = [];
    function walk(name, seen) {
      if (seen.has(name)) return [];
      seen.add(name);
      const lines = files[name].split('\n');
      const out = [];
      lines.forEach((line, idx) => {
        const m = /^\s*#\s*include\s*"([^"]+)"/.exec(line);
        if (m) {
          if (!Object.prototype.hasOwnProperty.call(files, m[1])) {
            throw new CompileError('fatal error: ' + m[1] + ': No such file or directory', name, idx + 1);
          }
          const sub = walk(m[1], seen);
          sub.forEach((s) => out.push(s));
          return;
        }
        out.push({ text: line, file: name, line: idx + 1 });
      });
      return out;
    }
    const lines = walk(main, new Set());
    lines.forEach((l) => map.push({ file: l.file, line: l.line }));
    return { text: lines.map((l) => l.text).join('\n'), map };
  }

  /* ---------- 2. strip comments, protect literals ---------- */
  function protect(src) {
    const lits = [];
    let out = '';
    let i = 0;
    const n = src.length;
    while (i < n) {
      const c = src[i];
      const d = src[i + 1];
      if (c === '/' && d === '/') {
        while (i < n && src[i] !== '\n') i++;
        continue;
      }
      if (c === '/' && d === '*') {
        i += 2;
        while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
          if (src[i] === '\n') out += '\n';
          i++;
        }
        i += 2;
        continue;
      }
      if (c === '"' || c === '\'') {
        let j = i + 1;
        while (j < n && src[j] !== c && src[j] !== '\n') {
          if (src[j] === '\\') j++;
          j++;
        }
        lits.push(src.slice(i, j + 1));
        out += '\u0001' + (lits.length - 1) + '\u0001';
        i = j + 1;
        continue;
      }
      out += c;
      i++;
    }
    return { code: out, lits };
  }
  function restore(code, lits) {
    return code.replace(/\u0001(\d+)\u0001/g, (_, k) => {
      const lit = lits[+k];
      // C adjacent string concatenation is rare; keep literal as-is
      return lit;
    });
  }

  /* ---------- helpers ---------- */
  function matchClose(s, i) {
    // s[i] is an opening bracket; return index of its match
    const open = s[i];
    const close = open === '(' ? ')' : open === '[' ? ']' : '}';
    let depth = 0;
    for (let k = i; k < s.length; k++) {
      const ch = s[k];
      if (ch === '(' || ch === '[' || ch === '{') depth++;
      else if (ch === ')' || ch === ']' || ch === '}') {
        depth--;
        if (depth === 0) {
          if (ch !== close) return -1;
          return k;
        }
      }
    }
    return -1;
  }
  function matchOpenBackward(s, i) {
    // s[i] is a closing bracket; return index of matching opener
    let depth = 0;
    for (let k = i; k >= 0; k--) {
      const ch = s[k];
      if (ch === ')' || ch === ']' || ch === '}') depth++;
      else if (ch === '(' || ch === '[' || ch === '{') {
        depth--;
        if (depth === 0) return k;
      }
    }
    return -1;
  }
  function skipWs(s, i) { while (i < s.length && /\s/.test(s[i])) i++; return i; }
  function findStmtEnd(s, i) {
    let depth = 0;
    for (let k = i; k < s.length; k++) {
      const ch = s[k];
      if (ch === '(' || ch === '[' || ch === '{') depth++;
      else if (ch === ')' || ch === ']' || ch === '}') { depth--; if (depth < 0) return k; }
      else if (ch === ';' && depth === 0) return k;
    }
    return -1;
  }
  function splitTop(s, sep) {
    const parts = [];
    let depth = 0, last = 0;
    for (let k = 0; k < s.length; k++) {
      const ch = s[k];
      if (ch === '(' || ch === '[' || ch === '{') depth++;
      else if (ch === ')' || ch === ']' || ch === '}') depth--;
      else if (ch === sep && depth === 0) { parts.push(s.slice(last, k)); last = k + 1; }
    }
    parts.push(s.slice(last));
    return parts;
  }
  function lineAt(s, idx) {
    let line = 1;
    for (let k = 0; k < idx && k < s.length; k++) if (s[k] === '\n') line++;
    return line;
  }

  /* ---------- 3. preprocessor directives ---------- */
  function preprocess(code, warnings, err) {
    const defines = {};
    const lines = code.split('\n');
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      const m = /^\s*#\s*(\w+)\s*(.*)$/.exec(line);
      if (!m) continue;
      const dir = m[1];
      const rest = m[2].trim();
      if (dir === 'define') {
        const dm = /^([A-Za-z_]\w*)(\([^)]*\))?\s*(.*)$/.exec(rest);
        if (!dm) { lines[li] = ''; continue; }
        if (dm[2]) {
          // function-like macro → arrow function
          const params = dm[2].slice(1, -1).split(',').map((p) => p.trim()).filter(Boolean).join(', ');
          lines[li] = 'const ' + dm[1] + ' = (' + params + ') => (' + (dm[3] || 'undefined') + ');';
        } else {
          defines[dm[1]] = dm[3];
          lines[li] = 'const ' + dm[1] + ' = ' + (dm[3] === '' ? 'true' : dm[3]) + ';';
        }
      } else {
        lines[li] = '';
        if (!['include', 'ifdef', 'ifndef', 'endif', 'if', 'else', 'elif', 'pragma', 'undef', 'error', 'warning'].includes(dir)) {
          err('unknown directive #' + dir, li + 1);
        }
      }
    }
    return { code: lines.join('\n'), defines };
  }

  /* ---------- 4. casts and literals ---------- */
  function readPrimaryEnd(s, i) {
    i = skipWs(s, i);
    if (s[i] === '(') { const e = matchClose(s, i); return e < 0 ? i : e + 1; }
    if (s[i] === '-' || s[i] === '!' || s[i] === '~') return readPrimaryEnd(s, i + 1);
    let k = i;
    while (k < s.length) {
      if (/[\w.\u0001]/.test(s[k])) { k++; continue; }
      if (s[k] === '(' || s[k] === '[') { const e = matchClose(s, k); if (e < 0) break; k = e + 1; continue; }
      break;
    }
    return k;
  }
  function rewriteCasts(code) {
    const CAST = /\(\s*((?:unsigned\s+|signed\s+)?(?:long\s+long|long|int|short|byte|char|float|double|bool|uint8_t|uint16_t|uint32_t|int8_t|int16_t|int32_t|size_t|word))\s*\)\s*(?=[\w(\-!~\u0001])/g;
    let out = code;
    let guard = 0;
    let m;
    while ((m = CAST.exec(out)) && guard++ < 5000) {
      const t = m[1];
      const fn = /float|double/.test(t) ? '__float' : /bool/.test(t) ? 'Boolean' : /^char$/.test(t) ? '__char' : '__int';
      const start = m.index;
      const exprStart = start + m[0].length;
      const end = readPrimaryEnd(out, exprStart);
      const expr = out.slice(exprStart, end);
      out = out.slice(0, start) + fn + '(' + expr + ')' + out.slice(end);
      CAST.lastIndex = start + fn.length + 1;
    }
    return out;
  }
  function rewriteNumbers(code) {
    return code
      .replace(/(?<![\w$])(IRAM_ATTR|ICACHE_RAM_ATTR|ARDUINO_ISR_ATTR|inline|PROGMEM|extern|register)(?![\w$])/g, '')
      .replace(/\b(0[xX][0-9a-fA-F]+|\d+)(?:UL|ul|LU|lu|ULL|ull|LL|ll|L|l|U|u)\b/g, '$1')
      .replace(/\b(\d+\.\d*(?:[eE][+-]?\d+)?|\d+[eE][+-]?\d+)[fF]\b/g, '$1')
      .replace(/(\.\d+)[fF]\b/g, '$1')
      .replace(/\bB([01]{1,8})\b/g, '0b$1');
  }

  /* ---------- 5. declarations & functions ---------- */
  function braceToArray(init) {
    // { {1,2}, {3,4} } → [ [1,2], [3,4] ]
    return init.replace(/\{/g, '[').replace(/\}/g, ']');
  }

  function rewriteDecls(code, ctx) {
    let out = '';
    let pos = 0;
    let depth = 0;           // brace depth in the code consumed so far
    let funcOutIdx = -1;     // where the current function starts in `out`
    let funcName = null;
    const re = new RegExp(TYPE_RE.source, 'g');

    function consume(text) {
      for (const ch of text) {
        if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) funcName = null;
        }
      }
      out += text;
    }

    let m;
    while ((m = re.exec(code))) {
      const start = m.index;
      if (start < pos) continue;
      const typeStr = m[1];
      const sep = m[2];
      const kind = kindOf(typeStr + sep);
      const cls = baseName(typeStr);
      const isConst = /\bconst\b/.test(typeStr) && !/\*/.test(sep);
      const isStatic = /\bstatic\b/.test(typeStr);
      let i = start + m[0].length;
      const nm = /^[A-Za-z_]\w*/.exec(code.slice(i));
      if (!nm) continue;
      const name = nm[0];
      if (KEYWORDS.has(name)) continue;

      if (UNSUPPORTED_CLOUD.includes(cls)) {
        ctx.err('\'' + cls + '\' is not supported by the simulator yet (try CloudSwitch, CloudTemperatureSensor, int, float, bool or String)', lineAt(code, start));
      }

      consume(code.slice(pos, start));
      let j = skipWs(code, i + name.length);
      const ch = code[j];

      if (ch === '(') {
        const close = matchClose(code, j);
        if (close < 0) ctx.err('expected \')\'', lineAt(code, j));
        let k = skipWs(code, close + 1);
        if (code.startsWith('const', k)) k = skipWs(code, k + 5);
        if (code[k] === '{') {
          // function definition
          const rawParams = code.slice(j + 1, close);
          const params = convertParams(rawParams, ctx);
          if (depth !== 0) ctx.err('a function-definition is not allowed here before \'{\' token', lineAt(code, start));
          funcOutIdx = out.length;
          funcName = name;
          ctx.functions.add(name);
          ctx.funcKinds[name] = kind;
          consume('async function ' + name + '(' + params + ') {');
          pos = k + 1;
          re.lastIndex = pos;
          continue;
        }
        if (code[k] === ';') {
          if (kind === 'obj') {
            const args = code.slice(j + 1, close);
            consume('let ' + name + ' = new ' + cls + '(' + args + ');');
            ctx.objects[name] = cls;
            if (depth === 0) ctx.globals[name] = { type: cls, kind };
          }
          // else: function prototype → drop
          pos = k + 1;
          re.lastIndex = pos;
          continue;
        }
        // something else, e.g. a call — leave untouched
        consume(code.slice(start, j));
        pos = j;
        re.lastIndex = pos;
        continue;
      }

      if (ch === ':' && code[j + 1] !== ':') {
        consume('let ' + name + ' of');
        pos = j + 1;
        re.lastIndex = pos;
        continue;
      }

      // declaration list up to ';'
      const end = findStmtEnd(code, i);
      if (end < 0) ctx.err('expected \';\' after declaration of \'' + name + '\'', lineAt(code, start));
      const list = splitTop(code.slice(i, end), ',');
      const decls = list.map((d) => convertDeclarator(d, kind, cls, ctx, depth, lineAt(code, start)));
      const kw = isConst ? 'const' : 'let';
      const stmt = kw + ' ' + decls.join(', ') + ';';
      if (isStatic && depth > 0 && funcOutIdx >= 0) {
        // hoist function-local statics so they keep their value between calls
        out = out.slice(0, funcOutIdx) + 'let ' + decls.join(', ') + ';\n' + out.slice(funcOutIdx);
        funcOutIdx += ('let ' + decls.join(', ') + ';\n').length;
      } else {
        consume(stmt);
      }
      pos = end + 1;
      re.lastIndex = pos;
    }
    consume(code.slice(pos));
    return out;
  }

  function convertParams(raw, ctx) {
    const t = raw.trim();
    if (t === '' || t === 'void') return '';
    return splitTop(t, ',').map((p) => {
      const parts = p.split('=');
      const decl = parts[0].replace(/\[\s*\d*\s*\]/g, '').trim();
      const mm = /([A-Za-z_]\w*)\s*$/.exec(decl);
      const nm = mm ? mm[1] : '_';
      if (ctx) {
        const isF = /\b(float|double)\b/.test(decl) && !/\*/.test(decl);
        const isI = /\b(int|long|short|byte|u?int\d+_t|size_t)\b/.test(decl) && !/\*/.test(decl);
        if (isF) ctx.floatVars.add(nm); else ctx.notFloat.add(nm);
        if (isI) ctx.intVars.add(nm); else ctx.notInt.add(nm);
      }
      return parts.length > 1 ? nm + ' = ' + parts.slice(1).join('=').trim() : nm;
    }).join(', ');
  }

  function convertDeclarator(d, kind, cls, ctx, depth, line) {
    const mm = /^\s*[*&]?\s*([A-Za-z_]\w*)\s*((?:\[[^\]]*\]\s*)*)(?:([=(])([\s\S]*))?$/.exec(d);
    if (!mm) { ctx.err('could not understand declaration \'' + d.trim() + '\'', line); return '_'; }
    const name = mm[1];
    const dims = mm[2] ? mm[2].match(/\[([^\]]*)\]/g).map((x) => x.slice(1, -1).trim()) : [];
    let op = mm[3];
    let init = mm[4] !== undefined ? mm[4].trim() : null;
    if (op === '(') {
      // constructor-style: Servo s(...) or int x(5)
      init = init.replace(/\)\s*$/, '');
      if (kind === 'obj') init = 'new ' + cls + '(' + init + ')';
    }
    if (depth === 0) ctx.globals[name] = { type: cls, kind, array: dims.length > 0 };
    if (kind === 'int' && !dims.length) ctx.intVars.add(name);
    if (kind === 'float' && !dims.length) ctx.floatVars.add(name);
    if (kind !== 'int' || dims.length) ctx.notInt.add(name);
    if (kind !== 'float' || dims.length) ctx.notFloat.add(name);
    if (kind === 'obj') ctx.objects[name] = cls;

    const def = kind === 'bool' ? 'false' : kind === 'str' ? '""' : kind === 'obj' ? 'new ' + cls + '()' : '0';
    if (dims.length) {
      if (init !== null) {
        if (init.startsWith('{')) return name + ' = ' + braceToArray(init);
        return name + ' = ' + init; // char buf[] = "text"
      }
      if (kind === 'str' && cls === 'char') return name + ' = ""';
      return name + ' = __arr([' + dims.map((x) => x || '0').join(', ') + '], ' + def + ')';
    }
    if (init === null) return name + ' = ' + def;
    if (kind === 'obj' && new RegExp('^' + cls + '\\s*\\(').test(init)) init = 'new ' + init;
    if (kind === 'int' && !/^-?\d+$/.test(init)) init = '__int(' + init + ')';
    return name + ' = ' + init;
  }

  /* ---------- 6. post passes ---------- */
  function rewriteAddProperty(code) {
    return code.replace(/ArduinoCloud\s*\.\s*addProperty\s*\(\s*([A-Za-z_]\w*)\s*,/g,
      (_, n) => 'ArduinoCloud.addProperty({ name: "' + n + '", get: () => ' + n + ', set: (__v) => { ' + n + ' = __v; } },');
  }

  function rewriteStrings(code) {
    return code
      .replace(/(?<![\w.$])String\s*\(/g, '__String(')
      .replace(/\.length\s*\(\s*\)/g, '.length')
      .replace(/\.c_str\s*\(\s*\)/g, '')
      .replace(/(?<![\w.$])([A-Za-z_]\w*)\s*\.\s*(trim|toUpperCase|toLowerCase)\s*\(\s*\)\s*;/g, '$1 = $1.$2();')
      .replace(/::/g, '.')
      .replace(/->/g, '.')
      .replace(/(?<![\w.$])nullptr\b/g, 'null')
      .replace(/(?<![\w.$])NULL\b/g, 'null')
      .replace(/sizeof\s*\(\s*([A-Za-z_]\w*)\s*\)\s*\/\s*sizeof\s*\(\s*\1\s*\[\s*0\s*\]\s*\)/g, '$1.length')
      .replace(/(?<![\w.$])sizeof\s*\(/g, '__sizeof(');
  }

  function rewriteIntAssign(code, intVars) {
    if (!intVars.size) return code;
    const names = Array.from(intVars).map((n) => n.replace(/\$/g, '\\$')).join('|');
    const plain = new RegExp('(?<![\\w.$])(' + names + ')(\\s*\\[[^\\]]*\\])?\\s*=(?!=)\\s*([^;{}]*?)\\s*;', 'g');
    const div = new RegExp('(?<![\\w.$])(' + names + ')(\\s*\\[[^\\]]*\\])?\\s*\\/=\\s*([^;{}]*?)\\s*;', 'g');
    const balanced = (e) => { let d = 0; for (const ch of e) { if (ch === '(' || ch === '[') d++; else if (ch === ')' || ch === ']') { d--; if (d < 0) return false; } } return d === 0; };
    return code
      .replace(div, (all, n, idx, e) => !balanced(e) ? all : n + (idx || '') + ' = __int(' + n + (idx || '') + ' / (' + e + '));')
      .replace(plain, (all, n, idx, e) => {
        if (!balanced(e)) return all;
        if (/^__int\(/.test(e) || /^-?\d+$/.test(e)) return n + (idx || '') + ' = ' + e + ';';
        return n + (idx || '') + ' = __int(' + e + ');';
      });
  }

  // Arduino prints floats with 2 decimals (68.00); tag float variables
  // passed straight to print()/String() so the runtime can do the same.
  function tagFloats(code, floatVars, floatFns) {
    if (floatVars.size) {
      const names = Array.from(floatVars).join('|');
      const re = new RegExp('(Serial\\s*\\.\\s*print(?:ln)?\\s*\\(|__String\\()\\s*(' + names + ')\\s*(?=[,)])', 'g');
      code = code.replace(re, '$1__F($2)');
    }
    if (floatFns.length) {
      const re = new RegExp('(Serial\\s*\\.\\s*print(?:ln)?\\s*\\(|__String\\()\\s*(' + floatFns.join('|') + ')\\s*\\(', 'g');
      let m;
      while ((m = re.exec(code))) {
        const callStart = m.index + m[1].length;
        const open = code.indexOf('(', callStart + m[2].length);
        const close = matchClose(code, open);
        if (close < 0) continue;
        const k = skipWs(code, close + 1);
        if (code[k] !== ')' && code[k] !== ',') continue;
        code = code.slice(0, callStart) + '__F(' + code.slice(callStart, close + 1) + ')' + code.slice(close + 1);
        re.lastIndex = close + 5;
      }
    }
    return code;
  }

  function wrapAwaits(code, names) {
    // turns  foo(a, bar(b))  into  (await foo(a, (await bar(b))))  for async names
    let out = '';
    let i = 0;
    const n = code.length;
    while (i < n) {
      const c = code[i];
      if (/[A-Za-z_$]/.test(c) && (i === 0 || !/[\w$.]/.test(code[i - 1]))) {
        let k = i;
        while (k < n && /[\w$]/.test(code[k])) k++;
        let word = code.slice(i, k);
        // ArduinoCloud.update
        if (word === 'ArduinoCloud' && /^\s*\.\s*update\s*\(/.test(code.slice(k))) {
          const p = code.indexOf('(', k);
          const e = matchClose(code, p);
          out += '(await ArduinoCloud.update(' + wrapAwaits(code.slice(p + 1, e), names) + '))';
          i = e + 1;
          continue;
        }
        const p = skipWs(code, k);
        const isDef = /function\s*$/.test(out.slice(-24));
        if (names.has(word) && code[p] === '(' && !isDef) {
          const e = matchClose(code, p);
          if (e > 0) {
            out += '(await ' + word + '(' + wrapAwaits(code.slice(p + 1, e), names) + '))';
            i = e + 1;
            continue;
          }
        }
        out += word;
        i = k;
        continue;
      }
      out += c;
      i++;
    }
    return out;
  }

  function addLoopTicks(code) {
    let out = code;
    // do { ... } while (...);
    out = out.replace(/(?<![\w$])do\s*\{/g, 'do { await __tick();');
    const re = /(?<![\w$.])(while|for)\s*\(/g;
    let m;
    let guard = 0;
    while ((m = re.exec(out)) && guard++ < 20000) {
      const kw = m[1];
      const p = out.indexOf('(', m.index + kw.length);
      const close = matchClose(out, p);
      if (close < 0) continue;
      if (kw === 'while') {
        // is this the tail of a do-while?  ...} while (x);
        let b = m.index - 1;
        while (b >= 0 && /\s/.test(out[b])) b--;
        if (out[b] === '}') {
          const o = matchOpenBackward(out, b);
          if (o > 0) {
            const pre = out.slice(Math.max(0, o - 30), o).replace(/\s+$/, '');
            if (/do$/.test(pre)) { re.lastIndex = close + 1; continue; }
          }
        }
      }
      const k = skipWs(out, close + 1);
      if (out[k] === '{') {
        out = out.slice(0, k + 1) + ' await __tick();' + out.slice(k + 1);
      } else if (out[k] === ';') {
        out = out.slice(0, k) + '{ await __tick(); }' + out.slice(k + 1);
      } else {
        const e = findStmtEnd(out, k);
        if (e > 0) out = out.slice(0, k) + '{ await __tick(); ' + out.slice(k, e + 1) + ' }' + out.slice(e + 1);
      }
      re.lastIndex = close + 1;
    }
    return out;
  }

  /* ---------- basic sanity checks with line numbers ---------- */
  function checkBalance(code, err) {
    const stack = [];
    const pairs = { ')': '(', ']': '[', '}': '{' };
    for (let k = 0; k < code.length; k++) {
      const ch = code[k];
      if (ch === '(' || ch === '[' || ch === '{') stack.push({ ch, k });
      else if (pairs[ch]) {
        const top = stack.pop();
        if (!top || top.ch !== pairs[ch]) err('expected \'' + ({ '(': ')', '[': ']', '{': '}' }[top ? top.ch : '('] || ch) + '\' before \'' + ch + '\' token', lineAt(code, k));
      }
    }
    if (stack.length) {
      const top = stack[stack.length - 1];
      err('expected \'' + ({ '(': ')', '[': ']', '{': '}' })[top.ch] + '\' at end of input (opened here)', lineAt(code, top.k));
    }
  }

  // JavaScript would silently accept a missing ';' — a C++ compiler will not.
  function checkSemicolons(code, err) {
    const lines = code.split('\n');
    let depth = 0;
    let paren = 0;
    for (let li = 0; li < lines.length; li++) {
      const raw = lines[li];
      const t = raw.trim();
      const startDepth = depth;
      const startParen = paren;
      for (const ch of raw) {
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        else if (ch === '(') paren++;
        else if (ch === ')') paren--;
      }
      if (!t || t[0] === '#' || startDepth <= 0 || startParen > 0 || paren > 0) continue;
      if (/^(if|for|while|else|switch|do|case|default)\b/.test(t) || /^\}?\s*else\b/.test(t)) continue;
      if (!/[\w)\]\u0001]$/.test(t) || /[{};,:]$/.test(t)) continue;
      if (/(\+\+|--)$/.test(t) === false && /[-+*\/%=<>&|!?^~]$/.test(t)) continue;
      // find the next meaningful line
      let nj = li + 1;
      while (nj < lines.length && !lines[nj].trim()) nj++;
      if (nj >= lines.length) continue;
      const next = lines[nj].trim();
      if (/^[{.+\-*\/%=<>&|?:)\]^,]/.test(next)) continue;
      if (/\)$/.test(t) && /^\w+\s*\(.*\)$/.test(t) && /^\{/.test(next)) continue;
      const tok = (next.match(/^[A-Za-z_]\w*|^\S/) || ['?'])[0];
      err('expected \';\' before \'' + tok + '\'', li + 1);
    }
  }

  function staticCloudScan(code, globals) {
    const props = [];
    const re = /ArduinoCloud\s*\.\s*addProperty\s*\(\s*([A-Za-z_]\w*)\s*,\s*([A-Za-z_][\w:.]*)\s*(?:,\s*([^,)]+))?/g;
    let m;
    while ((m = re.exec(code))) {
      const name = m[1];
      const permRaw = m[2];
      const perm = /ReadWrite|READWRITE/.test(permRaw) ? 'READWRITE' : /Write|WRITE/.test(permRaw) ? 'WRITE' : 'READ';
      const g = globals[name] || { type: '?', kind: 'float' };
      props.push({ name, perm, type: g.type, kind: g.kind });
    }
    return props;
  }

  /* ---------- main entry ---------- */
  function compile(files, main) {
    const warnings = [];
    let lineMap = [];
    function errAt(file, line, msg) { throw new CompileError(msg, file, line); }
    const built = buildSource(files, main);
    lineMap = built.map;
    const where = (line) => lineMap[line - 1] || { file: main, line };
    const err = (msg, line) => { const w = where(line); errAt(w.file, w.line, msg); };

    const prot = protect(built.text);
    let code = prot.code;
    checkBalance(code, err);
    checkSemicolons(code, err);
    const pre = preprocess(code, warnings, err);
    code = pre.code;
    code = rewriteNumbers(code);
    code = rewriteCasts(code);

    const ctx = { functions: new Set(), funcKinds: {}, globals: {}, objects: {}, intVars: new Set(), floatVars: new Set(), notInt: new Set(), notFloat: new Set(), err };
    code = rewriteDecls(code, ctx);

    if (!ctx.functions.has('setup')) warnings.push('No setup() function found.');
    if (!ctx.functions.has('loop')) warnings.push('No loop() function found.');

    const cloudProps = staticCloudScan(prot.code, ctx.globals);

    code = rewriteAddProperty(code);
    code = rewriteStrings(code);
    // names reused with different types in different scopes are left alone
    ctx.notInt.forEach((v) => ctx.intVars.delete(v));
    ctx.notFloat.forEach((v) => ctx.floatVars.delete(v));
    code = rewriteIntAssign(code, ctx.intVars);
    code = tagFloats(code, ctx.floatVars, Object.keys(ctx.funcKinds).filter((f) => ctx.funcKinds[f] === 'float'));
    const asyncNames = new Set(['delay', 'delayMicroseconds', 'yield', 'pulseIn']);
    ctx.functions.forEach((f) => asyncNames.add(f));
    code = wrapAwaits(code, asyncNames);
    code = addLoopTicks(code);
    code = restore(code, prot.lits);

    const exportsList = Array.from(ctx.functions).map((f) => f + ': (typeof ' + f + ' === "function" ? ' + f + ' : null)').join(', ');
    const body = 'with (__api) { return (async () => {\n' + code + '\n;return { ' + exportsList + ' };\n})(); }';

    let factory;
    try {
      // eslint-disable-next-line no-new-func
      factory = new Function('__api', body);
    } catch (e) {
      const w = where(1);
      throw new CompileError('could not translate sketch: ' + e.message + ' (check for C++ features the simulator does not support)', w.file, null);
    }
    return {
      factory,
      js: code,
      warnings,
      functions: Array.from(ctx.functions),
      globals: ctx.globals,
      cloudProps,
      defines: pre.defines,
    };
  }

  const api = { compile, CompileError, _internal: { protect, rewriteDecls, wrapAwaits, addLoopTicks } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SketchCompiler = api;
})(typeof window !== 'undefined' ? window : globalThis);
