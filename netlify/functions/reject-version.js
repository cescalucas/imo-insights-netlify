/**
 * POST /api/reject-version
 * Body: { version_id, notes }
 *
 * Apenas admin/super_admin. Marca status='rejected' com notes (mín. 10 chars).
 * Notifica o editor que enviou.
 */
const { getAdmin } = require('./_shared/supabase');
const { authenticate, requireRole, clientIp } = require('./_shared/auth');
const { logAudit } = require('./_shared/audit');
const { sendEmail, rejectedTemplate } = require('./_shared/email');
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
  const notes = (body.notes || '').trim();
  if (!versionId) return fail(400, 'version_id obrigatório');
  if (notes.length < 10) return fail(400, 'Motivo deve ter pelo menos 10 caracteres.');

  const admin = getAdmin();

  // Carrega contexto pré-rejeição (precisamos do uploaded_by para email)
  const { data: ctx, error: ctxErr } = await admin
    .from('file_versions')
    .select('id, version_number, status, uploaded_by, ' +
            'uploader:users!file_versions_uploaded_by_fkey(id, full_name, email), ' +
            'content_slots!inner(id, display_name, type, ' +
              'projects!inner(id, name, client_id, clients!inner(id, name)))')
    .eq('id', versionId)
    .single();

  if (ctxErr || !ctx) return fail(404, 'Versão não encontrada');
  if (ctx.status !== 'pending_approval') return fail(400, 'Versão não está pendente.');

  // Rejeição atômica via RPC
  const { error: rpcErr } = await admin.rpc('reject_file_version', {
    p_version_id:  versionId,
    p_reviewer_id: auth.profile.id,
    p_notes:       notes
  });
  if (rpcErr) {
    console.error('[reject-version] rpc error:', rpcErr);
    return fail(400, rpcErr.message || 'Erro ao rejeitar.');
  }

  const slot     = ctx.content_slots || {};
  const project  = slot.projects || {};
  const uploader = ctx.uploader || {};

  await logAudit({
    actorId: auth.profile.id,
    action:  'version_rejected',
    entityType: 'version',
    entityId:   versionId,
    metadata: {
      slot: slot.display_name,
      project: project.name,
      uploader_id: ctx.uploaded_by,
      version: ctx.version_number,
      notes_summary: notes.slice(0, 80)
    },
    ip:        clientIp(event),
    userAgent: event.headers['user-agent']
  });

  // Notifica editor
  if (uploader.email) {
    try {
      const link = (process.env.SITE_URL || '') + '/area-cliente-editor.html';
      const tpl  = rejectedTemplate({
        slotName:    slot.display_name,
        projectName: project.name,
        notes:       notes,
        link:        link
      });
      await sendEmail({ to: uploader.email, ...tpl });
    } catch (e) {
      console.warn('[reject-version] email não enviado:', e && e.message);
    }
  }

  return ok({ rejected: true, version_id: versionId });
};
