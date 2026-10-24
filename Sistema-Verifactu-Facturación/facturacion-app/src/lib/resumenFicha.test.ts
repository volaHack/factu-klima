/* eslint-disable @typescript-eslint/no-explicit-any -- datos de prueba a medias */
import { describe, it, expect } from 'vitest';
import { InvoiceStatus } from './types';
import { resumenDeFicha } from './resumenFicha';
import { habitualesDe, fichasFrecuentes } from './documentos';

const doc = (id: string, extra: Record<string, unknown>, productos: string[] = []) => ({
  id, number: id, tipo: 'factura', sentido: 'venta', status: InvoiceStatus.EMITIDA, clientId: 'c1', issueDate: '2026-10-01', dueDate: '2026-10-31',
  total: 100, paidAmount: 0, lineItems: productos.map(p => ({ productId: p })), ...extra,
}) as any;

describe('resumen del cliente elegido', () => {
  it('lo que debe, lo vencido, lo de este año y el último documento', () => {
    const docs = [
      doc('F1', { dueDate: '2026-09-01' }),
      doc('F2', { paidAmount: 40, issueDate: '2026-10-10' }),
      doc('F3', { status: InvoiceStatus.PAGADA, paidAmount: 100 }),
      doc('A1', { tipo: 'albaran', issueDate: '2026-10-20', total: 55 }),
      doc('F0', { issueDate: '2025-05-01', status: InvoiceStatus.PAGADA }),
      doc('X', { clientId: 'otro' }),
    ];
    expect(resumenDeFicha(docs, 'c1', '2026-10-24')).toEqual({
      pendiente: 160, facturasPendientes: 2, vencidas: 1, importeVencido: 100, facturadoAnio: 300,
      ultimo: { tipo: 'Albarán', numero: 'A1', fecha: '2026-10-20', total: 55 },
    });
  });

  it('lo que suele pedir y las fichas de más movimiento', () => {
    const docs = [doc('1', {}, ['a', 'b']), doc('2', {}, ['a']), doc('3', { clientId: 'c2' }, ['z']), doc('4', { clientId: 'c2', issueDate: '2026-10-02' }, ['z'])];
    expect(habitualesDe(docs, 'c1', 'venta')).toEqual(['a', 'b']);
    expect(habitualesDe(docs, 'c1', 'compra')).toEqual([]);
    expect(fichasFrecuentes(docs, 8, new Date('2026-10-24'))).toEqual(['c1', 'c2']);
  });
});
