-- ============================================================
-- IMO Insights — tabela de leads (contatos do site público)
-- Migration: 0004_leads
-- Centraliza downloads de material (EVB) e formulário de contato.
-- INSERT só via service_role (Netlify Functions). SELECT/UPDATE só admin.
-- ============================================================

create table public.leads (
  id           uuid        primary key default gen_random_uuid(),
  source       text        not null check (source in ('download','contato')),
  name         text        not null,
  email        text        not null,
  company      text,
  product      text,                 -- contato: produto de interesse
  study_id     text,                 -- download: id do estudo
  study_title  text,                 -- download: título do estudo
  message      text,                 -- contato: mensagem livre
  status       text        not null default 'novo'
                           check (status in ('novo','em_contato','qualificado','descartado')),
  ip_address   text,
  user_agent   text,
  handled_by   uuid        references public.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index leads_created_at_idx on public.leads(created_at desc);
create index leads_source_idx     on public.leads(source);
create index leads_status_idx     on public.leads(status);
create index leads_email_trgm     on public.leads using gin (email gin_trgm_ops);

comment on table public.leads is 'Leads do site público: downloads de material e formulário de contato. INSERT via service_role; gestão por admin.';

-- updated_at automático
create or replace function public.leads_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger leads_touch_updated
  before update on public.leads
  for each row execute function public.leads_touch_updated_at();

-- ============================================================
-- RLS
-- ============================================================
alter table public.leads enable row level security;
alter table public.leads force row level security;

-- Leitura e gestão só para admin/super_admin (dado comercial sensível).
create policy leads_select on public.leads
  for select to authenticated
  using (public.is_admin());

create policy leads_update on public.leads
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Sem policy de INSERT para authenticated → só service_role (Functions) insere.
-- Exclusão apenas super_admin.
create policy leads_delete on public.leads
  for delete to authenticated
  using (public.is_super_admin());
