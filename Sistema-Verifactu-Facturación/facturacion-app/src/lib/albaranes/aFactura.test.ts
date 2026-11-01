import { describe, it, expect } from 'vitest';

import {
  desdeAlbaran, desdeDocumento, explicarRechazados, facturaDelGrupo, impuestoQueNoCasa, planDeFacturas,
  resumenDelPlan, revisarSeleccion, siguienteNumeroDeFactura, CLAVE_ALBARANES,
} from './aFactura';
import { DEFAULT_COMPANY_SETTINGS } from '@/lib/constants';
import { InvoiceStatus, PaymentMethod, type Albaran, type Invoice } from '@/lib/types';

function albaran(p: Partial<Albaran> & { id: string }): Albaran {
  return {
    number: `ALB-${p.id}`, series: 'ALB', clientId: 'c1', clientName: 'Bar Pepe', clientNif: 'B35000001', clientAddress: '',
    issueDate: '2026-03-02', status: 'expedido', subtotal: 100, totalDiscount: 0, taxBreakdown: [], totalTax: 7, total: 107,
    notes: '', createdAt: '', updatedAt: '',
    lineItems: [{
      id: `l-${p.id}`, productId: 'p1', productName: 'Agua 1,5 L', productRef: 'A15', quantity: 10, unitPrice: 10,
      unit: 'ud', taxRate: 7, discountPercent: 0, subtotal: 100, taxAmount: 7, total: 107,
    }],
    ...p,
  } as Albaran;
}

function documento(p: Partial<Invoice> & { id: string }): Invoice {
  return {
    number: `ALB-${p.id}`, series: 'ALB', tipo: 'albaran', sentido: 'venta', clientId: 'c1', clientName: 'Bar Pepe',
    clientNif: 'B35000001', clientAddress: '', issueDate: '2026-03-02', dueDate: '2026-03-02', status: InvoiceStatus.EXPEDIDO,
    lineItems: albaran({ id: p.id }).lineItems, subtotal: 100, totalDiscount: 0, taxBreakdown: [], totalTax: 7, total: 107,
    paymentMethod: PaymentMethod.TRANSFERENCIA, notes: '', createdAt: '', updatedAt: '',
    ...p,
  } as Invoice;
}

describe('qué se puede facturar', () => {
  it('sólo los expedidos, y de los demás dice por qué', () => {
    const r = revisarSeleccion([
      desdeAlbaran(albaran({ id: '1' })),
      desdeAlbaran(albaran({ id: '2', status: 'borrador' })),
      desdeAlbaran(albaran({ id: '3', status: 'facturado', invoiceId: 'f1' }), [{ id: 'f1', number: 'F-2026-0007' } as Invoice]),
      desdeAlbaran(albaran({ id: '4', status: 'anulado' })),
      desdeAlbaran(albaran({ id: '5', lineItems: [] })),
    ]);
    expect(r.facturables.map(a => a.id)).toEqual(['1']);
    expect(explicarRechazados(r.rechazados)).toBe(
      'ALB-2 aún no se ha expedido; ALB-3 ya está facturado en F-2026-0007; ALB-4 está anulado; ALB-5 no tiene líneas',
    );
  });

  it('un albarán de Documentos que ya pasó a factura desde su ficha cuenta como facturado', () => {
    const doc = documento({ id: 'd1' });
    const factura = { id: 'f1', number: 'F-2026-0003', tipo: 'factura', status: InvoiceStatus.BORRADOR, documentoOrigenId: 'd1' } as Invoice;
    expect(desdeDocumento(doc, [doc, factura])).toMatchObject({ estado: 'facturado', factura: { number: 'F-2026-0003' } });
    // Si esa factura se anuló, vuelve a poder facturarse.
    expect(desdeDocumento(doc, [doc, { ...factura, status: InvoiceStatus.ANULADA }]).estado).toBe('expedido');
  });
});

