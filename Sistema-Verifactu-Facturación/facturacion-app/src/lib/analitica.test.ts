import { describe, it, expect } from 'vitest';
import {
  acumuladoDelAnio, facturadoYCobrado, formasDePago,
  antiguedadDeuda, cifrasAnalisis, claveDia, estadoCobro, fechaLocal, mapaSemanal,
  puntualidadClientes, rankingClientes, ritmoDelMes, ventasPorCategoria, ventasPorDia,
  MAX_CATEGORIAS,
} from './analitica';
import { InvoiceStatus, type Invoice, type Product } from './types';

const factura = (extra: Partial<Invoice> = {}): Invoice => ({
  id: crypto.randomUUID(), number: 'FAC-1', series: 'FAC',
  clientId: 'c1', clientName: 'Cliente', clientNif: '',
  clientAddress: '', issueDate: '2026-06-10', dueDate: '2026-07-10',
  status: InvoiceStatus.EMITIDA, lineItems: [],
  subtotal: 100, totalDiscount: 0, totalTax: 21, total: 121,
  paymentMethod: 'transferencia' as never, notes: '',
  createdAt: '2026-06-10T00:00:00Z', updatedAt: '2026-06-10T00:00:00Z',
  ...extra,
} as Invoice);

/** Miércoles 24 de junio de 2026. */
const HOY = new Date(2026, 5, 24);

describe('fechaLocal', () => {
  it('lee «AAAA-MM-DD» como día local, no como medianoche UTC', () => {
    const d = fechaLocal('2026-03-01')!;
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 2, 1]);
    expect(claveDia(d)).toBe('2026-03-01');
  });

  it('una fecha vacía o rota no es una fecha', () => {
    expect(fechaLocal('')).toBeNull();
    expect(fechaLocal('mañana')).toBeNull();
  });
});

describe('ritmoDelMes', () => {
  it('proyecta el mes al paso que lleva', () => {
    const r = ritmoDelMes([factura({ issueDate: '2026-06-02', total: 1200 })], HOY);
    expect(r.facturado.actual).toBe(1200);
    // 1200 € en 24 días → 50 €/día → 1500 € en 30 días.
    expect(r.facturado.proyeccion).toBe(1500);
  });

  it('compara con el mes pasado, el mismo mes del año pasado y la media de doce', () => {
    const r = ritmoDelMes([
      factura({ issueDate: '2026-05-15', total: 600 }),
      factura({ issueDate: '2025-06-15', total: 900 }),
      factura({ issueDate: '2025-07-15', total: 600 }),
      factura({ issueDate: '2025-05-15', total: 5000 }),
    ], HOY);
    expect(r.facturado.mesAnterior).toBe(600);
    expect(r.facturado.mismoMesAnioPasado).toBe(900);
    // Jun-25 … May-26 son los doce anteriores; may-25 ya queda fuera.
    expect(r.facturado.mediaDoceMeses).toBe(175);
    expect(r.facturado.mejorDoceMeses).toBe(900);
  });

  it('los borradores y las anuladas no son venta', () => {
    const r = ritmoDelMes([
      factura({ status: InvoiceStatus.BORRADOR, issueDate: '2026-06-02' }),
      factura({ status: InvoiceStatus.ANULADA, issueDate: '2026-06-02' }),
    ], HOY);
    expect(r.facturado.actual).toBe(0);
  });

  it('lo cobrado cuenta por el día en que entró el dinero', () => {
    const r = ritmoDelMes([
      factura({ issueDate: '2026-04-01', status: InvoiceStatus.PAGADA, paidDate: '2026-06-03', total: 300 }),
    ], HOY);
    expect(r.cobrado.actual).toBe(300);
    expect(r.cobrado.proyeccion).toBe(300);
    expect(r.facturado.actual).toBe(0);
  });
});

describe('ventasPorDia', () => {
  it('arranca en lunes y acaba mañana (Nivo no incluye el último día)', () => {
    const r = ventasPorDia([], HOY);
    expect(r.desde.getDay()).toBe(1);
    expect(claveDia(r.hasta)).toBe('2026-06-25');
  });

  it('suma el día y deja fuera los días sin venta', () => {
    const r = ventasPorDia([
      factura({ issueDate: '2026-06-01', total: 100 }),
      factura({ issueDate: '2026-06-01', total: 50 }),
      factura({ issueDate: '2026-06-03', total: 10 }),
    ], HOY);
    expect(r.dias).toEqual([
      { day: '2026-06-01', value: 150, facturas: 2 },
      { day: '2026-06-03', value: 10, facturas: 1 },
    ]);
    expect(r.diasConVenta).toBe(2);
    expect(r.mejorDia?.day).toBe('2026-06-01');
  });
});

