/**
 * LECTURA DE UN PDF SUBIDO
 *
 * Saca de la primera página dos cosas que luego usa el detector:
 *
 *   1. Los textos con su geometría y su estilo (posición, tamaño, fuente).
 *   2. La página pintada a mapa de bits.
 *
 * El color del texto sale del mapa de bits, no del PDF. Podría leerse del
 * flujo de operadores, pero eso obliga a interpretar espacios de color
 * (RGB, CMYK, escala de grises, ICC, patrones…) y basta un caso raro para
 * que un dato salga de un color equivocado en la factura de un cliente.
 * Mirar los píxeles que de verdad se han pintado da el color que el usuario
 * ve, sea cual sea el camino que siguió el PDF para producirlo, y de paso
 * da el color de fondo que hace falta para borrar los datos de muestra.
 *
 * Sólo se usa en el navegador: pdf.js necesita canvas y un worker.
 */

import type { ItemTexto, LineaTexto, PaginaExtraida, SegmentoTexto } from './tipos';

const PT_A_MM = 25.4 / 72;

/** Resolución a la que se calca la página. 200 ppp imprime bien sin pesar. */
const PPP_CALCO = 200;

/** Página leída, con el lienzo aún vivo para poder muestrear y borrar. */
export interface PaginaConLienzo extends PaginaExtraida {
  lienzo: HTMLCanvasElement;
  pixeles: ImageData;
}

// ============================================================
// CARGA DE PDF.JS
// ============================================================

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
type PdfJs = any;

let pdfjsPromesa: Promise<PdfJs> | null = null;

/**
 * Carga pdf.js bajo demanda. El worker se sirve desde `/pdfjs/`, copiado ahí
 * por `scripts/copiar-worker-pdfjs.mjs`: dejar que el empaquetador resuelva
 * `new URL(...)` funciona con webpack pero no siempre con Turbopack, y un
 * fichero estático se comporta igual en desarrollo, en Vercel y en Electron.
 */
async function cargarPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromesa) {
    pdfjsPromesa = import('pdfjs-dist').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
      return pdfjs;
    });
  }
  return pdfjsPromesa;
}

// ============================================================
// ESTILO DE FUENTE
// ============================================================

const RE_NEGRITA = /(bold|black|heavy|semib|demib|-bd\b|extrab|ultrab)/i;
const RE_CURSIVA = /(italic|oblique|-it\b)/i;
const RE_SERIF = /(times|serif|georgia|garamond|book|minion|cambria|palatino|roman|didot|baskerville)/i;
const RE_SANS = /(arial|helvetica|verdana|tahoma|calibri|segoe|roboto|open ?sans|lato|montserrat|futura|gothic|grotes|inter|nunito|poppins|sans)/i;
const RE_MONO = /(mono|courier|consol|menlo)/i;

interface EstiloFuente {
  nombre: string;
  negrita: boolean;
  cursiva: boolean;
  serif: boolean;
  monoespaciada: boolean;
}

function leerEstiloFuente(nombreBruto: string, familia: string, cursivaDeclarada: boolean): EstiloFuente {
  // El nombre suele venir con el prefijo de subconjunto: `ABCDEF+Helvetica-Bold`.
  const limpio = nombreBruto.replace(/^[A-Z]{6}\+/, '');
  const texto = `${limpio} ${familia}`;
  const esMono = RE_MONO.test(texto);
  // `serif` a secas aparece dentro de `sans-serif`, así que primero se
  // descarta la familia sans o cualquier nombre acabaría clasificado serif.
  const esSerif = !esMono && !RE_SANS.test(texto) && RE_SERIF.test(texto);
  return {
    nombre: limpio || familia,
    negrita: RE_NEGRITA.test(texto),
    cursiva: cursivaDeclarada || RE_CURSIVA.test(texto),
    serif: esSerif,
    monoespaciada: esMono,
  };
}

// ============================================================
// MUESTREO DE COLOR SOBRE EL MAPA DE BITS
// ============================================================

function aHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export interface MuestraColor {
  /** Color del texto: el que más se aleja del fondo. */
  texto: string;
  /** Color de fondo: el más repetido de la caja. */
  fondo: string;
  /** Proporción de píxeles que son tinta (0 a 1). Sirve para estimar grosor. */
  densidad: number;
}

