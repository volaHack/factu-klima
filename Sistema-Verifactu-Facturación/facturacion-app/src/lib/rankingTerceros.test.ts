import { describe, it, expect } from 'vitest';
import { casaConTipo, rankingDeKlima, rankingDelHistorico } from './rankingTerceros';
import type { Invoice } from './types';

const doc = (o: Partial<Invoice>): Invoice => ({
  id: Math.random().toString(36), number: 'F-1', series: 'F', clientId: 'c1', clientName: 'Bar Pepe',
  status: 'pendiente', tipo: 'factura', sentido: 'venta', total: 100, issueDate: '2026-10-01', lineItems: [], taxBreakdown: [],
  ...o,
} as unknown as Invoice);

describe('ranking de terceros', () => {
  it('cuenta sólo el tipo pedido y deja fuera borradores y anuladas', () => {
    expect(casaConTipo(doc({}), 'factura_venta')).toBe(true);
    expect(casaConTipo(doc({ status: 'borrador' as Invoice['status'] }), 'factura_venta')).toBe(false);
    expect(casaConTipo(doc({ status: 'anulada' as Invoice['status'] }), 'factura_venta')).toBe(false);
    expect(casaConTipo(doc({ tipo: 'albaran', number: 'ALB-1' }), 'albaran_venta')).toBe(true);
    expect(casaConTipo(doc({ tipo: 'albaran', number: 'ALB-1' }), 'factura_venta')).toBe(false);
  });

  it('no mezcla compras con ventas', () => {
    expect(casaConTipo(doc({ sentido: 'compra' }), 'factura_venta')).toBe(false);
    expect(casaConTipo(doc({ sentido: 'compra' }), 'factura_compra')).toBe(true);
    expect(casaConTipo(doc({ sentido: 'compra', tipo: 'albaran', number: 'ALB-2' }), 'albaran_compra')).toBe(true);
  });

  it('suma por ficha, ordena por importe y corta en el límite', () => {
    const docs = [
      doc({ clientId: 'a', total: 50 }), doc({ clientId: 'a', total: 70 }),
      doc({ clientId: 'b', total: 200 }), doc({ clientId: 'c', total: 10 }),
      doc({ clientId: 'c', total: 999, tipo: 'presupuesto', number: 'PRE-1' }),
    ];
    const r = rankingDeKlima(docs, id => ({ a: 'Ana', b: 'Bea' } as Record<string, string>)[id], 'factura_venta', 2);
    expect(r).toEqual([
      { id: 'b', name: 'Bea', total: 200, count: 1 },
      { id: 'a', name: 'Ana', total: 120, count: 2 },
    ]);
  });
});

describe('ranking del historial', () => {
  it('usa el nombre de la ficha y, sin ficha, el código del otro programa', () => {
    const r = rankingDelHistorico([
      { clientId: 'a', codigo: null, nombre: 'Viejo', documentos: 3, total: 300.004 },
      { clientId: null, codigo: '0042', nombre: null, documentos: 1, total: 90 },
      { clientId: null, codigo: '0043', nombre: null, documentos: 2, total: 0 },
    ], id => (id === 'a' ? 'Ana' : undefined));
    expect(r).toEqual([
      { id: 'a', name: 'Ana', total: 300, count: 3 },
      { id: 'cod-0042', name: 'Cód. 0042', total: 90, count: 1 },
    ]);
  });
});
