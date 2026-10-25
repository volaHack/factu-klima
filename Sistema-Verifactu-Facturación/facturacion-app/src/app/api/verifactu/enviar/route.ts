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
import { supabaseServicio } from '@/lib/supabase/servicio';

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

  // El resultado del envío lo anota el servidor con su propia credencial:
  // desde la migración 078 una sesión de usuario no puede marcar un registro
  // como aceptado (sólo pedir la subsanación de uno rechazado).
  // `enviarPendientes` filtra todo por `user.id`.
  const r = await enviarPendientes(supabaseServicio(), user.id);
  return NextResponse.json(r.cuerpo, { status: r.estado });
}
