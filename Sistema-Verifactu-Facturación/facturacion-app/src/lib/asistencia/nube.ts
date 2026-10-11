/**
 * LAS CONVERSACIONES DE LA ASISTENCIA, GUARDADAS EN LA CUENTA
 *
 * Antes vivían sólo en el navegador: se perdían al cambiar de equipo y no
 * se veían en el móvil. Ahora se guardan en `asistencia_conversaciones`,
 * una fila por conversación con el `user_id` de la cuenta. Cada empresa es
 * una cuenta, y la base de datos (RLS) sólo deja leer y escribir las filas
 * de la cuenta que ha entrado: ni otra empresa, ni otra empresa del mismo
 * grupo, ni nadie sin sesión las puede ver.
 *
 * El navegador sigue guardando una copia (`memoria.ts`): sirve sin conexión
 * y es lo que se sube la primera vez, para no perder lo que ya había.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { MAX_MENSAJES_POR_SESION, MAX_SESIONES, type MensajeGuardado, type SesionGuardada } from './memoria';

const TABLA = 'asistencia_conversaciones';

/** Junta las de la nube y las del navegador: de cada una, la más reciente. */
export function fusionarSesiones(nube: SesionGuardada[], local: SesionGuardada[]): SesionGuardada[] {
  const porId = new Map<string, SesionGuardada>();
  for (const s of nube) porId.set(s.id, s);
  for (const s of local) {
    const otra = porId.get(s.id);
    if (!otra || s.ultimoMensaje > otra.ultimoMensaje) porId.set(s.id, s);
  }
  return [...porId.values()].sort((a, b) => b.ultimoMensaje - a.ultimoMensaje);
}

/** Lo que cambia cuando una conversación cambia: para no subirla si no hace falta. */
export function huellaSesion(s: SesionGuardada): string {
  return `${s.ultimoMensaje}|${s.mensajes.length}|${s.titulo}`;
}

/** Las conversaciones que no se han subido todavía o han cambiado desde entonces. */
export function cambiadas(sesiones: SesionGuardada[], subidas: Map<string, string>): SesionGuardada[] {
  return sesiones.filter(s => subidas.get(s.id) !== huellaSesion(s));
}

interface Fila {
  id: string;
  titulo: string;
  mensajes: MensajeGuardado[];
  creada_en: string;
  actualizada_en: string;
}

const aSesion = (f: Fila): SesionGuardada => ({
  id: f.id,
  titulo: f.titulo,
  mensajes: Array.isArray(f.mensajes) ? f.mensajes : [],
  creadaEn: Date.parse(f.creada_en),
  ultimoMensaje: Date.parse(f.actualizada_en),
});

/**
 * Las conversaciones de la cuenta, o `null` si no se ha podido preguntar
 * (sin conexión, o la tabla aún no existe): entonces se sigue con las del
 * navegador.
 */
export async function cargarDeNube(db: SupabaseClient): Promise<SesionGuardada[] | null> {
  const { data, error } = await db
    .from(TABLA)
    .select('id, titulo, mensajes, creada_en, actualizada_en')
    .order('actualizada_en', { ascending: false })
    .limit(MAX_SESIONES);
  if (error) return null;
  return (data as Fila[]).map(aSesion);
}

/** Sube (o actualiza) estas conversaciones. Devuelve si ha ido bien. */
export async function subirANube(db: SupabaseClient, usuarioId: string, sesiones: SesionGuardada[]): Promise<boolean> {
  if (!sesiones.length) return true;
  const filas = sesiones.map(s => ({
    user_id: usuarioId,
    id: s.id,
    titulo: s.titulo.slice(0, 120),
    mensajes: s.mensajes.slice(-MAX_MENSAJES_POR_SESION),
    creada_en: new Date(s.creadaEn || s.ultimoMensaje).toISOString(),
    actualizada_en: new Date(s.ultimoMensaje).toISOString(),
  }));
  const { error } = await db.from(TABLA).upsert(filas, { onConflict: 'user_id,id' });
  return !error;
}

export async function borrarDeNube(db: SupabaseClient, usuarioId: string, id: string): Promise<void> {
  await db.from(TABLA).delete().eq('user_id', usuarioId).eq('id', id);
}
