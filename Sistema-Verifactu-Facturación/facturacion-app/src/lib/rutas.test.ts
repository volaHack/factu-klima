import { describe, it, expect } from 'vitest';
import { clientesDeRuta, albaranesPendientesDeRuta, resumenDeRuta } from './rutas';
import { InvoiceStatus, type Client, type Invoice } from './types';

const cliente = (extra: Partial<Client> = {}): Client => ({
  id: crypto.randomUUID(), nif: '', businessName: 'Bar Pepe', tradeName: '',
  email: '', phone: '', contactPerson: '', address: '', city: '', postalCode: '',
  province: '', country: 'España', paymentDays: 30,
  defaultPaymentMethod: 'transferencia' as never, notes: '', active: true,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  ...extra,
});

const albaran = (extra: Partial<Invoice> = {}): Invoice => ({
  id: crypto.randomUUID(), number: 'ALB-1', series: 'ALB',
  clientId: 'c1', clientName: 'Bar Pepe', clientNif: '',
  clientAddress: '', issueDate: '2026-06-10', dueDate: '2026-06-10',
  status: InvoiceStatus.BORRADOR, lineItems: [],
  subtotal: 100, totalDiscount: 0, totalTax: 21, total: 121,
  paymentMethod: 'transferencia' as never, notes: '',
  tipo: 'albaran', sentido: 'venta',
  createdAt: '2026-06-10T00:00:00Z', updatedAt: '2026-06-10T00:00:00Z',
  ...extra,
} as Invoice);

describe('clientesDeRuta', () => {
  it('sólo los de esa ruta', () => {
    const clientes = [cliente({ rutaId: 'r1' }), cliente({ rutaId: 'r2' })];
    expect(clientesDeRuta('r1', clientes)).toHaveLength(1);
  });
});

describe('albaranesPendientesDeRuta', () => {
  it('sólo albaranes en borrador: los ya expedidos no quedan por repartir', () => {
    const clientes = [cliente({ id: 'c1', rutaId: 'r1' })];
    const albaranes = [
      albaran({ clientId: 'c1', status: InvoiceStatus.BORRADOR }),
      albaran({ clientId: 'c1', status: InvoiceStatus.EXPEDIDO }),
    ];
    expect(albaranesPendientesDeRuta('r1', clientes, albaranes)).toHaveLength(1);
  });

  it('sólo de los clientes de la ruta', () => {
    const clientes = [cliente({ id: 'c1', rutaId: 'r1' }), cliente({ id: 'c2', rutaId: 'r2' })];
    const albaranes = [albaran({ clientId: 'c1' }), albaran({ clientId: 'c2' })];
    expect(albaranesPendientesDeRuta('r1', clientes, albaranes)).toHaveLength(1);
  });

  it('una factura no es un albarán pendiente de repartir', () => {
    const clientes = [cliente({ id: 'c1', rutaId: 'r1' })];
    const albaranes = [albaran({ clientId: 'c1', tipo: 'factura' })];
    expect(albaranesPendientesDeRuta('r1', clientes, albaranes)).toHaveLength(0);
  });

  it('una compra no es un reparto a cliente', () => {
    const clientes = [cliente({ id: 'c1', rutaId: 'r1' })];
    const albaranes = [albaran({ clientId: 'c1', sentido: 'compra' })];
    expect(albaranesPendientesDeRuta('r1', clientes, albaranes)).toHaveLength(0);
  });
});

describe('resumenDeRuta', () => {
  it('una parada por cliente, no por albarán', () => {
    const clientes = [cliente({ id: 'c1', rutaId: 'r1' })];
    const albaranes = [
      albaran({ clientId: 'c1', number: 'ALB-1' }),
      albaran({ clientId: 'c1', number: 'ALB-2' }),
    ];
    expect(resumenDeRuta('r1', clientes, albaranes).paradas).toBe(1);
  });

  it('dos clientes son dos paradas', () => {
    const clientes = [cliente({ id: 'c1', rutaId: 'r1' }), cliente({ id: 'c2', rutaId: 'r1' })];
    const albaranes = [albaran({ clientId: 'c1' }), albaran({ clientId: 'c2' })];
    expect(resumenDeRuta('r1', clientes, albaranes).paradas).toBe(2);
  });

  it('suma el importe de todos los albaranes pendientes', () => {
    const clientes = [cliente({ id: 'c1', rutaId: 'r1' })];
    const albaranes = [albaran({ clientId: 'c1', total: 100 }), albaran({ clientId: 'c1', total: 50 })];
    expect(resumenDeRuta('r1', clientes, albaranes).importe).toBe(150);
  });

  it('una ruta sin nada pendiente da cero', () => {
    expect(resumenDeRuta('r-vacia', [], [])).toEqual({ paradas: 0, importe: 0 });
  });
});
