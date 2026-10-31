/* eslint-disable @typescript-eslint/no-explicit-any -- datos de prueba a medias */
import { describe, it, expect } from 'vitest';
import {
  ultimoProveedorPorArticulo, articulosEnBorradorDeCompra, repartirPorProveedor, lineaDePedido,
  numerosDePedido, pedidoBorrador, proveedorDeFicha, grupoCon,
} from './pedidoCompra';
import { InvoiceStatus, PaymentMethod } from './types';
import { desgloseLinea } from './cajas';

const producto = (id: string, extra: Record<string, unknown> = {}) => ({
  id, name: `Artículo ${id}`, ref: `R-${id}`, unit: 'ud', unitPrice: 2, defaultTaxRate: 7, purchasePrice: 1.2, active: true, ...extra,
}) as any;

const compra = (id: string, fecha: string, proveedor: string, productos: string[], extra: Record<string, unknown> = {}) => ({
  id, number: `PC-${id}`, tipo: 'albaran', sentido: 'compra', status: 'expedido', issueDate: fecha, createdAt: fecha,
  clientId: proveedor, clientName: `Proveedor ${proveedor}`, clientNif: `B${proveedor}`, clientAddress: 'Polígono',
  paymentMethod: PaymentMethod.DOMICILIACION,
  lineItems: productos.map(p => ({ productId: p, quantity: 10 })), ...extra,
}) as any;

const reponer = (id: string, sugerido: number, extra: Record<string, unknown> = {}) => ({
  id, nombre: `Artículo ${id}`, ref: `R-${id}`, unidad: 'ud', stock: 0, porRecibir: 0, porDia: 1, diasQuedan: 0,
  sugerido, cajas: null, udsCaja: null, urgencia: 'agotado', ...extra,
}) as any;

describe('a quién se le compra cada artículo', () => {
  it('al de la última compra; ni borradores ni anulados cuentan', () => {
    const docs = [
      compra('1', '2026-08-01', 'p1', ['a']),
      compra('2', '2026-09-01', 'p2', ['a']),
      compra('3', '2026-10-01', 'p3', ['a'], { status: 'borrador' }),
      compra('4', '2026-10-02', 'p4', ['a'], { status: 'anulada' }),
      { ...compra('5', '2026-10-03', 'p5', ['a']), sentido: 'venta' },
    ];
    expect(ultimoProveedorPorArticulo(docs).get('a')?.clientId).toBe('p2');
  });

  it('sin ficha, el proveedor se reconoce por el nombre', () => {
    const docs = [compra('1', '2026-08-01', '', ['a'], { clientName: 'Frutas Paco' })];
    expect(ultimoProveedorPorArticulo(docs).get('a')?.clave).toBe('nombre:frutas paco');
  });

  it('sabe qué está ya en un borrador de pedido de compra', () => {
    const docs = [compra('1', '2026-10-01', 'p1', ['a'], { tipo: 'pedido', status: 'borrador' }), compra('2', '2026-10-01', 'p1', ['b'])];
    expect([...articulosEnBorradorDeCompra(docs)]).toEqual(['a']);
  });
});

describe('repartir por proveedor', () => {
  const productos = [producto('a'), producto('b', { purchasePrice: 0, costeUltimaCompra: 3, supplierRef: 'X-9' }), producto('c'), producto('d')];
  const docs = [
    compra('1', '2026-09-01', 'p1', ['a', 'b']),
    compra('2', '2026-09-01', 'p2', ['c']),
    compra('3', '2026-10-01', 'p2', ['d'], { tipo: 'pedido', status: 'borrador' }),
  ];

  it('un grupo por proveedor, con el precio de compra y la base', () => {
    const r = repartirPorProveedor([reponer('a', 10), reponer('b', 24, { cajas: 2, udsCaja: 12 }), reponer('c', 5)], productos, docs);
    expect(r.grupos.map(g => [g.proveedor.clientId, g.lineas.map(l => l.productId), g.base])).toEqual([
      ['p1', ['a', 'b'], 84], ['p2', ['c'], 6],
    ]);
    expect(r.grupos[0].lineas[1]).toMatchObject({ precio: 3, cajas: 2, udsCaja: 12, supplierRef: 'X-9' });
  });

  it('lo nunca comprado va aparte y lo que ya está en borrador no se repite', () => {
    const r = repartirPorProveedor([reponer('d', 5), reponer('e', 5), reponer('a', 0)], [...productos, producto('e')], docs);
    expect(r.grupos).toEqual([]);
    expect(r.sinProveedor.map(l => l.productId)).toEqual(['e']);
    expect(r.yaEnBorrador).toEqual(['Artículo d']);
  });
});

