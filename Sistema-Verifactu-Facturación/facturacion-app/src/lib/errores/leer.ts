import 'server-only';

import { supabaseServicio } from '@/lib/supabase/servicio';
import { agruparErrores, type FilaError, type GrupoError } from './agrupar';

/** Los errores de los últimos `dias` días, agrupados. */
export async function erroresRecientes(dias: number): Promise<{ grupos: GrupoError[]; error?: string }> {
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString();
  const { data, error } = await supabaseServicio().from('errores_app').select('*')
    .gte('creado_en', desde).order('creado_en', { ascending: false }).limit(5000);
  if (error) return { grupos: [], error: error.message };
  return { grupos: agruparErrores((data ?? []) as FilaError[]) };
}
