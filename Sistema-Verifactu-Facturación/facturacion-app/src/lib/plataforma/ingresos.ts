/**
 * EL LIBRO DE INGRESOS DE LA PLATAFORMA
 *
 * Todo lo que cobra la plataforma por Stripe —suscripciones, propinas y
 * devoluciones— se apunta aquí, se facture o no. Es lo que se le enseña
 * a la gestoría y de donde salen las cifras de cada trimestre.
 *
 * La regla que manda: SIN FECHA DE ALTA NO SE FACTURA. Mientras quien
 * administra la plataforma no esté dada de alta en Hacienda, un cobro no
 * genera una factura a su nombre (sería emitir facturas sin actividad
 * declarada): queda como «pendiente de alta». Con la fecha puesta, lo
 * cobrado desde ese día se factura solo; lo anterior sigue pendiente y
 * se regulariza con la gestoría, no a ciegas.
 *
 * Aquí sólo hay decisiones y cuentas, sin base de datos, para probarlo.
 */

import { baseQueCuadra } from './impuestos';

export type TipoIngreso = 'suscripcion' | 'propina' | 'devolucion';
export type EstadoIngreso = 'facturado' | 'pendiente_alta' | 'revisar';

export interface Ingreso {
  stripe_ref: string;
  tipo: TipoIngreso;
  fecha: string;
  importe: number;
  base: number;
  cuota: number;
  tipo_impositivo: number;
  cliente_nombre: string | null;
  cliente_nif: string | null;
  cliente_user_id: string | null;
  concepto: string;
  estado: EstadoIngreso;
  invoice_id: string | null;
  nota: string | null;
}

/** ¿Se puede facturar un cobro de esta fecha? Sólo desde el día del alta. */
export function sePuedeFacturar(fecha: string, actividadDesde: string | null | undefined): boolean {
  return Boolean(actividadDesde) && fecha >= String(actividadDesde);
}

/** El ingreso tal como se apunta, con la base y el impuesto sacados de lo cobrado. */
export function nuevoIngreso(a: {
  stripeRef: string;
  tipo: TipoIngreso;
  fecha: string;
  importe: number;
  tipoImpositivo: number;
  concepto: string;
  cliente?: { nombre?: string | null; nif?: string | null; userId?: string | null };
  actividadDesde: string | null | undefined;
}): Ingreso {
  const signo = a.importe < 0 ? -1 : 1;
  const { base, cuota } = a.tipoImpositivo > 0
    ? baseQueCuadra(Math.abs(a.importe), a.tipoImpositivo)
    : { base: Math.abs(a.importe), cuota: 0 };
  const facturable = sePuedeFacturar(a.fecha, a.actividadDesde);
  return {
    stripe_ref: a.stripeRef,
    tipo: a.tipo,
    fecha: a.fecha,
    importe: a.importe,
    base: signo * base,
    cuota: signo * cuota,
    tipo_impositivo: a.tipoImpositivo,
    cliente_nombre: a.cliente?.nombre?.trim() || null,
    cliente_nif: a.cliente?.nif?.trim() || null,
    cliente_user_id: a.cliente?.userId ?? null,
    concepto: a.concepto,
    estado: facturable ? 'facturado' : 'pendiente_alta',
    invoice_id: null,
    nota: facturable ? null : a.actividadDesde
      ? `Cobrado antes del alta (${a.actividadDesde}): regularizar con la gestoría.`
      : 'Sin actividad dada de alta: no se ha emitido factura.',
  };
}

export interface ResumenIngresos {
  cobros: number;
  total: number;
  base: number;
  cuota: number;
  porTipo: Record<TipoIngreso, number>;
  porEstado: Record<EstadoIngreso, number>;
}

const cent = (n: number) => Math.round(n * 100) / 100;

/** Las cifras de un periodo: lo que se lleva a la declaración. */
export function resumenIngresos(filas: readonly Pick<Ingreso, 'tipo' | 'importe' | 'base' | 'cuota' | 'estado'>[]): ResumenIngresos {
  const r: ResumenIngresos = {
    cobros: filas.length, total: 0, base: 0, cuota: 0,
    porTipo: { suscripcion: 0, propina: 0, devolucion: 0 },
    porEstado: { facturado: 0, pendiente_alta: 0, revisar: 0 },
  };
  for (const f of filas) {
    r.total += Number(f.importe);
    r.base += Number(f.base);
    r.cuota += Number(f.cuota);
    r.porTipo[f.tipo] += Number(f.importe);
    r.porEstado[f.estado] += 1;
  }
  r.total = cent(r.total); r.base = cent(r.base); r.cuota = cent(r.cuota);
  for (const k of Object.keys(r.porTipo) as TipoIngreso[]) r.porTipo[k] = cent(r.porTipo[k]);
  return r;
}

const ETIQUETA_TIPO: Record<TipoIngreso, string> = { suscripcion: 'Suscripción', propina: 'Propina', devolucion: 'Devolución' };
const ETIQUETA_ESTADO: Record<EstadoIngreso, string> = { facturado: 'Facturado', pendiente_alta: 'Pendiente de alta', revisar: 'Revisar' };

/**
 * El libro en CSV para la gestoría: punto y coma y coma decimal, que es
 * lo que abre bien Excel en español.
 */
export function ingresosACsv(filas: readonly (Ingreso & { factura_numero?: string | null })[]): string {
  const num = (n: number) => Number(n).toFixed(2).replace('.', ',');
  const txt = (t: string | null | undefined) => {
    const v = (t ?? '').replace(/"/g, '""');
    return /[;"\n]/.test(v) ? `"${v}"` : v;
  };
  const cabecera = ['Fecha', 'Tipo', 'Concepto', 'Cliente', 'NIF', 'Base', 'Tipo %', 'Impuesto', 'Total', 'Estado', 'Factura', 'Referencia Stripe', 'Nota'];
  const lineas = filas.map(f => [
    f.fecha, ETIQUETA_TIPO[f.tipo], txt(f.concepto), txt(f.cliente_nombre), txt(f.cliente_nif),
    num(f.base), num(f.tipo_impositivo), num(f.cuota), num(f.importe),
    ETIQUETA_ESTADO[f.estado], txt(f.factura_numero ?? ''), f.stripe_ref, txt(f.nota),
  ].join(';'));
  // BOM (U+FEFF) para que Excel lea bien los acentos.
  return String.fromCharCode(0xfeff) + [cabecera.join(';'), ...lineas].join('\r\n') + '\r\n';
}
