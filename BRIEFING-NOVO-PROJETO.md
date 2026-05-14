# Briefing — Replicar a área logada de clientes em outro site

Documento prescritivo para construir um sistema funcionalmente idêntico ao que foi feito para a IMO Insights, num **outro site institucional estático**. Inclui spec de requisitos, stack, arquivos do projeto, e o roteiro otimizado de deploy (que evita os tropeços do primeiro setup).

Use este briefing como prompt em uma nova sessão Cowork apontada para o projeto novo, ou siga o passo-a-passo manualmente.

---

## 1. Visão geral

Sistema de área logada de clientes acoplado a um site institucional estático já existente. Cada cliente vê apenas seus projetos, baixa arquivos com URL assinada de curta validade, abre dashboards HTML, troca senha, recebe notificações por e-mail. Internamente: editores fazem upload (vai para fila pendente), administradores aprovam/rejeitam, super-admins gerenciam tudo. Logs imutáveis de toda ação sensível. **2FA por e-mail obrigatório** para todos os papéis.

**O site público não é alterado.** A área logada vive em rotas separadas (`/login.html`, `/area-cliente*.html`, `/recuperar-senha.html`, `/definir-senha.html`, `/privacidade.html`).

---

## 2. Stack (idêntica ao IMO — não trocar)

| Camada                                | Tecnologia                                      |
| ------------------------------------- | ----------------------------------------------- |
| Front (público + área logada)         | HTML/CSS/JS puro, sem framework, sem build step |
| Autenticação                          | Supabase Auth (e-mail+senha) + custom email OTP |
| Banco de dados                        | Supabase Postgres com RLS forçado               |
| Storage de arquivos                   | Supabase Storage (bucket privado)               |
| Endpoints sensíveis                   | Netlify Functions (Node 20, esbuild)            |
| E-mail transacional                   | Resend                                          |
| Hospedagem                            | Netlify (deploy a partir do GitHub)             |
| Versionamento                         | GitHub (repo privado), via SSH                  |

---

## 3. Contas e ferramentas necessárias

Já cadastradas/configuradas neste setup:

- Conta **GitHub** (repo privado novo)
- Conta **Supabase** (novo projeto, plano free)
- Conta **Netlify** (novo site)
- Conta **Resend** (mesma usada no IMO; gerar nova API key por projeto)
- **Cowork** (para escrever os arquivos)
- **Terminal** com SSH configurado e GitHub CLI ou Personal Access Token (já configurado)
- **GitHub Desktop** (opcional — útil para commits visuais; mas o caminho via terminal é mais confiável)

---

## 4. Funcionalidades por papel

**Cliente** — vê apenas projetos da própria empresa, conteúdos current+approved, histórico de versões archived, baixa documentos via URL assinada (5 min), abre dashboards HTML em nova aba. Edita perfil, troca senha, opt-in para notificações.

**Editor** — vê todos os projetos (precisa para upload), faz upload de novo conteúdo (cria slot) ou nova versão de slot existente. Toda submissão entra como `pending_approval`. Vê suas próprias submissões filtradas por status. Quando rejeitado, vê motivo e reenvia.

**Admin** — fila de aprovação com pré-visualização (link assinado). Aprovar dispara transação atômica (versão antiga vira `archived`, nova vira `approved + is_current`). Rejeitar exige motivo de no mínimo 10 caracteres. CRUDs de clientes, projetos, usuários (exceto admins/super-admins). Audit logs visíveis.

**Super-admin** — tudo + única role que pode criar/promover outros admins.

**2FA por e-mail (universal)** — após senha correta, código de 6 dígitos enviado por e-mail. Validade 10 min, máximo 5 tentativas, 60s entre reenvios. Concessão (`mfa_grant`) válida por 8 h — não pede OTP a cada login no mesmo dia.

---

## 5. Estrutura de arquivos do projeto

Todos os arquivos abaixo precisam ser criados (ou copiados/adaptados do IMO Insights).

### Configuração

- `netlify.toml` — config Netlify com `npm install` no build, headers CSP/HSTS, `SECRETS_SCAN_OMIT_KEYS`.
- `_redirects` — `/api/*` → `/.netlify/functions/*`.
- `package.json` — deps `@supabase/supabase-js@^2.45.0` e `busboy@^1.6.0`. `engines.node >= 20`.
- `.gitignore` — exclui `node_modules/`, `package-lock.json`, `.env*`, `.DS_Store`, **`Icon?`** (importante no macOS), **`assets/raw/`** (imagens fonte que não vão pro deploy), zips/pptx soltos.

### Páginas HTML (área logada)

