-- ============================================================
-- IMO Insights — adiciona origem 'newsletter' à tabela leads
-- Migration: 0006_leads_newsletter_source
-- Usado pelo formulário da landing da Curanews (imo-news-landing.html),
-- que captura inscrições da newsletter semanal de Mari Tozzini.
-- ============================================================

alter table public.leads
  drop constraint if exists leads_source_check;

alter table public.leads
  add constraint leads_source_check
  check (source in ('download','contato','newsletter'));
