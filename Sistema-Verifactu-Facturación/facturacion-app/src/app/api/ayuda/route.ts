/**
 * LA AYUDA CON IA DEL PROGRAMA
 *
 * Tres cosas, y sólo tres, porque son las que se preguntan de verdad:
 *
 * 1. `duda` — lo que se pregunta en voz alta detrás del mostrador: «el
 *    cliente quiere pagar mitad en efectivo y mitad con tarjeta», «me he
 *    equivocado de precio y ya he cobrado», «cómo aparco esta venta». Con
 *    los pasos DE ESTE programa, no consejos genéricos.
 *
 * 2. `turno` — al cerrar la caja, contar en dos frases cómo ha ido, si el
 *    descuadre tiene pinta de error de cambio y qué conviene reponer.
 *
 * 3. `pagina` — la duda sobre CUALQUIER pantalla del programa. Se le manda
 *    la ayuda escrita de esa pantalla (`src/lib/ayuda/paginas.ts`) como
 *    base, así que contesta con lo que la pantalla hace de verdad y no con
 *    lo que un modelo se imagine que hace un programa de facturación. Es la
 *    misma regla que en el mostrador: primero lo que hay escrito, y el
 *    modelo sólo pone las palabras.
 *
 * POR QUÉ VIVE EN EL SERVIDOR
 * ---------------------------
 * Por lo mismo que `plantillas/reconocer`: la clave del modelo no puede
 * llegar al navegador, porque una clave en el paquete del cliente es una
 * clave pública y la factura la pagamos nosotros. Con un modelo local no
 * hay clave que proteger, pero sí una dirección de red que el navegador
 * de un cliente no tiene por qué poder alcanzar.
 *
 * QUÉ MODELO CONTESTA
 * -------------------
 * El que diga `lib/ia/cliente.ts`. Aquí no se elige ni se sabe: puede ser
 * uno local en la misma máquina o uno de pago, y esta ruta no cambia.
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
import { configuracionIA, FalloIA, generarTexto, respuestaDeFallo } from '@/lib/ia/cliente';
import { AYUDA_PAGINAS } from '@/lib/ayuda/paginas';

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
    'Eres el compañero del cajero en un TPV español. Imagina que estáis los',
    'dos detrás del mostrador y te pregunta algo rápido porque tiene a un',
    'cliente esperando. Contesta como le contestarías a un compañero de',
    'trabajo: directo, con confianza, sin rodeos pero sin sonar a robot.',
    '',
    'TU FORMA DE HABLAR:',
    '- En castellano, de tú. Máximo 3 frases, pero que suenen naturales,',
    '  como si las dijeras en voz alta. Nada de listas de viñetas frías.',
    '- Puedes usar expresiones coloquiales tipo «mira», «lo que tienes que',
    '  hacer es…», «ojo que…», «tranqui, es fácil».',
    '- Si hay pasos, numéralos, pero con el nombre EXACTO del botón o tecla.',
    '- Usa SOLO lo que aparece en la lista de abajo. Si algo no se puede',
    '  hacer, dilo con naturalidad («eso de momento no se puede, pero lo que',
    '  sí puedes hacer es…»). Nunca inventes botones ni funciones.',
    '- No empieces con «Hola» ni «Claro» ni «Por supuesto». Ve al grano',
    '  pero con tono humano.',
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
    '',
    // ESTE RECORDATORIO VA AL FINAL A PROPÓSITO
    //
    // La lista de lo que el TPV no puede hacer queda a media página de
    // distancia de la pregunta, y un modelo pequeño pesa mucho más lo
    // último que ha leído. Sin esto, a «el cliente quiere pagar mitad en
    // efectivo y mitad con tarjeta» —que el TPV NO admite— contestaba con
    // tres pasos inventados y muy convincentes: «pulsa F2, mete 12,25 €,
    // vuelve a pulsar F2». Un cajero con un cliente delante se lo cree, lo
    // intenta y se queda tirado en mitad de un cobro.
    //
    // Repetir la prohibición pegada a la pregunta lo arregla, y no le hace
    // ningún daño a un modelo grande.
    'ANTES DE RESPONDER: mira otra vez la lista «LO QUE NO PUEDE HACER».',
    'Si lo que pide está ahí, díselo con naturalidad y ofrécele la',
    'alternativa más cercana. No describas pasos para algo que no se puede.',
  ].filter(Boolean).join('\n');
}

function instruccionesTurno(r: ResumenTurno): string {
  const esperado = r.efectivoInicial + r.ventasEfectivo;
  return [
    'Eres el compañero del encargado que acaba de cerrar su turno. Te pasa',
    'los números y quiere que le cuentes cómo ha ido, como se lo contarías',
    'tomando un café juntos al salir.',
    '',
    'TU FORMA DE HABLAR:',
    '- En castellano, de tú. 3 o 4 frases que suenen a conversación, no a',
    '  informe. Nada de listas ni saludos.',
    '- Puedes decir cosas como «pues ha ido bien», «oye, el descuadre es',
    '  mínimo», «yo echaría un ojo a…». Que suene a persona.',
    '',
    'QUÉ DECIR, EN ESTE ORDEN:',
    '1. Cómo ha ido el turno en una frase (ventas y reparto entre formas de pago).',
    '2. El descuadre: si es 0, dilo contento. Si es pequeño (menos de 2 €),',
    '   quítale hierro, es lo normal de dar cambio. Si es grande, sugiere con',
    '   tacto repasar los cobros en efectivo.',
    '3. Qué conviene reponer, si hay algo destacado.',
    '',
    'No inventes cifras: usa sólo las que te doy. No juzgues el trabajo de',
    'nadie; los descuadres pequeños pasan siempre.',
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

export interface ContextoPagina {
  titulo: string;
  paraQue: string;
  pasos: string[];
  saber: string[];
}

function instruccionesPagina(pregunta: string, p: ContextoPagina): string {
  return [
    'Eres un compañero que conoce bien este programa de facturación. Alguien',
    `está en la pantalla «${p.titulo}» y te pregunta algo. Contéstale como`,
    'se lo explicarías a un compañero de trabajo: claro, cercano y útil.',
    '',
    'TU FORMA DE HABLAR:',
    '- En castellano, de tú. Máximo 4 frases, con tono natural y cercano.',
    '- Puedes usar expresiones como «mira, lo que tienes que hacer es…»,',
    '  «fíjate en…», «eso es sencillo». Que suene a persona, no a manual.',
    '- Usa SOLO lo que aparece en la documentación de abajo. Si la respuesta',
    '  no está ahí, dilo con naturalidad («eso no va en esta pantalla, pero',
    '  creo que lo encuentras en…») y, si sabes qué pantalla lo hace,',
    '  mándale a ella.',
    '- No inventes botones, pantallas, campos ni funciones.',
    '- Si hay pasos, dilo en orden con el nombre exacto del botón.',
    '- No empieces con saludos ni despedidas. Ve al grano, pero con',
    '  calidez.',
    '',
    `DOCUMENTACIÓN DE LA PANTALLA «${p.titulo}»:`,
    `Para qué sirve: ${p.paraQue}`,
    '',
    'Cómo se usa:',
    ...p.pasos.map((paso, i) => `${i + 1}. ${paso}`),
    ...(p.saber.length ? ['', 'Lo que conviene saber:', ...p.saber.map(x => `- ${x}`)] : []),
    '',
    'PREGUNTA:',
    pregunta,
  ].join('\n');
}

/**
 * EL MAPA DEL PROGRAMA, SACADO DE SU PROPIA AYUDA
 *
 * Una línea por pantalla: su ruta, su nombre y para qué sirve. Sale de
 * `lib/ayuda/paginas.ts`, que es la ayuda que ya se le enseña al usuario
 * en cada pantalla, así que no hay una segunda lista que mantener ni
 * riesgo de que el asistente mande a un sitio que no existe. Si mañana
 * se añade una pantalla con su ayuda, el asistente la conoce sola.
 */
