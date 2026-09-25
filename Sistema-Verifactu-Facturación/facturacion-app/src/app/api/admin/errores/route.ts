/** POST /api/admin/errores — marca como resuelto (o no) un fallo: { huella, resuelto }. */

import { NextResponse } from 'next/server';
import { adminParaApi } from '@/lib/admin/dal';
import { supabaseServicio } from '@/lib/supabase/servicio';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const admin = await adminParaApi();
  if (!admin.ok) return admin.respuesta;
  let c: { huella?: unknown; resuelto?: unknown };
  try { c = await request.json(); } catch { return NextResponse.json({ error: 'Petición mal formada.' }, { status: 400 }); }
  const huella = String(c.huella ?? '');
  if (!/^[a-z0-9]{1,16}$/.test(huella)) return NextResponse.json({ error: 'Huella no válida.' }, { status: 400 });
  const { error } = await supabaseServicio().from('errores_app').update({ resuelto: c.resuelto !== false }).eq('huella', huella);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
