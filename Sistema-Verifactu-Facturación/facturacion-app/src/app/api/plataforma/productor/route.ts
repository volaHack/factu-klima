/**
 * GET /api/plataforma/productor — quién produce el software (datos públicos:
 * son los de la declaración responsable). La pantalla de Veri*Factu los
 * enseña en vez de pedírselos a cada cuenta.
 */

import { NextResponse } from 'next/server';
import { productorDePlataforma } from '@/lib/plataforma/productor';

export const dynamic = 'force-dynamic';

export async function GET() {
  const p = await productorDePlataforma();
  const configurado = Boolean(p?.nombre && p?.nif);
  return NextResponse.json(configurado
    ? { configurado, nombre: p!.nombre, nif: p!.nif, sistema: p!.sistemaNombre, version: p!.sistemaVersion }
    : { configurado: false });
}
