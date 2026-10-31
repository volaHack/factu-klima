/* eslint-disable @typescript-eslint/no-explicit-any -- datos de prueba a medias */
import { describe, it, expect } from 'vitest';
import { nombreParaFicheros, trimestrePropuesto, prepararPaquete, libroDeCobros } from './paqueteGestoria';

const factura = (id: string, fecha: string, extra: Record<string, unknown> = {}) => ({
  id, number: `F-${id}`, series: 'F', tipo: 'factura', sentido: 'venta', status: 'emitida', issueDate: fecha, dueDate: fecha,
  clientId: 'c1', clientName: 'Bar Tenerife', clientNif: 'B11111111', subtotal: 100, totalTax: 7, total: 107,
  paymentMethod: 'transferencia', taxBreakdown: [{ rate: 7, base: 100, amount: 7 }], lineItems: [], ...extra,
}) as any;

const gasto = (id: string, fecha: string) => ({
  id, fecha, concepto: 'Luz', categoria: 'suministros', proveedorNombre: 'Eléctrica', baseImponible: 50, taxRate: 7, taxAmount: 3.5, total: 53.5,
}) as any;

const cobro = (id: string, fecha: string, extra: Record<string, unknown> = {}) => ({
  id, tipo: 'cobro', number: `C-${id}`, fecha, contraparteNombre: 'Bar Tenerife', contraparteNif: 'B11111111',
  paymentMethod: 'transferencia', importeTotal: 107, desglose: [{ invoiceId: '1', invoiceNumber: 'F-1', importeAplicado: 107 }], ...extra,
}) as any;

describe('nombre de los ficheros', () => {
  it('el comercial si lo hay, sin tildes ni forma jurídica', () => {
    expect(nombreParaFicheros({ tradeName: 'Rogar', businessName: 'Distribuciones Rogar, S.L.' })).toBe('Rogar');
    expect(nombreParaFicheros({ tradeName: '', businessName: 'Distribuciones Rogar, S.L.' })).toBe('Distribuciones_Rogar');
    expect(nombreParaFicheros({ tradeName: '', businessName: 'Alimentación Peña SA' })).toBe('Alimentacion_Pena');
    expect(nombreParaFicheros({ tradeName: '', businessName: '' })).toBe('empresa');
  });
});

describe('qué trimestre se propone', () => {
  it('en el primer mes de un trimestre, el anterior; si no, el que corre', () => {
    expect(trimestrePropuesto(new Date(2026, 9, 15))).toEqual({ ejercicio: 2026, trimestre: 3 });
    expect(trimestrePropuesto(new Date(2026, 10, 15))).toEqual({ ejercicio: 2026, trimestre: 4 });
    expect(trimestrePropuesto(new Date(2027, 0, 10))).toEqual({ ejercicio: 2026, trimestre: 4 });
  });
});

describe('el paquete del trimestre', () => {
  const datos = {
    empresa: { tradeName: 'Rogar', businessName: 'Distribuciones Rogar, S.L.', igicEnabled: true } as any,
    facturas: [
      factura('1', '2026-07-10'),
      factura('2', '2026-08-10', { status: 'borrador' }),
      factura('3', '2026-10-01'),
      factura('4', '2026-09-01', { sentido: 'compra', clientName: 'Proveedor Uno', status: 'pendiente' }),
      factura('5', '2026-09-02', { tipo: 'albaran' }),
    ],
    gastos: [gasto('g1', '2026-09-05'), gasto('g2', '2026-06-30')],
    cobros: [cobro('1', '2026-08-01'), cobro('2', '2026-08-02', { tipo: 'pago' }), cobro('3', '2026-11-01')],
  };

  it('cinco ficheros con nombres claros', () => {
    const p = prepararPaquete(datos, { ejercicio: 2026, trimestre: 3 });
    expect(p.ficheros.map(f => f.nombre)).toEqual([
      'Rogar_3T2026_facturas_emitidas.csv',
      'Rogar_3T2026_facturas_recibidas.csv',
      'Rogar_3T2026_gastos.csv',
      'Rogar_3T2026_resumen_igic.csv',
      'Rogar_3T2026_cobros.csv',
    ]);
  });

  it('sólo lo del trimestre, y sin borradores ni albaranes', () => {
    const p = prepararPaquete(datos, { ejercicio: 2026, trimestre: 3 });
    expect(p).toMatchObject({ emitidas: 1, recibidas: 1, gastos: 1, cobros: 1 });
    expect(p.ficheros[0].contenido).toContain('F-1');
    expect(p.ficheros[0].contenido).not.toContain('F-3');
    expect(p.ficheros[1].contenido).toContain('Proveedor Uno');
  });

  it('el resumen de IGIC sale del 420: repercutido 7 €, deducible 7 + 3,50 €', () => {
    const resumen = prepararPaquete(datos, { ejercicio: 2026, trimestre: 3 }).ficheros[3].contenido;
    expect(resumen.startsWith('﻿')).toBe(true);
    expect(resumen).toContain('"Resultado";"-3.50"');
  });

  it('en la península el resumen es de IVA', () => {
    const p = prepararPaquete({ ...datos, empresa: { ...datos.empresa, igicEnabled: false } }, { ejercicio: 2026, trimestre: 3 });
    expect(p.ficheros[3].nombre).toBe('Rogar_3T2026_resumen_iva.csv');
    expect(p.ficheros[3].contenido).toContain('Resultado');
  });

  it('los cobros llevan las facturas a las que se aplicaron, y los pagos no entran', () => {
    const csv = libroDeCobros(datos.cobros);
    expect(csv).toContain('F-1 (107,00)');
    expect(csv).not.toContain('C-2');
  });
});
