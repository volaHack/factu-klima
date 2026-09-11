import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { adminParaApi } from '@/lib/admin/dal';
import { validarAccion } from '@/lib/admin/acciones';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { getPlan } from '@/lib/plans';

/**
 * Lo que va por Stripe no toca `suscripciones`: Stripe avisa por webhook y
 * es el webhook quien escribe, así hay una sola fuente de verdad. Las
 * cortesías sí se escriben aquí, porque no hay Stripe detrás.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await adminParaApi();
  if (!auth.ok) return auth.respuesta;
  const { id } = await params;

  const v = validarAccion(await request.json().catch(() => null), new Date());
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const accion = v.accion;

  const db = supabaseServicio();
  const { data: sus } = await db.from('suscripciones').select('*').eq('user_id', id).maybeSingle();
  const pagaPorStripe = sus?.origen === 'stripe' && sus.estado !== 'canceled' && sus.stripe_subscription_id;

  try {
    if (accion.tipo === 'cortesia') {
      if (pagaPorStripe) return NextResponse.json({ error: 'Esta cuenta paga por Stripe: cambia el plan, no le des cortesía.' }, { status: 409 });
      const { error } = await db.from('suscripciones').upsert({
        user_id: id, origen: 'cortesia', plan_id: accion.planId, estado: 'active',
        cortesia_hasta: accion.hasta, motivo: accion.motivo, stripe_subscription_id: null,
        actualizado_en: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (error) throw new Error(error.message);
    } else if (accion.tipo === 'quitar_cortesia') {
      if (sus?.origen !== 'cortesia') return NextResponse.json({ error: 'Esta cuenta no tiene cortesía.' }, { status: 409 });
      const { error } = await db.from('suscripciones').update({ estado: 'inactive', actualizado_en: new Date().toISOString() }).eq('user_id', id);
      if (error) throw new Error(error.message);
    } else {
      if (!pagaPorStripe) return NextResponse.json({ error: 'Esta cuenta no tiene una suscripción de Stripe en curso.' }, { status: 409 });
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
      const subId = sus.stripe_subscription_id as string;

      if (accion.tipo === 'cambiar_plan') {
        const plan = getPlan(accion.planId)!;
        const precio = process.env[accion.intervalo === 'month' ? plan.stripePriceEnvMonthly : plan.stripePriceEnvAnnual];
        if (!precio) throw new Error(`Falta el precio de Stripe de ${plan.name}.`);
        const actual = await stripe.subscriptions.retrieve(subId);
        await stripe.subscriptions.update(subId, {
          items: [{ id: actual.items.data[0].id, price: precio }],
          proration_behavior: 'create_prorations',
          metadata: { ...actual.metadata, planId: accion.planId },
        });
      } else if (accion.tipo === 'cancelar') {
        if (accion.inmediato) await stripe.subscriptions.cancel(subId);
        else await stripe.subscriptions.update(subId, { cancel_at_period_end: true });
      } else {
        const { data: [ultima] } = await stripe.invoices.list({ subscription: subId, status: 'paid', limit: 1 });
        if (!ultima) return NextResponse.json({ error: 'No hay ningún cobro que devolver.' }, { status: 409 });
        await stripe.creditNotes.create({ invoice: ultima.id!, refund_amount: ultima.amount_paid, memo: accion.motivo });
      }
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'No se ha podido completar.' }, { status: 502 });
  }

  await db.from('admin_registro').insert({
    admin_id: auth.user.id, accion: accion.tipo, cuenta_id: id, detalle: accion, motivo: accion.motivo,
  });
  return NextResponse.json({ ok: true });
}
