/**
 * POST /api/factura-electronica — entrega por el canal configurado.
 *
 *   { accion: 'enviar', id }     → una factura electrónica emitida
 *   { accion: 'comunicar', id }  → una comunicación de estado
 *
 * Todo se lee con la sesión del usuario (RLS): sólo lo suyo. El canal
 * «simulado» no manda nada fuera; el de la AEAT queda pendiente hasta que
 * se active (ver lib/facturaElectronica/canal.ts).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { canalPara, estadoTrasEnvio } from '@/lib/facturaElectronica/canal';
import { leerConfigFe } from '@/lib/facturaElectronica/ambito';
import type { TipoComunicacion } from '@/lib/facturaElectronica/estados';

export const dynamic = 'force-dynamic';

const ID = /^[0-9a-f-]{36}$/i;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (!(await checkRateLimit(`fe:${user.id}`, 120, 60))) {
    return NextResponse.json({ error: 'Demasiadas peticiones seguidas. Espera un minuto.' }, { status: 429 });
  }

  let cuerpo: { accion?: string; id?: string };
  try { cuerpo = await request.json(); } catch { return NextResponse.json({ error: 'Petición no válida' }, { status: 400 }); }
  if (!cuerpo.id || !ID.test(cuerpo.id)) return NextResponse.json({ error: 'Falta el identificador' }, { status: 400 });

  const { data: ajustes } = await supabase.from('company_settings').select('factura_electronica')
    .eq('user_id', user.id).order('updated_at', { ascending: false }).limit(1).maybeSingle();
  const config = leerConfigFe(ajustes?.factura_electronica);
  const canal = canalPara(config.canal);

  if (cuerpo.accion === 'enviar') {
    const { data: fe } = await supabase.from('fe_facturas')
      .select('id, sentido, estado, contenido, huella, numero, nif_emisor, total')
      .eq('id', cuerpo.id).eq('user_id', user.id).maybeSingle();
    if (!fe) return NextResponse.json({ error: 'No se encuentra la factura electrónica.' }, { status: 404 });
    if (fe.sentido !== 'emitida') return NextResponse.json({ error: 'Sólo se envían las facturas emitidas.' }, { status: 400 });
    if (fe.estado !== 'generada' && fe.estado !== 'error') {
      return NextResponse.json({ error: 'Esta factura electrónica ya ha salido.' }, { status: 409 });
    }
    const r = await canal.enviarFactura({
      id: fe.id, contenido: fe.contenido, huella: fe.huella, numero: fe.numero, nifEmisor: fe.nif_emisor, total: Number(fe.total),
    });
    const estado = estadoTrasEnvio(r);
    const { error } = await supabase.from('fe_facturas').update({
      estado, canal: canal.nombre, codigo: r.codigo ?? null, estado_fecha: new Date().toISOString().slice(0, 10),
      respuesta: { ...r.respuesta, mensaje: r.mensaje }, motivo: r.ok || r.pendiente ? null : r.mensaje,
    }).eq('id', fe.id);
    if (error) return NextResponse.json({ error: 'No se ha podido guardar el resultado.' }, { status: 500 });
    return NextResponse.json({ ok: r.ok, pendiente: !!r.pendiente, estado, codigo: r.codigo ?? null, mensaje: r.mensaje, canal: canal.nombre });
  }

  if (cuerpo.accion === 'comunicar') {
    const { data: c } = await supabase.from('fe_comunicaciones')
      .select('id, tipo, fecha_hecho, importe, motivo, estado, fe_factura_id, fe_facturas(numero, nif_emisor, codigo)')
      .eq('id', cuerpo.id).eq('user_id', user.id).maybeSingle();
    if (!c) return NextResponse.json({ error: 'No se encuentra la comunicación.' }, { status: 404 });
    if (c.estado === 'enviada') return NextResponse.json({ error: 'Esta comunicación ya ha salido.' }, { status: 409 });
    const factura = (Array.isArray(c.fe_facturas) ? c.fe_facturas[0] : c.fe_facturas) as { numero: string; nif_emisor: string; codigo: string | null } | null;
    if (!factura) return NextResponse.json({ error: 'No se encuentra la factura de la comunicación.' }, { status: 404 });
    const r = await canal.comunicar({
      id: c.id, tipo: c.tipo as TipoComunicacion, fechaHecho: c.fecha_hecho, importe: c.importe, motivo: c.motivo,
      factura: { numero: factura.numero, nifEmisor: factura.nif_emisor, codigo: factura.codigo },
    });
    const estado = r.ok ? 'enviada' : r.pendiente ? 'pendiente' : 'error';
    const { error } = await supabase.from('fe_comunicaciones').update({
      estado, canal: canal.nombre, enviada_en: r.ok ? new Date().toISOString() : null, respuesta: { ...r.respuesta, mensaje: r.mensaje, codigo: r.codigo },
    }).eq('id', c.id);
    if (error) return NextResponse.json({ error: 'No se ha podido guardar el resultado.' }, { status: 500 });
    return NextResponse.json({ ok: r.ok, pendiente: !!r.pendiente, estado, mensaje: r.mensaje, canal: canal.nombre });
  }

  return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 });
}
