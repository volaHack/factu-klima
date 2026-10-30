import { describe, it, expect } from 'vitest';
import { diaDeLaSemana, diasEntre, esFinDeSemana, explicarVencimiento, finDeMes, opcionesVencimiento, sumarDias } from './vencimiento';

describe('cuentas con fechas', () => {
  it('suma días sin tropezar con el cambio de hora ni con los meses', () => {
    expect(sumarDias('2026-10-20', 30)).toBe('2026-11-19');
    expect(sumarDias('2026-03-15', 30)).toBe('2026-04-14');
    expect(sumarDias('2026-12-20', 15)).toBe('2027-01-04');
    expect(sumarDias('2026-01-31', -1)).toBe('2026-01-30');
    expect(sumarDias('mal', 3)).toBeNull();
    expect(sumarDias('2026-02-30', 1)).toBeNull();
  });

  it('el fin de mes, también en febrero y en bisiesto', () => {
    expect(finDeMes('2026-10-05')).toBe('2026-10-31');
    expect(finDeMes('2026-02-10')).toBe('2026-02-28');
    expect(finDeMes('2028-02-10')).toBe('2028-02-29');
  });

  it('el día de la semana y los días entre dos fechas', () => {
    expect(diaDeLaSemana('2026-10-30')).toBe('viernes');
    expect(diaDeLaSemana('2026-11-01')).toBe('domingo');
    expect(esFinDeSemana('2026-10-31')).toBe(true);
    expect(esFinDeSemana('2026-10-30')).toBe(false);
    expect(diasEntre('2026-10-01', '2026-10-31')).toBe(30);
    expect(diasEntre('2026-10-10', '2026-10-01')).toBe(-9);
  });
});

describe('los atajos de vencimiento', () => {
  it('salen desde la fecha de emisión', () => {
    const o = opcionesVencimiento('2026-10-30');
    expect(o.map(x => [x.id, x.fecha])).toEqual([
      ['contado', '2026-10-30'], ['d15', '2026-11-14'], ['d30', '2026-11-29'], ['d60', '2026-12-29'], ['fin-mes', '2026-10-31'],
    ]);
  });

  it('«Según cliente» sólo con los días de la ficha', () => {
    expect(opcionesVencimiento('2026-10-30', 45).at(-1)).toMatchObject({ id: 'cliente', etiqueta: 'Según cliente (45 días)', fecha: '2026-12-14' });
    expect(opcionesVencimiento('2026-10-30', 0).at(-1)).toMatchObject({ id: 'cliente', etiqueta: 'Según cliente (contado)', fecha: '2026-10-30' });
    expect(opcionesVencimiento('2026-10-30', undefined).some(x => x.id === 'cliente')).toBe(false);
    expect(opcionesVencimiento('2026-10-30', -5).some(x => x.id === 'cliente')).toBe(false);
    expect(opcionesVencimiento('')).toEqual([]);
  });

  it('dice el día y el plazo, y avisa del fin de semana y de la fecha imposible', () => {
    expect(explicarVencimiento('2026-10-30', '2026-11-26')).toEqual({ texto: 'Jueves, 26 de noviembre · a 27 días', aviso: null });
    expect(explicarVencimiento('2026-10-30', '2026-10-30')?.texto).toBe('Viernes, 30 de octubre · al contado');
    expect(explicarVencimiento('2026-10-30', '2026-11-29')?.aviso).toMatch(/domingo/);
    expect(explicarVencimiento('2026-10-30', '2026-10-20')?.aviso).toMatch(/anterior/);
    expect(explicarVencimiento('2026-10-30', '')).toBeNull();
  });
});
