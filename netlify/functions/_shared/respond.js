/**
 * Helpers para respostas consistentes.
 * As respostas são sempre application/json e never-cached.
 */
const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer'
};

function ok(body) {
  return {
    statusCode: 200,
    headers: HEADERS,
    body: JSON.stringify(body == null ? { ok: true } : body)
  };
}

function fail(status, error) {
  const message = (error && (error.message || (typeof error === 'string' ? error : null))) || 'Erro';
  return {
    statusCode: status,
    headers: HEADERS,
    body: JSON.stringify({ error: message })
  };
}

module.exports = { ok, fail };
