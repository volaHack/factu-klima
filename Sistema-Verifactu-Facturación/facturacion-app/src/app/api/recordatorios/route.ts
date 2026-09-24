/**
 * /api/recordatorios
 *
 * GET  → { correo, automatico }: qué puede hacer el servidor (según las
 *        variables de entorno), para que la pantalla lo diga claro.
 * POST → envía un recordatorio por correo a un cliente de la cuenta y lo
 *        anota. Entrada: { clienteId, para, asunto, texto, facturaIds, importe }.
 *
 * Sólo a clientes de la propia cuenta y con el correo que tienen en su
 * ficha: el servidor no manda correos a direcciones cualesquiera.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { correoDisponible, enviarCorreo } from '@/lib/recordatorios/correo';
import { faltaLaTabla } from '@/lib/recordatorios/filas';

export const dynamic = 'force-dynamic';

export async function GET() {
  const correo = correoDisponible();
  return NextResponse.json({
    correo,
    automatico: correo && !!process.env.SUPABASE_SERVICE_ROLE_KEY && !!process.env.CRON_SECRET,
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (!correoDisponible()) return NextResponse.json({ error: 'El envío de correo no está configurado.' }, { status: 503 });

  if (!(await checkRateLimit(`recordatorios:${user.id}`, 40, 3600))) {
    return NextResponse.json({ error: 'Demasiados recordatorios en una hora. Sigue más tarde.' }, { status: 429 });
  }

  let c: { clienteId?: string; para?: string; asunto?: string; texto?: string; facturaIds?: string[]; importe?: number };
  try { c = await request.json(); } catch { return NextResponse.json({ error: 'Petición mal formada.' }, { status: 400 }); }
  const para = String(c.para ?? '').trim().toLowerCase();
  const asunto = String(c.asunto ?? '').trim().slice(0, 200);
  const texto = String(c.texto ?? '').slice(0, 8000);
  if (!c.clienteId || !para || !asunto || !texto) return NextResponse.json({ error: 'Faltan datos del recordatorio.' }, { status: 400 });

  const { data: cliente } = await supabase.from('clients').select('id, business_name, email')
    .eq('id', c.clienteId).eq('user_id', user.id).maybeSingle();
  if (!cliente || String(cliente.email ?? '').trim().toLowerCase() !== para) {
    return NextResponse.json({ error: 'Ese correo no es el de la ficha del cliente.' }, { status: 400 });
  }

  const { data: ajustes } = await supabase.from('company_settings').select('business_name, trade_name, email')
    .eq('user_id', user.id).order('updated_at', { ascending: false }).limit(1);
  const empresa = ajustes?.[0]?.trade_name || ajustes?.[0]?.business_name || 'Tu proveedor';

  try {
    await enviarCorreo({ para, asunto, texto, empresa, responderA: ajustes?.[0]?.email || user.email || undefined });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'No se ha podido enviar.' }, { status: 502 });
  }

  const { error } = await supabase.from('recordatorios_cobro').insert({
    user_id: user.id, cliente_id: cliente.id, cliente_nombre: cliente.business_name, canal: 'email',
    factura_ids: Array.isArray(c.facturaIds) ? c.facturaIds.slice(0, 100) : [], destinatario: para, asunto,
    importe: Number(c.importe) || null,
  });
  return NextResponse.json({ ok: true, anotado: !error, sinTabla: !!error && faltaLaTabla(error) });
}
