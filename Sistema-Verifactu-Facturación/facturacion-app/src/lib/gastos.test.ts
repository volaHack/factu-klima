import { describe, it, expect } from 'vitest';
import { calcularGasto, totalGastos, costeDeVehiculos, gastoVacio, CATEGORIAS_GASTO } from './gastos';
import { PaymentMethod, type Gasto } from './types';

const gasto = (extra: Partial<Gasto> = {}): Gasto => ({
  id: crypto.randomUUID(),
  fecha: '2026-08-01',
  concepto: 'Gasolina',
  categoria: 'vehiculo',
  baseImponible: 100,
  taxRate: 21,
  taxAmount: 21,
  total: 121,
  paymentMethod: PaymentMethod.TARJETA,
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
  ...extra,
});

describe('calcularGasto', () => {
  it('la cuota es la base por el tipo', () => {
    expect(calcularGasto(100, 21)).toEqual({ taxAmount: 21, total: 121 });
  });

  it('el total es la base más la cuota', () => {
    expect(calcularGasto(50, 10)).toEqual({ taxAmount: 5, total: 55 });
  });

  it('un tipo cero no rompe nada', () => {
    // Hay gastos exentos: seguros, algunos impuestos.
    expect(calcularGasto(100, 0)).toEqual({ taxAmount: 0, total: 100 });
  });

  it('redondea a los dos decimales del euro', () => {
    expect(calcularGasto(33.33, 21)).toEqual({ taxAmount: 7, total: 40.33 });
  });
});

describe('totalGastos', () => {
  const lista = [
    gasto({ fecha: '2026-01-10', total: 100, categoria: 'alquiler' }),
    gasto({ fecha: '2026-02-10', total: 50, categoria: 'suministros' }),
    gasto({ fecha: '2026-02-20', total: 30, categoria: 'vehiculo', vehiculoId: 'v1' }),
  ];

  it('suma todos si no se acota', () => {
    expect(totalGastos(lista)).toBe(180);
  });

  it('se acota por fecha desde', () => {
    expect(totalGastos(lista, { desde: '2026-02-01' })).toBe(80);
  });

  it('se acota por fecha hasta', () => {
    expect(totalGastos(lista, { hasta: '2026-01-31' })).toBe(100);
  });

  it('se acota por categoría', () => {
    expect(totalGastos(lista, { categoria: 'alquiler' })).toBe(100);
  });

  it('se acota por vehículo', () => {
    expect(totalGastos(lista, { vehiculoId: 'v1' })).toBe(30);
  });

  it('una lista vacía suma cero', () => {
    expect(totalGastos([])).toBe(0);
  });
});

describe('costeDeVehiculos', () => {
  it('suma los gastos por vehículo', () => {
    const lista = [
      gasto({ vehiculoId: 'v1', total: 40 }),
      gasto({ vehiculoId: 'v1', total: 60 }),
      gasto({ vehiculoId: 'v2', total: 25 }),
    ];
    const costes = costeDeVehiculos(lista);
    expect(costes.get('v1')).toBe(100);
    expect(costes.get('v2')).toBe(25);
  });

  it('el gasto sin vehículo no cuenta en ninguno', () => {
    const costes = costeDeVehiculos([gasto({ vehiculoId: undefined, total: 999 })]);
    expect(costes.size).toBe(0);
  });
});

describe('el catálogo de categorías', () => {
  it('no hay dos con la misma clave', () => {
    const claves = CATEGORIAS_GASTO.map(c => c.value);
    expect(new Set(claves).size).toBe(claves.length);
  });

  it('siempre hay un cajón de sastre', () => {
    expect(CATEGORIAS_GASTO.some(c => c.value === 'otros')).toBe(true);
  });
});

describe('gastoVacio', () => {
  it('arranca en la fecha que se le da', () => {
    expect(gastoVacio('2026-08-19').fecha).toBe('2026-08-19');
  });

  it('el tipo por defecto es el general', () => {
    expect(gastoVacio('2026-08-19').taxRate).toBe(21);
  });
});