const PANTALLAS_DEL_PROGRAMA = AYUDA_PAGINAS.map(
  // SIN LA RUTA A PROPÓSITO
  //
  // Antes cada línea empezaba por «/facturas». Un modelo pequeño copia
  // lo que ve, y las respuestas salían con «entra en /ajustes» — una
  // dirección de programador en la cara de quien sólo quiere facturar.
  // Pedirle que no las use no bastaba; dejar de dárselas, sí. Y no las
  // necesita: sabe el nombre de la pantalla, que es lo que hay escrito
  // en el menú y lo único que el usuario puede buscar.
  p => `- «${p.titulo}»: ${p.paraQue}`,
);

/**
 * ASISTENCIA: LA DUDA CON LA SITUACIÓN REAL DELANTE
 *
 * Los otros modos contestan con el manual. Éste contesta con el manual Y
 * con el retrato de lo que esa empresa tiene ahora mismo —cuántas
 * facturas vencidas, qué le falta por configurar—, que es lo que
 * convierte una respuesta cierta e inútil («para cobrar una vencida,
 * entra en Facturas y…») en una que sirve («tienes 3 vencidas por
 * 1.240 €, la más vieja lleva 47 días»).
 *
 * El retrato llega ya contado y escrito en frases desde el cliente
 * (`lib/asistencia/contexto.ts`): aquí no llegan listas de clientes ni
 * importes uno a uno.
 */
