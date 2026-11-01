import { describe, it, expect } from 'vitest';
import { InvoiceStatus, type CompanySettings, type Invoice, type InvoiceLineItem } from './types';
import { rectificar } from './documentos';
import { lineasPorRectificar, porQueNoSeRectifica } from './rectificativas';

const settings = { seriesDocumentos: { rectificativa_venta: { serie: 'FCR', nextNumber: 3 } } } as unknown as CompanySettings;
const HOY = new Date('2026-10-20T10:00:00Z');

function linea(over: Partial<InvoiceLineItem> = {}): InvoiceLineItem {
  return {
    id: crypto.randomUUID(), productId: 'queso', productName: 'Queso curado 1kg', productRef: 'R3',
    quantity: 5, unitPrice: 20, unit: 'ud' as InvoiceLineItem['unit'], taxRate: 7, discountPercent: 0,
    subtotal: 100, taxAmount: 7, total: 107, ...over,
  };
}

function factura(over: Partial<Invoice> = {}): Invoice {
  return {
    id: 'fac-1', number: 'F-2026-0100', series: 'F', tipo: 'factura', sentido: 'venta',
    clientId: 'c1', clientName: 'Hotel Sol S.L.', clientNif: 'B35100000', clientAddress: 'x',
    issueDate: '2026-09-02', dueDate: '2026-10-02', status: InvoiceStatus.PAGADA,
    lineItems: [linea({ id: 'l1' }), linea({ id: 'l2', productId: 'dto', productName: 'Abono rappel', quantity: -1, unitPrice: 10, subtotal: -10, taxAmount: -0.7, total: -10.7 })],
    subtotal: 90, totalDiscount: 0, taxBreakdown: [], totalTax: 6.3, total: 96.3,
    paymentMethod: 'transferencia' as Invoice['paymentMethod'], notes: 'Entregar por la mañana',
    paidAmount: 96.3, paidDate: '2026-09-30', paymentRecordIds: ['cobro-1'],
    verifactu: { chainedHash: 'ABC', qrCodeUrl: 'https://qr', timestamp: 't', signatureStatus: 'VALID' },
    impuesto: 'IGIC', createdAt: '', updatedAt: '', ...over,
  };
}

describe('rectificar: lo que se copiaba de la original y no debía', () => {
  const r = rectificar(factura(), settings, { hoy: HOY, motivo: 'Devolución de mercancía' });

  it('lleva la fecha de hoy, no la de la original (si no, la cadena la rechaza por fecha anterior)', () => {
    expect(r.issueDate).toBe('2026-10-20');
    expect(r.datosExtras?.fechaFacturaRectificada).toBe('2026-09-02');
  });

  it('no arrastra la huella, el QR, los cobros ni el tipo fiscal de la original', () => {
    expect(r.verifactu).toBeUndefined();
    expect(r.paidAmount).toBe(0);
    expect(r.paidDate).toBeUndefined();
    expect(r.paymentRecordIds).toEqual([]);
    expect(r.tipoFacturaFiscal).toBe('R1');
  });

  it('los importes de cada línea salen en negativo, no solo la cantidad', () => {
    const l1 = r.lineItems.find(l => l.productId === 'queso')!;
    expect(l1).toMatchObject({ quantity: -5, subtotal: -100, taxAmount: -7, total: -107 });
  });

  it('una línea que ya era negativa se compensa en positivo: la rectificativa deshace la original', () => {
    const l2 = r.lineItems.find(l => l.productId === 'dto')!;
    expect(l2.quantity).toBe(1);
    expect(r.lineItems.reduce((s, l) => s + l.subtotal, 0)).toBe(-90);
  });

  it('dice qué rectifica y por qué, y mantiene el impuesto', () => {
    expect(r.documentoOrigenId).toBe('fac-1');
    expect(r.documentoOrigenNumber).toBe('F-2026-0100');
    expect(r.notes).toMatch(/Rectifica la factura F-2026-0100 del 02\/09\/2026\. Motivo: Devolución de mercancía/);
    expect(r.impuesto).toBe('IGIC');
    expect(r.status).toBe(InvoiceStatus.BORRADOR);
  });
});

describe('rectificar: el tipo R1 a R5', () => {
  it('se elige R1 a R4 para una completa', () => {
    expect(rectificar(factura(), settings, { tipo: 'R4', hoy: HOY }).tipoFacturaFiscal).toBe('R4');
  });
  it('un ticket o una simplificada siempre se rectifica con R5, y sin colgarse de la caja', () => {
    const r = rectificar(factura({ posSessionId: 'caja-1', tipoFacturaFiscal: 'F2' }), settings, { tipo: 'R1', hoy: HOY });
    expect(r.tipoFacturaFiscal).toBe('R5');
    expect(r.posSessionId).toBeUndefined();
  });
  it('R5 no vale para una factura completa', () => {
    expect(() => rectificar(factura(), settings, { tipo: 'R5', hoy: HOY })).toThrow(/simplificad/);
  });
});

