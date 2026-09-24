import { describe, it, expect } from 'vitest';
import type { Invoice, Gasto, CompanySettings } from '../types';
import { calcularModelo111, validarModelo111, casillas111 } from './aeat/modelo111';
import { calcularModelo190, validarModelo190 } from './aeat/modelo190';
import { calcularModelo390, validarModelo390 } from './aeat/modelo390';
import { calcularModelo303 } from './aeat/modelo303';
import { calcularModelo349, validarModelo349 } from './aeat/modelo349';
import { getModelo } from './tipos';

const NIF_OK = 'B12345674';
const EMPRESA = { nif: NIF_OK, businessName: 'Ejemplo SL', igicEnabled: false } as CompanySettings;

function factura(over: Partial<Invoice>): Invoice {
  return {
    id: 'f1', number: 'FAC-001', series: 'FAC',
    clientId: 'c1', clientName: 'Cliente SL', clientNif: 'B65432106', clientAddress: '',
    issueDate: '2026-02-10', dueDate: '2026-03-10', status: 'emitida',
    lineItems: [], subtotal: 1000, totalDiscount: 0,
    taxBreakdown: [{ rate: 21, base: 1000, amount: 210 }],
    totalTax: 210, total: 1210, paymentMethod: 'transferencia', notes: '',
    ...over,
  } as Invoice;
}
function gasto(over: Partial<Gasto>): Gasto {
  return {
    id: 'g1', fecha: '2026-02-15', concepto: 'Compra', categoria: 'otros',
    baseImponible: 100, taxRate: 21, taxAmount: 21, total: 121,
    paymentMethod: 'transferencia', deducible: true, tipoOperacion: 'interior_corriente',
    createdAt: '', updatedAt: '', ...over,
  } as Gasto;
}

describe('modelo 111 — retenciones practicadas', () => {
  const facturas = [
    // Nos factura un abogado con 15 %: retenemos nosotros.
    factura({ id: 'c1', sentido: 'compra', clientNif: '12345678Z', clientName: 'Abogada', subtotal: 1000, retencionPct: 15 }),
    factura({ id: 'c2', sentido: 'compra', clientNif: '12345678Z', clientName: 'Abogada', subtotal: 500, retencionPct: 15, issueDate: '2026-03-01' }),
    factura({ id: 'c3', sentido: 'compra', clientNif: 'X1234567L', clientName: 'Diseñador', subtotal: 200, retencionPct: 7 }),
    // Una VENTA con retención: la declara el cliente, no nosotros.
    factura({ id: 'v1', subtotal: 800, retencionPct: 15 }),
    // Otro trimestre: fuera.
    factura({ id: 'c4', sentido: 'compra', clientNif: '12345678Z', subtotal: 999, retencionPct: 15, issueDate: '2026-04-02' }),
    // Borrador: fuera.
    factura({ id: 'c5', sentido: 'compra', status: 'borrador' as unknown as Invoice['status'], subtotal: 999, retencionPct: 15 }),
  ];
  const r = calcularModelo111({ facturas }, { ejercicio: 2026, trimestre: 1 });

  it('cuenta perceptores, no facturas, y sólo compras del trimestre', () => {
    expect(r.perceptores).toBe(2);
    expect(r.numFacturas).toBe(3);
    expect(r.base).toBe(1700);
    expect(r.retenciones).toBe(239); // 150 + 75 + 14
    expect(r.resultado).toBe(239);
  });

  it('la complementaria resta lo ya ingresado', () => {
    const c = calcularModelo111({ facturas, aDeducir: 100 }, { ejercicio: 2026, trimestre: 1 });
    expect(c.resultado).toBe(139);
  });

  it('las nóminas salen como pendientes, no como cero', () => {
    const filas = casillas111(r);
    expect(filas.find(f => f.casilla === '01')?.importe).toBeNull();
    expect(filas.find(f => f.casilla === '09')?.importe).toBe(239);
  });

  it('un perceptor sin NIF válido es aviso en el 111', () => {
    const sinNif = calcularModelo111({ facturas: [factura({ sentido: 'compra', clientNif: '', retencionPct: 15 })] }, { ejercicio: 2026, trimestre: 1 });
    const v = validarModelo111(sinNif, EMPRESA);
    expect(v.errores).toHaveLength(0);
    expect(v.avisos.some(a => a.campo === 'nif_perceptor')).toBe(true);
  });
});

