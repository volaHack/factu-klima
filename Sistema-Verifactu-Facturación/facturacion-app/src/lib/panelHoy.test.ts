import { describe, expect, it } from 'vitest';
import { InvoiceStatus, type Invoice } from './types';
import { comparativaMes, diaYMes, plural, tareasDeHoy } from './panelHoy';
import type { ApartarHacienda } from './fiscal/apartarHacienda';

const HOY = '2026-10-05';

function doc(over: Partial<Invoice>): Invoice {
  return {
    id: Math.random().toString(36).slice(2), number: 'FAC-1', series: 'FAC', clientId: 'c', clientName: 'Bar Paco',
    issueDate: '2026-10-01', dueDate: '2026-10-31', status: InvoiceStatus.EMITIDA, total: 100,
    lineItems: [], subtotal: 100, totalTax: 0, taxBreakdown: [], ...over,
  } as Invoice;
}

describe('tareasDeHoy', () => {
  it('sin nada pendiente no inventa tareas', () => {
    expect(tareasDeHoy({ documentos: [doc({ status: InvoiceStatus.PAGADA })], hoy: HOY })).toEqual([]);
  });

  it('junta las vencidas en una tarea con el total y la más antigua', () => {
    const t = tareasDeHoy({
      documentos: [
        doc({ status: InvoiceStatus.VENCIDA, dueDate: '2026-09-25', total: 100 }),
        doc({ status: InvoiceStatus.VENCIDA, dueDate: '2026-08-06', total: 50.5 }),
      ],
      hoy: HOY,
    });
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ id: 'vencidas', tono: 'peligro', titulo: '2 facturas vencidas sin cobrar', importe: 150.5, href: '/recordatorios' });
    expect(t[0].detalle).toBe('La más antigua venció hace 60 días');
  });

  it('avisa de los cobros que vencen en siete días, no de los de más adelante', () => {
    const t = tareasDeHoy({ documentos: [doc({ dueDate: '2026-10-09', clientName: 'Frutería Pepe' }), doc({ dueDate: '2026-10-20' })], hoy: HOY });
    expect(t.map(x => x.id)).toEqual(['vencen']);
    expect(t[0].titulo).toBe('1 cobro vence esta semana');
    expect(t[0].detalle).toBe('Frutería Pepe · el 9 de octubre');
  });

  it('cuenta los borradores de venta y no los de compra', () => {
    const t = tareasDeHoy({
      documentos: [doc({ status: InvoiceStatus.BORRADOR, updatedAt: '2026-10-02' }), doc({ status: InvoiceStatus.BORRADOR, sentido: 'compra' })],
      hoy: HOY,
    });
    expect(t[0]).toMatchObject({ id: 'borradores', titulo: '1 borrador sin emitir', detalle: 'El más antiguo, de hace 3 días' });
  });

  it('el trimestre en plazo va con su modelo y los días que quedan', () => {
    const presentacion: ApartarHacienda = {
      ejercicio: 2026, trimestre: 3, plazo: '2026-10-20', diasParaPlazo: 15,
      conceptos: [{ modelo: '303', nombre: 'IVA', importe: 168 }], total: 168,
    };
    const [t] = tareasDeHoy({ documentos: [], presentacion, hoy: HOY });
    expect(t).toMatchObject({ tono: 'aviso', titulo: 'Presentar el IVA del 3.º trimestre', importe: 168, href: '/listados-fiscales/303' });
    expect(t.detalle).toBe('Modelo 303 · hasta el 20 de octubre (quedan 15 días)');
    expect(tareasDeHoy({ documentos: [], presentacion: { ...presentacion, diasParaPlazo: 3 }, hoy: HOY })[0].tono).toBe('peligro');
  });

  it('las facturas electrónicas recibidas por decidir', () => {
    const t = tareasDeHoy({
      documentos: [],
      fe: [{ id: 'fe1', sentido: 'recibida', estado: 'recibida', numero: 'A-1', total: 10, fecha: '2026-10-01' }],
      hoy: HOY,
    });
    expect(t[0]).toMatchObject({ id: 'fe-decidir', titulo: '1 factura electrónica por aceptar o rechazar' });
  });

  it('ordena de lo más grave a lo menos', () => {
    const t = tareasDeHoy({
      documentos: [doc({ status: InvoiceStatus.BORRADOR }), doc({ status: InvoiceStatus.VENCIDA, dueDate: '2026-10-01' })],
      hoy: HOY,
    });
    expect(t.map(x => x.tono)).toEqual(['peligro', 'info']);
  });
});

describe('comparativaMes', () => {
  it('compara con el mes pasado hasta el mismo día, no con el mes entero', () => {
    const c = comparativaMes([
      doc({ issueDate: '2026-10-02', total: 200 }),
      doc({ issueDate: '2026-09-03', total: 100 }),
      doc({ issueDate: '2026-09-20', total: 5000 }), // después del día 5: no cuenta
    ], HOY);
    expect(c).toMatchObject({ total: 200, facturas: 1, anterior: 100, variacion: 100, hastaDia: 5 });
  });

  it('sin nada el mes pasado no hay porcentaje', () => {
    expect(comparativaMes([doc({ issueDate: '2026-10-02' })], HOY).variacion).toBeNull();
  });

  it('el 31 de marzo se compara con el 28 de febrero', () => {
    expect(comparativaMes([], '2026-03-31').hastaDia).toBe(28);
  });

  it('no cuenta anuladas, borradores ni compras', () => {
    const c = comparativaMes([
      doc({ issueDate: '2026-10-01', status: InvoiceStatus.ANULADA }),
      doc({ issueDate: '2026-10-01', status: InvoiceStatus.BORRADOR }),
      doc({ issueDate: '2026-10-01', sentido: 'compra' }),
    ], HOY);
    expect(c.total).toBe(0);
  });
});

describe('textos', () => {
  it('singular y plural', () => {
    expect(plural(1, 'factura', 'facturas')).toBe('1 factura');
    expect(plural(0, 'factura', 'facturas')).toBe('0 facturas');
  });
  it('fecha sin desfase de zona horaria', () => {
    expect(diaYMes('2026-10-20')).toBe('20 de octubre');
  });
});
