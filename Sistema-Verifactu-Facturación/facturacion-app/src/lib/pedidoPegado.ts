/**
 * UN PEDIDO PEGADO DE WHATSAPP (O DE UN CORREO) PASADO A LÍNEAS
 *
 * Los pedidos de un distribuidor llegan así, escritos a la carrera:
 *
 *     10 cajas aceite
 *     5 queso curado
 *     agua 1,5 x 20
 *     2 cj vino tinto
 *
 * y alguien los vuelve a teclear uno a uno en el albarán. Aquí se lee cada
 * renglón —cuántos, si son cajas o unidades, y qué artículo— y se busca el
 * artículo con el mismo buscador de las líneas (buscarProductos.ts), con
 * prioridad para lo que suele pedir ese cliente: si el bar siempre pide el
 * aceite de 5 l, «aceite» es ese y no los otros seis.
 *
 * Cada renglón sale en uno de tres estados, que se enseñan antes de añadir
 * nada:
 *   · reconocido: un artículo claro;
 *   · dudoso: varios que encajan igual de bien (o uno que encaja a medias),
 *     con dos o tres para elegir;
 *   · no encontrado.
 * Los saludos, las despedidas y el «para mañana» no son renglones de pedido
 * y se apartan solos.
 *
 * LAS CANTIDADES
 *   «10 cajas», «2 cj», «3 pack», «1 bulto» son cajas: se multiplican por las
 *   unidades por caja de la ficha (`unitsPerPackage`). «6 uds», «6 botellas»
 *   son unidades. Un número solo («5 queso») son unidades, salvo que ese
 *   cliente pida ese artículo por cajas: entonces son cajas, y se dice.
 *   Los números que forman parte del artículo («agua 1,5», «33 cl») no son
 *   la cantidad: la cantidad va delante, o detrás con «x», «:» o «-».
 */

import type { InvoiceLineItem, Product } from './types';
import { plano, puntuacion } from './buscarProductos';
import { recalcularLinea } from './documentos';

export type EstadoRenglon = 'reconocido' | 'dudoso' | 'no-encontrado';

/** Un renglón leído, antes de buscar el artículo. */
export interface RenglonLeido {
  /** Tal como venía, para enseñarlo al lado. */
  original: string;
  /** Lo que se busca en los artículos. */
  texto: string;
  /** null = no dice cuántos. */
  cantidad: number | null;
  /** true = cajas, false = unidades, null = no lo dice. */
  enCajas: boolean | null;
}

export interface Candidato {
  productId: string;
  nombre: string;
  ref: string;
  unitsPerPackage?: number;
  puntos: number;
  /** Lo pide este cliente a menudo. */
  habitual: boolean;
}

export interface RenglonPedido extends RenglonLeido {
  estado: EstadoRenglon;
  /** Hasta tres, el mejor primero. */
  candidatos: Candidato[];
  /** El que se añadirá: el primero, salvo que se elija otro. */
  elegido: string | null;
  /** Las cantidades ya resueltas para el elegido. */
  cajasFinal: boolean;
  cantidadFinal: number;
  /** Una explicación corta cuando se ha supuesto algo. */
  nota?: string;
}

export interface PedidoLeido {
  renglones: RenglonPedido[];
  /** Lo apartado por no ser parte del pedido («Hola Pepe», «Gracias!»). */
  apartados: string[];
}

/** Lo que se sabe de lo que pide el cliente (de pedidoHabitual.ts), el más pedido primero. */
export interface HabitualParaPedido {
  productId: string;
  ultimasCajas?: number | null;
}

const NUMEROS_ESCRITOS: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, quince: 15, veinte: 20, veinticinco: 25, treinta: 30, cuarenta: 40, cincuenta: 50, cien: 100,
  media: 0.5, medio: 0.5,
};

const PALABRAS_CAJA = 'cajas?|cjas?|cjs?|cja|cj|cxs?|packs?|pack|paquetes?|paq|pqts?|pq|bultos?|fardos?';
const PALABRAS_UNIDAD = 'unidades|unidad|unids?|uds?|u|botellas?|bot|latas?|botes?|piezas?|pzs?|bolsas?|sacos?|kilos?|kgs?|kg|docenas?';
const RE_CAJA = new RegExp(`^(?:${PALABRAS_CAJA})$`);
const RE_UNIDAD = new RegExp(`^(?:${PALABRAS_UNIDAD})$`);
/** Lo que, pegado a un número, es parte del artículo y no la cantidad. */
const MEDIDAS = /^(?:l|lt|lts|litros?|cl|ml|cc|g|gr|grs|gramos?|cm|mm|m|w|%|º|°)$/;

