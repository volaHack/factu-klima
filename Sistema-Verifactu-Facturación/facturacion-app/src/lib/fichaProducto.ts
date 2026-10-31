/**
 * LA FICHA DE PRODUCTO QUE SE RELLENA SOLA
 *
 * Al dar de alta un artículo casi todo lo dice ya su nombre o lo dicen los
 * artículos que se le parecen: «Agua Fuente 6x1,5L» va en cajas de seis,
 * es de la misma familia que las otras aguas, lleva su mismo impuesto y,
 * con el coste delante, se vende con el margen de siempre en esa familia.
 *
 * Aquí sólo se PROPONE. Cada sugerencia se acepta con un toque y ninguna se
 * pone sola: lo que se ha escrito a mano no se pisa nunca, y de un campo ya
 * tocado ni siquiera se sugiere nada (la pantalla dice cuáles se tocaron).
 */

import type { Product } from './types';
import { costeDe } from './documentos';

/** Sin tildes, en minúsculas y con los espacios en su sitio. */
export function plano(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

const MEDIDA = '(?:ml|cl|dl|l|lt|lts|litros?|g|gr|grs|kg|kilos?|cc|oz)';
const NUM = '\\d+(?:[.,]\\d+)?';

/** Más de esto no es una caja: es un número de lote, un año o un peso. */
const MAX_UDS_CAJA = 500;

const valido = (n: number) => (Number.isInteger(n) && n > 1 && n <= MAX_UDS_CAJA ? n : null);

/**
 * Las unidades por caja que dice el nombre, o null si no dice ninguna.
 *
 *   «6x1,5L», «24 x 33cl»   → 6, 24 (el primer número, el segundo es la medida)
 *   «caja 6», «pack de 12»  → 6, 12
 *   «c/24», «x24», «24 uds» → 24
 *
 * Lo que va pegado a una medida («1,5L», «500 g») nunca cuenta como cajas.
 */
export function unidadesPorCaja(nombre: string): number | null {
  const t = plano(nombre);
  // 6x1,5l: unidades × medida de cada una.
  const porMedida = t.match(new RegExp(`(?:^|[^\\d.,])(\\d+)\\s*[x×*]\\s*${NUM}\\s*${MEDIDA}\\b`));
  if (porMedida) return valido(Number(porMedida[1]));
  const envase = t.match(/\b(?:caja|cajas|pack|paquete|bandeja|fardo|estuche|blister|lote|bolsa|saco)\s*(?:de\s*)?(\d+)\b(?!\s*[.,]\d)/);
  if (envase && !new RegExp(`^\\s*${MEDIDA}\\b`).test(t.slice((envase.index ?? 0) + envase[0].length))) {
    return valido(Number(envase[1]));
  }
  const barra = t.match(/\bc\/\s*(\d+)\b/);
  if (barra) return valido(Number(barra[1]));
  // x24 suelto, que no sea «x1,5l».
  const equis = t.match(new RegExp(`(?:^|\\s)[x×]\\s*(\\d+)\\b(?![.,]\\d)(?!\\s*${MEDIDA}\\b)`));
  if (equis) return valido(Number(equis[1]));
  // 24x al final o antes de un espacio: «24x lata».
  const equisDetras = t.match(/(?:^|\s)(\d+)\s*[x×](?:\s|$)/);
  if (equisDetras) return valido(Number(equisDetras[1]));
  const uds = t.match(/\b(\d+)\s*(?:uds?|unidades|u)\b\.?/);
  if (uds) return valido(Number(uds[1]));
  return null;
}

/** Palabras que no dicen nada de qué es el artículo. */
const VACIAS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'con', 'sin', 'para', 'por', 'en', 'y', 'al',
  'caja', 'cajas', 'pack', 'paquete', 'bandeja', 'fardo', 'estuche', 'blister', 'lote', 'bolsa', 'saco',
  'uds', 'ud', 'unidades', 'unidad', 'litro', 'litros', 'kilo', 'kilos', 'lata', 'botella', 'brik', 'tarro', 'bote',
  'ml', 'cl', 'dl', 'lt', 'lts', 'gr', 'grs', 'kg', 'cc', 'oz',
]);

/** Las palabras que cuentan de un nombre: sin números, medidas ni relleno. */
export function palabrasClave(nombre: string): string[] {
  return [...new Set(
    plano(nombre)
      .replace(/[^a-z0-9ñ\s]/g, ' ')
      .split(' ')
      .filter(p => p.length >= 3 && !/\d/.test(p) && !VACIAS.has(p)),
  )];
}

export interface SugerenciaCategoria {
  categoria: string;
  /** El artículo más parecido de esa familia, para decir por qué. */
  ejemplo: string;
}

/**
 * La familia de los artículos de nombre parecido.
 *
 * Cada artículo que comparte palabras con el nuevo vota por su familia con
 * tantas palabras como comparte; la primera palabra («Agua», «Aceite»)
 * cuenta doble, que es la que dice qué es. Gana la familia con más votos,
 * y hace falta al menos una palabra en común.
 */