describe('mapaSemanal', () => {
  it('siete filas de lunes a domingo, una columna por mes', () => {
    const filas = mapaSemanal([], HOY, 6);
    expect(filas.map(f => f.id)).toEqual(['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']);
    expect(filas[0].data.map(c => c.x)).toEqual(['Ene 26', 'Feb 26', 'Mar 26', 'Abr 26', 'May 26', 'Jun 26']);
  });

  it('da la venta MEDIA de ese día de la semana, no la suma', () => {
    // Junio de 2026 hasta el 24: lunes 1, 8, 15 y 22 → cuatro lunes.
    const filas = mapaSemanal([
      factura({ issueDate: '2026-06-01', total: 400 }),
      factura({ issueDate: '2026-06-08', total: 400 }),
    ], HOY, 1);
    const lunes = filas[0].data[0];
    expect(lunes.dias).toBe(4);
    expect(lunes.total).toBe(800);
    expect(lunes.y).toBe(200);
  });

  it('en el mes en curso no cuenta los días que aún no han llegado', () => {
    // Del 25 al 30 de junio: jueves 25 aún no ha llegado → tres jueves (4, 11, 18).
    const jueves = mapaSemanal([], HOY, 1)[3].data[0];
    expect(jueves.dias).toBe(3);
  });
});

describe('estadoCobro', () => {
  it('reparte lo facturado entre cobrado, pendiente y vencido', () => {
    const r = estadoCobro([
      factura({ status: InvoiceStatus.PAGADA, total: 500 }),
      factura({ status: InvoiceStatus.EMITIDA, dueDate: '2026-07-01', total: 300 }),
      factura({ status: InvoiceStatus.PENDIENTE, dueDate: '2026-06-01', total: 200 }),
      factura({ status: InvoiceStatus.VENCIDA, total: 100 }),
    ], HOY);
    expect(r).toEqual({ cobrado: 500, pendiente: 300, vencido: 300, total: 1100 });
  });
});

describe('antiguedadDeuda', () => {
  it('coloca cada deuda en su tramo de retraso', () => {
    const t = antiguedadDeuda([
      factura({ dueDate: '2026-07-01', total: 1 }),
      factura({ dueDate: '2026-06-10', total: 2 }),
      factura({ dueDate: '2026-05-10', total: 4 }),
      factura({ dueDate: '2026-04-10', total: 8 }),
      factura({ dueDate: '2026-01-10', total: 16 }),
      factura({ status: InvoiceStatus.PAGADA, dueDate: '2026-01-10', total: 999 }),
    ], HOY);
    expect(t.map(x => x.importe)).toEqual([1, 2, 4, 8, 16]);
  });
});

describe('puntualidadClientes', () => {
  it('días medios entre emitir y cobrar, sólo de los clientes que han pagado algo', () => {
    const r = puntualidadClientes([
      factura({ clientId: 'a', clientName: 'A', issueDate: '2026-05-01', status: InvoiceStatus.PAGADA, paidDate: '2026-05-11', total: 100 }),
      factura({ clientId: 'a', clientName: 'A', issueDate: '2026-05-01', status: InvoiceStatus.PAGADA, paidDate: '2026-05-31', total: 100 }),
      factura({ clientId: 'b', clientName: 'B', issueDate: '2026-05-01', total: 900 }),
    ], HOY);
    expect(r).toEqual([{ id: 'a', nombre: 'A', diasMedios: 20, facturado: 200, facturasCobradas: 2 }]);
  });
});

describe('rankingClientes', () => {
  it('los mejores del periodo, con su puesto mes a mes entre ellos', () => {
    const r = rankingClientes([
      factura({ clientId: 'a', clientName: 'A', issueDate: '2026-05-05', total: 1000 }),
      factura({ clientId: 'b', clientName: 'B', issueDate: '2026-05-05', total: 100 }),
      factura({ clientId: 'b', clientName: 'B', issueDate: '2026-06-05', total: 500 }),
    ], HOY, 2);
    expect(r.map(s => s.id)).toEqual(['a', 'b']);
    expect(r[0].data).toEqual([
      { x: 'May 26', y: 1, importe: 1000 },
      { x: 'Jun 26', y: null, importe: 0 },
    ]);
    expect(r[1].data.map(p => p.y)).toEqual([2, 1]);
  });

  it('no pasa de los que se piden', () => {
    const muchas = Array.from({ length: 9 }, (_, i) =>
      factura({ clientId: `c${i}`, clientName: `C${i}`, issueDate: '2026-06-01', total: i + 1 }));
    expect(rankingClientes(muchas, HOY, 6, 5)).toHaveLength(5);
  });
});

