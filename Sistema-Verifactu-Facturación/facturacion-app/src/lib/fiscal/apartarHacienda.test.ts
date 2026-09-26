import { describe, expect, it } from 'vitest';
import type { Gasto, Invoice } from '../types';
import { apartarParaHacienda, esAutonomo, plazoDelTrimestre } from './apartarHacienda';

function factura(over: Partial<Invoice>): Invoice {
  return {
    id: 'f1', number: 'FAC-001', series: 'FAC',
    clientId: 'c1', clientName: 'Cliente SL', clientNif: 'B65432106', clientAddress: '',
    issueDate: '2026-08-10', dueDate: '2026-09-10', status: 'emitida',
    lineItems: [], subtotal: 1000, totalDiscount: 0,
    taxBreakdown: [{ rate: 21, base: 1000, amount: 210 }],
    totalTax: 210, total: 1210, paymentMethod: 'transferencia', notes: '',
    ...over,
  } as Invoice;
}

function gasto(over: Partial<Gasto>): Gasto {
  return {
    id: 'g1', fecha: '2026-08-15', concepto: 'Compra', categoria: 'otros',
    baseImponible: 200, taxRate: 21, taxAmount: 42, total: 242,
    paymentMethod: 'transferencia', deducible: true, tipoOperacion: 'interior_corriente',
    createdAt: '', updatedAt: '',
    ...over,
  } as Gasto;
}

const HOY = new Date(2026, 8, 25); // 25 de septiembre de 2026: 3.er trimestre

describe('plazoDelTrimestre', () => {
  it('del 1 al 20 del mes siguiente; el 4.º hasta el 30 de enero', () => {
    expect(plazoDelTrimestre(2026, 3).toDateString()).toBe(new Date(2026, 9, 20).toDateString());
    expect(plazoDelTrimestre(2025, 4).toDateString()).toBe(new Date(2026, 0, 30).toDateString());
    // El 30 de enero de 2027 es sábado: pasa al lunes 1 de febrero.
    expect(plazoDelTrimestre(2026, 4).toDateString()).toBe(new Date(2027, 1, 1).toDateString());
  });
  it('si cae en fin de semana pasa al lunes', () => {
    // 20 de abril de 2025 fue domingo.
    expect(plazoDelTrimestre(2025, 1).toDateString()).toBe(new Date(2025, 3, 21).toDateString());
  });
});

describe('apartarParaHacienda', () => {
  const datos = {
    facturas: [
      factura({ id: 'a' }),
      factura({ id: 'viejo', issueDate: '2026-02-10' }), // otro trimestre: no cuenta en el IVA
    ],
    gastos: [gasto({})],
  };

  it('una sociedad: sólo el IVA del trimestre en curso', () => {
    const r = apartarParaHacienda({ ...datos, nif: 'B12345674' }, HOY);
    expect(r.trimestre).toBe(3);
    expect(r.conceptos.map(c => c.modelo)).toEqual(['303']);
    expect(r.conceptos[0].importe).toBe(210 - 42);
    expect(r.total).toBe(168);
    expect(r.plazo).toBe('2026-10-20');
    expect(r.diasParaPlazo).toBe(25);
  });

  it('un autónomo: también el 130, descontando lo de trimestres anteriores', () => {
    const r = apartarParaHacienda({ ...datos, nif: '78837942Z' }, HOY);
    const irpf = r.conceptos.find(c => c.modelo === '130')!;
    // Acumulado hasta septiembre: (2000 − 200) × 20 % = 360; en el 1.er trimestre salió 1000 × 20 % = 200.
    expect(irpf.importe).toBe(160);
    expect(r.total).toBe(168 + 160);
  });

  it('con IGIC usa el 420', () => {
    const r = apartarParaHacienda({
      facturas: [factura({ taxBreakdown: [{ rate: 7, base: 1000, amount: 70 }], totalTax: 70, total: 1070 })],
      gastos: [], nif: 'B12345674', igic: true,
    }, HOY);
    expect(r.conceptos[0].modelo).toBe('420');
    expect(r.conceptos[0].importe).toBe(70);
  });

  it('si sale a devolver no se suma a lo que hay que apartar', () => {
    const r = apartarParaHacienda({ facturas: [], gastos: [gasto({ baseImponible: 1000, taxAmount: 210 })], nif: 'B12345674' }, HOY);
    expect(r.conceptos[0].importe).toBe(-210);
    expect(r.total).toBe(0);
  });
});

describe('esAutonomo', () => {
  it('DNI y NIE sí; sociedades no', () => {
    expect(esAutonomo('78837942Z')).toBe(true);
    expect(esAutonomo('X1234567L')).toBe(true);
    expect(esAutonomo('B12345674')).toBe(false);
    expect(esAutonomo('')).toBe(false);
  });
});
