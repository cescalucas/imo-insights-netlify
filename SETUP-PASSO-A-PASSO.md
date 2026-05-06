# Setup passo-a-passo — IMO Insights

Guia completo para colocar a área logada de clientes no ar **sem precisar de terminal**, copiando e colando tudo no navegador.

**Tempo total estimado**: 2 a 3 horas, sendo cerca de metade esperando o DNS do e-mail propagar.

**Habilidades necessárias**: saber clicar em botões, copiar e colar. Se você publicou o site no Netlify, já tem tudo que precisa.

---

## Sumário

- [Parte 1 — O que você vai precisar](#parte-1--o-que-você-vai-precisar)
- [Parte 2 — Crie o projeto Supabase (15 min)](#parte-2--crie-o-projeto-supabase-15-min)
- [Parte 3 — Aplique o banco de dados (15 min)](#parte-3--aplique-o-banco-de-dados-15-min)
- [Parte 4 — Configure o Resend para e-mails (10 min + tempo de DNS)](#parte-4--configure-o-resend-para-e-mails-10-min--tempo-de-dns)
- [Parte 5 — Edite o arquivo env-config.js (3 min)](#parte-5--edite-o-arquivo-env-configjs-3-min)
- [Parte 6 — Cadastre as variáveis no Netlify (5 min)](#parte-6--cadastre-as-variáveis-no-netlify-5-min)
- [Parte 7 — Desative o Netlify Identity (1 min)](#parte-7--desative-o-netlify-identity-1-min)
- [Parte 8 — Faça o deploy e crie o primeiro super-admin (10 min)](#parte-8--faça-o-deploy-e-crie-o-primeiro-super-admin-10-min)
- [Parte 9 — Teste tudo (15 min)](#parte-9--teste-tudo-15-min)
- [Se algo não funcionar](#se-algo-não-funcionar)

---

## Parte 1 — O que você vai precisar

> **Estamos testando primeiro no domínio do Netlify**: `https://peaceful-marshmallow-b2a880.netlify.app`. Sempre que este guia mencionar uma URL de site, use essa. Quando estiver tudo funcionando, você troca para `imoinsights.com.br` seguindo a seção "Quando virar para o domínio definitivo" no final.

Antes de começar, separe:

1. **Sua conta do Netlify** — você já tem (o site está hospedado lá).
2. **A URL de teste do Netlify** — `https://peaceful-marshmallow-b2a880.netlify.app` (essa que você vai usar agora).
3. **Um e-mail seu** que você vai usar como super-administrador (o "dono" do sistema).
4. **Acesso ao DNS de `imoinsights.com.br`** — só para configurar o Resend (envio de e-mail). Pode ser Registro.br, GoDaddy, Cloudflare, etc. Se não souber, pergunte ao desenvolvedor que registrou o domínio. Se ainda não tem isso, dá pra começar usando o domínio padrão do Resend (`onboarding@resend.dev`) — explico na parte 4.

E vai criar duas contas novas:

5. **Conta Supabase** (gratuita) — onde fica o banco de dados e a autenticação.
6. **Conta Resend** (gratuita até 100 e-mails/dia) — para enviar e-mails de convite, recuperação de senha e códigos de verificação.

Tenha **três abas do navegador abertas em paralelo** durante o processo: Supabase, Resend e Netlify. Você vai pular entre elas.

---

## Parte 2 — Crie o projeto Supabase (15 min)

### Passo 2.1 — Crie a conta

1. Vá em [https://supabase.com](https://supabase.com).
2. Clique em **Start your project** (ou **Sign in** se já tiver conta).
3. Faça login com o GitHub. É o jeito mais fácil — usa a mesma conta que você já tem do Netlify provavelmente.

### Passo 2.2 — Crie o projeto

1. No painel inicial, clique em **New project**.
2. Preencha:
   - **Organization**: deixe a padrão.
   - **Name**: `imo-insights-area-cliente`
   - **Database Password**: clique em **Generate a password** e **copie a senha gerada para um lugar seguro** (gerenciador de senhas, papel, qualquer coisa). Você não vai precisar dela no dia-a-dia, mas é a senha-mestra do banco.
   - **Region**: escolha **South America (São Paulo)**.
   - **Pricing Plan**: deixe **Free**.
3. Clique em **Create new project**.
4. Aguarde uns 2 minutos. O Supabase vai mostrar uma tela de "Setting up project...".

### Passo 2.3 — Anote as 3 chaves do Supabase

Quando o projeto estiver pronto, você verá uma página com botões de "Connect", "Documentation", etc. Vamos pegar 3 valores que você vai usar mais à frente.

1. No menu da esquerda, clique no ícone de engrenagem (⚙) **Project Settings**.
2. Clique em **API**.
3. **Cole estes 3 valores num bloco de notas** — você vai precisar deles várias vezes:

| Etiqueta no painel Supabase | O que é         | Salve como               |
| --------------------------- | --------------- | ------------------------ |
| **Project URL**             | URL do projeto  | `SUPABASE_URL`           |
| **anon · public**           | Chave pública   | `SUPABASE_ANON_KEY`      |
| **service_role · secret**   | Chave admin     | `SUPABASE_SERVICE_ROLE_KEY` ⚠ |

> ⚠ **A `service_role` é como uma senha de administrador do banco.** Nunca compartilhe, nunca cole em e-mail, mensagem, screenshot público. Trate como senha bancária.

Pronto, parte 2 completa.

---

## Parte 3 — Aplique o banco de dados (15 min)

Vamos rodar 2 arquivos SQL no Supabase para criar todas as tabelas e regras de segurança. Depois rodamos um terceiro arquivo para popular dados de exemplo (úteis para testar antes de virar tudo "produção").

### Passo 3.1 — Abra o SQL Editor

No menu da esquerda do painel Supabase, clique no ícone que parece um banco de dados (>_) chamado **SQL Editor**.

### Passo 3.2 — Rode a primeira migration

1. Clique em **+ New query** (canto superior direito da tela).
2. Abra o arquivo `supabase/migrations/0001_init.sql` no seu computador (use VS Code, Bloco de Notas, qualquer editor de texto).
3. **Copie TODO o conteúdo** do arquivo (Ctrl+A, Ctrl+C).
4. **Cole no SQL Editor do Supabase** (Ctrl+V).
5. Clique em **Run** (botão azul no canto inferior direito), ou pressione `Ctrl+Enter`.

**O que sucesso parece**: aparece a mensagem **"Success. No rows returned"** na parte de baixo. Sem mensagens vermelhas.

**Se der erro**: copie a mensagem de erro e me chame de volta. O arquivo é idempotente para re-rodadas, então pode tentar de novo.

### Passo 3.3 — Rode a segunda migration

1. Clique em **+ New query** novamente.
2. Abra o arquivo `supabase/migrations/0002_email_otp_2fa.sql`.
3. Copie e cole. Clique em **Run**.

**O que sucesso parece**: novamente "Success. No rows returned".

### Passo 3.4 — (Opcional, mas recomendado) Aplique o seed de dados de teste

Isso cria 7 usuários falsos e 3 projetos de exemplo. Útil para testar antes de criar conteúdos reais. Se você for direto pra produção, pode pular.

1. **+ New query**.
2. Abra `supabase/seed.sql`. Copie e cole. **Run**.

**O que sucesso parece**: aparece embaixo várias linhas "Notice: ... users: 7, clients: 2, projects: 3..." etc. Esse é o "log" do seed.

### Passo 3.5 — Confirme as tabelas no Table Editor

No menu da esquerda, clique em **Table Editor** (ícone de tabela). Você deve ver, na lista da esquerda, **todas estas tabelas**:

- `audit_logs`
- `clients`
- `content_slots`
- `email_otp_codes`
- `file_versions`
- `mfa_grants`
- `projects`
- `users`

Se rodou o seed, clique em `clients` e confira que existem 2 linhas (Empresa Alpha e Empresa Beta).

### Passo 3.6 — Confirme o bucket de arquivos

No menu, clique em **Storage** (ícone de pasta).

Você deve ver um bucket chamado `content`. Confirme que está marcado como **Private** (escudo fechado, não cadeado aberto).

### Passo 3.7 — Configure os redirects de autenticação

1. No menu, clique em **Authentication** (ícone de cadeado/pessoa).
2. Submenu **URL Configuration** (ou **URLs** dependendo da versão).
3. **Site URL**: cole `https://peaceful-marshmallow-b2a880.netlify.app` (sem barra no final).
4. **Redirect URLs**: clique em **Add URL** e cole `https://peaceful-marshmallow-b2a880.netlify.app/definir-senha.html`.
5. Clique em **Save** no canto inferior direito.

### Passo 3.8 — Política de senha

Ainda em **Authentication**:

1. Clique em **Sign In / Providers** no menu da esquerda (NÃO é em "Policies" — "Policies" é onde ficam as regras de RLS das tabelas, que já foram configuradas pelas migrations).
2. Na lista de provedores, clique em **Email**.
3. Role até a seção **Password Requirements** (ou **Minimum password length**).
4. Defina:
   - **Minimum password length**: `10`
   - **Password requirements** (se aparecer): escolha **Letters and digits**.
5. Clique em **Save** no canto inferior direito.

Pronto, parte 3 completa.

---

## Parte 4 — Configure o Resend para e-mails (10 min + tempo de DNS)

Esta é a parte que demora mais por causa do DNS, mas é só preencher e esperar.

> **Atalho para testar rápido**: se você ainda não tem acesso ao DNS de `imoinsights.com.br` ou está com pressa, **pule os passos 4.2 e 4.3** e use o domínio padrão do Resend para enviar e-mails durante os testes. No passo 4.4 você ainda gera a chave da API normalmente. No passo 6 (variáveis no Netlify), use `RESEND_FROM` = `onboarding@resend.dev`. Limitação: você só consegue enviar e-mails para **o e-mail da conta do Resend** (o seu e-mail) e tem limite de 100/dia. Suficiente para o checklist inicial. Depois você verifica o domínio e troca para `noreply@imoinsights.com.br`.

### Passo 4.1 — Crie a conta no Resend

1. Vá em [https://resend.com](https://resend.com).
2. **Sign up** com seu e-mail.
3. Confirme o e-mail clicando no link que chega.

### Passo 4.2 — Adicione seu domínio

1. No painel Resend, clique em **Domains** no menu da esquerda.
2. **Add Domain**.
3. Digite o domínio do site, **sem `https://` e sem `www`**. Por exemplo: `imoinsights.com.br`.
4. **Region**: escolha **us-east-1** (padrão, é o mais barato).
5. Clique em **Add**.

### Passo 4.3 — Configure os registros DNS

O Resend vai mostrar uma tabela com 3 ou 4 entradas que você precisa adicionar no DNS do seu domínio. Algo parecido com isso:

| Type   | Name     | Value                            | Priority |
| ------ | -------- | -------------------------------- | -------- |
| MX     | send     | feedback-smtp.us-east-1...       | 10       |
| TXT    | send     | "v=spf1 include:amazonses.com ~all" | -    |
| TXT    | resend._domainkey | (texto longo de DKIM)   | -        |
| TXT    | _dmarc   | "v=DMARC1; p=none;"              | -        |

**Você precisa entrar no painel onde seu domínio está registrado** (Registro.br, GoDaddy, Cloudflare, etc.) e adicionar essas entradas exatamente como mostradas. **Não inclua o domínio no campo Name** (a maioria dos painéis adiciona automaticamente).

> Se você não sabe como mexer no DNS, peça ajuda a quem registrou o domínio. Mande para essa pessoa as 3 ou 4 linhas que o Resend mostrou e diga: "preciso adicionar essas entradas no DNS do imoinsights.com.br".

Depois de adicionar:

1. Volte ao painel Resend.
2. Clique em **Verify Domain**.
3. Pode demorar de 15 minutos a 24 horas. Continue com o resto deste guia em paralelo. **Não precisa esperar a verificação ficar verde para seguir** — você pode terminar tudo e voltar aqui no final.

### Passo 4.4 — Crie a chave da API

1. No menu Resend, clique em **API Keys**.
2. **Create API Key**.
3. **Name**: `IMO Insights — produção`.
4. **Permission**: deixe **Sending access**.
5. **Domain**: escolha o que você acabou de adicionar.
6. **Add**.
7. **Copie a chave gerada agora.** Ela aparece UMA ÚNICA VEZ. Cole no seu bloco de notas, etiquetada como `RESEND_API_KEY`.

### Passo 4.5 — Anote o endereço de remetente

Junto da `RESEND_API_KEY`, anote uma string assim no seu bloco:

```
RESEND_FROM = IMO Insights <noreply@imoinsights.com.br>
```

(Substitua o domínio pelo seu.)

Pronto, parte 4 completa. Continue mesmo se a verificação do domínio ainda não estiver verde.

---

## Parte 5 — Edite o arquivo env-config.js (3 min)

### Passo 5.1 — Abra o arquivo no seu computador

Localize a pasta do projeto IMO Insights na sua máquina. Vá em `assets/js/env-config.js`. Abra com qualquer editor de texto (VS Code, Bloco de Notas, TextEdit no Mac).

### Passo 5.2 — Substitua os 3 placeholders

Você vai ver algo assim no arquivo:

```javascript
window.IMO_ENV = {
  SUPABASE_URL:      '__SUPABASE_URL__',
  SUPABASE_ANON_KEY: '__SUPABASE_ANON_KEY__',
  SITE_URL:          '__SITE_URL__'
};
```

Substitua pelos valores reais (do bloco de notas onde você anotou). O `SITE_URL` já está pré-preenchido com a URL de teste do Netlify; só precisa preencher `SUPABASE_URL` e `SUPABASE_ANON_KEY`:

```javascript
window.IMO_ENV = {
  SUPABASE_URL:      'https://xxxxxxx.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsI...',
  SITE_URL:          'https://peaceful-marshmallow-b2a880.netlify.app'
};
```

Salve o arquivo.

### Passo 5.3 — Faça commit e push

Você precisa enviar essa mudança para o GitHub para o Netlify pegar:

- Se você usa **GitHub Desktop**: abra, escolha o repositório, escreva uma mensagem tipo "configura env-config para produção", clique em **Commit to main** e depois **Push origin**.
- Se você usa **terminal**:
  ```
  git add assets/js/env-config.js
  git commit -m "configura env-config para produção"
  git push
  ```
- Se você edita direto no GitHub no navegador: abra o arquivo `assets/js/env-config.js` no GitHub, clique no lápis (✏) para editar, faça as substituições, e clique em **Commit changes**.

> Sim, a chave anônima fica visível no código-fonte do site. **Isso é normal e seguro.** Ela é "pública por design" no Supabase. A segurança real vem das regras do banco (RLS) que já configuramos.

Pronto, parte 5 completa.

---

## Parte 6 — Cadastre as variáveis no Netlify (5 min)

### Passo 6.1 — Abra o painel do site

1. Vá em [https://app.netlify.com](https://app.netlify.com).
2. Clique no card do site da IMO Insights.
3. No menu superior, clique em **Site configuration** (ou **Site settings** em versões mais antigas).
4. No menu da esquerda, clique em **Environment variables**.

### Passo 6.2 — Adicione as 6 variáveis

Clique em **Add a variable** → **Add a single variable** para cada uma:

| Key (nome)                    | Value (valor)                                       |
| ----------------------------- | --------------------------------------------------- |
| `SUPABASE_URL`                | (do bloco de notas)                                                            |
| `SUPABASE_ANON_KEY`           | (do bloco de notas)                                                            |
| `SUPABASE_SERVICE_ROLE_KEY`   | (do bloco de notas — **a chave admin secreta**)                                |
| `RESEND_API_KEY`              | (do bloco de notas)                                                            |
| `RESEND_FROM`                 | `IMO Insights <noreply@imoinsights.com.br>` (ou `onboarding@resend.dev` para teste) |
| `SITE_URL`                    | `https://peaceful-marshmallow-b2a880.netlify.app` (sem barra no final)         |

Em cada uma, deixe **Scopes: All scopes** e **Values: Same value for all deploy contexts**. Clique em **Create variable**.

### Passo 6.3 — Confirme

Você deve ver agora 6 variáveis listadas na página. Confira que os nomes estão **exatamente** como na tabela acima — maiúsculas/minúsculas importam.

Pronto, parte 6 completa.

---

## Parte 7 — Desative o Netlify Identity (1 min)

A versão antiga do site usava Netlify Identity para autenticação. Como agora estamos usando Supabase, vamos desligar o Identity para evitar confusão.

1. Ainda no painel Netlify do site, no menu superior clique em **Integrations** (ou role para baixo até achar **Identity**).
2. Localize **Identity**. Se estiver ativado (você verá usuários cadastrados), clique nele.
3. Procure o botão **Disable Identity** (geralmente no canto inferior direito ou em **Settings → Danger zone**).
4. Confirme.

> Se nunca tinha ativado o Identity, esse passo não se aplica. Pule.

---

## Parte 8 — Faça o deploy e crie o primeiro super-admin (10 min)

### Passo 8.1 — Force um redeploy

Quando você fez o push do `env-config.js` na parte 5, o Netlify já começou um deploy automático. Mas ele foi feito **antes** das variáveis de ambiente serem cadastradas. Vamos forçar um novo deploy para pegar as variáveis novas.

1. No painel Netlify do site, no menu superior, clique em **Deploys**.
2. Clique em **Trigger deploy** → **Deploy site** (ou **Clear cache and deploy site** para garantir).
3. Aguarde o deploy terminar (uns 1–3 minutos). O status no topo deve ficar **Published**.

### Passo 8.2 — Convide a si mesmo como usuário

1. Volte ao painel Supabase do projeto.
2. Menu da esquerda, **Authentication** → **Users**.
3. Clique em **Add user** → **Send invitation**.
4. Digite **seu e-mail** (o que você quer usar como super-admin) e clique em **Send invitation**.

### Passo 8.3 — Aceite o convite

1. Vá no seu e-mail. Você deve ter recebido uma mensagem do Supabase com link "Accept invite". (Se não chegar em 2 minutos, veja a pasta de spam.)
2. Clique no link. Você cai na sua página `/definir-senha.html`.
3. Defina uma senha (mínimo 10 caracteres, com letras e números).
4. Marque o aceite da Política de Privacidade.
5. Clique em **Definir senha e entrar**.

Você vai logar normalmente, mas como **ainda é apenas "client"**, não vai conseguir entrar no painel admin. Vamos resolver isso agora.

### Passo 8.4 — Promova-se a super-administrador

1. Volte ao painel Supabase.
2. Menu **Authentication** → **Users**.
3. Encontre seu e-mail na lista. **Copie o ID** (UUID longo, formato `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`). Clique nos três pontinhos `⋮` ao lado do seu e-mail → você verá o ID.
4. Vá em **SQL Editor** → **+ New query**.
5. Cole este comando, **substituindo o `<id>` pelo seu ID real**:

```sql
update public.users
   set role = 'super_admin',
       client_id = null,
       status = 'active'
 where id = '<id>';
```

Por exemplo, se seu ID for `0a1b2c3d-...`, fica:

```sql
update public.users
   set role = 'super_admin',
       client_id = null,
       status = 'active'
 where id = '0a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d';
```

6. Clique em **Run**. Deve aparecer "Success. No rows returned" e na parte inferior dizer "1 row affected".

### Passo 8.5 — Saia e entre de novo

Para o sistema reconhecer seu novo papel:

1. Volte ao site da IMO Insights, na sua área logada.
2. Clique em **Sair** (botão no canto superior direito).
3. Volte para `/login.html`.
4. Faça login com seu e-mail e senha.
5. Você vai receber um **código de 6 dígitos por e-mail** — esse é o segundo fator (2FA). Cole-o e entre.
6. Você cai automaticamente no **Painel administrativo**.

A partir daqui, você pode usar a tela **Usuários → Convidar usuário** para criar todos os outros usuários (admins, editores, clientes).

Pronto, parte 8 completa.

---

## Parte 9 — Teste tudo (15 min)

Antes de virar a chave para produção real, faça este checklist rápido para garantir que tudo está funcionando.

### 9.1 — Login e 2FA

- [ ] Saia. Faça login com seu e-mail/senha.
- [ ] Recebeu o código de 6 dígitos por e-mail (em até 1 minuto).
- [ ] Código funcionou e te levou ao painel.

### 9.2 — Site público intacto

- [ ] Abra o site (`https://peaceful-marshmallow-b2a880.netlify.app`) **em uma aba anônima** (Ctrl+Shift+N) e navegue por todas as páginas: Home, Sobre, Produtos, EvB, Abordagem, Time, Contato. Tudo deve estar idêntico ao que era antes.

### 9.3 — Convidar um cliente de teste

- [ ] No painel admin, vá em **Clientes** → **+ Nova empresa-cliente**. Crie uma empresa "Teste Ltda".
- [ ] Vá em **Usuários** → **+ Convidar usuário**. Convide um e-mail seu alternativo (ou Mailinator/Yopmail) como **client** vinculado a "Teste Ltda".
- [ ] Vá no e-mail desse cliente, aceite o convite, defina senha.
- [ ] Faça login como esse cliente. Deve receber OTP. Deve cair no dashboard de cliente vendo "Nenhum projeto disponível".

### 9.4 — Subir um conteúdo de ponta a ponta

- [ ] Saia. Logue como admin. Crie um projeto vinculado à "Teste Ltda".
- [ ] **Convide um usuário com papel `editor`** (também via Usuários → Convidar).
- [ ] Logue como esse editor. Vá em **Nova submissão**, selecione "Teste Ltda", o projeto, suba um PDF qualquer.
- [ ] Saia, logue como cliente. Confirme que **NÃO vê o conteúdo** ainda (está pendente).
- [ ] Saia, logue como admin. Vá na **Fila**. Aprove a submissão.
- [ ] Saia, logue como cliente. Agora vê o conteúdo. Clique em **Baixar** — deve funcionar.

### 9.5 — Versionamento

- [ ] Logue como editor. **Nova submissão** → modo "Nova versão" → selecione o slot que acabou de aprovar → suba outro PDF.
- [ ] Logue como cliente. Veja que ainda mostra a versão antiga.
- [ ] Logue como admin. Aprove a v2.
- [ ] Logue como cliente. Vê a v2 com data atualizada. Aba "Histórico" mostra a v1.

### 9.6 — Recuperação de senha

- [ ] Saia. Em `/login.html`, clique em "Esqueci a senha". Digite seu e-mail.
- [ ] Receba o e-mail e clique no link.
- [ ] Defina nova senha. Tente logar. Funciona.

Se passou por todos esses testes, **está tudo funcionando como deve**. Você pode começar a convidar os clientes reais e os editores.

---

## Quando virar para o domínio definitivo (imoinsights.com.br)

Quando estiver tudo funcionando no domínio de teste `peaceful-marshmallow-b2a880.netlify.app` e quiser virar para o `imoinsights.com.br`, faça **nesta ordem**:

### 1. Conecte o domínio no Netlify

1. No painel Netlify do site → **Domain management** → **Add custom domain** → digite `imoinsights.com.br`.
2. Siga as instruções de DNS que o Netlify mostrar (geralmente um CNAME ou registros A).
3. Aguarde alguns minutos. No painel, o status deve mudar para **Netlify DNS** ou **Verified**.
4. O Netlify provisiona certificado SSL automático (Let's Encrypt). Aguarde até "Provisioned" aparecer (uns 5 min depois do DNS propagar).

### 2. Atualize `assets/js/env-config.js`

Troque `SITE_URL` para o domínio novo:

```javascript
SITE_URL: 'https://imoinsights.com.br'
```

Salve, faça commit, faça push.

### 3. Atualize a variável de ambiente `SITE_URL` no Netlify

1. No painel Netlify → **Site configuration** → **Environment variables**.
2. Edite `SITE_URL` para `https://imoinsights.com.br`.
3. Em **Deploys**, dispare **Trigger deploy → Clear cache and deploy site**.

### 4. Atualize as URLs no Supabase

Em **Authentication → URL Configuration**:

1. **Site URL**: troque para `https://imoinsights.com.br`.
2. **Redirect URLs**: clique em **Add URL** e adicione `https://imoinsights.com.br/definir-senha.html`. **Mantenha o redirect antigo do `peaceful-marshmallow...netlify.app/definir-senha.html` por mais alguns dias** como rede de segurança — caso algum usuário tenha um link antigo de e-mail (recuperação ou convite) e clique nele, ainda funciona. Depois você apaga.
3. Salve.

### 5. Atualize o `RESEND_FROM` se ainda estava usando o domínio padrão

Se você estava usando `onboarding@resend.dev` durante o teste, agora que vai para produção, finalize a verificação do domínio no Resend (Parte 4) e troque a variável `RESEND_FROM` no Netlify para `IMO Insights <noreply@imoinsights.com.br>`. Dispare outro deploy.

### 6. Refaça o checklist da parte 9

Para garantir que nada quebrou na virada, faça os 6 testes da Parte 9 novamente, agora no domínio `imoinsights.com.br`.

---

## Se algo não funcionar

### O e-mail de OTP / convite não chega

Causa mais comum: domínio não-verificado no Resend.

1. Vá em **Resend → Domains**. Veja se está com sinal verde (verified).
2. Se ainda está laranja/cinza, aguarde mais (DNS pode demorar até 24h) ou verifique se as entradas DNS foram cadastradas certas.
3. Veja em **Resend → Logs** se a tentativa de envio foi feita.
4. Confira a pasta de spam.

### Recebo "Não foi possível inicializar..." no login

Causa: o `env-config.js` não foi atualizado com os valores corretos OU o deploy não pegou.

1. Abra o site, aperte F12 (DevTools), aba **Console**.
2. Recarregue a página com Ctrl+Shift+R.
3. Se vir mensagem "placeholders não substituídos", revise a parte 5 deste guia.
4. Se ver mensagem do Supabase, talvez a chave esteja errada. Compare cuidadosamente com o painel.

### "Token inválido" ao chamar /api/...

Causa mais comum: variáveis de ambiente do Netlify não cadastradas ou o redeploy não foi feito.

1. Volte na parte 6, confira que as 6 variáveis estão lá.
2. Em **Deploys**, clique em **Trigger deploy** → **Clear cache and deploy site**.
3. Aguarde terminar e tente de novo.

### Usuário criado pelo painel admin não aparece

Causa: às vezes o cache do navegador atrapalha.

1. Aperte **F5** ou clique no botão "Recarregar" do painel.
2. Se persistir, vá no Supabase → Table Editor → tabela `users` e confira que a linha existe.

### Erro 500 em alguma Function

1. Vá em **Netlify → Functions**.
2. Clique no nome da Function que deu erro (ex.: `sign-download`).
3. Aba **Logs**. A mensagem de erro detalhada está lá.
4. Mande pra mim na conversa que eu te ajudo a interpretar.

### Quero refazer tudo do zero

No Supabase:
1. **Project Settings → General → Pause/Restore project** ou simplesmente delete o projeto e crie um novo.
2. Anote as novas chaves e atualize o `env-config.js` e as env vars do Netlify.

---

## Próximos passos depois que estiver funcionando

1. **Backup**: configure backup automático do banco no Supabase (Settings → Database → Backups). No plano gratuito você tem 7 dias de backup automático.
2. **Domínio próprio para e-mails**: se quer que os e-mails saiam de `noreply@imoinsights.com.br` em vez de `noreply@resend.dev`, finalize a verificação do domínio no Resend (parte 4.3).
3. **Desabilite o seed**: depois de criar usuários reais, lembre-se que o seed criou usuários fictícios com senha `imo-insights-2025`. Desative-os no painel admin (Usuários → status: desativado) ou apague pelo SQL Editor:
   ```sql
   delete from auth.users where email like '%@imoinsights.dev' or email like '%@empresa-alpha.test' or email like '%@empresa-beta.test';
   ```

---

Acabou. Se travou em algum passo, me chama de volta na conversa do Cowork — eu sigo daí com você.
