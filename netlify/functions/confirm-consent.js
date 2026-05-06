/**
 * POST /api/confirm-consent
 * Sem body.
 *
 * Marca o usuário como tendo aceitado a Política de Privacidade
 * (consent_at = now()) e ativa a conta (status: 'invited' → 'active').
 * Chamado a partir de definir-senha.html no fluxo de invite.
 */
const { getAdmin } = require('./_shared/supabase');
const { authenticate, clientIp } = require('./_shared/auth');
const { logAudit } = require('./_shared/audit');
const { ok, fail } = require('./_shared/respond');

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return fail(405, 'Método não permitido');

  // authenticate exige status='active', mas convidado é 'invited'.
  // Por isso fazemos a validação manualmente aqui — só precisamos do JWT válido.
  const headers = event.headers || {};
  const raw = headers.authorization || headers.Authorization || '';
  const token = raw.replace(/^Bearer\s+/i, '').trim();
  if (!token) return fail(401, 'Token ausente');

  const admin = getAdmin();
  const { data: u, error: uErr } = await admin.auth.getUser(token);
  if (uErr || !u || !u.user) return fail(401, 'Token inválido');

  const userId = u.user.id;
  const { data: profile, error: pErr } = await admin
    .from('users').select('id, email, status, consent_at')
    .eq('id', userId).single();
  if (pErr || !profile) return fail(404, 'Perfil não encontrado');

  // Se já consentiu E está ativo, no-op
  if (profile.consent_at && profile.status === 'active') {
    return ok({ already: true });
  }

  const updates = { consent_at: new Date().toISOString() };
  if (profile.status === 'invited') updates.status = 'active';

  const { error: upErr } = await admin.from('users').update(updates).eq('id', userId);
  if (upErr) {
    console.error('[confirm-consent] update error:', upErr);
    return fail(500, 'Erro ao registrar consentimento');
  }

  await logAudit({
    actorId: userId,
    action:  'consent_given',
    entityType: 'user', entityId: userId,
    metadata: { email: profile.email },
    ip: clientIp(event),
    userAgent: event.headers['user-agent']
  });

  return ok({ confirmed: true });
};
