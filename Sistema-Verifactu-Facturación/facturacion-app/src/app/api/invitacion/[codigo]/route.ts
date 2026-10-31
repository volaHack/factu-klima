import { NextRequest, NextResponse } from 'next/server';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { checkRateLimit, clientIpFromRequest } from '@/lib/rateLimit';
import { avisar, origenDe } from '@/lib/seguridad/eventos';
import { codigoValido, estadoInvitacion } from '@/lib/invitaciones';
import { huellaDe } from '@/lib/invitacionesServidor';

/**
 * EL ENLACE DE INVITACIÓN (sin sesión)
 *
 *  · GET  enseña a quién invita y si el enlace sigue valiendo. No lo gasta.
 *  · POST lo gasta (una sola vez, en una sola sentencia: dos pulsaciones a
 *    la vez no entran las dos) y devuelve el `token_hash` de un enlace
 *    mágico de la cuenta, que el navegador canjea con `verifyOtp`, igual
 *    que al cambiar de empresa (lib/empresas/servidor.ts).
 *
 * En la base de datos sólo está la huella del código: quien lea la tabla
 * no puede entrar con ella.
 */

type Params = { params: Promise<{ codigo: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const { codigo } = await params;
  if (!codigoValido(codigo)) return NextResponse.json({ estado: 'no_existe' }, { status: 404 });
  if (!(await checkRateLimit(`invitacion-ver:${clientIpFromRequest(request)}`, 30, 3600))) {
    return NextResponse.json({ error: 'Demasiados intentos. Prueba más tarde.' }, { status: 429 });
  }

  const db = supabaseServicio();
  const { data: fila } = await db
    .from('invitaciones_acceso')
    .select('propietario_user_id, para, caduca_en, usado_en, revocado_en')
    .eq('token_hash', huellaDe(codigo))
    .maybeSingle();
  if (!fila) {
    avisar({ tipo: 'token_invalido', gravedad: 'media', ...origenDe(request), detalle: { portal: 'invitación' } });
    return NextResponse.json({ estado: 'no_existe' }, { status: 404 });
  }

  const { data: empresa } = await db
    .from('company_settings')
    .select('trade_name, business_name, logo_url, city')
    .eq('user_id', fila.propietario_user_id)
    .maybeSingle();

  return NextResponse.json({
    estado: estadoInvitacion(fila),
    empresa: empresa?.trade_name || empresa?.business_name || 'tu empresa',
    razonSocial: empresa?.business_name ?? null,
    ciudad: empresa?.city ?? null,
    logo: empresa?.logo_url ?? null,
    para: fila.para,
    caduca: fila.caduca_en,
  });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { codigo } = await params;
  if (!codigoValido(codigo)) return NextResponse.json({ error: 'Este enlace no es válido.' }, { status: 404 });
  if (!(await checkRateLimit(`invitacion-entrar:${clientIpFromRequest(request)}`, 10, 3600))) {
    return NextResponse.json({ error: 'Demasiados intentos. Prueba más tarde.' }, { status: 429 });
  }

  const db = supabaseServicio();
  const ahora = new Date().toISOString();
  const { data: gastada } = await db
    .from('invitaciones_acceso')
    .update({ usado_en: ahora })
    .eq('token_hash', huellaDe(codigo))
    .is('usado_en', null)
    .is('revocado_en', null)
    .gt('caduca_en', ahora)
    .select('id, propietario_user_id')
    .maybeSingle();
  if (!gastada) {
    avisar({ tipo: 'token_invalido', gravedad: 'media', ...origenDe(request), detalle: { portal: 'invitación', paso: 'entrar' } });
    return NextResponse.json({ error: 'Este enlace ya se ha usado, ha caducado o se ha anulado.' }, { status: 410 });
  }

  // Si algo falla de aquí en adelante, el enlace se devuelve: que un
  // fallo nuestro no le cueste la invitación a quien la recibió.
  const devolver = () => db.from('invitaciones_acceso').update({ usado_en: null }).eq('id', gastada.id);

  const { data: u } = await db.auth.admin.getUserById(gastada.propietario_user_id);
  const correo = u?.user?.email;
  if (!correo) {
    await devolver();
    return NextResponse.json({ error: 'No se encuentra la cuenta. Avisa a quien te invitó.' }, { status: 404 });
  }
  const { data, error } = await db.auth.admin.generateLink({ type: 'magiclink', email: correo });
  const token = data?.properties?.hashed_token;
  if (error || !token) {
    await devolver();
    return NextResponse.json({ error: 'No se ha podido preparar la entrada. Prueba otra vez.' }, { status: 502 });
  }

  avisar({ tipo: 'invitacion_usada', gravedad: 'baja', userId: gastada.propietario_user_id, ...origenDe(request) });
  return NextResponse.json({ token });
}
