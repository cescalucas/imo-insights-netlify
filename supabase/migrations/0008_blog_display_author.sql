-- ============================================================
-- IMO Insights — Blog · coluna de byline override
-- Migration: 0008_blog_display_author
--
-- Adiciona uma coluna opcional `display_author` em blog_posts.
-- Quando preenchida, sobrescreve o nome exibido nas páginas públicas
-- (ex: "IMO Insights" ao invés do nome real do usuário que escreveu).
-- Quando NULL, o front-end usa users.full_name do author_id.
--
-- author_id continua sendo a fonte da verdade pra rastrear autoria
-- e pra RLS — o display_author é só uma camada de apresentação.
-- ============================================================

alter table public.blog_posts
  add column if not exists display_author text;

comment on column public.blog_posts.display_author is
  'Nome exibido como assinatura nas páginas públicas. NULL = usa users.full_name do author_id. Útil para publicar com byline institucional (ex: "IMO Insights").';
