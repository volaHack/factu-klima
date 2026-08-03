import { createClient as createAdminClient } from '@supabase/supabase-js';

export function clientIpFromRequest(request: Request): string {
  const headers = request.headers;
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip') ||
    'unknown'
  );
}

/**
 * Comprueba y registra un "hit" contra un límite de peticiones usando la
 * función RPC fn_check_rate_limit (ver migration_004). Fail-open: si la
 * infraestructura de rate limiting no está disponible (falta la service
 * role key, o falla la llamada), NO se bloquea la petición — un fallo de
 * infraestructura no debe tumbar el servicio, solo perder esta capa de
 * protección puntualmente.
 */
export async function checkRateLimit(
  key: string,
  maxHits: number,
  windowSeconds: number
): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Rate limiting no disponible: falta SUPABASE_SERVICE_ROLE_KEY.');
    return true;
  }

  const admin = createAdminClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin.rpc('fn_check_rate_limit', {
    p_key: key,
    p_max_hits: maxHits,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    console.error('Error comprobando rate limit:', error);
    return true;
  }

  return data === true;
}
