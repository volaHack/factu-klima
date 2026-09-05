/**
 * AYUDA IA DEL MOSTRADOR
 *
 * Dos cosas, y sólo dos, porque son las que un cajero necesita de verdad:
 *
 * 1. `duda` — responder a lo que se pregunta en voz alta detrás del
 *    mostrador: «el cliente quiere pagar mitad en efectivo y mitad con
 *    tarjeta», «me he equivocado de precio y ya he cobrado», «cómo aparco
 *    esta venta». Con los pasos DE ESTE programa, no consejos genéricos.
 *
 * 2. `turno` — al cerrar la caja, contar en dos frases cómo ha ido, si el
 *    descuadre tiene pinta de error de cambio y qué conviene reponer.
 *
 * POR QUÉ VIVE EN EL SERVIDOR
 * ---------------------------
 * Por lo mismo que `plantillas/reconocer`: la clave de Gemini no puede
 * llegar al navegador, porque una clave en el paquete del cliente es una
 * clave pública y la factura la pagamos nosotros.
 *
 * LO QUE NO HACE
 * --------------
 * No toca nada. No cobra, no anula, no modifica el carrito. Devuelve texto
 * y ya está. Un asistente que ejecuta acciones en una caja registradora es
 * exactamente lo que no se le puede dar a un cajero con prisa: si se
 * equivoca, se equivoca en una operación fiscal. Aquí la última palabra —y
 * el dedo— la tiene siempre la persona.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, clientIpFromRequest } from '@/lib/rateLimit';

/** Rápido y barato: esto es responder dos frases, no redactar un informe. */
const MODELO = 'gemini-3.6-flash';
const URL_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Tope de la pregunta. Nadie escribe una novela detrás del mostrador. */
const MAXIMO_PREGUNTA = 400;

export interface ContextoTpv {
  /** Cuántas líneas hay ahora mismo en el carrito. */
  lineas: number;
  /** Total del carrito, en euros. */
  total: number;
  /** Si hay caja abierta (sesión de TPV). */
  cajaAbierta: boolean;
  /** Ventas aparcadas pendientes de recuperar. */
  aparcadas: number;
  /** tienda | supermercado | restaurante. */
  modo: string;
  /** Si el navegador está sin conexión. */
  sinConexion: boolean;
}

export interface ResumenTurno {
  efectivoInicial: number;
  ventasEfectivo: number;
  ventasTarjeta: number;
  ventasBizum: number;
  numeroVentas: number;
  efectivoContado: number;
  /** Contado menos esperado: negativo falta, positivo sobra. */
  descuadre: number;
  /** Los más vendidos del turno, para poder decir qué reponer. */
  masVendidos: { nombre: string; unidades: number }[];
}

/**
 * LO QUE EL PROGRAMA SABE HACER DE VERDAD
 *
 * Va escrito aquí, literal, y no se deja que el modelo lo deduzca. Un
 * asistente que se inventa un botón que no existe es peor que no tener
 * asistente: el cajero lo busca, no lo encuentra, y deja de fiarse de todo
 * lo demás que le diga. Si mañana el TPV gana una función, se añade a esta
 * lista y no en otro sitio.
 */
const LO_QUE_HACE_EL_TPV = [
  '- Buscar y añadir productos del catálogo, o escanear su código de barras.',
  '- Escanear un código que no está dado de alta: se abre sola la ventana para crearlo.',
  '- «Venta libre» (F4): cobrar algo que no está en el catálogo poniendo concepto e importe.',
  '- «Nuevo producto» (F5): dar de alta un artículo sin salir del TPV.',
  '- Aparcar la venta en curso (F3) y recuperarla después desde «Aparcadas».',
  '- Cobrar en efectivo, tarjeta o Bizum (F2 o Espacio abre el cobro; 1, 2 y 3 eligen forma de pago).',
  '- En efectivo: teclado numérico, botón «Exacto», sumas rápidas de 5/10/20/50 € y cálculo del cambio.',
  '- Imprimir o compartir el ticket por WhatsApp o email al terminar la venta.',
  '- Abrir y cerrar caja, contando el efectivo y viendo el descuadre.',
  '- «Ventas de hoy»: lista de los tickets del día, con opción de verlos.',
  '- «Resumen»: lo más vendido, las horas punta y qué conviene reponer.',
  '- En modo restaurante, mesas con cuentas abiertas que se cobran al final.',
  '- Funciona sin conexión: la venta se guarda y se sella al recuperar la línea.',
];

