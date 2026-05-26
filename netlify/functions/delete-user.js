/**
 * POST /api/delete-user
 * Body: { user_id }
 *
 * Apenas super_admin. Não pode excluir a si mesmo.
 * Remove o usuário do Supabase Auth — o perfil em public.users sai junto
 * via ON DELETE CASCADE da FK users.id -> auth.users(id).
 *
 * Registra audit log com o e-mail/nome/papel anteriores ao delete.
 */
const { getAdmin } = require('./_shared/supabase');
const { authenticate, requireRole, clientIp } = require('./_shared/auth');
const { logAudit } = require('./_shared/audit');
const { ok, fail } = require('./_shared/respond');

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return fail(405, 'Método não permitido');

  const auth = await authenticate(event);
  if (auth.error) return fail(auth.status, auth.error);
  if (!requireRole(auth.profile, 'super_admin')) {
    return fail(403, 'Apenas super-admin pode excluir usuários.');
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return fail(400, 'JSON inválido'); }

  const userId = body.user_id;
  if (!userId) return fail(400, 'user_id obrigatório.');
  if (userId === auth.profile.id) {
    return fail(400, 'Você não pode excluir a si mesmo.');
  }

  const admin = getAdmin();

  // Carrega target para audit (e validar existência).
  const { data: target, error: tErr } = await admin
    .from('users')
    .select('id, email, full_name, role')
    .eq('id', userId)
    .single();
  if (tErr || !target) return fail(404, 'Usuário não encontrado');

  // Remove do Supabase Auth; public.users cai por cascade.
  const { error: dErr } = await admin.auth.admin.deleteUser(userId);
  if (dErr) {
    console.error('[delete-user] erro:', dErr);
    return fail(500, 'Erro ao excluir: ' + dErr.message);
  }

  await logAudit({
    actorId: auth.profile.id,
    action: 'user_deleted',
    entityType: 'user',
    entityId: userId,
    metadata: {
      email: target.email,
      full_name: target.full_name,
      role: target.role
    },
    ip: clientIp(event),
    userAgent: event.headers['user-agent']
  });

  return ok({ deleted: true, user_id: userId });
};