function instruccionesAsistencia(
  pregunta: string,
  situacion: string[],
  historial: { deQuien: 'persona' | 'asistente'; texto: string }[],
): string {
  return [
    'Eres un compañero cercano y amable que conoce muy bien este programa',
    'de facturación. Hablas con alguien que lleva su negocio y te tiene',
    'confianza. Eres una persona cálida, no un robot.',
    '',
    'PERSONALIDAD:',
    '- Eres educado y cercano. Si te saludan, saluda tú también con',
    '  naturalidad antes de nada («¡Hola! ¿Qué tal?», «¡Buenas! Dime»,',
    '  «¡Ey! ¿Qué necesitas?»). No ignores nunca un saludo.',
    '- Si la conversación es informal o personal (como un «¿qué tal?»',
    '  o «cómo va eso»), responde como lo haría un amigo: con calidez',
    '  y un poco de humor si viene bien. No saltes directo a datos.',
    '- Si te piden algo del programa, ahí sí ve al grano pero con tono',
    '  humano. Usa expresiones como «mira», «fíjate», «lo que te',
    '  conviene es…», «ojo con eso», «tranqui, es fácil».',
    '',
    'CÓMO CONTESTAS:',
    '- En castellano, de tú. Máximo 4-5 frases que suenen a conversación',
    '  real, no a manual ni a informe.',
    '- ACCESO TOTAL A TODOS LOS DATOS DEL PANEL (ALMACENES, DOCUMENTOS, STOCK, CLIENTES, GASTOS, OBRAS):',
    '  Tienes acceso completo y en tiempo real a cada entidad del negocio en «DATOS Y SITUACIÓN ACTUAL»:',
    '  * ALMACENES: Tienes la lista de almacenes registrados en «ALMACENES Y LOGÍSTICA». Si te preguntan',
    '    cuántos almacenes tiene, cuáles son, cómo se llaman o cuál es el principal, respóndele con sus nombres',
    '    exactos (ej: «Almacén izq» y «Almacén Central») y detalles. NUNCA digas que no tiene almacenes si aparecen listados.',
    '  * ALBARANES: Tienes todos los albaranes en «ALBARANES DE ENTREGA» y en el listado con [ALBARÁN].',
    '    Si te preguntan si tiene algún albarán o por albaranes concretos (ej: ALB-2026-0001, daddad, etc.),',
    '    menciona el número de albarán, destinatario, fecha, importe (ej: 11,10 €) y si está facturado o pendiente.',
    '  * FACTURAS, PRESUPUESTOS Y PEDIDOS: Si te preguntan cuánto dinero tiene o por cualquier documento,',
    '    da las cifras exactas en euros (ej: 1.452,00 €). NUNCA digas 0 € si hay documentos registrados.',
    '  * PRODUCTOS Y STOCK: Tienes las existencias, precios y referencias de cada artículo.',
    '  * CLIENTES, GASTOS, OBRAS, VEHÍCULOS Y VENDEDORES: Conoces todas las partes del sistema registradas.',
    '- Para mandarle a un sitio del programa, dilo de forma natural:',
    '  «Lo tienes en Facturas» — el nombre tal cual, sin describir qué',
    '  hay dentro.',
    '- Si te preguntan por impuestos —cuánto pagar, qué modelo presentar,',
    '  si algo desgrava— contesta con honestidad: «Eso te lo tiene que',
    '  decir tu gestoría, ahí no me meto. Pero los números los tienes',
    '  en Listados fiscales.»',
    '- Si el programa no hace algo, díselo con naturalidad y sugiere la',
    '  alternativa. Un «no» seco no ayuda a nadie.',
    '- Adapta tu tono al de la persona: si está siendo informal, sé',
    '  informal. Si pregunta algo serio, responde serio pero cercano.',
    '',
    'DATOS Y SITUACIÓN ACTUAL DEL NEGOCIO (DASHBOARD):',
    ...situacion,
    '',
    'LAS PANTALLAS QUE EXISTEN:',
    ...PANTALLAS_DEL_PROGRAMA,
    ...(historial.length > 0
      ? ['', 'LO QUE YA OS HABÉIS DICHO:',
        ...historial.map(m => `${m.deQuien === 'persona' ? 'Ella' : 'Tú'}: ${m.texto}`)]
      : []),
    '',
    'PREGUNTA:',
    pregunta,
  ].join('\n');
}

function numero(valor: unknown): number {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : 0;
}

