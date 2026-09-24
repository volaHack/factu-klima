/**
 * Envío automático diario de recordatorios de cobro.
 *
 * Vercel Cron la llama con `Authorization: Bearer $CRON_SECRET`. Recorre las
 * cuentas que lo tienen activado (metadatos `klima_recordatorios.a`) y, a
 * cada cliente con facturas vencidas y correo en su ficha, le manda un
 * recordatorio si toca: el primero tras unos días de retraso, y luego cada
 * tantos días. Todo queda anotado en `recordatorios_cobro` (migración 051),
 * que es lo que impide repetir.
 */

import { NextResponse } from 'next/server';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { correoDisponible, enviarCorreo } from '@/lib/recordatorios/correo';
import { AJUSTES_POR_DEFECTO, CAMPO_AJUSTES, facturaDeFila, faltaLaTabla, type AjustesRecordatorios } from '@/lib/recordatorios/filas';
import { EMAIL_VALIDO, mensaje, porCliente, toca, vencidas } from '@/lib/recordatorios/textos';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_POR_CUENTA = 40;

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (!correoDisponible()) return NextResponse.json({ ok: true, omitido: 'correo sin configurar' });

  const db = supabaseServicio();
  const hoy = new Date().toISOString().slice(0, 10);

  // Las cuentas con el envío automático activado.
  const cuentas: { id: string; email?: string; ajustes: AjustesRecordatorios }[] = [];
  for (let pagina = 1; pagina <= 50; pagina++) {
    const { data, error } = await db.auth.admin.listUsers({ page: pagina, perPage: 1000 });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    for (const u of data.users) {
      const a = u.user_metadata?.[CAMPO_AJUSTES];
      if (a?.a === true) cuentas.push({ id: u.id, email: u.email, ajustes: { ...AJUSTES_POR_DEFECTO, ...a } });
    }
    if (data.users.length < 1000) break;
  }

  const resumen = { cuentas: cuentas.length, enviados: 0, fallidos: 0, errores: [] as string[] };

  for (const cuenta of cuentas) {
    const [fac, cli, aj, rec] = await Promise.all([
      db.from('invoices').select('*').eq('user_id', cuenta.id).in('status', ['emitida', 'pendiente', 'vencida', 'parcial']).lt('due_date', hoy),
      db.from('clients').select('id, business_name, email').eq('user_id', cuenta.id),
      db.from('company_settings').select('business_name, trade_name, email, phone, iban').eq('user_id', cuenta.id).order('updated_at', { ascending: false }).limit(1),
      db.from('recordatorios_cobro').select('cliente_id, enviado_en').eq('user_id', cuenta.id).order('enviado_en', { ascending: false }).limit(2000),
    ]);
    if (rec.error) {
      resumen.errores.push(faltaLaTabla(rec.error) ? 'Falta la migración 051 (recordatorios_cobro).' : rec.error.message);
      break; // sin registro no se puede saber qué se ha enviado: mejor no enviar nada
    }
    if (fac.error || !fac.data?.length) continue;

    const ultimo = new Map<string, string>();
    for (const r of rec.data ?? []) if (r.cliente_id && !ultimo.has(r.cliente_id)) ultimo.set(r.cliente_id, r.enviado_en);
    const correos = new Map((cli.data ?? []).map(c => [c.id as string, { nombre: c.business_name as string, email: String(c.email ?? '').trim() }]));
    const e = aj.data?.[0];
    const de = { nombre: e?.trade_name || e?.business_name || 'Administración', email: e?.email, telefono: e?.phone, iban: e?.iban };

    let enviados = 0;
    for (const d of porCliente(vencidas(fac.data.map(facturaDeFila), hoy))) {
      if (enviados >= MAX_POR_CUENTA) break;
      const ficha = correos.get(d.clienteId);
      if (!ficha || !EMAIL_VALIDO.test(ficha.email)) continue;
      if (!toca(d, ultimo.get(d.clienteId), hoy, cuenta.ajustes.c, cuenta.ajustes.p)) continue;
      const m = mensaje(d, de);
      try {
        await enviarCorreo({ para: ficha.email, asunto: m.asunto, texto: m.texto, empresa: de.nombre, responderA: e?.email || cuenta.email });
        await db.from('recordatorios_cobro').insert({
          user_id: cuenta.id, cliente_id: d.clienteId, cliente_nombre: ficha.nombre, canal: 'automatico',
          factura_ids: d.facturas.map(v => v.factura.id), destinatario: ficha.email, asunto: m.asunto, importe: d.total,
        });
        enviados++;
        resumen.enviados++;
      } catch (err) {
        resumen.fallidos++;
        if (resumen.errores.length < 10) resumen.errores.push(err instanceof Error ? err.message : String(err));
      }
    }
  }
  return NextResponse.json({ ok: true, ...resumen });
}