/** Lo que el TPV NO puede hacer, para que no lo prometa. */
const LO_QUE_NO_HACE = [
  '- No admite pago partido entre dos formas de pago en el mismo ticket.',
  '- No se puede modificar ni borrar un ticket ya cobrado: se corrige con una devolución o un abono desde Facturas.',
  '- No se puede cambiar el NIF de la empresa si ya hay facturas emitidas.',
  '- No hay cajón portamonedas ni báscula conectados.',
];

function instruccionesDuda(pregunta: string, ctx: ContextoTpv): string {
  return [
    'Eres el ayudante del cajero de un TPV español. Respondes a alguien que',
    'está de pie detrás del mostrador, con un cliente delante esperando.',
    '',
    'REGLAS:',
    '- Responde en castellano, de tú, en 3 frases como mucho.',
    '- Si hay que hacer algo, dilo en pasos numerados, cortos, con el nombre',
    '  EXACTO del botón o la tecla.',
    '- Usa SOLO lo que aparece en la lista de abajo. Si lo que pide no se',
    '  puede hacer, dilo claramente y ofrece la alternativa más cercana.',
    '- No inventes botones, pantallas ni funciones. No des consejos genéricos',
    '  de «consulta con tu gestor» si la respuesta está en la lista.',
    '- Nada de saludos ni de despedidas: la respuesta y ya.',
    '',
    'LO QUE ESTE TPV SABE HACER:',
    ...LO_QUE_HACE_EL_TPV,
    '',
    'LO QUE NO PUEDE HACER:',
    ...LO_QUE_NO_HACE,
    '',
    'SITUACIÓN AHORA MISMO:',
    `- Carrito: ${ctx.lineas} línea(s), total ${ctx.total.toFixed(2)} €.`,
    `- Caja: ${ctx.cajaAbierta ? 'abierta' : 'CERRADA (hay que abrirla antes de cobrar)'}.`,
    `- Ventas aparcadas: ${ctx.aparcadas}.`,
    `- Modo: ${ctx.modo}.`,
    ctx.sinConexion ? '- SIN CONEXIÓN: las ventas se guardan y se sellan al volver la línea.' : '',
    '',
    'PREGUNTA DEL CAJERO:',
    pregunta,
  ].filter(Boolean).join('\n');
}

function instruccionesTurno(r: ResumenTurno): string {
  const esperado = r.efectivoInicial + r.ventasEfectivo;
  return [
    'Eres el ayudante del encargado de una tienda. Te paso los números del',
    'turno que se acaba de cerrar. Escribe un resumen en castellano, de tú,',
    'en 3 o 4 frases, sin listas y sin saludos.',
    '',
    'QUÉ DECIR, EN ESTE ORDEN:',
    '1. Cómo ha ido el turno en una frase (ventas y reparto entre formas de pago).',
    '2. El descuadre: si es 0, dilo y ya. Si es pequeño (menos de 2 €), di que',
    '   es lo normal de dar cambio. Si es grande, di que conviene repasar los',
    '   cobros en efectivo del turno.',
    '3. Qué conviene reponer, si hay algo destacado.',
    '',
    'No inventes cifras: usa sólo las que te doy. No hagas juicios sobre el',
    'trabajo de nadie; los descuadres pequeños son normales.',
    '',
    'NÚMEROS DEL TURNO:',
    `- Fondo inicial: ${r.efectivoInicial.toFixed(2)} €`,
    `- Ventas: ${r.numeroVentas}`,
    `- En efectivo: ${r.ventasEfectivo.toFixed(2)} €`,
    `- Con tarjeta: ${r.ventasTarjeta.toFixed(2)} €`,
    `- Por Bizum: ${r.ventasBizum.toFixed(2)} €`,
    `- Efectivo esperado en el cajón: ${esperado.toFixed(2)} €`,
    `- Efectivo contado: ${r.efectivoContado.toFixed(2)} €`,
    `- Descuadre: ${r.descuadre.toFixed(2)} € (negativo = falta dinero)`,
    r.masVendidos.length
      ? `- Más vendido: ${r.masVendidos.map(p => `${p.nombre} (${p.unidades})`).join(', ')}`
      : '- No hay datos de productos más vendidos.',
  ].join('\n');
}

function numero(valor: unknown): number {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : 0;
}

