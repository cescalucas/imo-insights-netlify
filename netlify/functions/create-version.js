/**
 * POST /api/create-version
 * multipart/form-data fields:
 *   file              — arquivo binário (max 50 MB)
 *   project_id        — UUID do projeto
 *   mode              — "new" ou "version"
 *   slot_id           — (mode=version) UUID do slot existente
 *   type              — (mode=new) "document" | "dashboard"
 *   display_name      — (mode=new)
 *   description       — (mode=new, opcional)
 *
 * Apenas editor/admin/super_admin. A versão é sempre criada com
 * status='pending_approval' e is_current=false.
 */
const { getAdmin } = require('./_shared/supabase');
const { authenticate, requireRole, clientIp } = require('./_shared/auth');
const { logAudit } = require('./_shared/audit');
const { parseMultipart } = require('./_shared/multipart');
const { ok, fail } = require('./_shared/respond');

const MAX_BYTES = 50 * 1024 * 1024;

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return fail(405, 'Método não permitido');

  const auth = await authenticate(event);
  if (auth.error) return fail(auth.status, auth.error);
  if (!requireRole(auth.profile, 'editor')) return fail(403, 'Apenas editores ou superior.');

  // --- Parse multipart
  let parsed;
  try { parsed = await parseMultipart(event); }
  catch (e) { return fail(400, 'multipart inválido: ' + e.message); }

  const fields = parsed.fields || {};
  const file   = (parsed.files || [])[0];
  if (!file)                      return fail(400, 'Arquivo obrigatório.');
  if (file.error === 'truncated') return fail(413, 'Arquivo excede 60 MB.');
  if (!file.buffer || !file.buffer.length) return fail(400, 'Arquivo vazio.');
  if (file.size > MAX_BYTES)      return fail(413, 'Arquivo excede 50 MB.');

  const projectId = fields.project_id;
  const mode      = fields.mode === 'version' ? 'version' : 'new';
  if (!projectId) return fail(400, 'project_id obrigatório.');

  const admin = getAdmin();

  // Valida projeto
  const { data: project, error: pErr } = await admin
    .from('projects')
    .select('id, client_id, status')
    .eq('id', projectId)
    .single();
  if (pErr || !project) return fail(404, 'Projeto não encontrado');
  if (project.status === 'archived') return fail(400, 'Projeto arquivado.');

  let slotId, slotType, slotDisplayName;

  if (mode === 'version') {
    slotId = fields.slot_id;
    if (!slotId) return fail(400, 'slot_id obrigatório no modo "version".');
    const { data: slot, error: sErr } = await admin
      .from('content_slots')
      .select('id, project_id, type, display_name, archived')
      .eq('id', slotId)
      .single();
    if (sErr || !slot)              return fail(404, 'Slot não encontrado');
    if (slot.project_id !== projectId) return fail(400, 'Slot não pertence ao projeto.');
    if (slot.archived)              return fail(400, 'Slot arquivado.');
    slotType = slot.type;
    slotDisplayName = slot.display_name;
  } else {
    // mode === 'new'  — cria slot
    const type = fields.type === 'dashboard' ? 'dashboard' : 'document';
    const display = (fields.display_name || '').trim();
    const description = (fields.description || '').trim() || null;
    if (!display) return fail(400, 'display_name obrigatório.');
    if (display.length > 160) return fail(400, 'display_name muito longo.');

    const { data: newSlot, error: nsErr } = await admin
      .from('content_slots')
      .insert({
        project_id: projectId,
        type:       type,
        display_name: display,
        description: description,
        archived: false
      })
      .select('id, type, display_name')
      .single();
    if (nsErr || !newSlot) {
      console.error('[create-version] slot insert error:', nsErr);
      return fail(500, 'Erro ao criar slot: ' + (nsErr && nsErr.message));
    }
    slotId = newSlot.id;
    slotType = newSlot.type;
    slotDisplayName = newSlot.display_name;

    await logAudit({
      actorId: auth.profile.id,
      action: 'slot_created',
      entityType: 'slot',
      entityId: slotId,
      metadata: { display_name: slotDisplayName, type: slotType, project_id: projectId },
      ip: clientIp(event),
      userAgent: event.headers['user-agent']
    });
  }

  // --- Calcula próximo version_number e storage path
  const { data: maxResp } = await admin
    .from('file_versions')
    .select('version_number')
    .eq('slot_id', slotId)
    .order('version_number', { ascending: false })
    .limit(1);
  const nextVersion = (maxResp && maxResp[0] ? maxResp[0].version_number : 0) + 1;

  const safeName = (file.name || 'arquivo').replace(/[^\w\-. ]+/g, '_').slice(0, 100);
  const storagePath = `content/${projectId}/${slotId}/v${nextVersion}-${Date.now()}-${safeName}`;

  // --- Upload no Storage
  const { error: upErr } = await admin
    .storage
    .from('content')
    .upload(storagePath, file.buffer, {
      contentType: file.mime || 'application/octet-stream',
      upsert: false
    });

  if (upErr) {
    console.error('[create-version] storage upload error:', upErr);
    return fail(500, 'Erro ao subir arquivo: ' + upErr.message);
  }

  // --- Insere file_version (status pendente, is_current false)
  const { data: fv, error: fvErr } = await admin
    .from('file_versions')
    .insert({
      slot_id:        slotId,
      version_number: nextVersion,
      storage_path:   storagePath,
      mime_type:      file.mime || null,
      size_bytes:     file.size,
      status:         'pending_approval',
      is_current:     false,
      uploaded_by:    auth.profile.id
    })
    .select('id, version_number, status')
    .single();

  if (fvErr || !fv) {
    // Rollback do upload (best-effort)
    try { await admin.storage.from('content').remove([storagePath]); } catch {}
    console.error('[create-version] insert error:', fvErr);
    return fail(500, 'Erro ao registrar versão: ' + (fvErr && fvErr.message));
  }

  await logAudit({
    actorId: auth.profile.id,
    action: 'version_uploaded',
    entityType: 'version',
    entityId: fv.id,
    metadata: {
      slot_id: slotId,
      slot: slotDisplayName,
      version: fv.version_number,
      mode: mode,
      size_bytes: file.size
    },
    ip: clientIp(event),
    userAgent: event.headers['user-agent']
  });

  return ok({
    created: true,
    version: { id: fv.id, version_number: fv.version_number, status: fv.status, slot_id: slotId }
  });
};
