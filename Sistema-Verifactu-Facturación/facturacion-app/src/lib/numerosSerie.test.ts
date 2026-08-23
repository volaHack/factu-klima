import { describe, it, expect } from 'vitest';
import { numerosEnStock, finGarantia, enGarantia, buscarPorNumero, venderNumero, garantiasPorTerminar } from './numerosSerie';
import type { NumeroSerie } from './types';

const unidad = (extra: Partial<NumeroSerie> = {}): NumeroSerie => ({
  id: crypto.randomUUID(), productId: 'p1', productRef: 'REF1', productName: 'Taladro',
  numeroSerie: 'SN-0001', estado: 'en_stock', fechaEntrada: '2026-01-01',
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  ...extra,
});

describe('numerosEnStock', () => {
  it('sólo las que están en stock, de ese producto', () => {
    const unidades = [
      unidad({ productId: 'p1', estado: 'en_stock' }),
      unidad({ productId: 'p1', estado: 'vendido' }),
      unidad({ productId: 'p2', estado: 'en_stock' }),
    ];
    expect(numerosEnStock(unidades, 'p1')).toHaveLength(1);
  });
});

describe('finGarantia', () => {
  it('suma los meses de garantía a la fecha de venta', () => {
    const u = unidad({ fechaVenta: '2026-01-15', garantiaMeses: 24 });
    expect(finGarantia(u)).toBe('2028-01-15');
  });

  it('sin fecha de venta, no hay garantía que contar', () => {
    expect(finGarantia(unidad({ fechaVenta: undefined, garantiaMeses: 24 }))).toBeNull();
  });

  it('sin meses de garantía, tampoco', () => {
    expect(finGarantia(unidad({ fechaVenta: '2026-01-15', garantiaMeses: undefined }))).toBeNull();
  });
});

describe('enGarantia', () => {
  it('sigue en garantía si la fecha de hoy no ha pasado el final', () => {
    const u = unidad({ fechaVenta: '2026-01-01', garantiaMeses: 12 });
    expect(enGarantia(u, new Date('2026-06-01'))).toBe(true);
  });

  it('fuera de garantía si ya pasó', () => {
    const u = unidad({ fechaVenta: '2024-01-01', garantiaMeses: 12 });
    expect(enGarantia(u, new Date('2026-06-01'))).toBe(false);
  });

  it('una unidad sin vender no está en garantía', () => {
    expect(enGarantia(unidad({ fechaVenta: undefined }))).toBe(false);
  });
});

describe('buscarPorNumero', () => {
  it('encuentra la unidad por su número exacto', () => {
    const unidades = [unidad({ numeroSerie: 'SN-4471' })];
    expect(buscarPorNumero('SN-4471', unidades)?.numeroSerie).toBe('SN-4471');
  });

  it('no distingue mayúsculas', () => {
    const unidades = [unidad({ numeroSerie: 'SN-4471' })];
    expect(buscarPorNumero('sn-4471', unidades)).not.toBeNull();
  });

  it('sin coincidencia, null', () => {
    expect(buscarPorNumero('lo-que-sea', [unidad()])).toBeNull();
  });

  it('una búsqueda vacía no devuelve la primera por error', () => {
    expect(buscarPorNumero('', [unidad()])).toBeNull();
  });
});

describe('venderNumero', () => {
  it('pasa a vendido con los datos de la venta', () => {
    const u = venderNumero(unidad(), {
      fechaVenta: '2026-06-01', clienteId: 'c1', clienteNombre: 'Ferretería Sur', invoiceId: 'f1',
    });
    expect(u.estado).toBe('vendido');
    expect(u.clienteNombre).toBe('Ferretería Sur');
    expect(u.invoiceId).toBe('f1');
  });
});

describe('garantiasPorTerminar', () => {
  it('las que terminan dentro del plazo', () => {
    const unidades = [
      unidad({ id: 'u1', estado: 'vendido', fechaVenta: '2025-12-20', garantiaMeses: 6 }), // termina 2026-06-20
      unidad({ id: 'u2', estado: 'vendido', fechaVenta: '2020-01-01', garantiaMeses: 12 }), // ya lejísimos
    ];
    const resultado = garantiasPorTerminar(unidades, 30, new Date('2026-06-01'));
    expect(resultado.map(u => u.id)).toEqual(['u1']);
  });

  it('una ya vencida no avisa: eso no es «por terminar»', () => {
    const unidades = [unidad({ estado: 'vendido', fechaVenta: '2024-01-01', garantiaMeses: 12 })];
    expect(garantiasPorTerminar(unidades, 30, new Date('2026-06-01'))).toHaveLength(0);
  });

  it('una unidad en stock no tiene garantía que avisar', () => {
    const unidades = [unidad({ estado: 'en_stock' })];
    expect(garantiasPorTerminar(unidades)).toHaveLength(0);
  });
});
