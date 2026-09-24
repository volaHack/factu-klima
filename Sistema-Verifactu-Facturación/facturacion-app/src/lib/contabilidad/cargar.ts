'use client';

/**
 * Carga lo que necesita la contabilidad y prepara los datos de los cuadres.
 * Lee por `storage.ts`, como el resto del programa: misma autorización,
 * mismos datos sin conexión.
 */

import { getClients, getCobrosPagos, getCompanySettings, getGastos, getInvoices } from '../storage';
import type { CompanySettings, Invoice } from '../types';
import { calcularModelo303 } from '../fiscal/aeat/modelo303';
import { calcularModelo420 } from '../fiscal/atc/modelo420';
import type { Trimestre } from '../fiscal/tipos';
import { cuentaEnContabilidad, generarAsientos, nombresDeTerceros, r2, type Asiento } from './motor';
import { nombreDeCuenta, type Impuesto } from './plan';
import type { DatosCuadre } from './informes';

export interface Contabilidad {
  asientos: Asiento[];
  empresa: CompanySettings;
  impuesto: Impuesto;
  nombreCuenta: (codigo: string) => string;
  ejercicios: number[];
  /** Datos para los cuadres de un ejercicio. */
  datosCuadre: (ejercicio: number) => DatosCuadre;
}

export async function cargarContabilidad(): Promise<Contabilidad> {
  const [facturas, gastos, cobrosPagos, clientes, empresa] = await Promise.all([
    getInvoices(), getGastos(), getCobrosPagos(), getClients(), getCompanySettings(),
  ]);
  const impuesto: Impuesto = empresa?.igicEnabled ? 'IGIC' : 'IVA';
  const asientos = generarAsientos({ facturas, gastos, cobrosPagos, clientes, sector: empresa?.sector, impuesto });
  const terceros = nombresDeTerceros({ clientes, facturas, gastos });

  const anios = new Set<number>([new Date().getFullYear()]);
  for (const a of asientos) anios.add(Number(a.fecha.slice(0, 4)));

  const cobrado = new Map<string, number>();
  for (const c of cobrosPagos) for (const x of c.desglose ?? []) cobrado.set(x.invoiceId, r2((cobrado.get(x.invoiceId) ?? 0) + x.importeAplicado));

  const datosCuadre = (ejercicio: number): DatosCuadre => {
    // Lo que falta por cobrar de las facturas de venta hasta fin de ese año.
    const hasta = `${ejercicio}-12-31`;
    const ventas = facturas.filter(f => cuentaEnContabilidad(f) && f.sentido !== 'compra' && !f.posSessionId && f.issueDate <= hasta);
    const pendienteDeCobro = r2(ventas.reduce((t, f) => {
      if (f.status === 'pagada') return t;
      const retencion = r2(f.subtotal * ((f.retencionPct ?? 0) / 100));
      return t + (f.total - retencion) - (cobrado.get(f.id) ?? 0);
    }, 0));

    // El impuesto repercutido según los modelos trimestrales del programa.
    const delAnio = facturas.filter(f => f.issueDate?.startsWith(String(ejercicio)));
    const gastosAnio = gastos.filter(g => g.fecha?.startsWith(String(ejercicio)));
    let devengadoModelo = 0;
    for (const t of [1, 2, 3, 4] as Trimestre[]) {
      devengadoModelo += impuesto === 'IGIC'
        ? calcularModelo420({ facturas: delAnio, gastos: gastosAnio }, { ejercicio, trimestre: t }).totalRepercutido
        : calcularModelo303({ facturas: delAnio, gastos: gastosAnio }, { ejercicio, trimestre: t }).cuotaDevengada;
    }
    const rectificativas = delAnio.filter((f: Invoice) => cuentaEnContabilidad(f) && f.tipo === 'rectificativa' && f.sentido !== 'compra');
    const cuotaRect = r2(rectificativas.reduce((t, f) => t + (f.totalTax || 0), 0));
    return {
      impuesto,
      pendienteDeCobro,
      impuestoDevengadoModelo: r2(devengadoModelo),
      explicacionDiferenciaImpuesto: rectificativas.length
        ? `Las ${rectificativas.length} facturas rectificativas del año (${cuotaRect.toLocaleString('es-ES', { minimumFractionDigits: 2 })} € de cuota) cuentan en la contabilidad pero el cálculo del modelo del programa no las incluye: revísalo con tu gestoría antes de presentar.`
        : 'Revisa si hay facturas emitidas con fecha fuera del trimestre en que se declararon.',
    };
  };

  return {
    asientos,
    empresa,
    impuesto,
    nombreCuenta: c => nombreDeCuenta(c, impuesto, terceros),
    ejercicios: [...anios].sort((a, b) => b - a),
    datosCuadre,
  };
}
