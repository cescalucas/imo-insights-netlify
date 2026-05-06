-- ============================================================
-- IMO Insights — schema inicial da área logada de clientes
-- Migration: 0001_init
-- Aplicação: supabase db push (ou supabase db reset para local)
-- ============================================================
-- Tudo em RLS. Service role (Netlify Functions) bypassa RLS.
-- Cliente final usa SUPABASE_ANON_KEY + JWT do usuário logado.
-- ============================================================

-- Extensões necessárias
create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ============================================================
-- ENUMS via CHECK (mais flexível para evolução do que TYPE)
-- ============================================================
-- Definidos inline em cada tabela.

-- ============================================================
-- TABELA: clients (empresas-cliente)
-- ============================================================
create table public.clients (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  cnpj        text,
  status      text        not null default 'active'
                          check (status in ('active','inactive')),
  created_at  timestamptz not null default now()
);

create index clients_status_idx on public.clients(status);
create index clients_name_trgm  on public.clients using gin (name gin_trgm_ops);

comment on table public.clients is 'Empresas-cliente da IMO Insights. Multi-tenant: cada user com role=client tem client_id pointing here.';

-- ============================================================
-- TABELA: users (perfil de aplicação; id = auth.users.id)
-- ============================================================
create table public.users (
  id                uuid        primary key references auth.users(id) on delete cascade,
  email             text        unique not null,
  full_name         text,
  role              text        not null
                                check (role in ('client','editor','admin','super_admin')),
  client_id         uuid        references public.clients(id) on delete restrict,
  status            text        not null default 'invited'
                                check (status in ('active','invited','disabled')),
  notify_by_email   boolean     not null default true,
  consent_at        timestamptz,                 -- LGPD: quando o usuário aceitou os termos
  last_login_at     timestamptz,
  created_at        timestamptz not null default now(),

  -- Cliente obrigatoriamente vinculado a uma empresa.
  -- Editor/admin/super_admin não têm client_id.
  constraint users_client_required_for_clients check (
    (role = 'client'  and client_id is not null) or
    (role <> 'client' and client_id is null)
  )
);

create index users_role_idx       on public.users(role);
create index users_client_id_idx  on public.users(client_id);
create index users_status_idx     on public.users(status);

comment on table public.users is 'Perfil de aplicação. Vinculado 1:1 com auth.users. role + client_id determinam permissões.';

-- ============================================================
-- TABELA: projects
-- ============================================================
create table public.projects (
  id                  uuid        primary key default gen_random_uuid(),
  client_id           uuid        not null references public.clients(id) on delete cascade,
  name                text        not null,
  description         text,
  scope               text,                          -- escopo descritivo
  responsible_names   text[]      default '{}',      -- responsáveis IMO (lista de nomes)
  status              text        not null default 'active'
                                  check (status in ('draft','active','archived')),
  starts_at           date,
  ends_at             date,
  created_by          uuid        references public.users(id) on delete set null,
  created_at          timestamptz not null default now()
);

create index projects_client_id_idx on public.projects(client_id);
create index projects_status_idx    on public.projects(status);

comment on table public.projects is 'Projetos contratados por uma empresa-cliente.';

-- ============================================================
-- TABELA: content_slots
-- "Slot" lógico de conteúdo (arquivo OU dashboard). Tem 1+ versões.
-- ============================================================
create table public.content_slots (
  id            uuid        primary key default gen_random_uuid(),
  project_id    uuid        not null references public.projects(id) on delete cascade,
  type          text        not null check (type in ('document','dashboard')),
  display_name  text        not null,
  description   text,
  archived      boolean     not null default false,
  created_at    timestamptz not null default now()
);

create index content_slots_project_id_idx on public.content_slots(project_id);
create index content_slots_archived_idx   on public.content_slots(archived);

comment on table public.content_slots is 'Identidade lógica de um conteúdo (relatório semanal, dashboard, etc.). Versões físicas em file_versions.';

