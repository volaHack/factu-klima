import 'server-only';

/**
 * AVISOS Y RESUMEN DEL MES POR CORREO — SOLO SERVIDOR
 *
 * Lo llama el cron diario (`/api/cron/correos`). Para cada empresa que lo
 * tiene encendido en Ajustes:
 *
 *   · Avisos: lo urgente de «Para hoy» (vencidas, plazos de Hacienda,
 *     permisos del banco…), sólo si hay algo nuevo o, si sigue igual, una
 *     vez a la semana.
 *   · Resumen: el mes que acaba de terminar, una sola vez por mes.
 *
 * NUNCA DOS VECES
 * Antes de mandar se «reclama» el envío con una actualización condicional
 * (sólo si nadie ha cambiado el estado desde que se leyó). Si el cron
 * corre a la vez en dos sitios —Vercel y el VPS durante el cambio—, sólo
 * uno gana y el correo sale una vez. Si el envío falla, se deshace la
 * reclamación para que se intente al día siguiente.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Gasto, Invoice } from '../types';
import { mapGastoFromDb, mapInvoiceFromDb } from '../mapeosDb';
import { isFactura } from '../documentos';
import { tareasDeHoy, type EntradaHoy } from '../panelHoy';
import { presentacionPendiente } from '../fiscal/apartarHacienda';
import { conexionesDe, sinConciliarDe, vistaDeConexion } from '../banco/servidor';
import { enableBankingConfigurado } from '../banco/enableBanking';
import { enviarCorreo } from '../correo/enviar';
import { urlDelSitio } from '../sitio';
import { avisosImportantes, huellaAvisos, tocaAvisar } from './avisos';
import { correoAvisos, correoResumen, type Destinatario } from './correos';
import { mesAnteriorA, resumenDelMes } from './resumen';
import { porTrozos, todasLasFilas } from '../porTandas';

interface Preferencias {
  user_id: string;
  avisos: boolean;
  resumen_mensual: boolean;
  token_baja: string;
  ultimo_aviso_huella: string | null;
  ultimo_aviso_en: string | null;
  ultimo_resumen: string | null;
}

export interface DatosEmpresa {
  correo: string;
  destinatario: Destinatario;
  documentos: Invoice[];
  gastos: Gasto[];
  nif: string | null;
  igic: boolean;
  banco: EntradaHoy['banco'];
}

const isoDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Todo lo de una empresa que hace falta para los correos. */
export async function datosDeEmpresa(db: SupabaseClient, userId: string): Promise<DatosEmpresa | null> {
  const { data: usuario } = await db.auth.admin.getUserById(userId);
  const correo = usuario?.user?.email;
  if (!usuario?.user || !correo) return null;
  const meta = (usuario.user.user_metadata ?? {}) as { full_name?: string; name?: string };

  const [{ data: ajustes }, { data: filas }, { data: filasGastos }] = await Promise.all([
    db.from('company_settings').select('business_name, trade_name, nif, igic_enabled').eq('user_id', userId)
      .order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    todasLasFilas((desde, hasta) => db.from('invoices').select('*').eq('user_id', userId).order('id').range(desde, hasta)),
    todasLasFilas((desde, hasta) => db.from('gastos').select('*').eq('user_id', userId).order('id').range(desde, hasta)),
  ]);
  const ids = (filas ?? []).map((f: { id: string }) => f.id);
  const [{ data: lineas }, { data: impuestos }] = ids.length
    ? await Promise.all([
      porTrozos(ids, trozo => todasLasFilas((desde, hasta) => db.from('invoice_line_items').select('*')
        .in('invoice_id', trozo).order('invoice_id').order('sort_order', { ascending: true }).order('id').range(desde, hasta))),
      porTrozos(ids, trozo => todasLasFilas((desde, hasta) => db.from('invoice_tax_breakdown').select('*')
        .in('invoice_id', trozo).order('invoice_id').order('id').range(desde, hasta))),
    ])
    : [{ data: [] }, { data: [] }];
  const porFactura = <T extends { invoice_id: string }>(lista: T[] | null) => {
    const m = new Map<string, T[]>();
    for (const x of lista ?? []) m.set(x.invoice_id, [...(m.get(x.invoice_id) ?? []), x]);
    return m;
  };
  const lineasDe = porFactura(lineas as { invoice_id: string }[]);
  const impuestosDe = porFactura(impuestos as { invoice_id: string }[]);
  const documentos = (filas ?? []).map((f: { id: string }) => mapInvoiceFromDb(f, lineasDe.get(f.id) ?? [], impuestosDe.get(f.id) ?? []));

  let banco: EntradaHoy['banco'] = null;
  if (enableBankingConfigurado()) {
    const conexiones = await conexionesDe(db, userId).catch(() => []);
    if (conexiones.length) {
      banco = {
        conexiones: conexiones.map(c => vistaDeConexion(c)).map(c => ({ banco: c.banco, caducada: c.caducada, diasParaCaducar: c.diasParaCaducar })),
        sinConciliar: await sinConciliarDe(db, userId).catch(() => 0),
      };
    }
  }

  const a = ajustes as { business_name?: string; trade_name?: string; nif?: string; igic_enabled?: boolean } | null;
  return {
    correo,
    destinatario: { empresa: a?.trade_name || a?.business_name || 'tu empresa', nombre: meta.full_name || meta.name || null },
    documentos,
    gastos: (filasGastos ?? []).map(mapGastoFromDb),
    nif: a?.nif ?? null,
    igic: !!a?.igic_enabled,
    banco,
  };
}

