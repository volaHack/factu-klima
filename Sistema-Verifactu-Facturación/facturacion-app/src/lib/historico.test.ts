import { describe, it, expect } from 'vitest';

import { documentoDeFila, numeroVisible, quedoPendiente, resumenHistorico, type DocumentoHistorico } from './historico';

const doc = (o: Partial<DocumentoHistorico>): DocumentoHistorico => ({
  id: 'x', origen: 'isecan', tipo: 'factura_venta', serie: '26', numero: '26000001', fecha: '2026-01-02',
  base: 100, impuestos: 7, total: 107, bases: [], formaPago: null, observaciones: null, pasaA: [], ...o,
});

describe('número como lo conocían', () => {
  it('las facturas de ISECAN ya llevan el año en el número', () => {
    expect(numeroVisible({ serie: '24', numero: '24000001' })).toBe('24000001');
  });
  it('los pedidos no: serie delante', () => {
    expect(numeroVisible({ serie: 't24', numero: '100269' })).toBe('T24/100269');
    expect(numeroVisible({ serie: '', numero: '7' })).toBe('7');
  });
});

describe('qué quedó pendiente', () => {
  it('un albarán sin documento posterior no se facturó', () => {
    expect(quedoPendiente(doc({ tipo: 'albaran_venta' }))).toBe(true);
    expect(quedoPendiente(doc({ tipo: 'albaran_compra', pasaA: ['factura_compra:25/16'] }))).toBe(false);
  });
  it('una factura nunca está «pendiente de facturar»', () => {
    expect(quedoPendiente(doc({ tipo: 'factura_venta' }))).toBe(false);
  });
});

describe('resumen de la ficha', () => {
  const docs = [
    doc({ fecha: '2026-03-01', total: 107 }),
    doc({ fecha: '2026-09-15', total: 53.5 }),
    doc({ fecha: '2025-12-31', total: 0.1 }),
    doc({ fecha: '2025-06-01', total: 0.2 }),
    doc({ tipo: 'albaran_venta', fecha: '2026-10-01', total: 20 }),
    doc({ tipo: 'albaran_venta', fecha: '2026-10-02', total: 30, pasaA: ['factura_venta:26/26000009'] }),
    doc({ tipo: 'pedido_venta', fecha: '2026-10-20', total: 5.55 }),
  ];
  const r = resumenHistorico(docs);

  it('facturas por año, la más reciente primero, sin errores de redondeo', () => {
    expect(r.anios).toEqual([
      { anio: '2026', facturas: 2, total: 160.5 },
      { anio: '2025', facturas: 2, total: 0.3 },
    ]);
  });
  it('la última factura es la de fecha más alta, no la de un albarán', () => {
    expect(r.ultimaFactura).toBe('2026-09-15');
  });
  it('albaranes sin facturar y pedidos sin servir, aparte', () => {
    expect(r.pendientes).toEqual({ albaranes: 1, pedidos: 1, total: 25.55 });
  });
  it('sin documentos, un resumen vacío', () => {
    expect(resumenHistorico([])).toEqual({ anios: [], ultimaFactura: null, pendientes: { albaranes: 0, pedidos: 0, total: 0 } });
  });
});

describe('fila de la base de datos', () => {
  it('numeric llega como texto y se pasa a número', () => {
    const d = documentoDeFila({ id: 'a', origen: 'isecan', tipo: 'factura_compra', serie: '25', numero: '25000016',
      fecha: '2025-03-06', base: '704.32', impuestos: '47.17', total: '751.49', bases: [{ tipo: 7, base: 704.32, cuota: 47.17 }],
      forma_pago: 'Efectivo', observaciones: null, pasa_a: null });
    expect(d.total).toBe(751.49);
    expect(d.pasaA).toEqual([]);
    expect(d.formaPago).toBe('Efectivo');
  });
});
