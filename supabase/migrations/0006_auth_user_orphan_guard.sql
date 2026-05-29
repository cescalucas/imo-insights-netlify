-- ============================================================
-- IMO Insights — proteção contra "órfão" de auth.users
-- Migration: 0006_auth_user_orphan_guard
-- ------------------------------------------------------------
-- Quando um usuário é criado em auth.users FORA do fluxo oficial
-- (ex.: alguém usa o botão Invite do painel do Supabase), não existia
-- a linha correspondente em public.users -> o login quebrava com
-- "Perfil não encontrado". Esta trigger cria um perfil placeholder
-- DESATIVADO, então a conta fica bloqueada (status=disabled) até um
-- admin revisar, ativar e definir papel/empresa corretos.
--
-- O fluxo oficial (Function invite-user) faz UPSERT por cima desse
-- placeholder, definindo papel/empresa/status='invited'.
-- ============================================================

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.users (id, email, full_name, role, status)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data->>'full_name', ''),
    'editor',   -- papel placeholder (não exige client_id)
    'disabled'  -- sem acesso até um admin ativar
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