export function categoriaParecida(nombre: string, productos: readonly Pick<Product, 'id' | 'name' | 'category'>[], excluirId?: string): SugerenciaCategoria | null {
  const mias = palabrasClave(nombre);
  if (!mias.length) return null;
  const votos = new Map<string, { puntos: number; mejor: number; ejemplo: string }>();
  for (const p of productos) {
    if (p.id === excluirId || !p.category) continue;
    const suyas = palabrasClave(p.name);
    let puntos = 0;
    for (const [i, palabra] of mias.entries()) {
      if (suyas.includes(palabra)) puntos += i === 0 ? 2 : 1;
    }
    if (!puntos) continue;
    const v = votos.get(p.category) ?? { puntos: 0, mejor: 0, ejemplo: p.name };
    v.puntos += puntos;
    if (puntos > v.mejor) { v.mejor = puntos; v.ejemplo = p.name; }
    votos.set(p.category, v);
  }
  const ganadora = [...votos.entries()].sort((a, b) => b[1].puntos - a[1].puntos || b[1].mejor - a[1].mejor)[0];
  return ganadora ? { categoria: ganadora[0], ejemplo: ganadora[1].ejemplo } : null;
}

/** El impuesto que más se repite en una familia, o null si la familia está vacía. */
export function impuestoHabitual(categoria: string, productos: readonly Pick<Product, 'category' | 'defaultTaxRate' | 'active'>[]): number | null {
  const veces = new Map<number, number>();
  for (const p of productos) {
    if (p.category !== categoria || p.active === false || !Number.isFinite(p.defaultTaxRate)) continue;
    veces.set(p.defaultTaxRate, (veces.get(p.defaultTaxRate) ?? 0) + 1);
  }
  const mas = [...veces.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
  return mas ? mas[0] : null;
}

function mediana(valores: number[]): number {
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/**
 * El margen de siempre en una familia, sobre el precio de venta (0,25 = 25 %).
 *
 * Es la mediana, no la media: un artículo de reclamo vendido a coste no
 * debe arrastrar el precio de todos los nuevos. Hacen falta al menos dos
 * artículos con coste y precio; con uno solo, eso no es una costumbre.
 */
export function margenHabitual(categoria: string, productos: readonly Product[]): number | null {
  const margenes: number[] = [];
  for (const p of productos) {
    if (p.category !== categoria || p.active === false || !(p.unitPrice > 0)) continue;
    const coste = costeDe(p);
    if (!(coste > 0) || coste >= p.unitPrice) continue;
    margenes.push((p.unitPrice - coste) / p.unitPrice);
  }
  return margenes.length >= 2 ? mediana(margenes) : null;
}

/** El precio que deja ese margen sobre la venta, con dos decimales. */
export function precioConMargen(coste: number, margen: number): number {
  if (!(coste > 0) || !(margen >= 0) || margen >= 1) return 0;
  return Math.round((coste / (1 - margen)) * 100) / 100;
}

export type CampoSugerido = 'unitsPerPackage' | 'category' | 'defaultTaxRate' | 'unitPrice';

export interface SugerenciaFicha {
  campo: CampoSugerido;
  valor: number | string;
  /** Qué se propone, para el botón. */
  texto: string;
  /** Por qué, en pocas palabras. */
  motivo: string;
}

export interface FichaEnCurso {
  name: string;
  category: string;
  defaultTaxRate: number;
  unitPrice: number;
  unitsPerPackage: string | number;
  /** El coste que se ha escrito: precio de compra o, si no, el medio. */
  coste: number;
}

const pct = (n: number) => `${(Math.round(n * 1000) / 10).toLocaleString('es-ES')} %`;
const euros = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

/**
 * Lo que se propone para la ficha que se está escribiendo.
 *
 * No sale nada de un campo tocado a mano ni lo que ya coincide con lo que
 * hay. El precio y el impuesto se calculan con la familia que tenga la
 * ficha en ese momento o, si no se ha elegido a mano, con la propuesta:
 * así las cuatro sugerencias cuadran entre sí.
 */
export function sugerenciasFicha(
  ficha: FichaEnCurso,
  productos: readonly Product[],
  opciones: { tocados?: ReadonlySet<CampoSugerido>; nombreCategoria?: (id: string) => string; excluirId?: string } = {},
): SugerenciaFicha[] {
  const { tocados = new Set<CampoSugerido>(), nombreCategoria = (id: string) => id, excluirId } = opciones;
  const salida: SugerenciaFicha[] = [];
  if (!ficha.name.trim()) return salida;

  const uc = unidadesPorCaja(ficha.name);
  if (uc && !tocados.has('unitsPerPackage') && Number(ficha.unitsPerPackage) !== uc) {
    salida.push({ campo: 'unitsPerPackage', valor: uc, texto: `${uc} por caja`, motivo: 'lo dice el nombre' });
  }

  const parecida = categoriaParecida(ficha.name, productos, excluirId);
  let categoria = ficha.category;
  if (parecida && !tocados.has('category')) {
    categoria = parecida.categoria;
    if (parecida.categoria !== ficha.category) {
      salida.push({ campo: 'category', valor: parecida.categoria, texto: nombreCategoria(parecida.categoria), motivo: `como «${parecida.ejemplo}»` });
    }
  }

  const otros = productos.filter(p => p.id !== excluirId);
  const impuesto = impuestoHabitual(categoria, otros);
  if (impuesto !== null && !tocados.has('defaultTaxRate') && impuesto !== Number(ficha.defaultTaxRate)) {
    salida.push({ campo: 'defaultTaxRate', valor: impuesto, texto: `${impuesto} %`, motivo: `el de ${nombreCategoria(categoria)}` });
  }

  const margen = margenHabitual(categoria, otros);
  if (margen !== null && ficha.coste > 0 && !tocados.has('unitPrice')) {
    const precio = precioConMargen(ficha.coste, margen);
    if (precio > 0 && Math.abs(precio - Number(ficha.unitPrice)) >= 0.005) {
      salida.push({ campo: 'unitPrice', valor: precio, texto: euros(precio), motivo: `margen de ${pct(margen)} en ${nombreCategoria(categoria)}` });
    }
  }
  return salida;
}
