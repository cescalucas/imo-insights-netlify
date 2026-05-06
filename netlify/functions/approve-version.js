/**
 * POST /api/approve-version
 * Body: { version_id, notes? }
 *
 * Apenas admin/super_admin. Chama a stored procedure atômica
 * approve_file_version() que:
 *   - exige status='pending_approval'
 *   - arquiva a versão atual do slot (se houver)
 *   - promove a nova como is_current=true, status='approved'
 *
 * Notifica por e-mail os usuários do cliente que optaram por receber.
 */
const { getAdmin } = require('./_shared/supabase');
const { authenticate, requireRole, clientIp } = require('./_shared/auth');
const { logAudit } = require('./_shared/audit');
const { sendEmail, approvedTemplate } = require('./_shared/email');
const { ok, fail } = require('./_shared/respond');

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return fail(405, 'Método não permitido');

  const auth = await authenticate(event);
  if (auth.error) return fail(auth.status, auth.error);
  if (!requireRole(auth.profile, 'admin')) return fail(403, 'Apenas administradores.');

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return fail(400, 'JSON inválido'); }

  const versionId = body.version_id;
  if (!versionId) return fail(400, 'version_id obrigatório');

  const admin = getAdmin();

  // Aprovação atômica via RPC
  const { error: rpcErr } = await admin.rpc('approve_file_version', {
    p_version_id:  versionId,
    p_reviewer_id: auth.profile.id,
    p_notes:       body.notes || null
  });
  if (rpcErr) {
    console.error('[approve-version] rpc error:', rpcErr);
    return fail(400, rpcErr.message || 'Erro ao aprovar.');
  }

  // Carrega contexto pra audit + e-mail
  const { data: ctx } = await admin
    .from('file_versions')
    .select('id, version_number, ' +
            'content_slots!inner(id, display_name, type, ' +
              'projects!inner(id, name, client_id, ' +
                'clients!inner(id, name)))')
    .eq('id', versionId)
    .single();

  const slot     = ctx && ctx.content_slots || {};
  const project  = slot.projects || {};
  const clientCo = project.clients || {};

  await logAudit({
    actorId: auth.profile.id,
    action:  'version_approved',
    entityType: 'version',
    entityId:   versionId,
    metadata: {
      slot:    slot.display_name,
      project: project.name,
      client:  clientCo.name,
      version: ctx && ctx.version_number
    },
    ip:        clientIp(event),
    userAgent: event.headers['user-agent']
  });

  // Notifica clientes
  if (project.client_id) {
    try {
      const { data: notifyUsers } = await admin
        .from('users')
        .select('email, full_name, notify_by_email')
        .eq('client_id', project.client_id)
        .eq('status', 'active')
        .eq('notify_by_email', true);

      if (notifyUsers && notifyUsers.length) {
        const link = (process.env.SITE_URL || '') + '/area-cliente-projeto.html?id=' + encodeURIComponent(project.id);
        const tpl  = approvedTemplate({
          slotName:    slot.display_name,
          projectName: project.name,
          link:        link
        });
        await sendEmail({ to: notifyUsers.map(u => u.email), ...tpl });
      }
    } catch (e) {
      // E-mail é "best effort": loga mas não quebra
      console.warn('[approve-version] email não enviado:', e && e.message);
    }
  }

  return ok({ approved: true, version_id: versionId });
};
