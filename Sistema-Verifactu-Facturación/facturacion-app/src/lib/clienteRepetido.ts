/**
 * «YA TIENES A BAR PEPE S.L.»: EL AVISO DE FICHA REPETIDA
 *
 * Con prisa, en el mostrador, se da de alta otra vez a quien ya estaba:
 * «BAR PEPE SL» cuando existía «Bar Pepe, S.L.», o «Restaurante Pepe»
 * con el mismo NIF. Luego sus facturas quedan repartidas en dos fichas,
 * la deuda no se ve entera y el 347 sale mal. Antes de crear la ficha se
 * mira si ya hay una con el mismo NIF o con un nombre muy parecido.
 *
 * Para comparar nombres se quita lo que no los distingue:
 *   · mayúsculas, tildes, puntos y comas;
 *   · la forma jurídica («S.L.», «SL», «S.L.U.», «Sociedad Limitada»…);
 *   · el tipo de local («Bar», «Restaurante», «Cafetería», «Bar-Restaurante»…),
 *     que se escribe o no según el día;
 *   · artículos y «de», y abreviaturas como «Hnos.» por «Hermanos».
 * Lo que queda se compara por palabras y, para las erratas, por pares de
 * letras (coeficiente de Dice). Es un aviso, no un bloqueo: hay dos «Bar
 * Pepe» de verdad, y para eso está «Crear igualmente».
 */

import { normalizarNif } from './validation/identidad';

export interface FichaComparable {
  id: string;
  nif?: string | null;
  businessName?: string | null;
  tradeName?: string | null;
}

export interface FichaParecida<T extends FichaComparable = FichaComparable> {
  ficha: T;
  motivo: 'nif' | 'nombre';
  /** De 0 a 1: 1 es el mismo NIF o el mismo nombre una vez limpio. */
  parecido: number;
}

/** A partir de aquí, dos nombres se avisan como «muy parecidos». */
export const UMBRAL_PARECIDO = 0.8;

const FORMAS_JURIDICAS = [
  'sociedad limitada unipersonal', 'sociedad limitada laboral', 'sociedad limitada', 'sociedad anonima',
  'sociedad cooperativa', 'sociedad civil', 'comunidad de bienes',
  'slu', 'sll', 'slp', 'slne', 'sl', 'sau', 'sal', 'sa', 'scp', 'sc', 'cb', 'scoop', 'coop',
];

/** El tipo de local, que unas veces se escribe y otras no. */
const TIPOS_DE_LOCAL = new Set([
  'bar', 'restaurante', 'rest', 'cafeteria', 'cafe', 'cafebar', 'cerveceria', 'taberna', 'tasca',
  'bodegon', 'meson', 'asador', 'pizzeria', 'guachinche', 'kiosco', 'kiosko', 'snack', 'terraza',
  'supermercado', 'super', 'autoservicio', 'minimercado', 'restauracion',
]);

const VACIAS = new Set(['el', 'la', 'los', 'las', 'de', 'del', 'y', 'e', 'and', 'the']);

const ABREVIATURAS: Record<string, string> = {
  hnos: 'hermanos', hno: 'hermanos', hmnos: 'hermanos',
  dist: 'distribuciones', distrib: 'distribuciones', distribucion: 'distribuciones',
  com: 'comercial', cia: 'compania', ctro: 'centro', alim: 'alimentacion',
};

const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * El nombre reducido a lo que lo distingue: «BAR-RESTAURANTE PEPE, S.L.»
 * y «Bar Pepe SL» quedan los dos en «pepe».
 */
export function nombreParaComparar(nombre: string | null | undefined): string {
  let t = sinTildes(nombre ?? '')
    // «S.L.», «S. L. U.» → «sl», «slu»: los puntos entre letras sueltas fuera.
    .replace(/\b([a-z])\s*\.\s*(?=[a-z]\b\.?)/g, '$1')
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim();
  // La forma jurídica, al final o escrita entera.
  for (const f of FORMAS_JURIDICAS) {
    t = t.replace(new RegExp(`(^|\\s)${f}(?=\\s|$)`, 'g'), ' ');
  }
  const palabras = t.split(/\s+/)
    .filter(Boolean)
    .map(p => ABREVIATURAS[p] ?? p)
    // «supermercados dino» y «supermercado dino»: el plural no distingue.
    .map(p => (p.length > 4 && p.endsWith('s') && !p.endsWith('ss') ? p.slice(0, -1) : p))
    .filter(p => !VACIAS.has(p) && !TIPOS_DE_LOCAL.has(p));
  return palabras.join(' ');
}

