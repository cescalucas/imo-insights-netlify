/**
 * GET /api/list-materials
 *
 * Lista os estudos publicados (study_materials) para o seletor de download
 * do site público. Endpoint público (sem auth); usa service_role só para ler,
 * e devolve apenas linhas publicadas e campos não-sensíveis.
 */
const { getAdmin } = require('./_shared/supabase');
const { ok, fail } = require('./_shared/respond');

exports.handler = async function (event) {
  if (event.httpMethod !== 'GET') return fail(405, 'Método não permitido');

  try {
    const { data, error } = await getAdmin()
      .from('study_materials')
      .select('slug, title, subtitle, file_url')
      .eq('published', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw error;

    return ok({ studies: (data || []).filter(function (s) { return s.file_url; }) });
  } catch (err) {
    console.error('[list-materials] erro:', err && err.message);
    return fail(502, 'Falha ao listar estudos.');
  }
};
