import 'server-only';

/**
 * COBRO ONLINE — LO QUE PASA EN EL SERVIDOR
 *
 * DE QUIÉN ES EL DINERO
 *
 * El cobro de la factura de un negocio va a la cuenta de ESE negocio, no a
 * la de la plataforma. Cada negocio tiene su cuenta de Stripe Connect
 * (Express): Stripe verifica su identidad y le paga a su banco. El pago se
 * crea en la plataforma como «destination charge» con `on_behalf_of`: el
 * negocio es quien cobra ante su cliente y el importe entero se transfiere
 * a su cuenta. Así el aviso de pago llega al webhook que ya existe, sin
 * tener que dar de alta otro para las cuentas conectadas.
 *
 * Antes el botón de pagar creaba el cobro en la cuenta de la plataforma:
 * el dinero de las facturas de los clientes habría acabado en la cuenta de
 * Klima.
 */

import Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { pendienteDeCobro, trasCobrar, type FacturaCobrable } from './calculo';

const STRIPE_API_VERSION = '2026-01-28';

export function stripeServidor(): Stripe | null {
  const clave = process.env.STRIPE_SECRET_KEY;
  return clave ? new Stripe(clave, { apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion }) : null;
}

export interface CuentaCobro {
  stripeAccountId: string;
  cobrosActivos: boolean;
  datosEnviados: boolean;
}

export async function cuentaDeCobro(db: SupabaseClient, userId: string): Promise<CuentaCobro | null> {
  const { data } = await db.from('cobro_online_cuentas')
    .select('stripe_account_id, cobros_activos, datos_enviados').eq('user_id', userId).maybeSingle();
  return data ? { stripeAccountId: data.stripe_account_id, cobrosActivos: data.cobros_activos, datosEnviados: data.datos_enviados } : null;
}

/** Pregunta a Stripe en qué punto está la cuenta y lo guarda. */
export async function refrescarCuenta(db: SupabaseClient, stripe: Stripe, userId: string): Promise<CuentaCobro | null> {
  const cuenta = await cuentaDeCobro(db, userId);
  if (!cuenta) return null;
  const a = await stripe.accounts.retrieve(cuenta.stripeAccountId);
  const nueva = { stripeAccountId: a.id, cobrosActivos: !!a.charges_enabled, datosEnviados: !!a.details_submitted };
  if (nueva.cobrosActivos !== cuenta.cobrosActivos || nueva.datosEnviados !== cuenta.datosEnviados) {
    await db.from('cobro_online_cuentas')
      .update({ cobros_activos: nueva.cobrosActivos, datos_enviados: nueva.datosEnviados, actualizado_en: new Date().toISOString() })
      .eq('user_id', userId);
  }
  return nueva;
}

interface FilaFactura extends FacturaCobrable {
  id: string;
  user_id: string;
  number: string;
  client_id: string | null;
  client_name: string;
  client_nif: string | null;
  payment_record_ids: string[] | null;
  paid_date: string | null;
}

/**
 * Apunta un pago online confirmado por Stripe: un cobro en Tesorería (como
 * si se hubiera apuntado a mano, con tarjeta) y la factura cobrada. Una
 * sola vez por sesión de pago, aunque Stripe mande el aviso dos veces.
 */
export async function apuntarCobroOnline(db: SupabaseClient, session: Stripe.Checkout.Session): Promise<void> {
  const invoiceId = session.metadata?.invoiceId;
  const userId = session.metadata?.userId;
  if (!invoiceId || !userId || session.payment_status !== 'paid') return;

  const { data: intento } = await db.from('cobros_online')
    .select('id, estado').eq('stripe_session_id', session.id).maybeSingle();
  if (intento?.estado === 'pagado') return;

  const { data: factura } = await db.from('invoices')
    .select('id, user_id, number, client_id, client_name, client_nif, total, subtotal, retencion_pct, paid_amount, paid_date, status, payment_record_ids')
    .eq('id', invoiceId).eq('user_id', userId).maybeSingle<FilaFactura>();
  if (!factura) throw new Error(`REVISAR: pago online ${session.id} de una factura que no existe (${invoiceId}).`);

  const importe = Math.round(session.amount_total ?? 0) / 100;
  const hoy = new Date().toISOString().slice(0, 10);
  const cobroId = crypto.randomUUID();
  const ahora = new Date().toISOString();

  const { error: errorCobro } = await db.from('cobros_pagos').insert({
    id: cobroId,
    user_id: userId,
    tipo: 'cobro',
    series: 'WEB',
    number: `WEB-${session.id.slice(-10).toUpperCase()}`,
    fecha: hoy,
    contraparte_id: factura.client_id ?? '',
    contraparte_nombre: factura.client_name,
    contraparte_nif: factura.client_nif,
    payment_method: 'tarjeta',
    importe_total: importe,
    desglose: [{ invoiceId: factura.id, invoiceNumber: factura.number, importeAplicado: importe }],
    notas: `Pago online con Stripe (${session.id}).`,
    created_at: ahora,
    updated_at: ahora,
  });
  if (errorCobro) throw new Error(errorCobro.message);

  const tras = trasCobrar(factura, importe);
  const { error: errorFactura } = await db.from('invoices').update({
    paid_amount: tras.paidAmount,
    status: tras.status,
    paid_date: tras.pagadaEntera ? hoy : factura.paid_date,
    payment_record_ids: [...(factura.payment_record_ids ?? []), cobroId],
  }).eq('id', factura.id);
  if (errorFactura) throw new Error(errorFactura.message);

  await db.from('cobros_online').upsert({
    ...(intento ? { id: intento.id } : {}),
    user_id: userId, invoice_id: factura.id, stripe_session_id: session.id, importe,
    estado: 'pagado', cobro_pago_id: cobroId, pagado_en: ahora,
  }, { onConflict: 'stripe_session_id' });
}

/** Lo que falta por cobrar, en la fila tal cual viene de la base de datos. */
export { pendienteDeCobro };
