'use client';

/**
 * Lo que la pantalla de recordatorios lee y escribe: el registro de envíos
 * (tabla `recordatorios_cobro`, o el navegador si falta la migración 051),
 * los ajustes del envío automático (metadatos de la cuenta) y el envío por
 * correo a través del servidor.
 */

import { createClient } from '../supabase/client';
import { AJUSTES_POR_DEFECTO, CAMPO_AJUSTES, faltaLaTabla, type AjustesRecordatorios } from './filas';

export type Canal = 'email' | 'whatsapp' | 'manual' | 'automatico';

export interface Envio {
  clienteId: string;
  clienteNombre: string;
  canal: Canal;
  enviadoEn: string;
  asunto?: string;
  importe?: number;
}

const CLAVE_LOCAL = 'klima-recordatorios-local';

function leerLocal(): Envio[] {
  try { return JSON.parse(localStorage.getItem(CLAVE_LOCAL) || '[]') as Envio[]; } catch { return []; }
}

export async function leerRegistro(): Promise<{ envios: Envio[]; enTabla: boolean }> {
  const db = createClient();
  const { data: ses } = await db.auth.getSession();
  const uid = ses.session?.user.id;
  let q = db.from('recordatorios_cobro').select('cliente_id, cliente_nombre, canal, enviado_en, asunto, importe');
  if (uid) q = q.eq('user_id', uid);
  const { data, error } = await q.order('enviado_en', { ascending: false }).limit(1000);
  if (error) {
    if (faltaLaTabla(error)) return { envios: leerLocal(), enTabla: false };
    throw new Error(error.message);
  }
  return {
    enTabla: true,
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    envios: (data ?? []).map((f: any) => ({
      clienteId: f.cliente_id ?? '', clienteNombre: f.cliente_nombre, canal: f.canal as Canal, enviadoEn: f.enviado_en,
      asunto: f.asunto ?? undefined, importe: f.importe != null ? Number(f.importe) : undefined,
    })),
  };
}

/** Anota un recordatorio mandado fuera del programa (WhatsApp, correo propio…). */
export async function anotar(e: Omit<Envio, 'enviadoEn'> & { facturaIds: string[]; destinatario?: string }, enTabla: boolean): Promise<void> {
  const enviadoEn = new Date().toISOString();
  if (enTabla) {
    const db = createClient();
    const { data: ses } = await db.auth.getSession();
    const { error } = await db.from('recordatorios_cobro').insert({
      user_id: ses.session?.user.id, cliente_id: e.clienteId || null, cliente_nombre: e.clienteNombre, canal: e.canal,
      factura_ids: e.facturaIds, destinatario: e.destinatario ?? null, asunto: e.asunto ?? null, importe: e.importe ?? null,
    });
    if (!error) return;
    if (!faltaLaTabla(error)) throw new Error(error.message);
  }
  try {
    const lista = [{ clienteId: e.clienteId, clienteNombre: e.clienteNombre, canal: e.canal, enviadoEn, asunto: e.asunto, importe: e.importe }, ...leerLocal()];
    localStorage.setItem(CLAVE_LOCAL, JSON.stringify(lista.slice(0, 500)));
  } catch { /* sin almacenamiento */ }
}

export async function estadoServidor(): Promise<{ correo: boolean; automatico: boolean }> {
  try {
    const r = await fetch('/api/recordatorios', { cache: 'no-store' });
    if (!r.ok) return { correo: false, automatico: false };
    return await r.json();
  } catch {
    return { correo: false, automatico: false };
  }
}

export async function enviarPorCorreo(datos: {
  clienteId: string; para: string; asunto: string; texto: string; facturaIds: string[]; importe: number;
}): Promise<{ anotado: boolean }> {
  const r = await fetch('/api/recordatorios', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || `Error ${r.status}`);
  return { anotado: !!j.anotado };
}

export async function leerAjustes(): Promise<AjustesRecordatorios> {
  const { data } = await createClient().auth.getUser();
  return { ...AJUSTES_POR_DEFECTO, ...(data.user?.user_metadata?.[CAMPO_AJUSTES] ?? {}) };
}

export async function guardarAjustes(a: AjustesRecordatorios): Promise<void> {
  const { error } = await createClient().auth.updateUser({ data: { [CAMPO_AJUSTES]: a } });
  if (error) throw new Error(error.message);
}
