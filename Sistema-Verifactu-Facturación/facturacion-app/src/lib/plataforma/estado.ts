import 'server-only';

import { supabaseServicio } from '@/lib/supabase/servicio';

/**
 * ¿La plataforma ya cobra?
 *
 * Mientras quien la administra no esté dada de alta en Hacienda, no se
 * contratan planes ni se dejan propinas: la web lo oculta y las rutas de
 * cobro lo rechazan, para que nadie pague por error. Se abre desde
 * Administración → Configuración.
 *
 * Si no se puede leer la configuración, se da por cerrado: ante la duda,
 * no cobrar.
 */
export async function cobrosAbiertos(): Promise<boolean> {
  try {
    const { data } = await supabaseServicio().from('plataforma_config').select('cobros_abiertos').single();
    return data?.cobros_abiertos === true;
  } catch {
    return false;
  }
}

export const MENSAJE_COBROS_CERRADOS =
  'Klima está en fase piloto y todavía no admite pagos. Escríbenos y te damos acceso gratis mientras tanto.';