/**
 * Color de fondo dominante de un conjunto de píxeles.
 *
 * Se agrupan en cubos de 3 bits por canal para que el ruido de compresión no
 * parta un mismo color en veinte tonos, pero el color que se devuelve es la
 * MEDIA REAL de los píxeles del cubo ganador, no el centro del cubo.
 *
 * La diferencia no es un matiz: el centro del cubo del blanco es 240, así que
 * devolver el centro pintaba de gris claro todos los borrados sobre papel
 * blanco. En una factura eso son parches grises por toda la página.
 */
function colorDominante(muestras: Uint8Array, cuantos: number): { r: number; g: number; b: number } {
  const cuentas = new Map<number, { n: number; r: number; g: number; b: number }>();

  for (let i = 0; i < cuantos; i++) {
    const r = muestras[i * 3], g = muestras[i * 3 + 1], b = muestras[i * 3 + 2];
    const cubo = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const acumulado = cuentas.get(cubo);
    if (acumulado) {
      acumulado.n++; acumulado.r += r; acumulado.g += g; acumulado.b += b;
    } else {
      cuentas.set(cubo, { n: 1, r, g, b });
    }
  }

  let mejor = { n: 0, r: 255 * 1, g: 255 * 1, b: 255 * 1 };
  for (const [, acumulado] of cuentas) {
    if (acumulado.n > mejor.n) mejor = acumulado;
  }
  const n = Math.max(1, mejor.n);
  return { r: mejor.r / n, g: mejor.g / n, b: mejor.b / n };
}

/**
 * Mira los píxeles de una caja y separa fondo de tinta. El fondo es el color
 * más repetido; la tinta, la mediana de los píxeles que más se alejan de él.
 * Tomar la mediana y no el máximo evita que un solo píxel de ruido o un
 * borde antialias decidan el color de un campo entero.
 */
export function muestrearColor(
  pixeles: ImageData,
  x: number,
  y: number,
  ancho: number,
  alto: number,
): MuestraColor {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(pixeles.width, Math.ceil(x + ancho));
  const y1 = Math.min(pixeles.height, Math.ceil(y + alto));
  if (x1 <= x0 || y1 <= y0) return { texto: '#000000', fondo: '#ffffff', densidad: 0 };

  const datos = pixeles.data;
  const total = (x1 - x0) * (y1 - y0);
  const muestras = new Uint8Array(total * 3);
  let n = 0;

  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const i = (py * pixeles.width + px) * 4;
      muestras[n * 3] = datos[i];
      muestras[n * 3 + 1] = datos[i + 1];
      muestras[n * 3 + 2] = datos[i + 2];
      n++;
    }
  }

  const fondo = colorDominante(muestras, n);
  const fr = fondo.r, fg = fondo.g, fb = fondo.b;

  const conDistancia = Array.from({ length: n }, (_, i) => {
    const r = muestras[i * 3], g = muestras[i * 3 + 1], b = muestras[i * 3 + 2];
    return { r, g, b, d: Math.abs(r - fr) + Math.abs(g - fg) + Math.abs(b - fb) };
  }).sort((a, b) => b.d - a.d);

  // Umbral de tinta: la mitad de la distancia máxima observada, con un
  // mínimo para no llamar «texto» a la textura de un fondo liso.
  const distanciaMaxima = conDistancia[0]?.d ?? 0;
  const umbral = Math.max(60, distanciaMaxima * 0.5);
  const tinta = conDistancia.filter(p => p.d >= umbral);
  const densidad = tinta.length / Math.max(1, n);

  if (tinta.length === 0) {
    return { texto: aHex(fr, fg, fb), fondo: aHex(fr, fg, fb), densidad: 0 };
  }

  const medio = tinta[Math.floor(tinta.length / 2)];
  return { texto: aHex(medio.r, medio.g, medio.b), fondo: aHex(fr, fg, fb), densidad };
}

/**
 * Busca las líneas horizontales largas que hay dentro de una franja: son el
 * marco y las rayas de una tabla dibujada.
 *
 * Hace falta porque el texto no dice dónde termina la tabla. Si la zona que
 * se borra se queda corta, el marco del PDF original sobrevive a medias y la
 * tabla nueva se dibuja encima descuadrada: dos marcos, uno cortado. Con
 * esto se sabe dónde está el marco de verdad y se puede borrar entero.
 *
 * Devuelve las alturas (en píxeles del calco) de cada línea encontrada.
 */
