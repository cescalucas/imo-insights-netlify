/**
 * POST /api/admin-update-user
 * Body: { user_id, full_name?, role?, status?, client_id? }
 *
 * Permissões:
 *   admin pode editar perfis client/editor.
 *   apenas super_admin pode mexer em admin/super_admin (alterar para/de).
 *   ninguém pode rebaixar a si mesmo.
 *
 * Registra audit log de cada mudança relevante.
 */
const { getAdmin } = require('./_shared/supabase');
const { authenticate, requireRole, clientIp } = require('./_shared/auth');
const { logAudit } = require('./_shared/audit');
const { ok, fail } = require('./_shared/respond');

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return fail(405, 'Método não permitido');

  const auth = await authenticate(event);
  if (auth.error) return fail(auth.status, auth.error);
  if (!requireRole(auth.profile, 'admin')) return fail(403, 'Apenas administradores.');

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return fail(400, 'JSON inválido'); }

  const userId = body.user_id;
  if (!userId) return fail(400, 'user_id obrigatório.');
  if (userId === auth.profile.id) return fail(400, 'Use a página de Perfil para editar a si mesmo.');

  const admin = getAdmin();

  // Carrega target
  const { data: target, error: tErr } = await admin
    .from('users')
    .select('id, email, full_name, role, status, client_id')
    .eq('id', userId)
    .single();
  if (tErr || !target) return fail(404, 'Usuário não encontrado');

  // Permissão: para mexer em admin/super_admin precisa ser super_admin
  if (['admin','super_admin'].includes(target.role) && !requireRole(auth.profile, 'super_admin')) {
    return fail(403, 'Apenas super-admin pode editar admin/super-admin.');
  }

  // Validação dos novos valores
  const updates = {};
  const changes = {};

  if (body.full_name != null) {
    const v = String(body.full_name).trim();
    if (!v)            return fail(400, 'full_name não pode ser vazio.');
    if (v.length > 120) return fail(400, 'full_name muito longo.');
    if (v !== target.full_name) { updates.full_name = v; changes.full_name = { from: target.full_name, to: v }; }
  }

  if (body.status != null) {
    if (!['active','invited','disabled'].includes(body.status)) return fail(400, 'status inválido.');
    if (body.status !== target.status) { updates.status = body.status; changes.status = { from: target.status, to: body.status }; }
  }

  if (body.role != null) {
    if (!['client','editor','admin','super_admin'].includes(body.role)) return fail(400, 'role inválido.');
    // Promover/rebaixar para admin/super_admin requer super-admin
    if ((['admin','super_admin'].includes(body.role) || ['admin','super_admin'].includes(target.role))
        && !requireRole(auth.profile, 'super_admin')) {
      return fail(403, 'Mudança envolvendo admin/super-admin: apenas super-admin.');
    }
    if (body.role !== target.role) { updates.role = body.role; changes.role = { from: target.role, to: body.role }; }
  }

  // client_id obedece ao role efetivo após updates
  const effectiveRole = updates.role || target.role;
  let newClientId = body.client_id !== undefined ? body.client_id : target.client_id;
  if (effectiveRole === 'client') {
    if (!newClientId) return fail(400, 'client_id obrigatório para role=client.');
  } else {
    newClientId = null;
  }
  if (newClientId !== target.client_id) {
    updates.client_id = newClientId;
    changes.client_id = { from: target.client_id, to: newClientId };
  }

  if (Object.keys(updates).length === 0) {
    return ok({ unchanged: true, user_id: userId });
  }

  // Aplica update
  const { error: uErr } = await admin.from('users').update(updates).eq('id', userId);
  if (uErr) {
    console.error('[admin-update-user] update erro:', uErr);
    return fail(500, 'Erro ao atualizar: ' + uErr.message);
  }

  // Espelha status='disabled' no Supabase Auth (banimento de login)
  if (changes.status) {
    try {
      if (updates.status === 'disabled') {
        await admin.auth.admin.updateUserById(userId, { ban_duration: '876000h' }); // ~100 anos
      } else if (changes.status.from === 'disabled') {
        await admin.auth.admin.updateUserById(userId, { ban_duration: 'none' });
      }
    } catch (e) {
      console.warn('[admin-update-user] auth ban toggle falhou:', e && e.message);
    }
  }

  // Audit logs específicos
  if (changes.role) {
    await logAudit({
      actorId: auth.profile.id, action: 'role_changed',
      entityType: 'user', entityId: userId,
      metadata: { email: target.email, ...changes.role },
      ip: clientIp(event), userAgent: event.headers['user-agent']
    });
  }
  if (changes.status) {
    await logAudit({
      actorId: auth.profile.id, action: 'status_changed',
      entityType: 'user', entityId: userId,
      metadata: { email: target.email, ...changes.status },
      ip: clientIp(event), userAgent: event.headers['user-agent']
    });
  }
  if (changes.client_id) {
    await logAudit({
      actorId: auth.profile.id, action: 'user_client_changed',
      entityType: 'user', entityId: userId,
      metadata: { email: target.email, ...changes.client_id },
      ip: clientIp(event), userAgent: event.headers['user-agent']
    });
  }
  if (changes.full_name) {
    await logAudit({
      actorId: auth.profile.id, action: 'user_renamed',
      entityType: 'user', entityId: userId,
      metadata: { email: target.email, ...changes.full_name },
      ip: clientIp(event), userAgent: event.headers['user-agent']
    });
  }

  return ok({ updated: true, user_id: userId, changes: Object.keys(changes) });
};