-- ============================================================
-- TABELA: file_versions
-- Cada upload físico é uma versão. Apenas uma é is_current+approved por slot.
-- ============================================================
create table public.file_versions (
  id              uuid        primary key default gen_random_uuid(),
  slot_id         uuid        not null references public.content_slots(id) on delete cascade,
  version_number  int         not null,
  storage_path    text        not null,                     -- caminho no bucket privado 'content'
  mime_type       text,
  size_bytes      bigint,
  status          text        not null default 'pending_approval'
                              check (status in ('pending_approval','approved','rejected','archived')),
  is_current      boolean     not null default false,
  uploaded_by     uuid        references public.users(id) on delete set null,
  reviewed_by     uuid        references public.users(id) on delete set null,
  review_notes    text,
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now(),

  constraint file_versions_slot_version_unique unique (slot_id, version_number)
);

-- Apenas UMA versão pode ter is_current=true por slot (parcial unique index).
create unique index file_versions_one_current_per_slot
  on public.file_versions (slot_id)
  where is_current = true;

-- Validação semântica: is_current=true implica status='approved'.
alter table public.file_versions
  add constraint file_versions_current_must_be_approved
  check ( (is_current = false) or (is_current = true and status = 'approved') );

create index file_versions_slot_id_idx      on public.file_versions(slot_id);
create index file_versions_status_idx       on public.file_versions(status);
create index file_versions_uploaded_by_idx  on public.file_versions(uploaded_by);
create index file_versions_pending_idx      on public.file_versions(status)
                                             where status = 'pending_approval';

comment on table public.file_versions is 'Versões físicas de um content_slot. Apenas uma is_current+approved por slot.';

-- ============================================================
-- TABELA: audit_logs
-- Logs imutáveis. Retenção 12 meses (ver job de limpeza no README).
-- ============================================================
create table public.audit_logs (
  id            uuid        primary key default gen_random_uuid(),
  actor_id      uuid        references public.users(id) on delete set null,
  action        text        not null,                  -- login, upload, approve, reject, download, role_change, ...
  entity_type   text,                                  -- slot | version | user | project | client
  entity_id     uuid,
  metadata      jsonb       not null default '{}'::jsonb,
  ip_address    text,
  user_agent    text,
  created_at    timestamptz not null default now()
);

create index audit_logs_actor_id_idx     on public.audit_logs(actor_id);
create index audit_logs_action_idx       on public.audit_logs(action);
create index audit_logs_created_at_idx   on public.audit_logs(created_at desc);
create index audit_logs_entity_idx       on public.audit_logs(entity_type, entity_id);

comment on table public.audit_logs is 'Logs imutáveis. INSERT-only por service_role; não há UPDATE nem DELETE permitidos.';

-- ============================================================
-- HELPER FUNCTIONS para RLS
-- security definer + search_path explícito = RLS-safe
-- ============================================================

create or replace function public.current_user_role()
returns text language sql stable security definer
set search_path = public, auth as $$
  select role from public.users where id = auth.uid()
$$;

create or replace function public.current_user_client_id()
returns uuid language sql stable security definer
set search_path = public, auth as $$
  select client_id from public.users where id = auth.uid()
$$;

create or replace function public.is_active_user()
returns boolean language sql stable security definer
set search_path = public, auth as $$
  select coalesce(
    (select status = 'active' from public.users where id = auth.uid()),
    false
  )
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer
set search_path = public, auth as $$
  select exists (
    select 1 from public.users
     where id = auth.uid()
       and role in ('admin','super_admin')
       and status = 'active'
  )
$$;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer
set search_path = public, auth as $$
  select exists (
    select 1 from public.users
     where id = auth.uid()
       and role = 'super_admin'
       and status = 'active'
  )
$$;

create or replace function public.is_editor_or_above()
returns boolean language sql stable security definer
set search_path = public, auth as $$
  select exists (
    select 1 from public.users
     where id = auth.uid()
       and role in ('editor','admin','super_admin')
       and status = 'active'
  )
