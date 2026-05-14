/**
 * Envio de e-mail transacional via Resend.
 * Variáveis de ambiente:
 *   RESEND_API_KEY      — chave da API Resend
 *   RESEND_FROM         — remetente formatado, ex: "IMO Insights <noreply@imoinsights.com.br>"
 *   SITE_URL            — URL pública do site (usada em links nos e-mails)
 *
 * Se RESEND_API_KEY não estiver definida, sendEmail registra um aviso e retorna
 * { skipped: true } sem quebrar — útil em desenvolvimento.
 */

async function sendEmail({ to, subject, html, text, replyTo }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from   = process.env.RESEND_FROM || 'IMO Insights <noreply@imoinsights.com.br>';

  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY ausente — pulando envio para', Array.isArray(to) ? to.join(',') : to);
    return { skipped: true };
  }
  if (!to || (Array.isArray(to) && !to.length)) return { skipped: true };

  const payload = {
    from: from,
    to: Array.isArray(to) ? to : [to],
    subject: subject || '(sem assunto)',
    html: html || undefined,
    text: text || undefined
  };
  if (replyTo) payload.reply_to = replyTo;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error('Resend retornou ' + res.status + ': ' + txt);
  }
  return res.json();
}

// ----------------------------------------------------------------------
// Templates
// Layout único: cabeçalho IMO + corpo + rodapé com link de descadastro
// (apenas onde aplicável).
// ----------------------------------------------------------------------

function siteUrl() {
  return (process.env.SITE_URL || 'https://imoinsights.com.br').replace(/\/+$/, '');
}

