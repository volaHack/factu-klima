import { describe, expect, it } from 'vitest';
import { InvoiceStatus, PaymentMethod, type CobroPago, type Gasto, type Invoice } from '../types';
import { leerCsv, leerExtracto, leerFecha, leerImporte, leerNorma43 } from './extracto';
import { conciliar, esSegura, marcaBanco, resumen } from './conciliar';

/** Una línea de Norma 43 de 80 posiciones a partir de sus trozos. */
const n43 = (...trozos: string[]) => trozos.join('').padEnd(80, ' ');

const CABECERA = n43('11', '2100', '0001', '0123456789', '250101', '250131', '2', '00000000100000', '978', '3', 'KLIMA SOLUTIONS SL');
const MOV_ABONO = n43('22', '    ', '0001', '250115', '250115', '02', '099', '2', '00000000121000', '0000000000', '000000000000', 'REF-CLIENTE     ');
const MOV_23 = n43('23', '01', 'TRANSF DE ACME INDUSTRIAL SL'.padEnd(38), 'FAC-2025-0012'.padEnd(38));
const MOV_CARGO = n43('22', '    ', '0001', '250120', '250120', '03', '001', '1', '00000000006050', '0000000000', '000000000000', '                ');
const MOV_23B = n43('23', '01', 'RECIBO IBERDROLA CLIENTES'.padEnd(38), ''.padEnd(38));
const FINAL = n43('33', '2100', '0001', '0123456789', '00001', '00000000006050', '00001', '00000000121000', '2', '00000000215950', '978');
const FICHERO_N43 = [CABECERA, MOV_ABONO, MOV_23, MOV_CARGO, MOV_23B, FINAL, n43('88', '9'.repeat(18), '000006')].join('\r\n');

describe('Norma 43', () => {
  it('lee cuenta, saldos y movimientos con su signo y su concepto', () => {
    const e = leerNorma43(FICHERO_N43);
    expect(e.formato).toBe('norma43');
    expect(e.cuenta).toBe('2100 0001 0123456789');
    expect(e.desde).toBe('2025-01-01');
    expect(e.hasta).toBe('2025-01-31');
    expect(e.saldoInicial).toBe(1000);
    expect(e.saldoFinal).toBe(2159.5);
    expect(e.movimientos).toHaveLength(2);
    expect(e.movimientos[0]).toMatchObject({ fecha: '2025-01-15', importe: 1210, concepto: 'TRANSF DE ACME INDUSTRIAL SL FAC-2025-0012' });
    expect(e.movimientos[1]).toMatchObject({ fecha: '2025-01-20', importe: -60.5, concepto: 'RECIBO IBERDROLA CLIENTES' });
  });

  it('se reconoce solo y da ids estables al reimportar', () => {
    const a = leerExtracto(FICHERO_N43);
    const b = leerExtracto(FICHERO_N43);
    expect(a.formato).toBe('norma43');
    expect(a.movimientos.map(m => m.id)).toEqual(b.movimientos.map(m => m.id));
    expect(new Set(a.movimientos.map(m => m.id)).size).toBe(2);
  });
});

describe('CSV', () => {
  it('importes y fechas a la española', () => {
    expect(leerImporte('1.234,56')).toBe(1234.56);
    expect(leerImporte('-12,5')).toBe(-12.5);
    expect(leerImporte('1,234.56')).toBe(1234.56);
    expect(leerImporte('1.234')).toBe(1234);
    expect(leerImporte('12.50')).toBe(12.5);
    expect(leerImporte('(60,50) €')).toBe(-60.5);
    expect(leerImporte('')).toBeNull();
    expect(leerFecha('31/01/2025')).toBe('2025-01-31');
    expect(leerFecha('5-2-25')).toBe('2025-02-05');
    expect(leerFecha('2025-01-31')).toBe('2025-01-31');
    expect(leerFecha('Total')).toBeNull();
  });

  it('salta las líneas de antes de la cabecera y reconoce las columnas', () => {
    const csv = [
      'Titular;KLIMA SOLUTIONS SL',
      'Cuenta;ES00 2100 0001 0123456789',
      '',
      'Fecha operación;Fecha valor;Concepto;Importe;Saldo',
      '15/01/2025;15/01/2025;"TRANSF DE ACME; FAC-2025-0012";1.210,00;2.210,00',
      '20/01/2025;20/01/2025;RECIBO IBERDROLA;-60,50;2.149,50',
      'Total;;;;',
    ].join('\n');
    const e = leerCsv(csv);
    expect(e.movimientos).toHaveLength(2);
    expect(e.movimientos[0]).toMatchObject({ fecha: '2025-01-15', importe: 1210, concepto: 'TRANSF DE ACME; FAC-2025-0012', saldo: 2210 });
    expect(e.movimientos[1].importe).toBe(-60.5);
    expect(e.desde).toBe('2025-01-15');
  });

  it('columnas separadas de cargos y abonos', () => {
    const csv = 'Fecha,Descripción,Cargo,Abono\n2025-03-01,Cuota autónomos,294.00,\n2025-03-02,Bizum Juan,,25.00\n';
    const e = leerCsv(csv);
    expect(e.movimientos.map(m => m.importe)).toEqual([-294, 25]);
  });

  it('explica qué falta si no reconoce las columnas', () => {
    expect(() => leerCsv('a;b;c\n1;2;3')).toThrow(/columnas/);
  });
});

