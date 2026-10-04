/* Tenpoint widget. Add to any site:
   <script src="https://YOUR-TENPOINT-HOST/widget.js" data-survey="SURVEY_ID" async></script>
   Optional: data-delay="5" (seconds before it appears). */
(function () {
  'use strict';
  var script = document.currentScript;
  if (!script || !script.dataset.survey) return;
  var pid = script.dataset.survey;
  var origin = new URL(script.src, location.href).origin;
  var preview = script.hasAttribute('data-preview');
  var delay = Math.max(0, Number(script.dataset.delay == null ? 5 : script.dataset.delay) || 0) * 1000;
  var SNOOZE_MS = 90 * 864e5;
  var key = 'tenpoint:snooze:' + pid;

  function snoozed() {
    try { return Date.now() - Number(localStorage.getItem(key) || 0) < SNOOZE_MS; } catch (e) { return false; }
  }
  function snooze() {
    try { localStorage.setItem(key, String(Date.now())); } catch (e) { /* storage blocked */ }
  }
  if (!preview && snoozed()) return;

  function post(path, body) {
    return fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }

  function inkFor(hex) {
    var c = [1, 3, 5].map(function (i) {
      var v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    var L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    return (L + 0.05) / 0.05 > 1.05 / (L + 0.05) ? '#111413' : '#ffffff';
  }

  var CSS = [
    ':host{all:initial}',
    '.tp{position:relative;box-sizing:border-box;width:340px;max-width:calc(100vw - 24px);padding:20px;border:1px solid #dde1db;border-radius:16px;background:#fff;color:#111413;',
    'font:15px/1.45 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;box-shadow:0 2px 4px rgba(24,32,28,.05),0 24px 48px -20px rgba(24,32,28,.4)}',
    '.tp *{box-sizing:border-box;font:inherit;color:inherit}',
    '.tp.in{animation:tp-in .45s cubic-bezier(.16,1,.3,1)}',
    '@keyframes tp-in{from{opacity:0;transform:translateY(16px)}}',
    '@media (prefers-reduced-motion:reduce){.tp.in{animation:none}}',
    '.x{position:absolute;top:10px;right:10px;display:grid;place-items:center;width:32px;height:32px;padding:0;border:0;border-radius:999px;background:transparent;cursor:pointer;color:#5b625e}',
    '.x:hover{background:#eef0ec;color:#111413}',
    '.x svg{width:16px;height:16px}',
    '.brand{margin:0 36px 4px 0;color:#5b625e;font-size:13px;font-weight:600}',
    '.q{margin:0 28px 14px 0;font-size:16px;font-weight:650;line-height:1.3}',
    '.scale{display:grid;grid-template-columns:repeat(11,1fr);gap:4px}',
    '.scale button{min-width:0;height:34px;padding:0;border:1px solid #c4cac3;border-radius:8px;background:#fff;font-size:14px;font-weight:600;cursor:pointer;transition:transform .15s,background-color .15s}',
    '.scale button:hover{border-color:var(--b);transform:translateY(-1px)}',
    '.scale button[aria-pressed="true"]{background:var(--b);border-color:var(--b);color:var(--bi)}',
    '.ends{display:flex;justify-content:space-between;margin-top:6px;color:#5b625e;font-size:12px}',
    'form{margin:14px 0 0}',
    'label{display:block;margin-bottom:6px;font-size:14px;font-weight:600}',
    'textarea{display:block;width:100%;min-height:70px;padding:8px 10px;border:1px solid #c4cac3;border-radius:10px;background:#fff;resize:vertical;font-size:15px}',
    'textarea:focus{outline:none;border-color:var(--b);box-shadow:0 0 0 3px color-mix(in srgb,var(--b) 22%,transparent)}',
    '.send{display:block;width:100%;height:40px;margin-top:10px;border:0;border-radius:999px;background:var(--b);color:var(--bi);font-weight:600;cursor:pointer}',
    '.thanks{margin:4px 36px 0 0;font-size:16px;font-weight:650}',
    '.err{margin:10px 0 0;color:#c0452d;font-size:13px}',
    '.by{display:inline-block;margin-top:12px;color:#5b625e;font-size:12px;text-decoration:none}',
    '.by:hover{text-decoration:underline}',
    'button:focus-visible,textarea:focus-visible,a:focus-visible{outline:2px solid var(--b);outline-offset:2px}',
    '[hidden]{display:none!important}'
  ].join('');

  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    return n;
  }

  function show(cfg) {
    var host = document.createElement('div');
    host.setAttribute('data-tenpoint-widget', '');
    host.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483000';
    if (window.innerWidth < 480) host.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483000;display:flex;justify-content:center';
    var shadow = host.attachShadow({ mode: 'open' });
    var style = document.createElement('style');
    style.textContent = CSS;

    var card = el('div', { class: 'tp in', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'tp-q' });
    card.style.setProperty('--b', cfg.color || '#1d7a50');
    card.style.setProperty('--bi', inkFor(cfg.color || '#1d7a50'));

    var close = el('button', { class: 'x', type: 'button', 'aria-label': 'Close' });
    close.innerHTML = '<svg viewBox="0 0 256 256" aria-hidden="true"><path fill="currentColor" d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>';
    var brand = cfg.brand ? el('p', { class: 'brand' }, cfg.brand) : null;
    var q = el('p', { class: 'q', id: 'tp-q' }, cfg.question);
    var scale = el('div', { class: 'scale', role: 'group', 'aria-labelledby': 'tp-q' });
    var buttons = [];
    for (var i = 0; i <= 10; i++) {
      var b = el('button', { type: 'button', 'aria-pressed': 'false', 'aria-label': i + ' out of 10' }, String(i));
      b.dataset.score = i;
      buttons.push(b);
      scale.appendChild(b);
    }
    var ends = el('div', { class: 'ends', 'aria-hidden': 'true' });
    ends.appendChild(el('span', {}, 'Not likely'));
    ends.appendChild(el('span', {}, 'Very likely'));
    var form = el('form', { hidden: '' });
    var label = el('label', { for: 'tp-c' }, cfg.followUp);
    var area = el('textarea', { id: 'tp-c', rows: '3', maxlength: '2000' });
    var send = el('button', { class: 'send', type: 'submit' }, 'Send');
    form.appendChild(label); form.appendChild(area); form.appendChild(send);
    var thanks = el('p', { class: 'thanks', role: 'status', hidden: '' }, 'Thank you. Your answer was sent.');
    var err = el('p', { class: 'err', role: 'alert', hidden: '' });
    var by = el('a', { class: 'by', href: origin, target: '_blank', rel: 'noopener' }, 'Survey by Tenpoint');

    [close, brand, q, scale, ends, form, thanks, err, by].forEach(function (n) { if (n) card.appendChild(n); });
    shadow.appendChild(style);
    shadow.appendChild(card);
    document.body.appendChild(host);

    var answer = null;
    var busy = false;

    function remove() { if (host.parentNode) host.parentNode.removeChild(host); }
    function fail() { err.textContent = "Couldn't send that. Please try again."; err.hidden = false; }

    close.addEventListener('click', function () { snooze(); remove(); });
    card.addEventListener('keydown', function (e) { if (e.key === 'Escape') { snooze(); remove(); } });

    scale.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b || busy) return;
      var score = Number(b.dataset.score);
      buttons.forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      err.hidden = true;
      busy = true;
      var req = answer
        ? post('/api/r/' + pid + '/' + answer.id, { token: answer.token, score: score })
        : post('/api/r/' + pid, { score: score, source: 'widget' }).then(function (r) { answer = r; });
      req.then(function () {
        snooze();
        if (form.hidden) { form.hidden = false; area.focus(); }
      }).catch(fail).then(function () { busy = false; });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!answer || busy) return;
      busy = true;
      send.disabled = true;
      post('/api/r/' + pid + '/' + answer.id, { token: answer.token, comment: area.value.slice(0, 2000) })
        .then(function () {
          [q, scale, ends, form, err].forEach(function (n) { n.hidden = true; });
          if (brand) brand.hidden = true;
          thanks.hidden = false;
          close.focus();
          setTimeout(remove, 5000);
        })
        .catch(function () { send.disabled = false; fail(); })
        .then(function () { busy = false; });
    });
  }

  function start() {
    fetch(origin + '/api/s/' + pid)
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (cfg) { setTimeout(function () { show(cfg); }, delay); })
      .catch(function () { /* survey missing or offline: show nothing */ });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
