import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getPlan } from '@/lib/plans';
import { filaDesdeSuscripcion } from './suscripciones';
import { facturaDeSuscripcion, facturaDePropina } from '@/lib/plataforma/facturas';
import type { RegimenIgic } from '@/lib/plataforma/impuestos';
import { nuevoIngreso, type Ingreso } from '@/lib/plataforma/ingresos';

const fechaIso = (segundos: number) => new Date(segundos * 1000).toISOString().slice(0, 10);

async function configPlataforma(db: SupabaseClient) {
  const { data } = await db.from('plataforma_config').select('*').single();
  if (!data) throw new Error('REVISAR: falta la fila de plataforma_config (migración 042).');
  return data as {
    serie_suscripciones: string; serie_propinas: string; regimen_igic: RegimenIgic;
    actividad_desde: string | null;
  };
}

/**
 * Apunta un cobro en el libro de ingresos y, si toca, emite su factura.
 *
 * Idempotente: Stripe reintenta los avisos, y un mismo cobro no se apunta
 * dos veces ni se factura dos veces (si ya tiene factura, no se toca).
 */
async function apuntarIngreso(db: SupabaseClient, ingreso: Ingreso, factura?: unknown): Promise<void> {
  const { data: previo } = await db.from('ingresos_plataforma')
    .select('id, invoice_id').eq('stripe_ref', ingreso.stripe_ref).maybeSingle();
  if (previo?.invoice_id) return;

  // La factura va guardada aunque no se emita: si el cobro es de antes
  // del alta, se podrá facturar luego desde Administración → Hacienda.
  let fila: Ingreso & { factura_propuesta?: unknown } = { ...ingreso, factura_propuesta: factura ?? null };
  if (ingreso.estado === 'facturado' && factura) {
    const { data: invoiceId, error } = await db.rpc('fn_emitir_factura_plataforma', { p: factura });
    if (error) {
      fila = { ...ingreso, estado: 'revisar', nota: `No se pudo emitir la factura: ${error.message}` };
    } else {
      fila = { ...ingreso, invoice_id: typeof invoiceId === 'string' ? invoiceId : null };
    }
  }
  const { error } = await db.from('ingresos_plataforma').upsert(fila, { onConflict: 'stripe_ref' });
  if (error) throw new Error(`No se pudo apuntar el ingreso ${ingreso.stripe_ref}: ${error.message}`);
  if (fila.estado === 'revisar') throw new Error(`REVISAR: ${fila.nota}`);
}

