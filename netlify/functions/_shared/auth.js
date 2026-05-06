/**
 * Validação do JWT do Supabase + carregamento do perfil.
 *
 * Toda Function que recebe ações de usuário começa com:
 *   const auth = await authenticate(event);
 *   if (auth.error) return fail(auth.status, auth.error);
 *   const { profile } = auth;
 */
const { getAdmin } = require('./supabase');

async function authenticate(event) {
  const headers = event.headers || {};
  const raw = headers.authorization || headers.Authorization || '';
  const token = raw.replace(/^Bearer\s+/i, '').trim();
  if (!token) return { error: 'Token ausente.', status: 401 };

  const admin = getAdmin();

  // Valida o JWT e devolve o usuário
  const { data: userResp, error: uErr } = await admin.auth.getUser(token);
  if (uErr || !userResp || !userResp.user) {
    return { error: 'Token inválido ou expirado.', status: 401 };
  }
  const user = userResp.user;

  // Carrega perfil de aplicação
  const { data: profile, error: pErr } = await admin
    .from('users')
    .select('id, email, full_name, role, client_id, status, notify_by_email, last_login_at, consent_at')
    .eq('id', user.id)
    .single();

  if (pErr || !profile) {
    return { error: 'Perfil não encontrado.', status: 401 };
  }
  if (profile.status !== 'active') {
    return { error: 'Conta inativa.', status: 403 };
  }

  return { user, profile, jwt: token };
}

const ROLE_ORDER = { client: 0, editor: 1, admin: 2, super_admin: 3 };

function requireRole(profile, minRole) {
  return (ROLE_ORDER[profile.role] || -1) >= (ROLE_ORDER[minRole] || 0);
}

function clientIp(event) {
  const h = event.headers || {};
  return h['x-nf-client-connection-ip'] ||
         (h['x-forwarded-for'] || '').split(',')[0].trim() ||
         h['client-ip'] ||
         null;
}

module.exports = { authenticate, requireRole, clientIp };
