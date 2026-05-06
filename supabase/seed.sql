-- ============================================================
-- IMO Insights — seed para desenvolvimento local
-- Aplicado automaticamente após `supabase db reset`.
--
-- Cria:
--   1 super-admin, 1 admin, 1 editor
--   2 empresas-cliente
--   4 usuários-cliente (2 por empresa)
--   3 projetos
--   5 content_slots (2 com versionamento)
--
-- Senha padrão de TODOS os usuários de seed: "imo-insights-2025"
-- TROQUE ANTES DE QUALQUER USO REAL.
-- ============================================================

-- ============================================================
-- Limpeza idempotente (caso já exista alguma coisa)
-- ============================================================
truncate public.audit_logs       restart identity cascade;
truncate public.file_versions    restart identity cascade;
truncate public.content_slots    restart identity cascade;
truncate public.projects         restart identity cascade;
truncate public.users            restart identity cascade;
truncate public.clients          restart identity cascade;

-- Apaga auth.users de seed anteriores (idempotente)
delete from auth.users where email like '%@imoinsights.dev'
                          or email like '%@empresa-alpha.test'
                          or email like '%@empresa-beta.test';

-- ============================================================
-- IDs fixos (tornam o seed reproducível e facilita o teste)
-- ============================================================
do $seed$
declare
  -- empresas
  v_alpha_id uuid := '11111111-aaaa-aaaa-aaaa-111111111111';
  v_beta_id  uuid := '22222222-bbbb-bbbb-bbbb-222222222222';

  -- usuários internos
  v_super_id  uuid := '00000001-0000-0000-0000-000000000001';
  v_admin_id  uuid := '00000002-0000-0000-0000-000000000002';
  v_editor_id uuid := '00000003-0000-0000-0000-000000000003';

  -- clientes
  v_alpha_user1_id uuid := 'aaaa1111-0000-0000-0000-000000000001';
  v_alpha_user2_id uuid := 'aaaa1111-0000-0000-0000-000000000002';
  v_beta_user1_id  uuid := 'bbbb2222-0000-0000-0000-000000000001';
  v_beta_user2_id  uuid := 'bbbb2222-0000-0000-0000-000000000002';

  -- projetos
  v_proj_alpha_tracker uuid := 'aa000001-0000-0000-0000-000000000001';
  v_proj_alpha_categ   uuid := 'aa000002-0000-0000-0000-000000000002';
  v_proj_beta_tracker  uuid := 'bb000001-0000-0000-0000-000000000001';

  -- slots
  v_slot_a1 uuid := 'a1000001-0000-0000-0000-000000000001';
  v_slot_a2 uuid := 'a1000002-0000-0000-0000-000000000002';
  v_slot_a3 uuid := 'a1000003-0000-0000-0000-000000000003';
  v_slot_a4 uuid := 'a2000001-0000-0000-0000-000000000001';
  v_slot_b1 uuid := 'b1000001-0000-0000-0000-000000000001';

  v_default_password text := 'imo-insights-2025';