describe('cuántas facturas salen', () => {
  it('una por cliente, con el resumen que se enseña antes de confirmar', () => {
    const plan = planDeFacturas([
      desdeAlbaran(albaran({ id: '1', clientId: 'c1', clientName: 'Bar Pepe' })),
      desdeAlbaran(albaran({ id: '2', clientId: 'c1', clientName: 'Bar Pepe', issueDate: '2026-03-09' })),
      desdeAlbaran(albaran({ id: '3', clientId: 'c2', clientName: 'Hotel Sol' })),
      desdeAlbaran(albaran({ id: '4', clientId: '', clientName: 'Kiosko sin ficha', clientNif: 'X1234567L' })),
    ]);
    expect(plan.grupos.map(g => [g.clientName, g.albaranes.length])).toEqual([['Bar Pepe', 2], ['Hotel Sol', 1], ['Kiosko sin ficha', 1]]);
    expect(resumenDelPlan(plan)).toMatch(/^3 facturas para 3 clientes · total 428,00\s€$/);
    expect(plan.separados).toEqual([]);
  });

  it('si un cliente sale en dos facturas, dice por qué', () => {
    const plan = planDeFacturas([
      desdeDocumento(documento({ id: '1' })),
      desdeDocumento(documento({ id: '2', globalDiscountPercent1: 3 })),
      desdeDocumento(documento({ id: '3', retencionPct: 1 })),
    ]);
    expect(plan.grupos).toHaveLength(3);
    expect(resumenDelPlan(plan)).toMatch(/^3 facturas para 1 cliente/);
    expect(plan.separados).toEqual([{ clientName: 'Bar Pepe', facturas: 3, motivo: 'descuentos de pie distintos, otra retención' }]);
  });

  it('avisa si un albarán se hizo con otro impuesto que el de la empresa', () => {
    const plan = planDeFacturas([desdeDocumento(documento({ id: '1', impuesto: 'IVA' }))]);
    expect(impuestoQueNoCasa(plan.grupos, 'IGIC')).toMatch(/^ALB-1 se hizo con IVA y tu empresa factura ahora con IGIC/);
    expect(impuestoQueNoCasa(plan.grupos, 'IVA')).toBeNull();
  });
});

describe('la factura de un grupo', () => {
  it('sin ficha, el cliente ocasional del albarán viaja a la factura y cada línea queda apuntada a su albarán', () => {
    const ocasional = JSON.stringify({ nombre: 'Kiosko', nif: 'X1234567L' });
    const [grupo] = planDeFacturas([
      desdeAlbaran(albaran({ id: '1', clientId: '', clientName: 'Kiosko', datosExtras: { __cliente: ocasional } })),
    ]).grupos;
    let n = 0;
    const f = facturaDelGrupo(grupo, {
      ajustes: { ...DEFAULT_COMPANY_SETTINGS, defaultPaymentDays: 15 }, serie: 'F', numero: 'F-2026-0001',
      hoy: '2026-03-31', ahora: '2026-03-31T10:00:00Z', nuevoId: () => `id${++n}`,
    });
    expect(f).toMatchObject({ clientName: 'Kiosko', dueDate: '2026-04-15', status: InvoiceStatus.BORRADOR, tipo: 'factura' });
    expect(f.datosExtras?.__cliente).toBe(ocasional);
    expect(JSON.parse(f.datosExtras![CLAVE_ALBARANES])).toEqual([
      { id: '1', origen: 'albaran', numero: 'ALB-1', fecha: '2026-03-02', lineas: ['id1'] },
    ]);
    // Los de la tabla se enlazan por su invoice_id, no por el origen.
    expect(f.documentoOrigenId).toBeUndefined();
  });
});

describe('el número', () => {
  const facturas = [
    { series: 'F', number: 'F-2026-0040' },
    { series: 'F', number: 'F-2025-0900' },
    { series: 'FR', number: 'FR-2026-0099' },
  ];

  it('el mayor de los dos contadores y de lo ya usado este año en la serie', () => {
    expect(siguienteNumeroDeFactura({ invoiceSeries: 'F', nextInvoiceNumber: 12, seriesDocumentos: { factura_venta: { serie: 'F', nextNumber: 30 } } }, facturas, 2026))
      .toEqual({ serie: 'F', numero: 'F-2026-0041', secuencia: 41 });
    expect(siguienteNumeroDeFactura({ invoiceSeries: 'F', nextInvoiceNumber: 50, seriesDocumentos: {} }, facturas, 2026).numero).toBe('F-2026-0050');
  });

  it('el contador de otra serie no cuenta', () => {
    expect(siguienteNumeroDeFactura({ invoiceSeries: 'F', nextInvoiceNumber: 1, seriesDocumentos: { factura_venta: { serie: 'FV', nextNumber: 300 } } }, [], 2026).numero)
      .toBe('F-2026-0001');
  });
});
