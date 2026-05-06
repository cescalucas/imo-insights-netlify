/**
 * IMO Insights — guard de sessão
 * --------------------------------------------------
 * Carregar APÓS supabase-client.js e role-helpers.js.
 *
 * Uso no HTML:
 *   <body data-imo-guard="cliente">     ← exige login (qualquer papel ativo)
 *   <body data-imo-guard="editor">      ← exige editor, admin ou super_admin
 *   <body data-imo-guard="admin">       ← exige admin ou super_admin
 *   <body data-imo-guard="super_admin"> ← exige super_admin
 *
 * 2FA:
 *   - Todos os papéis precisam de mfa_grant válido.
 *   - O guard chama /api/check-mfa em cada page load.
 *   - Sem MFA → redireciona para /login.html?reason=mfa-required.
 *
 * Eventos disparados (na document):
 *   imo:ready    { profile, session, mfa }
 *   imo:expired  (sem detail)
 *
 * Sessão por aba: se "Manter conectado" não foi marcado no login,
 * abrir nova aba sem aba ativa força novo login.
 */
(function () {
  'use strict';

  var NS = (window.IMO = window.IMO || {});

  // Limites de inatividade (ms)
  var SESSION_LIMITS = {
    'client':       8 * 60 * 60 * 1000,
    'editor':      30 * 60 * 1000,
    'admin':       30 * 60 * 1000,
    'super_admin': 30 * 60 * 1000
  };

  function levelOf(role) {
    if (role === 'client')      return 0;
    if (role === 'editor')      return 1;
    if (role === 'admin')       return 2;
    if (role === 'super_admin') return 3;
    return -1;
  }
  function requiredLevelOf(token) {
    var t = (token || 'cliente').trim().toLowerCase();
    if (t === 'cliente' || t === 'client') return 0;
    if (t === 'editor')                    return 1;
    if (t === 'admin')                     return 2;
    if (t === 'super_admin')               return 3;
    return 0;
  }

  function redirectToLogin(reason) {
    var here = encodeURIComponent(window.location.pathname + window.location.search);
    var qs = '?next=' + here + (reason ? '&reason=' + encodeURIComponent(reason) : '');
    window.location.replace('/login.html' + qs);
  }

  function redirectByRole(role) {
    if (NS.helpers && typeof NS.helpers.homeForRole === 'function') {
      window.location.replace(NS.helpers.homeForRole(role));
    } else {
      window.location.replace('/login.html');
    }
  }

  // --------------------------------------------------
  // Sessão por aba: invalida se nem remember, nem aba ativa.
  // Roda síncrono ANTES do guard async para evitar piscar conteúdo.
  // --------------------------------------------------
  (function tabSessionCheck() {
    try {
      var hasActiveTab = sessionStorage.getItem('imo_session_active') === '1';
      var hasRemember  = localStorage.getItem('imo_remember') === '1';
      if (!hasActiveTab && !hasRemember) {
        var rm = [];
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && (k.indexOf('imo-auth') === 0 || k.indexOf('sb-') === 0)) rm.push(k);
        }
        rm.forEach(function (k) { localStorage.removeItem(k); });
        return redirectToLogin('expired');
      }
      sessionStorage.setItem('imo_session_active', '1');
    } catch (e) { /* storage indisponível */ }
  })();

  // --------------------------------------------------
  // Inatividade
  // --------------------------------------------------
  var inactivityTimer = null;
  function setupInactivity(role) {
    var limit = SESSION_LIMITS[role] || SESSION_LIMITS['client'];

    function reset() {
      clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(onInactive, limit);
    }
    function onInactive() {
      document.dispatchEvent(new CustomEvent('imo:expired'));
      try {
        if (NS.helpers && NS.helpers.toast) {
          NS.helpers.toast('Sua sessão expirou por inatividade. Faça login novamente.', 'warn');
        }
      } catch (e) {}
      setTimeout(function () {
        if (NS.helpers) NS.helpers.signOut('/login.html?reason=inactivity');
        else window.location.replace('/login.html?reason=inactivity');
      }, 1200);
    }

    ['click', 'keydown', 'scroll', 'mousemove', 'touchstart', 'visibilitychange']
      .forEach(function (ev) { window.addEventListener(ev, reset, { passive: true }); });

    reset();
  }

  // --------------------------------------------------
  // Guard principal
  // --------------------------------------------------
  async function guard() {
    if (!NS.client) {
      console.error('[IMO guard] supabase-client.js não inicializado');
      return redirectToLogin('config');
    }

    var requiredToken = (document.body.dataset.imoGuard || 'cliente');
    var required = requiredLevelOf(requiredToken);

    // 1) Sessão JWT existe?
    var sess = await NS.client.auth.getSession();
    var session = sess && sess.data && sess.data.session;
    if (!session) {
      return redirectToLogin('no-session');
    }

    // 2) Carrega perfil
    var profile = NS.helpers ? await NS.helpers.getProfile(true) : null;
    if (!profile) {
      console.warn('[IMO guard] sem perfil para usuário autenticado, deslogando');
      if (NS.helpers) await NS.helpers.signOut();
      else redirectToLogin('no-profile');
      return;
    }

    // 3) Status active?
    if (profile.status !== 'active') {
      if (NS.helpers && NS.helpers.toast) {
        NS.helpers.toast('Sua conta está ' + (profile.status === 'invited' ? 'pendente de ativação' : 'desativada') + '.', 'warn');
      }
      setTimeout(function () { if (NS.helpers) NS.helpers.signOut(); }, 1500);
      return;
    }

    // 4) Papel suficiente?
    var userLevel = levelOf(profile.role);
    if (userLevel < required) {
      return redirectByRole(profile.role);
    }

    // 5) MFA por e-mail (universal): verifica grant via API
    var mfa;
    try {
      mfa = await NS.helpers.callApi('check-mfa', { method: 'GET' });
    } catch (e) {
      console.error('[IMO guard] check-mfa erro:', e);
      return redirectToLogin('mfa-required');
    }
    if (!mfa || !mfa.has_mfa) {
      return redirectToLogin('mfa-required');
    }

    // 6) Inatividade
    setupInactivity(profile.role);

    // 7) Disponibiliza global e dispara evento
    NS.profile = profile;
    NS.session = session;
    NS.mfa = mfa;

    document.dispatchEvent(new CustomEvent('imo:ready', {
      detail: { profile: profile, session: session, mfa: mfa }
    }));
  }

  // Auto-logout cross-tab
  if (NS.client && NS.client.auth && typeof NS.client.auth.onAuthStateChange === 'function') {
    NS.client.auth.onAuthStateChange(function (event) {
      if (event === 'SIGNED_OUT') {
        if (NS.helpers) NS.helpers.clearProfileCache();
        if (/^\/area-cliente/.test(window.location.pathname)) {
          window.location.replace('/login.html?reason=signed-out');
        }
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', guard);
  } else {
    guard();
  }

  NS.guard = guard;
})();
