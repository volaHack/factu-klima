import { describe, it, expect } from 'vitest';
import { validarAccion } from './acciones';

const hoy = new Date('2026-09-11T10:00:00Z');

describe('validarAccion', () => {
  it('toda acción exige motivo', () => {
    expect(validarAccion({ tipo: 'cancelar', inmediato: false }, hoy)).toEqual({ ok: false, error: 'Escribe el motivo (queda registrado).' });
  });
  it('cortesía con fecha futura y plan válido', () => {
    const r = validarAccion({ tipo: 'cortesia', planId: 'pro', hasta: '2026-10-11', motivo: 'Prueba para gestoría' }, hoy);
    expect(r).toEqual({ ok: true, accion: { tipo: 'cortesia', planId: 'pro', hasta: '2026-10-11', motivo: 'Prueba para gestoría' } });
  });
  it('cortesía con fecha pasada no', () => {
    expect(validarAccion({ tipo: 'cortesia', planId: 'pro', hasta: '2026-09-10', motivo: 'xxxxx' }, hoy).ok).toBe(false);
  });
  it('cambiar plan exige plan e intervalo válidos', () => {
    expect(validarAccion({ tipo: 'cambiar_plan', planId: 'oro', intervalo: 'month', motivo: 'xxxxx' }, hoy).ok).toBe(false);
    expect(validarAccion({ tipo: 'cambiar_plan', planId: 'pro', intervalo: 'year', motivo: 'Lo pidió' }, hoy).ok).toBe(true);
  });
  it('rechaza lo desconocido', () => {
    expect(validarAccion({ tipo: 'borrar_todo', motivo: 'xxxxx' }, hoy).ok).toBe(false);
    expect(validarAccion(null, hoy).ok).toBe(false);
  });
});
