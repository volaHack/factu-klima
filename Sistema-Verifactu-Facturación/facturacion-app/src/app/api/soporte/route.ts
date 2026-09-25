/**
 * POST /api/soporte — la cuenta escribe a soporte.
 *
 * Entrada: { texto, pagina? }. Usa la conversación más reciente de la cuenta
 * o abre una. Se escribe con la sesión de quien escribe (la base de datos
 * comprueba que es suya) y, si hay correo configurado, se avisa a la
 * administración.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { avisarPorCorreo } from '@/lib/soporteServidor';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Tu sesión ha caducado. Vuelve a entrar.' }, { status: 401 });

  if (!(await checkRateLimit(`soporte:${user.id}`, 30, 600))) {
    return NextResponse.json({ error: 'Muchos mensajes seguidos. Espera un momento.' }, { status: 429 });
  }

  let c: { texto?: unknown; pagina?: unknown };
  try { c = await request.json(); } catch { return NextResponse.json({ error: 'Petición mal formada.' }, { status: 400 }); }
  const texto = String(c.texto ?? '').trim().slice(0, 4000);
  const pagina = typeof c.pagina === 'string' ? c.pagina.slice(0, 200) : null;
  if (!texto) return NextResponse.json({ error: 'El mensaje está vacío.' }, { status: 400 });

  const { data: previas } = await supabase.from('soporte_conversaciones')
    .select('id').eq('user_id', user.id).order('ultimo_mensaje_en', { ascending: false }).limit(1);
  let conversacionId = previas?.[0]?.id as string | undefined;
  let nueva = false;

  if (!conversacionId) {
    const { data: aj } = await supabase.from('company_settings').select('business_name, trade_name')
      .eq('user_id', user.id).order('updated_at', { ascending: false }).limit(1);
    const empresa = aj?.[0]?.trade_name || aj?.[0]?.business_name || null;
    const { data: conv, error } = await supabase.from('soporte_conversaciones')
      .insert({ user_id: user.id, asunto: texto.slice(0, 80), empresa, email: user.email ?? null })
      .select('id').single();
    if (error || !conv) return NextResponse.json({ error: 'No se ha podido abrir la conversación.' }, { status: 500 });
    conversacionId = conv.id;
    nueva = true;
  }

  const { error } = await supabase.from('soporte_mensajes')
    .insert({ conversacion_id: conversacionId, autor_id: user.id, de_admin: false, texto, pagina });
  if (error) return NextResponse.json({ error: 'No se ha podido enviar el mensaje.' }, { status: 500 });

  await avisarPorCorreo({
    a: 'admin',
    asunto: nueva ? 'Nueva conversación de soporte' : 'Nuevo mensaje de soporte',
    texto: `${user.email ?? 'Una cuenta'} ha escrito${pagina ? ` desde ${pagina}` : ''}:\n\n${texto}\n\nContesta desde Administración → Soporte.`,
  });

  return NextResponse.json({ ok: true, conversacionId });
}
