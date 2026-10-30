import { describe, it, expect } from 'vitest';
import { revisarAntesDeEmitir, type FacturaARevisar } from './revisionEmision';
import type { Invoice } from './types';

const base = (o: Partial<FacturaARevisar> = {}): FacturaARevisar => ({
  lineas: [{ productId: 'agua', productName: 'Agua', quantity: 24, unitPrice: 0.5, discountPercent: 0 }],
  clienteId: 'bar',
  clienteNombre: 'Bar de la esquina',
  // NIF de ejemplo con la letra bien calculada.
  clienteNif: '12345678Z',
  clienteDireccion: 'Calle Mayor 1, 28001 Madrid',
  fechaEmision: '2026-10-30',
  fechaVencimiento: '2026-11-29',
  total: 13.2,
  ...o,
});

const factura = (o: Partial<Invoice>): Invoice => ({
  id: Math.random().toString(36), number: 'F-1', series: 'F', clientId: 'bar', clientName: 'Bar de la esquina', status: 'emitida',
  tipo: 'factura', sentido: 'venta', total: 100, issueDate: '2026-10-01', lineItems: [], taxBreakdown: [], ...o,
} as unknown as Invoice);

const ids = (f: FacturaARevisar, docs: Invoice[] = []) => revisarAntesDeEmitir(f, docs).map(p => p.id);

describe('el repaso antes de emitir', () => {
  it('una factura normal no tiene nada que revisar', () => {
    expect(revisarAntesDeEmitir(base())).toEqual([]);
  });

  it('líneas a 0 € o sin cantidad; las líneas vacías no cuentan', () => {
    const f = base({ lineas: [
      { productId: 'a', productName: 'Agua', quantity: 2, unitPrice: 0 },
      { productId: 'b', productName: 'Cola', quantity: 0, unitPrice: 1 },
      { productId: '', productName: '', quantity: 1, unitPrice: 0 },
    ] });
    const r = revisarAntesDeEmitir(f);
    expect(r.map(p => p.id)).toEqual(['precio-cero', 'cantidad-cero']);
    expect(r[0].detalle).toContain('la línea 1 (Agua)');
    expect(r[1].detalle).toContain('La línea 2 (Cola)');
  });

  it('un NIF que no cuadra, pero no a extranjeros ni intracomunitarios', () => {
    expect(ids(base({ clienteNif: '12345678A' }))).toEqual(['nif']);
    expect(revisarAntesDeEmitir(base({ clienteNif: 'HOLA' }))[0].detalle).toMatch(/no tiene forma/);
    expect(ids(base({ clienteNif: '12345678A', clientePais: 'FR' }))).toEqual([]);
    expect(ids(base({ clienteNif: 'FR123', intracomunitaria: true }))).toEqual([]);
    expect(ids(base({ clienteNif: '' }))).toEqual([]);
  });

  it('el cliente sin dirección (también la que sólo tiene comas)', () => {
    expect(ids(base({ clienteDireccion: '' }))).toEqual(['direccion']);
    expect(ids(base({ clienteDireccion: ',  ' }))).toEqual(['direccion']);
    // Una simplificada no la necesita.
    expect(ids(base({ clienteDireccion: '', simplificada: true }))).toEqual([]);
  });

  it('el vencimiento anterior a la emisión', () => {
    expect(ids(base({ fechaVencimiento: '2026-10-29' }))).toEqual(['vencimiento']);
    expect(ids(base({ fechaVencimiento: '2026-10-30' }))).toEqual([]);
  });

  it('la misma factura al mismo cliente en la última semana', () => {
    const r = revisarAntesDeEmitir(base(), [factura({ number: 'F-77', issueDate: '2026-10-26', total: 13.2 })]);
    expect(r.map(p => p.id)).toEqual(['duplicada']);
    expect(r[0].detalle).toContain('F-77 del 26/10/2026');
    // Un borrador igual también se dice.
    expect(revisarAntesDeEmitir(base(), [factura({ status: 'borrador' as Invoice['status'], issueDate: '2026-10-30', total: 13.2 })])[0].detalle).toMatch(/^El borrador/);
    // Hace más de una semana, otro importe, otro cliente o anulada: no.
    expect(ids(base(), [factura({ issueDate: '2026-10-20', total: 13.2 })])).toEqual([]);
    expect(ids(base(), [factura({ issueDate: '2026-10-29', total: 13.3 })])).toEqual([]);
    expect(ids(base(), [factura({ issueDate: '2026-10-29', total: 13.2, clientId: 'hotel' })])).toEqual([]);
    expect(ids(base(), [factura({ issueDate: '2026-10-29', total: 13.2, status: 'anulada' as Invoice['status'] })])).toEqual([]);
    expect(ids(base(), [factura({ issueDate: '2026-10-29', total: 13.2, tipo: 'albaran' })])).toEqual([]);
  });

  it('descuentos muy altos, en cascada, en la línea y al pie', () => {
    const conDto = base({ lineas: [{ productId: 'a', productName: 'Agua', quantity: 1, unitPrice: 10, discountPercent: 30, discountPercent2: 30 }] });
    // 30 % + 30 % en cascada son un 51 %.
    expect(revisarAntesDeEmitir(conDto)[0]).toMatchObject({ id: 'descuento-linea' });
    expect(revisarAntesDeEmitir(conDto)[0].detalle).toContain('51 %');
    expect(ids(base({ lineas: [{ productId: 'a', quantity: 1, unitPrice: 10, discountPercent: 40 }] }))).toEqual([]);
    expect(ids(base({ descuentosPie: [20, 15, 0] }))).toEqual(['descuento-pie']);
    expect(ids(base({ descuentosPie: [10, 5, 0] }))).toEqual([]);
  });

  it('un total muy por encima de lo habitual del cliente, y el cero de más', () => {
    const historia = [100, 110, 90, 105].map((t, i) => factura({ total: t, issueDate: `2026-0${i + 5}-01` }));
    const r = revisarAntesDeEmitir(base({ total: 1025 }), historia);
    expect(r.map(p => p.id)).toEqual(['total-alto']);
    expect(r[0].detalle).toMatch(/cero de más/);
    expect(revisarAntesDeEmitir(base({ total: 450 }), historia)[0].detalle).not.toMatch(/cero/);
    // Lo normal, poco historial o importes pequeños: no se dice nada.
    expect(ids(base({ total: 200 }), historia)).toEqual([]);
    expect(ids(base({ total: 1025 }), historia.slice(0, 2))).toEqual([]);
    const pequenas = [10, 12, 11].map(t => factura({ total: t, issueDate: '2026-09-01' }));
    expect(ids(base({ total: 60 }), pequenas)).toEqual([]);
  });
});
