import { describe, it, expect } from 'vitest';
import { estadoEfectivo, type FilaSuscripcion } from './suscripcion';

const base: FilaSuscripcion = {
  origen: 'stripe', plan_id: 'pro', estado: 'active',
  cortesia_hasta: null, periodo_fin: null, cancela_al_final: false,
};
const hoy = new Date('2026-09-11T10:00:00Z');

describe('estadoEfectivo', () => {
  it('sin fila no hay suscripción', () => {
    expect(estadoEfectivo(null, hoy)).toEqual({ activa: false, planId: null, origen: null });
  });
  it('Stripe activa', () => {
    expect(estadoEfectivo(base, hoy)).toMatchObject({ activa: true, planId: 'pro', origen: 'stripe' });
  });
  it('past_due sigue activa mientras Stripe reintenta', () => {
    expect(estadoEfectivo({ ...base, estado: 'past_due' }, hoy).activa).toBe(true);
  });
  it('cancelada no', () => {
    expect(estadoEfectivo({ ...base, estado: 'canceled' }, hoy).activa).toBe(false);
  });
  it('cortesía vigente hasta el mismo día incluido', () => {
    const c = { ...base, origen: 'cortesia' as const, cortesia_hasta: '2026-09-11' };
    expect(estadoEfectivo(c, hoy).activa).toBe(true);
  });
  it('cortesía caducada no, y dice cuándo terminó', () => {
    const c = { ...base, origen: 'cortesia' as const, cortesia_hasta: '2026-09-10' };
    const e = estadoEfectivo(c, hoy);
    expect(e.activa).toBe(false);
    expect(e.motivoInactiva).toContain('2026-09-10');
  });
});
