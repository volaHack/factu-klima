import { NextResponse } from 'next/server';

import { cobrosAbiertos } from '@/lib/plataforma/estado';

/**
 * Si la plataforma admite pagos ya. Lo pregunta la cabecera para enseñar
 * o no el botón de propinas; no dice nada más que eso.
 */
export async function GET() {
  return NextResponse.json(
    { cobrosAbiertos: await cobrosAbiertos() },
    { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' } },
  );
}
