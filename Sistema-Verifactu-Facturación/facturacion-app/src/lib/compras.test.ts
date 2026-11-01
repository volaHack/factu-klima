import { describe, it, expect } from 'vitest';
import { InvoiceStatus, type CompanySettings, type Invoice, type InvoiceLineItem } from './types';
import { calcularPendientesProducto, documentoConvertido } from './documentos';
import {
  convertirCompra, facturaDeAlbaranesCompra, pendienteDePedido, porQueNoSeConvierte,
  conDatosDelProveedor, fechaDeRegistro, numeroDelProveedor, problemasFacturaRecibida,
} from './compras';

const settings = {} as CompanySettings;
const HOY = new Date('2026-10-20T10:00:00Z');

function linea(over: Partial<InvoiceLineItem> = {}): InvoiceLineItem {
  return {
    id: crypto.randomUUID(), productId: 'aceite', productName: 'Aceite 1L', productRef: 'R1',
    quantity: 10, unitPrice: 4, unit: 'ud' as InvoiceLineItem['unit'], taxRate: 7, discountPercent: 10,
    subtotal: 36, taxAmount: 2.52, total: 38.52, ...over,
  };
}

function pedido(over: Partial<Invoice> = {}): Invoice {
  return {
    id: 'ped-1', number: 'PEDC-2026-0001', series: 'PEDC', tipo: 'pedido', sentido: 'compra',
    clientId: 'p0', clientName: 'Almazara Sur S.L.', clientNif: 'B76200000', clientAddress: 'x',
    issueDate: '2026-10-01', dueDate: '2026-10-31', status: InvoiceStatus.EMITIDA,
    lineItems: [linea()], subtotal: 36, totalDiscount: 4, taxBreakdown: [], totalTax: 2.52, total: 38.52,
    paymentMethod: 'transferencia' as Invoice['paymentMethod'], notes: '', createdAt: '', updatedAt: '', ...over,
  };
}

describe('compras: el documento convertido cuelga del inmediatamente anterior', () => {
  it('la factura de un albarán que vino de un pedido apunta al albarán, no al pedido', () => {
    // Antes apuntaba al pedido y la base de datos (074) volvía a meter el
    // género: solo reconoce «viene de un albarán» mirando el origen.
    const p = pedido();
    const alb = { ...documentoConvertido(p, 'albaran', settings), status: InvoiceStatus.EXPEDIDO };
    const fac = documentoConvertido(alb, 'factura', settings);
    expect(alb.documentoOrigenId).toBe('ped-1');
    expect(fac.documentoOrigenId).toBe(alb.id);
    expect(fac.documentoOrigenNumber).toBe(alb.number);
  });

  it('una recepción parcial deja pendiente lo que falta aunque el albarán ya esté facturado', () => {
    const p = pedido();
    const alb = { ...documentoConvertido(p, 'albaran', settings), status: InvoiceStatus.EXPEDIDO };
    alb.lineItems = [{ ...alb.lineItems[0], quantity: 4 }];
    const fac = { ...documentoConvertido(alb, 'factura', settings), status: InvoiceStatus.EMITIDA };
    // Antes: 10 − 4 (albarán) − 4 (factura, colgada también del pedido) = 2.
    expect(calcularPendientesProducto('aceite', [p, alb, fac]).pendienteRecibir).toBe(6);
  });

  it('copia proveedor, líneas, precios, descuentos y el impuesto de compra; no lo cobrado ni lo anulado', () => {
    const p = pedido({ paidAmount: 50, cancelReason: 'x', tipoFacturaFiscal: 'F1', lineItems: [linea({ taxRate: 3, discountPercent2: 5 })] });
    const c = convertirCompra(p, 'albaran', settings, undefined, HOY);
    expect(c).toMatchObject({ clientId: 'p0', clientName: 'Almazara Sur S.L.', clientNif: 'B76200000', sentido: 'compra', status: InvoiceStatus.BORRADOR, paidAmount: 0 });
    expect(c.cancelReason).toBeUndefined();
    expect(c.tipoFacturaFiscal).toBeUndefined();
    expect(c.lineItems[0]).toMatchObject({ unitPrice: 4, discountPercent: 10, discountPercent2: 5, taxRate: 3 });
    expect(c.lineItems[0].id).not.toBe(p.lineItems[0].id);
    // La fecha es la de la recepción, con los mismos días de pago.
    expect(c.issueDate).toBe('2026-10-20');
    expect(c.dueDate).toBe('2026-11-19');
  });

  it('con los documentos delante, la segunda recepción propone solo lo que falta (con sus cajas)', () => {
    const p = pedido({ lineItems: [linea({ quantity: 48, unitsPerPackage: 12, cajas: 4 })] });
    const primera = { ...convertirCompra(p, 'albaran', settings, [p], HOY), status: InvoiceStatus.EXPEDIDO };
    primera.lineItems = [{ ...primera.lineItems[0], quantity: 12, cajas: 1 }];
    const segunda = convertirCompra(p, 'albaran', settings, [p, primera], HOY);
    expect(segunda.lineItems).toHaveLength(1);
    expect(segunda.lineItems[0]).toMatchObject({ quantity: 36, cajas: 3 });
    // Los importes de la línea se recalculan con la cantidad nueva.
    expect(segunda.lineItems[0].subtotal).toBe(129.6);
  });

  it('un pedido recibido entero ya no se vuelve a recibir', () => {
    const p = pedido();
    const alb = { ...convertirCompra(p, 'albaran', settings, [p], HOY), status: InvoiceStatus.EXPEDIDO };
    expect(pendienteDePedido(p, [p, alb])).toEqual([]);
    expect(() => convertirCompra(p, 'albaran', settings, [p, alb], HOY)).toThrow(/recibido entero/);
  });

  it('un albarán sin recibir no se factura (la factura no metería el género)', () => {
    const alb = pedido({ id: 'alb-1', tipo: 'albaran', number: 'ALBC-1', status: InvoiceStatus.BORRADOR });
    expect(() => documentoConvertido(alb, 'factura', settings)).toThrow(/Recíbelo primero/);
  });

  it('un albarán ya facturado no se factura otra vez', () => {
    const alb = pedido({ id: 'alb-1', tipo: 'albaran', number: 'ALBC-1', status: InvoiceStatus.EXPEDIDO });
    const fac = { ...convertirCompra(alb, 'factura', settings, [alb], HOY), status: InvoiceStatus.EMITIDA };
    expect(porQueNoSeConvierte(alb, 'factura', [alb, fac])).toMatch(/ya está facturado en/);
    expect(porQueNoSeConvierte({ ...alb, status: InvoiceStatus.FACTURADO }, 'factura')).toMatch(/ya está facturado/);
  });

  it('la venta no cambia: sigue con su conversión de siempre', () => {
    const v = pedido({ sentido: 'venta', status: InvoiceStatus.BORRADOR });
    expect(documentoConvertido(v, 'factura', settings).documentoOrigenId).toBe('ped-1');
  });
});

