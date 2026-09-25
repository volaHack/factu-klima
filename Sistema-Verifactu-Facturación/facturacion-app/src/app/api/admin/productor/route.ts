/**
 * POST /api/admin/productor — guarda los datos del productor del software.
 *
 * Aparte del resto de la configuración a propósito: la tarjeta se guarda
 * sola mientras se escribe, sin «motivo de auditoría» (el registro se
 * anota igual, con lo que cambió). Antes iba en el mismo envío que las
 * series y el IGIC y sólo se guardaba al rellenar el motivo y pulsar el
 * botón del final de la página, así que se quedaba sin guardar.
 */

import { NextResponse } from 'next/server';
import { adminParaApi } from '@/lib/admin/dal';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { columnasDelProductor, erroresDelProductor, productorDesdeJson } from '@/lib/plataforma/validarProductor';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const admin = await adminParaApi();
  if (!admin.ok) return admin.respuesta;

  let cuerpo: unknown;
  try { cuerpo = await request.json(); } catch { cuerpo = null; }
  const productor = productorDesdeJson((cuerpo as { productor?: unknown } | null)?.productor);
  if (!productor) return NextResponse.json({ error: 'Faltan los datos del productor.' }, { status: 400 });

  const errores = erroresDelProductor(productor);
  if (Object.keys(errores).length) {
    return NextResponse.json({ error: Object.values(errores)[0], errores }, { status: 400 });
  }

  const db = supabaseServicio();
  const { data: anterior } = await db.from('plataforma_config')
    .select('productor_nombre, productor_nif').eq('id', true).maybeSingle();
  const columnas = columnasDelProductor(productor);

  const { data: guardado, error } = await db.from('plataforma_config')
    .update(columnas).eq('id', true).select('id').maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!guardado) return NextResponse.json({ error: 'No existe la fila de configuración de la plataforma.' }, { status: 500 });

  // Sólo se anota cuando cambia quién es el productor, no a cada tecla del domicilio.
  if (anterior?.productor_nombre !== columnas.productor_nombre || anterior?.productor_nif !== columnas.productor_nif) {
    await db.from('admin_registro').insert({
      admin_id: admin.user.id,
      accion: 'productor_software',
      detalle: { antes: anterior ?? null, ahora: { nombre: columnas.productor_nombre, nif: columnas.productor_nif } },
      motivo: 'Datos del productor del software',
    });
  }

  return NextResponse.json({ ok: true, guardadoEn: new Date().toISOString() });
}