/** Los avisos importantes de hoy, igual que «Para hoy» del panel. */
export function avisosDeHoy(d: DatosEmpresa, ahora: Date) {
  const hoy = isoDia(ahora);
  const tareas = tareasDeHoy({
    documentos: d.documentos,
    presentacion: presentacionPendiente(
      { facturas: d.documentos.filter(isFactura), gastos: d.gastos, nif: d.nif, igic: d.igic },
      new Date(`${hoy}T12:00:00`),
    ),
    igic: d.igic,
    banco: d.banco,
    hoy,
  });
  return avisosImportantes(tareas);
}

export function enlaces(token: string) {
  const app = urlDelSitio();
  return { app, baja: `${app}/api/correos/baja?t=${encodeURIComponent(token)}` };
}

export interface ResultadoCorreos {
  revisadas: number;
  avisos: number;
  resumenes: number;
  fallos: number;
}

export async function procesarNotificaciones(db: SupabaseClient, ahora: Date = new Date()): Promise<ResultadoCorreos> {
  const { data } = await db.from('notificaciones_correo')
    .select('user_id, avisos, resumen_mensual, token_baja, ultimo_aviso_huella, ultimo_aviso_en, ultimo_resumen')
    .or('avisos.eq.true,resumen_mensual.eq.true');
  const r: ResultadoCorreos = { revisadas: 0, avisos: 0, resumenes: 0, fallos: 0 };

  for (const p of (data ?? []) as Preferencias[]) {
    r.revisadas += 1;
    try {
      const d = await datosDeEmpresa(db, p.user_id);
      if (!d) continue;
      const u = enlaces(p.token_baja);

      if (p.avisos) {
        const importantes = avisosDeHoy(d, ahora);
        const huella = huellaAvisos(importantes);
        if (tocaAvisar({ importantes: importantes.length, huella, ultimaHuella: p.ultimo_aviso_huella, ultimoEn: p.ultimo_aviso_en, ahora })) {
          let q = db.from('notificaciones_correo')
            .update({ ultimo_aviso_huella: huella, ultimo_aviso_en: ahora.toISOString() })
            .eq('user_id', p.user_id);
          q = p.ultimo_aviso_en ? q.eq('ultimo_aviso_en', p.ultimo_aviso_en) : q.is('ultimo_aviso_en', null);
          const { data: reclamada } = await q.select('user_id');
          if (reclamada?.length) {
            try {
              const c = correoAvisos(importantes, d.destinatario, u);
              await enviarCorreo({ para: d.correo, asunto: c.asunto, html: c.html, texto: c.texto, bajaUrl: u.baja, etiqueta: 'avisos' });
              r.avisos += 1;
            } catch (e) {
              await db.from('notificaciones_correo')
                .update({ ultimo_aviso_huella: p.ultimo_aviso_huella, ultimo_aviso_en: p.ultimo_aviso_en })
                .eq('user_id', p.user_id);
              throw e;
            }
          }
        }
      }

      const mes = mesAnteriorA(ahora);
      // Sin ninguna factura nunca no hay nada que resumir.
      if (p.resumen_mensual && p.ultimo_resumen !== mes && d.documentos.length) {
        let q = db.from('notificaciones_correo').update({ ultimo_resumen: mes }).eq('user_id', p.user_id);
        q = p.ultimo_resumen ? q.eq('ultimo_resumen', p.ultimo_resumen) : q.is('ultimo_resumen', null);
        const { data: reclamada } = await q.select('user_id');
        if (reclamada?.length) {
          try {
            const c = correoResumen(resumenDelMes(d.documentos, d.gastos, mes, ahora), d.destinatario, u);
            await enviarCorreo({ para: d.correo, asunto: c.asunto, html: c.html, texto: c.texto, bajaUrl: u.baja, etiqueta: 'resumen-mensual' });
            r.resumenes += 1;
          } catch (e) {
            await db.from('notificaciones_correo').update({ ultimo_resumen: p.ultimo_resumen }).eq('user_id', p.user_id);
            throw e;
          }
        }
      }
    } catch (e) {
      r.fallos += 1;
      console.error('[correos] no se ha podido avisar a una empresa:', e instanceof Error ? e.message : e);
    }
  }
  return r;
}
