-- ============================================================
-- IMO Insights — expurgo automático de dados efêmeros/antigos
-- Migration: 0007_cleanup_jobs
-- ------------------------------------------------------------
-- Agenda (pg_cron) uma limpeza diária:
--   - email_otp_codes : remove códigos expirados há mais de 24h
--   - mfa_grants      : remove grants vencidos há mais de 7 dias
--   - audit_logs      : retenção de 12 meses (LGPD)
-- A função é SECURITY DEFINER (roda como owner, bypassa RLS).
-- ============================================================

create extension if not exists pg_cron;

create or replace function public.imo_cleanup_expired()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.email_otp_codes where expires_at < now() - interval '24 hours';
  delete from public.mfa_grants      where valid_until < now() - interval '7 days';
  delete from public.audit_logs      where created_at  < now() - interval '12 months';
end;
$$;

revoke all on function public.imo_cleanup_expired() from public;

-- (Re)agenda o job diário às 04:00 UTC (~01:00 BRT).
select cron.unschedule('imo-cleanup-daily')
  where exists (select 1 from cron.job where jobname = 'imo-cleanup-daily');

select cron.schedule(
  'imo-cleanup-daily',
  '0 4 * * *',
  $job$ select public.imo_cleanup_expired(); $job$
);
