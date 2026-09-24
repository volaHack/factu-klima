import { describe, expect, it } from 'vitest';
import { InvoiceStatus, PaymentMethod, type Albaran, type Invoice, type Lote, type Product } from './types';
import {
  abiertos, albaranesSinFacturar, bajoMinimos, borradores, impuestosTrimestre, lotesCaducando, margenMes, paradoEnAlmacen,
} from './panelDatos';
import { FICHAS, colocar, fichasVisibles } from './panel';

const HOY = '2026-09-24';

const doc = (over: Partial<Invoice>): Invoice => ({
  id: 'f1', number: 'FAC-1', series: 'FAC', clientId: 'c1', clientName: 'Acme', clientNif: '', clientAddress: '',
  issueDate: '2026-09-10', dueDate: '2026-10-10', status: InvoiceStatus.EMITIDA, lineItems: [], subtotal: 100,
  totalDiscount: 0, taxBreakdown: [{ rate: 21, base: 100, amount: 21 }], totalTax: 21, total: 121,
  paymentMethod: PaymentMethod.TRANSFERENCIA, notes: '', createdAt: '2026-09-10', updatedAt: '2026-09-10', tipo: 'factura', sentido: 'venta',
  ...over,
});
const linea = (over: object) => ({ id: 'l', productId: 'p1', productName: 'X', productRef: '', quantity: 2, unitPrice: 50, unit: 'ud', taxRate: 21, discountPercent: 0, subtotal: 100, taxAmount: 21, total: 121, ...over }) as Invoice['lineItems'][number];
const prod = (over: Partial<Product>): Product => ({ id: 'p1', name: 'Tornillo', active: true, stockQuantity: 10, ...over } as Product);

