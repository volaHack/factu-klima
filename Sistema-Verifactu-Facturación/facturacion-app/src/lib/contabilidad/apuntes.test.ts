import { describe, expect, it } from 'vitest';
import {
  asientosDeApuntes, cuadroPrestamo, cuotaAmortizacion, cuotaPrestamo, fechasDe, lineasAmortizacion, lineasNomina,
  normalizarCuenta, problemaDe, type ApunteContable,
} from './apuntes';
import { generarAsientos } from './motor';
import { balance, diarioDelEjercicio, perdidasYGanancias, asientosDescuadrados } from './informes';
import { CUENTAS } from './plan';

const base = (over: Partial<ApunteContable>): ApunteContable => ({
  id: 'a1', concepto: 'Nómina Ana', plantilla: 'nomina', periodicidad: 'mes', fecha: '2026-01-31',
  lineas: lineasNomina({ bruto: 2000, irpf: 300, ssTrabajador: 127, ssEmpresa: 640 }), ...over,
});

describe('apuntes', () => {
  it('cuentas cortas a 8 cifras', () => {
    expect(normalizarCuenta('640')).toBe('64000000');
    expect(normalizarCuenta('4751')).toBe('47510000');
    expect(normalizarCuenta('57200001')).toBe('57200001');
    expect(normalizarCuenta('12')).toBe('');
  });

  it('nómina: cuadra y el neto sale del banco', () => {
    const l = lineasNomina({ bruto: 2000, irpf: 300, ssTrabajador: 127, ssEmpresa: 640 });
    const debe = l.reduce((t, x) => t + x.debe, 0);
    const haber = l.reduce((t, x) => t + x.haber, 0);
    expect(debe).toBe(2640);
    expect(haber).toBe(2640);
    expect(l.find(x => x.cuenta === CUENTAS.bancos)!.haber).toBe(1573);
    expect(problemaDe(base({}))).toBeNull();
  });

  it('periódicos: cada mes hasta hoy o hasta la fecha final, conservando fin de mes', () => {
    expect(fechasDe(base({}), '2026-04-15')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    expect(fechasDe(base({ hasta: '2026-02-28' }), '2026-12-31')).toHaveLength(2);
    expect(fechasDe(base({ periodicidad: 'trimestre', fecha: '2026-03-31' }), '2026-12-31')).toEqual(['2026-03-31', '2026-06-30', '2026-09-30', '2026-12-31']);
    expect(fechasDe(base({ periodicidad: 'unico' }), '2026-04-15')).toEqual(['2026-01-31']);
  });

  it('amortización lineal por periodo', () => {
    expect(cuotaAmortizacion(24000, 5, 'mes')).toBe(400);
    expect(cuotaAmortizacion(24000, 5, 'anio')).toBe(4800);
    expect(lineasAmortizacion(400).map(l => l.cuenta)).toEqual([CUENTAS.amortizacionInmovilizado, CUENTAS.amortizacionAcumulada]);
  });

  it('préstamo francés: cuota fija y el capital suma exacto lo prestado', () => {
    const p = { principal: 10000, interesAnual: 6, meses: 24, conIngreso: true };
    expect(cuotaPrestamo(p)).toBe(443.21);
    const c = cuadroPrestamo(p);
    expect(c[0]).toMatchObject({ intereses: 50, capital: 393.21 });
    expect(Math.round(c.reduce((t, x) => t + x.capital, 0) * 100) / 100).toBe(10000);
    expect(c[23].pendiente).toBe(0);
    expect(cuotaPrestamo({ ...p, interesAnual: 0 })).toBe(416.67);
  });

  it('lo que no se puede guardar, con su porqué', () => {
    expect(problemaDe(base({ concepto: ' ' }))).toMatch(/concepto/);
    expect(problemaDe(base({ plantilla: 'libre', lineas: [{ cuenta: '62900000', debe: 100, haber: 0 }, { cuenta: '57200000', debe: 0, haber: 90 }] }))).toMatch(/No cuadra/);
    expect(problemaDe(base({ plantilla: 'libre', lineas: [{ cuenta: '629', debe: 100, haber: 0 }, { cuenta: '57200000', debe: 0, haber: 100 }] }))).toMatch(/cuenta/);
    expect(problemaDe(base({ plantilla: 'prestamo', prestamo: { principal: 0, interesAnual: 5, meses: 12, conIngreso: true } }))).toMatch(/préstamo/);
    expect(problemaDe(base({ hasta: '2025-01-01' }))).toMatch(/anterior/);
  });

  it('en la contabilidad: todo cuadra y cada cosa va a su partida', () => {
    const apuntes: ApunteContable[] = [
      base({}),
      { id: 'a2', concepto: 'Furgoneta', plantilla: 'amortizacion', periodicidad: 'mes', fecha: '2026-01-31', lineas: lineasAmortizacion(400) },
      { id: 'a3', concepto: 'Préstamo', plantilla: 'prestamo', periodicidad: 'mes', fecha: '2026-01-15', lineas: [], prestamo: { principal: 10000, interesAnual: 6, meses: 24, conIngreso: true } },
      { id: 'a4', concepto: 'Capital social', plantilla: 'libre', periodicidad: 'unico', fecha: '2026-01-01', lineas: [{ cuenta: '57200000', debe: 3000, haber: 0 }, { cuenta: '10000000', debe: 0, haber: 3000 }] },
    ];
    const asientos = generarAsientos({ facturas: [], gastos: [], cobrosPagos: [], clientes: [], impuesto: 'IVA', apuntes, hoy: '2026-03-31' });
    // 3 nóminas + 3 amortizaciones + entrada del préstamo + 2 cuotas + capital
    expect(asientos).toHaveLength(10);
    expect(asientosDescuadrados(asientos)).toHaveLength(0);
    const diario = diarioDelEjercicio(asientos, 2026);
    const pyg = perdidasYGanancias(diario, { ejercicio: 2026 });
    expect(pyg.partidas.find(p => p.clave === '6')!.importe).toBe(-7920); // (2000+640) × 3
    expect(pyg.partidas.find(p => p.clave === '8')!.importe).toBe(-1200);
    expect(pyg.partidas.find(p => p.clave === '15')!.importe).toBeLessThan(0);
    const b = balance(diario, '2026-12-31');
    expect(b.cuadra).toBe(true);
    expect(b.pasivoNoCorriente[0].importe).toBeGreaterThan(9000);
    expect(b.activoNoCorriente.find(l => l.nombre === 'Inmovilizado material')!.importe).toBe(-1200);
    expect(asientosDeApuntes([{ ...apuntes[0], lineas: [] }], '2026-03-31')).toHaveLength(0); // mal guardado: fuera
  });
});
