/**
 * POST /api/audit-log
 * Body: { action, entity_type?, entity_id?, metadata? }
 *
 * Endpoint genérico para o front registrar ações que não passam por outras
 * Functions (ex.: criação de cliente/projeto via Supabase direto).
 *
 * Apenas admin pode usar.
 * Lista de ações válidas é fechada para evitar lixo no log.
 */
const { authenticate, requireRole, clientIp } = require('./_shared/auth');
const { logAudit } = require('./_shared/audit');
const { ok, fail } = require('./_shared/respond');

const VALID_ACTIONS = new Set([
  'client_created', 'client_updated',
  'project_created', 'project_updated', 'project_archived',
  'slot_archived',
  'admin_action_other'
]);

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return fail(405, 'Método não permitido');

  const auth = await authenticate(event);
  if (auth.error) return fail(auth.status, auth.error);
  if (!requireRole(auth.profile, 'admin')) return fail(403, 'Apenas administradores.');

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return fail(400, 'JSON inválido'); }

  const action = body.action;
  if (!action || !VALID_ACTIONS.has(action)) return fail(400, 'Ação inválida.');

  await logAudit({
    actorId:    auth.profile.id,
    action:     action,
    entityType: body.entity_type || null,
    entityId:   body.entity_id   || null,
    metadata:   body.metadata    || {},
    ip:         clientIp(event),
    userAgent:  event.headers['user-agent']
  });

  return ok({ logged: true });
};
