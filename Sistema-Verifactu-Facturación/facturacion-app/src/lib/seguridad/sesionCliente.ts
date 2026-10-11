'use client';

/**
 * LA SESIÓN DE ESTE EQUIPO: SEGUNDO FACTOR Y SESIONES CERRADAS DESDE FUERA
 *
 * Dos cosas que el navegador tiene que vigilar por su cuenta:
 *
 *   · Si la cuenta tiene la verificación en dos pasos, una sesión que sólo
 *     ha pasado la contraseña (aal1) no ve nada: la base de datos se lo
 *     niega (migración 065). Aquí se detecta para llevarla a pedir el
 *     código, y para que la cola sin conexión no intente subir nada
 *     mientras tanto (se lo rechazarían y se perdería).
 *
 *   · Si desde otro equipo se pulsó «Cerrar sesión en los demás
 *     dispositivos», este equipo se entera en cuanto vuelve a hablar con el
 *     servidor: entonces se borra la copia local (facturas, clientes… en
 *     IndexedDB) y se vuelve al login. Es lo que protege un portátil
 *     robado o perdido.
 */

import { createClient } from '@/lib/supabase/client';
import { clearOfflineCache } from '@/lib/offlineDb';

/** Errores de Supabase que significan «esta sesión ya no existe». */
const REVOCADA = new Set(['session_not_found', 'refresh_token_not_found', 'user_not_found', 'session_expired']);

export function esSesionRevocada(error: { code?: string; status?: number } | null | undefined): boolean {
  return !!error?.code && REVOCADA.has(error.code);
}

/** ¿Tiene la cuenta segundo factor y esta sesión aún no lo ha pasado? (sin red: lee la sesión guardada) */
export async function faltaSegundoFactor(): Promise<boolean> {
  try {
    const { data } = await createClient().auth.mfa.getAuthenticatorAssuranceLevel();
    return data?.nextLevel === 'aal2' && data.currentLevel !== 'aal2';
  } catch {
    return false;
  }
}

let saliendo = false;

/** Borra lo guardado en este equipo y vuelve al login, contando por qué. */
export async function borrarEquipoYSalir(motivo: 'cerrada' | 'caducada' = 'cerrada'): Promise<void> {
  if (saliendo) return;
  saliendo = true;
  try { await createClient().auth.signOut({ scope: 'local' }); } catch { /* ya no había sesión */ }
  try { await clearOfflineCache(); } catch { /* sin IndexedDB no hay nada que borrar */ }
  // El login vuelve a vaciarla al cargar (`?sesion=…`): una descarga que
  // estuviera en marcha en esta página podría escribir después de borrar.
  window.location.replace(`/login?sesion=${motivo}`);
}

/** ¿Se está saliendo ya (cerrar sesión, cambiar de empresa, sesión revocada)? */
export function seEstaSaliendo(): boolean {
  return saliendo;
}

/** Marca que la salida la ha pedido la persona (Cerrar sesión): así no se toma por una sesión revocada. */
export function marcarSalidaVoluntaria(): void {
  saliendo = true;
}

/**
 * Pregunta al servidor si la sesión sigue viva. Sólo con conexión: sin
 * ella no se sabe nada y no se borra nada.
 */
export async function comprobarSesion(): Promise<'ok' | 'revocada' | 'sin-red'> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'sin-red';
  const { error } = await createClient().auth.getUser();
  if (!error) return 'ok';
  if (esSesionRevocada(error)) return 'revocada';
  return 'sin-red';
}
