import { describe, it, expect } from 'vitest';
import { facturasDeObra, rentabilidadObra, rentabilidadDeObras, numeroDeObra } from './obras';
import { InvoiceStatus, type Gasto, type Invoice, type Obra } from './types';

const obra = (extra: Partial<Obra> = {}): Obra => ({
  id: 'o1', numero: 'OBR-2026-0001', nombre: 'Reforma local', estado: 'abierta',
  fechaApertura: '2026-01-01', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  ...extra,
});

const factura = (extra: Partial<Invoice> = {}): Invoice => ({
  id: crypto.randomUUID(), number: 'FAC-1', series: 'FAC',
  clientId: 'c1', clientName: 'Cliente', clientNif: '',
  clientAddress: '', issueDate: '2026-06-10', dueDate: '2026-07-10',
  status: InvoiceStatus.EMITIDA, lineItems: [],
  subtotal: 100, totalDiscount: 0, totalTax: 21, total: 121,
  paymentMethod: 'transferencia' as never, notes: '',
  tipo: 'factura', sentido: 'venta', obraId: 'o1',
  createdAt: '2026-06-10T00:00:00Z', updatedAt: '2026-06-10T00:00:00Z',
  ...extra,
} as Invoice);

const gasto = (extra: Partial<Gasto> = {}): Gasto => ({
  id: crypto.randomUUID(), fecha: '2026-06-01', concepto: 'Material', categoria: 'material',
  baseImponible: 50, taxRate: 21, taxAmount: 10.5, total: 60.5,
  paymentMethod: 'transferencia' as never, obraId: 'o1',
  createdAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z',
  ...extra,
});

describe('facturasDeObra', () => {
  it('sólo las de esa obra', () => {
    const facturas = [factura({ obraId: 'o1' }), factura({ obraId: 'o2' })];
    expect(facturasDeObra(facturas, 'o1')).toHaveLength(1);
  });

  it('una compra ligada a la obra no cuenta como ingreso', () => {
    const facturas = [factura({ sentido: 'compra' })];
    expect(facturasDeObra(facturas, 'o1')).toHaveLength(0);
  });

  it('un presupuesto no es ingreso todavía', () => {
    const facturas = [factura({ tipo: 'presupuesto' })];
    expect(facturasDeObra(facturas, 'o1')).toHaveLength(0);
  });

  it('un borrador o una anulada no cuentan', () => {
    const facturas = [factura({ status: InvoiceStatus.BORRADOR }), factura({ status: InvoiceStatus.ANULADA })];
    expect(facturasDeObra(facturas, 'o1')).toHaveLength(0);
  });
});

describe('rentabilidadObra', () => {
  it('el margen es lo facturado menos lo gastado', () => {
    const r = rentabilidadObra(obra(), [factura({ total: 1000 })], [gasto({ total: 300 })]);
    expect(r.ingresos).toBe(1000);
    expect(r.costeGastos).toBe(300);
    expect(r.margen).toBe(700);
  });

  it('el margen puede salir negativo: se gastó más de lo que se cobró', () => {
    const r = rentabilidadObra(obra(), [factura({ total: 100 })], [gasto({ total: 500 })]);
    expect(r.margen).toBe(-400);
  });

  it('sin gastos ni facturas, todo a cero', () => {
    const r = rentabilidadObra(obra(), [], []);
    expect(r).toMatchObject({ ingresos: 0, costeGastos: 0, margen: 0, numFacturas: 0, numGastos: 0 });
  });

  it('suma varias facturas y varios gastos de la misma obra', () => {
    const r = rentabilidadObra(
      obra(),
      [factura({ total: 200 }), factura({ total: 300 })],
      [gasto({ total: 50 }), gasto({ total: 70 })],
    );
    expect(r.ingresos).toBe(500);
    expect(r.costeGastos).toBe(120);
    expect(r.numFacturas).toBe(2);
    expect(r.numGastos).toBe(2);
  });

  it('un gasto de otra obra no se cuela', () => {
    const r = rentabilidadObra(obra({ id: 'o1' }), [], [gasto({ obraId: 'o2', total: 999 })]);
    expect(r.costeGastos).toBe(0);
  });
});

describe('rentabilidadDeObras', () => {
  it('ordena de más margen a menos', () => {
    const obras = [obra({ id: 'o1' }), obra({ id: 'o2' })];
    const facturas = [factura({ obraId: 'o1', total: 100 }), factura({ obraId: 'o2', total: 500 })];
    const resumen = rentabilidadDeObras(obras, facturas, []);
    expect(resumen.map(r => r.obraId)).toEqual(['o2', 'o1']);
  });

  it('sin obras no revienta', () => {
    expect(rentabilidadDeObras([], [], [])).toEqual([]);
  });
});

describe('numeroDeObra', () => {
  it('la primera del año es la 0001', () => {
    expect(numeroDeObra([], new Date('2026-03-01'))).toBe('OBR-2026-0001');
  });

  it('cuenta las que ya hay ese año', () => {
    const existentes = [obra({ numero: 'OBR-2026-0001' }), obra({ numero: 'OBR-2026-0002' })];
    expect(numeroDeObra(existentes, new Date('2026-03-01'))).toBe('OBR-2026-0003');
  });

  it('no cuenta las de otro año', () => {
    const existentes = [obra({ numero: 'OBR-2025-0001' })];
    expect(numeroDeObra(existentes, new Date('2026-03-01'))).toBe('OBR-2026-0001');
  });
});
