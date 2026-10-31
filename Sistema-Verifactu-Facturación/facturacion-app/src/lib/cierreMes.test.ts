/* eslint-disable @typescript-eslint/no-explicit-any -- datos de prueba a medias */
import { describe, it, expect } from 'vitest';
import {
  mesMas, nombreMes, mesPropuesto, borradoresOlvidados, albaranesSinFacturar, vencidasAlCierre,
  movimientosPorConciliar, proveedoresQueFaltan, resumenImpuestoMes, montarCierre, leerRevisados,
  marcarRevisado, claveRevisados, mesesElegibles, type IdPunto, type AlmacenTexto,
} from './cierreMes';

const hoy = new Date(2026, 9, 31, 12); // 31 de octubre de 2026

const doc = (id: string, extra: Record<string, unknown> = {}) => ({
  id, number: `F-${id}`, tipo: 'factura', sentido: 'venta', status: 'emitida', clientId: 'c1', clientName: 'Bar Tenerife',
  issueDate: '2026-10-10', dueDate: '2026-10-20', subtotal: 100, totalTax: 7, total: 107, paidAmount: 0,
  taxBreakdown: [{ rate: 7, base: 100, amount: 7 }], lineItems: [], createdAt: '2026-10-10', updatedAt: '2026-10-10', ...extra,
}) as any;

const albaran = (id: string, extra: Record<string, unknown> = {}) => ({
  id, number: `ALB-${id}`, clientId: 'c1', clientName: 'Bar Tenerife', issueDate: '2026-10-05', status: 'expedido', total: 50,
  lineItems: [], createdAt: '2026-10-05', updatedAt: '2026-10-05', ...extra,
}) as any;

const gasto = (id: string, fecha: string, proveedor: string, base = 100, extra: Record<string, unknown> = {}) => ({
  id, fecha, concepto: 'x', categoria: 'suministros', proveedorId: proveedor, proveedorNombre: `Prov ${proveedor}`,
  baseImponible: base, taxRate: 7, taxAmount: base * 0.07, total: base * 1.07, ...extra,
}) as any;

describe('los meses', () => {
  it('se cuentan y se nombran', () => {
    expect(mesMas('2026-01', -1)).toBe('2025-12');
    expect(mesMas('2026-12', 1)).toBe('2027-01');
    expect(nombreMes('2026-10')).toBe('Octubre de 2026');
    expect(mesesElegibles(hoy)).toHaveLength(12);
    expect(mesesElegibles(hoy)[0]).toBe('2026-10');
  });

  it('a primeros de mes se propone cerrar el anterior', () => {
    expect(mesPropuesto(new Date(2026, 10, 4))).toBe('2026-10');
    expect(mesPropuesto(hoy)).toBe('2026-10');
  });
});

describe('borradores olvidados', () => {
  it('los de más de tres días sin tocar, hasta fin de mes, documentos y albaranes', () => {
    const docs = [
      doc('viejo', { status: 'borrador', updatedAt: '2026-10-20' }),
      doc('reciente', { status: 'borrador', updatedAt: '2026-10-30' }),
      doc('noviembre', { status: 'borrador', issueDate: '2026-11-02', updatedAt: '2026-10-01' }),
      doc('pedido', { status: 'borrador', tipo: 'pedido', sentido: 'compra', updatedAt: '2026-10-01' }),
      doc('emitida'),
    ];
    const lista = borradoresOlvidados(docs, [albaran('a', { status: 'borrador' })], '2026-10', hoy);
    expect(lista.map(b => [b.numero, b.tipo, b.href])).toEqual([
      ['F-pedido', 'Pedido de compra', '/documentos/pedido'],
      ['ALB-a', 'Albarán', '/albaranes/a'],
      ['F-viejo', 'Factura', '/facturas/viejo'],
    ]);
    expect(lista.find(b => b.id === 'viejo')).toMatchObject({ dias: 11, esFacturaVenta: true });
  });
});

describe('albaranes entregados sin facturar', () => {
  it('los expedidos hasta fin de mes, de las dos pantallas', () => {
    const albs = [albaran('a'), albaran('b', { status: 'facturado' }), albaran('c', { issueDate: '2026-11-01' }), albaran('d', { invoiceId: 'f' })];
    const docs = [doc('x', { tipo: 'albaran', status: 'expedido', issueDate: '2026-10-01' }), doc('y', { tipo: 'albaran', status: 'facturado' })];
    expect(albaranesSinFacturar(albs, docs, '2026-10').map(a => [a.numero, a.origen])).toEqual([['F-x', 'documento'], ['ALB-a', 'albaran']]);
  });
});

describe('vencidas al cerrar', () => {
  it('se miran a fin de mes, o a hoy si el mes no ha acabado', () => {
    const docs = [
      doc('1', { dueDate: '2026-10-20', status: 'pendiente' }),
      doc('2', { dueDate: '2026-10-31', status: 'pendiente' }),
      doc('3', { dueDate: '2026-10-01', status: 'pagada', paidAmount: 107 }),
    ];
    expect(vencidasAlCierre(docs, '2026-10', hoy)[0].facturas.map(v => v.factura.id)).toEqual(['1']);
    // Septiembre, mirado hoy: aún no vencía nada a 1 de octubre.
    expect(vencidasAlCierre(docs, '2026-09', hoy)).toEqual([]);
    // Octubre, mirado en diciembre: el del 31 también.
    expect(vencidasAlCierre(docs, '2026-10', new Date(2026, 11, 15))[0].facturas).toHaveLength(2);
  });
});

