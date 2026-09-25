import 'server-only';

import { supabaseServicio } from '@/lib/supabase/servicio';
import { huellaDe, normalizarRuta } from './huella';

export interface ErrorApp {
  origen: 'navegador' | 'servidor';
  mensaje: string;
  pila?: string | null;
  ruta?: string | null;
  userId?: string | null;
  navegador?: string | null;
}

/**
 * Apunta un error en `errores_app` (migración 053). Nunca lanza: un fallo
 * al apuntar un fallo no puede tumbar la petición que ya estaba fallando.
 */
export async function registrarError(e: ErrorApp): Promise<void> {
  try {
    const mensaje = (e.mensaje || 'Error sin mensaje').slice(0, 2000);
    const ruta = normalizarRuta(e.ruta || '/');
    await supabaseServicio().from('errores_app').insert({
      origen: e.origen,
      mensaje,
      pila: e.pila ? e.pila.slice(0, 8000) : null,
      ruta,
      huella: huellaDe(e.origen, mensaje, ruta),
      user_id: e.userId ?? null,
      navegador: e.navegador ? e.navegador.slice(0, 300) : null,
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    });
  } catch {
    // Sin registro, al menos queda en los registros de Vercel.
    console.error('[errores] no se ha podido apuntar:', e.mensaje);
  }
}
