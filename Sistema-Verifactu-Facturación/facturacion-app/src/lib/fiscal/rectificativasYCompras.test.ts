import { describe, it, expect } from 'vitest';
import { InvoiceStatus, type CompanySettings, type Gasto, type Invoice } from '../types';
import { calcularModelo303, pagina01_303 } from './aeat/modelo303';
import { calcularModelo390 } from './aeat/modelo390';
import { calcularModelo420 } from './atc/modelo420';
import { calcularModelo347 } from './aeat/modelo347';
import { calcularModelo130 } from './aeat/modelo130';

const pos = (r: string, desde: number, hasta: number) => r.slice(desde - 1, hasta);
const EMPRESA = { nif: 'B12345674', businessName: 'Ejemplo SL' } as CompanySettings;

function factura(over: Partial<Invoice>): Invoice {
  return {
    id: 'f1', number: 'FAC-1', series: 'FAC', clientId: 'c1', clientName: 'Cliente SL', clientNif: 'B65432106', clientAddress: 'x',
    issueDate: '2026-02-10', dueDate: '2026-03-10', status: InvoiceStatus.EMITIDA, lineItems: [], subtotal: 1000, totalDiscount: 0,
    taxBreakdown: [{ rate: 21, base: 1000, amount: 210 }], totalTax: 210, total: 1210, paymentMethod: 'transferencia', notes: '',
    tipo: 'factura', sentido: 'venta', ...over,
  } as Invoice;
}
const rect = (over: Partial<Invoice> = {}) => factura({
  id: 'r1', number: 'REC-1', tipo: 'rectificativa', subtotal: -100, totalTax: -21, total: -121,
  taxBreakdown: [{ rate: 21, base: -100, amount: -21 }], ...over,
});
const gastos: Gasto[] = [];

describe('303: rectificativas y facturas de compra', () => {
  const r = calcularModelo303({
    facturas: [
      factura({}),
      rect(),
      factura({ id: 'c1', sentido: 'compra', subtotal: 400, totalTax: 84, total: 484, taxBreakdown: [{ rate: 21, base: 400, amount: 84 }] }),
      rect({ id: 'c2', sentido: 'compra', subtotal: -50, totalTax: -10.5, total: -60.5, taxBreakdown: [{ rate: 21, base: -50, amount: -10.5 }] }),
    ],
    gastos,
  }, { ejercicio: 2026, trimestre: 1 });

  it('la rectificativa va a [14][15] y resta del devengado [27]', () => {
    expect(r.devengado).toEqual([{ tipo: 21, base: 1000, cuota: 210 }]);
    expect(r.modificacion).toEqual({ base: -100, cuota: -21 });
    expect(r.cuotaDevengada).toBe(189);
  });

  it('el IVA de las facturas de compra se deduce en [28][29]; su rectificativa en [40][41]', () => {
    expect(r.soportado.interiorCorriente).toEqual({ base: 400, cuota: 84 });
    expect(r.rectificacionDeducciones).toEqual({ base: -50, cuota: -10.5 });
    expect(r.cuotaDeducible).toBe(73.5);
    expect(r.resultadoRegimenGeneral).toBe(115.5);
  });

  it('el fichero lleva [14][15] y [40][41] con signo', () => {
    const p = pagina01_303(r, EMPRESA);
    expect(pos(p, 433, 449)).toBe('N0000000000010000');
    expect(pos(p, 450, 466)).toBe('N0000000000002100');
    expect(pos(p, 917, 933)).toBe('N0000000000005000');
    expect(pos(p, 713, 729)).toBe('00000000000040000');
  });

  it('el 390 lo suma igual', () => {
    const a = calcularModelo390({ facturas: [factura({}), rect()], gastos }, { ejercicio: 2026 });
    expect(a.cuotaDevengada).toBe(189);
  });
});

describe('otros modelos con rectificativas y compras', () => {
  it('420: el IGIC de las facturas de compra se deduce', () => {
    const r = calcularModelo420({
      facturas: [factura({ taxBreakdown: [{ rate: 7, base: 1000, amount: 70 }], totalTax: 70, total: 1070 }),
        factura({ id: 'c', sentido: 'compra', subtotal: 200, totalTax: 14, total: 214, taxBreakdown: [{ rate: 7, base: 200, amount: 14 }] })],
      gastos,
    }, { ejercicio: 2026, trimestre: 1 });
    expect(r.totalDeducible).toBe(14);
    expect(r.resultado).toBe(56);
  });

  it('347: la rectificativa resta del total anual con ese cliente', () => {
    const r = calcularModelo347({
      facturas: [factura({ total: 4000, subtotal: 3305.79 }), rect({ total: -500, subtotal: -413.22 })],
      gastos, clientes: [{ id: 'c1', nif: 'B65432106', businessName: 'Cliente SL' } as never],
    }, { ejercicio: 2026 });
    expect(r.importeTotal).toBe(3500);
  });

  it('130: la rectificativa baja los ingresos', () => {
    const r = calcularModelo130({ facturas: [factura({}), rect()], gastos }, { ejercicio: 2026, trimestre: 1 });
    expect(r.ingresos).toBe(900);
  });
});
