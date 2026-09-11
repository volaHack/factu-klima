import 'server-only';
import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

interface Comprobacion { user: User | null; esAdmin: boolean; aal2: boolean; }

const comprobar = cache(async (): Promise<Comprobacion> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, esAdmin: false, aal2: false };

  const [{ data: esAdmin }, { data: claims }] = await Promise.all([
    supabase.rpc('soy_admin'),
    supabase.auth.getClaims(),
  ]);
  return { user, esAdmin: esAdmin === true, aal2: claims?.claims?.aal === 'aal2' };
});

/** Páginas: sin sesión a /login; si no es admin, 404 (no se confirma que exista). */
export async function verificarAdmin() {
  const r = await comprobar();
  if (!r.user) redirect('/login');
  if (!r.esAdmin) notFound();
  return { user: r.user, aal2: r.aal2 };
}

/** Páginas con datos: además, el segundo factor. */
export async function exigirAdminCon2fa() {
  const r = await verificarAdmin();
  if (!r.aal2) redirect('/admin/2fa');
  return r;
}

/** Route handlers: responden en JSON en vez de redirigir. */
export async function adminParaApi():
  Promise<{ ok: true; user: User } | { ok: false; respuesta: NextResponse }> {
  const r = await comprobar();
  if (!r.user) return { ok: false, respuesta: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) };
  if (!r.esAdmin || !r.aal2) return { ok: false, respuesta: NextResponse.json({ error: 'No autorizado' }, { status: 403 }) };
  return { ok: true, user: r.user };
}
