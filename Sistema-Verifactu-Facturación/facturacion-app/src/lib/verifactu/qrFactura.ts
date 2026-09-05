/**
 * EL BLOQUE DEL QR TRIBUTARIO: DÓNDE VA Y CUÁNTO MIDE
 *
 * `qr.ts` sabe QUÉ codifica el código (la URL de cotejo de la AEAT). Este
 * módulo sabe DÓNDE se pone y CÓMO se presenta, que es la otra mitad de lo
 * que exige la norma y la que estaba sin hacer: el QR se colocaba a 24×24 mm
 * en el pie derecho de la hoja, sin el rótulo que debe precederlo y con una
 * leyenda inventada («Factura con registro de facturación encadenado
 * (SHA-256)»). Ninguna de esas tres cosas cumple.
 *
 * LO QUE DICE LA NORMA, LITERAL
 * -----------------------------
 * Orden HAC/1177/2024, art. 21.1: «El código "QR" deberá tener un tamaño
 * entre 30x30 y 40x40 milímetros y seguir las especificaciones de la norma
 * ISO/IEC 18004:2015. Para la generación del código "QR" se empleará el
 * nivel M (medio) de corrección de errores.»
 *
 * Y el documento técnico que la AEAT publica en su sede para completarla
 * —«Detalle de las especificaciones técnicas del código "QR" de la factura
 * y de la "URL" del servicio de cotejo», v0.5.0 de 10/12/2025, apartado 3—
 * concreta la colocación:
 *
 * - «se deben mantener como mínimo 2 milímetros de espacio vacío (en blanco)
 *   alrededor de los cuatro lados del código "QR", recomendándose que sean 6
 *   milímetros».
 * - «El código "QR" se situará al principio de la factura, antes de que
 *   empiece el contenido de ésta generado por el sistema informático de
 *   facturación».
 * - «Si la factura ocupara varias páginas, el código "QR" aparecería una
 *   única vez, en la primera página».
 * - Vertical: «arriba de esta, próximo al margen superior, preferiblemente
 *   centrado respecto a los márgenes izquierdo y derecho (o, si no, hacia el
 *   margen izquierdo-superior)».
 * - Apaisado: «a la izquierda de esta, preferiblemente cercana al margen
 *   superior-izquierdo».
 * - «un texto que siempre deberá ir precediéndolo: "QR tributario:", y que se
 *   situará encima del propio código "QR" (preferiblemente centrado)».
 * - «justo debajo del código "QR" deberá aparecer la frase "Factura
 *   verificable en la sede electrónica de la AEAT" o "VERI*FACTU",
 *   preferiblemente centrada».
 * - Ambos textos «deberán tener un tipo de letra y tamaño legibles, siempre
 *   iguales o superiores a los del resto de datos de la factura».
 *
 * LO QUE ES DECISIÓN NUESTRA Y NO DE LA AEAT
 * -----------------------------------------
 * El margen de 10 mm contra el borde del papel. La norma no fija ninguno:
 * sólo dice «próximo al margen superior». 10 mm es lo que casi cualquier
 * impresora doméstica puede imprimir sin recortar, y deja el QR claramente
 * dentro de la hoja. Cambiarlo no incumple nada; bajarlo de 2 mm sí, porque
 * entonces el espacio vacío obligatorio se saldría del papel.
 *
 * El tamaño por defecto de 35 mm también es nuestro: es el punto medio del
 * intervalo legal, así que sobrevive a un escalado de ±14 % al imprimir sin
 * salirse por ninguno de los dos lados.
 */

/** Mínimo legal del lado del QR (art. 21.1 de la Orden HAC/1177/2024). */
export const QR_MIN_MM = 30;
/** Lo que se usa mientras nadie diga otra cosa: el centro del intervalo legal. */
export const QR_DEFAULT_MM = 35;
/** Máximo legal del lado del QR (art. 21.1 de la Orden HAC/1177/2024). */
export const QR_MAX_MM = 40;

/** Espacio vacío EXIGIDO alrededor de los cuatro lados del QR. */
export const RESERVA_MINIMA_MM = 2;
/** El que la AEAT recomienda, y el que dejamos: 6 mm. */
export const RESERVA_MM = 6;

/** Separación entre el QR y sus dos textos. Nuestra, no de la norma. */
export const SEPARACION_TEXTO_MM = 2;

/** Margen contra el borde del papel. Decisión de diseño, no requisito legal. */
export const MARGEN_MM = 10;

/** El texto que SIEMPRE precede al código, literal del apartado 3. */
export const ROTULO_QR = 'QR tributario:';

