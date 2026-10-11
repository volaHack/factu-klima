/**
 * POST /api/banco/conectar { banco, empresa } — empieza la conexión: se
 * guarda un `state` aleatorio con el usuario y se devuelve la dirección de
 * la web del banco, donde el negocio da su permiso.
 */

import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { bancoAbiertoA } from '@/lib/banco/abierto';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { bancosDe, empezarAutorizacion } from '@/lib/banco/enableBanking';
import { origenPublico } from '@/lib/banco/origen';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const sesion = await createClient();
  const { data: { user } } = await sesion.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (!(await bancoAbiertoA(sesion))) return NextResponse.json({ error: 'La conexión con bancos no está disponible todavía.' }, { status: 503 });

  const { banco, empresa } = await request.json().catch(() => ({}));
  if (typeof banco !== 'string' || !banco.trim()) return NextResponse.json({ error: 'Elige tu banco.' }, { status: 400 });

  try {
    const info = (await bancosDe('ES')).find(b => b.nombre === banco);
    if (!info) return NextResponse.json({ error: 'Ese banco no está en la lista.' }, { status: 400 });
    // PSD2 permite hasta 180 días; cada banco dice su máximo.
    const dias = Math.max(1, Math.min(180, Math.floor((info.maxConsentimiento ?? 180 * 86_400) / 86_400)));
    const state = crypto.randomBytes(24).toString('hex');
    const db = supabaseServicio();
    // Las autorizaciones que se quedaron a medias no sirven: fuera.
    await db.from('bancos_autorizaciones').delete().lt('creado_en', new Date(Date.now() - 86_400_000).toISOString());
    const { error } = await db.from('bancos_autorizaciones').insert({ state, user_id: user.id, banco, pais: 'ES' });
    if (error) throw new Error(error.message);
    const url = await empezarAutorizacion({
      // Si el banco no ofrece acceso de empresa por PSD2 (algunos sólo
      // tienen banca de particulares), se pide el de particular: si no, el
      // banco rechaza la petición con un error que el cliente no entiende.
      banco, pais: 'ES', state, empresa: empresa !== false && info.empresas, diasValidez: dias,
      vuelta: `${origenPublico(request)}/api/banco/vuelta`,
    });
    return NextResponse.json({ url });
  } catch (e) {
    console.error('No se ha podido empezar la conexión con el banco:', e);
    return NextResponse.json({ error: 'No se ha podido conectar con el banco. Inténtalo en un momento.' }, { status: 502 });
  }
}
