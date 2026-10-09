/**
 * CÓMO SE PRESENTA UN DATO EN EL PAPEL
 *
 * Lo que en Crystal Reports es «Dar formato al campo»: el mismo dato de la
 * factura puede salir de varias maneras según el impreso. La fecha
 * «05/10/2026» en un talonario y «5 de octubre de 2026» en un presupuesto;
 * un importe con su «€» en el pie y sin él dentro de un recuadro que ya lo
 * lleva impreso; el nombre del cliente en mayúsculas porque así venía la
 * plantilla de la imprenta.
 *
 * El dato llega ya escrito (`datos.ts` lo deja como texto en español). Aquí
 * no se vuelve a la factura: se reconoce qué clase de dato es por su forma
 * —una fecha dd/mm/aaaa, un importe con coma decimal— y se rehace. Así
 * funciona igual para las claves de serie que para las columnas propias
 * que cada empresa se inventa.
 *
 * Todo es puro y sin estado: se prueba solo y se aplica al imprimir.
 */

export type Letras = 'tal' | 'mayusculas' | 'minusculas' | 'titulo';

export type FormatoFecha =
  | 'dd/mm/aaaa'
  | 'dd-mm-aaaa'
  | 'dd.mm.aaaa'
  | 'dd/mm/aa'
  | 'd de mmmm de aaaa'
  | 'd mmm aaaa'
  | 'mmmm de aaaa'
  | 'aaaa-mm-dd';

export type Simbolo = 'tal' | 'euro' | 'eur' | 'sin';

export interface Presentacion {
  /** Mayúsculas, minúsculas o cada palabra con su inicial. */
  letras?: Letras;
  /** Texto delante del dato («Tel. »). Sólo se imprime si hay dato. */
  prefijo?: string;
  /** Texto detrás del dato. Sólo se imprime si hay dato. */
  sufijo?: string;
  /** Cómo escribir una fecha. */
  fecha?: FormatoFecha;
  /** Decimales de un importe o número. */
  decimales?: number;
  /** Qué símbolo de moneda lleva un importe. */
  simbolo?: Simbolo;
  /** Punto de miles. */
  miles?: boolean;
  /** Negativos entre paréntesis, como en contabilidad: (12,50 €). */
  negativoParentesis?: boolean;
  /** Si el dato viene vacío, imprimir esto en su lugar («—», «Contado»). */
  siVacio?: string;
  /** Un importe a cero no se imprime (el recargo, la retención…). */
  ocultarSiCero?: boolean;
}

export const FORMATOS_FECHA: { valor: FormatoFecha; ejemplo: string }[] = [
  { valor: 'dd/mm/aaaa', ejemplo: '05/10/2026' },
  { valor: 'dd-mm-aaaa', ejemplo: '05-10-2026' },
  { valor: 'dd.mm.aaaa', ejemplo: '05.10.2026' },
  { valor: 'dd/mm/aa', ejemplo: '05/10/26' },
  { valor: 'd de mmmm de aaaa', ejemplo: '5 de octubre de 2026' },
  { valor: 'd mmm aaaa', ejemplo: '5 oct. 2026' },
  { valor: 'mmmm de aaaa', ejemplo: 'octubre de 2026' },
  { valor: 'aaaa-mm-dd', ejemplo: '2026-10-05' },
];

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTOS = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sept.', 'oct.', 'nov.', 'dic.'];

// ------------------------------------------------------------------
// Reconocer el dato
// ------------------------------------------------------------------

export type ClaseDato = 'fecha' | 'importe' | 'numero' | 'texto' | 'vacio';

const RE_FECHA = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;
const RE_FECHA_ISO = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/;
/** «1.234,56 €», «-12,50€», «1234,5», «12 €». Ni porcentajes ni teléfonos. */
const RE_IMPORTE = /^(-?)\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?\s*(€|EUR)?$/;

export interface Fecha { dia: number; mes: number; anio: number }

export function leerFecha(valor: string): Fecha | null {
  const t = valor.trim();
  let m = RE_FECHA.exec(t);
  if (m) {
    const f = { dia: Number(m[1]), mes: Number(m[2]), anio: Number(m[3]) };
    return fechaValida(f) ? f : null;
  }
  m = RE_FECHA_ISO.exec(t);
  if (m) {
    const f = { dia: Number(m[3]), mes: Number(m[2]), anio: Number(m[1]) };
    return fechaValida(f) ? f : null;
  }
  return null;
}

function fechaValida({ dia, mes, anio }: Fecha): boolean {
  if (mes < 1 || mes > 12 || dia < 1) return false;
  return dia <= new Date(anio, mes, 0).getDate();
}

export interface Importe { valor: number; moneda: boolean; decimales: number }

export function leerImporte(valor: string): Importe | null {
  const t = valor.replace(/ /g, ' ').trim();
  const m = RE_IMPORTE.exec(t);
  if (!m) return null;
  const entero = m[2].replace(/\./g, '');
  const decimales = m[3] ?? '';
  const numero = Number(`${entero}.${decimales || '0'}`);
  if (!Number.isFinite(numero)) return null;
  return { valor: m[1] ? -numero : numero, moneda: Boolean(m[4]), decimales: decimales.length };
}

export function claseDe(valor: string): ClaseDato {
  if (!valor.trim()) return 'vacio';
  if (leerFecha(valor)) return 'fecha';
  const importe = leerImporte(valor);
  if (importe) return importe.moneda ? 'importe' : 'numero';
  return 'texto';
}

// ------------------------------------------------------------------
// Escribirlo
// ------------------------------------------------------------------

const dos = (n: number) => String(n).padStart(2, '0');

