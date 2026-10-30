/**
 * COBRAR VARIAS FACTURAS DE UNA VEZ
 *
 * Fin de mes, el extracto del banco delante y quince transferencias que
 * casar: marcarlas de una en una es justo el trabajo que sobra. Desde la
 * lista se eligen las facturas, se dice el día y cómo se cobró, y se ve el
 * resumen antes de confirmar.
 *
 * No hay escritura nueva: se apunta UN COBRO POR CLIENTE, el mismo registro
 * de tesorería que se hace a mano en «Registrar cobro» o al conciliar el
 * banco (`saveCobroPago`). Así cada factura queda cobrada por la vía del
 * cobro —sólo las columnas de cobro, sin tocar lo sellado—, el cobro sale en
 * tesorería y en el extracto del cliente, se puede deshacer borrándolo, y
 * sin conexión va a la misma cola que cualquier otro cobro.
 *
 * Aquí sólo se decide QUÉ se apunta; la pantalla lo guarda.
 */

import type { CobroPago, Invoice, PaymentMethod } from './types';
import { esFacturaDeVenta, pendienteDe } from './perfilPago';

export interface GrupoCobro {
  clienteId: string;
  cliente: string;
  nif?: string;
  desglose: { invoiceId: string; invoiceNumber: string; importeAplicado: number }[];
  importe: number;
}

export interface PlanCobroLote {
  grupos: GrupoCobro[];
  facturas: number;
  total: number;
  /** Las elegidas que no se pueden cobrar, y por qué. */
  descartadas: { numero: string; motivo: string }[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function planCobroLote(facturas: readonly Invoice[], ids: Iterable<string>): PlanCobroLote {
  const porId = new Map(facturas.map(f => [f.id, f]));
  const grupos = new Map<string, GrupoCobro>();
  const descartadas: PlanCobroLote['descartadas'] = [];

  for (const id of ids) {
    const f = porId.get(id);
    if (!f) continue;
    if (!esFacturaDeVenta(f)) { descartadas.push({ numero: f.number, motivo: 'no es una factura de venta' }); continue; }
    const pendiente = pendienteDe(f);
    if (!pendiente) {
      descartadas.push({ numero: f.number, motivo: f.status === 'pagada' ? 'ya está cobrada' : f.status === 'borrador' ? 'es un borrador' : 'no tiene nada pendiente' });
      continue;
    }
    const clave = f.clientId || `nombre:${f.clientName}`;
    const g = grupos.get(clave) ?? { clienteId: f.clientId, cliente: f.clientName || 'Sin cliente', nif: f.clientNif || undefined, desglose: [], importe: 0 };
    g.desglose.push({ invoiceId: f.id, invoiceNumber: f.number, importeAplicado: pendiente });
    g.importe = r2(g.importe + pendiente);
    grupos.set(clave, g);
  }

  const lista = [...grupos.values()].sort((a, b) => a.cliente.localeCompare(b.cliente, 'es'));
  return {
    grupos: lista,
    facturas: lista.reduce((n, g) => n + g.desglose.length, 0),
    total: r2(lista.reduce((s, g) => s + g.importe, 0)),
    descartadas,
  };
}

/**
 * Los registros de cobro del lote, numerados seguidos desde `siguiente`
 * con la serie de cobros (COB-2026-0007, COB-2026-0008…), igual que en
 * tesorería.
 */
export function registrosDeLote(
  plan: PlanCobroLote,
  datos: { fecha: string; forma: PaymentMethod; serie: string; siguiente: number; ahora: string; nuevoId: () => string; notas?: string },
): CobroPago[] {
  return plan.grupos.map((g, i) => ({
    id: datos.nuevoId(),
    tipo: 'cobro',
    series: datos.serie,
    number: `${datos.serie}-${datos.fecha.slice(0, 4)}-${String(datos.siguiente + i).padStart(4, '0')}`,
    fecha: datos.fecha,
    contraparteId: g.clienteId,
    contraparteNombre: g.cliente,
    contraparteNif: g.nif,
    paymentMethod: datos.forma,
    importeTotal: g.importe,
    desglose: g.desglose,
    notas: datos.notas,
    createdAt: datos.ahora,
    updatedAt: datos.ahora,
  }));
}
