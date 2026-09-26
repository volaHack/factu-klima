/**
 * POST /api/cobros/conectar — activa el cobro online del negocio.
 *
 * Crea (una sola vez) su cuenta de Stripe Connect y devuelve el enlace al
 * alta de Stripe, donde el negocio pone sus datos y su cuenta bancaria. Al
 * terminar, Stripe lo devuelve a Ajustes. Mientras no termine, se puede
 * volver a pedir el enlace y sigue donde lo dejó.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { cuentaDeCobro, stripeServidor } from '@/lib/cobroOnline/servidor';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const stripe = stripeServidor();
  if (!stripe) return NextResponse.json({ error: 'El cobro online no está disponible ahora mismo.' }, { status: 503 });

  const db = supabaseServicio();
  const origen = new URL(request.url).origin;

  try {
    let cuenta = await cuentaDeCobro(db, user.id);
    if (!cuenta) {
      const { data: empresa } = await db.from('company_settings')
        .select('business_name, trade_name, email, website').eq('user_id', user.id)
        .order('updated_at', { ascending: false }).limit(1).maybeSingle();
      const a = await stripe.accounts.create({
        type: 'express',
        country: 'ES',
        email: empresa?.email || user.email || undefined,
        business_profile: {
          name: empresa?.trade_name || empresa?.business_name || undefined,
          url: empresa?.website || undefined,
          // Lo que verá el cliente en el extracto de su tarjeta.
          product_description: 'Pago de facturas',
        },
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        metadata: { user_id: user.id },
      });
      const { error } = await db.from('cobro_online_cuentas').insert({ user_id: user.id, stripe_account_id: a.id });
      if (error) throw new Error(error.message);
      cuenta = { stripeAccountId: a.id, cobrosActivos: false, datosEnviados: false };
    }

    const enlace = await stripe.accountLinks.create({
      account: cuenta.stripeAccountId,
      type: 'account_onboarding',
      refresh_url: `${origen}/ajustes?cobros=reintentar#cobro-online`,
      return_url: `${origen}/ajustes?cobros=vuelta#cobro-online`,
    });
    return NextResponse.json({ url: enlace.url });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    console.error('No se ha podido activar el cobro online:', mensaje);
    // Stripe contesta así si la plataforma no ha terminado de configurar Connect.
    if (/connect|platform|signed up/i.test(mensaje)) {
      return NextResponse.json(
        { error: 'El cobro online todavía no está disponible en la plataforma. Escribe a soporte y lo activamos.' },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: 'No se ha podido conectar con Stripe. Inténtalo en un momento.' }, { status: 502 });
  }
}
