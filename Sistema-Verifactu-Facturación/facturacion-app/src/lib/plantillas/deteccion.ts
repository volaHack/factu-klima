/**
 * DETECCIÓN DE LA ESTRUCTURA DE UNA FACTURA
 *
 * Recibe los textos de un PDF ya colocados en milímetros y decide, para cada
 * uno, si es **diseño fijo** (una etiqueta impresa, un rótulo, el pie legal)
 * o un **dato** de esa factura concreta (el número, el nombre del cliente,
 * un importe). Los datos se convierten en campos de la plantilla; el diseño
 * fijo se queda tal cual estaba, formando parte del calco de la página.
 *
 * No hay ninguna IA detrás y es a propósito: el reconocimiento se apoya en
 * tres señales que en una factura española son muy estables —
 *
 *   1. Las etiquetas impresas («Nº factura:», «Vencimiento», «Base
 *      imponible»), que casi siempre acompañan al dato.
 *   2. La forma del propio dato: un NIF, una fecha, un IBAN o un importe en
 *      euros se reconocen solos.
 *   3. Los datos de la empresa que ya están en Ajustes: si un bloque del PDF
 *      contiene el NIF o el nombre del usuario, ese bloque es el emisor y el
 *      otro bloque de dirección es, por descarte, el cliente.
 *
 * Lo que no se consigue clasificar no se inventa: se marca sin asignar y la
 * pantalla de plantillas se lo pregunta al usuario. Es preferible una
 * pregunta a imprimir el nombre del cliente de la factura de muestra en
 * todas las facturas de un cliente real.
 */

import type { CompanySettings } from '../types';
import { COLUMNAS_LINEAS, siguienteColumnaPersonalizada } from './contrato';
import type {
  Alineacion,
  AnalisisPdf,
  AvisoAnalisis,
  CampoDetectado,
  ColumnaDetectada,
  EstiloTabla,
  ItemTexto,
  LineaTexto,
  PaginaExtraida,
  SegmentoTexto,
  TablaDetectada,
} from './tipos';

// ============================================================
// FORMAS RECONOCIBLES
// ============================================================

const RE_IMPORTE = /^[-−]?\s*(?:€|EUR)?\s*\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})?\s*(?:€|EUR)?$/i;
const RE_IMPORTE_INGLES = /^[-−]?\s*(?:€|\$|EUR)?\s*\d{1,3}(?:,\d{3})*(?:\.\d{1,2})\s*(?:€|EUR)?$/i;
const RE_FECHA = /^\d{1,2}[/\-. ]\d{1,2}[/\-. ]\d{2,4}$/;
const RE_FECHA_LARGA = /^\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+\d{4}$/i;
const RE_NIF = /^(?:[A-Z][-\s]?\d{7,8}[-\s]?[A-Z0-9]|\d{8}[-\s]?[A-Z])$/i;
const RE_IBAN = /^[A-Z]{2}\d{2}[\s]?(?:[A-Z0-9]{4}[\s]?){3,7}[A-Z0-9]{0,4}$/i;
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const RE_TELEFONO = /^(?:\+?\d{2,3}[\s.-]?)?(?:\d[\s.-]?){9,13}$/;
const RE_WEB = /^(?:https?:\/\/)?(?:www\.)[^\s]+\.[a-z]{2,}$|^(?:https?:\/\/)[^\s]+$/i;
const RE_CP_CIUDAD = /^\d{5}[\s,-]+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/;
const RE_PORCENTAJE = /^\d{1,3}(?:,\d{1,2})?\s*%$/;
const RE_NUMERO_DOC = /^[A-Z]{0,6}[-/ ]?\d{1,4}[-/]\d{1,6}(?:[-/]\d{1,6})?$|^\d{4,10}$/;
const RE_SOLO_DIGITOS = /^\d+([.,]\d+)?$/;

export function pareceImporte(t: string): boolean {
  const limpio = t.trim();
  if (!limpio || /[a-z]{3,}/i.test(limpio.replace(/eur/i, ''))) return false;
  return RE_IMPORTE.test(limpio) || RE_IMPORTE_INGLES.test(limpio);
}
export function pareceFecha(t: string): boolean {
  return RE_FECHA.test(t.trim()) || RE_FECHA_LARGA.test(t.trim());
}
export function pareceNif(t: string): boolean {
  return RE_NIF.test(t.trim().replace(/\s/g, ''));
}
export function pareceIban(t: string): boolean {
  const limpio = t.trim();
  return RE_IBAN.test(limpio) && limpio.replace(/\s/g, '').length >= 15;
}
export function pareceEmail(t: string): boolean { return RE_EMAIL.test(t.trim()); }
export function pareceTelefono(t: string): boolean {
  const limpio = t.trim();
  const digitos = limpio.replace(/\D/g, '');
  return RE_TELEFONO.test(limpio) && digitos.length >= 9 && digitos.length <= 13;
}
export function pareceWeb(t: string): boolean { return RE_WEB.test(t.trim()); }
export function pareceCpCiudad(t: string): boolean { return RE_CP_CIUDAD.test(t.trim()); }
export function parecePorcentaje(t: string): boolean { return RE_PORCENTAJE.test(t.trim()); }
export function pareceNumeroDocumento(t: string): boolean {
  const limpio = t.trim();
  if (pareceFecha(limpio) || pareceNif(limpio)) return false;
  return RE_NUMERO_DOC.test(limpio) && /\d/.test(limpio);
}

/** ¿Este texto es un dato de esta factura y no una etiqueta del diseño? */
export function pareceDato(t: string): boolean {
  const limpio = t.trim();
  if (limpio.length === 0) return false;
  return (
    pareceImporte(limpio) || pareceFecha(limpio) || pareceNif(limpio) || pareceIban(limpio) ||
    pareceEmail(limpio) || pareceWeb(limpio) || pareceCpCiudad(limpio) ||
    pareceNumeroDocumento(limpio) || RE_SOLO_DIGITOS.test(limpio)
  );
}

