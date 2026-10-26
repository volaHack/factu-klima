import { describe, expect, it } from 'vitest';
import { esTicketTpv, estadosParaFiltrar, mostrarPestanaTickets } from './filtroFacturas';
import { InvoiceStatus } from './types';

const valores = (lista: { value: InvoiceStatus }[]) => lista.map(s => s.value);

describe('estadosParaFiltrar', () => {
  it('sin facturas raras, sólo los estados de una factura', () => {
    expect(valores(estadosParaFiltrar([]))).toEqual([
      InvoiceStatus.BORRADOR, InvoiceStatus.EMITIDA, InvoiceStatus.PARCIAL,
      InvoiceStatus.PAGADA, InvoiceStatus.VENCIDA, InvoiceStatus.ANULADA,
    ]);
  });

  it('no ofrece los estados de pedido ni «Pendiente» si nadie los tiene', () => {
    const v = valores(estadosParaFiltrar([InvoiceStatus.EMITIDA, InvoiceStatus.PAGADA]));
    for (const fuera of [InvoiceStatus.PRE_APROBACION, InvoiceStatus.APROBADO, InvoiceStatus.APROBADO_PARCIAL, InvoiceStatus.RECHAZADO, InvoiceStatus.PENDIENTE]) {
      expect(v).not.toContain(fuera);
    }
  });

  it('si alguna factura tiene otro estado, su chip sale en su sitio', () => {
    const v = valores(estadosParaFiltrar([InvoiceStatus.PENDIENTE, InvoiceStatus.PRE_APROBACION]));
    expect(v).toContain(InvoiceStatus.PENDIENTE);
    expect(v).toContain(InvoiceStatus.PRE_APROBACION);
    // El orden es el de INVOICE_STATUSES: «En revisión» antes de «Emitida».
    expect(v.indexOf(InvoiceStatus.PRE_APROBACION)).toBeLessThan(v.indexOf(InvoiceStatus.EMITIDA));
    expect(v.indexOf(InvoiceStatus.PENDIENTE)).toBeLessThan(v.indexOf(InvoiceStatus.PARCIAL));
  });

  it('un filtro marcado no pierde su chip aunque ya no quede ninguna factura así', () => {
    expect(valores(estadosParaFiltrar([], [InvoiceStatus.RECHAZADO]))).toContain(InvoiceStatus.RECHAZADO);
  });
});

describe('esTicketTpv', () => {
  it('por la serie, el número o la sesión de caja', () => {
    expect(esTicketTpv({ series: 'TPV', number: 'X-1' })).toBe(true);
    expect(esTicketTpv({ series: 'F', number: 'TPV-2026-0001' })).toBe(true);
    expect(esTicketTpv({ series: 'F', number: 'F-1', posSessionId: 's1' })).toBe(true);
    expect(esTicketTpv({ series: 'F', number: 'F-1' })).toBe(false);
  });
});

describe('mostrarPestanaTickets', () => {
  it('se esconde sólo sin tickets y con el TPV apagado', () => {
    expect(mostrarPestanaTickets(0, false)).toBe(false);
    expect(mostrarPestanaTickets(0, true)).toBe(true);
    expect(mostrarPestanaTickets(3, false)).toBe(true);
  });
});