begin

  -- ============================================================
  -- auth.users (apenas seed local)
  -- ============================================================
  insert into auth.users
    (instance_id, id, aud, role, email, encrypted_password,
     email_confirmed_at, created_at, updated_at,
     raw_app_meta_data, raw_user_meta_data, is_super_admin, is_sso_user)
  values
    -- super-admin
    ('00000000-0000-0000-0000-000000000000', v_super_id,
     'authenticated', 'authenticated', 'super@imoinsights.dev',
     crypt(v_default_password, gen_salt('bf')),
     now(), now(), now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"full_name":"Super Admin IMO"}'::jsonb,
     false, false),

    -- admin
    ('00000000-0000-0000-0000-000000000000', v_admin_id,
     'authenticated', 'authenticated', 'admin@imoinsights.dev',
     crypt(v_default_password, gen_salt('bf')),
     now(), now(), now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"full_name":"Administradora IMO"}'::jsonb,
     false, false),

    -- editor
    ('00000000-0000-0000-0000-000000000000', v_editor_id,
     'authenticated', 'authenticated', 'editor@imoinsights.dev',
     crypt(v_default_password, gen_salt('bf')),
     now(), now(), now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"full_name":"Editor de Conteúdo"}'::jsonb,
     false, false),

    -- cliente Alpha #1
    ('00000000-0000-0000-0000-000000000000', v_alpha_user1_id,
     'authenticated', 'authenticated', 'maria@empresa-alpha.test',
     crypt(v_default_password, gen_salt('bf')),
     now(), now(), now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"full_name":"Maria Souza"}'::jsonb,
     false, false),

    -- cliente Alpha #2
    ('00000000-0000-0000-0000-000000000000', v_alpha_user2_id,
     'authenticated', 'authenticated', 'joao@empresa-alpha.test',
     crypt(v_default_password, gen_salt('bf')),
     now(), now(), now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"full_name":"João Lima"}'::jsonb,
     false, false),

    -- cliente Beta #1
    ('00000000-0000-0000-0000-000000000000', v_beta_user1_id,
     'authenticated', 'authenticated', 'paula@empresa-beta.test',
     crypt(v_default_password, gen_salt('bf')),
     now(), now(), now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"full_name":"Paula Mendes"}'::jsonb,
     false, false),

    -- cliente Beta #2
    ('00000000-0000-0000-0000-000000000000', v_beta_user2_id,
     'authenticated', 'authenticated', 'carlos@empresa-beta.test',
     crypt(v_default_password, gen_salt('bf')),
     now(), now(), now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"full_name":"Carlos Almeida"}'::jsonb,
     false, false);

  -- Cria identities (necessário para login por email/password no Supabase Auth)
  insert into auth.identities
    (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  values
    (gen_random_uuid(), v_super_id,
      jsonb_build_object('sub', v_super_id::text,  'email', 'super@imoinsights.dev'),
      'email', v_super_id::text,  now(), now(), now()),
    (gen_random_uuid(), v_admin_id,
      jsonb_build_object('sub', v_admin_id::text,  'email', 'admin@imoinsights.dev'),
      'email', v_admin_id::text,  now(), now(), now()),
    (gen_random_uuid(), v_editor_id,
      jsonb_build_object('sub', v_editor_id::text, 'email', 'editor@imoinsights.dev'),
      'email', v_editor_id::text, now(), now(), now()),
    (gen_random_uuid(), v_alpha_user1_id,
      jsonb_build_object('sub', v_alpha_user1_id::text, 'email', 'maria@empresa-alpha.test'),
      'email', v_alpha_user1_id::text, now(), now(), now()),
    (gen_random_uuid(), v_alpha_user2_id,
      jsonb_build_object('sub', v_alpha_user2_id::text, 'email', 'joao@empresa-alpha.test'),
      'email', v_alpha_user2_id::text, now(), now(), now()),
    (gen_random_uuid(), v_beta_user1_id,
      jsonb_build_object('sub', v_beta_user1_id::text, 'email', 'paula@empresa-beta.test'),
      'email', v_beta_user1_id::text, now(), now(), now()),
    (gen_random_uuid(), v_beta_user2_id,
      jsonb_build_object('sub', v_beta_user2_id::text, 'email', 'carlos@empresa-beta.test'),
      'email', v_beta_user2_id::text, now(), now(), now());

  -- ============================================================
  -- public.clients
  -- ============================================================
  insert into public.clients (id, name, cnpj, status) values
    (v_alpha_id, 'Empresa Alpha S.A.',          '12.345.678/0001-90', 'active'),
    (v_beta_id,  'Empresa Beta Indústria Ltda.','98.765.432/0001-10', 'active');

  -- ============================================================
  -- public.users
  -- ============================================================
  insert into public.users (id, email, full_name, role, client_id, status, notify_by_email, consent_at) values
    (v_super_id,       'super@imoinsights.dev',  'Super Admin IMO',         'super_admin', null,        'active', true, now()),
    (v_admin_id,       'admin@imoinsights.dev',  'Administradora IMO',      'admin',       null,        'active', true, now()),
    (v_editor_id,      'editor@imoinsights.dev', 'Editor de Conteúdo',      'editor',      null,        'active', true, now()),
    (v_alpha_user1_id, 'maria@empresa-alpha.test','Maria Souza',            'client',      v_alpha_id,  'active', true, now()),
    (v_alpha_user2_id, 'joao@empresa-alpha.test', 'João Lima',              'client',      v_alpha_id,  'active', true, now()),
    (v_beta_user1_id,  'paula@empresa-beta.test', 'Paula Mendes',           'client',      v_beta_id,   'active', true, now()),
    (v_beta_user2_id,  'carlos@empresa-beta.test','Carlos Almeida',         'client',      v_beta_id,   'active', true, now());

  -- ============================================================
  -- public.projects
  -- ============================================================
  insert into public.projects
    (id, client_id, name, description, scope, responsible_names, status, starts_at, ends_at, created_by)
  values
    (v_proj_alpha_tracker, v_alpha_id,
     'Brand Tracker Alpha 2025',
     'Acompanhamento contínuo de saúde de marca com waves trimestrais.',
     'Quanti com 1.200 entrevistas por wave, 4 waves no ano. Cobertura nacional, recorte por região e classe social.',
     ARRAY['Ana Beatriz Castro','Rafael Pinheiro'],
     'active', '2025-01-15', '2025-12-31', v_admin_id),

    (v_proj_alpha_categ, v_alpha_id,
     'Estudo de Categoria — Alpha',
     'Mapeamento de categoria com profundidade qualitativa.',
     'Quali com 32 entrevistas em profundidade + análise desk de 6 marcas concorrentes.',
     ARRAY['Renata Furtado'],
     'active', '2025-03-01', '2025-06-30', v_admin_id),

    (v_proj_beta_tracker, v_beta_id,
     'Brand Tracker Beta 2025',
     'Tracking trimestral com foco em jovens 18–34 nas capitais.',
     'Quanti CAWI com 800 entrevistas por wave, 4 waves no ano.',
     ARRAY['Ana Beatriz Castro'],
     'active', '2025-02-01', '2025-12-31', v_admin_id);

  -- ============================================================
  -- public.content_slots + file_versions
  -- ============================================================

  -- Slot 1: Relatório Março (Alpha tracker) — 1 versão approved
  insert into public.content_slots (id, project_id, type, display_name, description, archived) values
    (v_slot_a1, v_proj_alpha_tracker, 'document',
     'Relatório Mensal — Março 2025',
     'Resultados consolidados da Wave 1, com leitura por região.', false);

  insert into public.file_versions
    (slot_id, version_number, storage_path, mime_type, size_bytes,
     status, is_current, uploaded_by, reviewed_by, reviewed_at, review_notes)
  values
    (v_slot_a1, 1,
     'content/' || v_proj_alpha_tracker || '/' || v_slot_a1 || '/v1-relatorio-marco-2025.pdf',
     'application/pdf', 2_456_789,
     'approved', true, v_editor_id, v_admin_id, now() - interval '8 days',
     'Aprovado conforme revisão de qualidade.');

  -- Slot 2: Relatório Abril (Alpha tracker) — 2 versões: v1 archived, v2 current+approved
  insert into public.content_slots (id, project_id, type, display_name, description, archived) values
    (v_slot_a2, v_proj_alpha_tracker, 'document',
     'Relatório Mensal — Abril 2025',
     'Inclui Wave 2 e leitura cruzada Q1 vs. Q4 do ano anterior.', false);

  insert into public.file_versions
    (slot_id, version_number, storage_path, mime_type, size_bytes,
     status, is_current, uploaded_by, reviewed_by, reviewed_at, review_notes)
  values
    (v_slot_a2, 1,
     'content/' || v_proj_alpha_tracker || '/' || v_slot_a2 || '/v1-relatorio-abril-2025.pdf',
     'application/pdf', 2_312_998,
     'archived', false, v_editor_id, v_admin_id, now() - interval '5 days',
     'Aprovado, depois substituído pela v2 com correção de tabelas.'),
    (v_slot_a2, 2,
     'content/' || v_proj_alpha_tracker || '/' || v_slot_a2 || '/v2-relatorio-abril-2025.pdf',
     'application/pdf', 2_510_004,
     'approved', true, v_editor_id, v_admin_id, now() - interval '2 days',
     'Versão final, com tabelas 4 e 7 corrigidas.');

  -- Slot 3: Dashboard Wave 1 (Alpha tracker) — 1 versão approved
  insert into public.content_slots (id, project_id, type, display_name, description, archived) values
    (v_slot_a3, v_proj_alpha_tracker, 'dashboard',
     'Dashboard Wave 1',
     'Painel interativo com indicadores principais da Wave 1.', false);

  insert into public.file_versions
    (slot_id, version_number, storage_path, mime_type, size_bytes,
     status, is_current, uploaded_by, reviewed_by, reviewed_at, review_notes)
  values
    (v_slot_a3, 1,
     'content/' || v_proj_alpha_tracker || '/' || v_slot_a3 || '/v1-dashboard-wave1.html',
     'text/html', 187_443,
     'approved', true, v_editor_id, v_admin_id, now() - interval '7 days',
     'Aprovado.');

  -- Slot 4: Apresentação Inicial (Alpha categoria) — 1 versão pending_approval (testar fila)
  insert into public.content_slots (id, project_id, type, display_name, description, archived) values
    (v_slot_a4, v_proj_alpha_categ, 'document',
     'Apresentação Inicial — Estudo de Categoria',
     'Kickoff com escopo, cronograma e metodologia.', false);

  insert into public.file_versions
    (slot_id, version_number, storage_path, mime_type, size_bytes,
     status, is_current, uploaded_by)
  values
    (v_slot_a4, 1,
     'content/' || v_proj_alpha_categ || '/' || v_slot_a4 || '/v1-apresentacao-inicial.pdf',
     'application/pdf', 1_204_667,
     'pending_approval', false, v_editor_id);

  -- Slot 5: Dashboard Beta — 2 versões: v1 archived, v2 current+approved
  insert into public.content_slots (id, project_id, type, display_name, description, archived) values
    (v_slot_b1, v_proj_beta_tracker, 'dashboard',
     'Dashboard Beta — Tracker Trimestral',
     'Painel atualizado a cada wave.', false);

  insert into public.file_versions
    (slot_id, version_number, storage_path, mime_type, size_bytes,
     status, is_current, uploaded_by, reviewed_by, reviewed_at, review_notes)
  values
    (v_slot_b1, 1,
     'content/' || v_proj_beta_tracker || '/' || v_slot_b1 || '/v1-dashboard-beta.html',
     'text/html', 156_998,
     'archived', false, v_editor_id, v_admin_id, now() - interval '40 days',
     'Aprovado, substituído na próxima wave.'),
    (v_slot_b1, 2,
     'content/' || v_proj_beta_tracker || '/' || v_slot_b1 || '/v2-dashboard-beta.html',
     'text/html', 168_223,
     'approved', true, v_editor_id, v_admin_id, now() - interval '3 days',
     'Atualização Wave 2 com dados de jovens 18–24.');

  -- ============================================================
  -- audit_logs (alguns eventos para popular a tela de auditoria)
  -- ============================================================
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata) values
    (v_admin_id,  'client_created',  'client',  v_alpha_id, jsonb_build_object('name','Empresa Alpha S.A.')),
    (v_admin_id,  'client_created',  'client',  v_beta_id,  jsonb_build_object('name','Empresa Beta Indústria Ltda.')),
    (v_admin_id,  'project_created', 'project', v_proj_alpha_tracker, jsonb_build_object('name','Brand Tracker Alpha 2025')),
    (v_admin_id,  'project_created', 'project', v_proj_alpha_categ,   jsonb_build_object('name','Estudo de Categoria — Alpha')),
    (v_admin_id,  'project_created', 'project', v_proj_beta_tracker,  jsonb_build_object('name','Brand Tracker Beta 2025')),
    (v_editor_id, 'version_uploaded','version', v_slot_a1, jsonb_build_object('slot','Relatório Mensal — Março 2025')),
    (v_admin_id,  'version_approved','version', v_slot_a1, jsonb_build_object('slot','Relatório Mensal — Março 2025'));

end
$seed$;

-- ============================================================
-- Resumo final (visível no console quando o seed roda)
-- ============================================================
do $msg$
declare
  c_users    int;
  c_clients  int;
  c_projects int;
  c_slots    int;
  c_versions int;
begin
  select count(*) into c_users    from public.users;
  select count(*) into c_clients  from public.clients;
  select count(*) into c_projects from public.projects;
  select count(*) into c_slots    from public.content_slots;
  select count(*) into c_versions from public.file_versions;
  raise notice '----------------------------------------------';
  raise notice 'IMO Insights — seed aplicado com sucesso';
  raise notice '----------------------------------------------';
  raise notice '  users:     %', c_users;
  raise notice '  clients:   %', c_clients;
  raise notice '  projects:  %', c_projects;
  raise notice '  slots:     %', c_slots;
  raise notice '  versions:  %', c_versions;
  raise notice '----------------------------------------------';
  raise notice '  Senha padrão (TODOS): imo-insights-2025';
  raise notice '----------------------------------------------';
end
$msg$;