function normalizar(t: string): string {
  return t
    .toLowerCase()
    .normalize('NFD')
    // Quita los acentos ya separados por NFD: así «Nº FACTURA» y «n factura»
    // se comparan igual y las reglas no necesitan una variante por tilde.
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9%º ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================
// ETIQUETAS CONOCIDAS
// ============================================================

interface ReglaEtiqueta {
  re: RegExp;
  clave: string;
  /** Cuando dos reglas encajan, gana la de prioridad más alta. */
  prioridad: number;
}

/** Etiquetas impresas que delatan qué dato viene al lado. */
const ETIQUETAS: ReglaEtiqueta[] = [
  { re: /^(n\.?[ºo°]?\.? ?(de )?)?(factura|albaran|documento|presupuesto|ticket)( n\.?[ºo°]?\.?)?$|^factura n|^n[ºo°] ?factura|^numero( de)? (factura|albaran|documento)$|^invoice( no| number)?$/i, clave: 'doc_numero', prioridad: 9 },
  { re: /^(fecha( de( la)?)?( emision( de( la)? factura)?| factura| expedicion| documento)?|f\.? emision|f\.? expedicion|date|issue date|fecha doc\.?)$/i, clave: 'doc_fecha', prioridad: 9 },
  { re: /(vencimiento|vence el?|fecha limite|forma de vencimiento|due date|f\.? vencimiento)/i, clave: 'doc_vencimiento', prioridad: 9 },
  { re: /(fecha de (cobro|pago)|pagada el|cobrada el|f\.? pago)/i, clave: 'doc_fecha_pago', prioridad: 8 },
  { re: /^(forma de (pago|cobro)|metodo de (pago|cobro)|modo de pago|condiciones de pago|medio de pago|payment method|pago)$/i, clave: 'doc_forma_pago', prioridad: 8 },
  { re: /^(serie( del documento| factura)?)$/i, clave: 'doc_serie', prioridad: 7 },
  { re: /^(estado( del documento)?)$/i, clave: 'doc_estado', prioridad: 6 },
  { re: /^(observaciones( de la factura)?|notas|comentarios|nota|condiciones)$/i, clave: 'doc_notas', prioridad: 7 },
  { re: /^(n\.?[ºo°]?\.? ?(de )?pedido|referencia( del)? pedido|su ref(erencia)?|ref\.? cliente|pedido n\.?[ºo°]?\.?|orden de compra|order number|purchase order)$/i, clave: 'custom_1', prioridad: 8 },
  { re: /^(n\.?[ºo°]?\.? ?(de )?bastidor|vin)$/i, clave: 'custom_2', prioridad: 8 },
  { re: /^(vendedor|comercial)$/i, clave: 'custom_3', prioridad: 8 },
  { re: /^(forma de envio|metodo de envio|transportista)$/i, clave: 'custom_4', prioridad: 8 },
  { re: /^(fecha de entrega prevista|entrega estimada)$/i, clave: 'custom_5', prioridad: 8 },

  { re: /^(base imponible|base( neta| iva)?|subtotal|suma|importe bruto|importe a facturar)$/i, clave: 'total_base', prioridad: 9 },
  { re: /^(descuento aplicado|descuento|descuentos|% ?dto|dto|dcto)( total)?$/i, clave: 'total_descuento', prioridad: 8 },
  { re: /^(i ?v ?a|igic|impuestos|total impuestos|cuota|cuota iva|cuota igic|iva repercutido|iva soportado)( \d{1,2}( ?%)?)?$/i, clave: 'total_impuestos', prioridad: 8 },
  { re: /^(total|total factura|total a pagar|total a cobrar|importe total|total documento|total euros|total con iva|a pagar|total general|liquido a percibir|neto a pagar)$/i, clave: 'total_general', prioridad: 9 },

  { re: /^(iban|cuenta|cuenta bancaria|n\.? cuenta|ccc|domiciliacion)$/i, clave: 'empresa_iban', prioridad: 8 },
  { re: /^(banco|entidad)$/i, clave: 'empresa_banco', prioridad: 7 },
];

/**
 * Rótulos que anuncian el bloque del cliente.
 *
 * Tienen que encajar con el texto ENTERO, no con su principio: una empresa
 * que se llame «Cliente Directo S.L.» empieza por «cliente» y no por eso es
 * un rótulo. Confundirlos hace desaparecer el nombre del destinatario.
 */
const RE_ROTULO_CLIENTE = /^(cliente|datos del cliente|datos fiscales del cliente|facturar a|facturado a|destinatario|receptor|razon social del cliente|bill to|customer|a la atencion de|senores)$/;
/** Rótulos que anuncian el bloque del emisor. Mismo criterio de exactitud. */
const RE_ROTULO_EMISOR = /^(emisor|datos del emisor|datos fiscales del emisor|proveedor|expedidor|vendedor|from)$/;

const RE_ETIQUETA_NIF = /^(n\.?i\.?f\.?|c\.?i\.?f\.?|nif ?\/ ?cif|cif ?\/ ?nif|dni|nif cif|documento fiscal|vat)$/;
const RE_ETIQUETA_DIRECCION = /^(direccion|domicilio|calle|address)$/;
const RE_ETIQUETA_TELEFONO = /^(telefono|tlf|tel|movil|phone)$/;
const RE_ETIQUETA_EMAIL = /^(email|e mail|correo|correo electronico|mail)$/;

function buscarEtiqueta(texto: string): ReglaEtiqueta | null {
  const n = normalizar(texto);
  if (!n) return null;
  let mejor: ReglaEtiqueta | null = null;
  for (const regla of ETIQUETAS) {
    if (regla.re.test(n) && (!mejor || regla.prioridad > mejor.prioridad)) mejor = regla;
  }
  return mejor;
}

/** Rótulos de la zona de totales que no tienen campo propio en el contrato. */
const RE_ROTULO_TOTALES = /^(retencion|retenciones|irpf|recargo( de equivalencia)?|re|portes|suplidos|anticipo|entrega a cuenta|forma de pago|vencimientos?)$/;

/**
 * ¿Este texto es un rótulo impreso del diseño y no el dato de nadie?
 *
 * Hace falta porque la búsqueda «etiqueta a la izquierda, valor a la derecha»
 * es ciega: en una plantilla en blanco, a la derecha de «FACTURA Nº:» no hay
 * un número, hay OTRO rótulo («POBLACIÓN DEL CLIENTE:»), y sin este filtro se
 * guardaba como si fuera el número de factura. El resultado era una plantilla
 * que imprimía rótulos en el sitio de los datos.
 */
export function pareceEtiqueta(texto: string): boolean {
  const limpio = texto.trim();
  if (!limpio) return true;
  // Nada que termine en dos puntos es un dato: es lo que los anuncia.
  if (/[:：]\s*$/.test(limpio)) return true;

  const n = normalizar(limpio);
  if (!n) return true;
  return (
    Boolean(buscarEtiqueta(limpio)) ||
    RE_ETIQUETA_NIF.test(n) || RE_ETIQUETA_DIRECCION.test(n) ||
    RE_ETIQUETA_TELEFONO.test(n) || RE_ETIQUETA_EMAIL.test(n) ||
    RE_ROTULO_CLIENTE.test(n) || RE_ROTULO_EMISOR.test(n) ||
    RE_ROTULO_TOTALES.test(n)
  );
}

/**
 * Claves cuyo valor es SIEMPRE numérico: un número de factura, una fecha o un
 * importe llevan cifras. Si lo que se ha encontrado no las lleva, no es el
 * dato — es un rótulo que se ha colado.
 */
const CLAVES_CON_CIFRAS = new Set([
  'doc_numero', 'doc_fecha', 'doc_vencimiento', 'doc_fecha_pago',
  'total_base', 'total_descuento', 'total_impuestos', 'total_general',
  'empresa_nif', 'cliente_nif', 'empresa_cp', 'cliente_cp',
  'empresa_iban', 'empresa_telefono', 'cliente_telefono',
]);

function valorCoherente(clave: string, valor: string): boolean {
  if (!CLAVES_CON_CIFRAS.has(clave)) return true;
  return /\d/.test(valor);
}

// ============================================================
// COLUMNAS DE LA TABLA
// ============================================================

/**
 * Cabeceras de columna reconocidas.
 *
 * Van por PREFIJO y no por coincidencia exacta: en las facturas reales la
 * cabecera casi nunca es la palabra limpia. Es «CÓDIGO SIG», «PRECIO UD.»,
 * «IMPORTE €» o «Cant.», y exigir el texto entero dejaba media tabla sin
 * mapear — que es exactamente lo que hace que luego falten datos al imprimir.
 */
const CABECERAS_COLUMNA: { re: RegExp; clave: string }[] = [
  { re: /^(n|no|num|orden|linea|pos)$/i, clave: 'indice' },
  { re: /^(ref|referencia|codigo|cod|sku|clave|item|articulo|art|prod)\b/i, clave: 'ref' },
  { re: /(descripcion|concepto|detalle|denominacion|description|servicio|producto|articulo)/i, clave: 'descripcion' },
  { re: /^(cantidad|cant|uds|udes|ud|unidades|c dad|qty|n uds|kg|peso|unid|horas|hrs)\b/i, clave: 'cantidad' },
  { re: /^(u ?m|unidad|medida|formato|envase|tipo unidad)\b/i, clave: 'unidad' },
  // `p?recio` no es un capricho: hay PDFs (facturas de Sucamosa, por ejemplo)
  // en los que la «P» de PRECIO no llega en el flujo de texto y pdf.js sólo
  // entrega «RECIO». Sin esta tolerancia la columna de precios se queda sin
  // mapear y las facturas salen sin precio unitario.
  { re: /(p?recio|p unit|p ?u|unitario|pvp|price|importe unitario)/i, clave: 'precio' },
  { re: /^(dto|dcto|desc|descuento|% ?dto|% ?descuento|% ?desc|dtos)\b/i, clave: 'descuento_pct' },
  { re: /^(iva|igic|imp|impuesto|% ?iva|% ?igic|tipo|tax)\b/i, clave: 'impuesto_pct' },
  { re: /^(cuota)\b/i, clave: 'importe_impuesto' },
  { re: /^(importe|subtotal|base|neto|amount|valor)\b/i, clave: 'importe' },
  { re: /^(total)\b/i, clave: 'importe_total' },
];

function claveDeCabecera(texto: string): string | null {
  const n = normalizar(texto);
  if (!n) return null;
  for (const regla of CABECERAS_COLUMNA) {
    if (regla.re.test(n)) return regla.clave;
  }
  return null;
}

/** Palabras que aparecen en la fila de totales, justo debajo de la tabla. */
const RE_FIN_DE_TABLA = /^(total|base imponible|subtotal|suma|totales|total factura|importe total|a pagar|base|iva|igic)\b/;

// ============================================================
// UTILIDADES DE GEOMETRÍA
// ============================================================

function derecha(l: { x: number; ancho: number }): number { return l.x + l.ancho; }
function abajo(l: { y: number; alto: number }): number { return l.y + l.alto; }

function solapeHorizontal(a: { x: number; ancho: number }, b: { x: number; ancho: number }): number {
  const inicio = Math.max(a.x, b.x);
  const fin = Math.min(derecha(a), derecha(b));
  const solape = Math.max(0, fin - inicio);
  return solape / Math.max(1e-6, Math.min(a.ancho, b.ancho));
}

function mediana(valores: number[]): number {
  if (valores.length === 0) return 0;
  const orden = [...valores].sort((a, b) => a - b);
  return orden[Math.floor(orden.length / 2)];
}

/** Cuánto se separan unos valores de su mediana. Cero = todos iguales. */
function dispersion(valores: number[]): number {
  if (valores.length === 0) return Infinity;
  const centro = mediana(valores);
  return valores.reduce((suma, v) => suma + Math.abs(v - centro), 0) / valores.length;
}

/**
 * Deduce la alineación de una columna por el borde que comparten sus celdas.
 *
 * No se mide la distancia al borde de la columna —que es una frontera que nos
 * hemos inventado nosotros a medio camino entre dos cabeceras— sino cuál de
 * los tres bordes de las celdas está más igualado. Unas descripciones de
 * longitudes distintas empiezan todas en la misma x: eso es alineación a la
 * izquierda, sin discusión. Unos importes acaban todos en la misma x: a la
 * derecha. Medir contra la frontera hacía que descripciones largas salieran
 * alineadas a la derecha, que es de las cosas que peor se ven en una factura.
 */
function alineacionDe(
  celdas: { x: number; ancho: number }[],
  porDefecto: Alineacion,
): Alineacion {
  // Con menos de tres celdas no hay muestra suficiente: dos importes del
  // mismo ancho comparten los tres bordes a la vez y cualquier conclusión
  // geométrica sería una moneda al aire.
  if (celdas.length < 3) return porDefecto;

  const izq = dispersion(celdas.map(c => c.x));
  const der = dispersion(celdas.map(c => derecha(c)));
  const centro = dispersion(celdas.map(c => (c.x + derecha(c)) / 2));

  // Sólo se contradice al contenido cuando la geometría es concluyente: un
  // borde tiene que estar claramente más igualado que los otros dos.
  const MARGEN = 0.4;
  if (izq + MARGEN < der && izq + MARGEN < centro) return 'left';
  if (der + MARGEN < izq && der + MARGEN < centro) return 'right';
  if (centro + MARGEN < izq && centro + MARGEN < der) return 'center';
  return porDefecto;
}

/**
 * Alineación que le corresponde a una columna por lo que contiene: los
 * importes y las cantidades a la derecha, los textos a la izquierda. Es el
 * criterio de cualquier factura impresa y sirve de red cuando la geometría
 * del PDF de muestra no dice nada claro.
 */
function alineacionPorContenido(clave: string | null, celdas: { texto: string }[]): Alineacion {
  const conocida = clave ? COLUMNAS_LINEAS.find(c => c.clave === clave) : undefined;
  if (conocida) return conocida.numerica ? 'right' : 'left';

  // Columna sin dato conocido: manda lo que hay escrito en ella.
  const conTexto = celdas.filter(c => c.texto.trim().length > 0);
  if (conTexto.length === 0) return 'left';
  const numericas = conTexto.filter(c => /^[-−+]?[\d.,\s%€]+$/.test(c.texto.trim())).length;
  return numericas >= conTexto.length * 0.7 ? 'right' : 'left';
}

// ============================================================
// DETECCIÓN DE LA TABLA DE LÍNEAS
// ============================================================

interface CandidataCabecera {
  linea: LineaTexto;
  aciertos: number;
  claves: (string | null)[];
}

/**
 * Máxima separación, en milímetros, para considerar que dos trozos de texto
 * son la misma celda de cabecera.
 *
 * Es deliberadamente estrecha. Los segmentos normales agrupan con una holgura
 * de un espacio largo, y eso en una tabla apretada se come las separaciones
 * reales: en las facturas de Sucamosa, «CAJ.», «U/C», «UDES.» y «PRECIO» están
 * a menos de 4,5 mm unas de otras y son cuatro columnas distintas. Aquí sólo
 * se unen los trozos que se tocan, que es el caso de una palabra partida por
 * un cambio de fuente o de interletrado.
 */
const HUECO_CELDA_CABECERA_MM = 0.8;

/**
 * Parte la fila de cabecera en celdas: una por columna.
 *
 * Ni los items sueltos (una palabra partida daría dos columnas) ni los
 * segmentos (fusionan columnas estrechas). El criterio es el contacto.
 */
function celdasDeCabecera(linea: LineaTexto): SegmentoTexto[] {
  const enOrden = [...linea.items].sort((a, b) => a.x - b.x);
  const grupos: ItemTexto[][] = [];

  for (const item of enOrden) {
    const grupo = grupos[grupos.length - 1];
    const ultimo = grupo?.[grupo.length - 1];
    const separacion = ultimo ? item.x - derecha(ultimo) : Infinity;
    if (grupo && separacion <= HUECO_CELDA_CABECERA_MM) grupo.push(item);
    else grupos.push([item]);
  }

  return grupos.map(items => ({
    items,
    texto: items.map(i => i.texto).join('').replace(/\s+/g, ' ').trim(),
    x: Math.min(...items.map(i => i.x)),
    y: Math.min(...items.map(i => i.y)),
    ancho: Math.max(...items.map(i => derecha(i))) - Math.min(...items.map(i => i.x)),
    alto: Math.max(...items.map(i => abajo(i))) - Math.min(...items.map(i => i.y)),
  })).filter(celda => celda.texto.length > 0);
}

function buscarCabeceraTabla(lineas: LineaTexto[], altoPagina: number): CandidataCabecera | null {
  let mejor: CandidataCabecera | null = null;

  for (const linea of lineas) {
    // La cabecera de líneas nunca está en el extremo superior ni en el pie.
    if (linea.y < altoPagina * 0.08 || linea.y > altoPagina * 0.85) continue;
    const celdas = celdasDeCabecera(linea);
    if (celdas.length < 2) continue;

    const claves = celdas.map(c => claveDeCabecera(c.texto));
    const aciertos = new Set(claves.filter(Boolean) as string[]).size;
    // Con dos columnas reconocidas ya no es casualidad; una sola palabra
    // suelta como «Importe» aparece también en la zona de totales.
    if (aciertos < 2) continue;
    if (!mejor || aciertos > mejor.aciertos || (aciertos === mejor.aciertos && linea.y < mejor.linea.y)) {
      mejor = { linea, aciertos, claves };
    }
  }
  return mejor;
}

function construirColumnas(
  cabecera: LineaTexto,
  filas: LineaTexto[],
  izquierdaTabla: number,
  derechaTabla: number,
): ColumnaDetectada[] {
  const titulos = celdasDeCabecera(cabecera);
  const columnas: ColumnaDetectada[] = [];

  // Cada título de cabecera es un ancla. El límite entre dos columnas cae a
  // medio camino entre el final de una cabecera y el principio de la
  // siguiente, que es donde el ojo también pone la separación.
  for (let i = 0; i < titulos.length; i++) {
    const anterior = i === 0 ? null : titulos[i - 1];
    const siguiente = i === titulos.length - 1 ? null : titulos[i + 1];
    const inicio = anterior ? (derecha(anterior) + titulos[i].x) / 2 : Math.min(izquierdaTabla, titulos[i].x);
    const fin = siguiente ? (derecha(titulos[i]) + siguiente.x) / 2 : Math.max(derechaTabla, derecha(titulos[i]));

    // Una celda por fila: todos los items de esa fila cuyo centro cae dentro
    // de la franja de la columna, unidos en una sola caja.
    //
    // Se reparte por items y no por segmentos porque en una tabla apretada el
    // agrupador de segmentos junta la referencia con la descripción —están a
    // menos de 3 mm— y entonces la columna de descripciones «hereda» una caja
    // que empieza en el margen izquierdo de la tabla. Con las fronteras de
    // columna ya calculadas no hace falta ningún umbral: el reparto es exacto.
    const celdas = filas
      .map(f => f.items.filter(it => {
        const centro = (it.x + derecha(it)) / 2;
        return centro >= inicio && centro < fin;
      }))
      .filter(items => items.length > 0)
      .map(items => ({
        x: Math.min(...items.map(it => it.x)),
        ancho: Math.max(...items.map(it => derecha(it))) - Math.min(...items.map(it => it.x)),
        texto: items.map(it => it.texto).join(' ').replace(/\s+/g, ' ').trim(),
      }));

    const clave = claveDeCabecera(titulos[i].texto);
    columnas.push({
      clave,
      cabecera: titulos[i].texto.trim(),
      x: inicio,
      ancho: fin - inicio,
      alineacion: alineacionDe(celdas, alineacionPorContenido(clave, celdas)),
    });
  }

  // Dos columnas no pueden apuntar al mismo dato: si el PDF trae «Importe» y
  // «Total», la segunda pasa a ser el importe con impuestos.
  const usadas = new Set<string>();
  for (const columna of columnas) {
    if (!columna.clave) continue;
    if (usadas.has(columna.clave)) {
      const alternativa = columna.clave === 'importe' ? 'importe_total' : null;
      columna.clave = alternativa && !usadas.has(alternativa) ? alternativa : null;
    }
    if (columna.clave) usadas.add(columna.clave);
  }

  // Una columna con cabecera que no encaja con ningún dato conocido pasa a
  // ser un dato propio de la plantilla («CAJ.», «U/C», «LOTE», «BULTOS»…).
  //
  // Es la diferencia entre una plantilla que imprime la tabla completa y una
  // que deja huecos: así la columna se pide línea a línea al crear la factura
  // en vez de salir en blanco. Si al usuario no le hace falta, la deja vacía
  // desde el editor con un clic.
  for (const columna of columnas) {
    if (columna.clave || !columna.cabecera.trim()) continue;
    columna.clave = siguienteColumnaPersonalizada([...usadas]);
    usadas.add(columna.clave);
  }

  return columnas;
}

interface ResultadoTabla {
  tabla: TablaDetectada;
  lineasConsumidas: Set<LineaTexto>;
}

function detectarTabla(
  pagina: PaginaExtraida,
  muestrear: Muestreador,
  buscarLineas: BuscadorDeLineas | undefined,
  avisos: AvisoAnalisis[],
): ResultadoTabla | null {
  const candidata = buscarCabeceraTabla(pagina.lineas, pagina.alto);
  if (!candidata) {
    avisos.push({
      nivel: 'aviso',
      texto: 'No se ha reconocido la tabla de líneas del PDF. Se ha colocado una tabla con las columnas habituales; muévela o ajústala si no encaja.',
    });
    return null;
  }

  const cabecera = candidata.linea;
  const inicioCuerpo = abajo(cabecera);
  const altoLinea = cabecera.alto || 3;

  const posibles = pagina.lineas
    .filter(l => l.y >= inicioCuerpo - 0.5 && solapeHorizontal(l, cabecera) > 0.05)
    .sort((a, b) => a.y - b.y);

  // Filas: líneas por debajo de la cabecera que sigan compartiendo su franja
  // horizontal, hasta que aparezca la zona de totales o un salto grande. La
  // raya del marco no corta las filas: en PDFs como el de Sucamosa lo único
  // dibujado bajo la cabecera es su separación, y si se usara para cortar, el
  // cuerpo entero desaparecería.
  const filas: LineaTexto[] = [];
  let yAnterior = inicioCuerpo;

  // Rayas horizontales que hay por debajo de la cabecera. Sirven de frontera:
  // una raya seguida de un hueco mayor que una fila normal es el cierre de la
  // tabla, y lo que viene después ya es el bloque de totales. Las rayas que
  // separan fila de fila no cuentan, porque el texto siguiente va pegado.
  const rayas = buscarLineas
    ? buscarLineas(
        cabecera.x,
        derecha(cabecera) - cabecera.x,
        abajo(cabecera),
        Math.max(0, pagina.alto - abajo(cabecera)),
      )
    : [];

  for (const linea of posibles) {
    const hueco = linea.y - yAnterior;
    if (filas.length > 0 && hueco > altoLinea * 3.5) break;

    const cruzaElCierre = filas.length > 0 &&
      hueco > altoLinea * 1.5 &&
      rayas.some(y => y > yAnterior + 0.3 && y < linea.y - 0.3);
    if (cruzaElCierre) break;

    if (RE_FIN_DE_TABLA.test(normalizar(linea.texto)) && linea.items.length <= 3) break;

    // Una fila de la tabla ocupa varias columnas; una nota suelta debajo, no.
    const columnasTocadas = new Set(linea.items.map(i => Math.round(i.x))).size;
    const pareceNota = filas.length > 0 && columnasTocadas === 1 &&
      linea.items.length === 1 && !pareceDato(linea.texto);

    if (pareceNota) {
      // …salvo cuando es la segunda línea de una descripción larga («HARIBO
      // MEGA TORCIDAS REGALIZ 200 / GRS 14 UNDS»): tiene la misma pinta que
      // una nota, pero va pegada a la anterior, más junta de lo que van dos
      // filas seguidas, y cae dentro del ancho de la tabla.
      //
      // Ante la duda se sigue. Meter una línea de más en la tabla sólo tapa
      // un poco más de calco; cortar de menos deja media docena de líneas de
      // la factura de muestra impresas en TODAS las facturas que se emitan,
      // que es el defecto más visible que puede tener una plantilla.
      const pegadaALaAnterior = hueco <= altoLinea * 0.9;
      const dentroDelAncho = linea.x >= cabecera.x - 2 && derecha(linea) <= derecha(cabecera) + 2;
      if (!(pegadaALaAnterior && dentroDelAncho)) break;
    }

    filas.push(linea);
    yAnterior = abajo(linea);
  }

  // Cuando la tabla está dibujada con marco, la raya de abajo dice dónde
  // acaba mejor que cualquier medida de huecos entre textos: por debajo de
  // esa raya ya están los totales, aunque el hueco sea pequeño. Pero el marco
  // solo vale para bajar el cierre: si su raya inferior queda lejos de la
  // última fila —o por encima de ella, como la separación de la cabecera— se
  // descarta y la tabla acaba donde acaban las filas de texto.
  const marco = buscarLineas
    ? buscarMarco(cabecera, derecha(cabecera) - cabecera.x, buscarLineas, pagina.alto)
    : null;
  const ultimaFilaY = filas.length > 0 ? abajo(filas[filas.length - 1]) : inicioCuerpo;
  const marcoUsable = marco && marco.fin >= ultimaFilaY - 2 && marco.fin <= ultimaFilaY + 12 ? marco : null;
  if (marcoUsable) {
    const recortadas = filas.filter(f => f.y < marcoUsable.fin - 0.5);
    filas.length = 0;
    filas.push(...recortadas);
  }

  if (filas.length === 0) {
    avisos.push({
      nivel: 'aviso',
      texto: 'Se ha encontrado la cabecera de la tabla pero ninguna línea de ejemplo debajo. Revisa el ancho de las columnas antes de guardar.',
    });
  }

  const izquierdaTabla = Math.min(cabecera.x, ...filas.map(f => f.x));
  const derechaTabla = Math.max(derecha(cabecera), ...filas.map(f => derecha(f)));
  const columnas = construirColumnas(cabecera, filas, izquierdaTabla, derechaTabla);

  // Alto de fila: la distancia típica entre líneas consecutivas del cuerpo.
  const saltos: number[] = [];
  for (let i = 1; i < filas.length; i++) saltos.push(filas[i].y - filas[i - 1].y);
  const altoFila = saltos.length > 0
    ? Math.max(altoLinea * 1.1, mediana(saltos))
    : altoLinea * 1.6;

  const altoCabecera = Math.max(altoLinea * 1.5, (filas[0]?.y ?? inicioCuerpo + altoLinea * 1.6) - cabecera.y);
  const finCuerpo = filas.length > 0 ? abajo(filas[filas.length - 1]) + altoFila * 0.25 : cabecera.y + altoCabecera + altoFila;

  const estilo = estiloDeTabla(cabecera, filas, muestrear, izquierdaTabla, derechaTabla, altoCabecera);

  const arribaTabla = marcoUsable
    ? marcoUsable.inicio - 0.2
    : cabecera.y - (altoCabecera - (cabecera.alto || altoLinea)) / 2;

  const tabla: TablaDetectada = {
    x: izquierdaTabla,
    ancho: derechaTabla - izquierdaTabla,
    y: arribaTabla,
    altoCabecera,
    altoFila,
    // Con marco, la tabla ocupa exactamente lo que ocupa el marco: así al
    // borrarla no queda ni una esquina suelta del dibujo original.
    altoTotal: marcoUsable ? marcoUsable.fin - arribaTabla + 0.4 : finCuerpo - cabecera.y,
    columnas,
    estilo,
    filasOriginales: filas.length,
  };

  // Si el diseño original llevaba marco, la tabla nueva también lo lleva.
  if (marcoUsable && tabla.estilo.bordeAncho === 0) tabla.estilo.bordeAncho = 0.2;

  return { tabla, lineasConsumidas: new Set<LineaTexto>([cabecera, ...filas]) };
}

// ============================================================
// ESTILO
// ============================================================

/** Devuelve el color de fondo y de tinta de una caja en mm. */
export type Muestreador = (x: number, y: number, ancho: number, alto: number) => { texto: string; fondo: string };

/**
 * Busca las rayas horizontales del marco de la tabla, en milímetros. La
 * proporciona quien tiene el calco a mano; en los tests se omite.
 */
export type BuscadorDeLineas = (
  x: number, ancho: number, y: number, alto: number,
) => number[];

/**
 * Ajusta la caja de la tabla al marco que hay dibujado en el papel.
 *
 * Sin esto la tabla termina donde acaba la última fila de texto, y el marco
 * del PDF original —que casi siempre baja bastante más— sobrevive al borrado
 * en forma de líneas sueltas y esquinas cortadas. Es lo que hace que la
 * factura se vea «parcheada» en vez de nueva.
 */
function buscarMarco(
  cabecera: LineaTexto,
  anchoCabecera: number,
  buscarLineas: BuscadorDeLineas,
  altoPagina: number,
): { inicio: number; fin: number } | null {
  const desde = Math.max(0, cabecera.y - 8);
  const hasta = Math.min(altoPagina, cabecera.y + 140);
  const lineas = buscarLineas(cabecera.x, anchoCabecera, desde, hasta - desde);
  // Un marco son al menos dos rayas: la de arriba y la de abajo.
  if (lineas.length < 2) return null;

  const arriba = lineas.filter(y => y <= cabecera.y + 1);
  const debajo = lineas.filter(y => y > abajo(cabecera));
  if (debajo.length === 0) return null;

  // El cierre es la primera raya del último grupo de rayas juntas: la raya
  // inferior de la tabla, justo donde empieza lo que ya no es tabla (el
  // recuadro de los totales, una firma…). La separación bajo la cabecera y
  // los separadores de fila quedan en grupos anteriores, así que no pueden
  // confundirse con el cierre. Quien llama valida después que este cierre
  // abrace al cuerpo; si cae lejos de la última fila, lo descarta.
  const SALTO_MAXIMO = 26;
  let fin = debajo[0];
  for (const y of debajo.slice(1)) {
    if (y - fin > SALTO_MAXIMO) fin = y;
  }

  const inicio = arriba.length > 0 ? Math.max(...arriba) : cabecera.y;
  if (fin - inicio < 4) return null;
  return { inicio, fin };
}

function estiloDeTabla(
  cabecera: LineaTexto,
  filas: LineaTexto[],
  muestrear: Muestreador,
  izquierda: number,
  derechaTabla: number,
  altoCabecera: number,
): EstiloTabla {
  const anchoTabla = derechaTabla - izquierda;
  const muestraCabecera = muestrear(izquierda, cabecera.y - altoCabecera * 0.15, anchoTabla, altoCabecera);
  const itemCabecera = cabecera.items[0];
  const primeraFila = filas[0]?.items[0];

  // Franja justo debajo de la cabecera: si es de otro color que el fondo de
  // la primera fila, el diseño usa filas alternas.
  const fondoFila1 = filas[0] ? muestrear(izquierda, filas[0].y, anchoTabla, filas[0].alto).fondo : '#ffffff';
  const fondoFila2 = filas[1] ? muestrear(izquierda, filas[1].y, anchoTabla, filas[1].alto).fondo : fondoFila1;

  return {
    cabeceraFondo: muestraCabecera.fondo,
    cabeceraTexto: itemCabecera?.color ?? '#000000',
    cabeceraNegrita: cabecera.items.some(i => i.negrita),
    cuerpoTexto: primeraFila?.color ?? '#000000',
    // El borde se toma del propio color de cabecera cuando hay franja de
    // color, y gris suave cuando la tabla es sólo texto sobre blanco.
    bordeColor: muestraCabecera.fondo !== '#ffffff' ? muestraCabecera.fondo : '#dddddd',
    bordeAncho: 0,
    bordeFilas: 0.1,
    tamanoCabecera: itemCabecera?.tamano ?? 9,
    tamanoCuerpo: primeraFila?.tamano ?? itemCabecera?.tamano ?? 9,
    relleno: [1.2, 1.5, 1.2, 1.5],
    filaAlterna: fondoFila2 !== fondoFila1 ? fondoFila2 : '',
  };
}

// ============================================================
// BLOQUES DE DIRECCIÓN (EMISOR / CLIENTE)
// ============================================================

interface Bloque {
  lineas: SegmentoTexto[];
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

function agruparBloques(lineas: SegmentoTexto[]): Bloque[] {
  const bloques: Bloque[] = [];
  const ordenadas = [...lineas].sort((a, b) => (a.y - b.y) || (a.x - b.x));

  for (const linea of ordenadas) {
    const bloque = bloques.find(b => {
      const ultima = b.lineas[b.lineas.length - 1];
      const hueco = linea.y - abajo(ultima);
      return hueco >= -0.5 && hueco <= Math.max(2.5, ultima.alto * 1.1) && solapeHorizontal(b, linea) > 0.25;
    });
    if (bloque) {
      bloque.lineas.push(linea);
      const der = Math.max(derecha(bloque), derecha(linea));
      bloque.x = Math.min(bloque.x, linea.x);
      bloque.ancho = der - bloque.x;
      bloque.alto = abajo(linea) - bloque.y;
    } else {
      bloques.push({ lineas: [linea], x: linea.x, y: linea.y, ancho: linea.ancho, alto: linea.alto });
    }
  }
  return bloques;
}

function normalizarNif(t: string): string {
  return t.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Puntuación de «esto es un bloque de datos fiscales de alguien». */
function puntuarBloqueDireccion(bloque: Bloque): number {
  let puntos = 0;
  for (const linea of bloque.lineas) {
    const texto = linea.texto;
    if (contieneNif(texto)) puntos += 3;
    if (pareceCpCiudad(texto)) puntos += 2;
    if (/\b(calle|c\/|avda|avenida|plaza|pza|paseo|camino|carretera|ctra|poligono|pol|urb|travesia)\b/i.test(texto)) puntos += 2;
    if (pareceEmail(texto) || pareceTelefono(texto)) puntos += 1;
  }
  return puntos;
}

function contieneNif(texto: string): boolean {
  return texto.split(/[\s:;,]+/).some(t => pareceNif(t));
}

// ============================================================
// DETECCIÓN COMPLETA
// ============================================================

export interface OpcionesDeteccion {
  /** Datos de la empresa: permiten distinguir con certeza emisor de cliente. */
  ajustes?: CompanySettings | null;
  /** Muestrea colores del calco. En los tests se puede omitir. */
  muestrear?: Muestreador;
  /** Busca las rayas del marco de la tabla en el calco. */
  buscarLineas?: BuscadorDeLineas;
}

let contadorId = 0;
function nuevoId(): string {
  contadorId += 1;
  return `c${contadorId}`;
}

export function detectar(pagina: PaginaExtraida, opciones: OpcionesDeteccion = {}): AnalisisPdf {
  contadorId = 0;
  const avisos: AvisoAnalisis[] = [];
  const muestrear: Muestreador = opciones.muestrear ?? (() => ({ texto: '#000000', fondo: '#ffffff' }));

  if (pagina.totalPaginas > 1) {
    avisos.push({
      nivel: 'info',
      texto: `El PDF tiene ${pagina.totalPaginas} páginas. Se usa la primera como diseño; las facturas largas repetirán ese mismo diseño en cada página.`,
    });
  }
  if (pagina.items.length === 0) {
    avisos.push({
      nivel: 'error',
      texto: 'El PDF no tiene texto seleccionable (parece un escaneo). Se conserva el diseño como imagen, pero hay que colocar los campos a mano.',
    });
  }

  // --- 1. Tabla de líneas ---
  const resultadoTabla = detectarTabla(pagina, muestrear, opciones.buscarLineas, avisos);
  const tabla = resultadoTabla?.tabla ?? null;
  const consumidas = resultadoTabla?.lineasConsumidas ?? new Set<LineaTexto>();

  // A partir de aquí se trabaja con segmentos y no con filas completas: dos
  // textos a la misma altura pero en extremos opuestos de la hoja no son la
  // misma frase, y tratarlos como una sola línea mezclaría el domicilio del
  // emisor con la fecha de la factura.
  const fuera = pagina.lineas
    .filter(l => !consumidas.has(l))
    .flatMap(l => l.segmentos);

  const campos: CampoDetectado[] = [];
  const yaAsignadas = new Set<string>();
  const usadas = new Set<SegmentoTexto>();

  const registrar = (campo: CampoDetectado, linea?: SegmentoTexto) => {
    if (campo.clave) {
      if (yaAsignadas.has(campo.clave)) return false;
      yaAsignadas.add(campo.clave);
    }
    campos.push(campo);
    if (linea) usadas.add(linea);
    return true;
  };

  // --- 2. Etiquetas con su valor ---
  //
  // Tres colocaciones, que son las tres que se usan en las facturas reales:
  //   «Fecha: 12/01/2026»      → todo junto, separado por dos puntos
  //   «Fecha:    12/01/2026»   → etiqueta y valor separados, misma altura
  //   «FECHA» / «12/01/2026»   → etiqueta encima del dato, en una caja
  const filasFuera = pagina.lineas.filter(l => !consumidas.has(l));

  // a) Etiqueta y valor dentro del mismo trozo de texto.
  for (const segmento of fuera) {
    if (usadas.has(segmento)) continue;
    const pareja = separarEtiquetaYValor(segmento);
    if (!pareja) continue;
    const regla = buscarEtiqueta(pareja.etiqueta);
    if (!regla) continue;
    const valor = pareja.valorItems.map(i => i.texto).join(' ').trim();
    if (!valorCoherente(regla.clave, valor)) continue;
    registrar(
      campoDesde(pareja.valorItems, regla.clave, 0.95, `Estaba junto a la etiqueta «${pareja.etiqueta.trim()}»`, pareja.etiqueta),
      segmento,
    );
  }

  // b) Etiqueta sola y valor a su derecha, a la misma altura.
  //
  // «A su derecha» tiene que ser de verdad al lado: en una factura, a la
  // misma altura que «Fecha:» y en el otro extremo de la hoja puede haber el
  // domicilio del cliente, que no tiene nada que ver.
  const HUECO_MAXIMO_MM = 55;
  for (const fila of filasFuera) {
    for (let i = 0; i < fila.segmentos.length - 1; i++) {
      const etiqueta = fila.segmentos[i];
      const valor = fila.segmentos[i + 1];
      if (usadas.has(etiqueta) || usadas.has(valor)) continue;
      if (valor.x - derecha(etiqueta) > HUECO_MAXIMO_MM) continue;
      const regla = buscarEtiqueta(etiqueta.texto.replace(/[:\s]+$/, ''));
      if (!regla || yaAsignadas.has(regla.clave)) continue;
      // El texto de al lado no puede ser a su vez otro rótulo: en
      // «Base imponible | IVA | Total» no hay ningún dato, son tres títulos.
      if (pareceEtiqueta(valor.texto)) continue;
      if (!valorCoherente(regla.clave, valor.texto)) continue;
      registrar(
        campoDesde(valor.items, regla.clave, 0.9, `Estaba a la derecha de «${etiqueta.texto.trim()}»`, etiqueta.texto),
        valor,
      );
      usadas.add(etiqueta);
    }
  }

  // c) Etiqueta encima y dato debajo (cajas de cabecera).
  for (const segmento of fuera) {
    if (usadas.has(segmento)) continue;
    const regla = buscarEtiqueta(segmento.texto);
    if (!regla || yaAsignadas.has(regla.clave)) continue;
    const debajo = fuera.find(otro =>
      !usadas.has(otro) && otro !== segmento &&
      otro.y > segmento.y && otro.y - abajo(segmento) <= Math.max(3, segmento.alto * 1.4) &&
      solapeHorizontal(segmento, otro) > 0.35,
    );
    if (!debajo) continue;
    if (pareceEtiqueta(debajo.texto)) continue;
    if (!valorCoherente(regla.clave, debajo.texto)) continue;
    registrar(
      campoDesde(debajo.items, regla.clave, 0.85, `Estaba debajo de la etiqueta «${segmento.texto.trim()}»`, segmento.texto),
      debajo,
    );
    usadas.add(segmento);
  }

  // --- 3. Bloques de emisor y cliente ---
  detectarBloques(fuera, usadas, opciones.ajustes ?? null, registrar, avisos);

  // --- 4. Datos sueltos sin etiqueta ---
  for (const linea of fuera) {
    if (usadas.has(linea)) continue;
    const texto = linea.texto.trim();
    if (!pareceDato(texto)) continue;

    let clave: string | null = null;
    let motivo = 'Tiene forma de dato, pero no se ha podido saber cuál';
    let confianza = 0.35;

    if (pareceIban(texto) && !yaAsignadas.has('empresa_iban')) {
      clave = 'empresa_iban'; motivo = 'Tiene forma de IBAN'; confianza = 0.9;
    } else if (pareceEmail(texto) && !yaAsignadas.has('empresa_email')) {
      clave = 'empresa_email'; motivo = 'Tiene forma de correo electrónico'; confianza = 0.7;
    } else if (pareceWeb(texto) && !yaAsignadas.has('empresa_web')) {
      clave = 'empresa_web'; motivo = 'Tiene forma de página web'; confianza = 0.7;
    } else if (pareceFecha(texto) && !yaAsignadas.has('doc_fecha')) {
      clave = 'doc_fecha'; motivo = 'Es la primera fecha del documento'; confianza = 0.55;
    } else if (pareceNumeroDocumento(texto) && !yaAsignadas.has('doc_numero') && linea.y < pagina.alto * 0.35) {
      clave = 'doc_numero'; motivo = 'Tiene forma de número de documento y está en la cabecera'; confianza = 0.5;
    }

    registrar(campoDesde(linea.items, clave, confianza, motivo, ''), linea);
  }

  // --- 5. Comprobaciones finales ---
  if (!yaAsignadas.has('doc_numero')) {
    avisos.push({ nivel: 'aviso', texto: 'No se ha localizado el número de factura. Asígnalo antes de guardar o saldrá en blanco.' });
  }
  if (!yaAsignadas.has('cliente_nombre')) {
    avisos.push({ nivel: 'aviso', texto: 'No se ha localizado el nombre del cliente. Asígnalo para que cada factura salga a nombre de su destinatario.' });
  }
  if (!yaAsignadas.has('total_general')) {
    avisos.push({ nivel: 'aviso', texto: 'No se ha localizado el total del documento. Revísalo antes de guardar.' });
  }

  return { pagina, campos, tabla, avisos, zonasExtra: [], familia: familiaDominante(pagina.items) };
}

function familiaDominante(items: ItemTexto[]): 'sans' | 'serif' {
  let serif = 0, sans = 0;
  for (const item of items) {
    const peso = item.texto.trim().length;
    if (item.serif) serif += peso; else sans += peso;
  }
  return serif > sans ? 'serif' : 'sans';
}

// ============================================================
// PIEZAS DE APOYO
// ============================================================

interface ParejaEtiquetaValor {
  etiqueta: string;
  valorItems: ItemTexto[];
}

/**
 * Parte una línea del tipo «Nº factura: 2026/001» en etiqueta y valor. El
 * valor se devuelve como items para conservar su posición exacta; cuando los
 * dos puntos están dentro de un mismo item se estima la parte proporcional,
 * que es suficiente para colocar la caja del campo.
 */
export function separarEtiquetaYValor(linea: SegmentoTexto): ParejaEtiquetaValor | null {
  const indiceDosPuntos = linea.items.findIndex(i => i.texto.includes(':'));
  if (indiceDosPuntos === -1) return null;

  const item = linea.items[indiceDosPuntos];
  const posicion = item.texto.indexOf(':');
  const restoDelItem = item.texto.slice(posicion + 1).trim();
  const etiqueta = linea.items
    .slice(0, indiceDosPuntos)
    .map(i => i.texto)
    .concat(item.texto.slice(0, posicion))
    .join(' ');

  const posteriores = linea.items.slice(indiceDosPuntos + 1);
  const valorItems: ItemTexto[] = [];

  if (restoDelItem) {
    const proporcion = (posicion + 1) / Math.max(1, item.texto.length);
    valorItems.push({
      ...item,
      texto: restoDelItem,
      x: item.x + item.ancho * proporcion,
      ancho: item.ancho * (1 - proporcion),
    });
  }
  valorItems.push(...posteriores);

  if (valorItems.length === 0 || valorItems.every(i => i.texto.trim() === '')) return null;
  return { etiqueta: etiqueta.trim(), valorItems };
}

function campoDesde(
  items: ItemTexto[],
  clave: string | null,
  confianza: number,
  motivo: string,
  etiquetaCercana: string,
  fijo = false,
): CampoDetectado {
  const x = Math.min(...items.map(i => i.x));
  const y = Math.min(...items.map(i => i.y));
  const der = Math.max(...items.map(i => derecha(i)));
  const aba = Math.max(...items.map(i => abajo(i)));
  const principal = items.reduce((a, b) => (b.texto.length > a.texto.length ? b : a), items[0]);

  const alturas = items.map(i => i.y);
  const distintas = [...new Set(alturas.map(a => Math.round(a * 2)))].length;
  const interlineado = distintas > 1 ? Math.max(1, (aba - y) / distintas / (principal.alto || 1)) : 1.15;

  return {
    id: nuevoId(),
    clave,
    tipo: 'texto',
    fijo,
    valorOriginal: items.map(i => i.texto).join(' ').replace(/\s+/g, ' ').trim(),
    etiquetaCercana: etiquetaCercana.replace(/[:\s]+$/, ''),
    x,
    y,
    ancho: Math.max(der - x, 2),
    alto: Math.max(aba - y, 2),
    tamano: principal.tamano,
    alineacion: 'left',
    color: principal.color,
    negrita: principal.negrita,
    cursiva: principal.cursiva,
    serif: principal.serif,
    interlineado,
    confianza,
    motivo,
  };
}

type Registrador = (campo: CampoDetectado, linea?: SegmentoTexto) => boolean;

/**
 * Reparte los bloques de dirección entre emisor y cliente y asigna cada
 * línea del bloque (nombre, NIF, calle, población…) a su campo.
 */
function detectarBloques(
  lineas: SegmentoTexto[],
  usadas: Set<SegmentoTexto>,
  ajustes: CompanySettings | null,
  registrar: Registrador,
  avisos: AvisoAnalisis[],
): void {
  const disponibles = lineas.filter(l => !usadas.has(l));
  const bloques = agruparBloques(disponibles).filter(b => puntuarBloqueDireccion(b) >= 3);
  if (bloques.length === 0) return;

  const nifPropio = ajustes?.nif ? normalizarNif(ajustes.nif) : '';
  const nombresPropios = [ajustes?.businessName, ajustes?.tradeName]
    .filter((n): n is string => Boolean(n && n.trim().length > 2))
    .map(n => normalizar(n));

  const esDelEmisor = (bloque: Bloque): boolean => {
    for (const linea of bloque.lineas) {
      if (nifPropio && normalizarNif(linea.texto).includes(nifPropio)) return true;
      const n = normalizar(linea.texto);
      if (nombresPropios.some(propio => n.includes(propio) || propio.includes(n))) return true;
    }
    return false;
  };

  // Un rótulo «Cliente:» o «Facturar a:» inmediatamente encima de un bloque
  // lo identifica sin lugar a dudas.
  const rotuladoComo = (bloque: Bloque): 'cliente' | 'emisor' | null => {
    const encima = lineas.find(l =>
      l.y < bloque.y && bloque.y - abajo(l) <= Math.max(4, bloque.lineas[0].alto * 2) &&
      solapeHorizontal({ x: bloque.x, ancho: bloque.ancho }, l) > 0.15,
    );
    const primera = normalizar(bloque.lineas[0].texto);
    for (const texto of [encima ? normalizar(encima.texto) : '', primera]) {
      if (!texto) continue;
      if (RE_ROTULO_CLIENTE.test(texto)) return 'cliente';
      if (RE_ROTULO_EMISOR.test(texto)) return 'emisor';
    }
    return null;
  };

  let emisor: Bloque | null = null;
  let cliente: Bloque | null = null;
  const restantes: Bloque[] = [];

  for (const bloque of bloques) {
    const rotulo = rotuladoComo(bloque);
    if (!emisor && (esDelEmisor(bloque) || rotulo === 'emisor')) emisor = bloque;
    else if (!cliente && rotulo === 'cliente') cliente = bloque;
    else restantes.push(bloque);
  }

  // De lo que quede sin identificar, primero el de más datos fiscales.
  restantes.sort((a, b) => puntuarBloqueDireccion(b) - puntuarBloqueDireccion(a));

  if (!cliente && !emisor && restantes.length > 0) {
    // Sin nada con lo que comparar sólo queda la convención: en cualquier
    // factura el membrete de quien la emite va arriba y el destinatario,
    // debajo. Se avisa, porque es lo único que aquí no es seguro.
    const porAltura = [...restantes].sort((a, b) => a.y - b.y);
    emisor = porAltura[0];
    cliente = porAltura[1] ?? null;
    avisos.push({
      nivel: 'aviso',
      texto: 'No se ha podido confirmar cuál es el bloque de tu empresa y cuál el del cliente. Compruébalo en la lista de campos antes de guardar.',
    });
  } else {
    if (!cliente) {
      // El cliente es el bloque que queda que no esté por encima del emisor.
      const candidatos = emisor ? restantes.filter(b => b.y > emisor!.y) : restantes;
      cliente = candidatos[0] ?? restantes[0] ?? null;
    }
    if (!emisor) {
      const candidatos = restantes.filter(b => b !== cliente);
      emisor = candidatos.sort((a, b) => a.y - b.y)[0] ?? null;
    }
  }

  if (emisor) asignarBloque(emisor, 'empresa', registrar, esDelEmisor(emisor) ? 0.9 : 0.6);
  if (cliente) asignarBloque(cliente, 'cliente', registrar, 0.75);
}

function asignarBloque(
  bloque: Bloque,
  prefijo: 'empresa' | 'cliente',
  registrar: Registrador,
  confianza: number,
): void {
  const quien = prefijo === 'empresa' ? 'tu empresa' : 'el cliente';
  const pendientes: SegmentoTexto[] = [];

  for (const linea of bloque.lineas) {
    const texto = linea.texto.trim();
    // Un rótulo como «FACTURAR A:» encabeza el bloque pero no es un dato:
    // si se colara, el nombre del cliente acabaría en el campo de dirección
    // y en su sitio saldría impreso el rótulo.
    const soloRotulo = normalizar(texto);
    if (RE_ROTULO_CLIENTE.test(soloRotulo) || RE_ROTULO_EMISOR.test(soloRotulo)) {
      if (!separarEtiquetaYValor(linea)) continue;
    }

    const pareja = separarEtiquetaYValor(linea);
    const etiqueta = pareja ? normalizar(pareja.etiqueta) : '';
    const items = pareja ? pareja.valorItems : linea.items;
    const valor = pareja ? pareja.valorItems.map(i => i.texto).join(' ').trim() : texto;

    if (RE_ETIQUETA_NIF.test(etiqueta) || contieneNif(valor)) {
      registrar(campoDesde(items, `${prefijo}_nif`, confianza, `NIF de ${quien}`, pareja?.etiqueta ?? ''), linea);
      continue;
    }
    if (pareceEmail(valor) || RE_ETIQUETA_EMAIL.test(etiqueta)) {
      registrar(campoDesde(items, `${prefijo}_email`, confianza * 0.9, `Correo de ${quien}`, pareja?.etiqueta ?? ''), linea);
      continue;
    }
    if (pareceTelefono(valor) || RE_ETIQUETA_TELEFONO.test(etiqueta)) {
      registrar(campoDesde(items, `${prefijo}_telefono`, confianza * 0.9, `Teléfono de ${quien}`, pareja?.etiqueta ?? ''), linea);
      continue;
    }
    if (pareceCpCiudad(valor)) {
      registrar(campoDesde(items, `${prefijo}_poblacion`, confianza * 0.95, `Población de ${quien}`, pareja?.etiqueta ?? ''), linea);
      continue;
    }
    if (RE_ETIQUETA_DIRECCION.test(etiqueta) || /\b(calle|c\/|avda|avenida|plaza|pza|paseo|camino|carretera|ctra|poligono|urb|travesia)\b/i.test(valor)) {
      registrar(campoDesde(items, `${prefijo}_direccion`, confianza * 0.95, `Dirección de ${quien}`, pareja?.etiqueta ?? ''), linea);
      continue;
    }
    if (prefijo === 'empresa' && pareceIban(valor)) {
      registrar(campoDesde(items, 'empresa_iban', confianza, 'Cuenta bancaria', pareja?.etiqueta ?? ''), linea);
      continue;
    }
    pendientes.push(linea);
  }

  // Lo que queda sin forma reconocible: la primera línea es el nombre y el
  // resto, dirección. Es el orden de cualquier membrete.
  if (pendientes.length > 0) {
    const nombre = pendientes.shift()!;
    registrar(campoDesde(nombre.items, `${prefijo}_nombre`, confianza, `Nombre de ${quien}`, ''), nombre);
  }
  for (const resto of pendientes) {
    registrar(campoDesde(resto.items, `${prefijo}_direccion`, confianza * 0.8, `Dirección de ${quien}`, ''), resto);
  }
}

/**
 * Columnas por defecto cuando no se reconoce ninguna tabla en el PDF.
 * `x` y `anchoTotal` van en milímetros, igual que todo lo demás.
 */
export function columnasPorDefecto(x: number, anchoTotal: number): ColumnaDetectada[] {
  const elegidas = ['descripcion', 'cantidad', 'precio', 'impuesto_pct', 'importe'];
  const proporciones = [0.46, 0.11, 0.15, 0.1, 0.18];
  let cursor = x;
  return elegidas.map((clave, i) => {
    const columna = COLUMNAS_LINEAS.find(c => c.clave === clave)!;
    const ancho = anchoTotal * proporciones[i];
    const item: ColumnaDetectada = {
      clave,
      cabecera: columna.cabeceraSugerida,
      x: cursor,
      ancho,
      alineacion: columna.numerica ? 'right' : 'left',
    };
    cursor += ancho;
    return item;
  });
}
