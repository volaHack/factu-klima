import { describe, it, expect } from 'vitest';
import { proximoPlazo } from './plazos';

describe('proximoPlazo (420 y 130)', () => {
  it.each([
    ['2026-09-11', 2026, 3, '2026-10-20', 39],
    ['2026-10-20', 2026, 3, '2026-10-20', 0],
    ['2026-10-21', 2026, 4, '2027-01-30', 101],
    ['2027-01-15', 2026, 4, '2027-01-30', 15],
    ['2027-02-01', 2027, 1, '2027-04-20', 78],
  ])('%s → T%i de %i, vence %s', (hoy, anio, t, limite, dias) => {
    expect(proximoPlazo(new Date(`${hoy}T12:00:00Z`))).toEqual({ anio, trimestre: t, limite, dias });
  });
});