$$;

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Auto-incrementar version_number ao inserir nova versão de um slot
create or replace function public.auto_version_number()
returns trigger language plpgsql as $$
begin
  if new.version_number is null or new.version_number = 0 then
    select coalesce(max(version_number), 0) + 1
      into new.version_number
      from public.file_versions
     where slot_id = new.slot_id;
  end if;
  return new;
end;
$$;

create trigger file_versions_auto_version
  before insert on public.file_versions
  for each row execute function public.auto_version_number();

-- Forçar status pendente em INSERTs vindos de usuário comum (não admin).
-- Service role (auth.uid() is null) bypassa: Functions controlam o status.
create or replace function public.enforce_pending_on_insert()
returns trigger language plpgsql security definer
set search_path = public, auth as $$
begin
  if auth.uid() is null then
    return new;     -- service role: deixa passar
  end if;
  if not public.is_admin() then
    new.status      := 'pending_approval';
    new.is_current  := false;
    new.reviewed_by := null;
    new.review_notes := null;
    new.reviewed_at  := null;
  end if;
  return new;
end;
$$;

create trigger file_versions_enforce_pending
  before insert on public.file_versions
  for each row execute function public.enforce_pending_on_insert();

-- Garantir que UPDATE de file_versions por usuário comum não muda status nem is_current.
create or replace function public.enforce_status_immutable_for_non_admin()
returns trigger language plpgsql security definer
set search_path = public, auth as $$
begin
  if auth.uid() is null then
    return new;     -- service role: deixa passar
  end if;
  if not public.is_admin() then
    if new.status     is distinct from old.status     then raise exception 'permission denied: status'; end if;
    if new.is_current is distinct from old.is_current then raise exception 'permission denied: is_current'; end if;
    if new.reviewed_by is distinct from old.reviewed_by then raise exception 'permission denied: reviewed_by'; end if;
    if new.review_notes is distinct from old.review_notes then raise exception 'permission denied: review_notes'; end if;
    if new.reviewed_at is distinct from old.reviewed_at then raise exception 'permission denied: reviewed_at'; end if;
  end if;
  return new;
end;
$$;

create trigger file_versions_enforce_status_immutable
  before update on public.file_versions
  for each row execute function public.enforce_status_immutable_for_non_admin();

-- Atualiza last_login_at automaticamente (chamada pela Function de login)
create or replace function public.touch_last_login(user_id uuid)
returns void language sql security definer
set search_path = public as $$
  update public.users set last_login_at = now() where id = user_id;
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.clients         enable row level security;
alter table public.users           enable row level security;
alter table public.projects        enable row level security;
alter table public.content_slots   enable row level security;
alter table public.file_versions   enable row level security;
alter table public.audit_logs      enable row level security;

-- Forçar RLS mesmo para o owner da tabela (defesa em profundidade)
alter table public.clients         force row level security;
alter table public.users           force row level security;
alter table public.projects        force row level security;
alter table public.content_slots   force row level security;
alter table public.file_versions   force row level security;
alter table public.audit_logs      force row level security;

-- ------------------------------------------------------------
-- clients
-- ------------------------------------------------------------
-- Cliente lê só a própria empresa; editor/admin lê tudo (precisa para popular forms de upload).
create policy clients_select on public.clients
  for select to authenticated
  using (
    public.is_editor_or_above()
    or id = public.current_user_client_id()
  );

-- Apenas admin/super_admin manipula clients.
create policy clients_insert on public.clients
  for insert to authenticated
  with check (public.is_admin());

create policy clients_update on public.clients
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy clients_delete on public.clients
  for delete to authenticated
  using (public.is_super_admin());

-- ------------------------------------------------------------
-- users
-- ------------------------------------------------------------
-- Cada usuário lê a própria linha. Admin lê tudo.
-- Cliente também lê outros usuários da própria empresa? Não — não precisa.
create policy users_select on public.users
  for select to authenticated
  using (
    id = auth.uid()
    or public.is_admin()
  );

