/**
 * POST /api/request-email-otp
 *
 * Chamado depois que o usuário fez login com e-mail+senha (JWT já existe).
 * Gera um código OTP de 6 dígitos, armazena hash em email_otp_codes,
 * envia por e-mail via Resend.
 *
 * Idempotente em curto intervalo: se já existe um código não-consumido
 * com expires_at > now() criado há menos de 60s, NÃO emite novo
 * (evita flood). Retorna sucesso mesmo assim.
 */
const { getAdmin } = require('./_shared/supabase');
const { clientIp } = require('./_shared/auth');
const { logAudit } = require('./_shared/audit');
const { sendEmail, loginOtpTemplate } = require('./_shared/email');
const { generateCode, hashCode } = require('./_shared/otp');
const { ok, fail } = require('./_shared/respond');

const OTP_TTL_MS    = 10 * 60 * 1000;  // 10 minutos
const RESEND_WINDOW = 60 * 1000;       // 60s entre envios

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return fail(405, 'Método não permitido');

  // Aceitamos qualquer JWT válido (mesmo de status 'invited').
  const headers = event.headers || {};
  const raw = headers.authorization || headers.Authorization || '';
  const token = raw.replace(/^Bearer\s+/i, '').trim();
  if (!token) return fail(401, 'Token ausente');

  const admin = getAdmin();
  const { data: u, error: uErr } = await admin.auth.getUser(token);
  if (uErr || !u || !u.user) return fail(401, 'Token inválido');

  const userId = u.user.id;

  // Carrega perfil para nome e e-mail confirmado
  const { data: profile } = await admin
    .from('users').select('id, email, full_name, status').eq('id', userId).single();
  if (!profile) return fail(404, 'Perfil ausente');
  if (profile.status === 'disabled') return fail(403, 'Conta desativada');

  // Anti-flood: se já há código recente, não cria outro
  const { data: recent } = await admin
    .from('email_otp_codes')
    .select('id, created_at, expires_at')
    .eq('user_id', userId)
    .is('consumed_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1);

  if (recent && recent.length) {
    const ageMs = Date.now() - new Date(recent[0].created_at).getTime();
    if (ageMs < RESEND_WINDOW) {
      return ok({ sent: true, throttled: true });
    }
  }

  const code = generateCode();
  const codeHash = hashCode(code, userId);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();
  const ip = clientIp(event);
  const ua = event.headers['user-agent'];

  const { error: insErr } = await admin.from('email_otp_codes').insert({
    user_id: userId,
    code_hash: codeHash,
    purpose: 'login_2fa',
    expires_at: expiresAt,
    ip_address: ip,
    user_agent: ua
  });
  if (insErr) {
    console.error('[request-email-otp] insert error:', insErr);
    return fail(500, 'Erro ao registrar código.');
  }

  // Envia e-mail
  try {
    const tpl = loginOtpTemplate({
      code: code,
      fullName: profile.full_name,
      ip: ip,
      userAgent: ua
    });
    await sendEmail({ to: profile.email, ...tpl });
  } catch (e) {
    console.error('[request-email-otp] email error:', e);
    // Não falha a request — usuário pode pedir reenvio se não chegar.
  }

  await logAudit({
    actorId: userId,
    action: 'login_otp_requested',
    entityType: 'user',
    entityId: userId,
    metadata: { email: profile.email },
    ip: ip,
    userAgent: ua
  });

  return ok({ sent: true });
};
