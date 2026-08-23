/**
 * LO QUE SE PAGA Y NO ES MERCANCÍA
 *
 * Un gasto no es una compra: no pasa por el almacén, no tiene líneas de
 * producto y no lo emite la empresa —lo recibe—. El número de la factura del
 * proveedor es suyo, no nuestro; aquí sólo se registra lo que costó, para el
 * resultado del negocio y para el IVA soportado del trimestre.
 *
 * Por eso NO es un documento sellado como una factura de venta: no entra en
 * la cadena de huellas de Veri*Factu, porque Veri*Factu certifica lo que la
 * empresa EMITE, no lo que recibe.
 */

import { PaymentMethod, type Gasto, type GastoCategoria } from './types';

export const CATEGORIAS_GASTO: { value: GastoCategoria; label: string }[] = [
  { value: 'alquiler', label: 'Alquiler' },
  { value: 'suministros', label: 'Suministros (luz, agua, internet)' },
  { value: 'personal', label: 'Personal' },
  { value: 'vehiculo', label: 'Vehículo' },
  { value: 'material', label: 'Material y consumibles' },
  { value: 'servicios', label: 'Servicios profesionales' },
  { value: 'impuestos', label: 'Impuestos y tasas' },
  { value: 'seguros', label: 'Seguros' },
  { value: 'otros', label: 'Otros' },
];

/** La cuota y el total de un gasto, a partir de su base y su tipo. */
export function calcularGasto(baseImponible: number, taxRate: number): { taxAmount: number; total: number } {
  const taxAmount = Math.round(baseImponible * (taxRate / 100) * 100) / 100;
  return { taxAmount, total: Math.round((baseImponible + taxAmount) * 100) / 100 };
}

/** La suma de gastos de un periodo, o de todos si no se acota. */
export function totalGastos(
  gastos: Gasto[],
  opciones: { desde?: string; hasta?: string; categoria?: GastoCategoria; vehiculoId?: string } = {},
): number {
  return gastos
    .filter(g => !opciones.desde || g.fecha >= opciones.desde)
    .filter(g => !opciones.hasta || g.fecha <= opciones.hasta)
    .filter(g => !opciones.categoria || g.categoria === opciones.categoria)
    .filter(g => !opciones.vehiculoId || g.vehiculoId === opciones.vehiculoId)
    .reduce((suma, g) => suma + g.total, 0);
}

/** Lo que cuesta cada vehículo, sumando los gastos que se le han imputado. */
export function costeDeVehiculos(gastos: Gasto[]): Map<string, number> {
  const por = new Map<string, number>();
  for (const g of gastos) {
    if (!g.vehiculoId) continue;
    por.set(g.vehiculoId, (por.get(g.vehiculoId) ?? 0) + g.total);
  }
  return por;
}

/** Un gasto en blanco, listo para el formulario. */
export function gastoVacio(fecha: string): Omit<Gasto, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    fecha,
    concepto: '',
    categoria: 'otros',
    baseImponible: 0,
    taxRate: 21,
    taxAmount: 0,
    total: 0,
    paymentMethod: PaymentMethod.TRANSFERENCIA,
  };
}