export async function POST(request: NextRequest) {
  if (!configuracionIA()) {
    return NextResponse.json(
      { error: 'La ayuda con IA no está configurada en este servidor.' },
      { status: 501 },
    );
  }

  // Un modelo de pago cuesta dinero y uno local cuesta tiempo de máquina.
  // Un cajero pregunta unas cuantas veces por turno; sesenta por hora es de
  // sobra y corta cualquier bucle.
  const permitido = await checkRateLimit(`ayuda:${clientIpFromRequest(request)}`, 60, 3600);
  if (!permitido) {
    return NextResponse.json(
      { error: 'Has preguntado muchas veces seguidas. Espera un minuto.' },
      { status: 429 },
    );
  }

  let cuerpo: {
    modo?: string;
    pregunta?: string;
    contexto?: Partial<ContextoTpv>;
    turno?: Partial<ResumenTurno>;
    pagina?: Partial<ContextoPagina>;
    /** Modo asistencia: el retrato del panel, ya contado en el cliente. */
    situacion?: unknown;
    historial?: unknown;
  };
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
  } else if (cuerpo.modo === 'asistencia') {
    const pregunta = String(cuerpo.pregunta ?? '').trim().slice(0, MAXIMO_PREGUNTA);
    if (!pregunta) {
      return NextResponse.json({ error: 'Escribe o dicta tu pregunta.' }, { status: 400 });
    }
    // Se acota lo que llega del cliente: el texto viaja al modelo y no
    // tiene sentido pagar por un retrato de diez folios que nadie escribió.
    const situacion = (Array.isArray(cuerpo.situacion) ? cuerpo.situacion : [])
      .slice(0, 20).map(x => String(x).slice(0, 300));
    // La conversación previa, para que se pueda repreguntar sin repetirlo
    // todo. Las últimas seis y nada más: lo de hace veinte mensajes ya no
    // ayuda y se paga igual.
    const historial = (Array.isArray(cuerpo.historial) ? cuerpo.historial : [])
      .slice(-6)
      .map((m: unknown) => {
        const mensaje = m as { deQuien?: unknown; texto?: unknown };
        return {
          deQuien: mensaje?.deQuien === 'asistente' ? 'asistente' as const : 'persona' as const,
          texto: String(mensaje?.texto ?? '').slice(0, 600),
        };
      })
      .filter(m => m.texto);

    instrucciones = instruccionesAsistencia(pregunta, situacion, historial);
  } else if (cuerpo.modo === 'pagina') {
    const pregunta = String(cuerpo.pregunta ?? '').trim().slice(0, MAXIMO_PREGUNTA);
    if (!pregunta) {
      return NextResponse.json({ error: 'Escribe tu pregunta.' }, { status: 400 });
    }
    const p = cuerpo.pagina ?? {};
    // Se acota lo que llega del cliente: el texto viaja al modelo y no tiene
    // sentido pagar por una documentación de diez folios que nadie escribió.
    const lista = (v: unknown) =>
      (Array.isArray(v) ? v : []).slice(0, 12).map(x => String(x).slice(0, 300));
    instrucciones = instruccionesPagina(pregunta, {
      titulo: String(p.titulo ?? 'esta pantalla').slice(0, 80),
      paraQue: String(p.paraQue ?? '').slice(0, 400),
      pasos: lista(p.pasos),
      saber: lista(p.saber),
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

  try {
    const texto = await generarTexto({
      instrucciones,
      // Poca creatividad: la misma duda dos veces tiene que dar la misma
      // respuesta, que es lo que permite fiarse de ella.
      temperatura: 0.2,
      // LA ASISTENCIA NECESITA MÁS AIRE QUE EL MOSTRADOR
      //
      // En el TPV hay un cliente esperando de pie: si tarda, no sirve. En
      // la pantalla de asistencia no, y el enunciado es mucho mayor —lleva
      // el mapa de las cuarenta pantallas del programa y la situación de
      // la empresa—, así que el modelo tarda más en leerlo y en pensar.
      //
      // Con 45 s y 900 tokens se caían una de cada dos preguntas, y el
      // usuario veía «no se ha podido contactar» cuando lo único que
      // pasaba es que no le habíamos dado tiempo.
      maximoTokens: cuerpo.modo === 'asistencia' ? 2_000 : 512,
      // Por INTENTO, no en total: con tres intentos, el peor caso son
      // unos 140 s. Más por intento y una mala racha del proveedor deja a
      // alguien mirando un reloj durante minutos.
      tiempoLimiteMs: cuerpo.modo === 'asistencia' ? 45_000 : 30_000,
    });
    return NextResponse.json({ texto });
  } catch (err) {
    if (!(err instanceof FalloIA)) throw err;
    // El detalle puede llevar trazas de la petición: al registro sí, al
    // usuario no.
    console.error('[ayuda] fallo de IA:', err.motivo, err.detalle ?? '');
    // El consuelo tiene que pegar con dónde está la persona: «el TPV
    // sigue funcionando igual» a quien está en la pantalla de asistencia
    // no le dice nada.
    const consuelo = cuerpo.modo === 'asistencia'
      ? 'El resto del programa sigue funcionando igual.'
      : 'El TPV sigue funcionando igual.';
    const { estado, error } = respuestaDeFallo(err, consuelo);
    return NextResponse.json({ error }, { status: estado });
  }
}
