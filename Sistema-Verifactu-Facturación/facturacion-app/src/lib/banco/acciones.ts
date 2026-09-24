'use client';

/**
 * Lo que hace cada botón de la conciliación. Todo pasa por `storage.ts`,
 * como el resto del programa: el cobro o el pago marca la factura, cuenta
 * en tesorería y tiene su asiento; el gasto sale en Gastos y en los modelos.
 */

import {
  getCompanySettings, saveCobroPago, saveCompanySettings, saveGasto,
} from '../storage';
import { PaymentMethod, type CobroPago, type Gasto, type GastoCategoria } from '../types';
import { calcularGasto } from '../gastos';
import { generateId } from '../utils';
import type { MovimientoBanco } from './extracto';
import { marcaBanco, type Propuesta } from './conciliar';

const r2 = (n: number) => Math.round(n * 100) / 100;

const nota = (mov: MovimientoBanco) => `Conciliado con el banco (${mov.fecha}): ${mov.concepto} ${marcaBanco(mov.id)}`;

/** Cómo se pagó, por lo que dice el concepto del banco. */
export function formaDePago(concepto: string): PaymentMethod {
  const c = concepto.toUpperCase();
  if (/BIZUM/.test(c)) return PaymentMethod.BIZUM;
  if (/TARJ|TPV|COMPRA EN|VISA|MASTERCARD/.test(c)) return PaymentMethod.TARJETA;
  if (/RECIBO|ADEUDO|DOMICILIA|SEPA/.test(c)) return PaymentMethod.DOMICILIACION;
  return PaymentMethod.TRANSFERENCIA;
}

/** Confirma una propuesta: crea el cobro o el pago, o marca el gasto. Devuelve lo que ha quedado. */
export async function confirmar(mov: MovimientoBanco, p: Propuesta): Promise<string> {
  if (p.tipo === 'gasto') {
    const g = p.gasto;
    await saveGasto({ ...g, notas: `${g.notas ? g.notas + '\n' : ''}${nota(mov)}`, updatedAt: new Date().toISOString() });
    return `Gasto: ${g.concepto}`;
  }

  const esCobro = p.tipo === 'cobro';
  const primera = p.facturas[0].factura;
  const ajustes = await getCompanySettings();
  const series = esCobro ? (ajustes.cobroSeries || 'COB') : (ajustes.pagoSeries || 'PAG');
  const siguiente = esCobro ? (ajustes.nextCobroNumber || 1) : (ajustes.nextPagoNumber || 1);
  const numero = `${series}-${mov.fecha.slice(0, 4)}-${String(siguiente).padStart(4, '0')}`;
  const ahora = new Date().toISOString();

  const registro: CobroPago = {
    id: generateId(),
    tipo: p.tipo,
    series,
    number: numero,
    fecha: mov.fecha,
    contraparteId: primera.clientId,
    contraparteNombre: primera.clientName || 'Contraparte',
    contraparteNif: primera.clientNif || undefined,
    paymentMethod: formaDePago(mov.concepto),
    importeTotal: r2(p.facturas.reduce((t, x) => t + x.importe, 0)),
    desglose: p.facturas.map(x => ({ invoiceId: x.factura.id, invoiceNumber: x.factura.number, importeAplicado: x.importe })),
    notas: nota(mov),
    createdAt: ahora,
    updatedAt: ahora,
  };
  await saveCobroPago(registro);
  await saveCompanySettings(esCobro ? { ...ajustes, nextCobroNumber: siguiente + 1 } : { ...ajustes, nextPagoNumber: siguiente + 1 });
  return `${esCobro ? 'Cobro' : 'Pago'} ${numero}`;
}

export interface DatosGastoNuevo {
  concepto: string;
  categoria: GastoCategoria;
  proveedorNombre?: string;
  /** Tipo de IVA/IGIC incluido en el cargo. 0 si no lleva (comisiones, seguros, tasas…). */
  taxRate: number;
}

/** Un cargo sin pareja que es un gasto: se apunta con el importe del banco, impuesto incluido. */
export async function crearGastoDesde(mov: MovimientoBanco, d: DatosGastoNuevo): Promise<string> {
  const total = r2(Math.abs(mov.importe));
  const base = r2(total / (1 + d.taxRate / 100));
  const { taxAmount } = calcularGasto(base, d.taxRate);
  const ahora = new Date().toISOString();
  const gasto: Gasto = {
    id: generateId(),
    fecha: mov.fecha,
    concepto: d.concepto.trim() || mov.concepto,
    categoria: d.categoria,
    proveedorNombre: d.proveedorNombre?.trim() || undefined,
    baseImponible: base,
    taxRate: d.taxRate,
    // Se cuadra con el total del banco: el redondeo va a la cuota.
    taxAmount: r2(total - base) || taxAmount,
    total,
    paymentMethod: formaDePago(mov.concepto),
    notas: nota(mov),
    createdAt: ahora,
    updatedAt: ahora,
  };
  await saveGasto(gasto);
  return `Gasto: ${gasto.concepto}`;
}

// ------------------------------------------------------------------
// Ignorados: comisiones internas, traspasos entre cuentas propias… No
// generan nada, así que se recuerdan en este navegador.
// ------------------------------------------------------------------

const CLAVE = 'klima_banco_ignorados';

export function leerIgnorados(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(CLAVE) || '[]') as string[]);
  } catch {
    return new Set();
  }
}

export function guardarIgnorados(ids: Set<string>): void {
  try {
    // Los últimos 3000 bastan: un extracto viejo ya estará conciliado.
    localStorage.setItem(CLAVE, JSON.stringify([...ids].slice(-3000)));
  } catch { /* sin almacenamiento: se pierde al recargar, nada más */ }
}

/** Lo más probable para un cargo sin pareja, para no empezar de cero. */
export function sugerirGasto(mov: MovimientoBanco, tipoGeneral: number): DatosGastoNuevo {
  const c = mov.concepto.toUpperCase();
  const es = (re: RegExp) => re.test(c);
  let categoria: GastoCategoria = 'otros';
  let taxRate = tipoGeneral;
  if (es(/AEAT|HACIENDA|TGSS|SEG(URIDAD)?\.? ?SOCIAL|AYUNTAMIENTO|IMPUESTO|TRIBUTO|IBI|IVTM|AUTONOMO/)) { categoria = 'impuestos'; taxRate = 0; }
  else if (es(/NOMINA|SALARIO/)) { categoria = 'personal'; taxRate = 0; }
  else if (es(/SEGURO|MAPFRE|AXA|ALLIANZ|MUTUA|GENERALI|SANITAS|ADESLAS/)) { categoria = 'seguros'; taxRate = 0; }
  else if (es(/COMISION|MANTENIMIENTO CUENTA|INTERES/)) { categoria = 'servicios'; taxRate = 0; }
  else if (es(/IBERDROLA|ENDESA|NATURGY|REPSOL LUZ|HOLALUZ|TOTALENERGIES|AGUA|CANAL DE ISABEL|TELEFONICA|MOVISTAR|VODAFONE|ORANGE|JAZZTEL|DIGI|MASMOVIL|O2 /)) categoria = 'suministros';
  else if (es(/ALQUILER|RENTA LOCAL|ARRENDAMIENTO/)) categoria = 'alquiler';
  else if (es(/GASOLIN|CARBURANTE|REPSOL|CEPSA|GALP|SHELL|BP |PEAJE|AUTOPISTA|PARKING|TALLER/)) categoria = 'vehiculo';
  return { concepto: mov.concepto.slice(0, 120), categoria, taxRate };
}