describe('fichas del panel', () => {
  it('margen del mes: coste guardado en la línea, o el del artículo; avisa de las líneas sin coste', () => {
    const m = margenMes([
      doc({ lineItems: [linea({ costPrice: 30 }), linea({ id: 'l2', productId: 'p2', subtotal: 50, quantity: 1 }), linea({ id: 'l3', productId: 'p3', subtotal: 40 })] }),
      doc({ id: 'f2', issueDate: '2026-08-30', lineItems: [linea({ costPrice: 1 })] }), // otro mes
      doc({ id: 'f3', status: InvoiceStatus.ANULADA, lineItems: [linea({})] }),
    ], [prod({ id: 'p2', costePmp: 20 })], HOY);
    expect(m).toMatchObject({ ventas: 190, coste: 80, margen: 110, lineasSinCoste: 1 });
    expect(m.porcentaje).toBe(57.9);
  });

  it('margen: un coste 0 es «no se sabe», y sin ningún coste no se inventa un 100 %', () => {
    const m = margenMes([doc({ lineItems: [linea({ costPrice: 0 })] })], [prod({ costePmp: 0, costeUltimaCompra: 0 })], HOY);
    expect(m).toMatchObject({ ventas: 100, margen: 0, porcentaje: null, lineasSinCoste: 1 });
  });

  it('borradores de cualquier documento, el más antiguo primero', () => {
    const b = borradores([
      doc({ status: InvoiceStatus.BORRADOR, updatedAt: '2026-09-20' }),
      doc({ id: 'p', tipo: 'presupuesto', status: InvoiceStatus.BORRADOR, updatedAt: '2026-09-01', total: 50 }),
      doc({ id: 'e' }),
    ], HOY);
    expect(b.lista.map(x => x.id)).toEqual(['p', 'f1']);
    expect(b.total).toBe(171);
    expect(b.lista[0].href).toBe('/documentos/p');
  });

  it('presupuestos y pedidos abiertos: dejan de estarlo al convertirse o cerrarse', () => {
    const docs = [
      doc({ id: 'pr1', tipo: 'presupuesto', issueDate: '2026-09-01' }),
      doc({ id: 'pr2', tipo: 'presupuesto' }),
      doc({ id: 'pe1', tipo: 'pedido', documentoOrigenId: 'pr2' }), // pr2 se convirtió
      doc({ id: 'pe2', tipo: 'pedido', status: InvoiceStatus.FACTURADO }),
      doc({ id: 'pc1', tipo: 'pedido', sentido: 'compra' }),
    ];
    expect(abiertos(docs, 'presupuesto', 'venta', HOY).map(d => d.id)).toEqual(['pr1']);
    expect(abiertos(docs, 'pedido', 'venta', HOY).map(d => d.id)).toEqual(['pe1']);
    expect(abiertos(docs, 'pedido', 'compra', HOY).map(d => d.id)).toEqual(['pc1']);
  });

  it('albaranes expedidos sin factura', () => {
    const a = (over: Partial<Albaran>) => ({ id: 'a', number: 'ALB-1', clientName: 'Acme', issueDate: '2026-09-01', total: 50, status: 'expedido', ...over }) as Albaran;
    expect(albaranesSinFacturar([a({}), a({ id: 'b', invoiceId: 'f' }), a({ id: 'c', status: 'borrador' })], HOY).map(x => x.id)).toEqual(['a']);
  });

  it('almacén: bajo mínimos, parado y lotes por caducar', () => {
    expect(bajoMinimos([prod({ stockQuantity: 2, lowStockThreshold: 5 }), prod({ id: 'p2', stockQuantity: 9, lowStockThreshold: 5 }), prod({ id: 'p3', stockQuantity: 0 })]).map(p => p.id)).toEqual(['p1']);
    const parados = paradoEnAlmacen(
      [prod({ costePmp: 2 }), prod({ id: 'p2' }), prod({ id: 'p3', stockQuantity: 0 })],
      [doc({ issueDate: '2026-09-01', lineItems: [linea({ productId: 'p2' })] }), doc({ id: 'v', issueDate: '2026-01-01', lineItems: [linea({})] })],
      HOY,
    );
    expect(parados.map(p => p.id)).toEqual(['p1']);
    expect(parados[0]).toMatchObject({ valor: 20 });
    const lote = (over: Partial<Lote>) => ({ id: 'l', productName: 'Yogur', codigo: 'L1', cantidadDisponible: 5, fechaCaducidad: '2026-09-26', ...over }) as Lote;
    const c = lotesCaducando([lote({}), lote({ id: 'x', fechaCaducidad: '2026-12-01' }), lote({ id: 'y', cantidadDisponible: 0 }), lote({ id: 'z', fechaCaducidad: '2026-09-20' })], HOY);
    expect(c.map(l => l.id)).toEqual(['z', 'l']);
    expect(c[0].detalle).toBe('caducado hace 4 días');
  });

  it('impuestos del trimestre en curso, por tipo', () => {
    const t = impuestosTrimestre([
      doc({}), doc({ id: 'b', taxBreakdown: [{ rate: 10, base: 50, amount: 5 }, { rate: 21, base: 10, amount: 2.1 }] }),
      doc({ id: 'c', issueDate: '2026-06-30' }), // otro trimestre
    ], HOY);
    expect(t.trimestre).toBe(3);
    expect(t.tipos).toEqual([{ tipo: 21, base: 110, cuota: 23.1 }, { tipo: 10, base: 50, cuota: 5 }]);
  });
});

describe('colocación del panel', () => {
  it('respeta el orden: cifras arriba, grandes a todo el ancho y medianas por turnos', () => {
    const f = fichasVisibles(['productos_top', 'facturado_mes', 'clientes_top', 'analisis_negocio', 'vencido', 'reparto_estado', 'formas_pago', 'evolucion_ventas'], []);
    const { cifras, bloques } = colocar(f);
    expect(cifras).toEqual(['facturado_mes', 'vencido']);
    expect(bloques).toEqual([
      { tipo: 'pareja', izquierda: ['productos_top'], derecha: ['clientes_top'] },
      { tipo: 'grande', id: 'analisis_negocio' },
      { tipo: 'pareja', izquierda: ['reparto_estado', 'evolucion_ventas'], derecha: ['formas_pago'] },
    ]);
  });

  it('las fichas que ya no existen o cuyo módulo está apagado no salen', () => {
    const f = fichasVisibles(['facturado_mes', 'sii_pendientes' as never, 'albaranes_sin_facturar'], []);
    expect(f.map(x => x.id)).toEqual(['facturado_mes']);
    expect(fichasVisibles(['albaranes_sin_facturar'], ['albaranes']).map(x => x.id)).toEqual(['albaranes_sin_facturar']);
  });

  it('todas las fichas del catálogo tienen tamaño', () => {
    for (const f of FICHAS) expect(['pequena', 'mediana', 'grande']).toContain(f.tamano);
  });
});
