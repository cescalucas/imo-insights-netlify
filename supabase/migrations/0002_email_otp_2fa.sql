-- ============================================================
-- IMO Insights — 2FA por e-mail (universal, todos os papéis)
-- Migration: 0002_email_otp_2fa
-- ============================================================
-- Aplica APÓS 0001_init.
--
-- Adiciona:
--   email_otp_codes  → códigos OTP transitórios (TTL 10 min)
--   mfa_grants       → "concessões" de 2FA passadas com sucesso
--                      (TTL configurável; padrão 8 horas)
--
-- O fluxo é gerido por Functions com service_role; não há policies
-- abertas para leitura/escrita por usuários autenticados.
-- ============================================================

-- ============================================================
-- email_otp_codes
-- ============================================================
create table public.email_otp_codes (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  code_hash       text        not null,            -- sha256 hex do código
  purpose         text        not null default 'login_2fa'
                              check (purpose in ('login_2fa')),
  expires_at      timestamptz not null,            -- agora + 10 min
  consumed_at     timestamptz,
  attempts        int         not null default 0,  -- contagem de tentativas erradas
  ip_address      text,
  user_agent      text,
  created_at      timestamptz not null default now()
);

create index email_otp_user_active_idx
  on public.email_otp_codes(user_id, expires_at desc)
  where consumed_at is null;

comment on table public.email_otp_codes is
  'Códigos OTP de 6 dígitos enviados por e-mail. Hash SHA-256 (com user_id como sal). TTL 10 minutos. Máximo 5 tentativas por código.';

-- ============================================================
-- mfa_grants
-- ============================================================
create table public.mfa_grants (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  method          text        not null default 'email_otp'
                              check (method in ('email_otp','totp')),
  issued_at       timestamptz not null default now(),
  valid_until     timestamptz not null,
  ip_address      text,
  user_agent      text,
  revoked_at      timestamptz,
  created_at      timestamptz not null default now()
);

create index mfa_grants_user_active_idx
  on public.mfa_grants(user_id, valid_until)
  where revoked_at is null;

comment on table public.mfa_grants is
  'Concessões de 2FA. Quando user_id tem ao menos uma linha não-revogada com valid_until > now(), considera-se que passou o segundo fator.';

-- ============================================================
-- RLS — sem policies abertas. Apenas service_role acessa.
-- ============================================================
alter table public.email_otp_codes enable row level security;
alter table public.email_otp_codes force  row level security;

alter table public.mfa_grants      enable row level security;
alter table public.mfa_grants      force  row level security;

-- ============================================================
-- Função utilitária: limpeza de OTPs e grants antigos
-- Chamar via cron diário (Supabase Scheduled Functions ou pg_cron).
-- ============================================================
create or replace function public.cleanup_expired_otp_and_grants()
returns void language sql security definer set search_path = public as $$
  delete from public.email_otp_codes
   where expires_at < now() - interval '1 hour';
  delete from public.mfa_grants
   where valid_until < now() - interval '7 days';
$$;

revoke all on function public.cleanup_expired_otp_and_grants() from public;

-- ============================================================
-- View: usuários com 2FA ativa neste momento
-- (apenas para auditoria interna; útil em queries SQL diretas)
-- ============================================================
create or replace view public.users_with_active_mfa as
  select u.id, u.email, u.full_name, u.role,
         max(g.valid_until) as mfa_valid_until,
         count(g.id)        as active_grants
  from public.users u
  left join public.mfa_grants g
    on g.user_id = u.id
   and g.revoked_at is null
   and g.valid_until > now()
  group by u.id, u.email, u.full_name, u.role;

-- ============================================================
-- FIM da migration 0002
-- ============================================================
