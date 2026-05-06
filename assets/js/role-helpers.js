/**
 * IMO Insights — utilitários de RBAC, formatação e API
 * --------------------------------------------------
 * Carregar APÓS supabase-client.js. Expõe window.IMO.helpers.
 *
 * Tudo é client-side e considerado "conveniência". Toda autorização real
 * acontece no servidor (RLS no Postgres + validação nas Netlify Functions).
 */
(function () {
  'use strict';

  var NS = (window.IMO = window.IMO || {});
  var H  = (NS.helpers = NS.helpers || {});

  // ============================================================
  // Cache de perfil (uma chamada por sessão de página)
  // ============================================================
  var _profile = null;
  var _profileP = null;

  H.getProfile = async function (force) {
    if (force) { _profile = null; _profileP = null; }
    if (_profile)  return _profile;
    if (_profileP) return _profileP;

    _profileP = (async function () {
      if (!NS.client) return null;
      var sess = await NS.client.auth.getUser();
      var user = sess && sess.data && sess.data.user;
      if (!user) return null;

      var resp = await NS.client
        .from('users')
        .select('id, email, full_name, role, client_id, status, notify_by_email, last_login_at, consent_at')
        .eq('id', user.id)
        .single();

      if (resp.error) {
        console.error('[IMO helpers] erro ao carregar perfil:', resp.error);
        return null;
      }
      _profile = resp.data;
      return _profile;
    })();

    return _profileP;
  };

  H.clearProfileCache = function () { _profile = null; _profileP = null; };

  // ============================================================
  // Predicados de papel
  // ============================================================
  H.isClient        = function (p) { return !!(p && p.role === 'client'); };
  H.isEditor        = function (p) { return !!(p && p.role === 'editor'); };
  H.isAdmin         = function (p) { return !!(p && (p.role === 'admin' || p.role === 'super_admin')); };
  H.isSuperAdmin    = function (p) { return !!(p && p.role === 'super_admin'); };
  H.isEditorOrAbove = function (p) { return !!(p && ['editor','admin','super_admin'].indexOf(p.role) >= 0); };

  // Caminhos canônicos por papel (para redirecionamentos)
  H.homeForRole = function (role) {
    if (role === 'client')             return '/area-cliente.html';
    if (role === 'editor')             return '/area-cliente-editor.html';
    if (role === 'admin')              return '/area-cliente-admin.html';
    if (role === 'super_admin')        return '/area-cliente-admin.html';
    return '/login.html';
  };

  // ============================================================
  // Formatação pt-BR
  // ============================================================
  H.formatDate = function (iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });
  };

  H.formatDateTime = function (iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' }) +
           ' às ' +
           d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
  };

  H.formatNumber = function (n) {
    if (n === null || n === undefined) return '—';
    return Number(n).toLocaleString('pt-BR');
  };

  H.formatBytes = function (bytes) {
    if (bytes === null || bytes === undefined) return '—';
    var units = ['B','KB','MB','GB','TB'];
    var v = Number(bytes);
    var i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    var rounded = (v >= 10 || i === 0) ? Math.round(v) : Math.round(v * 10) / 10;
    return String(rounded).replace('.', ',') + ' ' + units[i];
  };

  H.relativeTime = function (iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    var diff = Date.now() - d.getTime();
    var min = Math.floor(diff / 60000);
    if (min < 1)  return 'agora';
    if (min < 60) return 'há ' + min + ' min';
    var h = Math.floor(min / 60);
    if (h < 24)   return 'há ' + h + ' h';
    var dd = Math.floor(h / 24);
    if (dd < 30)  return 'há ' + dd + ' dia' + (dd > 1 ? 's' : '');
    return H.formatDate(iso);
  };

  // ============================================================
  // Escape e sanitização
  // ============================================================
  H.escapeHtml = function (s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  // ============================================================
  // Chamada de API (Netlify Function) com JWT do usuário logado
  // ============================================================
  H.callApi = async function (path, opts) {
    opts = opts || {};
    if (!NS.client) throw new Error('Cliente Supabase não inicializado');

    var sess = await NS.client.auth.getSession();
    var token = sess && sess.data && sess.data.session && sess.data.session.access_token;

    var headers = Object.assign({}, opts.headers || {});
    if (token) headers['Authorization'] = 'Bearer ' + token;

    var body = opts.body;
    var isFormData = (typeof FormData !== 'undefined') && (body instanceof FormData);

    if (body && !isFormData && typeof body !== 'string') {
      body = JSON.stringify(body);
      if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
    } else if (typeof body === 'string' && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    var clean = String(path || '').replace(/^\/+/, '');
    var url   = '/api/' + clean;

    var res = await fetch(url, {
      method:   opts.method || (body ? 'POST' : 'GET'),
      headers:  headers,
      body:     body
    });

    var payload = null;
    var ct = res.headers.get('content-type') || '';
    if (ct.indexOf('application/json') !== -1) {
      try { payload = await res.json(); } catch (e) { /* ignore */ }
    } else {
      try { payload = await res.text(); } catch (e) { /* ignore */ }
    }

    if (!res.ok) {
      var msg = (payload && payload.error) || (typeof payload === 'string' ? payload : null) || ('HTTP ' + res.status);
      var err = new Error(msg);
      err.status = res.status;
      err.payload = payload;
      throw err;
    }
    return payload;
  };

  // ============================================================
  // Toast / mensagens visíveis (usa elemento #imo-toast se existir)
  // ============================================================
  H.toast = function (message, type) {
    type = type || 'info';
    var el = document.getElementById('imo-toast');
    if (!el) {
      // Cria container se a página não tiver
      el = document.createElement('div');
      el.id = 'imo-toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#1a1a2e;color:#fff;padding:14px 20px;border-radius:8px;border:1px solid #2a2a3e;font-family:Inter,sans-serif;font-size:14px;line-height:1.4;max-width:360px;z-index:9999;box-shadow:0 10px 30px rgba(0,0,0,.4);opacity:0;transition:opacity .2s;pointer-events:none;';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.style.borderColor =
      type === 'error'   ? '#ff7676' :
      type === 'success' ? '#A1EA00' :
      type === 'warn'    ? '#FF8000' : '#2a2a3e';
    el.style.opacity = '1';
    clearTimeout(H._toastTimer);
    H._toastTimer = setTimeout(function () { el.style.opacity = '0'; }, 4500);
  };

  // ============================================================
  // Logout: limpa sessão + cache + flags + redireciona
  // ============================================================
  H.signOut = async function (redirectTo) {
    try { if (NS.client) await NS.client.auth.signOut(); } catch (e) { /* ignore */ }
    H.clearProfileCache();
    try { sessionStorage.removeItem('imo_session_active'); } catch (e) {}
    try { localStorage.removeItem('imo_remember'); } catch (e) {}
    window.location.href = redirectTo || '/login.html';
  };

  // ============================================================
  // Notificações: novo conteúdo aprovado desde o último login
  // ============================================================
  H.countNewContentSince = async function (sinceIso) {
    if (!NS.client || !sinceIso) return 0;
    var resp = await NS.client
      .from('client_visible_content')
      .select('version_id', { count: 'exact', head: true })
      .gt('published_at', sinceIso);
    if (resp.error) {
      console.warn('[IMO helpers] countNewContentSince erro:', resp.error);
      return 0;
    }
    return resp.count || 0;
  };

  // ============================================================
  // Status badge label (cor cuidada via classe CSS no front)
  // ============================================================
  H.statusLabel = function (status) {
    var map = {
      'pending_approval': 'Aguardando aprovação',
      'approved':         'Aprovada',
      'rejected':         'Rejeitada',
      'archived':         'Arquivada',
      'active':           'Ativo',
      'inactive':         'Inativo',
      'invited':          'Convidado',
      'disabled':         'Desativado',
      'draft':            'Rascunho'
    };
    return map[status] || status || '—';
  };

  H.roleLabel = function (role) {
    var map = {
      'client':      'Cliente',
      'editor':      'Editor',
      'admin':       'Administrador',
      'super_admin': 'Super-administrador'
    };
    return map[role] || role || '—';
  };

  H.typeLabel = function (type) {
    return type === 'dashboard' ? 'Dashboard' : 'Documento';
  };
})();
