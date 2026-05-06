/**
 * Insere uma entrada em audit_logs. Falha silenciosa: jamais quebra
 * o fluxo principal (audit é "best effort").
 *
 * Ações canônicas registradas:
 *   login, logout, invite_sent, role_changed, status_changed,
 *   client_created, client_updated, project_created, project_updated,
 *   slot_created, slot_archived, version_uploaded, version_approved,
 *   version_rejected, download, preview, password_reset_requested,
 *   consent_given.
 */
const { getAdmin } = require('./supabase');

async function logAudit({ actorId, action, entityType, entityId, metadata, ip, userAgent }) {
  if (!action) return;
  try {
    const admin = getAdmin();
    await admin.from('audit_logs').insert({
      actor_id:    actorId    || null,
      action:      action,
      entity_type: entityType || null,
      entity_id:   entityId   || null,
      metadata:    metadata   || {},
      ip_address:  ip         || null,
      user_agent:  userAgent  || null
    });
  } catch (e) {
    console.error('[audit] insert failed:', e && e.message);
  }
}

module.exports = { logAudit };
