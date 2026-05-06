/**
 * IMO Insights — configuração de ambiente do front
 * --------------------------------------------------
 * Estes valores são PÚBLICOS por design:
 *   - SUPABASE_URL     é apenas a URL do projeto.
 *   - SUPABASE_ANON_KEY é uma chave pública. A segurança vem do RLS no Postgres.
 *   - SITE_URL          é a URL pública do site.
 *
 * NUNCA coloque aqui SUPABASE_SERVICE_ROLE_KEY nem RESEND_API_KEY —
 * essas só vivem nas Netlify Functions (variáveis de ambiente do Netlify).
 *
 * Como editar:
 *   1. Substitua os 3 placeholders abaixo pelos valores do seu projeto.
 *   2. Faça commit deste arquivo (anon key é público, não é segredo).
 *   3. Em deploys via Netlify build hook você pode optar por injetar via env vars
 *      e um script sed; veja README → "Injeção automática de env-config".
 */
(function () {
  'use strict';

  window.IMO_ENV = {
    SUPABASE_URL:      '__SUPABASE_URL__',
    SUPABASE_ANON_KEY: '__SUPABASE_ANON_KEY__',
    SITE_URL:          'https://peaceful-marshmallow-b2a880.netlify.app'
  };

  // Validação cedo: se alguém esqueceu de substituir, avisa no console.
  var missing = Object.keys(window.IMO_ENV).filter(function (k) {
    return /^__.+__$/.test(window.IMO_ENV[k]);
  });
  if (missing.length) {
    console.error(
      '[IMO env-config] Placeholders não substituídos: ' + missing.join(', ') +
      '. Edite assets/js/env-config.js antes do deploy.'
    );
  }
})();