export function lineasHorizontales(
  pixeles: ImageData,
  xDesde: number,
  xHasta: number,
  yDesde: number,
  yHasta: number,
  /** Proporción del ancho que tiene que estar pintada para contar como línea. */
  cobertura = 0.6,
): number[] {
  const x0 = Math.max(0, Math.floor(xDesde));
  const x1 = Math.min(pixeles.width, Math.ceil(xHasta));
  const y0 = Math.max(0, Math.floor(yDesde));
  const y1 = Math.min(pixeles.height, Math.ceil(yHasta));
  if (x1 - x0 < 10) return [];

  const encontradas: number[] = [];
  const necesarios = (x1 - x0) * cobertura;

  for (let y = y0; y < y1; y++) {
    let oscuros = 0;
    for (let x = x0; x < x1; x++) {
      const i = (y * pixeles.width + x) * 4;
      // Cualquier cosa apreciablemente más oscura que el papel cuenta como
      // trazo: sirve igual para una línea negra que para una gris suave.
      const luz = (pixeles.data[i] + pixeles.data[i + 1] + pixeles.data[i + 2]) / 3;
      if (luz < 225) oscuros++;
    }
    if (oscuros >= necesarios) encontradas.push(y);
  }

  // Una línea de 2 px de grosor son dos filas seguidas: se cuenta una sola.
  return encontradas.filter((y, i) => i === 0 || y - encontradas[i - 1] > 2);
}

/**
 * Hasta dónde llega en horizontal el trazo que hay a una altura dada.
 *
 * Sirve para saber el ancho real del marco de una tabla: el texto de la
 * cabecera empieza unos milímetros dentro del marco, así que sin esto la
 * zona que se borra se queda estrecha y quedan los cantos del recuadro
 * original asomando a los lados.
 */
export function extensionDeLinea(
  pixeles: ImageData,
  y: number,
  xDesde: number,
  xHasta: number,
): { x: number; ancho: number } | null {
  const fila = Math.round(y);
  if (fila < 0 || fila >= pixeles.height) return null;

  const x0 = Math.max(0, Math.floor(xDesde));
  const x1 = Math.min(pixeles.width, Math.ceil(xHasta));
  let inicio = -1, fin = -1, huecoSeguido = 0;

  for (let x = x0; x < x1; x++) {
    const i = (fila * pixeles.width + x) * 4;
    const luz = (pixeles.data[i] + pixeles.data[i + 1] + pixeles.data[i + 2]) / 3;
    if (luz < 225) {
      if (inicio === -1) inicio = x;
      fin = x;
      huecoSeguido = 0;
    } else if (inicio !== -1) {
      // Una línea de puntos o un corte por una celda no rompe el trazo.
      huecoSeguido++;
      if (huecoSeguido > 40) break;
    }
  }

  if (inicio === -1 || fin - inicio < 10) return null;
  return { x: inicio, ancho: fin - inicio };
}

/**
 * Color con el que hay que tapar una zona: el fondo dominante del marco que
 * la rodea. Se mira el contorno y no el interior porque el interior es
 * justamente lo que se va a borrar.
 */
export function fondoAlrededor(
  pixeles: ImageData,
  x: number,
  y: number,
  ancho: number,
  alto: number,
  margen = 2,
): string {
  const puntos: number[] = [];
  const anota = (px: number, py: number) => {
    if (px < 0 || py < 0 || px >= pixeles.width || py >= pixeles.height) return;
    const i = (py * pixeles.width + px) * 4;
    puntos.push(pixeles.data[i], pixeles.data[i + 1], pixeles.data[i + 2]);
  };

  const x0 = Math.floor(x) - margen, x1 = Math.ceil(x + ancho) + margen;
  const y0 = Math.floor(y) - margen, y1 = Math.ceil(y + alto) + margen;
  for (let px = x0; px <= x1; px++) { anota(px, y0); anota(px, y1); }
  for (let py = y0; py <= y1; py++) { anota(x0, py); anota(x1, py); }

  if (puntos.length === 0) return '#ffffff';
  const fondo = colorDominante(Uint8Array.from(puntos), puntos.length / 3);
  return aHex(fondo.r, fondo.g, fondo.b);
}

// ============================================================
// AGRUPACIÓN EN LÍNEAS
// ============================================================