export function escribirFecha(f: Fecha, formato: FormatoFecha): string {
  switch (formato) {
    case 'dd/mm/aaaa': return `${dos(f.dia)}/${dos(f.mes)}/${f.anio}`;
    case 'dd-mm-aaaa': return `${dos(f.dia)}-${dos(f.mes)}-${f.anio}`;
    case 'dd.mm.aaaa': return `${dos(f.dia)}.${dos(f.mes)}.${f.anio}`;
    case 'dd/mm/aa': return `${dos(f.dia)}/${dos(f.mes)}/${String(f.anio).slice(-2)}`;
    case 'd de mmmm de aaaa': return `${f.dia} de ${MESES[f.mes - 1]} de ${f.anio}`;
    case 'd mmm aaaa': return `${f.dia} ${MESES_CORTOS[f.mes - 1]} ${f.anio}`;
    case 'mmmm de aaaa': return `${MESES[f.mes - 1]} de ${f.anio}`;
    case 'aaaa-mm-dd': return `${f.anio}-${dos(f.mes)}-${dos(f.dia)}`;
  }
}

export function escribirNumero(valor: number, decimales: number, miles: boolean): string {
  const d = Math.max(0, Math.min(6, Math.round(decimales)));
  const fijo = Math.abs(valor).toFixed(d);
  const [entero, fraccion] = fijo.split('.');
  const conMiles = miles ? entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : entero;
  return fraccion ? `${conMiles},${fraccion}` : conMiles;
}

function letrasDe(texto: string, letras: Letras): string {
  switch (letras) {
    case 'mayusculas': return texto.toLocaleUpperCase('es');
    case 'minusculas': return texto.toLocaleLowerCase('es');
    case 'titulo':
      // «S.L.», «NIF» y demás siglas se quedan como están.
      return texto.toLocaleLowerCase('es').replace(/(^|[\s(«"'-])(\p{L})/gu, (_, antes: string, l: string) => antes + l.toLocaleUpperCase('es'))
        .replace(/\b(s\.?l\.?u?\.?|s\.?a\.?|s\.?c\.?|c\.?b\.?)$/i, s => s.toLocaleUpperCase('es'));
    default: return texto;
  }
}

/** ¿Hace algo esta presentación? Si no, el campo se imprime como siempre. */
export function presentacionActiva(p: Presentacion | undefined | null): p is Presentacion {
  if (!p) return false;
  return Boolean(
    (p.letras && p.letras !== 'tal') || p.prefijo || p.sufijo || p.fecha || p.decimales !== undefined
    || (p.simbolo && p.simbolo !== 'tal') || p.miles !== undefined || p.negativoParentesis || p.siVacio || p.ocultarSiCero,
  );
}

/**
 * El dato, presentado.
 *
 * Un dato que no es de la clase que pide el formato (una fecha mal escrita,
 * un importe que en realidad es «Exento») sale tal cual: mejor el dato
 * original que uno inventado.
 */
export function presentar(valor: string | undefined | null, p: Presentacion | undefined | null): string {
  const original = (valor ?? '').trim();
  if (!presentacionActiva(p)) return original;

  if (!original) return p.siVacio ?? '';

  let texto = original;
  const fecha = p.fecha ? leerFecha(original) : null;
  const importe = fecha ? null : leerImporte(original);

  if (fecha && p.fecha) {
    texto = escribirFecha(fecha, p.fecha);
  } else if (importe) {
    if (p.ocultarSiCero && importe.valor === 0) return p.siVacio ?? '';
    const tocaNumero = p.decimales !== undefined || p.miles !== undefined || (p.simbolo && p.simbolo !== 'tal') || p.negativoParentesis;
    if (tocaNumero) {
      const decimales = p.decimales ?? (importe.moneda ? 2 : importe.decimales);
      const cifra = escribirNumero(importe.valor, decimales, p.miles ?? true);
      const simbolo = p.simbolo === 'euro' ? ' €'
        : p.simbolo === 'eur' ? ' EUR'
          : p.simbolo === 'sin' ? ''
            : importe.moneda ? ' €' : '';
      const conSimbolo = `${cifra}${simbolo}`;
      texto = importe.valor < 0
        ? (p.negativoParentesis ? `(${conSimbolo})` : `-${conSimbolo}`)
        : conSimbolo;
    }
  }

  if (p.letras && p.letras !== 'tal') texto = letrasDe(texto, p.letras);
  return `${p.prefijo ?? ''}${texto}${p.sufijo ?? ''}`;
}

/**
 * Deja sólo lo que tiene efecto, para guardarlo limpio: un formulario que
 * se ha tocado y vuelto a dejar como estaba no tiene por qué dejar rastro.
 */
export function limpiarPresentacion(p: Presentacion | undefined | null): Presentacion | undefined {
  if (!p) return undefined;
  const limpia: Presentacion = {};
  if (p.letras && p.letras !== 'tal') limpia.letras = p.letras;
  if (p.prefijo) limpia.prefijo = p.prefijo;
  if (p.sufijo) limpia.sufijo = p.sufijo;
  if (p.fecha) limpia.fecha = p.fecha;
  if (p.decimales !== undefined && Number.isFinite(p.decimales)) limpia.decimales = Math.max(0, Math.min(6, Math.round(p.decimales)));
  if (p.simbolo && p.simbolo !== 'tal') limpia.simbolo = p.simbolo;
  if (p.miles !== undefined) limpia.miles = p.miles;
  if (p.negativoParentesis) limpia.negativoParentesis = true;
  if (p.siVacio) limpia.siVacio = p.siVacio;
  if (p.ocultarSiCero) limpia.ocultarSiCero = true;
  return presentacionActiva(limpia) ? limpia : undefined;
}
