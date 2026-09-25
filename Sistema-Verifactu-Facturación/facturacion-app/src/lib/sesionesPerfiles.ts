/**
 * SESIONES DE LOS PERFILES: QUIÉN ESTÁ TRABAJANDO AHORA, Y DÓNDE
 *
 * Cada equipo (navegador) con un perfil elegido manda un «latido» cada
 * minuto a `sesiones_perfiles` (migración 054): quién está delante, en qué
 * pantalla y desde cuándo. La titular lo ve en «Equipo» y puede cerrar la
 * sesión de otro equipo; ese equipo se entera en su siguiente latido.
 *
 * Como el resto de perfiles, nunca frena el trabajo: sin tabla, sin red o
 * con cualquier error, no pasa nada y se reintenta en el siguiente latido.
 */

import { createClient } from './supabase/client';
import type { Perfil, RolPerfil } from './perfiles';

const CLAVE_EQUIPO_ID = 'klima-equipo-id';
const CLAVE_EQUIPO_NOMBRE = 'klima-equipo-nombre';

/** Cada cuánto dice «sigo aquí» un equipo con perfil. */
export const LATIDO_MS = 60_000;
/** Sin latido en este rato: se da por «inactivo» (pestaña cerrada, equipo dormido). */
export const EN_LINEA_MS = 3 * 60_000;
/** Sin latido en este rato: la sesión ya no se enseña. */
export const CADUCA_MS = 12 * 60 * 60_000;

export interface SesionPerfil {
  equipoId: string;
  perfilId: string;
  perfilNombre: string;
  perfilRol: RolPerfil;
  equipo: string;
  pagina: string | null;
  desde: string;
  vistoEn: string;
  cerrar: boolean;
}

export type EstadoSesion = 'en_linea' | 'inactiva' | 'caducada';

export function estadoSesion(vistoEn: string, ahora: number): EstadoSesion {
  const t = new Date(vistoEn).getTime();
  if (Number.isNaN(t)) return 'caducada';
  const hace = ahora - t;
  if (hace <= EN_LINEA_MS) return 'en_linea';
  if (hace <= CADUCA_MS) return 'inactiva';
  return 'caducada';
}

/** «Chrome en Windows», «Safari en iPhone»…: el nombre por defecto de un equipo. */
export function describirNavegador(ua: string): string {
  const so =
    /iPhone/.test(ua) ? 'iPhone'
      : /iPad/.test(ua) ? 'iPad'
        : /Android/.test(ua) ? (/Mobile/.test(ua) ? 'Android' : 'tableta Android')
          : /Windows/.test(ua) ? 'Windows'
            : /Mac OS X|Macintosh/.test(ua) ? 'Mac'
              : /CrOS/.test(ua) ? 'Chromebook'
                : /Linux/.test(ua) ? 'Linux'
                  : '';
  const nav =
    /Edg\//.test(ua) ? 'Edge'
      : /OPR\/|Opera/.test(ua) ? 'Opera'
        : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
          : /Firefox\/|FxiOS/.test(ua) ? 'Firefox'
            : /Chrome\/|CriOS/.test(ua) ? 'Chrome'
              : /Safari\//.test(ua) ? 'Safari'
                : '';
  if (nav && so) return `${nav} en ${so}`;
  return nav || so || 'Equipo';
}

const leerLocal = (clave: string): string | null => {
  try { return localStorage.getItem(clave); } catch { return null; }
};

/** El identificador de este navegador; se crea la primera vez. */
export function idDeEsteEquipo(): string {
  let id = leerLocal(CLAVE_EQUIPO_ID);
  if (!id) {
    id = crypto.randomUUID();
    try { localStorage.setItem(CLAVE_EQUIPO_ID, id); } catch { /* sin almacenamiento: uno por visita */ }
  }
  return id;
}

/** Cómo se llama este equipo en la lista de sesiones. */
export function nombreDeEsteEquipo(): string {
  const propio = leerLocal(CLAVE_EQUIPO_NOMBRE)?.trim();
  if (propio) return propio.slice(0, 60);
  return typeof navigator === 'undefined' ? 'Equipo' : describirNavegador(navigator.userAgent);
}

export function ponerNombreAEsteEquipo(nombre: string): void {
  try {
    const n = nombre.trim().slice(0, 60);
    if (n) localStorage.setItem(CLAVE_EQUIPO_NOMBRE, n); else localStorage.removeItem(CLAVE_EQUIPO_NOMBRE);
  } catch { /* */ }
}