- `login.html` — e-mail/senha + estágio OTP inline. Marca `imo_remember`/`imo_session_active`.
- `recuperar-senha.html` — chama `auth.resetPasswordForEmail`. Mensagem de sucesso genérica para evitar enumeração de contas.
- `definir-senha.html` — dual: detecta `type=invite` ou `type=recovery` no hash. Para invite, mostra checkbox LGPD obrigatório e chama `/api/confirm-consent`.
- `area-cliente.html` — dashboard do cliente: saudação, banner de novidades (`countNewContentSince`), grid de cards com badge "X novos".
- `area-cliente-projeto.html` — header do projeto + abas "Conteúdos" e "Histórico". Lê da view `client_visible_content`.
- `area-cliente-perfil.html` — três blocos: dados, troca senha, LGPD (mailto pré-preenchido para DPO).
- `area-cliente-editor.html` — submissões filtráveis + drawers para nova submissão (modos "novo" e "nova versão") e detalhe/rejeição.
- `area-cliente-admin.html` — SPA com 5 tabs (Fila/Clientes/Usuários/Projetos/Auditoria) lazy-loaded.
- `privacidade.html` — Política de Privacidade pública alinhada à LGPD.

### Módulos JS compartilhados (`/assets/js/`)

- `env-config.js` — preenche `window.IMO_ENV` com `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SITE_URL`. **Não usar placeholders no commit final** — preencher direto.
- `supabase-client.js` — singleton `window.IMO.client` via CDN do `@supabase/supabase-js@2`, PKCE, persistSession, autoRefreshToken.
- `role-helpers.js` — `getProfile()` cacheado, predicados de role, formatadores pt-BR (data DD/MM/AAAA, números 1.234,56, bytes), `escapeHtml`, `callApi(path, opts)`, `toast`, `signOut`, `homeForRole`.
- `session-guard.js` — `data-imo-guard="cliente|editor|admin|super_admin"` no body. Checa JWT, perfil active, role >= mínimo, **MFA via `/api/check-mfa`**, inatividade (8h cliente / 30min admin), evento `imo:ready`.

### Banco (`/supabase/migrations/`)

- `0001_init.sql` — schema completo:
  - Tabelas: `clients`, `users` (id = auth.users.id), `projects`, `content_slots`, `file_versions`, `audit_logs`.
  - Constraints: 1 versão `is_current` por slot via índice parcial unique; check `is_current=true ⟹ status='approved'`; check de role+client_id consistente em `users`.
  - Helper functions de RBAC (`current_user_role`, `is_admin`, `is_super_admin`, `is_editor_or_above`, `current_user_client_id`).
  - Triggers: `auto_version_number`, `enforce_pending_on_insert`, `enforce_status_immutable_for_non_admin`, `users_self_update_guard`.
  - RLS forçado em todas; policies por papel.
  - Stored procs: `approve_file_version`, `reject_file_version`.
  - View `client_visible_content` (current + approved + slot não arquivado).
  - Bucket `content` privado em storage.

- `0002_email_otp_2fa.sql`:
  - Tabelas `email_otp_codes` (TTL 10min, hash SHA-256) e `mfa_grants` (TTL 8h, single-grant policy).
  - Função `cleanup_expired_otp_and_grants()` para cron diário.
  - View `users_with_active_mfa` para auditoria.

- `seed.sql` — 7 usuários de teste (1 super_admin, 1 admin, 1 editor, 4 clients em 2 empresas), 3 projetos, 5 content_slots (com 2 versionados para testar histórico).

### Netlify Functions (`/netlify/functions/`)

**Compartilhadas em `_shared/`:**
- `supabase.js` — singleton com `service_role`.
- `auth.js` — `authenticate()`, `requireRole()`, `clientIp()`.
- `audit.js` — `logAudit()` com falha silenciosa.
- `email.js` — Resend + 5 templates (`inviteTemplate`, `approvedTemplate`, `rejectedTemplate`, `adminPendingDigestTemplate`, `loginOtpTemplate`).
- `multipart.js` — parser baseado em busboy, limite 60 MB hard.
- `respond.js` — `ok()` / `fail()` com headers no-store.
- `otp.js` — `generateCode`, `hashCode`, `safeEqual`.

