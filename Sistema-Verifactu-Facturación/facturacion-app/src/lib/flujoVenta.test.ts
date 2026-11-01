import { describe, it, expect } from 'vitest';
import {
  aplicarAprobacion, avisoAlAnular, convertirDocumento, derivadosDe, excesosSobrePedido, motivoParaNoConvertir,
  etiquetaEstado, movimientoDeStock, pasoAlTerminar, rotuloAlTerminar, servicioDePedido, trazaDe,
} from './flujoVenta';
import { documentoConvertido, numeroOrigen, pendientesPorProducto, servidoPorPedido, claveServido } from './documentos';
import { colaDeAlmacen, lineasPendientesDePedido } from './prepararPedidos';
import { calculateInvoiceTotals } from './utils';
import { InvoiceStatus, PaymentMethod, UnitOfMeasure, type CompanySettings, type Invoice, type InvoiceLineItem } from './types';

// Rogar: distribuidor de Canarias, con IGIC. Datos inventados.
const settings = {
  igicEnabled: true,
  invoiceSeries: 'F', nextInvoiceNumber: 1200,
  albaranSeries: 'ALB', nextAlbaranNumber: 30,
  seriesDocumentos: {
    presupuesto_venta: { serie: 'PRE', nextNumber: 4 },
    pedido_venta: { serie: 'PED', nextNumber: 9 },
    albaran_venta: { serie: 'ALB', nextNumber: 12 },
    factura_venta: { serie: 'FAC', nextNumber: 27 },
  },
} as unknown as CompanySettings;

const linea = (extra: Partial<InvoiceLineItem> = {}): InvoiceLineItem => ({
  id: crypto.randomUUID(), productId: 'cerveza', productName: 'Cerveza Tropical lata 33cl', productRef: 'R104',
  quantity: 48, unitPrice: 0.8, unit: UnitOfMeasure.UNIDAD, taxRate: 7, discountPercent: 10, discountPercent2: 5,
  subtotal: 0, taxAmount: 0, total: 0, ...extra,
});

let n = 0;
const doc = (extra: Partial<Invoice> = {}): Invoice => {
  const lineItems = extra.lineItems ?? [linea(), linea({ productId: 'gofio', productName: 'Gofio de millo 1kg', quantity: 10, unitPrice: 2.35, taxRate: 3, discountPercent: 0, discountPercent2: 0 })];
  const globales: [number, number, number] = [extra.globalDiscountPercent1 ?? 2, 0, 0];
  return {
    id: `d${++n}`, number: `PRE-2026-${String(n).padStart(4, '0')}`, series: 'PRE',
    clientId: 'c1', clientName: 'Bar Pepe', clientNif: 'B35100000', clientAddress: 'C/ Real 1, Arrecife',
    issueDate: '2026-10-01', dueDate: '2026-10-31',
    status: InvoiceStatus.EMITIDA, lineItems,
    ...calculateInvoiceTotals(lineItems, globales),
    globalDiscountPercent1: globales[0],
    paymentMethod: PaymentMethod.TRANSFERENCIA, notes: 'Entregar solo por la mañana.',
    tipo: 'presupuesto', sentido: 'venta', impuesto: 'IGIC',
    retencionPct: undefined,
    createdAt: '2026-10-01T08:00:00Z', updatedAt: '2026-10-01T08:00:00Z',
    ...extra,
  };
};

const HOY = '2026-10-31';

