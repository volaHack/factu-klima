import { describe, it, expect } from 'vitest';
import { periodosRapidos } from './periodos';

describe('periodos rápidos', () => {
  it('mes, mes pasado, trimestres y años', () => {
    const p = Object.fromEntries(periodosRapidos(new Date(2026, 0, 15)).map(x => [x.id, [x.desde, x.hasta]]));
    expect(p.mes).toEqual(['2026-01-01', '2026-01-31']);
    expect(p.mes_pasado).toEqual(['2025-12-01', '2025-12-31']);
    expect(p.trimestre).toEqual(['2026-01-01', '2026-03-31']);
    expect(p.trimestre_pasado).toEqual(['2025-10-01', '2025-12-31']);
    expect(p.anio_pasado).toEqual(['2025-01-01', '2025-12-31']);
    expect(Object.fromEntries(periodosRapidos(new Date(2024, 1, 10)).map(x => [x.id, x.hasta])).mes).toBe('2024-02-29');
  });
});