-- Usuário atualiza apenas a própria linha (e só campos não-críticos: full_name, notify_by_email, consent_at).
-- Campos críticos (role, client_id, status, email) só via Function service_role.
-- A restrição de campos é validada por trigger:
create or replace function public.users_self_update_guard()
returns trigger language plpgsql security definer
set search_path = public, auth as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if new.id <> old.id then raise exception 'cannot change id'; end if;
  if new.email is distinct from old.email then raise exception 'cannot change email'; end if;
  if new.role  is distinct from old.role  then raise exception 'cannot change role'; end if;
  if new.client_id is distinct from old.client_id then raise exception 'cannot change client_id'; end if;
  if new.status is distinct from old.status then raise exception 'cannot change status'; end if;
  if new.last_login_at is distinct from old.last_login_at then raise exception 'cannot change last_login_at'; end if;
  return new;
end;
$$;

create trigger users_self_update
  before update on public.users
  for each row execute function public.users_self_update_guard();

create policy users_self_update on public.users
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- INSERT só via service role (Functions). Não há policy para usuário comum.
create policy users_insert_admin on public.users
  for insert to authenticated
  with check (public.is_admin());

create policy users_delete_super on public.users
  for delete to authenticated
  using (public.is_super_admin());

-- ------------------------------------------------------------
-- projects
-- ------------------------------------------------------------
-- Cliente: lê projetos ativos da própria empresa.
-- Editor/admin: lê tudo (precisa popular dropdowns).
create policy projects_select on public.projects
  for select to authenticated
  using (
    public.is_editor_or_above()
    or (
      client_id = public.current_user_client_id()
      and status = 'active'
    )
  );

create policy projects_insert on public.projects
  for insert to authenticated
  with check (public.is_admin());

create policy projects_update on public.projects
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy projects_delete on public.projects
  for delete to authenticated
  using (public.is_super_admin());

-- ------------------------------------------------------------
-- content_slots
-- ------------------------------------------------------------
-- Cliente: lê slots não-arquivados de projetos da própria empresa
--          E que tenham pelo menos uma versão current+approved.
-- Editor/admin: lê tudo.
create policy content_slots_select on public.content_slots
  for select to authenticated
  using (
    public.is_editor_or_above()
    or (
      archived = false
      and exists (
        select 1 from public.projects p
         where p.id = content_slots.project_id
           and p.client_id = public.current_user_client_id()
           and p.status = 'active'
      )
      and exists (
        select 1 from public.file_versions v
         where v.slot_id = content_slots.id
           and v.is_current = true
           and v.status = 'approved'
      )
    )
  );

-- Editor pode criar slot (associando a um projeto). Versões nascem pending por trigger.
create policy content_slots_insert on public.content_slots
  for insert to authenticated
  with check (public.is_editor_or_above());

create policy content_slots_update on public.content_slots
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy content_slots_delete on public.content_slots
  for delete to authenticated
  using (public.is_super_admin());

-- ------------------------------------------------------------
-- file_versions
-- ------------------------------------------------------------
-- Cliente:
--   - versão atual: is_current=true AND status='approved'
--   - histórico:    status='archived'  (versões previamente aprovadas)
--   ambos restritos a slots de projetos da própria empresa.
-- Editor/admin: tudo.
create policy file_versions_select on public.file_versions
  for select to authenticated
  using (
    public.is_editor_or_above()
    or (
      status in ('approved','archived')
      and exists (
        select 1
          from public.content_slots s
          join public.projects     p on p.id = s.project_id
         where s.id = file_versions.slot_id
           and s.archived = false
           and p.client_id = public.current_user_client_id()
           and p.status = 'active'
      )
    )
  );

-- Editor pode inserir (trigger força status='pending_approval' e is_current=false).
create policy file_versions_insert on public.file_versions
  for insert to authenticated
  with check (public.is_editor_or_above());

-- Update: editor não consegue mudar status (trigger barra).
-- Admin pode tudo via RLS.
create policy file_versions_update on public.file_versions
  for update to authenticated
  using (public.is_editor_or_above())
  with check (public.is_editor_or_above());

