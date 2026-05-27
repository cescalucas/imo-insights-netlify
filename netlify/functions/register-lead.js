/**
 * POST /api/register-lead
 *
 * Recebe leads do site público e grava na tabela `leads` do Supabase
 * (via service_role, que bypassa RLS). Usado por três fluxos:
 *   - source="download"   → modal de download de estudo (assets/js/request-study.js)
 *   - source="contato"    → o form de contato grava direto na própria Function
 *                           send-briefing; este endpoint atende o fluxo de download.
 *   - source="newsletter" → landing da Curanews (imo-news-landing.html): captura
 *                           nome, e-mail, empresa (→ company) e cargo (→ product).
 *
 * Não exige autenticação (endpoint público). Defesas anti-spam:
 *   - Honeypot `rs-bot-field` (deve vir vazio)
 *   - Validação de e-mail e tamanho dos campos
 *   - Rate limit best-effort por IP em memória
 *
 * Variáveis de ambiente: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (já usadas pelas demais Functions).
 */
const { getAdmin } = require('./_shared/supabase');
const { ok, fail } = require('./_shared/respond');

const RATE_LIMIT = new Map(); // ip → [timestamps]
const WINDOW_MS  = 10 * 60 * 1000;
const MAX_HITS   = 8;

function clientIp(event) {
  const h = event.headers || {};
  return (h['x-nf-client-connection-ip'] ||
          h['x-forwarded-for'] ||
          h['client-ip'] || '').split(',')[0].trim();
}

function rateLimited(ip) {
  if (!ip) return false;
  const now = Date.now();
  const list = (RATE_LIMIT.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (list.length >= MAX_HITS) return true;
  list.push(now);
  RATE_LIMIT.set(ip, list);
  return false;
}

function isEmail(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 200;
}

function clip(v, max) {
  const s = (v == null ? '' : String(v)).trim();
  return s.length > max ? s.slice(0, max) : s;
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return fail(405, 'Método não permitido');

  let body;
  try {
    const ctype = (event.headers['content-type'] || event.headers['Content-Type'] || '').toLowerCase();
    if (ctype.includes('application/json')) {
      body = JSON.parse(event.body || '{}');
    } else {
      body = Object.fromEntries(new URLSearchParams(event.body || '').entries());
    }
  } catch (err) {
    return fail(400, 'Payload inválido');
  }

  // Honeypot — finge sucesso para não dar pista ao bot
  if (body['rs-bot-field']) return ok({ ok: true });

  const source = (body.source || 'download').toString().trim();
  if (!['download', 'contato', 'newsletter'].includes(source)) {
    return fail(400, 'Origem inválida');
  }

  const name  = clip(body.nome || body.name, 200);
  const email = clip(body.email, 200);
  if (name.length < 2) return fail(400, 'Informe um nome válido');
  if (!isEmail(email)) return fail(400, 'Informe um e-mail válido');

  const ip = clientIp(event);
  if (rateLimited(ip)) return fail(429, 'Muitas tentativas. Aguarde alguns minutos.');

  // Aliases dos formulários do RD Station (cf_empresa, cf_cargo) também são aceitos
  // para que o form da Curanews funcione sem precisar renomear campos no HTML.
  const lead = {
    source,
    name,
    email,
    company:     clip(body.empresa || body.company || body.cf_empresa, 200) || null,
    product:     clip(body.produto || body.product || body.cargo || body.cf_cargo, 200) || null,
    study_id:    clip(body['study-id'] || body.study_id, 100) || null,
    study_title: clip(body['study-title'] || body.study_title, 300) || null,
    message:     clip(body.msg || body.mensagem || body.message, 4000) || null,
    ip_address:  ip || null,
    user_agent:  clip(event.headers['user-agent'] || event.headers['User-Agent'], 500) || null
  };

  try {
    const admin = getAdmin();
    const { error } = await admin.from('leads').insert(lead);
    if (error) throw error;
  } catch (err) {
    console.error('[register-lead] falha ao gravar:', err && err.message);
    return fail(502, 'Não foi possível registrar o contato agora.');
  }

  return ok({ ok: true });
};