**Endpoints:**
- `sign-download.js` — URL assinada 5 min com RBAC.
- `approve-version.js` — RPC atômico + e-mail aos clientes notify_by_email=true.
- `reject-version.js` — RPC + e-mail ao editor.
- `create-version.js` — multipart upload, max 50 MB, cria slot ou usa existente, rollback do upload se insert falhar.
- `invite-user.js` — modos novo/reenvio, cria auth.user + public.users, gera link de invite via admin API, envia e-mail.
- `admin-update-user.js` — atualiza role/status/empresa, espelha `disabled` em ban no auth.
- `audit-log.js` — endpoint genérico para o front admin (allowlist fechada de ações).
- `confirm-consent.js` — ativa `invited` → `active` + grava `consent_at`.
- `request-email-otp.js` — gera código, anti-flood 60s, envia.
- `verify-email-otp.js` — valida (max 5 tentativas), revoga grants antigos, cria novo grant 8h.
- `check-mfa.js` — endpoint GET para o session-guard.

### Documentação

- `README.md` — técnico (env vars, comandos, manutenção).
- `SETUP-PASSO-A-PASSO.md` — guia para o cliente seguir, sem terminal.

---

## 6. Roteiro otimizado de deploy (sem cair nas mesmas armadilhas)

Faça **nesta ordem exata**. As decisões aqui evitam retrabalho que aconteceu no IMO Insights.

### Fase A — Preparação das contas (15 min, em paralelo)

1. **Crie o projeto Supabase**:
   - Region: `South America (São Paulo)`.
   - Anote `Project URL`, `anon key`, `service_role key`.
2. **Crie a API key Resend** (use a conta existente, gere uma key nova com escopo `Sending access` para o domínio do novo site).
3. **Crie o repo no GitHub** (privado, vazio, sem README/gitignore/license — o projeto local já terá tudo).
4. **Crie o site no Netlify a partir do GitHub** (não use Drop):
   - Add new site → Import from Git → GitHub.
   - Mesmo que o repo esteja vazio, você consegue conectar; ele só vai mostrar "no deploys yet".
   - Config: branch `main`, base directory vazio, build command vazio (ainda — vamos sobrescrever via netlify.toml), publish `.`, functions `netlify/functions`.
5. **Anote a URL temporária do Netlify** (`xxx.netlify.app`).

### Fase B — Aplica banco no Supabase (10 min)

6. SQL Editor → cole `0001_init.sql` → Run.
7. SQL Editor → cole `0002_email_otp_2fa.sql` → Run.
8. (Opcional, dev) SQL Editor → cole `seed.sql` → Run.
9. **URL Configuration** em Authentication:
   - Site URL: `https://xxx.netlify.app/definir-senha.html` ⚠ **com o `/definir-senha.html`** (truque para invites do dashboard caírem na página certa). Pode ajustar depois para a URL final.
   - Redirect URLs: adicione `https://xxx.netlify.app/definir-senha.html`.
10. **Sign In / Providers → Email**: Minimum password length = 10.

### Fase C — Cadastro das env vars no Netlify (5 min)

11. Site → Project configuration → Environment variables. Cadastre as 6 (production + outros contextos com mesmo valor):
    - `SUPABASE_URL`
    - `SUPABASE_ANON_KEY`
    - `SUPABASE_SERVICE_ROLE_KEY` ⚠ secreta
    - `RESEND_API_KEY` ⚠ secreta
    - `RESEND_FROM` = `onboarding@resend.dev` (provisório) ou `noreply@dominio.com.br` (se já tiver Resend domain verificado)
    - `SITE_URL` = `https://xxx.netlify.app`

### Fase D — Cria o código local (Cowork) e prepara o git

12. No Cowork, abra a pasta do site novo.
13. Crie todos os arquivos da seção 5 (HTMLs, JS, migrations, Functions, README, etc.).
14. **`env-config.js` direto com os valores reais** (não use placeholders — evita o issue de SECRETS_SCAN). A `anon key` é pública, pode ficar no commit.
15. **Gere chave SSH no Mac** se ainda não tiver (a do IMO já serve, mas se quiser uma específica para o novo projeto):
    ```bash
    ssh-keygen -t ed25519 -C "seu@email.com" -f ~/.ssh/id_ed25519_NOMEPROJETO -N ""
    eval "$(ssh-agent -s)" && ssh-add --apple-use-keychain ~/.ssh/id_ed25519_NOMEPROJETO
    pbcopy < ~/.ssh/id_ed25519_NOMEPROJETO.pub
    ```
    Adicione a chave em github.com/settings/ssh/new.

### Fase E — Limpeza preventiva e primeiro push (10 min)

16. **Limpe Icon files do macOS antes do git init** (evita o bug que travou tudo no IMO):
    ```bash
    cd "/caminho/do/projeto" && \
    sudo xattr -rc . && \
    sudo find . -name "Icon*" -delete 2>/dev/null
    ```
