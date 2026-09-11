import { NextResponse } from 'next/server';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { enviarPendientes } from '@/lib/verifactu/enviarPendientes';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Vercel Cron la llama con `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const db = supabaseServicio();
  const { data: cfg } = await db.from('plataforma_config').select('emisor_user_id').single();
  if (!cfg) return NextResponse.json({ ok: false, error: 'Falta plataforma_config' }, { status: 500 });

  const { data: vf } = await db.from('verifactu_config').select('envio_automatico').eq('user_id', cfg.emisor_user_id).maybeSingle();
  if (!vf?.envio_automatico) return NextResponse.json({ ok: true, omitido: 'envío automático desactivado' });

  const r = await enviarPendientes(db, cfg.emisor_user_id);
  return NextResponse.json(r.cuerpo, { status: r.estado });
}
