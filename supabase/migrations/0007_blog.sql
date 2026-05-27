-- ============================================================
-- IMO Insights — Blog
-- Migration: 0007_blog
--
-- Tabela `blog_posts` + bucket público `blog-covers` para capas.
-- Workflow editorial:
--   editor cria como 'draft' → editor "envia para revisão" ('pending_review')
--   → admin publica ('published') ou devolve para draft → admin pode arquivar.
--
-- Permissões:
--   SELECT  : anon + authenticated podem ver SOMENTE published;
--             editor+ vê tudo (drafts, pending_review, archived).
--   INSERT  : editor+ (sempre como draft; author_id forçado para auth.uid()).
--   UPDATE  : editor pode editar APENAS posts próprios em draft/pending_review;
--             admin pode editar qualquer post e mudar status livremente.
--   DELETE  : super_admin apenas.
-- ============================================================

create table public.blog_posts (
  id               uuid        primary key default gen_random_uuid(),
  slug             text        not null unique,
  title            text        not null,
  excerpt          text,
  cover_image_url  text,                       -- URL pública no Storage (bucket blog-covers)
  cover_image_path text,                       -- path interno no bucket (para delete)
  content_md       text        not null default '',
  tags             text[]      not null default '{}',
  author_id        uuid        not null references public.users(id) on delete restrict,
  reviewed_by      uuid        references public.users(id) on delete set null,
  status           text        not null default 'draft'
                              check (status in ('draft','pending_review','published','archived')),
  published_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index blog_posts_status_idx        on public.blog_posts(status);
create index blog_posts_published_at_idx  on public.blog_posts(published_at desc nulls last);
create index blog_posts_author_idx        on public.blog_posts(author_id);
create index blog_posts_tags_gin          on public.blog_posts using gin (tags);
create index blog_posts_slug_idx          on public.blog_posts(slug);

comment on table public.blog_posts is
  'Posts do blog público. Workflow: draft → pending_review → published. Editor cria, admin aprova.';

-- ============================================================
-- TRIGGERS
-- ============================================================

-- updated_at automático
create or replace function public.blog_posts_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger blog_posts_touch_updated
  before update on public.blog_posts
  for each row execute function public.blog_posts_touch_updated_at();

-- Preenche published_at automaticamente ao virar 'published'
create or replace function public.blog_posts_set_published_at()
returns trigger language plpgsql as $$
begin
  if new.status = 'published' and (old.status is distinct from 'published') then
    new.published_at := coalesce(new.published_at, now());
    new.reviewed_by  := coalesce(new.reviewed_by, auth.uid());
  end if;
  return new;
end;
$$;

create trigger blog_posts_set_published_at
  before update on public.blog_posts
  for each row execute function public.blog_posts_set_published_at();

-- Bloqueia editor (não-admin) de mudar status para 'published' ou 'archived',
-- e de editar posts já 'published' (só admin altera publicado).
create or replace function public.blog_posts_editor_guard()
returns trigger language plpgsql as $$
begin
  -- Admin pode tudo
  if public.is_admin() then
    return new;
  end if;

  -- Editor (não-admin):
  --   só pode mexer nos próprios posts
  if new.author_id is distinct from auth.uid() then
    raise exception 'Editor só pode editar posts de sua autoria';
  end if;

  --   não pode editar posts já published ou archived
  if old.status in ('published','archived') then
    raise exception 'Posts publicados ou arquivados só podem ser editados por admin';
  end if;

  --   só pode mudar status entre draft ↔ pending_review
  if new.status not in ('draft','pending_review') then
    raise exception 'Editor não pode definir status %', new.status;
  end if;

  --   author_id é imutável
  new.author_id := old.author_id;
  --   published_at e reviewed_by só admin define
  new.published_at := old.published_at;
  new.reviewed_by  := old.reviewed_by;

  return new;
end;
$$;

create trigger blog_posts_editor_guard
  before update on public.blog_posts
  for each row execute function public.blog_posts_editor_guard();

-- Força author_id = auth.uid() e status inicial seguro no INSERT
create or replace function public.blog_posts_insert_guard()
returns trigger language plpgsql as $$
begin
  if not public.is_editor_or_above() then
    raise exception 'Apenas editor ou admin pode criar posts';
  end if;

  -- Editor não pode criar já como published/archived
  if not public.is_admin() and new.status not in ('draft','pending_review') then
    new.status := 'draft';
  end if;

  -- author_id é sempre o usuário corrente (ignora o que veio do client)
  new.author_id := auth.uid();
  new.reviewed_by := null;

  -- Se status veio como 'published' (admin criando), preenche published_at
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
    new.reviewed_by  := auth.uid();
  end if;

  return new;
end;
$$;

create trigger blog_posts_insert_guard
  before insert on public.blog_posts
  for each row execute function public.blog_posts_insert_guard();

-- ============================================================
-- RLS
-- ============================================================
alter table public.blog_posts enable row level security;
alter table public.blog_posts force row level security;

-- Leitura pública: anyone vê posts publicados
create policy blog_posts_select_public on public.blog_posts
  for select to anon
  using (status = 'published');

-- Leitura para authenticated: published para todos; demais status só editor+
create policy blog_posts_select_auth on public.blog_posts
  for select to authenticated
  using (
    status = 'published'
    or public.is_editor_or_above()
  );

-- INSERT: editor+ (o trigger valida e força author_id)
create policy blog_posts_insert on public.blog_posts
  for insert to authenticated
  with check (public.is_editor_or_above());

-- UPDATE: editor pode editar próprios (drafts e pending); admin pode tudo
create policy blog_posts_update on public.blog_posts
  for update to authenticated
  using (
    public.is_admin()
    or (
      public.is_editor_or_above()
      and author_id = auth.uid()
      and status in ('draft','pending_review')
    )
  )
  with check (
    public.is_admin()
    or (
      public.is_editor_or_above()
      and author_id = auth.uid()
      and status in ('draft','pending_review')
    )
  );

-- DELETE: só super_admin
create policy blog_posts_delete on public.blog_posts
  for delete to authenticated
  using (public.is_super_admin());

-- ============================================================
-- STORAGE: bucket público 'blog-covers' (imagens de capa)
-- Leitura pública via CDN; gravação só editor+; delete só admin.
-- ============================================================
insert into storage.buckets (id, name, public)
  values ('blog-covers', 'blog-covers', true)
  on conflict (id) do nothing;

create policy blog_covers_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'blog-covers' and public.is_editor_or_above());

create policy blog_covers_update on storage.objects
  for update to authenticated
  using (bucket_id = 'blog-covers' and public.is_editor_or_above())
  with check (bucket_id = 'blog-covers' and public.is_editor_or_above());

create policy blog_covers_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'blog-covers' and public.is_admin());