const NUMERO = String.raw`\d+(?:[.,]\d+)?`;
const ESCRITO = Object.keys(NUMEROS_ESCRITOS).join('|');

const SALUDOS = /^(hola|buen[oa]s?|buenos dias|buenas tardes|gracias|muchas gracias|mil gracias|saludos|un saludo|un abrazo|besos|atentamente|ok|vale|perfecto|por favor|porfa|pedido|el pedido|mi pedido|te paso|os paso|para (manana|hoy|el|la)|cuando puedas|feliz)\b/;

const VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'con', 'para', 'por', 'al', 'a', 'en', 'x', 'mas', 'tambien', 'porfa']);

function aNumero(t: string): number {
  const p = plano(t);
  if (p in NUMEROS_ESCRITOS) return NUMEROS_ESCRITOS[p];
  return Number(p.replace(',', '.'));
}

/** Quita el prefijo de un WhatsApp copiado («[30/10/26, 9:15] Pepe: …» o «30/10/26 9:15 - Pepe: …»). */
function sinPrefijoDeChat(l: string): string {
  return l
    .replace(/^\[\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\]\s*[^:]{1,40}:\s*/, '')
    .replace(/^\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}\s*-\s*[^:]{1,40}:\s*/, '');
}

/**
 * Un renglón por artículo. Se parte por saltos de línea, por «;», por
 * comas que no sean decimales («agua 1,5» no se parte) y por « y » cuando
 * detrás viene otra cantidad («10 aceite y 5 queso»).
 */
