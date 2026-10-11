import { describe, expect, it } from 'vitest';
import { DEFAULT_COMPANY_SETTINGS } from '../constants';
import { InvoiceStatus, PaymentMethod } from '../types';
import { construirDatos, facturaDeMuestra } from './datos';
import { camposPorGrupo } from './contrato';

const sinEspacioDuro = (t: string) => t.replace(/[\u00a0\u202f]/g, ' ');

describe('la relación de pagos como dato', () => {
  const base = { ...facturaDeMuestra(), issueDate: '2026-01-12', dueDate: '2026-02-11', paidAmount: 0, status: InvoiceStatus.EMITIDA };
  const total = base.total;

  it('sale en el selector, en el grupo Pagos', () => {
    const pagos = camposPorGrupo().find(g => g.grupo === 'pagos');
    expect(pagos?.titulo).toBe('Pagos');
    expect(pagos?.campos.map(c => c.clave)).toContain('relacion_pagos');
  });

  it('junta los pagos hechos en un total', () => {
    const datos = construirDatos({ tipo: 'factura', documento: { ...base, paidAmount: 300 } }, DEFAULT_COMPANY_SETTINGS, {
      pagos: [
        { fecha: '2026-03-10', importe: 200, forma: PaymentMethod.TRANSFERENCIA },
        { fecha: '2026-02-11', importe: 100, forma: PaymentMethod.TRANSFERENCIA },
      ],
    });
    const renglones = sinEspacioDuro(datos.campos.relacion_pagos).split('\n');
    expect(renglones[0]).toBe('11/02/2026 · Transferencia bancaria · 100,00 €');
    expect(renglones[1]).toBe('10/03/2026 · Transferencia bancaria · 200,00 €');
    expect(renglones[2]).toMatch(/^Total pagado: 300,00 €/);
    expect(sinEspacioDuro(datos.campos.relacion_pagos_total)).toBe('300,00 €');
    expect(datos.campos.relacion_pagos_numero).toBe('2');
    expect(datos.campos.relacion_pagos_plazo).toBe('30 días');
  });

  it('sin pagos, enseña el vencimiento pendiente', () => {
    const datos = construirDatos({ tipo: 'factura', documento: base }, DEFAULT_COMPANY_SETTINGS);
    expect(sinEspacioDuro(datos.campos.relacion_pagos)).toMatch(/^A 30 días · vence 11\/02\/2026/);
    expect(datos.campos.relacion_pagos_numero).toBe('0');
    expect(datos.campos.relacion_pagos_pendiente).not.toBe('');
  });

  it('una factura marcada pagada sin importe cuenta como pagada entera', () => {
    const datos = construirDatos({ tipo: 'factura', documento: { ...base, status: InvoiceStatus.PAGADA, paidDate: '2026-02-01' } }, DEFAULT_COMPANY_SETTINGS);
    expect(datos.campos.relacion_pagos_numero).toBe('1');
    expect(datos.campos.relacion_pagos_total).toBe(datos.campos.total_general);
    expect(total).toBeGreaterThan(0);
  });
});

describe('en un albarán', () => {
  const { dueDate: _sinVencimiento, paymentMethod: _sinForma, ...resto } = { ...facturaDeMuestra(), issueDate: '2026-01-12' };
  void _sinVencimiento; void _sinForma;
  const albaran = { ...resto, status: 'expedido' } as unknown as Parameters<typeof construirDatos>[0]['documento'];
  const cliente = { paymentDays: 30, defaultPaymentMethod: PaymentMethod.TRANSFERENCIA } as Parameters<typeof construirDatos>[2] extends infer O ? O extends { cliente?: infer C } ? C : never : never;

  it('la relación de pagos sale con los días de pago del cliente', () => {
    const datos = construirDatos({ tipo: 'albaran', documento: albaran } as Parameters<typeof construirDatos>[0], DEFAULT_COMPANY_SETTINGS, { cliente });
    expect(sinEspacioDuro(datos.campos.relacion_pagos)).toMatch(/^A 30 días · vence 11\/02\/2026 · Transferencia bancaria · /);
    expect(datos.campos.relacion_pagos_plazo).toBe('30 días');
    expect(datos.vencimientos).toHaveLength(1);
    expect(datos.vencimientos[0].venc_fecha).toBe('11/02/2026');
  });

  it('sin días de pago en la ficha no sale en blanco', () => {
    const datos = construirDatos({ tipo: 'albaran', documento: albaran } as Parameters<typeof construirDatos>[0], DEFAULT_COMPANY_SETTINGS);
    expect(datos.campos.relacion_pagos).toMatch(/Pendiente/);
  });
});