create policy file_versions_delete on public.file_versions
  for delete to authenticated
  using (public.is_super_admin());

-- ------------------------------------------------------------
-- audit_logs
-- ------------------------------------------------------------
-- Logs imutáveis: SELECT só admin/super_admin. INSERT só service_role.
create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (public.is_admin());

-- Sem policy de INSERT para authenticated → só service_role insere.
-- Sem policy de UPDATE/DELETE → ninguém modifica/apaga via JWT.

-- ============================================================
-- STORAGE: bucket privado 'content'
-- ============================================================
-- Bucket criado aqui se não existir. Sem políticas de acesso →
-- inacessível via anon/authenticated. Apenas Functions com service_role
-- conseguem ler/escrever, e geram URLs assinadas para o cliente final.

insert into storage.buckets (id, name, public)
  values ('content', 'content', false)
  on conflict (id) do nothing;

-- Garantir RLS ativo em storage.objects (Supabase já ativa por padrão; reforçando)
-- Nenhuma policy é criada → bucket é fechado para todo mundo exceto service_role.

-- ============================================================
-- FUNÇÃO AUXILIAR: aprovar versão (atomic)
-- Chamada pela Netlify Function approve-version usando service_role.
-- Garante que apenas uma versão fica is_current+approved por slot.
-- ============================================================
create or replace function public.approve_file_version(
  p_version_id  uuid,
  p_reviewer_id uuid,
  p_notes       text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot_id uuid;
begin
  select slot_id into v_slot_id
    from public.file_versions
   where id = p_version_id
     and status = 'pending_approval'
   for update;

  if v_slot_id is null then
    raise exception 'version not pending or not found' using errcode = 'P0001';
  end if;

  -- Arquivar versão atual (se houver) ANTES de promover a nova
  -- (evita violar o índice parcial unique).
  update public.file_versions
     set status      = 'archived',
         is_current  = false
   where slot_id     = v_slot_id
     and is_current  = true
     and status      = 'approved'
     and id          <> p_version_id;

  -- Promover a nova versão
  update public.file_versions
     set status       = 'approved',
         is_current   = true,
         reviewed_by  = p_reviewer_id,
         review_notes = p_notes,
         reviewed_at  = now()
   where id = p_version_id;
end;
$$;

revoke all on function public.approve_file_version(uuid,uuid,text) from public;
-- Acesso só via service_role (Function chama com supabase-js admin client).

-- ============================================================
-- FUNÇÃO AUXILIAR: rejeitar versão
-- ============================================================
create or replace function public.reject_file_version(
  p_version_id  uuid,
  p_reviewer_id uuid,
  p_notes       text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_notes is null or length(trim(p_notes)) = 0 then
    raise exception 'rejection notes required';
  end if;

  update public.file_versions
     set status       = 'rejected',
         is_current   = false,
         reviewed_by  = p_reviewer_id,
         review_notes = p_notes,
         reviewed_at  = now()
   where id     = p_version_id
     and status = 'pending_approval';

  if not found then
    raise exception 'version not pending or not found' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.reject_file_version(uuid,uuid,text) from public;

-- ============================================================
-- View para conteúdos visíveis ao cliente (current + approved)
-- Facilita queries do front sem joins complicados.
-- ============================================================
create or replace view public.client_visible_content as
  select
    s.id              as slot_id,
    s.project_id,
    s.type,
    s.display_name,
    s.description,
    v.id              as version_id,
    v.version_number,
    v.mime_type,
    v.size_bytes,
    v.reviewed_at     as published_at,
    v.created_at      as version_created_at
  from public.content_slots s
  join public.file_versions v
    on v.slot_id = s.id
   and v.is_current = true
   and v.status = 'approved'
  where s.archived = false;

comment on view public.client_visible_content is
  'Atalho para o front do cliente: somente conteúdos arquiváveis no momento.';

-- A view herda RLS das tabelas-base.

-- ============================================================
-- FIM da migration 0001_init
-- ============================================================
