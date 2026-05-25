-- ============================================================
-- IMO Insights — biblioteca de estudos para download (site público)
-- Migration: 0005_study_materials
-- Gestão pelo admin; leitura pública só de publicados. Arquivos no
-- bucket público 'materials'.
-- ============================================================

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table public.study_materials (
  id          uuid        primary key default gen_random_uuid(),
  slug        text        unique not null,
  title       text        not null,
  subtitle    text,                       -- ex: "EVOB · 2025"
  description text,
  file_url    text,                       -- URL pública (bucket) ou caminho relativo
  file_name   text,
  published   boolean     not null default true,
  sort_order  int         not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index study_materials_pub_idx on public.study_materials(published, sort_order);

comment on table public.study_materials is 'Estudos disponíveis para download no site público (EVB e futuros). Gestão por editor/admin; leitura pública de publicados.';

create trigger study_materials_touch_updated
  before update on public.study_materials
  for each row execute function public.touch_updated_at();

-- RLS
alter table public.study_materials enable row level security;
alter table public.study_materials force row level security;

-- Público (anon) lê apenas publicados; admin lê tudo.
create policy study_materials_select on public.study_materials
  for select to anon, authenticated
  using (published = true or public.is_admin());

create policy study_materials_insert on public.study_materials
  for insert to authenticated
  with check (public.is_editor_or_above());

create policy study_materials_update on public.study_materials
  for update to authenticated
  using (public.is_editor_or_above())
  with check (public.is_editor_or_above());

create policy study_materials_delete on public.study_materials
  for delete to authenticated
  using (public.is_admin());

-- ============================================================
-- STORAGE: bucket público 'materials' (PDFs dos estudos)
-- Leitura pública via CDN; gravação só editor/admin.
-- ============================================================
insert into storage.buckets (id, name, public)
  values ('materials', 'materials', true)
  on conflict (id) do nothing;

create policy materials_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'materials' and public.is_editor_or_above());

create policy materials_update on storage.objects
  for update to authenticated
  using (bucket_id = 'materials' and public.is_editor_or_above())
  with check (bucket_id = 'materials' and public.is_editor_or_above());

create policy materials_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'materials' and public.is_admin());

-- Seed dos 3 estudos atuais (apontando para os PDFs estáticos que já existem;
-- ao subir um novo PDF pelo admin, o file_url é atualizado).
insert into public.study_materials (slug, title, subtitle, file_url, file_name, published, sort_order) values
  ('evb-brasil-movimento', 'Brasil em Movimento',  'EVOB · 2023', 'assets/reports/boletim-sinais-fracos-q1-2025.pdf', 'brasil-em-movimento.pdf', true, 1),
  ('evb-cidades-medias',   'Cidades Médias, Grandes Pistas', 'EVOB · 2024', 'assets/reports/mapa-implicacoes-fmcg-2025.pdf', 'cidades-medias.pdf', true, 2),
  ('evb-futebol',          'O País do Futebol?',   'EVOB · 2025', 'assets/reports/cenarios-2025-2027.pdf', 'o-pais-do-futebol.pdf', true, 3)
on conflict (slug) do nothing;
