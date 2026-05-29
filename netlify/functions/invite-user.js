/**
 * POST /api/invite-user
 *
 * Modo "novo convite":
 *   body: { full_name, email, role, client_id? }
 *
 * Modo "reenviar convite":
 *   body: { resend_for: <user_id> }
 *
 * Permissões:
 *   admin pode convidar/reenviar para client e editor.
 *   Apenas super_admin pode convidar/promover para admin ou super_admin.
 *
 * Cria auth.users via admin API + insere public.users + dispara
 * link de definição de senha (Supabase Auth Admin API).
 */
const { getAdmin } = require('./_shared/supabase');
const { authenticate, requireRole, clientIp } = require('./_shared/auth');
const { logAudit } = require('./_shared/audit');
const { sendEmail, inviteTemplate } = require('./_shared/email');
const { ok, fail } = require('./_shared/respond');

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return fail(405, 'Método não permitido');

  const auth = await authenticate(event);
  if (auth.error) return fail(auth.status, auth.error);
  if (!requireRole(auth.profile, 'admin')) return fail(403, 'Apenas administradores.');

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return fail(400, 'JSON inválido'); }

  const admin = getAdmin();
  const siteUrl = (process.env.SITE_URL || '').replace(/\/+$/, '');
  const redirectTo = siteUrl + '/definir-senha.html';

  // ----------- Reenviar convite -----------
  if (body.resend_for) {
    const userId = body.resend_for;
    const { data: target, error: tErr } = await admin
      .from('users')
      .select('id, email, full_name, role, status')
      .eq('id', userId)
      .single();
    if (tErr || !target) return fail(404, 'Usuário não encontrado');

    // Permissão para reenviar admin/super_admin: só super_admin
    if (['admin','super_admin'].includes(target.role) && !requireRole(auth.profile, 'super_admin')) {
      return fail(403, 'Apenas super-admin pode reenviar convite a admin/super-admin.');
    }

    try {
      const { error: lErr } = await admin.auth.admin.inviteUserByEmail(target.email, { redirectTo });
      if (lErr) {
        // Se usuário já existe (re-convite), gera link manualmente:
        const { data: link, error: gErr } = await admin.auth.admin.generateLink({
          type: 'recovery',
          email: target.email,
          options: { redirectTo }
        });
        if (gErr) throw gErr;
        const url = link && link.properties && link.properties.action_link;
        if (url) {
          const tpl = inviteTemplate({ fullName: target.full_name, role: target.role, link: url });
          await sendEmail({ to: target.email, ...tpl });
        }
      }
    } catch (e) {
      console.error('[invite-user resend] erro:', e);
      return fail(500, 'Erro ao reenviar: ' + e.message);
    }

    await logAudit({
      actorId: auth.profile.id, action: 'invite_sent',
      entityType: 'user', entityId: userId,
      metadata: { email: target.email, resent: true },
      ip: clientIp(event), userAgent: event.headers['user-agent']
    });

    return ok({ resent: true, email: target.email });
  }

  // ----------- Novo convite -----------
  const fullName = (body.full_name || '').trim();
  const email    = (body.email || '').trim().toLowerCase();
  const role     = body.role;
  const clientId = body.client_id || null;

  if (!fullName) return fail(400, 'full_name obrigatório.');
  if (!email || !/.+@.+\..+/.test(email)) return fail(400, 'E-mail inválido.');
  if (!['client','editor','admin','super_admin'].includes(role)) return fail(400, 'role inválido.');
  if (role === 'client' && !clientId) return fail(400, 'client_id obrigatório para role=client.');
  if (role !== 'client' && clientId) return fail(400, 'client_id deve ser null para roles internos.');
  if (['admin','super_admin'].includes(role) && !requireRole(auth.profile, 'super_admin')) {
    return fail(403, 'Apenas super-admin pode convidar admin/super-admin.');
  }

  // Verifica se cliente existe (quando aplicável)
  if (clientId) {
    const { data: cl, error: cErr } = await admin
      .from('clients').select('id, status').eq('id', clientId).single();
    if (cErr || !cl) return fail(400, 'Cliente não encontrado.');
    if (cl.status !== 'active') return fail(400, 'Cliente está inativo.');
  }

  // Verifica duplicata
  const { data: existing } = await admin
    .from('users').select('id, email').eq('email', email).maybeSingle();
  if (existing) return fail(409, 'Já existe usuário com esse e-mail.');

  // 1) Cria auth.users via admin API
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email: email,
    email_confirm: false,
    user_metadata: { full_name: fullName }
  });
  if (cErr || !created || !created.user) {
    console.error('[invite-user] createUser error:', cErr);
    return fail(500, cErr && cErr.message || 'Erro ao criar usuário no Auth.');
  }
  const newUserId = created.user.id;

  // 2) Grava em public.users (status='invited' até primeiro acesso).
  //    Usamos UPSERT porque a trigger on_auth_user_created já pode ter criado
  //    um placeholder (role='editor', status='disabled') ao inserir o auth.users.
  const { error: uiErr } = await admin
    .from('users')
    .upsert({
      id: newUserId,
      email: email,
      full_name: fullName,
      role: role,
      client_id: clientId,
      status: 'invited',
      notify_by_email: role === 'client'
    }, { onConflict: 'id' });
  if (uiErr) {
    // Rollback do auth.users
    try { await admin.auth.admin.deleteUser(newUserId); } catch {}
    console.error('[invite-user] users insert error:', uiErr);
    return fail(500, 'Erro ao criar perfil: ' + uiErr.message);
  }

  // 3) Gera link de invite e envia e-mail customizado
  let inviteUrl = null;
  try {
    const { data: linkData, error: lErr } = await admin.auth.admin.generateLink({
      type: 'invite',
      email: email,
      options: { redirectTo, data: { full_name: fullName } }
    });
    if (lErr) throw lErr;
    inviteUrl = linkData && linkData.properties && linkData.properties.action_link;
  } catch (e) {
    console.warn('[invite-user] generateLink falhou, fallback para inviteUserByEmail:', e && e.message);
    try { await admin.auth.admin.inviteUserByEmail(email, { redirectTo }); } catch {}
  }

  if (inviteUrl) {
    try {
      const tpl = inviteTemplate({ fullName: fullName, role: role, link: inviteUrl });
      await sendEmail({ to: email, ...tpl });
    } catch (e) {
      console.warn('[invite-user] email não enviado:', e && e.message);
    }
  }

  await logAudit({
    actorId: auth.profile.id, action: 'invite_sent',
    entityType: 'user', entityId: newUserId,
    metadata: { email: email, role: role, client_id: clientId },
    ip: clientIp(event), userAgent: event.headers['user-agent']
  });

  return ok({ invited: true, user_id: newUserId, email: email });
};
