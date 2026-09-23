import { NextRequest, NextResponse } from 'next/server';

import { FalloIA, respuestaDeFallo } from '@/lib/ia/cliente';
import { configuracionVoz, MAXIMO_AUDIO_BASE64, transcribir } from '@/lib/ia/voz';
import { checkRateLimit } from '@/lib/rateLimit';
import { createClient } from '@/lib/supabase/server';

/**
 * NOTA DE VOZ → TEXTO
 *
 * Recibe el WAV que graba la Asistencia IA cuando el navegador no ha
 * sabido transcribir por su cuenta, y devuelve lo dicho. El audio no se
 * guarda en ningún sitio: entra, se transcribe y se olvida.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Tu sesión ha caducado. Vuelve a entrar.' }, { status: 401 });
  }

  if (!configuracionVoz()) {
    return NextResponse.json(
      { error: 'Este navegador no sabe dictar y el servidor no tiene un modelo de voz. Usa Chrome o Edge, o escribe la pregunta.' },
      { status: 501 },
    );
  }

  if (!(await checkRateLimit(`voz:${user.id}`, 40, 3600))) {
    return NextResponse.json({ error: 'Has mandado muchas notas de voz seguidas. Espera un poco.' }, { status: 429 });
  }

  let audio: string;
  try {
    const cuerpo = await request.json() as { audio?: unknown };
    audio = typeof cuerpo.audio === 'string' ? cuerpo.audio : '';
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  if (!audio || !/^[A-Za-z0-9+/]+=*$/.test(audio.slice(0, 200))) {
    return NextResponse.json({ error: 'No ha llegado ningún audio.' }, { status: 400 });
  }
  if (audio.length > MAXIMO_AUDIO_BASE64) {
    return NextResponse.json({ error: 'La nota es demasiado larga. Prueba con menos de un minuto.' }, { status: 413 });
  }

  try {
    const texto = await transcribir(audio);
    return NextResponse.json({ texto });
  } catch (err) {
    const fallo = err instanceof FalloIA ? err : new FalloIA('rechazado', String(err));
    console.error('[ayuda/voz]', fallo.motivo, fallo.detalle);
    const { estado, error } = respuestaDeFallo(fallo, 'Escribe la pregunta mientras tanto.');
    return NextResponse.json({ error }, { status: estado });
  }
}
