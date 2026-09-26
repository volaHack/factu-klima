/**
 * GET /api/buzon/direccion — la dirección de correo del buzón de la cuenta
 * (se crea la primera vez). Sin el servicio de correo entrante configurado
 * (BUZON_DIRECCION_BASE), no hay dirección: la bandeja funciona igual
 * arrastrando los ficheros.
 */

import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { direccionDeCuenta } from '@/lib/buzon/correo';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const base = process.env.BUZON_DIRECCION_BASE;
  if (!base || !process.env.BUZON_WEBHOOK_SECRETO) return NextResponse.json({ disponible: false });

  let { data } = await supabase.from('buzon_direcciones').select('clave').eq('user_id', user.id).maybeSingle();
  if (!data) {
    const clave = crypto.randomBytes(15).toString('base64url');
    const { error } = await supabase.from('buzon_direcciones').insert({ user_id: user.id, clave });
    if (error) return NextResponse.json({ error: 'No se ha podido crear la dirección.' }, { status: 500 });
    data = { clave };
  }
  const direccion = direccionDeCuenta(base, data.clave);
  return direccion ? NextResponse.json({ disponible: true, direccion }) : NextResponse.json({ disponible: false });
}