function shell({ title, intro, ctaLabel, ctaUrl, body, showUnsubscribe }) {
  const FOOT = showUnsubscribe
    ? `<tr><td style="padding:18px 28px;border-top:1px solid #1a1a2e;color:#777;font-size:11px;line-height:1.5;text-align:center;">
        Você recebeu este e-mail porque está cadastrado na Área do Cliente da IMO Insights.<br>
        Você pode desativar essas notificações em <a href="${siteUrl()}/area-cliente-perfil.html" style="color:#FF8000;">Perfil → Notificações</a>.
       </td></tr>`
    : `<tr><td style="padding:18px 28px;border-top:1px solid #1a1a2e;color:#777;font-size:11px;line-height:1.5;text-align:center;">
        IMO Insights · Pesquisa de mercado e brand tracking · ${siteUrl()}
       </td></tr>`;

  return `<!doctype html>
<html lang="pt-br"><head><meta charset="utf-8">
<title>${escapeHtml(title)}</title></head>
<body style="margin:0;background:#0f0f1a;font-family:Inter,Helvetica,Arial,sans-serif;color:#fff;">
  <table role="presentation" align="center" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#16162a;margin:24px auto;border:1px solid #2a2a3e;border-radius:10px;overflow:hidden;">
    <tr><td style="padding:24px 28px;border-bottom:1px solid #1a1a2e;">
      <span style="font-family:'Rethink Sans',Helvetica,Arial,sans-serif;font-size:18px;font-weight:800;letter-spacing:-.02em;color:#fff;">IMO Insights</span>
      <span style="font-size:11px;color:#FF8000;letter-spacing:.18em;text-transform:uppercase;margin-left:14px;">Área do Cliente</span>
    </td></tr>
    <tr><td style="padding:28px;">
      <h1 style="font-family:'Rethink Sans',Helvetica,Arial,sans-serif;font-size:24px;font-weight:800;color:#fff;margin:0 0 14px;letter-spacing:-.01em;">${escapeHtml(title)}</h1>
      ${intro ? `<p style="color:#bbb;font-size:15px;line-height:1.55;margin:0 0 18px;">${intro}</p>` : ''}
      ${body || ''}
      ${ctaUrl
        ? `<p style="margin:28px 0 8px;"><a href="${ctaUrl}" style="display:inline-block;background:#FF8000;color:#fff;padding:13px 24px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;font-size:13px;border-radius:6px;text-decoration:none;">${escapeHtml(ctaLabel || 'Acessar plataforma')}</a></p>
           <p style="font-size:11px;color:#777;margin:8px 0 0;">Se o botão não funcionar, copie e cole este link no navegador:<br><span style="color:#bbb;">${ctaUrl}</span></p>`
        : ''}
    </td></tr>
    ${FOOT}
  </table>
</body></html>`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// --- Templates concretos ---

function inviteTemplate({ fullName, role, link }) {
  const roleLabel = ({ client:'cliente', editor:'editor', admin:'administrador', super_admin:'super-administrador' })[role] || role;
  return {
    subject: 'Bem-vindo à IMO Insights — defina sua senha',
    html: shell({
      title: 'Você foi convidado para a Área do Cliente',
      intro: `Olá, ${escapeHtml(fullName || '')}. Foi criada uma conta para você como <strong style="color:#fff">${escapeHtml(roleLabel)}</strong> na plataforma da IMO Insights.`,
      body:  `<p style="color:#bbb;font-size:14px;line-height:1.55;">Para começar, defina sua senha no link abaixo. O link expira em 24 horas.</p>`,
      ctaLabel: 'Definir senha e acessar',
      ctaUrl:   link,
      showUnsubscribe: false
    }),
    text: `Você foi convidado à IMO Insights como ${roleLabel}.\nDefina sua senha em: ${link}\nO link expira em 24 horas.`
  };
}

function approvedTemplate({ slotName, projectName, link }) {
  return {
    subject: `Novo conteúdo aprovado — ${projectName}`,
    html: shell({
      title: 'Novo conteúdo disponível',
      intro: `O conteúdo <strong style="color:#fff">${escapeHtml(slotName)}</strong> do projeto <strong style="color:#fff">${escapeHtml(projectName)}</strong> foi aprovado e já está disponível na sua área do cliente.`,
      ctaLabel: 'Acessar o projeto',
      ctaUrl:   link,
      showUnsubscribe: true
    }),
    text: `Novo conteúdo aprovado: "${slotName}" no projeto "${projectName}".\nAcesse: ${link}`
  };
}

function rejectedTemplate({ slotName, projectName, notes, link }) {
  return {
    subject: `Submissão rejeitada — ${slotName}`,
    html: shell({
      title: 'Sua submissão foi rejeitada',
      intro: `O administrador rejeitou a submissão <strong style="color:#fff">${escapeHtml(slotName)}</strong> do projeto <strong style="color:#fff">${escapeHtml(projectName)}</strong>.`,
      body: `<div style="background:rgba(220,38,38,.08);border:1px solid rgba(255,118,118,.3);border-radius:6px;padding:14px 18px;margin:16px 0;color:#fff;font-size:14px;line-height:1.55;"><strong style="color:#ff7676;display:block;margin-bottom:6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;">Motivo</strong>${escapeHtml(notes || '')}</div><p style="color:#bbb;font-size:14px;line-height:1.55;">Você pode subir uma versão corrigida na área do editor.</p>`,
      ctaLabel: 'Reenviar versão',
      ctaUrl:   link,
      showUnsubscribe: false
    }),
    text: `Sua submissão "${slotName}" foi rejeitada.\nMotivo: ${notes}\nReenviar em: ${link}`
  };
}

function adminPendingDigestTemplate({ count, items, link }) {
  const list = items.slice(0, 10).map(it =>
    `<li style="margin:6px 0;color:#bbb;font-size:14px;line-height:1.5;">
       <strong style="color:#fff;">${escapeHtml(it.slot)}</strong>
       — ${escapeHtml(it.project)} · ${escapeHtml(it.client)}
     </li>`
  ).join('');
  return {
    subject: `IMO · ${count} submissão(ões) aguardando aprovação`,
    html: shell({
      title: 'Submissões aguardando você',
      intro: `Há <strong style="color:#fff">${count}</strong> submissão(ões) na fila de aprovação.`,
      body: `<ul style="padding-left:20px;margin:0 0 16px;">${list}</ul>${count > 10 ? `<p style="color:#777;font-size:12px;">…e mais ${count - 10}. Veja todas no painel.</p>` : ''}`,
      ctaLabel: 'Abrir fila',
      ctaUrl:   link,
      showUnsubscribe: false
    }),
    text: `Há ${count} submissão(ões) na fila. Painel: ${link}`
  };
}

function briefingTemplate({ nome, email, empresa, produto, mensagem, ip, userAgent }) {
  return {
    subject: `Novo briefing IMO · ${escapeHtml(nome || 'sem nome')}${empresa ? ' · ' + escapeHtml(empresa) : ''}`,
    html: shell({
      title: 'Novo briefing recebido',
      intro: `Um novo contato chegou pelo formulário de briefing do site.`,
      body: `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#0f0f1a;border:1px solid #2a2a3e;border-radius:8px;margin-top:18px;">
          <tr><td style="padding:18px 22px;color:#fff;font-size:14px;line-height:1.7;">
            <div style="margin-bottom:14px"><span style="display:inline-block;width:100px;color:#777;font-size:11px;letter-spacing:.1em;text-transform:uppercase;">Nome</span><strong style="color:#fff">${escapeHtml(nome || '—')}</strong></div>
            <div style="margin-bottom:14px"><span style="display:inline-block;width:100px;color:#777;font-size:11px;letter-spacing:.1em;text-transform:uppercase;">E-mail</span><a href="mailto:${escapeHtml(email || '')}" style="color:#FF8000;">${escapeHtml(email || '—')}</a></div>
            <div style="margin-bottom:14px"><span style="display:inline-block;width:100px;color:#777;font-size:11px;letter-spacing:.1em;text-transform:uppercase;">Empresa</span><strong style="color:#fff">${escapeHtml(empresa || '—')}</strong></div>
            <div style="margin-bottom:14px"><span style="display:inline-block;width:100px;color:#777;font-size:11px;letter-spacing:.1em;text-transform:uppercase;">Produto</span><strong style="color:#FF8000">${escapeHtml(produto || '—')}</strong></div>
          </td></tr>
        </table>
        ${mensagem ? `
        <div style="margin-top:18px;background:#1a1a2e;border-left:3px solid #FF8000;padding:16px 20px;color:#fff;font-size:14px;line-height:1.6;white-space:pre-wrap;">
          <div style="color:#777;font-size:11px;letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px;">Desafio</div>
          ${escapeHtml(mensagem)}
        </div>` : ''}
        <p style="color:#bbb;font-size:13px;line-height:1.55;margin-top:24px;">Responda direto para <a href="mailto:${escapeHtml(email || '')}" style="color:#FF8000;">${escapeHtml(email || '')}</a>. O Reply-To deste e-mail já está configurado.</p>
        ${ip ? `<p style="color:#666;font-size:11px;line-height:1.5;margin-top:18px;">Origem: ${escapeHtml(ip)} · ${escapeHtml((userAgent || '').slice(0,140))}</p>` : ''}
      `,
      showUnsubscribe: false
    }),
    text:
      'Novo briefing recebido pelo site IMO Insights\n\n' +
      'Nome: ' + (nome || '—') + '\n' +
      'E-mail: ' + (email || '—') + '\n' +
      'Empresa: ' + (empresa || '—') + '\n' +
      'Produto: ' + (produto || '—') + '\n' +
      (mensagem ? '\nDesafio:\n' + mensagem + '\n' : '') +
      (ip ? '\nOrigem: ' + ip : '')
  };
}

function loginOtpTemplate({ code, fullName, ip, userAgent }) {
  // Apresentação visual do código de 6 dígitos
  var spaced = String(code || '').split('').join(' ');
  return {
    subject: 'Seu código de acesso · IMO Insights',
    html: shell({
      title: 'Código de verificação',
      intro: (fullName ? 'Olá, ' + escapeHtml(fullName) + '. ' : '') +
             'Use o código abaixo para concluir seu login.',
      body: `
        <div style="background:#0f0f1a;border:1px solid #2a2a3e;border-radius:10px;padding:28px 0;margin:18px 0;text-align:center;">
          <div style="font-family:'Inconsolata',monospace,monospace;font-size:36px;font-weight:800;letter-spacing:.4em;color:#FF8000;">${spaced}</div>
          <div style="font-size:11px;color:#777;margin-top:10px;letter-spacing:.12em;text-transform:uppercase;">Válido por 10 minutos</div>
        </div>
        <p style="color:#bbb;font-size:13px;line-height:1.55;">Se você não tentou entrar agora, ignore este e-mail e considere trocar sua senha.</p>
        ${ip ? `<p style="color:#666;font-size:11px;line-height:1.5;margin-top:24px;">Solicitado por: ${escapeHtml(ip)} · ${escapeHtml((userAgent || '').slice(0,100))}</p>` : ''}
      `,
      showUnsubscribe: false
    }),
    text: `Seu código de acesso à IMO Insights: ${code}\nVálido por 10 minutos.`
  };
}

module.exports = {
  sendEmail,
  inviteTemplate,
  approvedTemplate,
  rejectedTemplate,
  adminPendingDigestTemplate,
  loginOtpTemplate,
  briefingTemplate
};
