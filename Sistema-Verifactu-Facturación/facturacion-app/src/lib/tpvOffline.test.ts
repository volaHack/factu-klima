import { describe, it, expect } from 'vitest';
import {
  nextOfflineNumber, expectedCashForSession, pluToKg, pluKgToPrice,
  sortByUnitsSold, daysUntilOutOfStock,
} from './tpvOffline';

describe('nextOfflineNumber', () => {
  it('genera el siguiente número correlativo de la serie', () => {
    expect(nextOfflineNumber([], 'TPV', 2026)).toBe('TPV-2026-0001');
    expect(nextOfflineNumber(['TPV-2026-0001', 'TPV-2026-0003'], 'TPV', 2026)).toBe('TPV-2026-0004');
  });

  it('añade sufijo por dispositivo cuando se pide temporal (offline)', () => {
    const n = nextOfflineNumber([], 'TPV', 2026, 'F3K2');
    expect(n).toBe('TPV-2026-0001-F3K2');
  });

  it('no colisiona cuando un dispositivo ya emitió un número temporal', () => {
    const existing = ['TPV-2026-0001-F3K2', 'TPV-2026-0002-9X4Q'];
    expect(nextOfflineNumber(existing, 'TPV', 2026, 'F3K2')).toBe('TPV-2026-0003-F3K2');
  });

  it('ignora un sufijo numérico: el correlativo es siempre el 3er segmento', () => {
    expect(nextOfflineNumber(['TPV-2026-0001-1234'], 'TPV', 2026)).toBe('TPV-2026-0002');
  });

  it('solo cuenta números del mismo año para el correlativo', () => {
    expect(nextOfflineNumber(['TPV-2025-0010', 'TPV-2026-0001'], 'TPV', 2026)).toBe('TPV-2026-0002');
  });
});

describe('expectedCashForSession', () => {
  it('suma el fondo inicial más las ventas en efectivo no anuladas', () => {
    expect(expectedCashForSession(100, [12.5, 40, 0])).toBe(152.5);
  });
});

describe('pluToKg', () => {
  it('convierte gramos a kg con 3 decimales', () => {
    expect(pluToKg(1250)).toBe(1.25);
    expect(pluToKg(333)).toBe(0.333);
  });
});

describe('pluKgToPrice', () => {
  it('calcula el precio de un artículo a peso y redondea a 2 decimales', () => {
    expect(pluKgToPrice(3.99, 0.333)).toBe(1.33);
    expect(pluKgToPrice(10, 0.5)).toBe(5);
  });
});

describe('sortByUnitsSold', () => {
  it('ordena los más vendidos arriba sin mutar el original', () => {
    const a = { id: 'a', unitsSold: 5 };
    const b = { id: 'b', unitsSold: 50 };
    const c = { id: 'c', unitsSold: 2 };
    const original = [a, c, b];
    expect(sortByUnitsSold(original).map(p => p.id)).toEqual(['b', 'a', 'c']);
    expect(original).toEqual([a, c, b]);
  });
});

describe('daysUntilOutOfStock', () => {
  it('estima en cuántos días se agota el stock con la frecuencia actual', () => {
    expect(daysUntilOutOfStock(10, 5, 5)).toBe(2); // 10 ud / 5 ud por día
    expect(daysUntilOutOfStock(0, 5, 5)).toBe(0);
    expect(daysUntilOutOfStock(10, 5, 0)).toBe(Infinity);
  });

  it('no acorta la cuenta atrás con el umbral: usa stock total entre ritmo diario', () => {
    expect(daysUntilOutOfStock(10, 8, 5)).toBe(2);
  });
});
