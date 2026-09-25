/**
 * POST /api/admin/soporte — la administración contesta, cierra o reabre.
 *
 * Entrada: { conversacionId, texto } para contestar, o
 *          { conversacionId, estado: 'abierta' | 'cerrada' }.
 * Se escribe con la sesión del administrador: la base de datos comprueba
 * que lo es (public.soy_admin(), migración 053).
 */

import { NextResponse } from 'next/server';
import { adminParaApi } from '@/lib/admin/dal';
import { createClient } from '@/lib/supabase/server';
import { avisarPorCorreo } from '@/lib/soporteServidor';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const admin = await adminParaApi();
  if (!admin.ok) return admin.respuesta;

  let c: { conversacionId?: unknown; texto?: unknown; estado?: unknown };
  try { c = await request.json(); } catch { return NextResponse.json({ error: 'Petición mal formada.' }, { status: 400 }); }
  const conversacionId = String(c.conversacionId ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(conversacionId)) return NextResponse.json({ error: 'Conversación no válida.' }, { status: 400 });

  const supabase = await createClient();

  if (c.estado === 'abierta' || c.estado === 'cerrada') {
    const { error } = await supabase.from('soporte_conversaciones').update({ estado: c.estado }).eq('id', conversacionId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const texto = String(c.texto ?? '').trim().slice(0, 4000);
  if (!texto) return NextResponse.json({ error: 'El mensaje está vacío.' }, { status: 400 });

  const { data: conv } = await supabase.from('soporte_conversaciones').select('email').eq('id', conversacionId).single();
  const { error } = await supabase.from('soporte_mensajes')
    .insert({ conversacion_id: conversacionId, autor_id: admin.user.id, de_admin: true, texto });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await supabase.from('soporte_conversaciones').update({ no_leidos_admin: 0 }).eq('id', conversacionId);

  if (conv?.email) {
    await avisarPorCorreo({
      a: conv.email,
      asunto: 'Te hemos contestado',
      texto: `${texto}\n\n—\nPuedes seguir la conversación desde el botón de soporte, abajo a la derecha, dentro del programa.`,
    });
  }
  return NextResponse.json({ ok: true });
}
