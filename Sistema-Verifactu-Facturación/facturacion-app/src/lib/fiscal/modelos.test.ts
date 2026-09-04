import { describe, it, expect } from 'vitest';
import type { Invoice, Gasto, Client, CompanySettings } from '../types';
import { calcularModelo303, validarModelo303, generarFichero303, pagina01_303, cabecera303, pagina03_303 } from './aeat/modelo303';
import { calcularModelo130, validarModelo130, PORCENTAJE_130 } from './aeat/modelo130';
import { calcularModelo131, validarModelo131 } from './aeat/modelo131';
import { calcularModelo420, validarModelo420 } from './atc/modelo420';
import { calcularModelo415, validarModelo415, UMBRAL_415 } from './atc/modelo415';
import { calcularModelo425, validarModelo425 } from './atc/modelo425';

/** Posiciones tal cual las numera el diseño oficial (empiezan en 1). */
function pos(r: string, desde: number, hasta = desde): string {
  return r.slice(desde - 1, hasta);
}

const NIF_OK = 'B12345674';

const EMPRESA_IVA = {
  nif: NIF_OK, businessName: 'Ejemplo SL', igicEnabled: false,
} as CompanySettings;
const EMPRESA_IGIC = {
  nif: NIF_OK, businessName: 'Ejemplo SL', igicEnabled: true, igicRates: [7, 3, 13, 0],
} as CompanySettings;

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
    createdAt: '', updatedAt: '',
    ...over,
  } as Gasto;
}

