import 'server-only';
import { createClient } from '@supabase/supabase-js';

/** Salta RLS. Sólo en el servidor, y sólo después de haber autorizado. */
export function supabaseServicio() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
