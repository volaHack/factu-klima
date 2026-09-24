/**
 * POST /api/gastos/ticket — lee la foto de un ticket y devuelve el gasto.
 *
 * Entrada: { imagen: "data:image/jpeg;base64,…", igic?: boolean }
 * Salida:  DatosTicket (ver lib/ia/ticket.ts), ya filtrado: cuentas que
 *          cuadran, tipo que existe, NIF que pasa la letra de control.
 *
 * La foto no se guarda en ningún sitio: va al modelo y se olvida.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { configuracionIA, FalloIA, generarTexto, modeloVision, respuestaDeFallo } from '@/lib/ia/cliente';
import { ESQUEMA_TICKET, instruccionesTicket, interpretarTicket } from '@/lib/ia/ticket';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** ~4 MB de imagen. El navegador la reduce antes de mandarla, así que sobra. */
const MAXIMO_BASE64 = 5_600_000;

export async function POST(request: NextRequest) {
  const config = configuracionIA();
  if (!config) {
    return NextResponse.json({ error: 'La lectura de tickets usa la IA, y no está configurada en este servidor.' }, { status: 501 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Tu sesión ha caducado. Vuelve a entrar.' }, { status: 401 });

  if (!(await checkRateLimit(`ticket:${user.id}`, 60, 3600))) {
    return NextResponse.json({ error: 'Muchos tickets seguidos. Espera un poco.' }, { status: 429 });
  }

  let cuerpo: { imagen?: string; igic?: boolean };
  try { cuerpo = await request.json(); } catch { return NextResponse.json({ error: 'Petición mal formada.' }, { status: 400 }); }
  const m = /^data:(image\/(?:jpeg|png|webp|heic|heif));base64,([A-Za-z0-9+/=]+)$/.exec(String(cuerpo.imagen ?? ''));
  if (!m) return NextResponse.json({ error: 'Hace falta una foto (JPEG, PNG o WebP).' }, { status: 400 });
  if (m[2].length > MAXIMO_BASE64) return NextResponse.json({ error: 'La foto es demasiado grande.' }, { status: 413 });

  const igic = !!cuerpo.igic;
  const hoy = new Date().toISOString().slice(0, 10);
  try {
    const texto = await generarTexto({
      instrucciones: instruccionesTicket(igic, hoy),
      imagenes: [{ mime: m[1], base64: m[2] }],
      modelo: modeloVision(config),
      json: true,
      esquemaJson: ESQUEMA_TICKET,
      temperatura: 0,
      maximoTokens: 600,
      tiempoLimiteMs: 40_000,
    });
    return NextResponse.json(interpretarTicket(texto, igic, hoy));
  } catch (err) {
    if (err instanceof FalloIA) {
      console.error('[gastos/ticket]', err.motivo, err.detalle);
      const r = respuestaDeFallo(err, 'Puedes apuntar el gasto a mano.');
      return NextResponse.json({ error: r.error }, { status: r.estado });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : 'No se ha podido leer el ticket.' }, { status: 422 });
  }
}
