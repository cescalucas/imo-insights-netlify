-- ============================================================
-- 0003_fix_rls_recursion.sql
-- ============================================================
-- Corrige erro 42P17 ("infinite recursion detected in policy
-- for relation content_slots") gerado pelo cruzamento mútuo:
--   * content_slots_select → consultava file_versions
--   * file_versions_select → consulta content_slots
-- O Postgres detecta a recursão estaticamente e aborta a query
-- ANTES de avaliar o short-circuit do OR, então até super_admin
-- batia no erro.
--
-- Solução: remover o EXISTS sobre file_versions de
-- content_slots_select. A restrição "cliente só vê slots com
-- versão aprovada" deixa de ser aplicada na própria policy de
-- content_slots, mas continua valendo na prática porque o RLS
-- de file_versions já esconde versões pending/rejected do
-- cliente final — o slot aparece sem versões visíveis, o que é
-- inofensivo (UI já trata o caso "sem entrega ainda").
-- ============================================================

drop policy if exists content_slots_select on public.content_slots;

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
    )
  );