describe('ventasPorCategoria', () => {
  const producto = (id: string, category: string) => ({ id, category } as Product);

  it('agrupa por categoría del producto, con la base de la línea', () => {
    const arbol = ventasPorCategoria([
      factura({
        issueDate: '2026-06-01',
        lineItems: [
          { productId: 'p1', productName: 'Tomate', subtotal: 10, total: 12.1 },
          { productId: 'p2', productName: 'Leche', subtotal: 5, total: 6.05 },
          { productId: 'x', productName: 'Suelto', subtotal: 1, total: 1.21 },
        ] as never,
      }),
    ], [producto('p1', 'verduras'), producto('p2', 'lacteos')], HOY);
    expect(arbol.children?.map(c => [c.nombre, c.children?.[0].value])).toEqual([
      ['Verduras', 10], ['Lacteos', 5], ['Sin categoría', 1],
    ]);
  });

  it('nunca pasa de seis categorías: el resto va a «Otras»', () => {
    const lineas = Array.from({ length: 9 }, (_, i) => ({ productId: `p${i}`, productName: `P${i}`, subtotal: 10 - i, total: 10 - i }));
    const productos = lineas.map((l, i) => producto(l.productId, `cat${i}`));
    const arbol = ventasPorCategoria([factura({ issueDate: '2026-06-01', lineItems: lineas as never })], productos, HOY);
    expect(arbol.children).toHaveLength(MAX_CATEGORIAS);
    expect(arbol.children?.at(-1)?.nombre).toBe('Otras');
  });
});

describe('cifrasAnalisis', () => {
  it('ticket medio, clientes activos y nuevos, y porcentaje cobrado', () => {
    const c = cifrasAnalisis([
      factura({ clientId: 'a', issueDate: '2026-06-01', total: 100, status: InvoiceStatus.PAGADA, paidDate: '2026-06-11' }),
      factura({ clientId: 'b', issueDate: '2026-06-02', total: 300 }),
      factura({ clientId: 'c', issueDate: '2025-01-02', total: 300 }),
    ], HOY);
    expect(c.ticketMedio).toBe(200);
    expect(c.facturas).toBe(2);
    expect(c.clientesActivos).toBe(2);
    expect(c.clientesNuevos).toBe(2);
    expect(c.diasMediosCobro).toBe(10);
    expect(c.porcentajeCobrado).toBe(25);
  });
});

describe('facturadoYCobrado', () => {
  it('lo emitido cuenta el mes de la factura; lo cobrado, el mes del cobro', () => {
    const r = facturadoYCobrado([
      factura({ issueDate: '2026-05-20', total: 100, status: InvoiceStatus.PAGADA, paidDate: '2026-06-02' }),
      factura({ issueDate: '2026-06-01', total: 50 }),
    ], HOY, 2);
    expect(r).toEqual([
      { name: 'May', series1: 100, series2: 0 },
      { name: 'Jun', series1: 50, series2: 100 },
    ]);
  });
});

describe('formasDePago', () => {
  it('suma por forma de pago, de más a menos', () => {
    const r = formasDePago([
      factura({ paymentMethod: 'bizum' as never, total: 10 }),
      factura({ paymentMethod: 'transferencia' as never, total: 100 }),
      factura({ paymentMethod: 'bizum' as never, total: 10 }),
    ], HOY);
    expect(r).toEqual([
      { metodo: 'transferencia', total: 100, facturas: 1 },
      { metodo: 'bizum', total: 20, facturas: 2 },
    ]);
  });
});

describe('acumuladoDelAnio', () => {
  it('acumula desde enero y deja vacíos los meses que no han llegado', () => {
    const r = acumuladoDelAnio([
      factura({ issueDate: '2026-01-10', total: 100 }),
      factura({ issueDate: '2026-03-10', total: 50 }),
      factura({ issueDate: '2025-02-10', total: 70 }),
      factura({ issueDate: '2025-11-10', total: 30 }),
    ], HOY);
    expect(r[0]).toEqual({ name: 'Ene', actual: 100, anterior: 0 });
    expect(r[2]).toEqual({ name: 'Mar', actual: 150, anterior: 70 });
    expect(r[5].actual).toBe(150);
    expect(r[6].actual).toBeNull();
    expect(r[11].anterior).toBe(100);
  });
});
