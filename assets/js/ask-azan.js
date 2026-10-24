// "Ask about Dr. Azan" chat widget. Talks to the Cloudflare Worker in
// chat-worker/, which answers from the site's published content via Claude.
(function () {
  'use strict';

  var ENDPOINT = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
    ? 'http://localhost:8787/chat' // `npm run dev` in chat-worker/
    : 'https://azan-site-chat.azan-sapardi.workers.dev/chat';
  var STORE_KEY = 'ask-azan-chat-v1';
  var MAX_HISTORY = 12;
  var MAX_CHARS = 1500;

  var script = document.currentScript;
  var siteRoot = new URL('../../', script ? script.src : location.href);

  var SUGGESTIONS = [
    'What does Dr. Azan research?',
    'Show his most cited publications',
    'Which courses does he teach?',
    'Is he supervising postgraduate students?'
  ];

  var ICON_CHAT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01" stroke-width="2.4"/></svg>';
  var ICON_CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var ICON_RESET = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>';
  var ICON_SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

  // Stylesheet lives next to this script's site root, so it works from any page.
  var css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = new URL('assets/css/ask-azan.css?v=1', siteRoot).href;
  document.head.appendChild(css);

  var root = document.createElement('div');
  root.className = 'aa-root';
  root.innerHTML =
    '<button type="button" class="aa-launcher" aria-haspopup="dialog" aria-controls="aa-panel" aria-expanded="false">' +
      ICON_CHAT + '<span class="aa-launcher-label">Ask about my work</span>' +
    '</button>' +
    '<div class="aa-panel" id="aa-panel" role="dialog" aria-modal="false" aria-labelledby="aa-title">' +
      '<div class="aa-head">' +
        '<div class="aa-head-text">' +
          '<p class="aa-title" id="aa-title">Ask about Dr. Azan</p>' +
          '<p class="aa-sub">Research, publications, courses and posts — answered from this website.</p>' +
        '</div>' +
        '<button type="button" class="aa-icon-btn aa-reset" aria-label="Start a new conversation" title="New conversation">' + ICON_RESET + '</button>' +
        '<button type="button" class="aa-icon-btn aa-close" aria-label="Close chat" title="Close">' + ICON_CLOSE + '</button>' +
      '</div>' +
      '<div class="aa-log" aria-live="polite" aria-relevant="additions"></div>' +
      '<form class="aa-form">' +
        '<label class="aa-sr" for="aa-input">Your question</label>' +
        '<textarea class="aa-input" id="aa-input" rows="1" maxlength="' + MAX_CHARS + '" placeholder="Ask a question…" autocomplete="off"></textarea>' +
        '<button type="submit" class="aa-send" aria-label="Send" disabled>' + ICON_SEND + '</button>' +
      '</form>' +
      '<p class="aa-foot">AI assistant · can make mistakes — check the linked pages.</p>' +
    '</div>';
  document.body.appendChild(root);

  var launcher = root.querySelector('.aa-launcher');
  var panel = root.querySelector('.aa-panel');
  var log = root.querySelector('.aa-log');
  var form = root.querySelector('.aa-form');
  var input = root.querySelector('.aa-input');
  var send = root.querySelector('.aa-send');

  var history = load();
  var busy = false;

  function load() {
    try {
      var data = JSON.parse(sessionStorage.getItem(STORE_KEY) || '[]');
      return Array.isArray(data) ? data.filter(function (m) {
        return m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string';
      }) : [];
    } catch (e) { return []; }
  }
  function save() {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(history.slice(-MAX_HISTORY * 2))); } catch (e) { /* storage unavailable */ }
  }

  // --- Minimal, safe Markdown: escape everything, then allow links, bold, bullets.
  function esc(s) {
    return s.replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function safeHref(raw) {
    var href = raw.trim();
    if (/^(javascript|data|vbscript):/i.test(href)) return null;
    try {
      var url = new URL(href, siteRoot);
      if (url.protocol !== 'https:' && url.protocol !== 'http:' && url.protocol !== 'mailto:') return null;
      return url;
    } catch (e) { return null; }
  }
  function inline(text) {
    var out = '';
    var re = /\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*([^*\n]+)\*\*|(https?:\/\/[^\s<)]+[^\s<).,;:!?'"])|(?:^|(?<=[\s(]))[*_]([^*_\n]+)[*_](?=[\s).,;:!?]|$)/g;
    var last = 0, m;
    while ((m = re.exec(text))) {
      out += esc(text.slice(last, m.index));
      if (m[1]) {
        var url = safeHref(m[2]);
        out += url ? link(url, esc(m[1])) : esc(m[1]);
      } else if (m[3]) {
        out += '<strong>' + esc(m[3]) + '</strong>';
      } else if (m[5]) {
        out += '<em>' + esc(m[5]) + '</em>';
      } else {
        var bare = safeHref(m[4]);
        out += bare ? link(bare, esc(m[4])) : esc(m[4]);
      }
      last = re.lastIndex;
    }
    return out + esc(text.slice(last));
  }
  function link(url, label) {
    var external = url.origin !== location.origin && url.protocol !== 'mailto:';
    return '<a href="' + esc(url.href) + '"' + (external ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + label + '</a>';
  }
  function render(md) {
    var html = '', list = false, para = [];
    function flush() {
      if (para.length) { html += '<p>' + para.map(inline).join('<br>') + '</p>'; para = []; }
    }
    md.split('\n').forEach(function (line) {
      var item = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
      if (item) {
        flush();
        if (!list) { html += '<ul>'; list = true; }
        html += '<li>' + inline(item[1]) + '</li>';
      } else {
        if (list) { html += '</ul>'; list = false; }
        if (line.trim()) para.push(line.replace(/^#+\s*/, '').trim()); else flush();
      }
    });
    flush();
    if (list) html += '</ul>';
    return html;
  }

  // --- View
  function addMessage(role, content) {
    var el = document.createElement('div');
    el.className = 'aa-msg ' + (role === 'user' ? 'aa-msg-user' : 'aa-msg-bot');
    if (role === 'user') el.textContent = content; else el.innerHTML = render(content);
    log.appendChild(el);
    scrollDown();
    return el;
  }
  function scrollDown() { log.scrollTop = log.scrollHeight; }

  function renderAll() {
    log.innerHTML = '';
    if (!history.length) {
      var intro = document.createElement('p');
      intro.className = 'aa-intro';
      intro.textContent = 'Hi! I can answer questions about Dr. Azan’s research, publications, grants, students, courses, web apps and blog posts — based on what’s published on this site.';
      var chips = document.createElement('div');
      chips.className = 'aa-chips';
      SUGGESTIONS.forEach(function (q) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'aa-chip';
        b.textContent = q;
        b.addEventListener('click', function () { ask(q); });
        chips.appendChild(b);
      });
      log.appendChild(intro);
      log.appendChild(chips);
      return;
    }
    history.forEach(function (m) { addMessage(m.role, m.content); });
  }

  function setOpen(open) {
    root.classList.toggle('aa-open', open);
    launcher.setAttribute('aria-expanded', String(open));
    if (open) {
      if (!log.childElementCount) renderAll();
      setTimeout(function () { input.focus(); scrollDown(); }, 60);
    } else {
      launcher.focus();
    }
  }

  function autosize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    send.disabled = busy || !input.value.trim();
  }

  // --- Network
  async function ask(question) {
    question = question.trim().slice(0, MAX_CHARS);
    if (!question || busy) return;
    busy = true;
    input.value = '';
    autosize();
    if (!history.length) log.innerHTML = '';

    history.push({ role: 'user', content: question });
    save();
    addMessage('user', question);

    var bubble = addMessage('assistant', '');
    bubble.innerHTML = '<span class="aa-typing" aria-label="Thinking"><span></span><span></span><span></span></span>';
    var answer = '';

    try {
      var res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.slice(-MAX_HISTORY) })
      });
      if (!res.ok || !res.body) {
        var info = await res.json().catch(function () { return {}; });
        throw new Error(info.error || 'The assistant is unavailable right now.');
      }
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '';
      var streamError = null;
      for (;;) {
        var chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        var events = buffer.split('\n\n');
        buffer = events.pop();
        events.forEach(function (evt) {
          var line = evt.trim();
          if (line.indexOf('data: ') !== 0) return;
          var data;
          try { data = JSON.parse(line.slice(6)); } catch (e) { return; }
          if (data.reset) answer = '';
          if (data.t) answer += data.t;
          if (data.error) streamError = data.error;
        });
        if (answer) { bubble.innerHTML = render(answer); scrollDown(); }
      }
      if (streamError && !answer) throw new Error(streamError);
      if (!answer) throw new Error('No answer came back. Please try again.');
      history.push({ role: 'assistant', content: answer });
      save();
    } catch (err) {
      // Drop the unanswered question so the next request still alternates turns.
      history.pop();
      save();
      bubble.classList.add('aa-error');
      bubble.textContent = (err && err.message && !/fetch|network/i.test(err.message))
        ? err.message
        : 'Couldn’t reach the assistant. Check your connection and try again.';
    } finally {
      busy = false;
      autosize();
      input.focus();
    }
  }

  // --- Events
  launcher.addEventListener('click', function () { setOpen(true); });
  root.querySelector('.aa-close').addEventListener('click', function () { setOpen(false); });
  root.querySelector('.aa-reset').addEventListener('click', function () {
    if (busy) return;
    history = [];
    save();
    renderAll();
    input.focus();
  });
  form.addEventListener('submit', function (e) { e.preventDefault(); ask(input.value); });
  input.addEventListener('input', autosize);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(input.value); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && root.classList.contains('aa-open')) setOpen(false);
  });
})();