describe('documentoConvertido: lo que se copia', () => {
  it('cliente, datos fiscales, líneas con sus descuentos, impuesto, pie, notas y pago, tal cual', () => {
    const pre = doc({ retencionPct: 15, paymentMethod: PaymentMethod.DOMICILIACION, vendedorId: 'v1', tarifaId: 't1', almacenId: 'alm1' });
    const ped = documentoConvertido(pre, 'pedido', settings, { hoy: HOY });
    expect([ped.clientId, ped.clientName, ped.clientNif, ped.clientAddress]).toEqual([pre.clientId, pre.clientName, pre.clientNif, pre.clientAddress]);
    expect(ped.lineItems.map(l => [l.productId, l.quantity, l.unitPrice, l.discountPercent, l.discountPercent2, l.taxRate]))
      .toEqual(pre.lineItems.map(l => [l.productId, l.quantity, l.unitPrice, l.discountPercent, l.discountPercent2, l.taxRate]));
    expect([ped.globalDiscountPercent1, ped.retencionPct, ped.notes, ped.paymentMethod, ped.impuesto, ped.vendedorId, ped.tarifaId, ped.almacenId])
      .toEqual([2, 15, pre.notes, PaymentMethod.DOMICILIACION, 'IGIC', 'v1', 't1', 'alm1']);
  });

  it('los totales y el desglose de IGIC son idénticos al céntimo', () => {
    const pre = doc();
    const fac = documentoConvertido(pre, 'factura', settings, { hoy: HOY });
    expect([fac.subtotal, fac.totalDiscount, fac.totalTax, fac.total]).toEqual([pre.subtotal, pre.totalDiscount, pre.totalTax, pre.total]);
    expect(fac.taxBreakdown).toEqual(pre.taxBreakdown);
    // Y son los que saldrán al guardar: los de las líneas (saveInvoice los recalcula).
    expect(calculateInvoiceTotals(fac.lineItems, [2, 0, 0]).total).toBe(fac.total);
  });

  it('el origen es el documento del que sale, no el primero de la cadena', () => {
    const pre = doc();
    const ped = { ...documentoConvertido(pre, 'pedido', settings, { hoy: HOY }), id: 'ped', status: InvoiceStatus.EMITIDA };
    const alb = documentoConvertido(ped, 'albaran', settings, { hoy: HOY });
    expect([alb.documentoOrigenId, alb.documentoOrigenNumber]).toEqual(['ped', ped.number]);
    const fac = documentoConvertido({ ...alb, id: 'alb' }, 'factura', settings, { hoy: HOY });
    expect([fac.documentoOrigenId, fac.documentoOrigenNumber]).toEqual(['alb', alb.number]);
  });

  it('nace hoy y conserva el plazo de pago del origen', () => {
    const fac = documentoConvertido(doc({ issueDate: '2026-10-01', dueDate: '2026-10-31' }), 'factura', settings, { hoy: HOY });
    expect([fac.issueDate, fac.dueDate]).toEqual([HOY, '2026-11-30']);
    expect(fac.status).toBe(InvoiceStatus.BORRADOR);
  });

  it('nada del estado del origen: ni cobros, ni sello, ni anulación, ni tipo fiscal', () => {
    const fac = documentoConvertido(doc({ paidAmount: 5, cancelReason: 'x', tipoFacturaFiscal: 'F2', numberTemporary: true, siiStatus: 'aceptado_sii' }), 'factura', settings, { hoy: HOY });
    expect([fac.paidAmount, fac.cancelReason, fac.tipoFacturaFiscal, fac.numberTemporary, fac.siiStatus, fac.verifactu]).toEqual([0, undefined, undefined, false, undefined, undefined]);
  });
});

describe('serie y numeración', () => {
  it('la factura de venta va en la serie y el contador de Facturas (Ajustes), no en otro aparte', () => {
    const fac = documentoConvertido(doc(), 'factura', settings, { hoy: HOY });
    expect(fac.series).toBe('F');
    expect(fac.number).toBe('F-2026-1200');
  });

  it('el albarán de venta comparte contador con la pantalla Albaranes: nunca dos ALB con el mismo número', () => {
    const alb = documentoConvertido(doc({ tipo: 'pedido' }), 'albaran', settings, { hoy: HOY });
    expect(alb.number).toBe('ALB-2026-0030');
  });

  it('si el contador de documentos iba por delante en la misma serie, manda el mayor', () => {
    const s = { ...settings, nextAlbaranNumber: 5 } as CompanySettings;
    expect(documentoConvertido(doc({ tipo: 'pedido' }), 'albaran', s, { hoy: HOY }).number).toBe('ALB-2026-0012');
  });

  it('los demás tipos, con su serie de siempre', () => {
    expect(documentoConvertido(doc(), 'pedido', settings, { hoy: HOY }).number).toBe('PED-2026-0009');
  });

  it('la serie del vendedor del cliente manda, si la tiene', () => {
    const ped = documentoConvertido(doc(), 'pedido', settings, { hoy: HOY, serie: { serie: 'V1P', nextNumber: 3 } });
    expect([ped.series, ped.number]).toEqual(['V1P', 'V1P-2026-0003']);
  });
});

