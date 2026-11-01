import { describe, it, expect, vi } from 'vitest';
import { InvoiceStatus, type Invoice } from '../types';
import { calcularModelo420 } from './atc/modelo420';
import { impuestoDeCompras } from './FiscalCalculationService';
import { libroDeRecibidas } from '../paqueteGestoria';
import { conDatosDelProveedor } from '../compras';

function factura(over: Partial<Invoice>): Invoice {
  return {
    id: 'v1', number: 'F-1', series: 'F', clientId: 'c1', clientName: 'Hotel Sol S.L.', clientNif: 'B35100000', clientAddress: '',
    issueDate: '2026-02-10', dueDate: '2026-03-10', status: InvoiceStatus.EMITIDA, lineItems: [], subtotal: 1000, totalDiscount: 0,
    taxBreakdown: [{ rate: 7, base: 1000, amount: 70 }], totalTax: 70, total: 1070, paymentMethod: 'transferencia' as Invoice['paymentMethod'],
    notes: '', tipo: 'factura', sentido: 'venta', createdAt: '', updatedAt: '', ...over,
  };
}
const compra = conDatosDelProveedor(factura({
  id: 'c1', number: 'FACC-2026-0004', sentido: 'compra', clientName: 'Almazara Sur S.L.', clientNif: 'B76200000',
  subtotal: 200, totalTax: 14, total: 214, taxBreakdown: [{ rate: 7, base: 200, amount: 14 }],
}), { numero: 'AS/889', fechaExpedicion: '2026-03-29', fechaRegistro: '2026-04-03' });

vi.mock('../storage', () => ({
  getInvoices: async () => [factura({}), compra, factura({ id: 'alb', tipo: 'albaran', sentido: 'compra' })],
  getClients: async () => [],
  getGastos: async () => [],
  getCompanySettings: async () => ({ igicEnabled: true }),
  serieDeTipo: () => ({ serie: 'X', nextNumber: 1 }),
}));

describe('las facturas recibidas en los modelos', () => {
  it('Listados fiscales carga también las facturas de compra (antes solo las de venta)', async () => {
    // Sin ellas el 420 de la pantalla salía sin IGIC soportado de proveedores.
    const { cargarDatosFiscales } = await import('./FiscalDataService');
    const d = await cargarDatosFiscales(2026);
    expect(d.facturas.map(f => f.id).sort()).toEqual(['c1', 'v1']);
  });

  it('el IGIC soportado se deduce en el trimestre en que se registra la factura, no en el de su fecha', () => {
    const t1 = calcularModelo420({ facturas: [factura({}), compra], gastos: [] }, { ejercicio: 2026, trimestre: 1 });
    const t2 = calcularModelo420({ facturas: [compra], gastos: [] }, { ejercicio: 2026, trimestre: 2 });
    expect(t1.totalDeducible).toBe(0);
    expect(t2.totalDeducible).toBe(14);
    expect(impuestoDeCompras([compra], { ejercicio: 2026, trimestre: 2 }).ordinarias.cuota).toBe(14);
  });

  it('el libro de recibidas lleva el número del proveedor y las dos fechas', () => {
    const csv = libroDeRecibidas([compra], 'IGIC');
    const [cabecera, fila] = csv.replace(/^﻿/, '').split(/\r?\n/);
    expect(cabecera).toContain('Nº factura del proveedor');
    expect(cabecera).toContain('Fecha de registro');
    expect(fila).toContain('AS/889');
    expect(fila).toContain('2026-03-29');
    expect(fila).toContain('2026-04-03');
  });
});
