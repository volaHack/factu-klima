/**
 * /api/empresas — varias empresas con un solo acceso.
 *
 *   GET                                  → { empresas }
 *   POST { accion: 'cambiar', id }       → { token }   (enlace de un solo uso)
 *   POST { accion: 'crear', nombre }     → { token }   (y se entra en la nueva)
 *   POST { accion: 'codigo' }            → { codigo, caduca }
 *   POST { accion: 'vincular', codigo }  → { empresas }
 *   POST { accion: 'separar', id }       → { empresas }
 *
 * El `token` lo canjea el navegador con `auth.verifyOtp` y pasa a estar
 * dentro de la otra empresa. Ver lib/empresas/servidor.ts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { accesoA, canjearCodigo, crearEmpresa, empresasDe, ErrorEmpresas, nuevoCodigo, separar } from '@/lib/empresas/servidor';

export const dynamic = 'force-dynamic';

const esId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{20,40}$/i.test(v);

async function usuario() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

function fallo(e: unknown) {
  if (e instanceof ErrorEmpresas) return NextResponse.json({ error: e.message }, { status: e.estado });
  console.error('Empresas:', e instanceof Error ? e.message : e);
  return NextResponse.json({ error: 'No se ha podido completar. Prueba otra vez.' }, { status: 500 });
}

export async function GET() {
  const { user } = await usuario();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  try {
    return NextResponse.json({ empresas: await empresasDe(user.id) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return fallo(e);
  }
}

export async function POST(request: NextRequest) {
  const { supabase, user } = await usuario();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  let cuerpo: Record<string, unknown> = {};
  try { cuerpo = await request.json(); } catch { /* se valida abajo */ }
  const accion = cuerpo.accion;

  const limite = accion === 'crear' ? 5 : accion === 'vincular' ? 10 : 30;
  if (!(await checkRateLimit(`empresas-${String(accion)}:${user.id}`, limite, accion === 'crear' ? 3600 : 600))) {
    return NextResponse.json({ error: 'Demasiados intentos seguidos. Espera un poco.' }, { status: 429 });
  }

  // Quien tenga la verificación en dos pasos activada tiene que haberla
  // pasado en esta sesión para saltar a otra empresa: si no, bastaría la
  // contraseña de una para entrar en todas.
  if (accion === 'cambiar' || accion === 'crear') {
    const { data: nivel } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (nivel?.nextLevel === 'aal2' && nivel.currentLevel !== 'aal2') {
      return NextResponse.json({ error: 'Antes confirma tu acceso con el código de verificación en dos pasos.' }, { status: 403 });
    }
  }

  try {
    switch (accion) {
      case 'cambiar':
        if (!esId(cuerpo.id)) break;
        return NextResponse.json({ token: await accesoA(user.id, cuerpo.id) });
      case 'crear':
        return NextResponse.json({ token: await crearEmpresa(user, String(cuerpo.nombre ?? '')) });
      case 'codigo':
        return NextResponse.json(await nuevoCodigo(user.id));
      case 'vincular':
        await canjearCodigo(user.id, String(cuerpo.codigo ?? ''));
        return NextResponse.json({ empresas: await empresasDe(user.id) });
      case 'separar':
        if (!esId(cuerpo.id)) break;
        await separar(user.id, cuerpo.id);
        return NextResponse.json({ empresas: await empresasDe(user.id) });
    }
  } catch (e) {
    return fallo(e);
  }
  return NextResponse.json({ error: 'Petición mal formada.' }, { status: 400 });
}
