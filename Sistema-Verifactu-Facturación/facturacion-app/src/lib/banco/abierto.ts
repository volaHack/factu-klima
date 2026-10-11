import 'server-only';

/**
 * ¿PUEDE ESTA EMPRESA CONECTAR SU BANCO?
 *
 * Tener las claves de Enable Banking no basta: mientras la aplicación esté
 * en su entorno de pruebas (bancos de mentira) o sin contrato para bancos
 * reales, a los clientes se les enseña «Próximamente» en vez de una
 * conexión que no lleva a ningún banco suyo. La administración sí lo ve,
 * para poder probarlo.
 *
 * Se abre a todos con ENABLE_BANKING_ABIERTO=si en el .env, cuando la
 * aplicación ya conecte con bancos reales.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { enableBankingConfigurado } from './enableBanking';

export function bancoAbiertoATodos(): boolean {
  return enableBankingConfigurado() && process.env.ENABLE_BANKING_ABIERTO === 'si';
}

/** `db` es el cliente con la sesión de quien pregunta (para saber si es administración). */
export async function bancoAbiertoA(db: SupabaseClient): Promise<boolean> {
  if (!enableBankingConfigurado()) return false;
  if (bancoAbiertoATodos()) return true;
  const { data } = await db.rpc('soy_admin');
  return data === true;
}