/** La frase larga del art. 20.1.b, literal. */
export const LEYENDA_LARGA = 'Factura verificable en la sede electrónica de la AEAT';
/** La corta que el mismo artículo admite como alternativa, literal. */
export const LEYENDA_CORTA = 'VERI*FACTU';

/**
 * Tamaño de letra de los dos textos, en puntos.
 *
 * La norma pide que sea «igual o superior» al del resto de datos de la
 * factura. El cuerpo de una factura de este programa va a 9 pt, así que 9 pt
 * es el suelo. Quien monte una plantilla con el cuerpo más grande lo pasa por
 * `tamanoTextoPt` y el bloque se recalcula entero.
 */
export const TEXTO_QR_PT = 9;

/** Dónde se pone el QR dentro de la hoja. */
export type PosicionQr = 'superior-centro' | 'superior-izquierda' | 'superior-derecha';

/** Cuál de las dos frases admitidas se imprime debajo del código. */
export type LeyendaQr = 'larga' | 'corta' | 'ninguna';

export interface Hoja {
  /** Ancho de la página en mm. */
  ancho: number;
  /** Alto de la página en mm. */
  alto: number;
}

export interface CajaMm {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

export interface TextoQr extends CajaMm {
  texto: string;
  /** Tamaño de fuente en puntos. */
  tamano: number;
}

/**
 * El bloque entero, ya resuelto en milímetros desde la esquina superior
 * izquierda de la página: es lo único que necesita saber quien lo pinte, ya
 * sea en el PDF, en el editor o en un ticket de 80 mm.
 */
export interface BloqueQr {
  /** Lado del cuadrado del código, ya acotado a [30, 40]. */
  lado: number;
  rotulo: TextoQr;
  qr: CajaMm;
  /** Nulo sólo si se pidió `leyenda: 'ninguna'`. */
  leyenda: TextoQr | null;
  /**
   * Lo que ningún otro elemento puede invadir: el código más su espacio
   * vacío, y los dos textos. Quien estampa el bloque lo pinta de blanco antes
   * de dibujar nada, y así el QR nunca queda debajo de otra cosa por muy
   * ocupada que estuviera esa parte del papel.
   */
  reserva: CajaMm;
}

/** Una hoja es apaisada cuando mide más de ancho que de alto. */
export function esApaisada(hoja: Hoja): boolean {
  return hoja.ancho > hoja.alto;
}

/**
 * La posición que manda la especificación para esa orientación: centrada
 * arriba en vertical, arriba a la izquierda en apaisado.
 */
export function posicionPorDefecto(hoja: Hoja): PosicionQr {
  return esApaisada(hoja) ? 'superior-izquierda' : 'superior-centro';
}

/**
 * Deja el lado dentro del intervalo legal.
 *
 * Es la única puerta por la que puede entrar un tamaño: ni el editor, ni los
 * ajustes, ni una plantilla vieja guardada con 24 mm pueden colar un QR
 * ilegal, porque todos pasan por aquí. Un valor ausente o absurdo cae en los
 * 35 mm por defecto en vez de reventar.
 */
export function acotarTamanoQr(mm: number | undefined | null): number {
  if (typeof mm !== 'number' || !Number.isFinite(mm) || mm <= 0) return QR_DEFAULT_MM;
  return Math.min(QR_MAX_MM, Math.max(QR_MIN_MM, mm));
}

/** Alto de una línea de texto de `pt` puntos, en milímetros. */
function altoLinea(pt: number): number {
  // 1 pt = 0,3528 mm; el 1,25 es el interlineado con el que se pinta.
  return pt * 0.3528 * 1.25;
}

/**
 * Ancho aproximado de un texto en milímetros.
 *
 * Es una estimación: la de verdad la hace quien pinta, que sí tiene la
 * fuente cargada. Aquí sólo hace falta para decidir cuántas líneas ocupará
 * la leyenda y, con eso, cuánto mide el bloque de alto.
 */
function anchoTexto(texto: string, pt: number): number {
  // La Helvetica gasta 0,44 em por carácter en una frase corriente en
  // castellano (medido sobre la leyenda larga). Se cuenta con 0,46 para que
  // la estimación se quede siempre del lado de partir una línea de más y no
  // de una de menos.
  return texto.length * pt * 0.3528 * 0.46;
}

/** En cuántas líneas cae un texto dentro de un ancho dado. */
export function lineasQueOcupa(texto: string, pt: number, anchoDisponible: number): number {
  if (anchoDisponible <= 0) return 1;
  return Math.max(1, Math.ceil(anchoTexto(texto, pt) / anchoDisponible));
}

export interface OpcionesBloqueQr {
  hoja: Hoja;
  /** Lado del código en mm. Se acota a [30, 40]; por defecto 35. */
  tamanoMm?: number;
  /** Por defecto, la que corresponde a la orientación de la hoja. */
  posicion?: PosicionQr;
  /** Distancia al borde del papel. Por defecto 10 mm. */
  margenMm?: number;
  /** Qué frase va debajo. Por defecto la larga. */
  leyenda?: LeyendaQr;
  /** Tamaño de los dos textos en puntos. Por defecto 9. */
  tamanoTextoPt?: number;
  /**
   * Esquina superior izquierda donde la PLANTILLA quiere el código.
   *
   * Cuando viene, manda sobre `posicion`: es la plantilla la que decide dónde
   * se coloca, que es justo el reparto de papeles que hace falta. El bloque
   * se sigue acotando a la hoja, así que una plantilla no puede empujarlo
   * fuera del papel ni pegarlo al borde.
   */
  ancla?: { x: number; y: number };
}

/**
 * Resuelve el bloque entero: dónde cae el código, dónde su rótulo, dónde su
 * leyenda y qué rectángulo hay que dejar libre.
 *
 * Todo el sistema pasa por aquí —la plantilla desde cero, el estampado del
 * PDF, el editor y el ticket del TPV—, así que un cambio de criterio se hace
 * en un sitio y sale en todos.
 */
export function componerBloqueQr(opciones: OpcionesBloqueQr): BloqueQr {
  const { hoja } = opciones;
  const lado = acotarTamanoQr(opciones.tamanoMm);
  const margen = Math.max(RESERVA_MINIMA_MM, opciones.margenMm ?? MARGEN_MM);
  const pt = Math.max(1, opciones.tamanoTextoPt ?? TEXTO_QR_PT);
  const modo: LeyendaQr = opciones.leyenda ?? 'larga';
  const posicion = opciones.posicion ?? posicionPorDefecto(hoja);

  const textoLeyenda = modo === 'corta' ? LEYENDA_CORTA : LEYENDA_LARGA;
  const altoRotulo = altoLinea(pt);

  // LA BANDA DE TEXTO NO SE ESTIRA PARA QUE LA FRASE ENTRE EN UNA LÍNEA
  //
  // «Factura verificable en la sede electrónica de la AEAT» mide 74 mm a 9 pt
  // y el código sólo 35: dejar que la banda creciera hasta ahí convertiría el
  // bloque en una franja de 78 mm cruzando la cabecera, y en un A4 se comería
  // el sitio del membrete y de los datos del cliente. Así que la banda se
  // queda en el ancho del código más su aire, y la frase parte en dos líneas,
  // que es lo que la propia especificación contempla: «Si no cabe toda la
  // frase en una sola línea, podrán utilizarse varias líneas hasta
  // completarla». Es además lo que hacen los ejemplos del anexo del documento
  // técnico.
  const anchoUtil = Math.max(lado, hoja.ancho - margen * 2);
  const anchoBanda = Math.min(anchoUtil, lado + RESERVA_MM * 2);

  const lineasLeyenda = modo === 'ninguna' ? 0 : lineasQueOcupa(textoLeyenda, pt, anchoBanda);
  const altoLeyenda = lineasLeyenda * altoLinea(pt);

  // --- Horizontal ---
  let xQr: number;
  if (opciones.ancla) {
    xQr = opciones.ancla.x;
  } else if (posicion === 'superior-izquierda') {
    xQr = margen;
  } else if (posicion === 'superior-derecha') {
    xQr = hoja.ancho - margen - lado;
  } else {
    xQr = (hoja.ancho - lado) / 2;
  }
  // Ni pegado al borde ni fuera del papel: el espacio vacío obligatorio tiene
  // que caber a los dos lados.
  const xMin = Math.min(margen, Math.max(0, hoja.ancho - lado));
  const xMax = Math.max(xMin, hoja.ancho - margen - lado);
  xQr = Math.min(xMax, Math.max(xMin, xQr));

  // --- Vertical ---
  // El rótulo va ARRIBA del código, así que lo que se pega al margen superior
  // es el rótulo, no el QR.
  const altoBloque = altoRotulo + SEPARACION_TEXTO_MM + lado
    + (lineasLeyenda > 0 ? SEPARACION_TEXTO_MM + altoLeyenda : 0);

  let yRotulo = opciones.ancla
    ? opciones.ancla.y - SEPARACION_TEXTO_MM - altoRotulo
    : margen;
  const yMax = Math.max(0, hoja.alto - margen - altoBloque);
  yRotulo = Math.min(yMax, Math.max(Math.min(margen, yMax), yRotulo));

  const yQr = yRotulo + altoRotulo + SEPARACION_TEXTO_MM;
  const yLeyenda = yQr + lado + SEPARACION_TEXTO_MM;

  const xBanda = Math.min(
    Math.max(0, hoja.ancho - anchoBanda),
    Math.max(0, xQr + lado / 2 - anchoBanda / 2),
  );

  const rotulo: TextoQr = {
    texto: ROTULO_QR, tamano: pt,
    x: xBanda, y: yRotulo, ancho: anchoBanda, alto: altoRotulo,
  };

  const leyenda: TextoQr | null = lineasLeyenda > 0
    ? { texto: textoLeyenda, tamano: pt, x: xBanda, y: yLeyenda, ancho: anchoBanda, alto: altoLeyenda }
    : null;

  // La reserva es el código con sus 6 mm de aire por los cuatro lados, más lo
  // que ocupen los textos: son parte de la presentación del QR y tampoco
  // pueden quedar tapados por nada.
  const izquierda = Math.min(xQr - RESERVA_MM, xBanda);
  const derecha = Math.max(xQr + lado + RESERVA_MM, xBanda + anchoBanda);
  const arriba = Math.min(yQr - RESERVA_MM, yRotulo);
  const abajo = Math.max(yQr + lado + RESERVA_MM, leyenda ? leyenda.y + leyenda.alto : 0);

  return {
    lado,
    rotulo,
    qr: { x: xQr, y: yQr, ancho: lado, alto: lado },
    leyenda,
    reserva: {
      x: Math.max(0, izquierda),
      y: Math.max(0, arriba),
      ancho: Math.min(hoja.ancho, derecha) - Math.max(0, izquierda),
      alto: Math.min(hoja.alto, abajo) - Math.max(0, arriba),
    },
  };
}

/**
 * Comprueba que el bloque cumple lo que tiene que cumplir SOBRE EL PAPEL: que
 * mide lo que debe medir y que cabe entero en la hoja sin recortarse.
 *
 * Devuelve la lista de problemas en castellano llano, vacía si todo está
 * bien. No lanza: quien llama decide si eso impide imprimir la factura o sólo
 * merece un aviso en el editor.
 */
export function validarBloqueQr(bloque: BloqueQr, hoja: Hoja): string[] {
  const problemas: string[] = [];

  if (bloque.lado < QR_MIN_MM - 0.01) {
    problemas.push(`El QR mide ${bloque.lado.toFixed(1)} mm de lado y el mínimo legal son ${QR_MIN_MM} mm.`);
  }
  if (bloque.lado > QR_MAX_MM + 0.01) {
    problemas.push(`El QR mide ${bloque.lado.toFixed(1)} mm de lado y el máximo legal son ${QR_MAX_MM} mm.`);
  }

  const fuera = bloque.qr.x < 0
    || bloque.qr.y < 0
    || bloque.qr.x + bloque.qr.ancho > hoja.ancho + 0.01
    || bloque.qr.y + bloque.qr.alto > hoja.alto + 0.01;
  if (fuera) problemas.push('El QR se sale de la página y saldría cortado al imprimir.');

  const sinAire = bloque.qr.x < RESERVA_MINIMA_MM
    || bloque.qr.y < RESERVA_MINIMA_MM
    || bloque.qr.x + bloque.qr.ancho > hoja.ancho - RESERVA_MINIMA_MM
    || bloque.qr.y + bloque.qr.alto > hoja.alto - RESERVA_MINIMA_MM;
  if (!fuera && sinAire) {
    problemas.push(`El QR queda a menos de ${RESERVA_MINIMA_MM} mm del borde del papel y perdería el espacio vacío que exige la AEAT.`);
  }

  if (bloque.leyenda && bloque.leyenda.y + bloque.leyenda.alto > hoja.alto + 0.01) {
    problemas.push('La leyenda del QR no cabe en la página.');
  }

  return problemas;
}

/** Dos rectángulos que se pisan. */
function seSolapan(a: CajaMm, b: CajaMm): boolean {
  return a.x < b.x + b.ancho && a.x + a.ancho > b.x
    && a.y < b.y + b.alto && a.y + a.alto > b.y;
}

/**
 * Qué elementos de la plantilla invaden la zona de reserva.
 *
 * En el PDF final esto no rompe nada —el bloque se estampa el último y sobre
 * blanco, así que el QR siempre queda visible y escaneable—, pero sí significa
 * que ese elemento de la plantilla va a quedar tapado. Por eso se avisa en el
 * editor, que es donde todavía se puede mover.
 */
export function invadenLaReserva<T extends CajaMm>(bloque: BloqueQr, elementos: T[]): T[] {
  return elementos.filter(e => seSolapan(bloque.reserva, e));
}