export async function POST(request: NextRequest) {
  const clave = process.env.GEMINI_API_KEY;
  if (!clave) {
    return NextResponse.json(
      { error: 'La ayuda con IA no está configurada en este servidor.' },
      { status: 501 },
    );
  }

  // Cada respuesta cuesta dinero. Un cajero pregunta unas cuantas veces por
  // turno; sesenta por hora es de sobra y corta cualquier bucle.
  const permitido = await checkRateLimit(`tpv-ayuda:${clientIpFromRequest(request)}`, 60, 3600);
  if (!permitido) {
    return NextResponse.json(
      { error: 'Has preguntado muchas veces seguidas. Espera un minuto.' },
      { status: 429 },
    );
  }

  let cuerpo: { modo?: string; pregunta?: string; contexto?: Partial<ContextoTpv>; turno?: Partial<ResumenTurno> };
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  let instrucciones: string;

  if (cuerpo.modo === 'turno') {
    const t = cuerpo.turno ?? {};
    instrucciones = instruccionesTurno({
      efectivoInicial: numero(t.efectivoInicial),
      ventasEfectivo: numero(t.ventasEfectivo),
      ventasTarjeta: numero(t.ventasTarjeta),
      ventasBizum: numero(t.ventasBizum),
      numeroVentas: numero(t.numeroVentas),
      efectivoContado: numero(t.efectivoContado),
      descuadre: numero(t.descuadre),
      masVendidos: Array.isArray(t.masVendidos)
        ? t.masVendidos
            .slice(0, 5)
            .map(p => ({ nombre: String(p?.nombre ?? '').slice(0, 60), unidades: numero(p?.unidades) }))
        : [],
    });
  } else {
    const pregunta = String(cuerpo.pregunta ?? '').trim().slice(0, MAXIMO_PREGUNTA);
    if (!pregunta) {
      return NextResponse.json({ error: 'Escribe tu pregunta.' }, { status: 400 });
    }
    const c = cuerpo.contexto ?? {};
    instrucciones = instruccionesDuda(pregunta, {
      lineas: numero(c.lineas),
      total: numero(c.total),
      cajaAbierta: Boolean(c.cajaAbierta),
      aparcadas: numero(c.aparcadas),
      modo: String(c.modo ?? 'tienda').slice(0, 20),
      sinConexion: Boolean(c.sinConexion),
    });
  }

  let respuesta: Response;
  try {
    respuesta = await fetch(`${URL_BASE}/${MODELO}:generateContent?key=${clave}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: instrucciones }] }],
        generationConfig: {
          // Poca creatividad: la misma duda dos veces tiene que dar la misma
          // respuesta, que es lo que permite fiarse de ella.
          temperature: 0.2,
          // EL PRESUPUESTO INCLUYE LO QUE EL MODELO PIENSA, NO SÓLO LO QUE
          // ESCRIBE. Con 400 la respuesta salía cortada a media frase —«El
          // cliente debe pagar»— porque el razonamiento se comía el cupo
          // antes de llegar al texto.
          //
          // Se probó a apagar el razonamiento con `thinkingConfig` y este
          // modelo lo rechaza con un 400, así que la salida es dar holgura:
          // se paga por lo que se gasta, y una respuesta de tres frases
          // gasta poco aunque el tope esté alto.
          maxOutputTokens: 2048,
        },
      }),
      // Corto a propósito: hay un cliente esperando. Si tarda más, no sirve.
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return NextResponse.json(
      { error: 'No se ha podido contactar con la ayuda. El TPV sigue funcionando igual.' },
      { status: 502 },
    );
  }

  if (!respuesta.ok) {
    // El detalle del proveedor no se le enseña al usuario; al registro sí.
    console.error('[tpv/ayuda] Gemini respondió', respuesta.status, await respuesta.text().catch(() => ''));
    return NextResponse.json(
      { error: 'La ayuda no está disponible ahora mismo. Inténtalo en un momento.' },
      { status: 502 },
    );
  }

  try {
    const datos = await respuesta.json();
    const texto = (datos?.candidates?.[0]?.content?.parts ?? [])
      .map((p: { text?: string }) => p?.text ?? '')
      .join('')
      .trim();

    if (!texto) {
      return NextResponse.json({ error: 'La ayuda ha respondido en blanco.' }, { status: 502 });
    }
    return NextResponse.json({ texto });
  } catch {
    return NextResponse.json(
      { error: 'La respuesta de la ayuda no se ha podido interpretar.' },
      { status: 502 },
    );
  }
}
