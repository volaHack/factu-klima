/**
 * GET /api/copia — la copia de seguridad COMPLETA de la empresa, leída del
 * servidor (no de la caché de este equipo).
 *
 * Va con la sesión del usuario: RLS sólo deja leer lo suyo, y además cada
 * tabla se filtra por su `user_id` (o por su factura, albarán… madre), para
 * que una gestoría no se lleve en la copia lo de las empresas que asesora.
 *
 * O sale entera o no sale: si una tabla falla al leerse, la respuesta es un
 * error, nunca una copia a medias que parezca buena.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { todasLasFilas, porTrozos } from '@/lib/porTandas';
import { construirCopia } from '@/lib/copia/nucleo.mjs';
import { verificarCopia } from '@/lib/copia/verificar';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type Fila = Record<string, unknown>;

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'No autenticado' }, { status: 401 });
  if (!(await checkRateLimit(`copia:${user.id}`, 6, 3600))) {
    return NextResponse.json({ ok: false, error: 'Demasiadas copias seguidas. Espera un rato.' }, { status: 429 });
  }

  const noDisponibles: string[] = [];
  const leer = async (tabla: string, filtro: { columna: string; valores: string[] }): Promise<Fila[]> => {
    const orden = tabla === 'verifactu_config' ? 'user_id' : 'id';
    const { data, error } = await porTrozos(filtro.valores, trozo => todasLasFilas((desde, hasta) => supabase
      .from(tabla).select('*').in(filtro.columna, trozo).order(orden).range(desde, hasta)));
    if (error) {
      const fallo = error as { code?: string; message?: string };
      // Una tabla que aún no existe en esta instalación (migración sin aplicar) no es un fallo de lectura.
      if (fallo.code === '42P01' || /does not exist|schema cache/i.test(fallo.message ?? '')) {
        noDisponibles.push(tabla);
        return [];
      }
      throw new Error(`No se ha podido leer ${tabla}: ${fallo.message ?? 'error'}`);
    }
    return (data ?? []) as Fila[];
  };

  let copia;
  try {
    copia = await construirCopia(leer, user.id);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `No se ha hecho la copia: ${e instanceof Error ? e.message : 'error al leer'}. No se ha descargado nada incompleto.` },
      { status: 500 },
    );
  }
  const verificacion = await verificarCopia(copia);
  const cuerpo = JSON.stringify({ ...copia, tablasNoDisponibles: noDisponibles, verificacionAlGenerar: verificacion });
  const fecha = new Date().toISOString().slice(0, 10);
  return new NextResponse(cuerpo, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="klima-copia-${fecha}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