describe('numeroOrigen', () => {
  it('dice el tipo del ORIGEN, no el del documento que se mira', () => {
    const alb = doc({ id: 'alb', tipo: 'albaran', number: 'ALB-2026-0030' });
    const fac = doc({ tipo: 'factura', documentoOrigenId: 'alb', documentoOrigenNumber: 'ALB-2026-0030' });
    expect(numeroOrigen(fac, [alb, fac])).toBe('Albarán ALB-2026-0030');
    // Sin el origen a mano, el número a secas: mejor que un tipo inventado.
    expect(numeroOrigen(fac)).toBe('ALB-2026-0030');
  });
});

describe('lo servido de un pedido', () => {
  it('la factura de un albarán no vuelve a contar como servida', () => {
    const ped = doc({ id: 'ped', tipo: 'pedido', lineItems: [linea({ quantity: 48 })] });
    const alb = doc({ id: 'alb', tipo: 'albaran', status: InvoiceStatus.EXPEDIDO, documentoOrigenId: 'ped', lineItems: [linea({ quantity: 20 })] });
    const fac = documentoConvertido(alb, 'factura', settings, { hoy: HOY });
    const docs = [ped, alb, { ...fac, status: InvoiceStatus.EMITIDA }];
    expect(servidoPorPedido(docs).get(claveServido('ped', 'cerveza'))).toBe(20);
    expect(pendientesPorProducto(docs).get('cerveza')?.pendienteEntregar).toBe(28);
  });

  it('las líneas sin artículo (portes, un servicio) también se sirven, y no dejan el pedido abierto para siempre', () => {
    const portes = linea({ productId: '', productName: 'Portes', quantity: 1, unitPrice: 6 });
    const ped = doc({ id: 'ped', tipo: 'pedido', lineItems: [linea({ quantity: 10 }), portes] });
    const alb = doc({ tipo: 'albaran', documentoOrigenId: 'ped', lineItems: [linea({ quantity: 10 }), { ...portes, id: 'otra' }] });
    expect(lineasPendientesDePedido(ped, [ped, alb])).toEqual([]);
    expect(colaDeAlmacen({ documentos: [ped, alb], clientes: [] }).map(p => p.id)).not.toContain('ped');
  });

  it('parcial y completo, línea a línea', () => {
    const ped = doc({ id: 'ped', tipo: 'pedido', lineItems: [linea({ quantity: 48 }), linea({ productId: 'gofio', productName: 'Gofio', quantity: 10 })] });
    expect(servicioDePedido(ped, [ped]).estado).toBe('sin_servir');
    const a1 = doc({ tipo: 'albaran', documentoOrigenId: 'ped', lineItems: [linea({ quantity: 24 })] });
    const s1 = servicioDePedido(ped, [ped, a1]);
    expect(s1.estado).toBe('parcial');
    expect(s1.lineas.map(l => [l.nombre, l.pedido, l.servido, l.pendiente])).toEqual([
      ['Cerveza Tropical lata 33cl', 48, 24, 24], ['Gofio', 10, 0, 10],
    ]);
    const a2 = doc({ tipo: 'albaran', documentoOrigenId: 'ped', lineItems: [linea({ quantity: 24 }), linea({ productId: 'gofio', quantity: 10 })] });
    expect(servicioDePedido(ped, [ped, a1, a2]).estado).toBe('servido');
    // Un albarán anulado no sirve nada.
    expect(servicioDePedido(ped, [ped, { ...a1, status: InvoiceStatus.ANULADA }]).estado).toBe('sin_servir');
  });

  it('servido de más: se ve como exceso, no como negativo', () => {
    const ped = doc({ id: 'ped', tipo: 'pedido', lineItems: [linea({ quantity: 10 })] });
    const alb = doc({ id: 'alb', tipo: 'albaran', status: InvoiceStatus.BORRADOR, documentoOrigenId: 'ped', lineItems: [linea({ quantity: 12 })] });
    const s = servicioDePedido(ped, [ped, alb]);
    expect([s.estado, s.lineas[0].pendiente, s.lineas[0].exceso]).toEqual(['servido', 0, 2]);
    expect(excesosSobrePedido(alb, [ped, alb])).toEqual([{ nombre: 'Cerveza Tropical lata 33cl', pedido: 10, otros: 0, este: 12, exceso: 2 }]);
    expect(excesosSobrePedido({ ...alb, lineItems: [linea({ quantity: 10 })] }, [ped, alb])).toEqual([]);
  });

  it('la cola del almacén y lo pendiente de cada artículo dicen lo mismo, línea a línea', () => {
    const ped = doc({ id: 'ped', tipo: 'pedido', lineItems: [linea({ quantity: 30 }), linea({ productId: 'gofio', quantity: 7 })] });
    const alb = doc({ tipo: 'albaran', status: InvoiceStatus.EXPEDIDO, documentoOrigenId: 'ped', lineItems: [linea({ quantity: 12 })] });
    const docs = [ped, alb];
    const [enCola] = colaDeAlmacen({ documentos: docs, clientes: [] }).filter(p => p.id === 'ped');
    const servicio = servicioDePedido(ped, docs);
    for (const l of enCola.lineas) {
      expect(pendientesPorProducto(docs).get(l.productId)?.pendienteEntregar).toBe(l.unidades);
      expect(servicio.lineas.find(x => x.productId === l.productId)?.pendiente).toBe(l.unidades);
    }
  });
});