17. Inicie git e configure remote SSH:
    ```bash
    git init -b main && \
    git config http.postBuffer 524288000 && \
    git remote add origin git@github.com:USUARIO/REPO.git
    ```
18. Primeiro commit + push:
    ```bash
    git add . && \
    git commit -m "Setup inicial: site institucional + área logada de clientes" && \
    git push -u origin main
    ```

### Fase F — Deploy automático e testes (15 min)

19. O Netlify detecta o push e dispara build. Acompanhe em **Deploys**.
20. Build deve levar 30-90s (vai rodar `npm install`).
21. Quando "Published" verde aparecer, abra `https://xxx.netlify.app/login.html`. Não deve aparecer "Falha ao inicializar".
22. **Crie o primeiro super-admin** via SQL Editor:
    ```sql
    -- Primeiro, crie o auth.user via Supabase Auth → Users → Add user → "Create new user"
    -- (com Auto Confirm marcado, sem mandar e-mail). Anote o e-mail usado.

    -- Depois, promova:
    INSERT INTO public.users (id, email, full_name, role, status, notify_by_email, consent_at)
    SELECT id, email,
           COALESCE(raw_user_meta_data->>'full_name', split_part(email,'@',1)),
           'super_admin', 'active', true, now()
    FROM auth.users
    WHERE email = 'SEU_EMAIL'
    ON CONFLICT (id) DO UPDATE
       SET role = 'super_admin', status = 'active', client_id = NULL, consent_at = now();
    ```
23. **Tente login**. Vai pedir OTP por e-mail (mesmo com `onboarding@resend.dev`, funciona pra você como dono da conta Resend).
24. Após login bem-sucedido, percorra o checklist da seção 7.

### Fase G — Virada de domínio (quando aplicável)

25. Compre/configure domínio próprio.
26. Netlify → Domain management → Add custom domain.
27. Aguarde DNS + certificado SSL.
28. Atualize:
    - `assets/js/env-config.js` → `SITE_URL` para o novo domínio.
    - Variável `SITE_URL` no Netlify.
    - Supabase → Site URL para `https://novodominio.com.br/definir-senha.html`.
    - Adicione `https://novodominio.com.br/definir-senha.html` em Redirect URLs (deixe o `xxx.netlify.app/definir-senha.html` antigo por uns dias).
29. Verifique domínio no Resend (DNS records SPF/DKIM/DMARC).
30. Atualize `RESEND_FROM` no Netlify para `noreply@novodominio.com.br`.
31. Trigger deploy → clear cache and deploy.

---

## 7. Checklist de aceitação

- [ ] Site público intacto: navegação por todas as páginas idêntica ao antes.
- [ ] Login funciona ponta-a-ponta (senha → OTP → painel admin).
- [ ] Cliente fictício loga e vê apenas os projetos da própria empresa.
- [ ] Editor sobe arquivo novo — não vaza para o cliente até aprovação.
- [ ] Editor sobe nova versão — antiga continua visível ao cliente até aprovação da nova; após aprovar, antiga vai pra aba Histórico.
- [ ] Admin rejeita — editor vê motivo e reenvia.
- [ ] Tentativa de URL de outro cliente direto: 403/404 (testar via curl com JWT).
- [ ] RLS impede consulta com anon key sem JWT (testar via curl).
- [ ] URLs assinadas expiram em 5 min e não voltam a funcionar.
- [ ] Logs registram: login OTP, upload, aprovação, rejeição, download, mudança de papel, criação de cliente/projeto.
- [ ] Recuperação de senha funciona ponta-a-ponta.
- [ ] Aviso de privacidade publicado e linkado.

---

## 8. Lições aprendidas (armadilhas conhecidas)

**Não fazer**:

- Não fazer drag-and-drop no Netlify ANTES de conectar o repo. O "Netlify Drop" inicial cria um deploy desconectado do Git, e dá impressão errada de que está tudo certo quando não está.
- Não usar HTTP para `git push` em redes domésticas com upload >40MB. Vai dar HTTP 400. Use SSH desde o começo.
- Não usar GitHub Desktop num projeto onde existem arquivos `Icon\r` do macOS — ele quebra antes de subir nada. Limpe com `sudo xattr -rc .` e `sudo find . -name "Icon*" -delete` ANTES de inicializar git.
- Não esquecer de incluir `npm install` no build command do `netlify.toml`. Sem isso, as Functions caem em runtime com `Cannot find module '@supabase/supabase-js'` e respondem 502 com log vazio.
- Não esquecer de configurar `SECRETS_SCAN_OMIT_KEYS` no `netlify.toml`. Sem isso, o build falha com "Exposed secrets detected" porque o scanner enxerga `SUPABASE_URL` no `env-config.js`.
- Não cadastrar `peaceful-marshmallow` no Site URL do Supabase **sem** o `https://`. Vira caminho relativo e quebra o redirect do invite.
- Não invitar usuários múltiplos via dashboard (rate limit do plano free). Use **Add user → Create new user** com password direto, e promova via SQL.

