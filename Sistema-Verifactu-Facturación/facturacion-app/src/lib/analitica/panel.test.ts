import { describe, it, expect } from 'vitest';

import { InvoiceStatus, type Invoice } from '@/lib/types';
import {
  actividadDiaria, diasDeCobro, diasEntre, estadoCobro, mapaDeVentas, mapaHorario,
  rankingClientes, ritmoDelMes,
} from './panel';

let n = 0;
function factura(p: Partial<Invoice>): Invoice {
  n++;
  return {
    id: `f${n}`, number: `F-${n}`, series: 'F', clientId: 'c1', clientName: 'Bar Pepe',
    clientNif: '', clientAddress: '', issueDate: '2026-09-10', dueDate: '2026-10-10',
    status: InvoiceStatus.PENDIENTE, lineItems: [], subtotal: 0, totalDiscount: 0,
    taxBreakdown: [], totalTax: 0, total: 100, paymentMethod: 'transferencia' as Invoice['paymentMethod'],
    notes: '', createdAt: '2026-09-10T10:30:00', updatedAt: '2026-09-10T10:30:00',
    ...p,
  } as Invoice;
}

const HOY = new Date(2026, 8, 24, 18, 0); // 24 sep 2026

describe('ritmo del mes', () => {
  it('proyecta el mes al paso actual y compara con los anteriores', () => {
    const r = ritmoDelMes([
      factura({ issueDate: '2026-09-02', total: 240 }),
      factura({ issueDate: '2026-09-30', total: 999 }), // futura: no es ritmo
      factura({ issueDate: '2026-08-15', total: 300 }),
      factura({ issueDate: '2026-07-15', total: 600 }),
      factura({ issueDate: '2025-09-15', total: 50 }),
      factura({ issueDate: '2026-09-03', total: 1000, status: InvoiceStatus.ANULADA }),
    ], HOY);
    expect(r.facturado).toBe(240);
    expect(r.proyeccion).toBe(300); // 240 / 24 días × 30
    expect(r.mesAnterior).toBe(300);
    expect(r.mediaTrimestre).toBe(300); // (300 + 600 + 0) / 3
    expect(r.mismoMesAnioPasado).toBe(50);
  });
});

describe('actividad diaria', () => {
  it('suma por día y excluye borradores y lo que cae fuera del año', () => {
    const a = actividadDiaria([
      factura({ issueDate: '2026-09-01', total: 10 }),
      factura({ issueDate: '2026-09-01', total: 15 }),
      factura({ issueDate: '2026-09-05', total: 40 }),
      factura({ issueDate: '2026-09-06', total: 99, status: InvoiceStatus.BORRADOR }),
      factura({ issueDate: '2025-01-01', total: 500 }),
    ], HOY);
    expect(a.dias).toEqual([{ day: '2026-09-01', value: 25 }, { day: '2026-09-05', value: 40 }]);
    expect(a.mejorDia).toEqual({ day: '2026-09-05', value: 40 });
    expect(a.mediaDiaActivo).toBe(32.5);
    expect(a.desde).toBe('2025-09-25');
  });
});

describe('cuándo se vende', () => {
  it('coloca cada venta en su día y franja, lunes primero', () => {
    const m = mapaHorario([
      factura({ createdAt: '2026-09-21T10:15:00', total: 20 }), // lunes 9–11
      factura({ createdAt: '2026-09-21T10:45:00', total: 30 }),
      factura({ createdAt: '2026-09-20T22:00:00', total: 5 }), // domingo ≥21
    ], HOY);
    expect(m.ventas).toBe(3);
    expect(m.filas[0].id).toBe('Lun');
    expect(m.filas[0].data[1]).toEqual({ x: '9–11', y: 50, ventas: 2 });
    expect(m.filas[6].data[7]).toMatchObject({ y: 5, ventas: 1 });
    expect(m.filas[2].data[3].y).toBeNull();
    expect(m.pico).toEqual({ dia: 'Lun', franja: '9–11', importe: 50 });
  });
});