/* ================================================================== */
describe('modelo 303 — IVA', () => {
  const datos = {
    facturas: [
      factura({ id: 'a', taxBreakdown: [{ rate: 21, base: 1000, amount: 210 }], subtotal: 1000, total: 1210 }),
      factura({ id: 'b', taxBreakdown: [{ rate: 10, base: 500, amount: 50 }], subtotal: 500, total: 550 }),
    ],
    gastos: [gasto({ baseImponible: 200, taxAmount: 42 })],
  };
  const r = calcularModelo303(datos, { ejercicio: 2026, trimestre: 1 });

  it('agrupa el devengado por tipo y suma la casilla [27]', () => {
    expect(r.devengado.map(d => d.tipo)).toEqual([21, 10]);
    expect(r.cuotaDevengada).toBe(260);
  });

  it('la casilla [45] es la cuota deducible de los gastos', () => {
    expect(r.cuotaDeducible).toBe(42);
  });

  it('la casilla [46] es [27] − [45]', () => {
    expect(r.resultadoRegimenGeneral).toBe(218);
  });

  it('respeta la cuota deducible cuando es menor que la soportada', () => {
    const parcial = calcularModelo303(
      { facturas: [], gastos: [gasto({ taxAmount: 100, cuotaDeducible: 50 })] },
      { ejercicio: 2026, trimestre: 1 },
    );
    expect(parcial.soportado.totalSoportado).toBe(100);
    expect(parcial.cuotaDeducible).toBe(50);
  });

  it('un gasto no deducible no resta nada', () => {
    const no = calcularModelo303(
      { facturas: [], gastos: [gasto({ taxAmount: 100, deducible: false })] },
      { ejercicio: 2026, trimestre: 1 },
    );
    expect(no.cuotaDeducible).toBe(0);
    expect(no.soportado.totalSoportado).toBe(100);
  });

  it('separa el soportado por tipo de operación, que van a casillas distintas', () => {
    const mixto = calcularModelo303({
      facturas: [],
      gastos: [
        gasto({ id: 'g1', baseImponible: 100, taxAmount: 21, tipoOperacion: 'interior_corriente' }),
        gasto({ id: 'g2', baseImponible: 500, taxAmount: 105, tipoOperacion: 'interior_inversion' }),
        gasto({ id: 'g3', baseImponible: 300, taxAmount: 63, tipoOperacion: 'importacion_corriente' }),
      ],
    }, { ejercicio: 2026, trimestre: 1 });
    expect(mixto.soportado.interiorCorriente.cuota).toBe(21);
    expect(mixto.soportado.interiorInversion.cuota).toBe(105);
    expect(mixto.soportado.importacionCorriente.cuota).toBe(63);
    expect(mixto.cuotaDeducible).toBe(189);
  });

  it('rechaza el 303 si la empresa tributa en IGIC: le toca el 420', () => {
    const v = validarModelo303(r, EMPRESA_IGIC);
    expect(v.valido).toBe(false);
    expect(v.errores.some(e => e.campo === 'regimen')).toBe(true);
  });

  it('acepta el 303 con una empresa en IVA', () => {
    expect(validarModelo303(r, EMPRESA_IVA).valido).toBe(true);
  });

  describe('fichero oficial', () => {
    it('la cabecera mide 328 posiciones y lleva el modelo y el período', () => {
      const c = cabecera303(r);
      expect(c).toHaveLength(328);
      expect(pos(c, 1, 2)).toBe('<T');
      expect(pos(c, 3, 5)).toBe('303');
      expect(pos(c, 7, 10)).toBe('2026');
      expect(pos(c, 11, 12)).toBe('1T');
      expect(pos(c, 18, 22)).toBe('<AUX>');
      expect(pos(c, 323, 328)).toBe('</AUX>');
    });

    it('la página 01 mide 1581 posiciones y cierra con su etiqueta', () => {
      const p = pagina01_303(r, EMPRESA_IVA);
      expect(p).toHaveLength(1581);
      expect(pos(p, 1, 11)).toBe('<T30301000>');
      expect(pos(p, 1570, 1581)).toBe('</T30301000>');
    });

    it('coloca NIF, razón social, ejercicio y período en sus posiciones', () => {
      const p = pagina01_303(r, EMPRESA_IVA);
      expect(pos(p, 14, 22)).toBe(NIF_OK);
      expect(pos(p, 23, 102)).toBe('EJEMPLO SL'.padEnd(80, ' '));
      expect(pos(p, 103, 106)).toBe('2026');
      expect(pos(p, 107, 108)).toBe('1T');
    });

    it('coloca las bases y cuotas del 21% en [07][08][09]', () => {
      const p = pagina01_303(r, EMPRESA_IVA);
      expect(pos(p, 326, 342)).toBe('00000000000100000'); // base 1000,00
      expect(pos(p, 343, 347)).toBe('02100');             // tipo 21%
      expect(pos(p, 348, 364)).toBe('00000000000021000'); // cuota 210,00
    });

    it('coloca el 10% en [04][05][06]', () => {
      const p = pagina01_303(r, EMPRESA_IVA);
      expect(pos(p, 287, 303)).toBe('00000000000050000');
      expect(pos(p, 304, 308)).toBe('01000');
      expect(pos(p, 309, 325)).toBe('00000000000005000');
    });

    it('la casilla [27] lleva el total devengado y la [45] el deducible', () => {
      const p = pagina01_303(r, EMPRESA_IVA);
      expect(pos(p, 696, 712)).toBe('00000000000026000');  // 260,00
      expect(pos(p, 1002, 1018)).toBe('00000000000004200'); // 42,00
    });

    it('la casilla [46] lleva signo aparte y es negativa si sale a compensar', () => {
      const p = pagina01_303(r, EMPRESA_IVA);
      expect(pos(p, 1019)).toBe(' ');
      expect(pos(p, 1020, 1035)).toBe('0000000000021800');

      const compensar = calcularModelo303(
        { facturas: [], gastos: [gasto({ taxAmount: 500 })] },
        { ejercicio: 2026, trimestre: 1 },
      );
      const pc = pagina01_303(compensar, EMPRESA_IVA);
      expect(pos(pc, 1019)).toBe('N');
      expect(pos(pc, 1020, 1035)).toBe('0000000000050000');
    });

    it('la página 03 mide 1017 posiciones y lleva el resultado en [71]', () => {
      const p = pagina03_303(r);
      expect(p).toHaveLength(1017);
      expect(pos(p, 1, 11)).toBe('<T30303000>');
      expect(pos(p, 341, 356)).toBe('0000000000021800');
      expect(pos(p, 1006, 1017)).toBe('</T30303000>');
    });

    it('el fichero completo encadena cabecera, páginas y cierre', () => {
      const f = generarFichero303(r, EMPRESA_IVA);
      expect(f).toHaveLength(328 + 1581 + 1017 + 18);
      expect(f.endsWith('</T303020261T0000>')).toBe(true);
    });
  });
});

