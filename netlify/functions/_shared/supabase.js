/**
 * Cliente Supabase com SERVICE_ROLE — bypassa RLS.
 * Usar APENAS dentro de Netlify Functions. Nunca expor para o front.
 */
const { createClient } = require('@supabase/supabase-js');

let _admin = null;

function getAdmin() {
  if (!_admin) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausentes nas env vars.');
    }
    _admin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: { autoRefreshToken: false, persistSession: false }
      }
    );
  }
  return _admin;
}

module.exports = { getAdmin };
