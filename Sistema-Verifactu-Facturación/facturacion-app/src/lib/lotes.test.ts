import { describe, it, expect } from 'vitest';
import {
  trazabilidadDeLote, resumenDeLote, lotesDisponibles, consumirLote,
  lotesCaducando, diasHastaCaducidad, aplicarLoteALinea,
} from './lotes';
import { InvoiceStatus, type Invoice, type InvoiceLineItem, type Lote } from './types';

const lote = (extra: Partial<Lote> = {}): Lote => ({
  id: 'l1', productId: 'p1', productRef: 'REF1', productName: 'Leche',
  codigo: 'L-4471', fechaEntrada: '2026-01-01',
  cantidadEntrada: 100, cantidadDisponible: 100,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  ...extra,
});

const linea = (extra: Partial<InvoiceLineItem> = {}): InvoiceLineItem => ({
  id: crypto.randomUUID(), productId: 'p1', productName: 'Leche', productRef: 'REF1',
  quantity: 10, unitPrice: 1, unit: 'ud' as never, taxRate: 21,
  discountPercent: 0, subtotal: 10, taxAmount: 2.1, total: 12.1,
  loteId: 'l1',
  ...extra,
});

const factura = (extra: Partial<Invoice> = {}): Invoice => ({
  id: crypto.randomUUID(), number: 'FAC-1', series: 'FAC',
  clientId: 'c1', clientName: 'Panadería Central', clientNif: '',
  clientAddress: '', issueDate: '2026-06-10', dueDate: '2026-07-10',
  status: InvoiceStatus.EMITIDA, lineItems: [linea()],
  subtotal: 10, totalDiscount: 0, totalTax: 2.1, total: 12.1,
  paymentMethod: 'transferencia' as never, notes: '',
  tipo: 'factura', sentido: 'venta',
  createdAt: '2026-06-10T00:00:00Z', updatedAt: '2026-06-10T00:00:00Z',
  ...extra,
} as Invoice);

describe('trazabilidadDeLote — la función de la alerta sanitaria', () => {
  it('encuentra al cliente que recibió el lote', () => {
    const entregas = trazabilidadDeLote('l1', [factura()]);
    expect(entregas).toHaveLength(1);
    expect(entregas[0]).toMatchObject({ clientId: 'c1', clientName: 'Panadería Central', cantidad: 10 });
  });

  it('un presupuesto o un pedido no cuentan: no ha salido nada de puerta', () => {
    const facturas = [
      factura({ tipo: 'presupuesto' }),
      factura({ tipo: 'pedido' }),
    ];
    expect(trazabilidadDeLote('l1', facturas)).toHaveLength(0);
  });

  it('un borrador o una anulada no cuentan', () => {
    const facturas = [
      factura({ status: InvoiceStatus.BORRADOR }),
      factura({ status: InvoiceStatus.ANULADA }),
    ];
    expect(trazabilidadDeLote('l1', facturas)).toHaveLength(0);
  });

  it('una compra no es una entrega a cliente', () => {
    const facturas = [factura({ sentido: 'compra' })];
    expect(trazabilidadDeLote('l1', facturas)).toHaveLength(0);
  });

  it('sólo las líneas de ESE lote, ninguna otra', () => {
    const mixta = factura({
      lineItems: [
        linea({ loteId: 'l1', quantity: 5 }),
        linea({ loteId: 'l2', quantity: 20 }),
      ],
    });
    const entregas = trazabilidadDeLote('l1', [mixta]);
    expect(entregas).toHaveLength(1);
    expect(entregas[0].cantidad).toBe(5);
  });

  it('un mismo cliente en varias facturas aparece en cada una', () => {
    // La lista tiene que poder decir «se le sirvió tres veces», no fundir
    // las entregas en una: cada factura es un albarán de verdad servido.
    const facturas = [
      factura({ id: 'f1', number: 'FAC-1' }),
      factura({ id: 'f2', number: 'FAC-2' }),
    ];
    expect(trazabilidadDeLote('l1', facturas)).toHaveLength(2);
  });

  it('sale ordenado por fecha', () => {
    const facturas = [
      factura({ issueDate: '2026-06-20' }),
      factura({ issueDate: '2026-06-05' }),
    ];
    const entregas = trazabilidadDeLote('l1', facturas);
    expect(entregas[0].fecha).toBe('2026-06-05');
  });

  it('sin ninguna entrega no revienta, da lista vacía', () => {
    expect(trazabilidadDeLote('l-nadie-lo-compro', [factura()])).toEqual([]);
  });
});

describe('resumenDeLote', () => {
  it('suma unidades y cuenta clientes distintos, no entregas', () => {
    const facturas = [
      factura({ clientId: 'c1' }),
      factura({ clientId: 'c1' }), // mismo cliente otra vez
      factura({ clientId: 'c2' }),
    ];
    const resumen = resumenDeLote('l1', facturas);
    expect(resumen.unidades).toBe(30);
    expect(resumen.clientes).toBe(2);
  });
});

