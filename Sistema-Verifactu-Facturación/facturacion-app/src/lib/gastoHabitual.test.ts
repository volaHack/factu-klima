/* eslint-disable @typescript-eslint/no-explicit-any -- datos de prueba a medias */
import { describe, it, expect } from 'vitest';
import { habitoProveedor, avisoImporte, propuestasGasto, type CampoGasto } from './gastoHabitual';
import { PaymentMethod } from './types';

const gasto = (id: string, fecha: string, extra: Record<string, unknown> = {}) => ({
  id, fecha, concepto: `Luz ${fecha}`, categoria: 'suministros', proveedorId: 'luz', proveedorNombre: 'Eléctrica Canaria',
  baseImponible: 100, taxRate: 7, taxAmount: 7, total: 107, paymentMethod: PaymentMethod.DOMICILIACION,
  createdAt: fecha, updatedAt: fecha, ...extra,
}) as any;

const compra = (id: string, fecha: string, extra: Record<string, unknown> = {}) => ({
  id, number: `FC-${id}`, tipo: 'factura', sentido: 'compra', status: 'pendiente', clientId: 'luz', clientName: 'Eléctrica Canaria',
  issueDate: fecha, subtotal: 120, paymentMethod: PaymentMethod.TRANSFERENCIA, lineItems: [], ...extra,
}) as any;

describe('lo de siempre con un proveedor', () => {
  const gastos = [
    gasto('g1', '2026-07-05'),
    gasto('g2', '2026-09-05', { taxRate: 3, categoria: 'servicios' }),
    gasto('g3', '2026-08-05'),
    gasto('otro', '2026-10-01', { proveedorId: 'gestor', proveedorNombre: 'Gestoría', categoria: 'servicios' }),
  ];

  it('propone lo del último gasto con él', () => {
    const h = habitoProveedor({ id: 'luz' }, gastos);
    expect(h).toMatchObject({ categoria: 'servicios', taxRate: 3, paymentMethod: PaymentMethod.DOMICILIACION, ultimaFecha: '2026-09-05' });
    expect(h?.bases).toEqual([100, 100, 100]);
  });

  it('sin ficha, casa por el nombre sin mirar tildes ni mayúsculas', () => {
    const sinFicha = gastos.map(g => ({ ...g, proveedorId: undefined }));
    expect(habitoProveedor({ nombre: 'electrica canaria' }, sinFicha)?.ultimaFecha).toBe('2026-09-05');
  });

  it('la forma de pago la da lo más reciente, sea gasto o factura de compra', () => {
    const h = habitoProveedor({ id: 'luz' }, gastos, [compra('c1', '2026-10-10'), compra('c2', '2026-10-12', { status: 'borrador' })]);
    expect(h?.paymentMethod).toBe(PaymentMethod.TRANSFERENCIA);
    expect(h?.categoria).toBe('servicios');
    expect(h?.bases[0]).toBe(120);
  });

  it('deja fuera el gasto que se está editando', () => {
    expect(habitoProveedor({ id: 'luz' }, gastos, [], 'g2')?.ultimaFecha).toBe('2026-08-05');
  });

  it('con un proveedor nuevo no hay nada que proponer', () => {
    expect(habitoProveedor({ id: 'nuevo' }, gastos)).toBeNull();
    expect(habitoProveedor({}, gastos)).toBeNull();
  });
});

describe('avisar si el importe se sale de lo habitual', () => {
  const bases = [100, 110, 95, 105];

  it('avisa del triple, con lo que suele ser', () => {
    const a = avisoImporte(320, bases, 'Eléctrica Canaria');
    expect(a?.habitual).toBe(102.5);
    expect(a?.texto).toContain('3,1 veces lo habitual con Eléctrica Canaria');
  });

  it('avisa del doble y de menos de la mitad', () => {
    expect(avisoImporte(210, bases)?.texto).toContain('el doble de');
    expect(avisoImporte(40, bases)?.texto).toContain('menos de la mitad de');
  });

  it('lo normal no avisa', () => {
    expect(avisoImporte(150, bases)).toBeNull();
  });

  it('con menos de tres anteriores no hay costumbre', () => {
    expect(avisoImporte(900, [100, 100])).toBeNull();
  });

  it('las diferencias pequeñas no son noticia', () => {
    expect(avisoImporte(9, [3, 3, 3])).toBeNull();
  });
});

describe('qué se pone solo y qué se sugiere', () => {
  const habito = { categoria: 'suministros', taxRate: 7, paymentMethod: PaymentMethod.DOMICILIACION, ultimaFecha: '', ultimoConcepto: '', bases: [] } as any;
  const actual = { categoria: 'otros', taxRate: 21, paymentMethod: PaymentMethod.TRANSFERENCIA } as any;

  it('lo no tocado se pone solo; lo tocado a mano queda como sugerencia', () => {
    const r = propuestasGasto(habito, actual, new Set<CampoGasto>(['taxRate']));
    expect(r.aplicarSolas.map(p => p.campo)).toEqual(['categoria', 'paymentMethod']);
    expect(r.sugeridas).toEqual([{ campo: 'taxRate', valor: 7 }]);
  });

  it('lo que ya coincide no se propone', () => {
    const r = propuestasGasto(habito, { ...actual, categoria: 'suministros', taxRate: 7, paymentMethod: PaymentMethod.DOMICILIACION });
    expect(r).toEqual({ aplicarSolas: [], sugeridas: [] });
  });
});