describe('modelo 190 — resumen anual por perceptor', () => {
  const facturas = [
    factura({ id: 'a', sentido: 'compra', clientNif: '12345678Z', clientName: 'Abogada', subtotal: 1000, retencionPct: 15, issueDate: '2026-02-01' }),
    factura({ id: 'b', sentido: 'compra', clientNif: '12345678Z', clientName: 'Abogada', subtotal: 1000, retencionPct: 15, issueDate: '2026-11-01' }),
  ];
  const r = calcularModelo190({ facturas }, { ejercicio: 2026 });

  it('suma el año por perceptor y cuadra con los cuatro 111', () => {
    expect(r.perceptores).toHaveLength(1);
    expect(r.perceptores[0]).toMatchObject({ nif: '12345678Z', clave: 'G', base: 2000, retencion: 300, numFacturas: 2 });
    const suma = [1, 2, 3, 4].reduce((s, t) => s + r.trimestres[t as 1 | 2 | 3 | 4].retenciones, 0);
    expect(suma).toBe(r.retenciones);
    expect(validarModelo190(r, EMPRESA).errores).toHaveLength(0);
  });

  it('en el 190 el NIF del perceptor es obligatorio', () => {
    const sin = calcularModelo190({ facturas: [factura({ sentido: 'compra', clientNif: 'MAL', retencionPct: 15 })] }, { ejercicio: 2026 });
    expect(validarModelo190(sin, EMPRESA).errores.some(e => e.campo === 'nif_perceptor')).toBe(true);
  });
});

describe('modelo 390 — resumen anual del IVA', () => {
  const datos = {
    facturas: [
      factura({ id: 'q1', issueDate: '2026-02-10' }),
      factura({ id: 'q3', issueDate: '2026-08-10', subtotal: 500, taxBreakdown: [{ rate: 10, base: 500, amount: 50 }], totalTax: 50, total: 550 }),
    ],
    gastos: [gasto({ fecha: '2026-05-01', baseImponible: 200, taxAmount: 42 })],
  };
  const r = calcularModelo390(datos, { ejercicio: 2026 });

  it('es la suma exacta de los cuatro 303', () => {
    const suma = [1, 2, 3, 4].reduce((s, t) => s + calcularModelo303(datos, { ejercicio: 2026, trimestre: t as 1 }).resultadoRegimenGeneral, 0);
    expect(r.resultadoAnual).toBe(suma);
    expect(r.cuotaDevengada).toBe(260);
    expect(r.cuotaDeducible).toBe(42);
  });

  it('desglosa el devengado del año por tipo', () => {
    expect(r.devengado).toEqual([{ tipo: 21, base: 1000, cuota: 210 }, { tipo: 10, base: 500, cuota: 50 }]);
  });

  it('una empresa en IGIC no presenta el 390', () => {
    const v = validarModelo390(r, { ...EMPRESA, igicEnabled: true });
    expect(v.errores.some(e => e.campo === 'regimen')).toBe(true);
  });
});

describe('modelo 349 — intracomunitarias', () => {
  it('agrupa por operador y clave, sólo del trimestre', () => {
    const facturas = [
      factura({ id: 'e1', esIntracomunitaria: true, clientVatNumber: 'FR12345678901', clientName: 'Client FR', subtotal: 300 } as Partial<Invoice>),
      factura({ id: 'e2', esIntracomunitaria: true, clientVatNumber: 'FR12345678901', clientName: 'Client FR', subtotal: 200 } as Partial<Invoice>),
      factura({ id: 'e3', esIntracomunitaria: true, clientVatNumber: 'FR12345678901', clientName: 'Client FR', subtotal: 999, issueDate: '2026-05-01' } as Partial<Invoice>),
    ];
    const r = calcularModelo349({ facturas }, { ejercicio: 2026, trimestre: 1 });
    expect(r.totalOperaciones).toBe(1);
    expect(r.totalBaseImponible).toBe(500);
    expect(validarModelo349(r, EMPRESA).errores).toHaveLength(0);
  });
});

describe('definiciones', () => {
  it('los modelos nuevos no prometen un fichero que no se genera', () => {
    for (const id of ['111', '190', '349', '390']) {
      expect(getModelo(id)?.via).toBe('diseno_sin_generador');
    }
  });
});