let sinTabla = false;

const mismoInstante = (a: string | null | undefined, b: string) => !!a && Date.parse(a) === Date.parse(b);

/**
 * «Sigo aquí»: renueva la fila de este equipo. Devuelve `true` si la
 * titular ha pedido cerrar esta sesión desde otro equipo.
 *
 * `desde` es cuándo se eligió el perfil en este equipo (se guarda con él).
 * Identifica la sesión: el cierre pedido vale para ESA sesión aunque se
 * recargue la página, y no para la siguiente persona que elija perfil
 * aquí (si la fila no se pudo borrar al cerrar, por ejemplo sin red).
 */
export async function latido(cuenta: string, perfil: Perfil, pagina: string, desde: string): Promise<boolean> {
  if (sinTabla || (typeof navigator !== 'undefined' && !navigator.onLine)) return false;
  const equipoId = idDeEsteEquipo();
  try {
    const bd = createClient();
    const { data: previa, error: errorPrevia } = await bd
      .from('sesiones_perfiles').select('cerrar,desde')
      .eq('user_id', cuenta).eq('equipo_id', equipoId).maybeSingle();
    if (errorPrevia) {
      if (faltaLaTabla(errorPrevia)) sinTabla = true;
      return false;
    }
    if (previa?.cerrar && mismoInstante(previa.desde, desde)) return true;
    const { error } = await bd.from('sesiones_perfiles').upsert({
      user_id: cuenta,
      equipo_id: equipoId,
      perfil_id: perfil.id,
      perfil_nombre: perfil.nombre.slice(0, 60),
      perfil_rol: perfil.rol,
      equipo: nombreDeEsteEquipo(),
      pagina: pagina.slice(0, 200),
      desde,
      visto_en: new Date().toISOString(),
      // Un cierre pendiente de una sesión anterior ya no vale. Sólo se toca
      // si lo hay: así no se pisa uno que llegue justo ahora.
      ...(previa?.cerrar ? { cerrar: false } : {}),
    }, { onConflict: 'user_id,equipo_id' });
    if (error && faltaLaTabla(error)) sinTabla = true;
    return false;
  } catch {
    return false;
  }
}

/** Este equipo deja de trabajar con perfil: su fila se quita. */
export async function terminarSesionDeEsteEquipo(cuenta: string | null): Promise<void> {
  if (!cuenta || sinTabla) return;
  try {
    await createClient().from('sesiones_perfiles').delete()
      .eq('user_id', cuenta).eq('equipo_id', idDeEsteEquipo());
  } catch { /* sin red: la fila caduca sola */ }
}

/** Las sesiones de la cuenta, la más reciente primero. `null` = no se pueden leer (sin migración). */
export async function leerSesiones(): Promise<SesionPerfil[] | null> {
  if (sinTabla) return null;
  const { data, error } = await createClient()
    .from('sesiones_perfiles').select('*').order('visto_en', { ascending: false });
  if (error) {
    if (faltaLaTabla(error)) { sinTabla = true; return null; }
    throw new Error(error.message);
  }
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  return (data ?? []).map((f: any) => ({
    equipoId: f.equipo_id, perfilId: f.perfil_id, perfilNombre: f.perfil_nombre, perfilRol: f.perfil_rol,
    equipo: f.equipo, pagina: f.pagina ?? null, desde: f.desde, vistoEn: f.visto_en, cerrar: f.cerrar === true,
  }));
}

/** Pide a otro equipo que cierre su perfil (lo hace en su siguiente latido). */
export async function pedirCierreDeSesion(equipoId: string): Promise<void> {
  const { error } = await createClient().from('sesiones_perfiles').update({ cerrar: true }).eq('equipo_id', equipoId);
  if (error) throw new Error(error.message);
}

/** Quita de la lista una sesión que ya no da señales. */
export async function olvidarSesion(equipoId: string): Promise<void> {
  const { error } = await createClient().from('sesiones_perfiles').delete().eq('equipo_id', equipoId);
  if (error) throw new Error(error.message);
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
function faltaLaTabla(error: any): boolean {
  const code: string = error?.code ?? '';
  const msg: string = error?.message ?? '';
  return code === 'PGRST205' || code === '42P01' || /does not exist|could not find the table/i.test(msg);
}
