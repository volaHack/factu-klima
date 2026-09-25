'use client';

/**
 * EL CHAT DE SOPORTE (lado de la cuenta)
 *
 * Una cuenta tiene una conversación abierta con la administración; si la
 * administración la cierra y la cuenta vuelve a escribir, se reabre. Los
 * mensajes se mandan por el servidor (/api/soporte) para poder avisar por
 * correo; se leen directamente con la sesión, que la base de datos sólo
 * deja ver lo propio (migración 053).
 */

import { createClient } from './supabase/client';

/** Evento para abrir el chat desde cualquier sitio (un error, la ayuda…). */
export const ABRIR_SOPORTE = 'klima-abrir-soporte';

export interface MensajeSoporte {
  id: string;
  deAdmin: boolean;
  texto: string;
  creadoEn: string;
}

export interface ConversacionSoporte {
  id: string;
  estado: 'abierta' | 'cerrada';
  noLeidos: number;
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const mensajeDeFila = (m: any): MensajeSoporte => ({ id: m.id, deAdmin: m.de_admin, texto: m.texto, creadoEn: m.creado_en });

/** La conversación más reciente de la cuenta, si hay alguna. */
export async function miConversacion(): Promise<ConversacionSoporte | null> {
  const db = createClient();
  const { data: ses } = await db.auth.getSession();
  const uid = ses.session?.user.id;
  if (!uid) return null;
  const { data, error } = await db.from('soporte_conversaciones')
    .select('id, estado, no_leidos_usuario').eq('user_id', uid)
    .order('ultimo_mensaje_en', { ascending: false }).limit(1);
  if (error || !data?.length) return null;
  return { id: data[0].id, estado: data[0].estado, noLeidos: data[0].no_leidos_usuario ?? 0 };
}

export async function mensajesDe(conversacionId: string): Promise<MensajeSoporte[]> {
  const { data, error } = await createClient().from('soporte_mensajes')
    .select('id, de_admin, texto, creado_en').eq('conversacion_id', conversacionId)
    .order('creado_en', { ascending: true }).limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []).map(mensajeDeFila);
}

export async function marcarLeida(conversacionId: string): Promise<void> {
  await createClient().from('soporte_conversaciones').update({ no_leidos_usuario: 0 }).eq('id', conversacionId);
}

export async function enviarASoporte(texto: string): Promise<{ conversacionId: string }> {
  const r = await fetch('/api/soporte', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texto, pagina: typeof location !== 'undefined' ? location.pathname : undefined }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || `Error ${r.status}`);
  return { conversacionId: j.conversacionId };
}