export async function procesarEvento(event: Stripe.Event, db: SupabaseClient): Promise<void> {
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const fila = filaDesdeSuscripcion(event.data.object);
      if (!fila) throw new Error(`REVISAR: la suscripción ${event.data.object.id} no trae userId o su precio no es de ningún plan.`);

      // Un evento viejo que llega tarde no pisa a uno nuevo.
      const { data: actual } = await db.from('suscripciones')
        .select('stripe_evento_creado').eq('user_id', fila.user_id).maybeSingle();
      if (actual?.stripe_evento_creado && actual.stripe_evento_creado > event.created) return;

      const { error } = await db.from('suscripciones').upsert({
        ...fila,
        estado: event.type === 'customer.subscription.deleted' ? 'canceled' : fila.estado,
        stripe_evento_creado: event.created,
        actualizado_en: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (error) throw new Error(error.message);
      return;
    }

    case 'invoice.paid': {
      const inv = event.data.object as Stripe.Invoice;
      const ref = (inv as any).parent?.subscription_details?.subscription ?? (inv as any).subscription;
      if (!ref || inv.amount_paid === 0) return; // sin suscripción, o cupón del 100 %
      const subId = typeof ref === 'string' ? ref : ref.id;

      const { data: sus } = await db.from('suscripciones')
        .select('user_id, plan_id, intervalo').eq('stripe_subscription_id', subId).maybeSingle();
      // customer.subscription.created puede llegar después: error normal,
      // Stripe reintenta y a la siguiente ya está.
      if (!sus) throw new Error(`La suscripción ${subId} todavía no tiene fila.`);

      const [{ data: aj }, cfg] = await Promise.all([
        db.from('company_settings').select('business_name, nif, address, postal_code, city, province')
          .eq('user_id', sus.user_id).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
        configPlataforma(db),
      ]);
      const linea = inv.lines.data[0];
      const r = facturaDeSuscripcion({
        stripeInvoiceId: inv.id!, fecha: fechaIso(inv.status_transitions.paid_at ?? event.created),
        plan: getPlan(sus.plan_id)?.name ?? sus.plan_id, intervalo: (sus.intervalo as 'month' | 'year') ?? 'month',
        periodo: {
          inicio: linea?.period?.start ? fechaIso(linea.period.start) : fechaIso(event.created),
          fin: linea?.period?.end ? fechaIso(linea.period.end) : fechaIso(event.created),
        },
        cobrado: inv.amount_paid / 100,
        cliente: {
          nombre: aj?.business_name ?? '', nif: aj?.nif ?? '', cp: aj?.postal_code ?? '',
          direccion: [aj?.address, aj?.postal_code, aj?.city, aj?.province].filter(Boolean).join(', '),
        },
        serie: cfg.serie_suscripciones, regimen: cfg.regimen_igic,
      });
      const cobrado = inv.amount_paid / 100;
      const ingreso = nuevoIngreso({
        stripeRef: `stripe:${inv.id}`,
        tipo: 'suscripcion',
        fecha: fechaIso(inv.status_transitions.paid_at ?? event.created),
        importe: cobrado,
        tipoImpositivo: 'revisar' in r ? 0 : r.lineas[0].tipo,
        concepto: 'revisar' in r ? `Suscripción ${getPlan(sus.plan_id)?.name ?? sus.plan_id}` : r.lineas[0].concepto,
        cliente: { nombre: aj?.business_name, nif: aj?.nif, userId: sus.user_id },
        actividadDesde: cfg.actividad_desde,
      });
      if ('revisar' in r && ingreso.estado === 'facturado') {
        await apuntarIngreso(db, { ...ingreso, estado: 'revisar', nota: r.revisar });
        return;
      }
      await apuntarIngreso(db, ingreso, 'revisar' in r ? undefined : r);
      return;
    }

    case 'checkout.session.completed': {
      const session = event.data.object;
      // Cobro de una factura de un inquilino (flujo /aprobar): lo de siempre.
      const invoiceId = session.client_reference_id && session.mode === 'payment' && session.metadata?.tipo !== 'tip_apoyo'
        ? session.client_reference_id
        : session.metadata?.invoiceId;
      if (session.mode === 'payment' && invoiceId && session.payment_status === 'paid') {
        const { error } = await db.from('invoices')
          .update({ status: 'pagada', paid_date: new Date().toISOString().split('T')[0] })
          .eq('id', invoiceId)
          .in('status', ['emitida', 'pendiente', 'vencida']);
        if (error) throw new Error(error.message);
      }
      
      // Propinas
      if (session.mode === 'payment' && session.metadata?.tipo === 'tip_apoyo' && session.payment_status === 'paid') {
        const cfg = await configPlataforma(db);
        const fecha = fechaIso(event.created);
        const cobrado = (session.amount_total ?? 0) / 100;
        const factura = facturaDePropina({
          sessionId: session.id, fecha, cobrado, serie: cfg.serie_propinas, regimen: cfg.regimen_igic,
        });
        await apuntarIngreso(db, nuevoIngreso({
          stripeRef: `stripe:${session.id}`,
          tipo: 'propina',
          fecha,
          importe: cobrado,
          tipoImpositivo: factura.lineas[0].tipo,
          concepto: factura.lineas[0].concepto,
          cliente: { nombre: session.customer_details?.name ?? null },
          actividadDesde: cfg.actividad_desde,
        }), factura);
      }
      return;
    }

    case 'credit_note.created': {
      const cn = event.data.object as Stripe.CreditNote;
      const cfg = await configPlataforma(db);
      const ingreso = nuevoIngreso({
        stripeRef: `stripe:${cn.id}`,
        tipo: 'devolucion',
        fecha: fechaIso(cn.created),
        importe: -(cn.total / 100),
        tipoImpositivo: 0,
        concepto: `Devolución de ${typeof cn.invoice === 'string' ? cn.invoice : cn.invoice?.id ?? 'un cobro'}`,
        actividadDesde: cfg.actividad_desde,
      });
      // Con actividad, la devolución pide una factura rectificativa, que
      // se emite a mano desde la factura original: se deja «revisar».
      await apuntarIngreso(db, ingreso.estado === 'facturado'
        ? { ...ingreso, estado: 'revisar', nota: 'Emitir la factura rectificativa a mano desde la factura original.' }
        : ingreso);
      return;
    }

    default:
      return;
  }
}