describe('qué se puede convertir y qué no', () => {
  it('cada tipo, a lo que le sigue', () => {
    const pre = doc();
    expect(motivoParaNoConvertir(pre, 'pedido', [pre])).toBeNull();
    expect(motivoParaNoConvertir(pre, 'factura', [pre])).toBeNull();
    const fac = doc({ tipo: 'factura' });
    expect(motivoParaNoConvertir(fac, 'albaran', [fac])).toMatch(/no se convierte/);
  });

  it('anulado, nunca', () => {
    const pre = doc({ status: InvoiceStatus.ANULADA });
    expect(motivoParaNoConvertir(pre, 'pedido', [pre])).toMatch(/anulado/);
  });

  it('un presupuesto ya pasado a pedido no se pasa otra vez (doble clic, volver atrás)', () => {
    const pre = doc({ id: 'pre' });
    const ped = { ...documentoConvertido(pre, 'pedido', settings, { hoy: HOY }), id: 'ped' };
    expect(motivoParaNoConvertir(pre, 'pedido', [pre, ped])).toBe(`Ya se pasó a Pedido ${ped.number}.`);
    expect(motivoParaNoConvertir(pre, 'factura', [pre, ped])).toBe(`Ya se pasó a Pedido ${ped.number}.`);
    // Anulado lo que salió, se puede volver a convertir.
    expect(motivoParaNoConvertir(pre, 'pedido', [pre, { ...ped, status: InvoiceStatus.ANULADA }])).toBeNull();
  });

  it('un pedido pendiente de aprobar o rechazado no se sirve', () => {
    for (const status of [InvoiceStatus.PRE_APROBACION, InvoiceStatus.RECHAZADO]) {
      const ped = doc({ tipo: 'pedido', status });
      expect(motivoParaNoConvertir(ped, 'albaran', [ped])).toMatch(status === InvoiceStatus.RECHAZADO ? /rechazó/ : /aprobación/);
    }
  });

  it('un pedido servido del todo no saca otro albarán ni otra factura', () => {
    const ped = doc({ id: 'ped', tipo: 'pedido', lineItems: [linea({ quantity: 10 })] });
    const alb = doc({ number: 'ALB-2026-0030', tipo: 'albaran', documentoOrigenId: 'ped', lineItems: [linea({ quantity: 10 })] });
    expect(motivoParaNoConvertir(ped, 'albaran', [ped, alb])).toBe('El pedido ya está servido del todo (ALB-2026-0030). Factura sus albaranes.');
    expect(motivoParaNoConvertir(ped, 'factura', [ped, alb])).toMatch(/servido del todo/);
  });

  it('un albarán sin expedir no se factura: el stock no se movería nunca', () => {
    const alb = doc({ tipo: 'albaran', status: InvoiceStatus.BORRADOR });
    expect(motivoParaNoConvertir(alb, 'factura', [alb])).toMatch(/Expide antes/);
  });

  it('un albarán ya facturado no se factura dos veces', () => {
    const alb = doc({ id: 'alb', tipo: 'albaran', status: InvoiceStatus.EXPEDIDO });
    const fac = { ...documentoConvertido(alb, 'factura', settings, { hoy: HOY }), id: 'fac' };
    expect(motivoParaNoConvertir(alb, 'factura', [alb, fac])).toBe(`Ya está facturado en ${fac.number}.`);
    expect(motivoParaNoConvertir({ ...alb, status: InvoiceStatus.FACTURADO }, 'factura', [alb])).toMatch(/facturado/);
  });
});