describe('compras: varios albaranes en una factura del proveedor', () => {
  const a1 = pedido({ id: 'a1', tipo: 'albaran', number: 'ALBC-1', status: InvoiceStatus.EXPEDIDO, lineItems: [linea({ quantity: 2 })] });
  const a2 = pedido({ id: 'a2', tipo: 'albaran', number: 'ALBC-2', status: InvoiceStatus.EXPEDIDO, lineItems: [linea({ quantity: 3, productId: 'vino', productName: 'Vino' })] });

  it('suma las líneas, cuelga del primero y nombra todos', () => {
    const f = facturaDeAlbaranesCompra([a1, a2], settings, [a1, a2], HOY);
    expect(f.tipo).toBe('factura');
    expect(f.documentoOrigenId).toBe('a1');
    expect(f.documentoOrigenNumber).toBe('ALBC-1, ALBC-2');
    expect(f.lineItems.map(l => l.quantity)).toEqual([2, 3]);
    expect(f.notes).toMatch(/ALBC-1, ALBC-2/);
  });

  it('no mezcla proveedores', () => {
    expect(() => facturaDeAlbaranesCompra([a1, { ...a2, clientId: 'p1' }], settings, [], HOY)).toThrow(/proveedores distintos/);
  });
});

describe('la factura del proveedor: su número y la fecha de registro', () => {
  const f = conDatosDelProveedor(pedido({ id: 'f1', tipo: 'factura', number: 'FACC-2026-0007' }), {
    numero: ' A-2231 ', fechaExpedicion: '2026-09-29', fechaRegistro: '2026-10-03',
  });

  it('guarda su número aparte del nuestro y separa expedición de registro', () => {
    expect(f.number).toBe('FACC-2026-0007');
    expect(numeroDelProveedor(f)).toBe('A-2231');
    expect(f.issueDate).toBe('2026-09-29');
    expect(fechaDeRegistro(f)).toBe('2026-10-03');
  });

  it('sin fecha de registro vale la de la factura', () => {
    expect(fechaDeRegistro(pedido())).toBe('2026-10-01');
  });

  it('avisa del número que falta y para la factura repetida o registrada antes de expedirse', () => {
    expect(problemasFacturaRecibida(pedido({ tipo: 'factura' }), [])[0].texto).toMatch(/Falta el número/);
    const otra = { ...f, id: 'f2', number: 'FACC-2026-0008' };
    expect(problemasFacturaRecibida(otra, [f]).some(p => p.gravedad === 'error' && /ya está registrada/.test(p.texto))).toBe(true);
    const alReves = conDatosDelProveedor(f, { fechaRegistro: '2026-09-01' });
    expect(problemasFacturaRecibida(alReves, [])).toContainEqual(expect.objectContaining({ gravedad: 'error' }));
  });
});
