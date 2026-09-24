import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { checkRateLimit, clientIpFromRequest } from '@/lib/rateLimit';

/**
 * Crea una sesión de Stripe Checkout para dejar una propina / donación puntual de apoyo.
 *
 * Utiliza price_data dinámico para no depender de Price IDs predefinidos en el Dashboard
 * de Stripe, permitiendo cualquier importe (ej: 3€, 5€, 15€, 30€ o personalizado).
 */
export async function POST(request: Request) {
  try {
    const allowed = await checkRateLimit(`tip:${clientIpFromRequest(request)}`, 15, 3600);
    if (!allowed) {
      return NextResponse.json({ error: 'Demasiadas solicitudes. Inténtalo más tarde.' }, { status: 429 });
    }

    const { amount, note } = await request.json();
    const numAmount = typeof amount === 'number' ? amount : parseFloat(amount);

    if (isNaN(numAmount) || numAmount < 1 || numAmount > 1000) {
      return NextResponse.json(
        { error: 'El importe de la propina debe estar entre 1 € y 1.000 €.' },
        { status: 400 }
      );
    }

    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      return NextResponse.json(
        { error: 'Stripe no está configurado en el servidor (falta STRIPE_SECRET_KEY).' },
        { status: 500 }
      );
    }

    const stripe = new Stripe(secretKey);
    const baseUrl = new URL(request.url).origin;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            unit_amount: Math.round(numAmount * 100),
            product_data: {
              name: '☕ Propina / Apoyo al desarrollo de FactuKlima',
              description: note ? `Mensaje: ${note.substring(0, 200)}` : 'Aportación voluntaria para el soporte y mejoras del software.',
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        tipo: 'tip_apoyo',
        note: note ? note.substring(0, 500) : '',
      },
      success_url: `${baseUrl}/dashboard?tip_success=true&amount=${numAmount}`,
      cancel_url: `${baseUrl}/precios?tip_cancelled=true`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Error al generar sesión de propina Stripe:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno al procesar el pago' },
      { status: 500 }
    );
  }
}
