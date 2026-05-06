# IMO Insights — Site institucional + Área do Cliente

Site institucional estático da IMO Insights com **área logada de clientes** integrada via Supabase + Netlify Functions.

- **Site público**: HTML/CSS/JS puro, sem build step. Continua intacto após esta entrega.
- **Área logada** (`/area-cliente*`, `/login.html`, `/recuperar-senha.html`, `/definir-senha.html`, `/privacidade.html`): autenticada por Supabase Auth, dados em Postgres com RLS, arquivos em Storage privado.
- **Endpoints sensíveis** (aprovação, download assinado, convites, OTP por e-mail) em Netlify Functions com `service_role`, validando JWT do Supabase.
- **2FA universal**: todos os usuários recebem código de 6 dígitos por e-mail no login. Concessão válida por 8 h.

---

## Sumário

1. [Stack](#stack)
2. [Estrutura de pastas](#estrutura-de-pastas)
3. [Variáveis de ambiente](#variáveis-de-ambiente)
4. [Setup passo-a-passo](#setup-passo-a-passo)
5. [Desenvolvimento local com Supabase CLI](#desenvolvimento-local-com-supabase-cli)
6. [Como criar o primeiro super-administrador](#como-criar-o-primeiro-super-administrador)
7. [Configurar Resend (e-mail transacional)](#configurar-resend-e-mail-transacional)
8. [Desativar Netlify Identity](#desativar-netlify-identity)
9. [Fluxos de autenticação](#fluxos-de-autenticação)
10. [Papéis e permissões](#papéis-e-permissões)
11. [Manutenção: limpeza de OTPs antigos](#manutenção-limpeza-de-otps-antigos)
12. [Checklist de aceitação](#checklist-de-aceitação)
13. [Troubleshooting](#troubleshooting)

---

## Stack

| Camada                                    | Tecnologia                                    |
| ----------------------------------------- | --------------------------------------------- |
| Site público + área logada                | HTML/CSS/JS puro, sem framework               |
| Autenticação                              | Supabase Auth (e-mail + senha) + OTP por e-mail (custom) |
| Banco de dados                            | Supabase Postgres com RLS                     |
| Armazenamento de arquivos                 | Supabase Storage (bucket privado `content`)   |
| Endpoints sensíveis                       | Netlify Functions (Node 20, esbuild)          |
| E-mail transacional                       | Resend                                        |
| Deploy                                    | Netlify                                       |

---

## Estrutura de pastas

```
.
├── index.html, sobre.html, ...        # Site público (intocado)
├── login.html                          # Auth: e-mail/senha + OTP
├── recuperar-senha.html                # Reset de senha por e-mail
├── definir-senha.html                  # Define senha (recovery + invite)
├── area-cliente.html                   # Dashboard do cliente
├── area-cliente-projeto.html           # Detalhe do projeto + histórico
├── area-cliente-perfil.html            # Perfil + LGPD
├── area-cliente-editor.html            # Editor: submissões e uploads
├── area-cliente-admin.html             # Admin: aprovação, CRUDs, auditoria
├── privacidade.html                    # Política de Privacidade (LGPD)
├── styles.css                          # CSS do site
├── assets/
│   └── js/
│       ├── env-config.js               # ⚠ EDITAR antes do deploy
│       ├── supabase-client.js
│       ├── role-helpers.js
│       └── session-guard.js
├── netlify.toml                        # config Netlify (build + headers)
├── _redirects                          # /api/* → /.netlify/functions/*
├── package.json                        # deps das Functions
├── netlify/
│   └── functions/
│       ├── _shared/
│       │   ├── supabase.js             # client com service_role
│       │   ├── auth.js                 # validação JWT + roles
│       │   ├── audit.js
│       │   ├── email.js                # Resend + templates
│       │   ├── multipart.js            # parser de upload
│       │   ├── otp.js                  # geração/hash de códigos
│       │   └── respond.js
│       ├── sign-download.js
│       ├── approve-version.js
│       ├── reject-version.js
│       ├── create-version.js
│       ├── invite-user.js
│       ├── admin-update-user.js
│       ├── audit-log.js
│       ├── confirm-consent.js
│       ├── request-email-otp.js
│       ├── verify-email-otp.js
│       └── check-mfa.js
└── supabase/
    ├── migrations/
    │   ├── 0001_init.sql               # schema, RLS, triggers, RPCs
    │   └── 0002_email_otp_2fa.sql      # 2FA por e-mail
    └── seed.sql                        # dados de teste
```

---

## Variáveis de ambiente

Cadastre no painel Netlify (**Site settings → Environment variables**):

| Nome                          | Onde é usada              | Exposta ao front? | Descrição                                                            |
| ----------------------------- | ------------------------- | ----------------- | -------------------------------------------------------------------- |
| `SUPABASE_URL`                | Functions + front         | Sim (anon)        | `https://xxxxx.supabase.co`                                          |
| `SUPABASE_ANON_KEY`           | Functions + front         | Sim               | Chave pública anônima. Segurança vem do RLS.                          |
| `SUPABASE_SERVICE_ROLE_KEY`   | Functions                 | **Nunca**         | Chave admin. Bypassa RLS. Mantenha SECRETA.                           |
| `RESEND_API_KEY`              | Functions                 | **Nunca**         | Chave Resend para envio de e-mails.                                   |
| `RESEND_FROM`                 | Functions                 | Não               | Ex.: `IMO Insights <noreply@imoinsights.com.br>`                      |
| `SITE_URL`                    | Functions + front         | Sim               | URL pública do site, sem barra final. Ex.: `https://imoinsights.com.br` |

Para o front estático ler `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SITE_URL`, **edite manualmente** o arquivo `assets/js/env-config.js` substituindo os 3 placeholders `__SUPABASE_URL__`, `__SUPABASE_ANON_KEY__` e `__SITE_URL__` pelos valores reais. Como a chave anônima é por design pública, é seguro committá-la.

> Alternativa: configurar um build hook do Netlify que rode `sed` substituindo os placeholders a partir das env vars no momento do build. Veja seção [Troubleshooting](#troubleshooting) → "Injeção automática".

---

## Setup passo-a-passo

### 1. Criar projeto Supabase

1. Crie um novo projeto em [supabase.com](https://supabase.com).
2. Anote `Project URL`, `anon key` e `service_role key` (Settings → API).
3. Em **Authentication → URL Configuration**:
   - **Site URL**: `https://seu-dominio-netlify.netlify.app` (ou domínio próprio).
   - **Redirect URLs**: adicione `https://seu-dominio/definir-senha.html`.
4. Em **Authentication → Providers → Email**: deixe ativado.
5. Em **Authentication → Policies → Password**: mínimo de **10 caracteres**.

### 2. Aplicar migrations e seed

Instale a [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started):

```bash
brew install supabase/tap/supabase   # macOS
# ou
npm install -g supabase
```

Vincule a CLI ao seu projeto:

```bash
supabase login
supabase link --project-ref <ref-do-projeto>
```

Aplique as migrations:

```bash
supabase db push
```

Para popular dados de exemplo (apenas em projetos de desenvolvimento):

```bash
supabase db reset      # roda migrations + seed.sql do zero
```

⚠ **Não rode `db reset` em produção** — apaga todos os dados.

Verifique no painel Supabase → Table Editor que existem as tabelas: `clients`, `users`, `projects`, `content_slots`, `file_versions`, `audit_logs`, `email_otp_codes`, `mfa_grants`. Em Storage, deve existir o bucket privado `content`.

### 3. Configurar Resend

Veja a seção [Configurar Resend](#configurar-resend-e-mail-transacional).

### 4. Cadastrar env vars no Netlify

No painel Netlify do site, vá em **Site settings → Environment variables** e adicione todas as 6 variáveis listadas em [Variáveis de ambiente](#variáveis-de-ambiente).

### 5. Editar `assets/js/env-config.js`

Abra o arquivo e substitua os 3 placeholders. Faça commit.

### 6. Desativar Netlify Identity

Veja a seção [Desativar Netlify Identity](#desativar-netlify-identity).

### 7. Deploy

```bash
git add -A
git commit -m "feat: área logada com Supabase + 2FA por e-mail"
git push
```

O Netlify faz o deploy automaticamente.

### 8. Criar o primeiro super-administrador

Veja [Como criar o primeiro super-administrador](#como-criar-o-primeiro-super-administrador).

---

## Desenvolvimento local com Supabase CLI

```bash
# Iniciar pilha local (docker)
supabase start

# Aplicar migrations + seed
supabase db reset

# URL local
echo $(supabase status | grep "API URL")
# anon key local
echo $(supabase status | grep "anon key")
```

Edite `assets/js/env-config.js` apontando para os valores locais. Para servir o site:

```bash
npx serve .
# ou
python3 -m http.server 8080
```

Para testar Functions localmente:

```bash
npx netlify dev
```

Faça login com qualquer um dos seeds (senha **`imo-insights-2025`** para todos):

| E-mail                           | Papel        |
| -------------------------------- | ------------ |
| `super@imoinsights.dev`          | super_admin  |
| `admin@imoinsights.dev`          | admin        |
| `editor@imoinsights.dev`         | editor       |
| `maria@empresa-alpha.test`       | client (Alpha) |
| `joao@empresa-alpha.test`        | client (Alpha) |
| `paula@empresa-beta.test`        | client (Beta)  |
| `carlos@empresa-beta.test`       | client (Beta)  |

⚠ **Troque essas senhas antes de usar em produção.**

---

## Como criar o primeiro super-administrador

A área logada não permite signup público. Para criar o primeiro super-admin **em produção**, use a CLI do Supabase ou o painel:

### Opção A — Via SQL (recomendado para o primeiro setup)

No painel Supabase → SQL Editor, rode:

```sql
-- 1. Cria usuário no Supabase Auth via admin API (NÃO faça via SQL puro em prod;
--    use a API admin abaixo). Aqui só inserimos o perfil de aplicação.

-- Substitua os valores e o UUID por algo gerado no passo seguinte.
```

Use o painel Supabase → **Authentication → Users → Invite user**, informando o e-mail do super-admin. O Supabase enviará link de convite. Quando o usuário aceitar e definir senha, o Auth user existirá. Pegue o ID do usuário criado e rode:

```sql
insert into public.users (id, email, full_name, role, status, notify_by_email, consent_at)
values ('<id-do-auth-user>', 'voce@exemplo.com', 'Seu Nome', 'super_admin', 'active', true, now());
```

A partir daí, esse usuário pode fazer login na área e usar o painel admin para convidar outros usuários e administrar tudo.

### Opção B — Via Supabase CLI (avançado)

```bash
# Crie o auth.user e capture o ID
supabase auth admin create --email voce@exemplo.com --password 'senha-forte-temporaria'

# Insira o perfil de aplicação
supabase db query "
insert into public.users (id, email, full_name, role, status, notify_by_email, consent_at)
values ('<id>', 'voce@exemplo.com', 'Seu Nome', 'super_admin', 'active', true, now());"
```

Após o primeiro login, o super-admin recebe OTP por e-mail. Verifique se o Resend está corretamente configurado antes de criar o super-admin.

---

## Configurar Resend (e-mail transacional)

1. Crie conta em [resend.com](https://resend.com).
2. Adicione o domínio `imoinsights.com.br` (ou seu domínio):
   - Resend → Domains → Add domain.
   - Adicione os registros DNS solicitados (SPF + DKIM). Aguarde a verificação (15 min a algumas horas, dependendo do DNS).
3. Em Resend → API Keys, gere uma chave com permissão de envio.
4. Cadastre no Netlify:
   - `RESEND_API_KEY` = a chave gerada
   - `RESEND_FROM` = `IMO Insights <noreply@imoinsights.com.br>`
5. Faça um teste enviando um convite via painel admin.

> **Sem Resend configurado**: a aplicação NÃO quebra — Functions retornam 200 e logam um aviso. Mas o usuário não recebe os e-mails (incluindo o OTP de 2FA), o que **inviabiliza o login**. Resend é mandatório para o sistema funcionar em produção.

---

## Desativar Netlify Identity

A versão anterior do site usava Netlify Identity. Esta entrega substitui completamente por Supabase. Para evitar confusão e atrito na sessão dos usuários:

1. No painel Netlify → **Site settings → Identity**.
2. Clique em **Disable Identity**.
3. Confirme. Tokens antigos do Identity ficarão inválidos (intencional).

Os usuários previamente cadastrados via Identity precisam ser recriados via convite no painel admin.

---

## Fluxos de autenticação

### Login normal

1. Usuário entra em `/login.html`, digita e-mail + senha.
2. Supabase valida → JWT (aal1).
3. Front consulta `/api/check-mfa`.
4. Se já tem grant válido (passou OTP nas últimas 8 h): redireciona para área.
5. Se não: front chama `/api/request-email-otp` → Resend envia código de 6 dígitos.
6. Usuário digita código → front chama `/api/verify-email-otp` → grant criado.
7. Front redireciona para área (cliente, editor ou admin conforme papel).

### Primeiro acesso (convite)

1. Admin convida no painel → Function `invite-user` cria auth.user + public.users (status `invited`) + envia link.
2. Usuário clica no link → cai em `/definir-senha.html?...&type=invite`.
3. Define senha, aceita LGPD → Function `confirm-consent` ativa o status para `active`.
4. Login normal → recebe OTP no e-mail → entra.

### Recuperação de senha

1. Em `/recuperar-senha.html` o usuário informa e-mail.
2. Supabase envia link → cai em `/definir-senha.html?...&type=recovery`.
3. Define nova senha → faz login normal (com OTP).

---

## Papéis e permissões

Quatro papéis. Toda autorização é dupla: RLS no Postgres + validação nas Functions.

| Papel         | Vê                                            | Faz                                               |
| ------------- | --------------------------------------------- | ------------------------------------------------- |
| `client`      | Só projetos da própria empresa, conteúdos current+approved e arquivados | Edita perfil, troca senha, baixa, abre dashboards |
| `editor`      | Todos os projetos (para upload), suas submissões | Sobe novo conteúdo ou nova versão (sempre `pending_approval`) |
| `admin`       | Tudo                                          | Aprova/rejeita, CRUD de clientes/projetos/usuários (exceto admins), auditoria |
| `super_admin` | Tudo                                          | Tudo + promover/rebaixar admins                    |

Detalhes de RLS estão em `supabase/migrations/0001_init.sql`.

---

## Manutenção: limpeza de OTPs antigos

A tabela `email_otp_codes` cresce continuamente. Configure um job para chamar `cleanup_expired_otp_and_grants()` periodicamente:

### Opção A — Supabase Scheduled Function

No painel Supabase → Database → Cron Jobs (requer extensão `pg_cron` ativada):

```sql
select cron.schedule(
  'cleanup-otp-grants',
  '0 3 * * *',                                         -- 03:00 diariamente
  $$ select public.cleanup_expired_otp_and_grants(); $$
);
```

### Opção B — Função Netlify scheduled

Crie um arquivo `netlify/functions/cron-cleanup.js` que chame a função e configure no `netlify.toml`:

```toml
[[scheduled.functions]]
  function = "cron-cleanup"
  schedule = "@daily"
```

Audit logs são preservados por 12 meses (manualmente: rode `delete from audit_logs where created_at < now() - interval '12 months';`).

---

## Checklist de aceitação

Critérios da seção 10 do spec original. Marque conforme valida:

- [ ] **Site público intacto** — `index.html`, `sobre.html`, `produtos.html`, `evb.html`, `abordagem.html`, `time.html`, `contato.html`, todas as páginas de funil e produto continuam idênticas, sem mudança visual nem de conteúdo.
- [ ] **Cliente vê só os próprios projetos** — logue como `maria@empresa-alpha.test` e confira que vê apenas os 2 projetos da Empresa Alpha. Logue como `paula@empresa-beta.test` e confira que vê só o da Empresa Beta.
- [ ] **Upload do editor não vaza** — logue como `editor@imoinsights.dev`, suba arquivo novo. Logue como cliente — não deve ver o arquivo.
- [ ] **Versionamento correto** — editor sobe v2 do "Relatório Mensal — Abril 2025". Cliente continua vendo a v1 atual. Admin aprova v2. Cliente vê v2 com indicador "Atualizado em DD/MM" e v1 some da listagem principal (mas aparece em "Histórico").
- [ ] **Rejeição com motivo** — admin rejeita uma submissão. Editor abre detalhe → vê motivo + botão "Reenviar versão corrigida".
- [ ] **Acesso direto a URL de outro cliente retorna 403/404** — pegue um `version_id` de Empresa Beta. Logado como cliente da Empresa Alpha, faça via curl:
  ```bash
  curl -X POST https://seu-site/api/sign-download \
       -H "Authorization: Bearer <jwt-do-cliente-alpha>" \
       -H "Content-Type: application/json" \
       -d '{"version_id":"<id-da-beta>"}'
  ```
  Deve retornar 403.
- [ ] **RLS impede consulta indevida com anon key** — com apenas `SUPABASE_ANON_KEY` (sem JWT de usuário), tente:
  ```bash
  curl 'https://<projeto>.supabase.co/rest/v1/projects' \
       -H "apikey: <ANON>" \
       -H "Authorization: Bearer <ANON>"
  ```
  Deve retornar `[]` (RLS exige usuário autenticado).
- [ ] **URL assinada expira em 5 min** — gere uma URL de download e tente acessá-la 6 minutos depois. Deve retornar 400/410.
- [ ] **Logs registram eventos** — no painel admin → Auditoria, confira que aparecem entradas para login, upload, aprovação, rejeição, download, mudança de papel, criação de cliente/projeto.
- [ ] **Recuperação de senha funcional** — solicite reset, receba e-mail, defina nova senha, entre.
- [ ] **Aviso de privacidade publicado** — `/privacidade.html` está acessível e linkado nos rodapés da área logada.
- [ ] **2FA por e-mail funcional** — em login novo, código de 6 dígitos chega ao e-mail e funciona uma única vez.
- [ ] **README documenta tudo** — esta página cobre env vars e como criar primeiro super-admin.

---

## Troubleshooting

### "Widget Identity não carregou" no console
A área logada não usa mais Netlify Identity. Esse erro só aparece em código antigo. Se persistir, faça hard refresh (Ctrl+Shift+R) ou limpe localStorage.

### "Token ausente" em chamadas /api/*
A sessão do Supabase expirou ou o usuário não está logado. Faça login novamente.

### OTP não chega no e-mail
- Verifique se `RESEND_API_KEY` e `RESEND_FROM` estão cadastradas no Netlify.
- Verifique se o domínio do remetente foi verificado no painel Resend (DKIM + SPF).
- Confira a pasta de spam.
- No painel Resend → Logs, veja se a entrega foi tentada e o status.

### Função retorna 500 sem detalhes
Veja logs em **Netlify → Functions → cada-função → Logs**. Em caso de erro de Supabase, o stack costuma estar bem detalhado.

### CSP bloqueando algo
Os headers em `netlify.toml` permitem apenas: `'self'`, `cdn.jsdelivr.net`, `unpkg.com`, fontes do Google. Se precisar adicionar outra origem, edite o `[[headers]]` correspondente.

### Storage retorna 404 ao gerar URL assinada
- Confira que o bucket `content` existe (rode a migration novamente se necessário).
- O `storage_path` na linha de `file_versions` precisa corresponder a um objeto realmente existente. Em desenvolvimento com seed, os arquivos NÃO existem fisicamente — só os metadados. Para testar download de fato, suba um arquivo via área do editor e aprove.

### Injeção automática de env-config.js no build
Para evitar editar `env-config.js` manualmente, no `netlify.toml` substitua:
```toml
[build]
  command = "echo 'no build'"
```
por:
```toml
[build]
  command = "sh ./scripts/inject-env.sh"
```
E crie `scripts/inject-env.sh`:
```bash
#!/bin/sh
sed -i.bak \
  -e "s|__SUPABASE_URL__|$SUPABASE_URL|g" \
  -e "s|__SUPABASE_ANON_KEY__|$SUPABASE_ANON_KEY|g" \
  -e "s|__SITE_URL__|$SITE_URL|g" \
  assets/js/env-config.js
rm -f assets/js/env-config.js.bak
```

---

## Roadmap (v2, fora deste escopo)

- TOTP (Google Authenticator) opcional como fator adicional, especialmente para super-admin.
- Chat ou comentários por projeto.
- Filtros avançados de auditoria (export CSV).
- Métricas com gráficos.
- App mobile.
- Integração com CRM/ERP.

---

© 2025 IMO Insights · Pesquisa de mercado e brand tracking
