/**
 * POST /api/verifactu/enviar — manda a la AEAT lo que haya pendiente.
 *
 * Todo pasa en el servidor porque el certificado tiene que descifrarse
 * para levantar el TLS mutuo, y la clave de descifrado no puede bajar al
 * navegador ni una sola vez.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { enviarPendientes } from '@/lib/verifactu/enviarPendientes';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'No autenticado' }, { status: 401 });
  }

  // Diez por minuto es de sobra para el uso legítimo y corta en
  // seco un bucle accidental que mande mil veces lo mismo.
  if (!(await checkRateLimit(`verifactu-enviar:${user.id}`, 10, 60))) {
    return NextResponse.json(
      { ok: false, error: 'Demasiados envíos seguidos. Espera un minuto.' },
      { status: 429 },
    );
  }

  const r = await enviarPendientes(supabase, user.id);
  return NextResponse.json(r.cuerpo, { status: r.estado });
}
