/* ====================================================================
   IMO Insights · Banner de cookies (LGPD / Guia de Cookies da ANPD)
   - Primeiro nível: Aceitar todos, Rejeitar não necessários, Personalizar
   - Segundo nível: categorias (Necessários sempre ativos, Analíticos desligado por padrão)
   - Guarda a escolha em localStorage 'imo_cookie_consent' por 12 meses
   - Reabrir: qualquer elemento com [data-cookie-prefs] ou window.IMOCookies.open()
   - Para scripts futuros: só carregue analytics se window.IMOCookies.allowed('analytics')
     ou escute o evento 'imo:cookie-consent' no document.
   ==================================================================== */
(function () {
  'use strict';

  var KEY = 'imo_cookie_consent';
  var VERSION = 1;              // aumente para pedir nova escolha quando a política mudar
  var MAX_AGE_DAYS = 365;
  var POLICY_URL = '/cookies';

  function read() {
    try {
      var raw = window.localStorage.getItem(KEY);
      if (!raw) return null;
      var c = JSON.parse(raw);
      if (!c || c.v !== VERSION) return null;
      if (Date.now() - new Date(c.date).getTime() > MAX_AGE_DAYS * 864e5) return null;
      return c;
    } catch (e) { return null; }
  }

  function announce(c) {
    api.consent = c;
    try {
      document.dispatchEvent(new CustomEvent('imo:cookie-consent', { detail: c }));
    } catch (e) { /* navegadores antigos */ }
  }

  function save(analytics) {
    var c = { v: VERSION, date: new Date().toISOString(), necessary: true, analytics: !!analytics };
    try { window.localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) { /* modo privado */ }
    announce(c);
    close();
  }

  var api = {
    consent: null,
    allowed: function (category) {
      if (category === 'necessary') return true;
      return !!(api.consent && api.consent[category]);
    },
    open: function () { open(true); },
    reset: function () {
      try { window.localStorage.removeItem(KEY); } catch (e) {}
      api.consent = null;
      open(false);
    }
  };
  window.IMOCookies = api;

  var CSS = ''
    + '.imo-ck{position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483000;max-width:760px;margin:0 auto;'
    + 'background:#0A0A0A;color:#fff;border:1px solid #2a2a2a;border-radius:10px;padding:22px 24px;'
    + 'font-family:"Rethink Sans",-apple-system,system-ui,sans-serif;font-size:14px;line-height:1.55;'
    + 'box-shadow:0 12px 40px rgba(0,0,0,.35)}'
    + '.imo-ck *{box-sizing:border-box}'
    + '.imo-ck h2{font-size:16px;font-weight:700;margin:0 0 6px;color:#fff;letter-spacing:0}'
    + '.imo-ck p{margin:0 0 14px;color:#cfcfcf;font-size:14px}'
    + '.imo-ck a{color:#FF8000;text-decoration:underline}'
    + '.imo-ck-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center}'
    + '.imo-ck button{font:inherit;font-weight:700;font-size:13px;cursor:pointer;border-radius:6px;padding:10px 16px;'
    + 'border:1px solid #FF8000;background:#FF8000;color:#0A0A0A}'
    + '.imo-ck button:hover{background:#ff9a33;border-color:#ff9a33}'
    + '.imo-ck button:focus-visible,.imo-ck a:focus-visible,.imo-ck input:focus-visible{outline:2px solid #fff;outline-offset:2px}'
    + '.imo-ck button.imo-ck-link{background:transparent;border-color:transparent;color:#fff;text-decoration:underline;padding:10px 6px}'
    + '.imo-ck button.imo-ck-link:hover{color:#FF8000;background:transparent}'
    + '.imo-ck-panel{border-top:1px solid #2a2a2a;margin-top:16px;padding-top:14px}'
    + '.imo-ck-panel[hidden]{display:none}'
    + '.imo-ck-cat{display:flex;gap:14px;justify-content:space-between;align-items:flex-start;padding:10px 0}'
    + '.imo-ck-cat strong{display:block;color:#fff;font-size:14px}'
    + '.imo-ck-cat span{display:block;color:#a8a8a8;font-size:13px}'
    + '.imo-ck-cat em{font-style:normal;color:#A1EA00;font-size:12px;font-weight:700;white-space:nowrap;padding-top:2px}'
    + '.imo-ck-cat input{width:20px;height:20px;accent-color:#FF8000;margin-top:2px;flex:none}'
    + '@media (max-width:560px){.imo-ck{left:8px;right:8px;bottom:8px;padding:18px}'
    + '.imo-ck-actions button{flex:1 1 100%}}';

  var HTML = ''
    + '<h2 id="imo-ck-title">Cookies neste site</h2>'
    + '<p id="imo-ck-desc">Usamos apenas armazenamento necessário ao funcionamento do site e da Área do Cliente. '
    + 'Não usamos cookies de publicidade. Você pode aceitar, rejeitar ou personalizar as categorias não necessárias. '
    + 'Saiba mais na <a href="' + POLICY_URL + '">Política de Cookies</a>.</p>'
    + '<div class="imo-ck-actions">'
    + '<button type="button" data-ck="reject">Rejeitar não necessários</button>'
    + '<button type="button" data-ck="accept">Aceitar todos</button>'
    + '<button type="button" class="imo-ck-link" data-ck="custom" aria-expanded="false" aria-controls="imo-ck-panel">Personalizar</button>'
    + '</div>'
    + '<div class="imo-ck-panel" id="imo-ck-panel" hidden>'
    + '<div class="imo-ck-cat"><div><strong>Necessários</strong>'
    + '<span>Sessão e segurança da Área do Cliente e registro desta escolha. Não podem ser desativados.</span></div>'
    + '<em>Sempre ativos</em></div>'
    + '<div class="imo-ck-cat"><label for="imo-ck-analytics"><strong>Analíticos</strong>'
    + '<span>Medição de audiência do site. Hoje não utilizamos nenhum. Se passarmos a usar, só serão ativados com a sua autorização.</span></label>'
    + '<input type="checkbox" id="imo-ck-analytics"></div>'
    + '<div class="imo-ck-actions"><button type="button" data-ck="save">Salvar preferências</button></div>'
    + '</div>';

  var el = null;

  function build() {
    if (!document.getElementById('imo-ck-style')) {
      var st = document.createElement('style');
      st.id = 'imo-ck-style';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    el = document.createElement('div');
    el.className = 'imo-ck';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'false');
    el.setAttribute('aria-labelledby', 'imo-ck-title');
    el.setAttribute('aria-describedby', 'imo-ck-desc');
    el.innerHTML = HTML;
    el.addEventListener('click', function (ev) {
      var t = ev.target;
      var action = t && t.getAttribute && t.getAttribute('data-ck');
      if (!action) return;
      if (action === 'accept') save(true);
      else if (action === 'reject') save(false);
      else if (action === 'save') save(el.querySelector('#imo-ck-analytics').checked);
      else if (action === 'custom') togglePanel();
    });
    document.body.appendChild(el);
  }

  function togglePanel(force) {
    var panel = el.querySelector('#imo-ck-panel');
    var btn = el.querySelector('[data-ck="custom"]');
    var show = typeof force === 'boolean' ? force : panel.hidden;
    panel.hidden = !show;
    btn.setAttribute('aria-expanded', show ? 'true' : 'false');
  }

  function open(withPanel) {
    if (!el) build();
    el.querySelector('#imo-ck-analytics').checked = api.allowed('analytics');
    togglePanel(!!withPanel);
  }

  function close() {
    if (el && el.parentNode) el.parentNode.removeChild(el);
    el = null;
  }

  function init() {
    var c = read();
    if (c) announce(c); else open(false);
    document.addEventListener('click', function (ev) {
      var t = ev.target && ev.target.closest ? ev.target.closest('[data-cookie-prefs]') : null;
      if (!t) return;
      ev.preventDefault();
      api.open();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