export function partirPedido(texto: string): string[] {
  return texto
    .replace(/\r/g, '')
    .split('\n')
    .map(sinPrefijoDeChat)
    .flatMap(l => l.split(/;|(?<!\d),|,(?!\d)|\s\+\s/))
    .flatMap(l => l.split(new RegExp(`\\s+(?:y|e)\\s+(?=(?:${NUMERO}|${ESCRITO})\\s)`, 'i')))
    .map(l => l.replace(/^\s*(?:[-–—•*·>]+|\d+[.)](?=\s+(?:\d|[a-záéíóú])))\s*/i, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** Lo que se busca: sin signos sueltos ni palabras vacías («de», «la»…). */
function textoParaBuscar(t: string): string {
  return t
    .replace(/[¿?¡!()"«»]/g, ' ')
    .replace(/^[\s:.\-–]+|[\s:.\-–]+$/g, '')
    .split(/\s+/)
    .filter(p => p && !VACIAS.has(plano(p)))
    .join(' ')
    .trim();
}

/**
 * Lee un renglón: cuántos, de qué y lo que queda para buscar. null si no
 * es un renglón de pedido (un saludo, una despedida, un número suelto).
 */
export function leerRenglon(linea: string): RenglonLeido | null {
  const original = linea.trim();
  const p = plano(original);
  if (!p) return null;
  if (SALUDOS.test(p) && !/\d/.test(p)) return null;
  if (/^[^a-z0-9ñ]*$/.test(p)) return null;

  let cantidad: number | null = null;
  let enCajas: boolean | null = null;
  let resto = original;
  const docena = (u: string) => /^docenas?$/.test(plano(u));

  // Delante: «10 cajas de aceite», «2x vino», «una caja de agua», «media docena huevos».
  const delante = resto.match(new RegExp(`^(${NUMERO}(?![\\d.,])|(?:${ESCRITO})(?=\\s))\\s*(?:x\\s*|×\\s*)?([a-zñ]+\\.?)?(?=\\s|$)\\s*(.*)$`, 'i'));
  if (delante) {
    const unidad = (delante[2] ?? '').replace(/\.$/, '').toLowerCase();
    if (unidad && MEDIDAS.test(plano(unidad))) {
      // «33 cl coca cola»: el número es del artículo.
    } else if (unidad && RE_CAJA.test(plano(unidad))) {
      cantidad = aNumero(delante[1]);
      enCajas = true;
      resto = delante[3];
    } else if (unidad && RE_UNIDAD.test(plano(unidad))) {
      cantidad = aNumero(delante[1]) * (docena(unidad) ? 12 : 1);
      enCajas = false;
      resto = delante[3];
    } else {
      // «5 queso curado», «un queso»: el número, y lo demás es el artículo.
      // Un número escrito solo cuenta seguido de espacio: «uvas» no es «u».
      cantidad = aNumero(delante[1]);
      resto = `${delante[2] ?? ''} ${delante[3]}`.trim();
    }
  }

  // Detrás: «agua 1,5 x 20», «aceite: 3 cajas», «queso - 2», «vino (6)», «aceite 3 cj».
  if (cantidad === null) {
    const detras = resto.match(new RegExp(`^(.*?)\\s*(?:[x×*]\\s*|[:=\\-–]\\s*|\\(\\s*|\\s)(${NUMERO})\\s*([a-zñ]+\\.?)?\\s*\\)?\\s*[.!]*$`, 'i'));
    if (detras && detras[1].trim()) {
      const unidad = (detras[3] ?? '').replace(/\.$/, '').toLowerCase();
      const conSigno = /[x×*:=\-–(]\s*\d[\d.,]*\s*[a-zñ.]*\s*\)?\s*[.!]*$/i.test(resto);
      const decimal = /[.,]/.test(detras[2]);
      if (unidad && MEDIDAS.test(plano(unidad))) {
        // «agua 1,5 l»: es la medida del artículo, no cuántos.
      } else if (unidad && RE_CAJA.test(plano(unidad))) {
        cantidad = aNumero(detras[2]);
        enCajas = true;
        resto = detras[1];
      } else if (unidad && RE_UNIDAD.test(plano(unidad))) {
        cantidad = aNumero(detras[2]) * (docena(unidad) ? 12 : 1);
        enCajas = false;
        resto = detras[1];
      } else if (!unidad && (conSigno || !decimal)) {
        // Un número suelto al final solo si es entero o va con «x», «:»…:
        // «agua 1,5» es el agua de litro y medio, no litro y medio de agua.
        cantidad = aNumero(detras[2]);
        resto = detras[1];
      }
    }
  }

  const texto = textoParaBuscar(resto);
  if (!texto || !/[a-zñ]/i.test(plano(texto))) return null;
  if (cantidad !== null && !(cantidad > 0)) cantidad = null;
  return { original, texto, cantidad, enCajas };
}

/** Todas las formas de buscar un texto: tal cual, con la coma o el punto del decimal cambiados y en singular. */
function variantes(texto: string): string[] {
  const base = plano(texto);
  const singular = base.split(/\s+/).map(p => (p.length > 3 && /[^s]s$/.test(p) ? p.replace(/(?<=[^aeiou])es$|s$/, '') : p)).join(' ');
  return [...new Set([base, base.replace(/(\d),(\d)/g, '$1.$2'), base.replace(/(\d)\.(\d)/g, '$1,$2'), singular])];
}

interface Indexado {
  p: Product;
  todo: string;
  palabras: string[];
}

/** Cada artículo con su texto ya pasado a minúsculas y sin tildes: se busca muchas veces. */
function indexar(productos: readonly Product[]): Indexado[] {
  return productos
    .filter(p => p.active !== false)
    .map(p => {
      const todo = plano(`${p.ref ?? ''} ${p.name ?? ''} ${p.supplierRef ?? ''} ${p.barcode ?? ''} ${p.category ?? ''} ${p.description ?? ''}`);
      return { p, todo, palabras: plano(`${p.name ?? ''} ${p.ref ?? ''}`).split(/[^a-z0-9ñ.,]+/).filter(Boolean) };
    });
}

/** Una palabra del pedido casa con una del artículo: igual, empieza igual o difiere en una letra. */
function casaPalabra(q: string, w: string): boolean {
  if (q === w) return true;
  if (q.length >= 3 && w.startsWith(q)) return true;
  if (w.length >= 4 && q.startsWith(w)) return true;
  if (q.length >= 5 && Math.abs(q.length - w.length) <= 1) {
    // Una errata: «acite» por «aceite».
    let i = 0;
    let j = 0;
    let fallos = 0;
    while (i < q.length && j < w.length) {
      if (q[i] === w[j]) { i++; j++; continue; }
      if (++fallos > 1) return false;
      if (q.length > w.length) i++;
      else if (w.length > q.length) j++;
      else { i++; j++; }
    }
    return fallos + (q.length - i) + (w.length - j) <= 1;
  }
  return false;
}

/** Puntos de un artículo para un texto: los del buscador y, si no casa del todo, a medias. */
function puntosDe(ix: Indexado, consultas: string[]): { puntos: number; seguro: boolean } {
  let mejor = 0;
  for (const c of consultas) {
    const palabras = c.split(/\s+/);
    // El mismo filtro que el buscador, pero sobre el texto ya preparado.
    if (!palabras.every(w => ix.todo.includes(w))) continue;
    mejor = Math.max(mejor, puntuacion(ix.p, c));
  }
  if (mejor > 0) return { puntos: mejor, seguro: true };

  // A medias: la mitad o más de las palabras con sustancia casan.
  const q = (consultas[consultas.length - 1] ?? '').split(/\s+/).filter(w => w.length >= 3 || /\d/.test(w));
  if (!q.length) return { puntos: 0, seguro: false };
  const casan = q.filter(w => ix.palabras.some(x => casaPalabra(w, x)));
  const parte = casan.length / q.length;
  if (parte < 0.5 || !casan.some(w => w.length >= 4)) return { puntos: 0, seguro: false };
  return { puntos: Math.round(25 * parte), seguro: false };
}

/** Diferencia de puntos a partir de la cual el primero es «el» artículo. */
const VENTAJA_CLARA = 25;
/** Lo que suma ser de lo que suele pedir: más cuanto más lo pide. */
const PUNTOS_HABITUAL = 40;

/** Los artículos que encajan con un texto, el mejor primero (hasta `max`). */
export function candidatosPara(
  texto: string,
  productos: readonly Product[],
  habituales: readonly HabitualParaPedido[] = [],
  max = 3,
): { candidatos: Candidato[]; seguro: boolean; claro: boolean } {
  return candidatosIndexados(texto, indexar(productos), habituales, max);
}

function candidatosIndexados(
  texto: string,
  indice: readonly Indexado[],
  habituales: readonly HabitualParaPedido[],
  max: number,
): { candidatos: Candidato[]; seguro: boolean; claro: boolean } {
  const consultas = variantes(texto);
  const orden = new Map(habituales.map((h, i) => [h.productId, i]));
  const todos = indice
    .map(ix => {
      const { puntos, seguro } = puntosDe(ix, consultas);
      if (!puntos) return null;
      const i = orden.get(ix.p.id);
      const extra = i === undefined ? 0 : PUNTOS_HABITUAL - Math.min(i, 20);
      return { ix, puntos: puntos + extra, seguro, habitual: i !== undefined };
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => b.puntos - a.puntos || a.ix.p.name.localeCompare(b.ix.p.name, 'es', { sensitivity: 'base' }));

  const candidatos = todos.slice(0, max).map(({ ix, puntos, habitual }) => ({
    productId: ix.p.id,
    nombre: ix.p.name,
    ref: ix.p.ref,
    ...(ix.p.unitsPerPackage ? { unitsPerPackage: ix.p.unitsPerPackage } : {}),
    puntos,
    habitual,
  }));
  const [primero, segundo] = todos;
  const seguro = !!primero?.seguro;
  const claro = seguro && (!segundo || primero.puntos - segundo.puntos >= VENTAJA_CLARA);
  return { candidatos, seguro, claro };
}

/**
 * Las cantidades de un renglón para un artículo: si son cajas, cuántas, y
 * cuántas unidades salen. Sin unidades por caja no se pueden contar cajas,
 * y entonces son unidades.
 */
export function cantidadesPara(
  renglon: Pick<RenglonLeido, 'cantidad' | 'enCajas'>,
  candidato: Pick<Candidato, 'productId' | 'unitsPerPackage'> | undefined,
  habituales: readonly HabitualParaPedido[] = [],
): { cajas: boolean; cantidad: number; nota?: string } {
  const n = renglon.cantidad ?? 1;
  const uc = candidato?.unitsPerPackage && candidato.unitsPerPackage > 0 ? candidato.unitsPerPackage : 0;
  const notaSinCantidad = renglon.cantidad === null ? 'No dice cuántos: se pone 1.' : undefined;
  if (renglon.enCajas === true) {
    if (uc) return { cajas: true, cantidad: n, nota: notaSinCantidad };
    return { cajas: false, cantidad: n, nota: 'Ese artículo no tiene unidades por caja en su ficha: van como unidades.' };
  }
  if (renglon.enCajas === null && uc && candidato) {
    const h = habituales.find(x => x.productId === candidato.productId);
    if (h && (h.ultimasCajas ?? 0) > 0) {
      return { cajas: true, cantidad: n, nota: notaSinCantidad ?? 'Lo suele pedir por cajas: se ponen cajas.' };
    }
  }
  return { cajas: false, cantidad: n, nota: notaSinCantidad };
}

/** Lee el pedido entero y busca cada artículo. */
export function leerPedido(
  texto: string,
  productos: readonly Product[],
  habituales: readonly HabitualParaPedido[] = [],
): PedidoLeido {
  const indice = indexar(productos);
  const renglones: RenglonPedido[] = [];
  const apartados: string[] = [];

  for (const linea of partirPedido(texto)) {
    const leido = leerRenglon(linea);
    if (!leido) {
      apartados.push(linea);
      continue;
    }
    const { candidatos, claro } = candidatosIndexados(leido.texto, indice, habituales, 3);
    // Sin cantidad y sin nada que se le parezca: será una frase del mensaje.
    if (!candidatos.length && leido.cantidad === null) {
      apartados.push(linea);
      continue;
    }
    const estado: EstadoRenglon = !candidatos.length ? 'no-encontrado' : claro ? 'reconocido' : 'dudoso';
    const elegido = candidatos[0]?.productId ?? null;
    const c = cantidadesPara(leido, candidatos[0], habituales);
    renglones.push({
      ...leido,
      estado,
      candidatos: estado === 'reconocido' ? candidatos.slice(0, 1) : candidatos,
      elegido,
      cajasFinal: c.cajas,
      cantidadFinal: c.cantidad,
      ...(c.nota ? { nota: c.nota } : {}),
    });
  }
  return { renglones, apartados };
}

/**
 * Cambia el artículo elegido de un renglón dudoso, y con él las cantidades
 * (el otro puede no tener unidades por caja).
 */
export function elegirCandidato(r: RenglonPedido, productId: string, habituales: readonly HabitualParaPedido[] = []): RenglonPedido {
  const cand = r.candidatos.find(x => x.productId === productId);
  if (!cand) return r;
  const c = cantidadesPara(r, cand, habituales);
  const siguiente: RenglonPedido = { ...r, elegido: productId, cajasFinal: c.cajas, cantidadFinal: c.cantidad, nota: c.nota };
  if (!siguiente.nota) delete siguiente.nota;
  return siguiente;
}

/** Cajas o unidades, a mano desde la vista previa (solo si el artículo tiene unidades por caja). */
export function conCajasElegidas(r: RenglonPedido, cajas: boolean): RenglonPedido {
  const cand = r.candidatos.find(x => x.productId === r.elegido);
  if (cajas && !(cand?.unitsPerPackage && cand.unitsPerPackage > 0)) return r;
  return { ...r, cajasFinal: cajas };
}

/** Lo que se añadirá, dicho corto: «10 cajas × 12 = 120 uds.» o «5 uds.». */
export function textoCantidad(r: Pick<RenglonPedido, 'cajasFinal' | 'cantidadFinal' | 'candidatos' | 'elegido'>): string {
  const n = (x: number) => x.toLocaleString('es-ES', { maximumFractionDigits: 3 });
  const uc = r.candidatos.find(c => c.productId === r.elegido)?.unitsPerPackage ?? 0;
  if (r.cajasFinal && uc) {
    const cajas = `${n(r.cantidadFinal)} ${r.cantidadFinal === 1 ? 'caja' : 'cajas'}`;
    return `${cajas} × ${n(uc)} = ${n(Math.round(r.cantidadFinal * uc * 1000) / 1000)} uds.`;
  }
  return `${n(r.cantidadFinal)} ${r.cantidadFinal === 1 ? 'ud.' : 'uds.'}`;
}

export interface Condiciones {
  unitPrice: number;
  descuentos: readonly number[];
  taxRate: number;
}

/**
 * La línea de un renglón, como si se hubiera elegido el artículo a mano:
 * el precio y los descuentos que tocan hoy a este cliente (`condiciones`),
 * y las cantidades del renglón. `porCajas` es si el oficio lleva casilla de
 * cajas (ver cajas.ts): sin ella, las cajas se pasan a unidades.
 */
export function lineaDeRenglon(
  r: Pick<RenglonPedido, 'cajasFinal' | 'cantidadFinal'>,
  producto: Product,
  base: InvoiceLineItem,
  condiciones: (p: Product) => Condiciones,
  porCajas: boolean,
): InvoiceLineItem {
  const c = condiciones(producto);
  const uc = producto.unitsPerPackage && producto.unitsPerPackage > 0 ? producto.unitsPerPackage : 0;
  const cajas = r.cajasFinal && uc ? r.cantidadFinal : 0;
  const unidades = cajas ? Math.round(cajas * uc * 1000) / 1000 : r.cantidadFinal;
  return recalcularLinea({
    ...base,
    productId: producto.id,
    productName: producto.name,
    productRef: producto.ref,
    unit: producto.unit,
    unitsPerPackage: producto.unitsPerPackage,
    quantity: unidades,
    ...(porCajas ? { cajas } : {}),
    unitPrice: c.unitPrice,
    taxRate: c.taxRate,
    discountPercent: c.descuentos[0] || 0,
    discountPercent2: c.descuentos[1] || 0,
    discountPercent3: c.descuentos[2] || 0,
    loteId: undefined,
    loteCodigo: undefined,
  });
}