function factura(over: Partial<Invoice>): Invoice {
  return {
    id: 'f1', number: 'FAC-2025-0012', series: 'FAC', tipo: 'factura', sentido: 'venta',
    clientId: 'c1', clientName: 'Acme Industrial SL', clientNif: 'B12345674',
    issueDate: '2025-01-05', dueDate: '2025-02-04', status: InvoiceStatus.EMITIDA,
    lineItems: [], subtotal: 1000, totalDiscount: 0, totalTax: 210, total: 1210, taxBreakdown: [],
    paymentMethod: PaymentMethod.TRANSFERENCIA, createdAt: '', updatedAt: '',
    ...over,
  } as Invoice;
}

function gasto(over: Partial<Gasto>): Gasto {
  return {
    id: 'g1', fecha: '2025-01-19', concepto: 'Luz enero', categoria: 'suministros', proveedorNombre: 'Iberdrola',
    baseImponible: 50, taxRate: 21, taxAmount: 10.5, total: 60.5, paymentMethod: PaymentMethod.DOMICILIACION,
    createdAt: '', updatedAt: '', ...over,
  };
}

describe('Conciliación', () => {
  const movs = leerNorma43(FICHERO_N43).movimientos;

  it('casa el abono con su factura y el cargo con el gasto ya apuntado', () => {
    const l = conciliar(movs, { facturas: [factura({})], gastos: [gasto({})], cobrosPagos: [] });
    expect(l[0].propuestas[0]).toMatchObject({ tipo: 'cobro' });
    expect(esSegura(l[0])).toBe(true);
    expect(l[1].propuestas[0]).toMatchObject({ tipo: 'gasto' });
    expect(resumen(l)).toMatchObject({ total: 2, seguras: 2, entradas: 1210, salidas: 60.5 });
  });

  it('con retención espera el neto', () => {
    const f = factura({ retencionPct: 15, total: 1210 + 150 }); // 1000 + 210 IVA; se cobra 1360 − 150 = 1210
    const l = conciliar(movs, { facturas: [f], gastos: [], cobrosPagos: [] });
    const p = l[0].propuestas[0];
    expect(p.tipo).toBe('cobro');
    if (p.tipo !== 'gasto') expect(p.facturas[0].importe).toBe(1210);
  });

  it('no propone facturas pagadas, anuladas ni de compra para un abono', () => {
    const l = conciliar(movs, {
      facturas: [
        factura({ id: 'a', status: InvoiceStatus.PAGADA }),
        factura({ id: 'b', status: InvoiceStatus.ANULADA }),
        factura({ id: 'c', sentido: 'compra' }),
      ],
      gastos: [], cobrosPagos: [],
    });
    expect(l[0].propuestas).toHaveLength(0);
  });

  it('una factura no se propone a dos movimientos', () => {
    const doble = [movs[0], { ...movs[0], id: 'otro', concepto: 'INGRESO' }];
    const l = conciliar(doble, { facturas: [factura({})], gastos: [], cobrosPagos: [] });
    expect(l[0].propuestas).toHaveLength(1);
    expect(l[1].propuestas).toHaveLength(0);
  });

  it('un pago que liquida varias facturas del mismo cliente', () => {
    const mov = { ...movs[0], importe: 1815, concepto: 'TRANSF ACME INDUSTRIAL' };
    const l = conciliar([mov], {
      facturas: [factura({}), factura({ id: 'f2', number: 'FAC-2025-0013', subtotal: 500, total: 605 })],
      gastos: [], cobrosPagos: [],
    });
    const p = l[0].propuestas[0];
    expect(p.tipo).toBe('cobro');
    if (p.tipo !== 'gasto') expect(p.facturas.map(x => x.importe)).toEqual([1210, 605]);
  });

  it('reconoce lo ya conciliado por la marca en las notas', () => {
    const cobro = { id: 'x', tipo: 'cobro', number: 'COB-2025-0001', notas: `Del banco ${marcaBanco(movs[0].id)}` } as CobroPago;
    const l = conciliar(movs, { facturas: [factura({})], gastos: [gasto({ notas: marcaBanco(movs[1].id) })], cobrosPagos: [cobro] });
    expect(l[0].hecho).toBe('Cobro COB-2025-0001');
    expect(l[1].hecho).toBe('Gasto: Luz enero');
    expect(resumen(l).conciliados).toBe(2);
  });

  it('lo que no casa con nada queda sin pareja', () => {
    const l = conciliar([{ ...movs[1], importe: -33.33 }], { facturas: [], gastos: [gasto({})], cobrosPagos: [] });
    expect(l[0].propuestas).toHaveLength(0);
    expect(resumen(l).sinPareja).toBe(1);
  });
});
