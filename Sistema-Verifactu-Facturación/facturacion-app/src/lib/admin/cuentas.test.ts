import { describe, it, expect } from 'vitest';
import { combinarCuentas, resumen } from './cuentas';

const hoy = new Date('2026-09-11T10:00:00Z');
const usuarios = [
  { id: 'a', email: 'a@x.es', created_at: '2026-09-02T00:00:00Z', last_sign_in_at: '2026-09-10T00:00:00Z' },
  { id: 'b', email: 'b@x.es', created_at: '2026-05-01T00:00:00Z', last_sign_in_at: null },
  { id: 'c', email: 'c@x.es', created_at: '2026-04-01T00:00:00Z', last_sign_in_at: null },
];
const ajustes = [
  { user_id: 'a', business_name: 'Viejo', nif: 'X', updated_at: '2026-01-01T00:00:00Z' },
  { user_id: 'a', business_name: 'Nuevo SL', nif: 'B1', updated_at: '2026-09-01T00:00:00Z' },
];
const suscripciones = [
  { user_id: 'a', origen: 'stripe' as const, plan_id: 'pro' as const, estado: 'active' as const, intervalo: 'year' as const, cortesia_hasta: null,
    periodo_fin: '2027-09-02T00:00:00Z', cancela_al_final: false, actualizado_en: '2026-09-02T00:00:00Z' },
  { user_id: 'b', origen: 'cortesia' as const, plan_id: 'basico' as const, estado: 'active' as const, intervalo: null, cortesia_hasta: '2026-09-30',
    periodo_fin: null, cancela_al_final: false, actualizado_en: '2026-09-01T00:00:00Z' },
  { user_id: 'c', origen: 'stripe' as const, plan_id: 'basico' as const, estado: 'canceled' as const, intervalo: 'month' as const, cortesia_hasta: null,
    periodo_fin: null, cancela_al_final: false, actualizado_en: '2026-09-05T00:00:00Z' },
];

describe('combinarCuentas', () => {
  const cuentas = combinarCuentas({ usuarios, ajustes, suscripciones: [...suscripciones], facturasMes: [{ user_id: 'a', facturas: 7 }], admins: ['c'], hoy });
  it('usa los ajustes más recientes de cada cuenta', () => {
    expect(cuentas.find(c => c.id === 'a')).toMatchObject({ nombre: 'Nuevo SL', nif: 'B1', facturasMes: 7 });
  });
  it('una cuenta sin fila de ajustes ni facturas sale con valores vacíos', () => {
    expect(cuentas.find(c => c.id === 'b')).toMatchObject({ nombre: null, nif: null, facturasMes: 0 });
  });
  it('marca a las admins', () => {
    expect(cuentas.find(c => c.id === 'c')?.esAdmin).toBe(true);
  });
});

describe('resumen', () => {
  const r = resumen(combinarCuentas({ usuarios, ajustes, suscripciones: [...suscripciones], facturasMes: [], admins: [], hoy }), hoy);
  it('cuenta activas por plan, cortesías aparte', () => {
    expect(r.activasPorPlan).toEqual({ tpv: 0, basico: 1, pro: 1, sin_limite: 0 });
    expect(r.cortesias).toBe(1);
  });
  it('ingresos mensuales sólo de Stripe, el anual prorrateado', () => {
    expect(r.ingresosMensuales).toBeCloseTo(790 / 12, 2);
  });
  it('altas y bajas del mes', () => {
    expect(r.altasMes).toBe(1);
    expect(r.bajasMes).toBe(1);
  });
});