/* ================================================================== */
describe('modelo 420 — IGIC', () => {
  const datos = {
    facturas: [
      factura({ id: 'a', taxBreakdown: [{ rate: 7, base: 1000, amount: 70 }], subtotal: 1000, total: 1070 }),
      factura({ id: 'b', taxBreakdown: [{ rate: 3, base: 500, amount: 15 }], subtotal: 500, total: 515 }),
    ],
    gastos: [gasto({ taxRate: 7, baseImponible: 200, taxAmount: 14 })],
  };
  const r = calcularModelo420(datos, { ejercicio: 2026, trimestre: 1 });

  it('agrupa el repercutido por los tipos del IGIC', () => {
    expect(r.repercutido.map(d => d.tipo)).toEqual([7, 3]);
    expect(r.totalRepercutido).toBe(85);
  });

  it('separa lo soportado de lo deducible', () => {
    const parcial = calcularModelo420(
      { facturas: [], gastos: [gasto({ taxRate: 7, taxAmount: 70, cuotaDeducible: 35 })] },
      { ejercicio: 2026, trimestre: 1 },
    );
    expect(parcial.totalSoportado).toBe(70);
    expect(parcial.totalDeducible).toBe(35);
  });

  it('el resultado es repercutido − deducible − compensaciones', () => {
    expect(r.resultado).toBe(71);
    const conCompensacion = calcularModelo420(
      { ...datos, compensacionesAnteriores: 50 },
      { ejercicio: 2026, trimestre: 1 },
    );
    expect(conCompensacion.resultado).toBe(21);
  });

  it('informa la base al 0% aparte, sin cuota', () => {
    const exenta = calcularModelo420({
      facturas: [factura({ taxBreakdown: [{ rate: 0, base: 800, amount: 0 }], subtotal: 800, total: 800 })],
      gastos: [],
    }, { ejercicio: 2026, trimestre: 1 });
    expect(exenta.baseSinCuota).toBe(800);
    expect(exenta.totalRepercutido).toBe(0);
  });

  it('rechaza el 420 si la empresa no está en IGIC', () => {
    const v = validarModelo420(r, EMPRESA_IVA);
    expect(v.valido).toBe(false);
    expect(v.errores.some(e => e.campo === 'regimen')).toBe(true);
  });

  it('acepta el 420 con empresa en IGIC', () => {
    expect(validarModelo420(r, EMPRESA_IGIC).valido).toBe(true);
  });

  it('es imposible deducir más de lo soportado', () => {
    const malo = calcularModelo420(
      { facturas: [], gastos: [gasto({ taxRate: 7, taxAmount: 10, cuotaDeducible: 999 })] },
      { ejercicio: 2026, trimestre: 1 },
    );
    const v = validarModelo420(malo, EMPRESA_IGIC);
    expect(v.errores.some(e => e.campo === 'deducible')).toBe(true);
  });

  it('avisa de un tipo que no está entre los configurados', () => {
    const raro = calcularModelo420({
      facturas: [factura({ taxBreakdown: [{ rate: 21, base: 100, amount: 21 }] })],
      gastos: [],
    }, { ejercicio: 2026, trimestre: 1 });
    const v = validarModelo420(raro, EMPRESA_IGIC);
    expect(v.avisos.some(a => a.campo === 'tipo_igic')).toBe(true);
  });

  it('sólo coge las facturas del trimestre pedido', () => {
    const otro = calcularModelo420({
      facturas: [factura({ issueDate: '2026-08-10' })],
      gastos: [],
    }, { ejercicio: 2026, trimestre: 1 });
    expect(otro.numFacturas).toBe(0);
  });
});

/* ================================================================== */
describe('modelo 415 — operaciones con terceros (IGIC)', () => {
  const clientes = [{ id: 'c1', nif: 'B65432106', businessName: 'Cliente SL' } as Client];

  it('aplica el umbral de 3.005,06 € sobre la suma del año', () => {
    const bajo = calcularModelo415(
      { facturas: [factura({ total: 3000 })], gastos: [], clientes },
      { ejercicio: 2026 },
    );
    expect(bajo.declarados).toHaveLength(0);

    const alto = calcularModelo415(
      { facturas: [factura({ total: 3005.07 })], gastos: [], clientes },
      { ejercicio: 2026 },
    );
    expect(alto.declarados).toHaveLength(1);
    expect(UMBRAL_415).toBe(3005.06);
  });

  it('reparte por trimestres y cuadra con el total', () => {
    const r = calcularModelo415({
      facturas: [
        factura({ id: 'a', total: 3000, issueDate: '2026-01-10' }),
        factura({ id: 'b', total: 2000, issueDate: '2026-10-10' }),
      ],
      gastos: [], clientes,
    }, { ejercicio: 2026 });
    expect(r.declarados[0].trimestres).toEqual({ 1: 3000, 2: 0, 3: 0, 4: 2000 });
    expect(r.declarados[0].importe).toBe(5000);
  });

  it('separa entregas de adquisiciones', () => {
    const r = calcularModelo415({
      facturas: [
        factura({ id: 'a', total: 5000, sentido: 'venta' as Invoice['sentido'] }),
        factura({ id: 'b', total: 4000, sentido: 'compra' as Invoice['sentido'] }),
      ],
      gastos: [], clientes,
    }, { ejercicio: 2026 });
    expect(r.importeEntregas).toBe(5000);
    expect(r.importeAdquisiciones).toBe(4000);
  });

  it('rechaza el 415 si la empresa tributa en IVA: le toca el 347', () => {
    const r = calcularModelo415({ facturas: [], gastos: [], clientes }, { ejercicio: 2026 });
    const v = validarModelo415(r, EMPRESA_IVA);
    expect(v.errores.some(e => e.campo === 'regimen')).toBe(true);
  });
});