describe('estado del cobro', () => {
  it('separa cobrado, en plazo y vencido, y reparte lo vencido por antigüedad', () => {
    const e = estadoCobro([
      factura({ status: InvoiceStatus.PAGADA, total: 100 }),
      factura({ status: InvoiceStatus.PENDIENTE, dueDate: '2026-10-01', total: 50 }),
      factura({ status: InvoiceStatus.PENDIENTE, dueDate: '2026-09-14', total: 30 }), // 10 días
      factura({ status: InvoiceStatus.VENCIDA, dueDate: '2026-06-01', total: 20 }), // 115 días
    ], HOY);
    expect(e.tramos.map(t => t.value)).toEqual([100, 50, 50]);
    expect(e.total).toBe(200);
    expect(e.antiguedad[0]).toMatchObject({ importe: 30, facturas: 1 });
    expect(e.antiguedad[3]).toMatchObject({ importe: 20, facturas: 1 });
  });
});

describe('días de cobro', () => {
  it('mide desde la emisión al pago y pondera por importe', () => {
    const d = diasDeCobro([
      factura({ status: InvoiceStatus.PAGADA, issueDate: '2026-09-01', dueDate: '2026-09-30', paidDate: '2026-09-11', total: 300 }),
      factura({ status: InvoiceStatus.PAGADA, issueDate: '2026-08-01', dueDate: '2026-08-15', paidDate: '2026-08-31', total: 100 }),
      factura({ status: InvoiceStatus.PENDIENTE, total: 999 }),
    ], HOY);
    expect(d.aTiempo).toHaveLength(1);
    expect(d.conRetraso[0].y).toBe(30);
    expect(d.periodoMedio).toBe(15); // (10·300 + 30·100) / 400
    expect(d.pctATiempo).toBe(75);
  });

  it('cuenta los días sin que el cambio de hora reste uno', () => {
    expect(diasEntre('2026-10-20', '2026-10-30')).toBe(10);
  });
});

describe('ranking de clientes', () => {
  it('ordena a los mejores entre sí cada mes', () => {
    const r = rankingClientes([
      factura({ clientId: 'a', clientName: 'A', issueDate: '2026-08-05', total: 500 }),
      factura({ clientId: 'b', clientName: 'B', issueDate: '2026-08-05', total: 100 }),
      factura({ clientId: 'b', clientName: 'B', issueDate: '2026-09-05', total: 300 }),
    ], HOY, 2);
    expect(r.map(s => s.id)).toEqual(['A', 'B']);
    expect(r[0].data).toEqual([{ x: 'Ago', y: 1, importe: 500 }, { x: 'Sep', y: 2, importe: 0 }]);
    expect(r[1].data[1]).toEqual({ x: 'Sep', y: 1, importe: 300 });
  });

  it('con un solo cliente no hay ranking que enseñar', () => {
    expect(rankingClientes([factura({})], HOY)).toEqual([]);
  });
});

describe('mapa de ventas', () => {
  it('agrupa las líneas por la categoría del producto', () => {
    const linea = (productId: string, productName: string, total: number) =>
      ({ id: productName, productId, productName, total, quantity: 1 }) as unknown as Invoice['lineItems'][number];
    const m = mapaDeVentas(
      [factura({ lineItems: [linea('p1', 'Café', 30), linea('p2', 'Tostada', 20), linea('x', 'Suelto', 5)] })],
      [{ id: 'p1', name: 'Café', category: 'Bebidas' }, { id: 'p2', name: 'Tostada', category: 'Cocina' }],
      HOY,
    );
    expect(m.total).toBe(55);
    expect(m.raiz.children?.map(c => c.id)).toEqual(['Bebidas', 'Cocina', 'Sin categoría']);
    expect(m.raiz.children?.[0].children?.[0]).toEqual({ id: 'Bebidas · Café', nombre: 'Café', value: 30 });
  });
});
