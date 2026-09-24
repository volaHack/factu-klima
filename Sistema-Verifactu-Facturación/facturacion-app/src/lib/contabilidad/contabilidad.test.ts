import { describe, it, expect } from 'vitest';
import { InvoiceStatus, type Client, type CobroPago, type Gasto, type Invoice } from '../types';
import { generarAsientos, type Asiento } from './motor';
import { balance, cuadres, diarioDelEjercicio, diarioCsv, libroMayor, perdidasYGanancias, sumasYSaldos } from './informes';
import { cuentaImpuesto, nombreDeCuenta } from './plan';

const cliente = (id: string, n: string, over: Partial<Client> = {}): Client =>
  ({ id, businessName: n, tradeName: '', nif: 'B12345674', createdAt: `2025-01-0${id.slice(-1)}`, ...over } as Client);

function factura(over: Partial<Invoice>): Invoice {
  return {
    id: 'f1', number: 'FAC-1', series: 'FAC', clientId: 'c1', clientName: 'Bar Paco S.L.', clientNif: 'B12345674', clientAddress: 'x',
    issueDate: '2026-02-10', dueDate: '2026-03-10', status: InvoiceStatus.EMITIDA, lineItems: [], subtotal: 1000, totalDiscount: 0,
    taxBreakdown: [{ rate: 21, base: 1000, amount: 210 }], totalTax: 210, total: 1210, paymentMethod: 'transferencia', notes: '',
    tipo: 'factura', sentido: 'venta', ...over,
  } as Invoice;
}
function gasto(over: Partial<Gasto>): Gasto {
  return {
    id: 'g1', fecha: '2026-02-15', concepto: 'Alquiler local', categoria: 'alquiler', baseImponible: 500, taxRate: 21, taxAmount: 105,
    total: 605, paymentMethod: 'transferencia', deducible: true, createdAt: '', updatedAt: '', ...over,
  } as Gasto;
}
const cuadra = (a: Asiento) => Math.abs(a.lineas.reduce((t, l) => t + l.debe - l.haber, 0)) < 0.001;
const linea = (a: Asiento, cuenta: string) => a.lineas.find(l => l.cuenta === cuenta);

const CLIENTES = [cliente('c1', 'Bar Paco S.L.'), cliente('c2', 'Frutas Sur S.L.', { esProveedor: true })];