/* ================================================================== */
describe('modelo 425 — resumen anual del IGIC', () => {
  const datos = {
    facturas: [
      factura({ id: 'a', issueDate: '2026-02-01', taxBreakdown: [{ rate: 7, base: 1000, amount: 70 }], total: 1070 }),
      factura({ id: 'b', issueDate: '2026-05-01', taxBreakdown: [{ rate: 7, base: 2000, amount: 140 }], total: 2140 }),
      factura({ id: 'c', issueDate: '2026-11-01', taxBreakdown: [{ rate: 7, base: 3000, amount: 210 }], total: 3210 }),
    ],
    gastos: [],
  };
  const r = calcularModelo425(datos, { ejercicio: 2026 });

  it('el anual es exactamente la suma de los cuatro trimestres', () => {
    expect(r.trimestres[1].totalRepercutido).toBe(70);
    expect(r.trimestres[2].totalRepercutido).toBe(140);
    expect(r.trimestres[3].totalRepercutido).toBe(0);
    expect(r.trimestres[4].totalRepercutido).toBe(210);
    expect(r.repercutidoAnual).toBe(420);
  });

  it('valida el cuadre anual contra los trimestres', () => {
    expect(validarModelo425(r, EMPRESA_IGIC).valido).toBe(true);
  });

  it('avisa de los trimestres sin movimientos', () => {
    const v = validarModelo425(r, EMPRESA_IGIC);
    expect(v.avisos.some(a => a.campo === 'trimestre_vacio')).toBe(true);
  });
});

/* ================================================================== */
describe('modelo 130 — pago fraccionado IRPF (estimación directa)', () => {
  const EMPRESA_DIRECTA = { ...EMPRESA_IVA, regimenIrpf: 'directa_simplificada' } as CompanySettings;

  it('ACUMULA desde el 1 de enero, no sólo el trimestre', () => {
    const datos = {
      facturas: [
        factura({ id: 'a', issueDate: '2026-01-15', subtotal: 1000 }),
        factura({ id: 'b', issueDate: '2026-05-15', subtotal: 2000 }),
      ],
      gastos: [],
    };
    // En el 2T el acumulado son los dos trimestres, no sólo el segundo.
    const r2 = calcularModelo130(datos, { ejercicio: 2026, trimestre: 2 });
    expect(r2.ingresos).toBe(3000);
    // En el 1T sólo el primero.
    const r1 = calcularModelo130(datos, { ejercicio: 2026, trimestre: 1 });
    expect(r1.ingresos).toBe(1000);
  });

  it('el rendimiento va por base imponible, no por total con IVA', () => {
    const r = calcularModelo130(
      { facturas: [factura({ subtotal: 1000, total: 1210 })], gastos: [] },
      { ejercicio: 2026, trimestre: 1 },
    );
    expect(r.ingresos).toBe(1000);
  });

  it('el pago fraccionado es el 20% del rendimiento neto', () => {
    const r = calcularModelo130(
      { facturas: [factura({ subtotal: 5000 })], gastos: [gasto({ baseImponible: 1000 })] },
      { ejercicio: 2026, trimestre: 1 },
    );
    expect(r.rendimientoNeto).toBe(4000);
    expect(r.pagoFraccionado).toBe(800);
    expect(PORCENTAJE_130).toBe(20);
  });

  it('no hay pago fraccionado si el acumulado va en pérdidas', () => {
    const r = calcularModelo130(
      { facturas: [factura({ subtotal: 500 })], gastos: [gasto({ baseImponible: 2000 })] },
      { ejercicio: 2026, trimestre: 1 },
    );
    expect(r.rendimientoNeto).toBe(-1500);
    expect(r.pagoFraccionado).toBe(0);
  });

  it('resta las retenciones que nos han practicado', () => {
    const r = calcularModelo130(
      { facturas: [factura({ subtotal: 5000, retencionPct: 15 })], gastos: [] },
      { ejercicio: 2026, trimestre: 1 },
    );
    expect(r.retenciones).toBe(750);
    expect(r.resultado).toBe(250); // 1000 − 0 − 750
  });

  it('resta los pagos fraccionados de trimestres anteriores', () => {
    const r = calcularModelo130(
      { facturas: [factura({ subtotal: 5000 })], gastos: [], pagosAnteriores: 300 },
      { ejercicio: 2026, trimestre: 2 },
    );
    expect(r.resultado).toBe(700);
  });

  it('rechaza el 130 si la empresa está en módulos', () => {
    const r = calcularModelo130({ facturas: [], gastos: [] }, { ejercicio: 2026, trimestre: 1 });
    const v = validarModelo130(r, { ...EMPRESA_IVA, regimenIrpf: 'objetiva' } as CompanySettings);
    expect(v.errores.some(e => e.campo === 'regimen_irpf')).toBe(true);
  });

  it('rechaza el 130 si no se sabe el régimen: no se adivina', () => {
    const r = calcularModelo130({ facturas: [], gastos: [] }, { ejercicio: 2026, trimestre: 1 });
    const v = validarModelo130(r, EMPRESA_IVA);
    expect(v.valido).toBe(false);
    expect(v.errores.some(e => e.campo === 'regimen_irpf')).toBe(true);
  });

  it('acepta el 130 en estimación directa', () => {
    const r = calcularModelo130({ facturas: [], gastos: [] }, { ejercicio: 2026, trimestre: 1 });
    expect(validarModelo130(r, EMPRESA_DIRECTA).valido).toBe(true);
  });
});

