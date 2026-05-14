/**
 * POST /api/send-briefing
 *
 * Recebe o formulário de briefing do site público (contato.html) e envia
 * o conteúdo por e-mail para o time comercial via Resend.
 *
 * Não exige autenticação (form público). Defesas anti-spam:
 *   - Campo honeypot `rs-bot-field` (deve vir vazio)
 *   - Validação de e-mail e tamanho mínimo dos campos obrigatórios
 *   - Rate limit best-effort por IP em memória (até 3 envios / 10 min)
 *
 * Variáveis de ambiente:
 *   RESEND_API_KEY      — obrigatória (sem isso a função NÃO envia)
 *   BRIEFING_TO         — destinatário(s), separados por vírgula.
 *                         Default: contato@imoinsights.com.br
 *   RESEND_FROM         — remetente (default em _shared/email.js)
 */
const { sendEmail, briefingTemplate } = require('./_shared/email');
const { ok, fail } = require('./_shared/respond');

// Rate-limit best-effort em memória da Function (efêmero, mas ajuda).
const RATE_LIMIT = new Map(); // ip → [timestamp,...]
const WINDOW_MS  = 10 * 60 * 1000; // 10 min
const MAX_HITS   = 3;

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

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return fail(405, 'Método não permitido');

  let body;
  try {
    const ctype = (event.headers['content-type'] || event.headers['Content-Type'] || '').toLowerCase();
    if (ctype.includes('application/json')) {
      body = JSON.parse(event.body || '{}');
    } else {
      const params = new URLSearchParams(event.body || '');
      body = Object.fromEntries(params.entries());
    }
  } catch (err) {
    return fail(400, 'Payload inválido');
  }

  // Honeypot — bots tendem a preencher tudo
  if (body['rs-bot-field']) {
    // Finge sucesso para não dar pista ao bot
    return ok({ ok: true });
  }

  const nome     = (body.nome || '').toString().trim();
  const email    = (body.email || '').toString().trim();
  const empresa  = (body.empresa || '').toString().trim();
  const produto  = (body.produto || '').toString().trim();
  const mensagem = (body.msg || body.mensagem || '').toString().trim();

  if (nome.length < 2)  return fail(400, 'Informe um nome válido');
  if (!isEmail(email))  return fail(400, 'Informe um e-mail válido');
  if (nome.length > 200 || empresa.length > 200 || produto.length > 200 || mensagem.length > 4000) {
    return fail(413, 'Conteúdo muito grande');
  }

  const ip = clientIp(event);
  if (rateLimited(ip)) {
    return fail(429, 'Muitas tentativas. Aguarde alguns minutos.');
  }

  const userAgent = event.headers['user-agent'] || event.headers['User-Agent'] || '';
  const recipientsRaw = process.env.BRIEFING_TO || 'contato@imoinsights.com.br';
  const recipients = recipientsRaw.split(',').map(s => s.trim()).filter(Boolean);

  const tpl = briefingTemplate({ nome, email, empresa, produto, mensagem, ip, userAgent });

  try {
    await sendEmail({
      to: recipients,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      replyTo: email   // permite responder direto pro lead
    });
  } catch (err) {
    console.error('[send-briefing] falha ao enviar:', err && err.message);
    return fail(502, 'Falha ao enviar o briefing. Tente novamente em instantes.');
  }

  return ok({ ok: true });
};
