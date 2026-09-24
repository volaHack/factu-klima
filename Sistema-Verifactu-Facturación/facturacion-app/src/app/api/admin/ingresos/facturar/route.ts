import { NextResponse } from 'next/server';

import { adminParaApi } from '@/lib/admin/dal';
import { supabaseServicio } from '@/lib/supabase/servicio';

export const dynamic = 'force-dynamic';

/**
 * Emite las facturas de los cobros que quedaron pendientes y que YA son
 * de después de la fecha de alta (p. ej. los que llegaron antes de poner
 * la fecha en Configuración). Lo cobrado antes del alta NO se factura
 * aquí: eso se regulariza con la gestoría.
 */
export async function POST() {
  const admin = await adminParaApi();
  if (!admin.ok) return admin.respuesta;

  const db = supabaseServicio();
  const { data: cfg } = await db.from('plataforma_config').select('actividad_desde').single();
  if (!cfg?.actividad_desde) {
    return NextResponse.json({ error: 'Pon antes la fecha de alta de la actividad en Configuración.' }, { status: 400 });
  }

  const { data: pendientes, error } = await db.from('ingresos_plataforma')
    .select('id, stripe_ref, factura_propuesta')
    .eq('estado', 'pendiente_alta')
    .gte('fecha', cfg.actividad_desde)
    .not('factura_propuesta', 'is', null)
    .order('fecha', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let emitidas = 0;
  const fallos: string[] = [];
  for (const p of pendientes ?? []) {
    const { data: invoiceId, error: e } = await db.rpc('fn_emitir_factura_plataforma', { p: p.factura_propuesta });
    if (e) {
      fallos.push(`${p.stripe_ref}: ${e.message}`);
      await db.from('ingresos_plataforma').update({ estado: 'revisar', nota: `No se pudo emitir: ${e.message}` }).eq('id', p.id);
      continue;
    }
    await db.from('ingresos_plataforma')
      .update({ estado: 'facturado', invoice_id: typeof invoiceId === 'string' ? invoiceId : null, nota: null })
      .eq('id', p.id);
    emitidas++;
  }

  await db.from('admin_registro').insert({
    admin_user_id: admin.user.id,
    accion: 'facturar_ingresos_pendientes',
    motivo: `Emitidas ${emitidas} facturas de cobros pendientes${fallos.length ? `; ${fallos.length} con error` : ''}.`,
  });

  return NextResponse.json({ ok: true, emitidas, fallos });
}
