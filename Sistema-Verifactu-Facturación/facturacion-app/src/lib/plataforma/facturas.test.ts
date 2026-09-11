import { describe, it, expect } from 'vitest';
import { facturaDeSuscripcion, facturaDePropina } from './facturas';

const cliente = (cp: string, nif = 'B12345678') => ({ nombre: 'Cliente SL', nif, direccion: `Calle 1, ${cp}`, cp });
const base = { stripeInvoiceId: 'in_1', fecha: '2026-09-11', plan: 'Pro', intervalo: 'month' as const,
  periodo: { inicio: '2026-09-11', fin: '2026-10-10' }, cobrado: 79, serie: 'SUS', regimen: 'general' as const };

describe('facturaDeSuscripcion', () => {
  it('cliente canario: IGIC 7 % dentro de lo cobrado', () => {
    const f = facturaDeSuscripcion({ ...base, cliente: cliente('35001') });
    expect(f).toMatchObject({ origen_externo: 'stripe:in_1', tipo: 'factura', tipo_factura_fiscal: 'F1', cliente_nif: 'B12345678' });
    if ('revisar' in f) throw new Error();
    expect(f.lineas).toEqual([{ concepto: 'Plan Pro · mensual · del 2026-09-11 al 2026-10-10', cantidad: 1, precio: 73.83, tipo: 7 }]);
  });
  it('cliente peninsular: sin impuesto, N2 y mención', () => {
    const f = facturaDeSuscripcion({ ...base, cliente: cliente('41001') });
    if ('revisar' in f) throw new Error();
    expect(f.lineas[0]).toMatchObject({ precio: 79, tipo: 0 });
    expect(f.datos_extras).toEqual({ calificacion: 'N2' });
    expect(f.notas).toContain('inversión del sujeto pasivo');
  });
  it('sin NIF o fuera de zona: a revisar', () => {
    expect(facturaDeSuscripcion({ ...base, cliente: cliente('35001', '') })).toHaveProperty('revisar');
    expect(facturaDeSuscripcion({ ...base, cliente: cliente('51001') })).toHaveProperty('revisar');
  });
});

describe('facturaDePropina', () => {
  it('simplificada, sin destinatario, IGIC dentro', () => {
    const f = facturaDePropina({ sessionId: 'cs_1', fecha: '2026-09-11', cobrado: 5, serie: 'PROP', regimen: 'general' });
    expect(f).toMatchObject({ origen_externo: 'stripe:cs_1', tipo_factura_fiscal: 'F2', cliente_nif: null });
    expect(f.lineas).toEqual([{ concepto: 'Propina / apoyo al desarrollo', cantidad: 1, precio: 4.67, tipo: 7 }]);
  });
});