/** Línea base aproximada de un item: la altura a la que se apoyan las letras. */
function base(item: ItemTexto): number {
  return item.y + item.alto * 0.78;
}

function medir(items: ItemTexto[]): SegmentoTexto {
  const x = Math.min(...items.map(i => i.x));
  const y = Math.min(...items.map(i => i.y));
  const der = Math.max(...items.map(i => i.x + i.ancho));
  const aba = Math.max(...items.map(i => i.y + i.alto));

  let texto = '';
  let anterior: ItemTexto | null = null;
  for (const item of items) {
    if (anterior) {
      const hueco = item.x - (anterior.x + anterior.ancho);
      // Un hueco perceptible es un espacio; pegado, es la misma palabra
      // partida por un cambio de fuente o de espaciado.
      if (hueco > Math.max(0.5, item.alto * 0.25)) texto += ' ';
    }
    texto += item.texto;
    anterior = item;
  }

  return { items, texto: texto.replace(/\s+/g, ' ').trim(), x, y, ancho: der - x, alto: aba - y };
}

/**
 * Ordena los textos en filas (todo lo que está a la misma altura) y, dentro
 * de cada fila, en segmentos (lo que además está pegado entre sí).
 *
 * Un PDF parte una frase en varios items en cuanto cambia el espaciado o la
 * fuente, así que sin este paso «Nº de factura:» pueden ser cinco items
 * sueltos y ninguna etiqueta se reconocería.
 */
export function agruparEnLineas(items: ItemTexto[]): LineaTexto[] {
  const ordenados = [...items].sort((a, b) => (base(a) - base(b)) || (a.x - b.x));
  const filas: ItemTexto[][] = [];

  for (const item of ordenados) {
    const fila = filas.find(f => {
      const referencia = f[f.length - 1];
      const tolerancia = Math.max(0.8, Math.min(referencia.alto, item.alto) * 0.5);
      return Math.abs(base(referencia) - base(item)) <= tolerancia;
    });
    if (fila) fila.push(item);
    else filas.push([item]);
  }

  const lineas: LineaTexto[] = [];
  for (const fila of filas) {
    const enOrden = fila.sort((a, b) => a.x - b.x);
    const grupos: ItemTexto[][] = [];

    for (const item of enOrden) {
      const grupo = grupos[grupos.length - 1];
      const ultimo = grupo?.[grupo.length - 1];
      // Dos celdas de una misma fila de tabla están lejos; dos trozos de la
      // misma frase, a un espacio o menos.
      const separacion = ultimo ? item.x - (ultimo.x + ultimo.ancho) : Infinity;
      if (grupo && separacion <= Math.max(2.4, item.alto * 1.2)) grupo.push(item);
      else grupos.push([item]);
    }

    const segmentos = grupos.map(medir).filter(s => s.texto.length > 0);
    if (segmentos.length === 0) continue;
    lineas.push({ ...medir(enOrden), segmentos });
  }

  return lineas
    .filter(l => l.texto.length > 0)
    .sort((a, b) => (a.y - b.y) || (a.x - b.x));
}

// ============================================================
// EXTRACCIÓN
// ============================================================

export class ErrorPdf extends Error {}

/**
 * Lee la primera página de un PDF y la deja lista para analizar.
 * `datos` se consume (pdf.js se queda con el buffer), así que se le pasa
 * siempre una copia.
 */