describe('convertirDocumento', () => {
  it('el pedido servido a medias saca un albarán sólo con lo que falta, con sus totales', () => {
    const ped = doc({ id: 'ped', tipo: 'pedido', lineItems: [linea({ quantity: 48 }), linea({ productId: 'gofio', productName: 'Gofio', quantity: 10, unitPrice: 2.35, taxRate: 3, discountPercent: 0, discountPercent2: 0 })] });
    const a1 = doc({ tipo: 'albaran', status: InvoiceStatus.EXPEDIDO, documentoOrigenId: 'ped', lineItems: [linea({ quantity: 20 })] });
    const a2 = convertirDocumento(ped, 'albaran', [ped, a1], settings, { hoy: HOY });
    expect(a2.lineItems.map(l => [l.productId, l.quantity])).toEqual([['cerveza', 28], ['gofio', 10]]);
    expect(a2.total).toBe(calculateInvoiceTotals(a2.lineItems, [2, 0, 0]).total);
    expect(a2.documentoOrigenId).toBe('ped');
  });

  it('facturar el pedido después de una entrega parcial factura sólo lo que no ha salido', () => {
    const ped = doc({ id: 'ped', tipo: 'pedido', lineItems: [linea({ quantity: 48 })] });
    const a1 = doc({ tipo: 'albaran', status: InvoiceStatus.EXPEDIDO, documentoOrigenId: 'ped', lineItems: [linea({ quantity: 20 })] });
    const fac = convertirDocumento(ped, 'factura', [ped, a1], settings, { hoy: HOY });
    expect(fac.lineItems.map(l => l.quantity)).toEqual([28]);
  });

  it('el pedido aprobado a medias por el cliente sale con lo que aprobó', () => {
    const l1 = linea({ id: 'l1', quantity: 48 });
    const l2 = linea({ id: 'l2', productId: 'gofio', quantity: 10 });
    const l3 = linea({ id: 'l3', productId: 'ron', quantity: 6 });
    const ped = doc({ id: 'ped', tipo: 'pedido', status: InvoiceStatus.APROBADO_PARCIAL, lineItems: [l1, l2, l3] });
    const aprobacion = [
      { lineItemId: 'l1', accepted: true, adjustedQuantity: 24 },
      { lineItemId: 'l2', accepted: false, adjustedQuantity: null },
      { lineItemId: 'l3', accepted: true, adjustedQuantity: null },
    ];
    const alb = convertirDocumento(ped, 'albaran', [ped], settings, { hoy: HOY, aprobacion });
    expect(alb.lineItems.map(l => [l.productId, l.quantity])).toEqual([['cerveza', 24], ['ron', 6]]);
    // Sin la respuesta del cliente a mano, no se adivina.
    expect(() => convertirDocumento(ped, 'albaran', [ped], settings, { hoy: HOY })).toThrow(/lo que aprobó el cliente/);
  });

  it('se niega con el motivo, sin crear nada', () => {
    const alb = doc({ tipo: 'albaran', status: InvoiceStatus.BORRADOR });
    expect(() => convertirDocumento(alb, 'factura', [alb], settings, { hoy: HOY })).toThrow(/Expide antes/);
  });
});

