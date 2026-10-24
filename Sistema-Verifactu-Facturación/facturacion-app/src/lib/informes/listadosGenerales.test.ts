/* eslint-disable @typescript-eslint/no-explicit-any -- datos de prueba a medias */
import { describe, it, expect } from 'vitest';
import { InvoiceStatus } from '../types';
import { LISTADOS_GENERALES, listadoGeneralPorId, generarHoja, sumasDe, hojaComoCsv, type DatosListados } from './listadosGenerales';

const linea = (productId: string, quantity: number, unitPrice: number, taxRate = 7, costPrice?: number) => ({
  id: `${productId}-${quantity}`, productId, productName: productId.toUpperCase(), productRef: productId, quantity, unitPrice,
  taxRate, discountPercent: 0, subtotal: quantity * unitPrice, taxAmount: quantity * unitPrice * taxRate / 100, total: 0, costPrice,
});
const doc = (id: string, extra: Record<string, unknown>, lineas: any[]) => {
  const subtotal = lineas.reduce((s, l) => s + l.subtotal, 0);
  const totalTax = lineas.reduce((s, l) => s + l.taxAmount, 0);
  return { id, number: id.toUpperCase(), tipo: 'factura', sentido: 'venta', status: InvoiceStatus.EMITIDA, clientId: 'c1', clientName: 'Bar Pepe', clientNif: 'B1',
    issueDate: '2026-03-10', subtotal, totalTax, total: subtotal + totalTax, taxBreakdown: [], lineItems: lineas, paymentMethod: 'efectivo', ...extra };
};

const datos: DatosListados = {
  facturas: [
    doc('f1', {}, [linea('p1', 10, 2, 7, 1), linea('p2', 1, 50, 0)]),
    doc('a1', { tipo: 'albaran', status: InvoiceStatus.FACTURADO, issueDate: '2026-04-02' }, [linea('p1', 5, 2)]),
    doc('f2', { documentoOrigenId: 'a1', issueDate: '2026-04-30' }, [linea('p1', 5, 2)]),
    doc('fb', { status: InvoiceStatus.BORRADOR }, [linea('p1', 99, 2)]),
    doc('fc', { sentido: 'compra', clientId: 'prov', clientName: 'Almazara', issueDate: '2026-03-01' }, [linea('p1', 20, 1)]),
    doc('tk', { posSessionId: 's', paymentMethod: 'tarjeta', issueDate: '2026-03-11', clientId: 'w' }, [linea('p2', 1, 50, 0)]),
  ] as any,
  clientes: [
    { id: 'c1', businessName: 'Pepe SL', tradeName: 'Bar Pepe', nif: 'B1', active: true, defaultPaymentMethod: 'efectivo', paymentDays: 0 },
    { id: 'prov', businessName: 'Almazara', tradeName: '', nif: 'B2', active: true, esProveedor: true, defaultPaymentMethod: 'transferencia', paymentDays: 30 },
  ] as any,
  productos: [
    { id: 'p1', ref: 'p1', name: 'Aceite', category: 'aceites', unit: 'ud', unitPrice: 2, defaultTaxRate: 7, stockQuantity: 10, costePmp: 1, active: true },
    { id: 'p2', ref: 'p2', name: 'Jamón', category: 'charcuteria', unit: 'ud', unitPrice: 50, defaultTaxRate: 0, stockQuantity: -1, costePmp: 30, active: true },
  ] as any,
  movimientos: [
    { id: 'm1', tipo: 'cobro', fecha: '2026-03-12', contraparteId: 'c1', contraparteNombre: 'Bar Pepe', paymentMethod: 'efectivo', importeTotal: 100, desglose: [] },
  ] as any,
  categorias: [{ value: 'aceites', label: 'Aceites' }, { value: 'charcuteria', label: 'Charcutería' }],
  vendedores: [],
  formasDePago: [{ value: 'efectivo', label: 'Efectivo' }, { value: 'tarjeta', label: 'Tarjeta' }],
};

const hoja = (id: string, f = {}) => generarHoja(listadoGeneralPorId(id)!, datos, f);

describe('listados generales', () => {
  it('están los de la lista de siempre', () => {
    const ids = LISTADOS_GENERALES.map(l => l.id);
    for (const id of ['proveedores', 'clientes', 'articulos', 'precios', 'compras', 'ventas', 'compras_proveedores', 'ventas_clientes',
      'rentabilidad', 'caja', 'libro_ventas', 'libro_compras', 'inventario', 'historico', 'impuestos_compra', 'impuestos_venta']) {
      expect(ids).toContain(id);
    }
  });

  it('ventas por líneas: sin borradores y sin contar dos veces el albarán facturado', () => {
    const h = hoja('ventas');
    expect(sumasDe(h).unidades).toBe(10 + 1 + 5 + 1);
    expect(sumasDe(h).base).toBe(20 + 50 + 10 + 50);
    expect(sumasDe(hoja('ventas', { desde: '2026-04-01' })).unidades).toBe(5);
  });

  it('rentabilidad con el coste de la línea o el precio medio', () => {
    const f = hoja('rentabilidad').filas.find(x => x.ref === 'p1')!;
    // 10 a coste guardado 1 + 5 a PMP 1 = 15; venta 30.
    expect(f).toMatchObject({ uds: 15, venta: 30, coste: 15, margen: 15, pct: 50 });
  });

  it('libro e impuestos de venta: solo facturas emitidas, por tipo', () => {
    const imp = hoja('impuestos_venta');
    expect(imp.filas.map(x => x.tipo)).toEqual([0, 7]);
    expect(imp.filas.find(x => x.tipo === 7)).toMatchObject({ base: 30, cuota: 2.1 });
    expect(hoja('libro_ventas').filas.some(x => x.numero === 'A1' || x.numero === 'FB')).toBe(false);
    expect(sumasDe(hoja('impuestos_compra')).base).toBe(20);
  });

  it('caja junta cobros y tickets por forma de pago', () => {
    const h = hoja('caja');
    expect(h.filas.find(x => x.forma === 'Efectivo')).toMatchObject({ cobros: 100, nCobros: 1 });
    expect(h.filas.find(x => x.forma === 'Tarjeta')).toMatchObject({ tickets: 50, nTickets: 1 });
  });

  it('inventario: el negativo no suma valor', () => {
    expect(sumasDe(hoja('inventario'))).toMatchObject({ stock: 9, valor: 10 });
  });

  it('fichas, filtro de texto y CSV para Excel', () => {
    expect(hoja('proveedores').filas.map(x => x.nombre)).toEqual(['Almazara']);
    expect(hoja('articulos', { texto: 'jamon' }).filas.map(x => x.ref)).toEqual(['p2']);
    const csv = hojaComoCsv(hoja('ventas_clientes'));
    expect(csv.startsWith('﻿Cliente;NIF;')).toBe(true);
    expect(csv).toContain('TOTAL');
  });
});
