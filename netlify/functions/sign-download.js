/**
 * POST /api/sign-download
 * Body: { version_id, preview? }
 *
 * Gera URL assinada do bucket privado 'content' com expiração de 5 minutos.
 * Validação:
 *   - cliente: só pode baixar versões approved/archived de slots do próprio client_id
 *   - editor:  pode pré-visualizar qualquer versão (qualquer status)
 *   - admin:   tudo
 * Registra em audit_logs como 'download' (cliente) ou 'preview' (editor/admin).
 */
const { getAdmin } = require('./_shared/supabase');
const { authenticate, clientIp } = require('./_shared/auth');
const { logAudit } = require('./_shared/audit');
const { ok, fail } = require('./_shared/respond');

const SIGNED_URL_TTL = 300; // 5 minutos

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return fail(405, 'Método não permitido');

  const auth = await authenticate(event);
  if (auth.error) return fail(auth.status, auth.error);
  const { profile } = auth;

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return fail(400, 'JSON inválido'); }

  const versionId = body.version_id;
  if (!versionId) return fail(400, 'version_id obrigatório');

  const admin = getAdmin();

  // Carrega versão + slot + projeto
  const { data: v, error } = await admin
    .from('file_versions')
    .select('id, slot_id, status, is_current, storage_path, mime_type, ' +
            'content_slots!inner(id, project_id, type, display_name, archived, ' +
              'projects!inner(id, name, client_id, status))')
    .eq('id', versionId)
    .single();

  if (error || !v) return fail(404, 'Versão não encontrada');

  const slot    = v.content_slots;
  const project = slot.projects;

  // Authorização por papel
  if (profile.role === 'client') {
    if (project.client_id !== profile.client_id)         return fail(403, 'Sem acesso a este projeto');
    if (project.status !== 'active')                     return fail(403, 'Projeto não está ativo');
    if (slot.archived)                                   return fail(403, 'Conteúdo arquivado');
    if (!['approved','archived'].includes(v.status))     return fail(403, 'Versão indisponível');
  }
  // editor/admin/super_admin: passa

  // Gera URL assinada
  const { data: signed, error: sErr } = await admin
    .storage
    .from('content')
    .createSignedUrl(v.storage_path, SIGNED_URL_TTL);

  if (sErr || !signed || !signed.signedUrl) {
    console.error('[sign-download] signedUrl error:', sErr);
    return fail(500, 'Erro ao gerar URL assinada');
  }

  // Audit
  await logAudit({
    actorId: profile.id,
    action:  profile.role === 'client' ? 'download' : 'preview',
    entityType: 'version',
    entityId:   versionId,
    metadata:  {
      slot:        slot.display_name,
      project:     project.name,
      project_id:  project.id,
      slot_type:   slot.type,
      version_status: v.status
    },
    ip:        clientIp(event),
    userAgent: event.headers['user-agent']
  });

  // Sugere um filename amigável
  const ext = mimeToExt(v.mime_type) || guessExtFromPath(v.storage_path);
  const baseName = (slot.display_name || 'arquivo').replace(/[^\w\-. ]+/g, '_').slice(0, 80);
  const filename = baseName + (ext ? ('.' + ext) : '');

  return ok({
    url:      signed.signedUrl,
    filename: filename,
    expires_in: SIGNED_URL_TTL
  });
};

function mimeToExt(mime) {
  if (!mime) return null;
  const map = {
    'application/pdf': 'pdf',
    'text/html': 'html',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'image/png': 'png', 'image/jpeg': 'jpg', 'text/csv': 'csv'
  };
  return map[mime] || null;
}
function guessExtFromPath(p) {
  const m = /\.([a-z0-9]+)$/i.exec(p || '');
  return m ? m[1].toLowerCase() : null;
}