**Fazer**:

- `.gitignore` com `Icon?`, `**/Icon?`, `assets/raw/`, `*.zip`, `*.pptx` desde o primeiro commit.
- Limpar Icon files com `sudo xattr -rc .` antes de cada deploy se o macOS começar a recriar.
- Build command no `netlify.toml`: `command = "npm install --prefer-offline --no-audit --no-fund && echo done"`.
- `[build.environment]` com `SECRETS_SCAN_OMIT_KEYS = "SUPABASE_URL,SUPABASE_ANON_KEY,SITE_URL,RESEND_FROM"` e `SECRETS_SCAN_OMIT_PATHS = "assets/js/env-config.js"`.
- SSH para git push desde o começo.

---

## 9. Como me usar para construir isso

Se você for usar o Cowork (Claude) para gerar o código no novo projeto, cole **este briefing inteiro** como prompt na primeira mensagem da sessão, junto com:

1. **Caminho do novo projeto** no Mac (ex.: `/Users/lucassilva/Documents/Claude/Projects/Sites NOVO/site-novo-netlify`).
2. **Stack visual de referência** — mostrar o `styles.css` do site público novo, ou indicar onde estão os componentes visuais que devem ser reaproveitados (logo, paleta, tipografia).
3. **URL do GitHub repo** que você criar para o novo site.
4. **URL temporária do Netlify** (`xxx.netlify.app`).
5. **Credenciais Supabase do projeto novo** (URL + anon + service_role).

Com isso, o Cowork consegue gerar o código todo, configurar deploy e te entregar um sistema funcional em poucas horas — pulando todas as ralações que tivemos no IMO.

---

## 10. Tempo estimado por fase (real)

| Fase                                       | Tempo bruto       | Tempo real (com café e revisão) |
| ------------------------------------------ | ----------------- | -------------------------------- |
| A. Preparação contas                       | 15 min            | 30 min                           |
| B. SQL no Supabase                         | 10 min            | 20 min                           |
| C. Env vars no Netlify                     | 5 min             | 10 min                           |
| D. Geração de código (Cowork)              | 1-2 h             | 2-3 h                            |
| E. Limpeza + git push                      | 10 min            | 30 min (se pegou Icon files)     |
| F. Build + primeiro super-admin + testes   | 15 min            | 30 min                           |
| G. Virada de domínio (opcional)            | 30 min + DNS wait | 1-2 h                            |
| **Total para staging funcional**           | ~3 h              | **~5 h**                          |
| **Total para produção com domínio**        | ~4 h              | **~7 h**                          |

Para um segundo projeto com a mesma estrutura, pode contar **metade desse tempo** porque a maior parte do trabalho já está consolidado neste briefing.

---

## 11. Personalização por projeto

Itens que mudam de site para site:

- **Nome da empresa** — substituir "IMO Insights" e referências ao DPO em todas as páginas e templates de e-mail.
- **Identidade visual** — `styles.css` (cores, fontes, logo). O `area-cliente-*.html` herda esses estilos do site público.
- **Política de Privacidade** — `privacidade.html` precisa ser revista por jurídico do cliente.
- **Tipos de conteúdo aceitos** — em `area-cliente-editor.html` e em `create-version.js`, opcionalmente restringir MIME types.
- **Limite de tamanho de upload** — em `create-version.js` (`MAX_BYTES`) e no bucket Storage (Edit bucket → Restrict file size).
- **Templates de e-mail** — em `_shared/email.js` (cabeçalho, rodapé, cores).
- **Política de senha** — Supabase Auth Settings (mínimo 10 chars está ok para a maioria).
- **Duração do `mfa_grant`** — em `verify-email-otp.js` (`MFA_GRANT_TTL_MS`). 8h é um meio-termo razoável.

Itens que NÃO devem mudar (são por segurança):
- TTL de URLs assinadas (5 min).
- TTL de OTP (10 min).
- Max tentativas de OTP (5).
- Anti-flood OTP (60s).
- Status default de versão = `pending_approval` + trigger forçando.
- RLS forçado em todas as tabelas.

---

© Pode reutilizar este briefing à vontade. Foi escrito em maio de 2026 a partir do setup real da IMO Insights, então se a documentação Netlify/Supabase mudou desde então, valide os caminhos das telas.