describe('asientos', () => {
  it('factura de venta: 430 / 700 + 477', () => {
    const [a] = generarAsientos({ facturas: [factura({})], gastos: [], cobrosPagos: [], clientes: CLIENTES, impuesto: 'IVA' });
    expect(cuadra(a)).toBe(true);
    expect(linea(a, '43000001')?.debe).toBe(1210);
    expect(linea(a, '70000000')?.haber).toBe(1000);
    expect(linea(a, cuentaImpuesto('477', 21))?.haber).toBe(210);
  });

  it('servicios con retención: 705 y la retención a la 473', () => {
    const [a] = generarAsientos({ facturas: [factura({ retencionPct: 15 })], gastos: [], cobrosPagos: [], clientes: CLIENTES, sector: 'abogacia', impuesto: 'IVA' });
    expect(cuadra(a)).toBe(true);
    expect(linea(a, '43000001')?.debe).toBe(1060);
    expect(linea(a, '47300000')?.debe).toBe(150);
    expect(linea(a, '70500000')?.haber).toBe(1000);
  });

  it('rectificativa (importes negativos): 708 y 477 al debe, cliente al haber', () => {
    const [a] = generarAsientos({
      facturas: [factura({ tipo: 'rectificativa', subtotal: -100, totalTax: -21, total: -121, taxBreakdown: [{ rate: 21, base: -100, amount: -21 }] })],
      gastos: [], cobrosPagos: [], clientes: CLIENTES, impuesto: 'IVA',
    });
    expect(cuadra(a)).toBe(true);
    expect(linea(a, '70800000')?.debe).toBe(100);
    expect(linea(a, '43000001')?.haber).toBe(121);
  });

  it('borradores y anuladas no existen para la contabilidad', () => {
    const r = generarAsientos({ facturas: [factura({ status: InvoiceStatus.BORRADOR }), factura({ id: 'f2', status: InvoiceStatus.ANULADA })], gastos: [], cobrosPagos: [], clientes: CLIENTES, impuesto: 'IVA' });
    expect(r).toHaveLength(0);
  });

  it('tickets del TPV: un asiento por día, efectivo a caja y tarjeta a banco', () => {
    const t = (id: string, total: number, pm: string) => factura({ id, posSessionId: 's', clientId: '', clientName: 'Venta', paymentMethod: pm as Invoice['paymentMethod'], subtotal: total / 1.1, totalTax: total - total / 1.1, total, taxBreakdown: [{ rate: 10, base: Math.round(total / 1.1 * 100) / 100, amount: Math.round((total - total / 1.1) * 100) / 100 }] });
    const r = generarAsientos({ facturas: [t('t1', 11, 'efectivo'), t('t2', 22, 'tarjeta')], gastos: [], cobrosPagos: [], clientes: CLIENTES, impuesto: 'IVA' });
    expect(r).toHaveLength(1);
    expect(cuadra(r[0])).toBe(true);
    expect(linea(r[0], '57000000')?.debe).toBe(11);
    expect(linea(r[0], '57200000')?.debe).toBe(22);
  });

  it('compra con retención practicada: 600 + 472 / 400 + 4751', () => {
    const [a] = generarAsientos({ facturas: [factura({ sentido: 'compra', clientId: 'c2', clientName: 'Frutas Sur S.L.', retencionPct: 15 })], gastos: [], cobrosPagos: [], clientes: CLIENTES, impuesto: 'IVA' });
    expect(cuadra(a)).toBe(true);
    expect(linea(a, '60000000')?.debe).toBe(1000);
    expect(linea(a, cuentaImpuesto('472', 21))?.debe).toBe(210);
    expect(linea(a, '40000002')?.haber).toBe(1060);
    expect(linea(a, '47510000')?.haber).toBe(150);
  });

  it('gasto con IVA en parte no deducible: lo no deducible es más gasto', () => {
    const [a] = generarAsientos({ facturas: [], gastos: [gasto({ categoria: 'vehiculo', cuotaDeducible: 52.5 })], cobrosPagos: [], clientes: [], impuesto: 'IVA' });
    expect(cuadra(a)).toBe(true);
    expect(linea(a, '62900000')?.debe).toBe(552.5);
    expect(linea(a, cuentaImpuesto('472', 21))?.debe).toBe(52.5);
    expect(linea(a, '57200000')?.haber).toBe(605);
  });

  it('una inversión va al inmovilizado', () => {
    const [a] = generarAsientos({ facturas: [], gastos: [gasto({ tipoOperacion: 'interior_inversion', categoria: 'material' })], cobrosPagos: [], clientes: [], impuesto: 'IVA' });
    expect(linea(a, '21900000')?.debe).toBe(500);
  });

  it('cobro en tesorería, y cobro implícito sólo por lo que falte', () => {
    const cobro: CobroPago = { id: 'k1', tipo: 'cobro', series: 'COB', number: 'COB-1', fecha: '2026-03-01', contraparteId: 'c1', contraparteNombre: 'Bar Paco S.L.', paymentMethod: 'transferencia', importeTotal: 1000, desglose: [{ invoiceId: 'f1', invoiceNumber: 'FAC-1', importeAplicado: 1000 }], createdAt: '', updatedAt: '' } as CobroPago;
    const r = generarAsientos({ facturas: [factura({ status: InvoiceStatus.PAGADA, paidDate: '2026-03-05' })], gastos: [], cobrosPagos: [cobro], clientes: CLIENTES, impuesto: 'IVA' });
    expect(r.every(cuadra)).toBe(true);
    const implicito = r.find(a => a.origen === 'cobro_implicito');
    expect(implicito && linea(implicito, '43000001')?.haber).toBe(210);
    const s = sumasYSaldos(r).filas.find(f => f.cuenta === '43000001')!;
    expect(s.saldoDeudor).toBe(0);
  });

  it('nombres de cuentas de impuestos', () => {
    expect(cuentaImpuesto('477', 21)).toBe('47700021');
    expect(nombreDeCuenta('47700021', 'IVA', new Map())).toBe('H.P. IVA repercutido 21 %');
    expect(nombreDeCuenta(cuentaImpuesto('477', 9.5), 'IGIC', new Map())).toBe('H.P. IGIC repercutido 9,5 %');
  });
});

