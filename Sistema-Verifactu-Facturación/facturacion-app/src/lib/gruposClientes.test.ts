import { describe, it, expect } from 'vitest';
import { clientesDelGrupo, facturadoDeGrupo, resumenGrupos } from './gruposClientes';
import { InvoiceStatus, type Client, type Invoice } from './types';

const cliente = (extra: Partial<Client> = {}): Client => ({
  id: crypto.randomUUID(), nif: '', businessName: 'Sucursal', tradeName: '',
  email: '', phone: '', contactPerson: '', address: '', city: '', postalCode: '',
  province: '', country: 'España', paymentDays: 30,
  defaultPaymentMethod: 'transferencia' as never, notes: '', active: true,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  ...extra,
});

const factura = (extra: Partial<Invoice> = {}): Invoice => ({
  id: crypto.randomUUID(), number: 'FAC-1', series: 'FAC',
  clientId: 'c1', clientName: 'Sucursal', clientNif: '',
  clientAddress: '', issueDate: '2026-06-10', dueDate: '2026-07-10',
  status: InvoiceStatus.EMITIDA, lineItems: [],
  subtotal: 100, totalDiscount: 0, totalTax: 21, total: 121,
  paymentMethod: 'transferencia' as never, notes: '',
  tipo: 'factura', sentido: 'venta',
  createdAt: '2026-06-10T00:00:00Z', updatedAt: '2026-06-10T00:00:00Z',
  ...extra,
} as Invoice);

describe('clientesDelGrupo', () => {
  it('sólo los del grupo que se pregunta', () => {
    const clientes = [cliente({ grupoId: 'g1' }), cliente({ grupoId: 'g2' })];
    expect(clientesDelGrupo('g1', clientes)).toHaveLength(1);
  });

  it('un cliente sin grupo no aparece en ninguno', () => {
    const clientes = [cliente({ grupoId: undefined })];
    expect(clientesDelGrupo('g1', clientes)).toHaveLength(0);
  });
});

describe('facturadoDeGrupo', () => {
  it('suma lo facturado a todos los clientes del grupo, como si fuera uno', () => {
    const clientes = [cliente({ id: 'c1', grupoId: 'g1' }), cliente({ id: 'c2', grupoId: 'g1' })];
    const facturas = [factura({ clientId: 'c1', total: 500 }), factura({ clientId: 'c2', total: 300 })];
    expect(facturadoDeGrupo('g1', clientes, facturas).facturado).toBe(800);
  });

  it('un cliente de otro grupo no se cuela', () => {
    const clientes = [cliente({ id: 'c1', grupoId: 'g1' }), cliente({ id: 'c2', grupoId: 'g2' })];
    const facturas = [factura({ clientId: 'c1', total: 500 }), factura({ clientId: 'c2', total: 999 })];
    expect(facturadoDeGrupo('g1', clientes, facturas).facturado).toBe(500);
  });

  it('presupuestos y borradores no cuentan', () => {
    const clientes = [cliente({ id: 'c1', grupoId: 'g1' })];
    const facturas = [
      factura({ clientId: 'c1', tipo: 'presupuesto' }),
      factura({ clientId: 'c1', status: InvoiceStatus.BORRADOR }),
    ];
    expect(facturadoDeGrupo('g1', clientes, facturas).facturado).toBe(0);
  });

  it('un grupo sin clientes factura cero', () => {
    expect(facturadoDeGrupo('g-vacio', [], []).facturado).toBe(0);
  });
});

describe('resumenGrupos', () => {
  it('ordena de quien más factura a quien menos', () => {
    const clientes = [cliente({ id: 'c1', grupoId: 'g1' }), cliente({ id: 'c2', grupoId: 'g2' })];
    const facturas = [factura({ clientId: 'c1', total: 100 }), factura({ clientId: 'c2', total: 900 })];
    const grupos = [{ id: 'g1', nombre: 'Cadena A' }, { id: 'g2', nombre: 'Cadena B' }];
    expect(resumenGrupos(grupos, clientes, facturas).map(g => g.grupoId)).toEqual(['g2', 'g1']);
  });

  it('cuenta cuántos clientes tiene cada grupo', () => {
    const clientes = [cliente({ id: 'c1', grupoId: 'g1' }), cliente({ id: 'c2', grupoId: 'g1' })];
    const grupos = [{ id: 'g1', nombre: 'Cadena A' }];
    expect(resumenGrupos(grupos, clientes, [])[0].numClientes).toBe(2);
  });

  it('sin grupos no revienta', () => {
    expect(resumenGrupos([], [], [])).toEqual([]);
  });
});
