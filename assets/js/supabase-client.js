/**
 * IMO Insights — singleton do cliente Supabase
 * --------------------------------------------------
 * Pré-requisitos no HTML (nesta ordem):
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 *   <script src="/assets/js/env-config.js"></script>
 *   <script src="/assets/js/supabase-client.js"></script>
 *
 * Expõe:
 *   window.IMO.client   → instância única do client supabase-js
 *   window.IMO.ready    → Promise que resolve quando o client está pronto
 *
 * Persistência da sessão:
 *   - storage = localStorage (chave 'imo-auth')
 *   - autoRefreshToken ativo (refresh silencioso do JWT)
 *   - flowType 'pkce' (mais seguro para SPAs estáticas)
 *
 * Sessão por aba: o guard (session-guard.js) faz a invalidação extra
 * quando "Manter conectado" não está marcado, lendo localStorage
 * 'imo_remember' e sessionStorage 'imo_session_active'.
 */
(function () {
  'use strict';

  var NS = (window.IMO = window.IMO || {});

  if (NS.client) return; // singleton: já criado em outro bundle, sai.

  if (!window.IMO_ENV) {
    console.error('[IMO supabase-client] window.IMO_ENV ausente. Carregue env-config.js antes.');
    return;
  }

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    console.error('[IMO supabase-client] @supabase/supabase-js não carregado. Verifique a tag <script> do CDN.');
    return;
  }

  var url  = window.IMO_ENV.SUPABASE_URL;
  var anon = window.IMO_ENV.SUPABASE_ANON_KEY;

  if (!url || !anon || /^__.+__$/.test(url) || /^__.+__$/.test(anon)) {
    console.error('[IMO supabase-client] SUPABASE_URL ou SUPABASE_ANON_KEY ausentes/placeholder. Edite assets/js/env-config.js.');
    return;
  }

  NS.client = window.supabase.createClient(url, anon, {
    auth: {
      persistSession:    true,
      autoRefreshToken:  true,
      detectSessionInUrl: true,
      storage:           window.localStorage,
      storageKey:        'imo-auth',
      flowType:          'pkce'
    },
    global: {
      headers: { 'X-Client-Info': 'imo-insights-area-cliente/1.0' }
    }
  });

  // Disponibiliza um Promise ready para quem quiser aguardar:
  NS.ready = Promise.resolve();
})();