describe('rectificar dos veces lo mismo', () => {
  const original = factura();
  const parcial = { ...rectificar(original, settings, { hoy: HOY, cantidades: { l1: 2 } }), status: InvoiceStatus.EMITIDA };

  it('una rectificación parcial deja rectificable solo lo que queda', () => {
    expect(parcial.lineItems).toHaveLength(1);
    expect(parcial.lineItems[0].quantity).toBe(-2);
    const quedan = lineasPorRectificar(original, [original, parcial]);
    expect(quedan.find(q => q.linea.id === 'l1')?.queda).toBe(3);
  });

  it('no deja rectificar más de lo que queda', () => {
    expect(() => rectificar(original, settings, { hoy: HOY, docs: [original, parcial], cantidades: { l1: 4 } })).toThrow(/quedan 3/);
  });

  it('rectificada entera, ya no se puede volver a rectificar', () => {
    const resto = { ...rectificar(original, settings, { hoy: HOY, docs: [original, parcial] }), status: InvoiceStatus.EMITIDA };
    expect(porQueNoSeRectifica(original, [original, parcial, resto])).toMatch(/rectificada entera/);
  });

  it('con una rectificativa en borrador, no se abre otra', () => {
    const borrador = rectificar(original, settings, { hoy: HOY });
    expect(porQueNoSeRectifica(original, [original, borrador])).toMatch(/en borrador/);
  });

  it('una anulada no cuenta', () => {
    const anulada = { ...rectificar(original, settings, { hoy: HOY }), status: InvoiceStatus.ANULADA };
    expect(porQueNoSeRectifica(original, [original, anulada])).toBeNull();
  });
});

describe('qué no se rectifica', () => {
  it('un borrador se corrige editándolo', () => {
    expect(porQueNoSeRectifica(factura({ status: InvoiceStatus.BORRADOR }), [])).toMatch(/borrador/);
    expect(() => rectificar(factura({ status: InvoiceStatus.BORRADOR }), settings, { hoy: HOY })).toThrow(/borrador/);
  });
  it('una anulada no tiene nada que rectificar', () => {
    expect(porQueNoSeRectifica(factura({ status: InvoiceStatus.ANULADA }), [])).toMatch(/anulada/);
  });
  it('una rectificativa no se rectifica: se rectifica la original', () => {
    expect(porQueNoSeRectifica(factura({ tipo: 'rectificativa' }), [])).toMatch(/original/);
  });
  it('rectificar no toca la original', () => {
    const original = factura();
    const copia = structuredClone(original);
    rectificar(original, settings, { hoy: HOY });
    expect(original).toEqual(copia);
  });
});

describe('el registro Veri*Factu de la rectificativa', () => {
  it('lleva la fecha de la factura rectificada, no la suya', async () => {
    // Con la fecha de hoy en la rectificativa, la de la original solo la
    // sabe ella (datosExtras): el registro mandaba la de la rectificativa.
    const { registroAltaDesdeFila } = await import('./verifactu/mapeo');
    const r = rectificar(factura(), settings, { hoy: HOY });
    const alta = registroAltaDesdeFila({
      registro: {
        id: 'r', invoice_id: r.id, tipo_registro: 'alta', indice: 2, huella: 'A'.repeat(64), huella_anterior: 'B'.repeat(64),
        id_emisor: 'B35999999', num_serie: r.number, fecha_expedicion: r.issueDate, tipo_factura: 'R1', cuota_total: -6.3,
        importe_total: -96.3, fecha_hora_huso: '2026-10-20T12:00:00+01:00', estado: 'pendiente', intentos: 0,
      },
      factura: {
        id: r.id, client_name: r.clientName, client_nif: r.clientNif, client_vat_number: null, es_intracomunitaria: false,
        clave_regimen_iva: null, tipo: 'rectificativa', documento_origen_number: r.documentoOrigenNumber ?? null,
        documento_origen_id: r.documentoOrigenId ?? null, issue_date: r.issueDate, notes: r.notes, datos_extras: r.datosExtras ?? null,
      },
      tramos: [{ rate: 7, base_amount: -90, tax_amount: -6.3 }],
      lineas: [{ product_name: 'Queso' }],
      nombreRazonEmisor: 'Distribuciones Rogar S.L.',
    });
    expect(alta.facturasRectificadas).toEqual([{ idEmisor: 'B35999999', numSerie: 'F-2026-0100', fecha: '2026-09-02' }]);
  });
});
