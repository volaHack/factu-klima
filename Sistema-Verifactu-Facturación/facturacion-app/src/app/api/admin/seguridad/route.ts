/**
 * POST /api/admin/seguridad — bloquear o desbloquear una IP a mano:
 * { accion: 'bloquear' | 'desbloquear', ip, motivo?, horas? }.
 * Queda firmado en el registro de auditoría.
 */

import { NextResponse } from 'next/server';
import { adminParaApi } from '@/lib/admin/dal';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { esIpPrivada, ipValida } from '@/lib/seguridad/firmas';
import { olvidarIpsBloqueadas } from '@/lib/seguridad/eventos';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const admin = await adminParaApi();
  if (!admin.ok) return admin.respuesta;
  let c: { accion?: unknown; ip?: unknown; motivo?: unknown; horas?: unknown };
  try { c = await request.json(); } catch { return NextResponse.json({ error: 'Petición mal formada.' }, { status: 400 }); }

  const ip = String(c.ip ?? '').trim().toLowerCase();
  if (!ipValida(ip)) return NextResponse.json({ error: 'Esa dirección IP no es válida.' }, { status: 400 });
  const motivo = String(c.motivo ?? '').trim().slice(0, 300) || 'Bloqueada a mano desde el panel';
  const db = supabaseServicio();

  if (c.accion === 'bloquear') {
    // Una IP privada es el propio servidor o la red de Vercel: bloquearla
    // dejaría fuera a todo el mundo.
    if (esIpPrivada(ip)) return NextResponse.json({ error: 'Es una dirección interna: bloquearla dejaría fuera a todos.' }, { status: 400 });
    const horas = Number(c.horas);
    const hasta = Number.isFinite(horas) && horas > 0 ? new Date(Date.now() + Math.min(horas, 24 * 365) * 3_600_000).toISOString() : null;
    const { error } = await db.from('ips_bloqueadas').upsert({ ip, motivo, automatico: false, creado_en: new Date().toISOString(), hasta });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await db.from('admin_registro').insert({ admin_id: admin.user.id, accion: 'bloquear_ip', detalle: { ip, hasta }, motivo });
  } else if (c.accion === 'desbloquear') {
    const { error } = await db.from('ips_bloqueadas').delete().eq('ip', ip);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await db.from('admin_registro').insert({ admin_id: admin.user.id, accion: 'desbloquear_ip', detalle: { ip }, motivo });
  } else {
    return NextResponse.json({ error: 'Acción desconocida.' }, { status: 400 });
  }

  olvidarIpsBloqueadas();
  return NextResponse.json({ ok: true });
}
