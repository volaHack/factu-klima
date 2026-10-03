/**
 * EL RÓTULO QUE DICE QUÉ DOCUMENTO ES
 *
 * Una plantilla se sube a partir de una factura, pero sirve también para
 * albaranes, pedidos y presupuestos. Si el rótulo «FACTURA VENTA» del PDF
 * se quedaba impreso en el calco, un albarán hecho con esa plantilla salía
 * titulado «FACTURA VENTA» encima del número del albarán: un papel que dice
 * ser una factura sin serlo.
 *
 * Aquí se reconoce ese rótulo y se convierte en un formato con marcador que
 * respeta cómo estaba escrito: lo que acompaña al tipo («VENTA», «Nº», los
 * dos puntos) se queda igual y sólo cambia la palabra del tipo, en las
 * mismas mayúsculas que traía.
 *
 *   «FACTURA VENTA»     → «{doc_tipo} VENTA»          → «ALBARÁN VENTA»
 *   «Nº Factura:»       → «Nº {doc_tipo_nombre}:»     → «Nº Albarán:»
 *   «factura de venta»  → «{doc_tipo_minus} de venta» → «albarán de venta»
 */

/** Las tres formas del tipo que se pueden imprimir, según cómo venía escrito. */
export const CLAVES_TIPO = ['doc_tipo', 'doc_tipo_nombre', 'doc_tipo_minus'] as const;
export type ClaveTipo = (typeof CLAVES_TIPO)[number];

/**
 * La palabra (o palabras) del tipo. Los calificativos que cambian de un
 * tipo a otro («rectificativa», «simplificada», «de entrega») van dentro:
 * también se sustituyen. Los que no («venta», «Nº») se quedan fuera.
 */
const RE_TIPO = /(factura(?:\s+(?:de\s+)?(?:rectificativa|simplificada|proforma|abono))?|albar[aá]n(?:\s+de\s+(?:entrega|reparto))?|nota\s+de\s+entrega|presupuesto|pedido|proforma)/i;

/** Lo único que puede acompañar al tipo en el rótulo. */
const PALABRAS_PERMITIDAS = new Set([
  'de', 'del', 'venta', 'ventas', 'compra', 'compras', 'cliente', 'clientes', 'a',
  'n', 'º', 'nº', 'no', 'num', 'numero', 'nro',
]);

/** Tipos cuyo rótulo puede anunciar el número del documento («Nº Factura:»). */
const RE_TIPO_DE_NUMERO = /^(factura|albar|presupuesto|nota de entrega|proforma)/i;

function sinAcentos(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function palabras(t: string): string[] {
  return sinAcentos(t)
    .toLowerCase()
    .replace(/[^a-z0-9º ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Qué forma usar según cómo estaba escrita la palabra en el PDF. */
export function claveSegunMayusculas(palabra: string): ClaveTipo {
  const letras = palabra.replace(/[^\p{L}]/gu, '');
  if (letras && letras === letras.toLocaleUpperCase('es')) return 'doc_tipo';
  if (letras && letras[0] === letras[0].toLocaleUpperCase('es')) return 'doc_tipo_nombre';
  return 'doc_tipo_minus';
}

export interface RotuloDeTipo {
  /** La forma del tipo que hay que imprimir. */
  clave: ClaveTipo;
  /** El texto con el marcador en lugar del tipo: «{doc_tipo} VENTA». */
  formato: string;
  /** La palabra del tipo tal como estaba («FACTURA»). */
  palabra: string;
}

/**
 * Si `texto` es un rótulo que nombra el tipo de documento, su formato.
 *
 * `comoEtiqueta` es cuando el rótulo acompaña a un valor («Nº Factura:
 * 2026-001»). Entonces sólo vale si anuncia el número del propio documento:
 * en una factura, «Nº Pedido:» suele ser la referencia del pedido del
 * cliente, y cambiarlo por el tipo imprimiría «Nº Factura:» al lado del
 * pedido de otro.
 */
export function rotuloDeTipo(texto: string, comoEtiqueta = false): RotuloDeTipo | null {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  if (!limpio || limpio.length > 48 || /[{}]/.test(limpio)) return null;

  const m = RE_TIPO.exec(limpio);
  if (!m) return null;
  if (comoEtiqueta && !RE_TIPO_DE_NUMERO.test(sinAcentos(m[0]))) return null;

  const resto = limpio.slice(0, m.index) + ' ' + limpio.slice(m.index + m[0].length);
  // Lo de alrededor tiene que ser sólo coletillas («venta», «Nº»): una
  // frase («Total factura», «Datos de la factura») no es un rótulo de tipo.
  if (!palabras(resto).every(p => PALABRAS_PERMITIDAS.has(p))) return null;

  const clave = claveSegunMayusculas(m[0]);
  return {
    clave,
    formato: limpio.slice(0, m.index) + `{${clave}}` + limpio.slice(m.index + m[0].length),
    palabra: m[0],
  };
}

/** El texto de un formato con sus marcadores rellenos (para la vista previa). */
export function aplicarFormato(formato: string, valores: Record<string, string>): string {
  return formato.replace(/\{([a-z0-9_]+)\}/g, (_, clave: string) => valores[clave] ?? '');
}

/**
 * ¿El formato del campo sigue valiendo para su clave? Si el usuario le ha
 * asignado después otra clave en el editor, el formato del tipo ya no
 * pinta nada y se imprime la clave a secas.
 */
export function formatoVigente(campo: { clave: string | null; formato?: string }): string | null {
  if (!campo.clave || !campo.formato) return null;
  return campo.formato.includes(`{${campo.clave}}`) ? campo.formato : null;
}
