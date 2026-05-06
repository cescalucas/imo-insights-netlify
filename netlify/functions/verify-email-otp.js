/**
 * POST /api/verify-email-otp
 * Body: { code }
 *
 * Valida o código mais recente não-consumido para o usuário corrente.
 * Em sucesso:
 *   - marca o code como consumed_at = now()
 *   - cria mfa_grant com TTL de 8h
 *   - retorna { verified: true, valid_until }
 *
 * Em erro:
 *   - incrementa attempts; após 5 tentativas, code é invalidado
 */
const { getAdmin } = require('./_shared/supabase');
const { clientIp } = require('./_shared/auth');
const { logAudit } = require('./_shared/audit');
const { hashCode, safeEqual } = require('./_shared/otp');
const { ok, fail } = require('./_shared/respond');

const MFA_GRANT_TTL_MS = 8 * 60 * 60 * 1000;   // 8 horas
const MAX_ATTEMPTS     = 5;

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return fail(405, 'Método não permitido');

  const headers = event.headers || {};
  const raw = headers.authorization || headers.Authorization || '';
  const token = raw.replace(/^Bearer\s+/i, '').trim();
  if (!token) return fail(401, 'Token ausente');

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return fail(400, 'JSON inválido'); }

  const code = (body.code || '').replace(/\D/g, '');
  if (!/^\d{6}$/.test(code)) return fail(400, 'Código deve ter 6 dígitos.');

  const admin = getAdmin();
  const { data: u, error: uErr } = await admin.auth.getUser(token);
  if (uErr || !u || !u.user) return fail(401, 'Token inválido');
  const userId = u.user.id;

  const { data: profile } = await admin
    .from('users').select('id, email, status').eq('id', userId).single();
  if (!profile) return fail(404, 'Perfil ausente');
  if (profile.status === 'disabled') return fail(403, 'Conta desativada');

  // Pega código mais recente não-consumido e válido
  const nowIso = new Date().toISOString();
  const { data: codes, error: cErr } = await admin
    .from('email_otp_codes')
    .select('id, code_hash, attempts, expires_at, consumed_at')
    .eq('user_id', userId)
    .is('consumed_at', null)
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: false })
    .limit(1);
  if (cErr) {
    console.error('[verify-email-otp] select error:', cErr);
    return fail(500, 'Erro ao verificar.');
  }
  if (!codes || !codes.length) {
    return fail(400, 'Código expirado ou inexistente. Solicite um novo.');
  }

  const row = codes[0];
  if (row.attempts >= MAX_ATTEMPTS) {
    return fail(429, 'Muitas tentativas. Solicite um novo código.');
  }

  const expectedHash = hashCode(code, userId);
  const matches = safeEqual(expectedHash, row.code_hash);

  if (!matches) {
    await admin.from('email_otp_codes')
      .update({ attempts: row.attempts + 1 })
      .eq('id', row.id);

    await logAudit({
      actorId: userId,
      action: 'login_otp_failed',
      entityType: 'user',
      entityId: userId,
      metadata: { remaining: MAX_ATTEMPTS - (row.attempts + 1) },
      ip: clientIp(event),
      userAgent: event.headers['user-agent']
    });

    return fail(400, 'Código incorreto.');
  }

  // Sucesso → consome o código + cria grant
  const validUntil = new Date(Date.now() + MFA_GRANT_TTL_MS).toISOString();
  const ip = clientIp(event);
  const ua = event.headers['user-agent'];

  const { error: updErr } = await admin
    .from('email_otp_codes')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', row.id);
  if (updErr) console.warn('[verify-email-otp] consume warn:', updErr);

  // Revoga grants antigos do mesmo usuário (single-grant policy)
  await admin
    .from('mfa_grants')
    .update({ revoked_at: new Date().toISOString() })
    .is('revoked_at', null)
    .eq('user_id', userId)
    .gt('valid_until', nowIso);

  const { error: gErr } = await admin.from('mfa_grants').insert({
    user_id:     userId,
    method:      'email_otp',
    valid_until: validUntil,
    ip_address:  ip,
    user_agent:  ua
  });
  if (gErr) {
    console.error('[verify-email-otp] grant error:', gErr);
    return fail(500, 'Erro ao registrar 2FA.');
  }

  // Atualiza last_login_at do usuário
  try {
    await admin.from('users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', userId);
  } catch (e) {}

  await logAudit({
    actorId: userId,
    action: 'login_otp_verified',
    entityType: 'user',
    entityId: userId,
    metadata: { email: profile.email, valid_until: validUntil },
    ip: ip,
    userAgent: ua
  });

  return ok({ verified: true, valid_until: validUntil });
};
