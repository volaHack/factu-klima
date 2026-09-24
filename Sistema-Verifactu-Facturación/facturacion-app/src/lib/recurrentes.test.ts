import { describe, expect, it, vi } from 'vitest';

vi.mock('./storage', () => ({}));
vi.mock('./cuentaMetadatos', () => ({}));

import { InvoiceStatus, PaymentMethod, type Invoice } from './types';
import { borradorDesde, fechasPendientes, primeraFecha, puedeSerRecurrente, siguienteFecha, type Recurrente } from './recurrentes';

const rec = (over: Partial<Recurrente>): Recurrente => ({
  id: 'r1', origenId: 'f1', origenNumero: 'FAC-2026-0001', cliente: 'Acme', importe: 121, periodo: 'mes',
  proxima: '2026-01-31', dia: 31, activa: true, creadas: 0, ...over,
});

describe('calendario', () => {
  it('fin de mes: el 31 cae en el último día y vuelve al 31', () => {
    expect(siguienteFecha('2026-01-31', 'mes', 31)).toBe('2026-02-28');
    expect(siguienteFecha('2026-02-28', 'mes', 31)).toBe('2026-03-31');
    expect(siguienteFecha('2028-01-31', 'mes', 31)).toBe('2028-02-29');
  });

  it('trimestre, semestre y año cruzan de año', () => {
    expect(siguienteFecha('2026-11-15', 'trimestre', 15)).toBe('2027-02-15');
    expect(siguienteFecha('2026-09-01', 'semestre', 1)).toBe('2027-03-01');
    expect(siguienteFecha('2026-03-05', 'anio', 5)).toBe('2027-03-05');
  });

  it('la primera fecha no se queda en el pasado', () => {
    expect(primeraFecha('2026-01-10', 'mes', '2026-04-20')).toBe('2026-05-10');
    expect(primeraFecha('2026-04-10', 'mes', '2026-04-20')).toBe('2026-05-10');
  });

  it('pendientes: todas las que han llegado, con tope y respetando el fin', () => {
    expect(fechasPendientes(rec({}), '2026-04-15')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    expect(fechasPendientes(rec({ hasta: '2026-02-28' }), '2026-04-15')).toEqual(['2026-01-31', '2026-02-28']);
    expect(fechasPendientes(rec({ activa: false }), '2026-04-15')).toEqual([]);
    expect(fechasPendientes(rec({ proxima: '2020-01-01', dia: 1 }), '2026-04-15')).toHaveLength(12);
  });
});

const origen: Invoice = {
  id: 'f1', number: 'FAC-2026-0001', series: 'FAC', clientId: 'c1', clientName: 'Acme SL', clientNif: 'B12345674', clientAddress: 'Calle 1',
  issueDate: '2026-01-10', dueDate: '2026-02-09', paidDate: '2026-02-01', status: InvoiceStatus.PAGADA,
  lineItems: [{ id: 'l1', productName: 'Mantenimiento', quantity: 1, unitPrice: 100, taxRate: 21 } as Invoice['lineItems'][number]],
  subtotal: 100, totalDiscount: 0, taxBreakdown: [], totalTax: 21, total: 121, paymentMethod: PaymentMethod.TRANSFERENCIA,
  notes: 'Cuota mensual', paidAmount: 121, paymentRecordIds: ['p1'], verifactu: { hash: 'x' } as unknown as Invoice['verifactu'],
  datosExtras: { col: 'a' }, createdAt: '', updatedAt: '',
};

describe('borrador', () => {
  it('copia cliente, líneas y notas; limpia cobro, sello y fechas', () => {
    const b = borradorDesde(origen, '2026-02-10', 'FAC-2026-0007', 'FAC', 'r1');
    expect(b.id).not.toBe(origen.id);
    expect(b.status).toBe(InvoiceStatus.BORRADOR);
    expect(b.number).toBe('FAC-2026-0007');
    expect(b.issueDate).toBe('2026-02-10');
    expect(b.dueDate).toBe('2026-03-12'); // mismo plazo: 30 días
    expect(b.clientNif).toBe('B12345674');
    expect(b.notes).toBe('Cuota mensual');
    expect(b.paidAmount).toBe(0);
    expect(b.paidDate).toBeUndefined();
    expect(b.paymentRecordIds).toEqual([]);
    expect(b.verifactu).toBeUndefined();
    expect(b.lineItems[0].id).not.toBe('l1');
    expect(b.lineItems[0].productName).toBe('Mantenimiento');
    expect(b.datosExtras).toEqual({ col: 'a', recurrente: 'r1' });
  });

  it('sólo facturas de venta vivas', () => {
    expect(puedeSerRecurrente(origen)).toBe(true);
    expect(puedeSerRecurrente({ ...origen, sentido: 'compra' })).toBe(false);
    expect(puedeSerRecurrente({ ...origen, tipo: 'rectificativa' })).toBe(false);
    expect(puedeSerRecurrente({ ...origen, status: InvoiceStatus.ANULADA })).toBe(false);
    expect(puedeSerRecurrente({ ...origen, posSessionId: 's' })).toBe(false);
  });
});
