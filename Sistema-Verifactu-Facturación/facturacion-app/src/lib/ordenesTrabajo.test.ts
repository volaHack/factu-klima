import { describe, it, expect } from 'vitest';
import { ordenesEnMarcha, diasAbierta, ordenesAtrasadas, numeroDeOrden, siguienteEstado } from './ordenesTrabajo';
import type { OrdenTrabajo } from './types';

const orden = (extra: Partial<OrdenTrabajo> = {}): OrdenTrabajo => ({
  id: crypto.randomUUID(), numero: 'OT-2026-0001', descripcion: 'Fuga en cocina',
  estado: 'abierta', fecha: '2026-06-01',
  createdAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z',
  ...extra,
});

describe('ordenesEnMarcha', () => {
  it('deja fuera las cerradas', () => {
    const ordenes = [orden({ estado: 'abierta' }), orden({ estado: 'en_curso' }), orden({ estado: 'cerrada' })];
    expect(ordenesEnMarcha(ordenes)).toHaveLength(2);
  });
});

describe('diasAbierta', () => {
  it('cuenta los días desde la fecha de la orden', () => {
    expect(diasAbierta(orden({ fecha: '2026-06-01' }), new Date('2026-06-08'))).toBe(7);
  });

  it('una orden de hoy lleva cero días', () => {
    expect(diasAbierta(orden({ fecha: '2026-06-08' }), new Date('2026-06-08'))).toBe(0);
  });

  it('una fecha inválida no revienta, da cero', () => {
    expect(diasAbierta(orden({ fecha: '' }), new Date('2026-06-08'))).toBe(0);
  });
});

describe('ordenesAtrasadas', () => {
  it('sólo las que llevan más del límite y siguen en marcha', () => {
    const hoy = new Date('2026-06-15');
    const ordenes = [
      orden({ fecha: '2026-06-14', estado: 'abierta' }), // 1 día, no atrasada
      orden({ fecha: '2026-06-01', estado: 'abierta' }), // 14 días, atrasada
      orden({ fecha: '2026-05-01', estado: 'cerrada' }), // vieja pero cerrada, no cuenta
    ];
    const atrasadas = ordenesAtrasadas(ordenes, 7, hoy);
    expect(atrasadas).toHaveLength(1);
    expect(atrasadas[0].fecha).toBe('2026-06-01');
  });
});

describe('numeroDeOrden', () => {
  it('la primera del año es la 0001', () => {
    expect(numeroDeOrden([], new Date('2026-03-01'))).toBe('OT-2026-0001');
  });

  it('cuenta las que ya hay ese año, no las de otros años', () => {
    const existentes = [orden({ numero: 'OT-2026-0001' }), orden({ numero: 'OT-2025-0009' })];
    expect(numeroDeOrden(existentes, new Date('2026-03-01'))).toBe('OT-2026-0002');
  });
});

describe('siguienteEstado', () => {
  it('de abierta pasa a en curso', () => {
    expect(siguienteEstado('abierta')).toBe('en_curso');
  });

  it('de en curso pasa a cerrada', () => {
    expect(siguienteEstado('en_curso')).toBe('cerrada');
  });

  it('cerrada no tiene siguiente', () => {
    expect(siguienteEstado('cerrada')).toBeNull();
  });
});