describe('lo nunca comprado, con el proveedor elegido a mano', () => {
  it('sale de su ficha, con su forma de pago', () => {
    const p = proveedorDeFicha({ id: 'p9', businessName: 'Frutas Paco', nif: 'B9', address: 'C/ Mayor 1', city: 'La Laguna', defaultPaymentMethod: PaymentMethod.PAGARE });
    expect(p).toEqual({ clave: 'id:p9', clientId: 'p9', clientName: 'Frutas Paco', clientNif: 'B9', clientAddress: 'C/ Mayor 1, La Laguna', paymentMethod: PaymentMethod.PAGARE });
    const g = grupoCon(p, [{ productId: 'e', nombre: 'E', ref: 'E', unidades: 3, cajas: null, udsCaja: null, precio: 2.5, taxRate: 7, unidad: 'ud' }]);
    expect(g.base).toBe(7.5);
  });
});

describe('el borrador de pedido', () => {
  it('va por unidades con la casilla de cajas: 2 cajas de 12 son 24 unidades', () => {
    const l = lineaDePedido({ productId: 'a', nombre: 'Agua', ref: 'A', unidades: 24, cajas: 2, udsCaja: 12, precio: 0.5, taxRate: 3, unidad: 'ud' });
    expect(desgloseLinea(l)).toMatchObject({ cajas: 2, udsCaja: 12, unidades: 24, sueltas: 0 });
    expect(l).toMatchObject({ subtotal: 12, taxAmount: 0.36, total: 12.36 });
  });

  it('sin cajas, no lleva unidades por caja (no se leería como línea de antes)', () => {
    const l = lineaDePedido({ productId: 'a', nombre: 'Agua', ref: 'A', unidades: 7, cajas: null, udsCaja: null, precio: 1, taxRate: 7, unidad: 'ud' });
    expect(l.unitsPerPackage).toBeUndefined();
    expect(l.cajas).toBeUndefined();
  });

  it('numera seguido en la serie de pedidos de compra', () => {
    const settings = { seriesDocumentos: { pedido_compra: { serie: 'PEDC', nextNumber: 7 } } } as any;
    expect(numerosDePedido(settings, 2, new Date(2026, 9, 31)).map(n => n.number)).toEqual(['PEDC-2026-0007', 'PEDC-2026-0008']);
  });

  it('sale siempre en borrador, de compra, con el proveedor y sus totales', () => {
    const grupo = {
      proveedor: { clave: 'id:p1', clientId: 'p1', clientName: 'Proveedor 1', clientNif: 'B1', clientAddress: 'Polígono', paymentMethod: PaymentMethod.DOMICILIACION },
      lineas: [{ productId: 'a', nombre: 'Agua', ref: 'A', supplierRef: 'X-1', unidades: 10, cajas: null, udsCaja: null, precio: 1, taxRate: 7, unidad: 'ud' }],
      base: 10,
    };
    const d = pedidoBorrador(grupo, { series: 'PEDC', number: 'PEDC-2026-0007' }, new Date('2026-10-31T10:00:00Z'));
    expect(d).toMatchObject({
      tipo: 'pedido', sentido: 'compra', status: InvoiceStatus.BORRADOR, clientId: 'p1', issueDate: '2026-10-31',
      paymentMethod: PaymentMethod.DOMICILIACION, subtotal: 10, totalTax: 0.7, total: 10.7,
    });
    expect(d.notes).toContain('X-1 (Agua)');
  });
});
