/**
 * POST /api/errores — el navegador avisa de un fallo que ha visto alguien.
 *
 * Sin sesión también se acepta (una página pública también puede fallar),
 * con un tope por IP para que nadie llene la tabla.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, clientIpFromRequest } from '@/lib/rateLimit';
import { registrarError } from '@/lib/errores/registrar';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!(await checkRateLimit(`errores:${clientIpFromRequest(request)}`, 30, 600))) {
    return new NextResponse(null, { status: 204 });
  }
  let c: { mensaje?: unknown; pila?: unknown; ruta?: unknown };
  try { c = await request.json(); } catch { return new NextResponse(null, { status: 400 }); }
  const mensaje = String(c.mensaje ?? '').trim();
  if (!mensaje) return new NextResponse(null, { status: 400 });

  let userId: string | null = null;
  try {
    const supabase = await createClient();
    userId = (await supabase.auth.getUser()).data.user?.id ?? null;
  } catch { /* sin sesión */ }

  await registrarError({
    origen: 'navegador',
    mensaje,
    pila: typeof c.pila === 'string' ? c.pila : null,
    ruta: typeof c.ruta === 'string' ? c.ruta : '/',
    userId,
    navegador: request.headers.get('user-agent'),
  });
  return new NextResponse(null, { status: 204 });
}
