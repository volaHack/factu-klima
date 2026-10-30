/**
 * EL OBJETIVO DEL MES
 *
 * Saber cuánto se ha facturado no dice si se va bien. Con un objetivo
 * delante, el panel contesta lo que de verdad se pregunta a mitad de mes:
 * a este ritmo, ¿llego? y si no, ¿cuánto me falta cada día que queda?
 *
 *   · El ritmo se mide en DÍAS LABORABLES (de lunes a viernes): un sábado
 *     sin facturar no es ir peor, y a fin de mes no se cuenta con domingos.
 *     El día de hoy cuenta como transcurrido y como pendiente a la vez: lo
 *     facturado hoy ya suma, y hoy todavía se puede facturar.
 *   · Sin objetivo puesto se propone uno con lo que ya se hace: la media de
 *     los tres meses anteriores, más un 10 %, redondeado a la centena.
 *
 * El objetivo se guarda en este navegador, por cuenta (dos empresas en el
 * mismo equipo no comparten objetivo). No hay columna en la base de datos
 * para él y no hace falta: es una meta personal, no un dato de la empresa.
 */

import { InvoiceStatus, type Invoice } from './types';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Días de lunes a viernes entre dos fechas AAAA-MM-DD, las dos incluidas. */
export function diasLaborables(desde: string, hasta: string): number {
  const [a1, m1, d1] = desde.split('-').map(Number);
  const [a2, m2, d2] = hasta.split('-').map(Number);
  const fin = Date.UTC(a2, m2 - 1, d2);
  let n = 0;
  for (let t = Date.UTC(a1, m1 - 1, d1); t <= fin; t += 86_400_000) {
    const dia = new Date(t).getUTCDay();
    if (dia !== 0 && dia !== 6) n += 1;
  }
  return n;
}

const finDeMes = (hoy: string) => {
  const [a, m] = hoy.split('-').map(Number);
  return `${hoy.slice(0, 7)}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`;
};

export interface ProgresoObjetivo {
  objetivo: number;
  facturado: number;
  /** 0–100 o más, si ya se ha pasado. */
  porcentaje: number;
  /** Lo que se cerraría a este ritmo. */
  proyeccion: number;
  /** Lo que falta, y lo que falta por cada laborable que queda (hoy incluido). */
  falta: number;
  faltaPorDia: number;
  laborablesQuedan: number;
  /** Al ritmo actual, ¿se llega? */
  llega: boolean;
  /** «Vas al 62 % · a este ritmo cerrarás en 14.300 € · te faltan 380 €/día». */
  texto: string;
}

const euros = (n: number, decimales = 0) => new Intl.NumberFormat('es-ES', {
  style: 'currency', currency: 'EUR', minimumFractionDigits: decimales, maximumFractionDigits: decimales, useGrouping: 'always',
}).format(n);

export function progresoObjetivo(objetivo: number, facturado: number, hoy: string): ProgresoObjetivo {
  const inicio = `${hoy.slice(0, 7)}-01`;
  const fin = finDeMes(hoy);
  const totales = diasLaborables(inicio, fin);
  // Un mes que empieza en fin de semana: el sábado 1 aún no ha pasado ningún laborable.
  const transcurridos = Math.max(1, diasLaborables(inicio, hoy));
  const laborablesQuedan = diasLaborables(hoy, fin);
  const proyeccion = r2((facturado / transcurridos) * totales);
  const falta = r2(Math.max(0, objetivo - facturado));
  const faltaPorDia = laborablesQuedan ? r2(falta / laborablesQuedan) : falta;
  const porcentaje = objetivo > 0 ? Math.round((facturado / objetivo) * 100) : 0;
  const llega = proyeccion >= objetivo;

  const partes = [`Vas al ${porcentaje} %`];
  if (falta <= 0) partes.push('objetivo cumplido');
  else {
    partes.push(`a este ritmo cerrarás en ${euros(Math.round(proyeccion / 100) * 100)}`);
    partes.push(laborablesQuedan ? `te faltan ${euros(Math.ceil(faltaPorDia))}/día` : `te faltan ${euros(falta)}`);
  }
  return { objetivo, facturado, porcentaje, proyeccion, falta, faltaPorDia, laborablesQuedan, llega, texto: partes.join(' · ') };
}

const cuentaComoFacturado = (f: Invoice) =>
  f.sentido !== 'compra' && (!f.tipo || f.tipo === 'factura' || f.tipo === 'rectificativa')
  && f.status !== InvoiceStatus.ANULADA && f.status !== InvoiceStatus.BORRADOR && !f.cancelledAt;

/** Lo facturado en un mes AAAA-MM, con el mismo criterio que la cifra del panel. */
export function facturadoEnMes(docs: readonly Invoice[], mes: string): number {
  return r2(docs.filter(f => cuentaComoFacturado(f) && f.issueDate?.slice(0, 7) === mes).reduce((s, f) => s + (f.total || 0), 0));
}

/** La media de los tres meses anteriores, más un 10 %, en centenas. Sin historial, null. */
export function objetivoPropuesto(docs: readonly Invoice[], hoy: string): number | null {
  const [a, m] = hoy.split('-').map(Number);
  const meses = [1, 2, 3].map(i => {
    const d = new Date(Date.UTC(a, m - 1 - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
  const media = meses.reduce((s, mes) => s + facturadoEnMes(docs, mes), 0) / 3;
  if (media <= 0) return null;
  return Math.max(100, Math.round((media * 1.1) / 100) * 100);
}

/**
 * Un importe escrito a mano: «12.000», «12000,50» o «12000.5». El punto
 * es de miles si va en grupos de tres; si no, decimal, como lo escribe un
 * teclado numérico en inglés. Null si no es un importe positivo.
 */
export function leerImporte(texto: string): number | null {
  let t = texto.replace(/[\s€]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t);
  return t && Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

// ------------------------------------------------------------------
// Dónde se guarda: este navegador, por cuenta
// ------------------------------------------------------------------

type Almacen = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const clave = (cuenta: string) => `klima-objetivo-mes:${cuenta}`;

function almacenDelNavegador(): Almacen | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

export function leerObjetivo(cuenta: string, almacen: Almacen | null = almacenDelNavegador()): number | null {
  try {
    const n = Number(almacen?.getItem(clave(cuenta)));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** Guarda el objetivo (o lo quita con null). Devuelve si se ha podido guardar. */
export function guardarObjetivo(cuenta: string, importe: number | null, almacen: Almacen | null = almacenDelNavegador()): boolean {
  try {
    if (!almacen) return false;
    if (importe == null || !(importe > 0)) almacen.removeItem(clave(cuenta));
    else almacen.setItem(clave(cuenta), String(Math.round(importe * 100) / 100));
    return true;
  } catch {
    return false;
  }
}