describe('banco', () => {
  it('los movimientos del mes sin casar ni apartar', () => {
    const movs = [
      { id: 'a', fecha: '2026-10-05', importe: 10, concepto: '', ignorado: false, conciliado: null },
      { id: 'b', fecha: '2026-10-06', importe: 10, concepto: '', ignorado: false, conciliado: 'Cobro C-1' },
      { id: 'c', fecha: '2026-10-07', importe: 10, concepto: '', ignorado: true, conciliado: null },
      { id: 'd', fecha: '2026-09-30', importe: 10, concepto: '', ignorado: false, conciliado: null },
    ];
    expect(movimientosPorConciliar(movs, '2026-10').map(m => m.id)).toEqual(['a']);
  });
});

describe('proveedores que este mes faltan', () => {
  it('los de dos de los tres meses anteriores que este mes no han facturado', () => {
    const gastos = [
      gasto('1', '2026-07-05', 'luz', 100), gasto('2', '2026-08-05', 'luz', 120), gasto('3', '2026-09-05', 'luz', 140),
      gasto('4', '2026-08-05', 'agua', 30), gasto('5', '2026-09-05', 'agua', 30), gasto('6', '2026-10-05', 'agua', 30),
      gasto('7', '2026-09-05', 'una-vez', 500),
    ];
    const compras = [
      doc('c1', { sentido: 'compra', clientId: 'mayorista', clientName: 'Mayorista', issueDate: '2026-08-10', subtotal: 1000 }),
      doc('c2', { sentido: 'compra', clientId: 'mayorista', clientName: 'Mayorista', issueDate: '2026-09-10', subtotal: 2000 }),
    ];
    const faltan = proveedoresQueFaltan(gastos, compras, '2026-10');
    expect(faltan.map(f => [f.nombre, f.meses, f.importeMedio])).toEqual([['Mayorista', 2, 1500], ['Prov luz', 3, 120]]);
  });
});

describe('el impuesto del mes', () => {
  const docs = [
    doc('1', { issueDate: '2026-10-10' }),
    doc('2', { issueDate: '2026-09-10' }),
    doc('3', { status: 'borrador' }),
    doc('4', { sentido: 'compra', subtotal: 50, totalTax: 3.5, taxBreakdown: [{ rate: 7, base: 50, amount: 3.5 }] }),
  ];
  const gastos = [gasto('g', '2026-10-02', 'luz', 20)];

  it('con el cálculo del 420, sólo lo del mes', () => {
    expect(resumenImpuestoMes(docs, gastos, '2026-10', true)).toMatchObject({
      impuesto: 'IGIC', repercutido: 7, deducible: 4.9, resultado: 2.1, numFacturas: 2, numGastos: 1,
    });
  });

  it('en la península, con el del 303', () => {
    expect(resumenImpuestoMes(docs, gastos, '2026-10', false)).toMatchObject({ impuesto: 'IVA', repercutido: 7 });
  });
});

describe('la lista del cierre', () => {
  it('cada punto en verde o en ámbar y el progreso', () => {
    const c = montarCierre({ borradores: 2, albaranes: 0, vencidas: 1, banco: 0, gastos: 0, revisados: new Set() });
    expect(c.puntos.map(p => [p.id, p.estado])).toEqual([
      ['borradores', 'pendiente'], ['albaranes', 'listo'], ['vencidas', 'pendiente'],
      ['banco', 'listo'], ['gastos', 'listo'], ['impuesto', 'pendiente'],
    ]);
    expect(c).toMatchObject({ hechos: 3, total: 6, progreso: 50 });
  });

  it('sin banco conectado ese punto no cuenta; lo revisado a mano cuenta como hecho', () => {
    const revisados = new Set<IdPunto>(['vencidas', 'impuesto', 'borradores']);
    const c = montarCierre({ borradores: 1, albaranes: 0, vencidas: 4, banco: null, gastos: 0, revisados });
    expect(c.puntos.find(p => p.id === 'banco')?.estado).toBe('sin_datos');
    // Un borrador no se da por bueno a mano: se emite o se borra.
    expect(c.puntos.find(p => p.id === 'borradores')?.estado).toBe('pendiente');
    expect(c).toMatchObject({ hechos: 4, total: 5, progreso: 80 });
  });
});

describe('lo revisado se recuerda por cuenta y por mes', () => {
  const memoria = (): AlmacenTexto & { datos: Map<string, string> } => {
    const datos = new Map<string, string>();
    return { datos, getItem: k => datos.get(k) ?? null, setItem: (k, v) => { datos.set(k, v); } };
  };

  it('se guarda, se lee y se quita', () => {
    const m = memoria();
    marcarRevisado('u1', '2026-10', 'gastos', true, m);
    expect([...leerRevisados('u1', '2026-10', m)]).toEqual(['gastos']);
    expect(leerRevisados('u2', '2026-10', m).size).toBe(0);
    expect(leerRevisados('u1', '2026-09', m).size).toBe(0);
    marcarRevisado('u1', '2026-10', 'gastos', false, m);
    expect(leerRevisados('u1', '2026-10', m).size).toBe(0);
  });

  it('lo que no es revisable, o lo guardado roto, no cuenta', () => {
    const m = memoria();
    expect([...marcarRevisado('u1', '2026-10', 'borradores', true, m)]).toEqual([]);
    m.setItem(claveRevisados('u1'), '{roto');
    expect(leerRevisados('u1', '2026-10', m).size).toBe(0);
  });

  it('sin almacenamiento sigue funcionando', () => {
    const roto: AlmacenTexto = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('lleno'); } };
    expect(leerRevisados('u1', '2026-10', roto).size).toBe(0);
    expect([...marcarRevisado('u1', '2026-10', 'gastos', true, roto)]).toEqual(['gastos']);
    expect(leerRevisados('u1', '2026-10', null).size).toBe(0);
  });
});