describe('lotesDisponibles — FEFO', () => {
  it('el que antes caduca va primero', () => {
    const lotes = [
      lote({ id: 'l1', fechaCaducidad: '2026-12-01' }),
      lote({ id: 'l2', fechaCaducidad: '2026-08-01' }),
    ];
    expect(lotesDisponibles(lotes, 'p1').map(l => l.id)).toEqual(['l2', 'l1']);
  });

  it('sin caducidad va al final: no urge sacarlo', () => {
    const lotes = [
      lote({ id: 'l1', fechaCaducidad: undefined }),
      lote({ id: 'l2', fechaCaducidad: '2026-08-01' }),
    ];
    expect(lotesDisponibles(lotes, 'p1').map(l => l.id)).toEqual(['l2', 'l1']);
  });

  it('un lote agotado no se ofrece', () => {
    const lotes = [lote({ cantidadDisponible: 0 })];
    expect(lotesDisponibles(lotes, 'p1')).toHaveLength(0);
  });

  it('sólo los del producto que se pregunta', () => {
    const lotes = [lote({ productId: 'p1' }), lote({ productId: 'p2' })];
    expect(lotesDisponibles(lotes, 'p1')).toHaveLength(1);
  });
});

describe('consumirLote', () => {
  it('descuenta la cantidad vendida', () => {
    expect(consumirLote(lote({ cantidadDisponible: 100 }), 30).cantidadDisponible).toBe(70);
  });

  it('nunca baja de cero', () => {
    const r = consumirLote(lote({ cantidadDisponible: 10 }), 30);
    expect(r.cantidadDisponible).toBe(0);
  });

  it('dice lo que falta cuando se pide más de lo que hay', () => {
    const r = consumirLote(lote({ cantidadDisponible: 10 }), 30);
    expect(r.faltante).toBe(20);
  });

  it('sin faltante cuando alcanza', () => {
    expect(consumirLote(lote({ cantidadDisponible: 100 }), 30).faltante).toBe(0);
  });
});

describe('lotesCaducando', () => {
  it('los que caducan dentro del plazo', () => {
    const lotes = [
      lote({ id: 'l1', fechaCaducidad: '2026-06-10' }), // dentro de 5 días
      lote({ id: 'l2', fechaCaducidad: '2026-09-01' }), // lejos
    ];
    const resultado = lotesCaducando(lotes, 7, new Date('2026-06-05'));
    expect(resultado.map(l => l.id)).toEqual(['l1']);
  });

  it('un lote ya caducado con existencias sale igual: es más urgente, no menos', () => {
    const lotes = [lote({ fechaCaducidad: '2026-05-01', cantidadDisponible: 5 })];
    expect(lotesCaducando(lotes, 7, new Date('2026-06-05'))).toHaveLength(1);
  });

  it('sin caducidad no entra en la lista', () => {
    const lotes = [lote({ fechaCaducidad: undefined })];
    expect(lotesCaducando(lotes, 7, new Date('2026-06-05'))).toHaveLength(0);
  });

  it('agotado no entra aunque caduque mañana', () => {
    const lotes = [lote({ fechaCaducidad: '2026-06-06', cantidadDisponible: 0 })];
    expect(lotesCaducando(lotes, 7, new Date('2026-06-05'))).toHaveLength(0);
  });

  it('el más urgente va primero', () => {
    const lotes = [
      lote({ id: 'l1', fechaCaducidad: '2026-06-10' }),
      lote({ id: 'l2', fechaCaducidad: '2026-06-06' }),
    ];
    const resultado = lotesCaducando(lotes, 10, new Date('2026-06-05'));
    expect(resultado.map(l => l.id)).toEqual(['l2', 'l1']);
  });
});

describe('diasHastaCaducidad', () => {
  it('cuenta los días que quedan', () => {
    expect(diasHastaCaducidad(lote({ fechaCaducidad: '2026-06-10' }), new Date('2026-06-05'))).toBe(5);
  });

  it('negativo si ya caducó', () => {
    expect(diasHastaCaducidad(lote({ fechaCaducidad: '2026-06-01' }), new Date('2026-06-05'))).toBe(-4);
  });

  it('sin caducidad no hay días que contar', () => {
    expect(diasHastaCaducidad(lote({ fechaCaducidad: undefined }))).toBeNull();
  });
});

describe('aplicarLoteALinea', () => {
  it('guarda el id y el código del lote en la línea', () => {
    const l = aplicarLoteALinea(linea({ loteId: undefined, loteCodigo: undefined }), lote({ id: 'l9', codigo: 'L-9999' }));
    expect(l.loteId).toBe('l9');
    expect(l.loteCodigo).toBe('L-9999');
  });

  it('quitar el lote limpia los dos campos', () => {
    const l = aplicarLoteALinea(linea({ loteId: 'l1', loteCodigo: 'L-4471' }), null);
    expect(l.loteId).toBeUndefined();
    expect(l.loteCodigo).toBeUndefined();
  });
});