describe('aplicarAprobacion', () => {
  it('lo rechazado sale, lo ajustado cambia de cantidad (y de importe) y lo demás queda igual', () => {
    const [a, b, c] = [linea({ id: 'a', quantity: 10, unitPrice: 1, discountPercent: 0, discountPercent2: 0 }), linea({ id: 'b' }), linea({ id: 'c' })];
    const r = aplicarAprobacion([a, b, c], [
      { lineItemId: 'a', accepted: true, adjustedQuantity: 4 },
      { lineItemId: 'b', accepted: false, adjustedQuantity: null },
    ]);
    expect(r.map(l => [l.id, l.quantity, l.subtotal])).toEqual([['a', 4, 4], ['c', 48, c.subtotal]]);
  });
});

describe('la trazabilidad', () => {
  it('de dónde viene y a qué ha dado lugar, en los dos sentidos', () => {
    const pre = doc({ id: 'pre' });
    const ped = doc({ id: 'ped', tipo: 'pedido', documentoOrigenId: 'pre' });
    const a1 = doc({ id: 'a1', tipo: 'albaran', documentoOrigenId: 'ped' });
    const a2 = doc({ id: 'a2', tipo: 'albaran', documentoOrigenId: 'ped' });
    const f1 = doc({ id: 'f1', tipo: 'factura', documentoOrigenId: 'a1' });
    const anulado = doc({ id: 'ax', tipo: 'albaran', documentoOrigenId: 'ped', status: InvoiceStatus.ANULADA });
    const docs = [pre, ped, a1, a2, f1, anulado];
    const t = trazaDe(a1, docs);
    expect(t.origenes.map(d => d.id)).toEqual(['pre', 'ped']);
    expect(t.derivados.map(x => [x.doc.id, x.nivel])).toEqual([['f1', 0]]);
    // Desde el pedido: sus albaranes (también el anulado, que se ve tachado) y lo que salió de ellos.
    expect(trazaDe(ped, docs).derivados.map(x => [x.doc.id, x.nivel])).toEqual([['a1', 0], ['f1', 1], ['a2', 0], ['ax', 0]]);
    expect(derivadosDe('ped', docs).map(d => d.id)).toEqual(['a1', 'a2']);
  });

  it('una cadena rota o circular no cuelga la ficha', () => {
    const a = doc({ id: 'a', documentoOrigenId: 'b' });
    const b = doc({ id: 'b', documentoOrigenId: 'a' });
    expect(trazaDe(a, [a, b]).origenes.map(d => d.id)).toEqual(['b']);
    expect(trazaDe(doc({ documentoOrigenId: 'no-esta' }), []).origenes).toEqual([]);
  });
});

describe('anular un origen ya convertido', () => {
  it('un albarán facturado no se anula: la factura cuenta con que el albarán movió el stock', () => {
    const alb = doc({ id: 'alb', tipo: 'albaran', status: InvoiceStatus.EXPEDIDO });
    const fac = doc({ tipo: 'factura', number: 'F-2026-1200', documentoOrigenId: 'alb' });
    expect(avisoAlAnular(alb, [alb, fac])).toEqual({ bloquea: true, texto: expect.stringMatching(/F-2026-1200/) });
  });

  it('un pedido con albaranes se puede anular (cierra lo que falta), avisando de que los albaranes siguen', () => {
    const ped = doc({ id: 'ped', tipo: 'pedido' });
    const alb = doc({ tipo: 'albaran', number: 'ALB-2026-0030', documentoOrigenId: 'ped' });
    const aviso = avisoAlAnular(ped, [ped, alb]);
    expect(aviso?.bloquea).toBe(false);
    expect(aviso?.texto).toMatch(/ALB-2026-0030/);
    expect(avisoAlAnular(ped, [ped])).toBeNull();
  });
});

describe('etiquetaEstado', () => {
  it('un albarán expedido o facturado no sale como «Borrador»', () => {
    expect(etiquetaEstado({ tipo: 'albaran', status: InvoiceStatus.EXPEDIDO })).toBe('Expedido');
    expect(etiquetaEstado({ tipo: 'albaran', status: InvoiceStatus.FACTURADO })).toBe('Facturado');
  });
  it('concuerda con el documento', () => {
    expect(etiquetaEstado({ tipo: 'pedido', status: InvoiceStatus.EMITIDA })).toBe('Emitido');
    expect(etiquetaEstado({ tipo: 'factura', status: InvoiceStatus.ANULADA })).toBe('Anulada');
  });
});

