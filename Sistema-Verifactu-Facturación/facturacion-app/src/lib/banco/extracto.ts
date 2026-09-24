/**
 * EXTRACTOS BANCARIOS
 *
 * Lee los dos formatos que sacan todos los bancos españoles:
 *
 * - Norma 43 (Cuaderno 43 de la AEB, hoy CSB): el fichero de texto de
 *   registros de 80 posiciones que descargan la banca online y los
 *   programas de contabilidad. Es el bueno: fechas e importes sin
 *   ambigüedad.
 * - CSV: lo que da el botón «exportar» de casi cualquier banco. Cada uno
 *   pone las columnas a su manera, así que se reconocen por el nombre.
 *
 * El resultado es siempre una lista de movimientos con el importe con signo:
 * positivo lo que entra, negativo lo que sale.
 */

export interface MovimientoBanco {
  /** Estable entre importaciones del mismo movimiento: sirve para saber si ya se concilió. */
  id: string;
  fecha: string; // AAAA-MM-DD
  importe: number; // + entra, − sale
  concepto: string;
  referencia?: string;
  saldo?: number;
}

export interface Extracto {
  formato: 'norma43' | 'csv';
  cuenta?: string;
  desde?: string;
  hasta?: string;
  saldoInicial?: number;
  saldoFinal?: number;
  movimientos: MovimientoBanco[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** FNV-1a de 32 bits, dos veces con semillas distintas: corto y sin choques en la práctica. */
function huella(texto: string): string {
  const pasada = (semilla: number) => {
    let h = semilla >>> 0;
    for (let i = 0; i < texto.length; i++) {
      h ^= texto.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(36);
  };
  return pasada(0x811c9dc5) + pasada(0x1b873593);
}

/**
 * El id de cada movimiento sale de lo que dice el banco (fecha, importe,
 * concepto) y de cuántos iguales van delante: dos cargos idénticos el mismo
 * día son dos movimientos, y al volver a importar el extracto siguen
 * teniendo los mismos ids.
 */
function ponerIds(movs: Omit<MovimientoBanco, 'id'>[], cuenta = ''): MovimientoBanco[] {
  const vistos = new Map<string, number>();
  return movs.map(m => {
    const clave = `${cuenta}|${m.fecha}|${m.importe.toFixed(2)}|${m.concepto.replace(/\s+/g, ' ').trim().toLowerCase()}`;
    const n = vistos.get(clave) ?? 0;
    vistos.set(clave, n + 1);
    return { ...m, id: huella(`${clave}|${n}`) };
  });
}

// ------------------------------------------------------------------
// NORMA 43
// ------------------------------------------------------------------

/** «250131» → «2025-01-31». */
function fechaN43(aammdd: string): string {
  const a = Number(aammdd.slice(0, 2));
  const anio = a >= 70 ? 1900 + a : 2000 + a;
  return `${anio}-${aammdd.slice(2, 4)}-${aammdd.slice(4, 6)}`;
}

const importeN43 = (cifras: string) => Number(cifras) / 100;

export function pareceNorma43(texto: string): boolean {
  const primera = texto.split(/\r?\n/).find(l => l.trim());
  return !!primera && /^11\d{18}/.test(primera);
}

/**
 * Registros que se usan (posiciones de la norma, contando desde 1):
 *
 *   11 cabecera de cuenta: 3-6 banco, 7-10 oficina, 11-20 cuenta,
 *      21-26 fecha inicial, 27-32 fecha final, 33 clave D/H, 34-47 saldo inicial
 *   22 movimiento: 11-16 fecha operación, 17-22 fecha valor, 28 clave
 *      (1 cargo, 2 abono), 29-42 importe, 43-52 documento, 53-64 ref. 1,
 *      65-80 ref. 2
 *   23 concepto complementario: 5-42 y 43-80
 *   33 final de cuenta: 59 clave D/H, 60-73 saldo final
 */
export function leerNorma43(texto: string): Extracto {
  const lineas = texto.split(/\r?\n/).map(l => l.replace(/\s+$/, '')).filter(Boolean);
  const movs: Omit<MovimientoBanco, 'id'>[] = [];
  let cuenta: string | undefined;
  let desde: string | undefined;
  let hasta: string | undefined;
  let saldoInicial: number | undefined;
  let saldoFinal: number | undefined;
  let ultimo: Omit<MovimientoBanco, 'id'> | null = null;

  for (const bruta of lineas) {
    const l = bruta.padEnd(80, ' ');
    const tipo = l.slice(0, 2);
    if (tipo === '11') {
      cuenta = `${l.slice(2, 6)} ${l.slice(6, 10)} ${l.slice(10, 20)}`;
      desde = fechaN43(l.slice(20, 26));
      hasta = fechaN43(l.slice(26, 32));
      const s = importeN43(l.slice(33, 47));
      saldoInicial = l[32] === '1' ? -s : s;
    } else if (tipo === '22') {
      const importe = importeN43(l.slice(28, 42));
      const ref1 = l.slice(52, 64).trim();
      const ref2 = l.slice(64, 80).trim();
      ultimo = {
        fecha: fechaN43(l.slice(10, 16)),
        importe: r2(l[27] === '1' ? -importe : importe),
        concepto: '',
        referencia: [ref1, ref2].filter(r => r && !/^0+$/.test(r)).join(' ') || undefined,
      };
      movs.push(ultimo);
    } else if (tipo === '23' && ultimo) {
      const extra = `${l.slice(4, 42).trim()} ${l.slice(42, 80).trim()}`.trim();
      ultimo.concepto = `${ultimo.concepto} ${extra}`.trim();
    } else if (tipo === '33') {
      const s = importeN43(l.slice(59, 73));
      saldoFinal = l[58] === '1' ? -s : s;
      ultimo = null;
    }
  }

  // Sin registros 23 el concepto es la referencia: algo hay que enseñar.
  for (const m of movs) if (!m.concepto) m.concepto = m.referencia ?? (m.importe >= 0 ? 'Abono' : 'Cargo');

  return { formato: 'norma43', cuenta, desde, hasta, saldoInicial, saldoFinal, movimientos: ponerIds(movs, cuenta) };
}

// ------------------------------------------------------------------
// CSV
// ------------------------------------------------------------------

/** Parte una línea CSV respetando comillas. */
function trocear(linea: string, sep: string): string[] {
  const out: string[] = [];
  let actual = '';
  let comillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      if (comillas && linea[i + 1] === '"') { actual += '"'; i++; }
      else comillas = !comillas;
    } else if (c === sep && !comillas) {
      out.push(actual.trim());
      actual = '';
    } else {
      actual += c;
    }
  }
  out.push(actual.trim());
  return out;
}

/**
 * «1.234,56», «-12,5», «1,234.56», «1234.56», «12,50 €», «(12,50)».
 * Con punto y coma a la vez, el que va último es el decimal. Con uno solo,
 * la coma es decimal; el punto también, salvo que lleve justo tres cifras
 * detrás (entonces es de miles: «1.234»).
 */
export function leerImporte(texto: string): number | null {
  let t = texto.replace(/[€\s]|EUR/gi, '');
  if (!t) return null;
  let negativo = false;
  if (/^\(.*\)$/.test(t)) { negativo = true; t = t.slice(1, -1); }
  if (t.endsWith('-')) { negativo = true; t = t.slice(0, -1); }
  if (t.startsWith('-')) { negativo = !negativo; t = t.slice(1); }
  if (t.startsWith('+')) t = t.slice(1);
  const coma = t.lastIndexOf(',');
  const punto = t.lastIndexOf('.');
  if (coma >= 0 && punto >= 0) {
    t = coma > punto ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (coma >= 0) {
    t = t.replace(/\./g, '').replace(',', '.');
  } else if (punto >= 0 && /^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, '');
  }
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return r2(negativo ? -n : n);
}

/** «31/01/2025», «31-01-25», «31.01.2025», «2025-01-31» → «2025-01-31». */
export function leerFecha(texto: string): string | null {
  const t = texto.trim().slice(0, 10);
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(t);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(t);
  if (m) {
    const anio = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const mes = Number(m[2]);
    const dia = Number(m[1]);
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
    return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  }
  return null;
}

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

interface Columnas { fecha: number; concepto: number[]; importe?: number; cargo?: number; abono?: number; saldo?: number }

function reconocerColumnas(cabecera: string[]): Columnas | null {
  const c = cabecera.map(sinAcentos);
  const busca = (...claves: RegExp[]) => {
    for (const k of claves) {
      const i = c.findIndex(x => k.test(x));
      if (i >= 0) return i;
    }
    return -1;
  };
  // La fecha de la operación antes que la fecha valor.
  const fecha = busca(/^f(echa|\.)?\s*(de\s*)?(operacion|oper|contable)/, /^fecha$/, /^fecha(?!.*valor)/, /fecha/, /^date/);
  if (fecha < 0) return null;
  const concepto = c
    .map((x, i) => (/concepto|descripcion|detalle|movimiento|observaciones|beneficiario|ordenante|remitente|informacion|texto|description/.test(x) && i !== fecha ? i : -1))
    .filter(i => i >= 0);
  const importe = busca(/^importe(?!.*saldo)/, /^cantidad/, /^amount/, /^importe/);
  const cargo = busca(/^cargos?$/, /^debe$/, /^gastos?$/, /^salidas?$/, /cargo/);
  const abono = busca(/^abonos?$/, /^haber$/, /^ingresos?$/, /^entradas?$/, /abono/);
  const saldo = busca(/^saldo/, /balance/);
  if (importe < 0 && (cargo < 0 || abono < 0)) return null;
  return {
    fecha,
    concepto,
    importe: importe >= 0 ? importe : undefined,
    cargo: cargo >= 0 ? cargo : undefined,
    abono: abono >= 0 ? abono : undefined,
    saldo: saldo >= 0 ? saldo : undefined,
  };
}

export function leerCsv(texto: string): Extracto {
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (!lineas.length) throw new Error('El fichero está vacío.');

  // El separador que más aparece en las primeras líneas.
  const muestra = lineas.slice(0, 15).join('\n');
  const sep = [';', '\t', ','].map(s => [s, muestra.split(s).length] as const).sort((a, b) => b[1] - a[1])[0][0];

  // La cabecera no siempre es la primera línea: muchos bancos ponen antes
  // el titular, la cuenta y el periodo.
  let col: Columnas | null = null;
  let inicio = 0;
  for (let i = 0; i < Math.min(lineas.length, 30); i++) {
    col = reconocerColumnas(trocear(lineas[i], sep));
    if (col) { inicio = i + 1; break; }
  }
  if (!col) {
    throw new Error('No se reconocen las columnas. Hace falta una de fecha y otra de importe (o de cargos y abonos).');
  }

  const movs: Omit<MovimientoBanco, 'id'>[] = [];
  for (const linea of lineas.slice(inicio)) {
    const celdas = trocear(linea, sep);
    const fecha = leerFecha(celdas[col.fecha] ?? '');
    if (!fecha) continue; // totales, líneas en blanco, pies
    let importe: number | null;
    if (col.importe !== undefined) {
      importe = leerImporte(celdas[col.importe] ?? '');
    } else {
      const cargo = leerImporte(celdas[col.cargo!] ?? '') ?? 0;
      const abono = leerImporte(celdas[col.abono!] ?? '') ?? 0;
      importe = r2(Math.abs(abono) - Math.abs(cargo));
    }
    if (importe === null || importe === 0) continue;
    const concepto = col.concepto.map(i => celdas[i]).filter(Boolean).join(' · ') || (importe > 0 ? 'Abono' : 'Cargo');
    const saldo = col.saldo !== undefined ? leerImporte(celdas[col.saldo] ?? '') ?? undefined : undefined;
    movs.push({ fecha, importe, concepto, saldo });
  }
  if (!movs.length) throw new Error('No hay movimientos con fecha e importe en el fichero.');

  const fechas = movs.map(m => m.fecha).sort();
  return {
    formato: 'csv',
    desde: fechas[0],
    hasta: fechas[fechas.length - 1],
    movimientos: ponerIds(movs),
  };
}

/** Norma 43 si lo parece; si no, CSV. */
export function leerExtracto(texto: string): Extracto {
  return pareceNorma43(texto) ? leerNorma43(texto) : leerCsv(texto);
}

/**
 * Los ficheros de banco van en Latin-1 muy a menudo (sobre todo la Norma
 * 43). Si al leerlo como UTF-8 salen caracteres de reemplazo, se relee.
 */
export async function textoDeFichero(fichero: File): Promise<string> {
  const buf = await fichero.arrayBuffer();
  const utf8 = new TextDecoder('utf-8').decode(buf);
  if (!utf8.includes('�')) return utf8;
  return new TextDecoder('windows-1252').decode(buf);
}
