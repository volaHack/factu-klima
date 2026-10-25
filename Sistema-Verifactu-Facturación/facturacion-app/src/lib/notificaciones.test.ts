import { describe, it, expect } from 'vitest';
import { avisosDeLaCampana, diasHasta } from './notificaciones';
import type { Invoice, Product } from './types';

const hoy = new Date(2026, 9, 25, 18, 30); // 25-10-2026 por la tarde

const factura = (o: Partial<Invoice>): Invoice => ({
  id: 'f', number: 'F-1', series: 'F', clientName: 'Bar Pepe', status: 'pendiente', tipo: 'factura', sentido: 'venta',
  total: 100, dueDate: '2026-10-20', issueDate: '2026-10-01', lineItems: [], taxBreakdown: [],
  ...o,
} as unknown as Invoice);

const articulo = (o: Partial<Product>): Product => ({
  id: 'p', ref: 'A-1', name: 'Agua 1,5 L', active: true, stockQuantity: 10, ...o,
} as unknown as Product);

describe('avisos de la campana', () => {
  it('cuenta los días por fecha, sin que importe la hora', () => {
    expect(diasHasta('2026-10-25', hoy)).toBe(0);
    expect(diasHasta('2026-10-26', hoy)).toBe(1);
    expect(diasHasta('2026-10-20', hoy)).toBe(-5);
  });

  it('sólo facturas de venta sin cobrar, con lo que falta por cobrar', () => {
    const r = avisosDeLaCampana([
      factura({ id: 'a', total: 100 }),
      factura({ id: 'b', status: 'parcial' as Invoice['status'], total: 100, paidAmount: 40 }),
      factura({ id: 'c', status: 'borrador' as Invoice['status'] }),
      factura({ id: 'd', status: 'pagada' as Invoice['status'] }),
      factura({ id: 'e', sentido: 'compra' }),
      factura({ id: 'g', tipo: 'albaran', number: 'ALB-1' }),
      factura({ id: 'h', dueDate: '2026-12-01' }),
    ], [], hoy);
    expect(r.avisos.map(a => [a.id, a.cifra])).toEqual([['factura-a', 100], ['factura-b', 60]]);
    expect(r.vencidas).toBe(2);
    expect(r.importeVencido).toBe(160);
    expect(r.avisos[0].detalle).toBe('F-1 · vencida hace 5 días');
  });

  it('las que vencen esta semana, la más cercana primero', () => {
    const r = avisosDeLaCampana([
      factura({ id: 'x', dueDate: '2026-10-30' }),
      factura({ id: 'y', dueDate: '2026-10-25' }),
      factura({ id: 'z', dueDate: '2026-10-26' }),
    ], [], hoy);
    expect(r.avisos.map(a => a.detalle)).toEqual(['F-1 · vence hoy', 'F-1 · vence mañana', 'F-1 · vence en 5 días']);
    expect(r.vencen).toBe(3);
  });

  it('stock: agotados primero, sin artículos que no llevan existencias', () => {
    const r = avisosDeLaCampana([], [
      articulo({ id: 'bajo', stockQuantity: 3, lowStockThreshold: 4 }),
      articulo({ id: 'cero', name: 'Aceite', stockQuantity: 0 }),
      articulo({ id: 'bien', stockQuantity: 50 }),
      articulo({ id: 'servicio', stockQuantity: undefined }),
      articulo({ id: 'inactivo', active: false, stockQuantity: 0 }),
    ], hoy);
    expect(r.avisos.map(a => a.id)).toEqual(['stock-cero', 'stock-bajo']);
    expect(r.avisos[1].detalle).toBe('A-1 · quedan 3 · mínimo 4');
    expect(r.stock).toBe(2);
  });
});
