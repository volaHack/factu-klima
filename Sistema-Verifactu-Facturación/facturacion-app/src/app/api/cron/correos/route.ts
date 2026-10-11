/**
 * GET /api/cron/correos — cada mañana: los avisos importantes y, a primeros
 * de mes, el resumen del mes anterior, a las empresas que lo tienen
 * encendido en Ajustes → Notificaciones por correo.
 */

import { NextResponse } from 'next/server';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { cronAutorizado } from '@/lib/seguridad/secretos';
import { correoConfigurado } from '@/lib/correo/enviar';
import { procesarNotificaciones } from '@/lib/notificaciones/servidor';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!cronAutorizado(request)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!correoConfigurado()) return NextResponse.json({ ok: true, omitido: 'sin RESEND_API_KEY' });
  const resultado = await procesarNotificaciones(supabaseServicio());
  return NextResponse.json({ ok: true, ...resultado });
}