describe('libros y cuentas anuales', () => {
  const datos = {
    facturas: [
      factura({ id: 'a', issueDate: '2025-06-01', number: 'FAC-0' }),
      factura({ id: 'b', issueDate: '2026-02-10' }),
    ],
    gastos: [gasto({ fecha: '2025-07-01' }), gasto({ id: 'g2', fecha: '2026-03-01' })],
    cobrosPagos: [], clientes: CLIENTES, impuesto: 'IVA' as const,
  };
  const todos = generarAsientos(datos);

  it('el ejercicio empieza con la apertura de los saldos anteriores y el resultado a remanente', () => {
    const d = diarioDelEjercicio(todos, 2026);
    expect(d[0].origen).toBe('apertura');
    expect(d[0].numero).toBe(1);
    expect(cuadra(d[0])).toBe(true);
    // 2025: ingresos 1000 − gastos 500 = 500 de beneficio.
    expect(linea(d[0], '12000000')?.haber).toBe(500);
    expect(d.map(a => a.numero)).toEqual(d.map((_, i) => i + 1));
  });

  it('pérdidas y ganancias del año, sin arrastrar el anterior', () => {
    const pyg = perdidasYGanancias(diarioDelEjercicio(todos, 2026));
    expect(pyg.ingresos).toBe(1000);
    expect(pyg.gastos).toBe(500);
    expect(pyg.resultadoAntesDeImpuestos).toBe(500);
  });

  it('el balance cuadra', () => {
    const b = balance(diarioDelEjercicio(todos, 2026));
    expect(b.cuadra).toBe(true);
    expect(b.totalActivo).toBeGreaterThan(0);
  });

  it('mayor de clientes con saldo acumulado', () => {
    const m = libroMayor(diarioDelEjercicio(todos, 2026), '430');
    expect(m.at(-1)?.saldo).toBe(2420);
  });

  it('cuadres: diario, balance, clientes e IVA', () => {
    const d = diarioDelEjercicio(todos, 2026);
    const c = cuadres(d, 2026, { impuesto: 'IVA', pendienteDeCobro: 2420, impuestoDevengadoModelo: 210 });
    expect(c.find(x => x.id === 'diario')?.estado).toBe('ok');
    expect(c.find(x => x.id === 'balance')?.estado).toBe('ok');
    expect(c.find(x => x.id === 'clientes')?.estado).toBe('ok');
    expect(c.find(x => x.id === 'impuesto')?.estado).toBe('ok');
    const mal = cuadres(d, 2026, { impuesto: 'IVA', pendienteDeCobro: 0, impuestoDevengadoModelo: 0 });
    expect(mal.find(x => x.id === 'clientes')?.estado).toBe('aviso');
    expect(mal.find(x => x.id === 'impuesto')?.estado).toBe('aviso');
  });

  it('CSV del diario con coma decimal y fecha española', () => {
    const texto = diarioCsv(diarioDelEjercicio(todos, 2026), c => c);
    expect(texto.split('\r\n')[0]).toBe('Asiento;Fecha;Cuenta;Nombre de la cuenta;Concepto;Documento;Debe;Haber');
    expect(texto).toMatch(/;10\/02\/2026;43000001;/);
    expect(texto).toMatch(/;1210,00;0,00/);
  });
});
