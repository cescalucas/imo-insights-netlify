/**
 * GET /api/check-mfa
 *
 * Retorna se o usuário corrente tem mfa_grant válido.
 * Chamado pelo session-guard.js em cada page load da área logada.
 *
 * Resposta:
 *   { has_mfa: true,  valid_until: "..." }
 *   { has_mfa: false, valid_until: null  }
 */
const { getAdmin } = require('./_shared/supabase');
const { ok, fail } = require('./_shared/respond');

exports.handler = async function (event) {
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') return fail(405, 'Método não permitido');

  const headers = event.headers || {};
  const raw = headers.authorization || headers.Authorization || '';
  const token = raw.replace(/^Bearer\s+/i, '').trim();
  if (!token) return fail(401, 'Token ausente');

  const admin = getAdmin();
  const { data: u, error: uErr } = await admin.auth.getUser(token);
  if (uErr || !u || !u.user) return fail(401, 'Token inválido');
  const userId = u.user.id;

  const nowIso = new Date().toISOString();
  const { data: grants } = await admin
    .from('mfa_grants')
    .select('valid_until')
    .eq('user_id', userId)
    .is('revoked_at', null)
    .gt('valid_until', nowIso)
    .order('valid_until', { ascending: false })
    .limit(1);

  if (grants && grants.length) {
    return ok({ has_mfa: true, valid_until: grants[0].valid_until });
  }
  return ok({ has_mfa: false, valid_until: null });
};