export async function extraerPagina(archivo: ArrayBuffer): Promise<PaginaConLienzo> {
  const pdfjs = await cargarPdfJs();

  let documento;
  try {
    documento = await pdfjs.getDocument({
      data: new Uint8Array(archivo.slice(0)),
      // Sin esto pdf.js intenta bajarse de la red los mapas de caracteres de
      // las fuentes CJK; la app tiene que funcionar sin conexión.
      useSystemFonts: true,
      isEvalSupported: false,
    }).promise;
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : '';
    if (/password/i.test(mensaje)) {
      throw new ErrorPdf('El PDF está protegido con contraseña. Quítasela y vuelve a subirlo.');
    }
    throw new ErrorPdf('No se ha podido leer el PDF. Puede estar dañado o no ser un PDF.');
  }

  if (documento.numPages < 1) throw new ErrorPdf('El PDF no tiene ninguna página.');

  const pagina = await documento.getPage(1);
  const vistaPuntos = pagina.getViewport({ scale: 1 });
  const anchoMm = vistaPuntos.width * PT_A_MM;
  const altoMm = vistaPuntos.height * PT_A_MM;

  // --- Calco de la página ---
  const escala = PPP_CALCO / 72;
  const vista = pagina.getViewport({ scale: escala });
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(vista.width);
  lienzo.height = Math.round(vista.height);
  const ctx = lienzo.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new ErrorPdf('Este navegador no permite dibujar el PDF (canvas no disponible).');
  // Fondo blanco explícito: un PDF sin fondo propio dejaría el lienzo
  // transparente y al pegarlo en el PDF final se vería negro.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  await pagina.render({ canvasContext: ctx, viewport: vista, intent: 'print' }).promise;
  const pixeles = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
  const pxPorMm = lienzo.width / anchoMm;

  // --- Textos ---
  const contenido = await pagina.getTextContent();
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const estilos: Record<string, any> = contenido.styles ?? {};
  const items: ItemTexto[] = [];

  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  for (const bruto of contenido.items as any[]) {
    if (typeof bruto.str !== 'string' || bruto.str.trim() === '') continue;

    // `transform` viene en espacio PDF (origen abajo a la izquierda). El
    // transform de la vista lo lleva a coordenadas de pantalla con la Y
    // hacia abajo, que es como mide pdfme.
    const t = pdfjs.Util.transform(vistaPuntos.transform, bruto.transform);
    const tamanoPt = Math.hypot(t[1], t[3]) || Math.abs(t[3]) || 10;
    const anchoPt = typeof bruto.width === 'number' ? bruto.width : 0;

    const estilo = estilos[bruto.fontName] ?? {};
    const nombreFuente = await nombreDeFuente(pagina, bruto.fontName, estilo);
    const fuente = leerEstiloFuente(nombreFuente, estilo.fontFamily ?? '', Boolean(estilo.italic));

    // t[5] es la línea base. El alto visible de una caja de texto va desde el
    // ascendente hasta el descendente; se usa el de la fuente cuando pdf.js
    // lo conoce y una proporción típica cuando no.
    const ascendente = typeof estilo.ascent === 'number' && estilo.ascent > 0 ? estilo.ascent : 0.78;
    const descendente = typeof estilo.descent === 'number' ? Math.abs(estilo.descent) : 0.22;
    const arribaPt = t[5] - tamanoPt * ascendente;
    const altoPt = tamanoPt * (ascendente + descendente);

    const x = t[4] * PT_A_MM;
    const y = arribaPt * PT_A_MM;
    const ancho = (anchoPt || bruto.str.length * tamanoPt * 0.5) * PT_A_MM;
    const alto = altoPt * PT_A_MM;

    const muestra = muestrearColor(pixeles, x * pxPorMm, y * pxPorMm, ancho * pxPorMm, alto * pxPorMm);

    items.push({
      texto: bruto.str,
      x,
      y,
      ancho,
      alto,
      tamano: tamanoPt,
      fuente: fuente.nombre,
      // Si el nombre de la fuente no delata la negrita (pasa con las fuentes
      // incrustadas sin nombre legible), decide la mancha de tinta: una
      // negrita pinta bastantes más píxeles que una redonda del mismo cuerpo.
      negrita: fuente.negrita || muestra.densidad > 0.42,
      cursiva: fuente.cursiva,
      serif: fuente.serif,
      monoespaciada: fuente.monoespaciada,
      color: muestra.texto,
    });
  }

  const lineas = agruparEnLineas(items);

  return {
    ancho: anchoMm,
    alto: altoMm,
    items,
    lineas,
    totalPaginas: documento.numPages,
    bitmap: {
      dataUrl: lienzo.toDataURL('image/png'),
      anchoPx: lienzo.width,
      altoPx: lienzo.height,
      pxPorMm,
    },
    lienzo,
    pixeles,
  };
}

/** Nombre real de la fuente. pdf.js lo guarda aparte del identificador interno. */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
async function nombreDeFuente(pagina: any, idFuente: string, estilo: any): Promise<string> {
  try {
    if (pagina.commonObjs?.has?.(idFuente)) {
      const fuente = pagina.commonObjs.get(idFuente);
      if (fuente?.name) return String(fuente.name);
    }
  } catch {
    // Un fallo aquí sólo significa peor detección de negrita, no un error.
  }
  return String(estilo?.fontFamily ?? idFuente ?? '');
}