/* ================================================================== */
describe('modelo 131 — pago fraccionado IRPF (módulos)', () => {
  const EMPRESA_MODULOS = {
    ...EMPRESA_IVA, regimenIrpf: 'objetiva', epigrafeIae: '673.1',
  } as CompanySettings;

  it('sin el rendimiento de módulos NO inventa un resultado', () => {
    const r = calcularModelo131({ facturas: [factura({})] }, { ejercicio: 2026, trimestre: 1 });
    expect(r.rendimientoNetoPrevio).toBeNull();
    expect(r.resultado).toBeNull();
    const v = validarModelo131(r, EMPRESA_MODULOS);
    expect(v.valido).toBe(false);
    expect(v.errores.some(e => e.campo === 'rendimiento_modulos')).toBe(true);
  });

  it('con el rendimiento de módulos liquida el 4%', () => {
    const r = calcularModelo131(
      { facturas: [], rendimientoNetoPrevio: 10000 },
      { ejercicio: 2026, trimestre: 1 },
    );
    expect(r.pagoFraccionado).toBe(400);
    expect(r.resultado).toBe(400);
    expect(validarModelo131(r, EMPRESA_MODULOS).valido).toBe(true);
  });

  it('resta las retenciones del trimestre', () => {
    const r = calcularModelo131(
      { facturas: [factura({ subtotal: 1000, retencionPct: 1 })], rendimientoNetoPrevio: 10000 },
      { ejercicio: 2026, trimestre: 1 },
    );
    expect(r.retenciones).toBe(10);
    expect(r.resultado).toBe(390);
  });

  it('avisa si los ingresos del año pasan del límite de módulos', () => {
    const muchas = Array.from({ length: 30 }, (_, i) =>
      factura({ id: `f${i}`, subtotal: 10000, issueDate: '2026-03-01' }));
    const r = calcularModelo131(
      { facturas: muchas, rendimientoNetoPrevio: 1000 },
      { ejercicio: 2026, trimestre: 1 },
    );
    expect(r.ingresosAcumulados).toBe(300000);
    const v = validarModelo131(r, EMPRESA_MODULOS);
    expect(v.avisos.some(a => a.campo === 'limite_modulos')).toBe(true);
  });

  it('rechaza el 131 si la empresa está en estimación directa', () => {
    const r = calcularModelo131({ facturas: [], rendimientoNetoPrevio: 1000 }, { ejercicio: 2026, trimestre: 1 });
    const v = validarModelo131(r, { ...EMPRESA_IVA, regimenIrpf: 'directa_normal' } as CompanySettings);
    expect(v.errores.some(e => e.campo === 'regimen_irpf')).toBe(true);
  });
});
