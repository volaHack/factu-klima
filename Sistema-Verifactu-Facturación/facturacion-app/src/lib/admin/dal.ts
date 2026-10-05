import 'server-only';
import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { avisar, ipDe } from '@/lib/seguridad/eventos';

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

/**
 * Una cuenta que no es de administración intentando entrar en el panel:
 * no debería pasar nunca usando el programa, así que se apunta como ataque.
 */
const avisarUnaVez = cache(async (userId: string, email: string | null, tipo: 'admin_acceso_denegado' | 'admin_sin_2fa', via: 'pagina' | 'api') => {
  const h = await headers();
  avisar({
    tipo, gravedad: tipo === 'admin_acceso_denegado' ? 'alta' : 'media', ip: ipDe(h), userId,
    ruta: h.get('x-invoke-path') || h.get('referer') || null, navegador: h.get('user-agent'),
    detalle: { email, via },
  });
});
// El diseño y la página del panel comprueban los dos: un solo aviso por petición.
const avisarIntento = (user: User, tipo: 'admin_acceso_denegado' | 'admin_sin_2fa', via: 'pagina' | 'api') =>
  avisarUnaVez(user.id, user.email ?? null, tipo, via);

/** Páginas: sin sesión a /login; si no es admin, 404 (no se confirma que exista). */
export async function verificarAdmin() {
  const r = await comprobar();
  if (!r.user) redirect('/login');
  if (!r.esAdmin) {
    await avisarIntento(r.user, 'admin_acceso_denegado', 'pagina');
    notFound();
  }
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
  if (!r.esAdmin || !r.aal2) {
    await avisarIntento(r.user, r.esAdmin ? 'admin_sin_2fa' : 'admin_acceso_denegado', 'api');
    return { ok: false, respuesta: NextResponse.json({ error: 'No autorizado' }, { status: 403 }) };
  }
  return { ok: true, user: r.user };
}