function pares(t: string): Map<string, number> {
  const s = t.replace(/\s+/g, '');
  const m = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const par = s.slice(i, i + 2);
    m.set(par, (m.get(par) ?? 0) + 1);
  }
  return m;
}

/** Coeficiente de Dice sobre pares de letras: aguanta erratas y letras cambiadas. */
export function parecidoDeLetras(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const pa = pares(a);
  const pb = pares(b);
  let comunes = 0;
  let total = 0;
  for (const n of pa.values()) total += n;
  for (const n of pb.values()) total += n;
  for (const [par, n] of pa) comunes += Math.min(n, pb.get(par) ?? 0);
  return total ? (2 * comunes) / total : 0;
}

/**
 * Lo que se parecen dos nombres, de 0 a 1, ya limpios.
 *
 * Si todas las palabras del corto están en el largo («pepe» y «pepe
 * hermanos»), cuenta mucho, pero solo con palabras con sustancia: «sol»
 * dentro de «hotel sol playa» no basta para avisar.
 */
export function parecidoDeNombres(a: string | null | undefined, b: string | null | undefined): number {
  const na = nombreParaComparar(a);
  const nb = nombreParaComparar(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const letras = parecidoDeLetras(na, nb);
  const [corto, largo] = na.split(' ').length <= nb.split(' ').length ? [na, nb] : [nb, na];
  const delCorto = corto.split(' ');
  const delLargo = new Set(largo.split(' '));
  const dentro = delCorto.every(p => delLargo.has(p));
  const sustancia = delCorto.join('').length >= 5;
  const porPalabras = dentro && sustancia ? 0.85 + 0.1 * (delCorto.length / delLargo.size) : 0;
  return Math.min(1, Math.max(letras, porPalabras));
}

/**
 * Las fichas que ya existen y se parecen a la que se va a crear: primero
 * las del mismo NIF y después las de nombre más parecido. `excluirId` es
 * la ficha que se está editando, que no se avisa de sí misma.
 */
export function fichasParecidas<T extends FichaComparable>(
  nueva: { nif?: string | null; nombre?: string | null; nombreComercial?: string | null },
  existentes: readonly T[],
  opts: { excluirId?: string; umbral?: number; max?: number } = {},
): FichaParecida<T>[] {
  const umbral = opts.umbral ?? UMBRAL_PARECIDO;
  const nif = normalizarNif(nueva.nif).replace(/^ES(?=[A-Z0-9]{9}$)/, '');
  const nombres = [nueva.nombre, nueva.nombreComercial].filter((n): n is string => !!n?.trim());
  const res: FichaParecida<T>[] = [];

  for (const f of existentes) {
    if (f.id === opts.excluirId) continue;
    const suNif = normalizarNif(f.nif).replace(/^ES(?=[A-Z0-9]{9}$)/, '');
    if (nif.length >= 8 && suNif === nif) {
      res.push({ ficha: f, motivo: 'nif', parecido: 1 });
      continue;
    }
    let mejor = 0;
    for (const n of nombres) {
      for (const suyo of [f.businessName, f.tradeName]) mejor = Math.max(mejor, parecidoDeNombres(n, suyo));
    }
    if (mejor >= umbral) res.push({ ficha: f, motivo: 'nombre', parecido: mejor });
  }

  return res
    .sort((a, b) => Number(b.motivo === 'nif') - Number(a.motivo === 'nif') || b.parecido - a.parecido)
    .slice(0, opts.max ?? 3);
}

/** «Bar Pepe S.L. (B35…)»: cómo se nombra la ficha en el aviso, sin enseñar el NIF entero. */
export function nombreEnAviso(f: FichaComparable): string {
  const nombre = (f.businessName || f.tradeName || 'Ficha sin nombre').trim();
  const nif = normalizarNif(f.nif);
  return nif ? `${nombre} (${nif.slice(0, 3)}…)` : nombre;
}
