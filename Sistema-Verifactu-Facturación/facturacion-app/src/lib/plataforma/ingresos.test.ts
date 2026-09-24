import { describe, it, expect } from 'vitest';

import { ingresosACsv, nuevoIngreso, resumenIngresos, sePuedeFacturar } from './ingresos';

describe('sin fecha de alta no se factura', () => {
  it('sin alta, nada es facturable', () => {
    expect(sePuedeFacturar('2026-09-24', null)).toBe(false);
  });

  it('con alta, sólo lo cobrado desde ese día', () => {
    expect(sePuedeFacturar('2026-10-01', '2026-10-01')).toBe(true);
    expect(sePuedeFacturar('2026-09-30', '2026-10-01')).toBe(false);
  });
});

describe('cada cobro se apunta', () => {
  it('una propina antes del alta queda pendiente, con su motivo', () => {
    const i = nuevoIngreso({
      stripeRef: 'cs_1', tipo: 'propina', fecha: '2026-09-24', importe: 5,
      tipoImpositivo: 0, concepto: 'Propina', actividadDesde: null,
    });
    expect(i).toMatchObject({ estado: 'pendiente_alta', base: 5, cuota: 0, importe: 5 });
    expect(i.nota).toMatch(/Sin actividad dada de alta/);
  });

  it('una suscripción con IGIC saca la base de lo cobrado y cuadra al céntimo', () => {
    const i = nuevoIngreso({
      stripeRef: 'in_1', tipo: 'suscripcion', fecha: '2026-11-02', importe: 52.43,
      tipoImpositivo: 7, concepto: 'Plan Básico', actividadDesde: '2026-10-01',
      cliente: { nombre: ' Bar Pepe ', nif: 'B12345674', userId: 'u1' },
    });
    expect(i.estado).toBe('facturado');
    expect(i.base + i.cuota).toBeCloseTo(52.43, 2);
    expect(i.cliente_nombre).toBe('Bar Pepe');
  });

  it('una devolución resta', () => {
    const i = nuevoIngreso({
      stripeRef: 'cn_1', tipo: 'devolucion', fecha: '2026-11-05', importe: -49,
      tipoImpositivo: 0, concepto: 'Devolución', actividadDesde: '2026-10-01',
    });
    expect(i.base).toBe(-49);
  });
});

describe('el resumen del trimestre y el CSV para la gestoría', () => {
  const filas = [
    nuevoIngreso({ stripeRef: 'a', tipo: 'suscripcion', fecha: '2026-10-02', importe: 49, tipoImpositivo: 0, concepto: 'Plan Básico', actividadDesde: '2026-10-01' }),
    nuevoIngreso({ stripeRef: 'b', tipo: 'propina', fecha: '2026-10-03', importe: 3.5, tipoImpositivo: 0, concepto: 'Propina; con punto y coma', actividadDesde: '2026-10-01' }),
    nuevoIngreso({ stripeRef: 'c', tipo: 'devolucion', fecha: '2026-10-04', importe: -49, tipoImpositivo: 0, concepto: 'Devolución', actividadDesde: '2026-10-01' }),
  ];

  it('suma por tipo y deja el neto', () => {
    const r = resumenIngresos(filas);
    expect(r).toMatchObject({ cobros: 3, total: 3.5, base: 3.5 });
    expect(r.porTipo).toEqual({ suscripcion: 49, propina: 3.5, devolucion: -49 });
  });

  it('CSV que abre bien Excel en español', () => {
    const csv = ingresosACsv(filas);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lineas = csv.slice(1).trim().split('\r\n');
    expect(lineas[0]).toMatch(/^Fecha;Tipo;Concepto/);
    expect(lineas[1]).toContain(';49,00;');
    // El texto con punto y coma va entre comillas para no romper columnas.
    expect(lineas[2]).toContain('"Propina; con punto y coma"');
  });
});