describe('el botón de al lado de «Guardar»', () => {
  it('una factura de venta no se sella desde el formulario: se revisa y se emite en Facturas', () => {
    expect(pasoAlTerminar('factura', 'venta')).toBe('facturas');
    expect(pasoAlTerminar('rectificativa', 'venta')).toBe('facturas');
  });
  it('un albarán se expide (no hay albaranes «emitidos»)', () => {
    expect(pasoAlTerminar('albaran', 'venta')).toBe('expedir');
    expect(rotuloAlTerminar('albaran', 'compra')).toBe('Guardar y expedir');
  });
  it('presupuestos y pedidos se emiten', () => {
    expect(pasoAlTerminar('pedido', 'venta')).toBe('emitir');
    expect(rotuloAlTerminar('presupuesto', 'venta')).toBe('Emitir presupuesto');
  });
});

describe('el stock se mueve exactamente una vez (espejo de la migración 074)', () => {
  const total = (docs: Invoice[], producto: string) => docs.reduce((s, d) => s + (movimientoDeStock(d, docs).get(producto) ?? 0), 0);

  it('presupuesto → pedido → albarán expedido → factura emitida: sólo el albarán', () => {
    const pre = doc({ id: 'pre', lineItems: [linea({ quantity: 48 })] });
    const ped = { ...convertirDocumento(pre, 'pedido', [pre], settings, { hoy: HOY }), id: 'ped', status: InvoiceStatus.EMITIDA };
    const alb = { ...convertirDocumento(ped, 'albaran', [pre, ped], settings, { hoy: HOY }), id: 'alb', status: InvoiceStatus.EXPEDIDO };
    const fac = { ...convertirDocumento(alb, 'factura', [pre, ped, alb], settings, { hoy: HOY }), id: 'fac', status: InvoiceStatus.EMITIDA };
    const docs = [pre, ped, alb, fac];
    expect(total(docs, 'cerveza')).toBe(-48);
    expect(movimientoDeStock(fac, docs).size).toBe(0);
  });

  it('pedido → factura directa: la factura', () => {
    const ped = doc({ id: 'ped', tipo: 'pedido', lineItems: [linea({ quantity: 48 })] });
    const fac = { ...convertirDocumento(ped, 'factura', [ped], settings, { hoy: HOY }), status: InvoiceStatus.EMITIDA };
    expect(total([ped, fac], 'cerveza')).toBe(-48);
  });

  it('entrega parcial en dos albaranes y factura de cada uno: lo pedido, ni una más', () => {
    const ped = doc({ id: 'ped', tipo: 'pedido', lineItems: [linea({ quantity: 48 })] });
    const a1 = { ...convertirDocumento(ped, 'albaran', [ped], settings, { hoy: HOY }), id: 'a1', lineItems: [linea({ quantity: 20 })], status: InvoiceStatus.EXPEDIDO };
    const a2 = { ...convertirDocumento(ped, 'albaran', [ped, a1], settings, { hoy: HOY }), id: 'a2', status: InvoiceStatus.EXPEDIDO };
    const f1 = { ...convertirDocumento(a1, 'factura', [ped, a1, a2], settings, { hoy: HOY }), status: InvoiceStatus.EMITIDA };
    const f2 = { ...convertirDocumento(a2, 'factura', [ped, a1, a2, f1], settings, { hoy: HOY }), status: InvoiceStatus.EMITIDA };
    expect(total([ped, a1, a2, f1, f2], 'cerveza')).toBe(-48);
    expect(servicioDePedido(ped, [ped, a1, a2, f1, f2]).estado).toBe('servido');
  });

  it('un borrador no mueve nada', () => {
    const alb = doc({ tipo: 'albaran', status: InvoiceStatus.BORRADOR });
    expect(movimientoDeStock(alb, [alb]).size).toBe(0);
  });
});
