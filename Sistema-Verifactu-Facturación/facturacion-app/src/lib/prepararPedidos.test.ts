import { describe, it, expect } from 'vitest';
import {
  CLAVE_PREPARADO, albaranDeEntrega, colaDeAlmacen, conMarcaPreparado, enCajas,
  hojaDeCarga, lineasPendientesDePedido, marcaPreparado, ordenarCola, paradasDe, totalesDePedido,
  type PedidoEnCola,
} from './prepararPedidos';
import { calcularPendientesProducto } from './documentos';
import { InvoiceStatus, UnitOfMeasure, type Albaran, type Client, type CompanySettings, type Invoice, type InvoiceLineItem } from './types';

const linea = (extra: Partial<InvoiceLineItem> = {}): InvoiceLineItem => ({
  id: crypto.randomUUID(), productId: 'p1', productName: 'Cerveza lata 33cl', productRef: 'R1',
  quantity: 24, unitPrice: 1, unit: UnitOfMeasure.UNIDAD, taxRate: 7, discountPercent: 0,
  subtotal: 24, taxAmount: 1.68, total: 25.68, ...extra,
});

let n = 0;
const doc = (extra: Partial<Invoice> = {}): Invoice => ({
  id: `d${++n}`, number: `PED-${n}`, series: 'PED',
  clientId: 'c1', clientName: 'Bar Pepe', clientNif: '', clientAddress: 'C/ Real 1',
  issueDate: '2026-10-30', dueDate: '2026-10-30',
  status: InvoiceStatus.EMITIDA, lineItems: [linea()],
  subtotal: 24, totalDiscount: 0, taxBreakdown: [], totalTax: 1.68, total: 25.68,
  paymentMethod: 'transferencia' as never, notes: '',
  tipo: 'pedido', sentido: 'venta',
  createdAt: '2026-10-30T08:00:00Z', updatedAt: '2026-10-30T08:00:00Z',
  ...extra,
});

const cliente = (id: string, extra: Partial<Client> = {}): Client => ({
  id, nif: '', businessName: `Cliente ${id}`, tradeName: '', email: '', phone: '', contactPerson: '',
  address: '', city: '', postalCode: '', province: '', country: 'España', paymentDays: 0,
  defaultPaymentMethod: 'transferencia' as never, notes: '', active: true,
  createdAt: '', updatedAt: '', ...extra,
});

const cola = (documentos: Invoice[], extra: { albaranes?: Albaran[]; clientes?: Client[] } = {}) =>
  colaDeAlmacen({ documentos, albaranes: extra.albaranes, clientes: extra.clientes ?? [cliente('c1')] });

describe('la marca de preparado', () => {
  it('va y vuelve por datosExtras sin tocar lo demás', () => {
    const extras = { custom_1: 'Muelle 2', __lineas: '{}' };
    const con = conMarcaPreparado(extras, { en: '2026-10-31T09:00:00Z', por: 'Ana' });
    expect(con.custom_1).toBe('Muelle 2');
    expect(marcaPreparado(con)).toEqual({ en: '2026-10-31T09:00:00Z', por: 'Ana' });
    const sin = conMarcaPreparado(con, null);
    expect(sin).toEqual(extras);
    expect(CLAVE_PREPARADO in sin).toBe(false);
  });

  it('una marca rota o vacía es «sin preparar», no un error', () => {
    expect(marcaPreparado({ [CLAVE_PREPARADO]: 'no es json' })).toBeNull();
    expect(marcaPreparado({ [CLAVE_PREPARADO]: '{}' })).toBeNull();
    expect(marcaPreparado(undefined)).toBeNull();
  });
});

describe('enCajas', () => {
  it('cajas completas y sueltas, como se coge del palé', () => {
    expect(enCajas(51, 24)).toEqual({ cajas: 2, sueltas: 3 });
    expect(enCajas(48, 24)).toEqual({ cajas: 2, sueltas: 0 });
    expect(enCajas(10, 24)).toEqual({ cajas: 0, sueltas: 10 });
  });
  it('sin unidades por caja (o de 1) todo son sueltas', () => {
    expect(enCajas(7, null)).toEqual({ cajas: 0, sueltas: 7 });
    expect(enCajas(7, 1)).toEqual({ cajas: 0, sueltas: 7 });
  });
});

describe('qué entra en la cola', () => {
  it('pedidos emitidos o aprobados y albaranes de venta sin expedir', () => {
    const docs = [
      doc({ id: 'emitido' }),
      doc({ id: 'aprobado', status: InvoiceStatus.APROBADO }),
      doc({ id: 'borrador', status: InvoiceStatus.BORRADOR }),
      doc({ id: 'espera', status: InvoiceStatus.PRE_APROBACION }),
      doc({ id: 'anulado', status: InvoiceStatus.ANULADA }),
      doc({ id: 'alb', tipo: 'albaran', status: InvoiceStatus.BORRADOR }),
      doc({ id: 'alb-expedido', tipo: 'albaran', status: InvoiceStatus.EXPEDIDO }),
      doc({ id: 'compra', sentido: 'compra' }),
      doc({ id: 'factura', tipo: 'factura', status: InvoiceStatus.BORRADOR }),
    ];
    expect(cola(docs).map(p => p.id).sort()).toEqual(['alb', 'aprobado', 'emitido']);
  });

  it('también los albaranes de entrega de su propia tabla, sólo en borrador', () => {
    const alb = (id: string, status: Albaran['status']): Albaran => ({
      id, number: id, series: 'ALB', clientId: 'c1', clientName: 'Bar Pepe', clientNif: '', clientAddress: '',
      issueDate: '2026-10-30', status, lineItems: [linea()], subtotal: 0, totalDiscount: 0, taxBreakdown: [],
      totalTax: 0, total: 0, notes: '', createdAt: '', updatedAt: '',
    });
    const c = cola([], { albaranes: [alb('a1', 'borrador'), alb('a2', 'expedido')] });
    expect(c.map(p => [p.id, p.origen, p.tipo])).toEqual([['a1', 'albaran', 'albaran']]);
  });

  it('un documento sin líneas con artículo no se prepara', () => {
    expect(cola([doc({ lineItems: [linea({ productId: '', productName: '  ' })] })])).toEqual([]);
  });

  it('un pedido servido del todo sale de la cola; servido a medias, pide lo que falta', () => {
    const servido = doc({ id: 'p-servido' });
    const medias = doc({ id: 'p-medias', lineItems: [linea({ quantity: 24 })] });
    const docs = [
      servido, medias,
      doc({ tipo: 'albaran', status: InvoiceStatus.EXPEDIDO, documentoOrigenId: 'p-servido', lineItems: [linea({ quantity: 24 })] }),
      doc({ tipo: 'albaran', status: InvoiceStatus.EXPEDIDO, documentoOrigenId: 'p-medias', lineItems: [linea({ quantity: 10 })] }),
    ];
    const c = cola(docs);
    expect(c.map(p => p.id)).toEqual(['p-medias']);
    expect(c[0].lineas[0].unidades).toBe(14);
    // Y dice lo mismo que lo pendiente de entregar del artículo.
    expect(calcularPendientesProducto('p1', docs).pendienteEntregar).toBe(14);
  });

  it('cada línea en cajas y sueltas según la U/C, también las de antes', () => {
    const c = cola([doc({ lineItems: [
      linea({ id: 'nueva', quantity: 51, cajas: 2, unitsPerPackage: 24 }),
      // Línea de antes: la cantidad eran las cajas (3 cajas de 12).
      linea({ id: 'antigua', productId: 'p2', quantity: 3, unitsPerPackage: 12 }),
      linea({ id: 'suelta', productId: 'p3', quantity: 5 }),
    ] })])[0];
    const por = Object.fromEntries(c.lineas.map(l => [l.id, [l.cajas, l.sueltas, l.unidades, l.udsCaja]]));
    expect(por).toEqual({ nueva: [2, 3, 51, 24], antigua: [3, 0, 36, 12], suelta: [0, 5, 5, null] });
    expect(totalesDePedido(c)).toEqual({ cajas: 5, unidades: 92 });
  });

  it('lleva el cliente, su dirección, el número de líneas y la marca de preparado', () => {
    const [p] = cola([doc({ lineItems: [linea(), linea({ productId: 'p2' })], datosExtras: conMarcaPreparado({}, { en: '2026-10-31T10:00:00Z' }) })]);
    expect(p.cliente).toBe('Bar Pepe');
    expect(p.direccion).toBe('C/ Real 1');
    expect(p.lineas).toHaveLength(2);
    expect(p.preparado?.en).toBe('2026-10-31T10:00:00Z');
  });

  it('sin dirección en el documento, la de la ficha del cliente (la parada no queda en blanco)', () => {
    const [p] = cola([doc({ clientAddress: '' })], { clientes: [cliente('c1', { address: 'Av. Mancomunidad 3', city: 'Arrecife' })] });
    expect(p.direccion).toBe('Av. Mancomunidad 3, Arrecife');
  });
});

describe('lineasPendientesDePedido', () => {
  it('con el artículo en dos líneas, lo servido se descuenta de la primera y lo que sobra de la segunda', () => {
    const pedido = doc({ id: 'p', lineItems: [linea({ id: 'a', quantity: 10 }), linea({ id: 'b', quantity: 10 })] });
    const entrega = doc({ tipo: 'albaran', documentoOrigenId: 'p', lineItems: [linea({ quantity: 14 })] });
    const quedan = lineasPendientesDePedido(pedido, [pedido, entrega]);
    expect(quedan.map(l => [l.id, l.quantity])).toEqual([['b', 6]]);
  });

  it('la línea que queda a medias se recalcula, con sus cajas ajustadas', () => {
    const pedido = doc({ id: 'p', lineItems: [linea({ quantity: 48, cajas: 2, unitsPerPackage: 24, unitPrice: 1 })] });
    const entrega = doc({ tipo: 'albaran', documentoOrigenId: 'p', lineItems: [linea({ quantity: 30 })] });
    const [l] = lineasPendientesDePedido(pedido, [pedido, entrega]);
    expect([l.quantity, l.cajas, l.subtotal]).toEqual([18, 0, 18]);
  });
});

describe('albaranDeEntrega', () => {
  const settings = { seriesDocumentos: {} } as unknown as CompanySettings;

  it('sale con lo que falta, la fecha de hoy y enganchado a ESTE pedido', () => {
    const pedido = doc({ id: 'p', documentoOrigenId: 'presupuesto', documentoOrigenNumber: 'PRE-1', lineItems: [linea({ quantity: 24 })] });
    const entrega = doc({ tipo: 'albaran', status: InvoiceStatus.EXPEDIDO, documentoOrigenId: 'p', lineItems: [linea({ quantity: 4 })] });
    const alb = albaranDeEntrega(pedido, [pedido, entrega], settings, '2026-10-31');
    expect(alb.tipo).toBe('albaran');
    expect(alb.status).toBe(InvoiceStatus.BORRADOR);
    expect(alb.issueDate).toBe('2026-10-31');
    expect([alb.documentoOrigenId, alb.documentoOrigenNumber]).toEqual(['p', pedido.number]);
    expect(alb.lineItems.map(l => l.quantity)).toEqual([20]);
    expect(alb.lineItems[0].id).not.toBe(pedido.lineItems[0].id);
    // Con él guardado, el pedido ya no queda pendiente.
    expect(cola([pedido, entrega, { ...alb, status: InvoiceStatus.EXPEDIDO }])).toEqual([]);
  });
});

describe('ordenar', () => {
  const p = (id: string, fecha: string, creado: string): PedidoEnCola => ({
    origen: 'documento', id, tipo: 'pedido', numero: id, clienteId: id, cliente: id, direccion: '',
    fecha, creado, lineas: [], preparado: null, notas: '',
  });

  it('por fecha (y a igual fecha, el que llegó antes) o por orden de llegada', () => {
    const lista = [p('b', '2026-10-30', '2026-10-30T12:00'), p('a', '2026-10-30', '2026-10-30T08:00'), p('c', '2026-10-29', '2026-10-31T07:00')];
    expect(ordenarCola(lista, 'fecha').map(x => x.id)).toEqual(['c', 'a', 'b']);
    expect(ordenarCola(lista, 'llegada').map(x => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('la cola es una sola lista: nada de rutas', () => {
    const [q] = cola([doc({})]);
    expect('ruta' in q).toBe(false);
  });
});

describe('hojaDeCarga', () => {
  it('suma por artículo antes de pasar a cajas, y cuenta paradas por cliente', () => {
    const docs = [
      doc({ id: 'x', clientId: 'c1', lineItems: [linea({ quantity: 18, cajas: 0, unitsPerPackage: 24 })] }),
      doc({ id: 'y', clientId: 'c1', lineItems: [linea({ quantity: 18, cajas: 0, unitsPerPackage: 24 }), linea({ productId: 'p2', productName: 'Agua', quantity: 6 })] }),
      doc({ id: 'z', clientId: 'c2', clientName: 'Hotel Sol', lineItems: [linea({ quantity: 24, cajas: 1, unitsPerPackage: 24 })] }),
    ];
    const h = hojaDeCarga(cola(docs, { clientes: [cliente('c1'), cliente('c2')] }));
    expect(h.filas.map(f => [f.nombre, f.unidades, f.cajas, f.sueltas, f.pedidos])).toEqual([
      ['Agua', 6, 0, 6, 1],
      ['Cerveza lata 33cl', 60, 2, 12, 3],
    ]);
    expect([h.pedidos, h.paradas, h.cajas, h.unidades]).toEqual([3, 2, 2, 66]);
  });

  it('el mismo artículo en cajas de distinto tamaño va en filas distintas', () => {
    const h = hojaDeCarga(cola([doc({ lineItems: [
      linea({ quantity: 24, cajas: 1, unitsPerPackage: 24 }),
      linea({ quantity: 12, cajas: 1, unitsPerPackage: 12 }),
    ] })]));
    expect(h.filas.map(f => [f.udsCaja, f.cajas])).toEqual([[24, 1], [12, 1]]);
  });

  it('las paradas juntan los documentos de cada cliente', () => {
    const c = cola([doc({ number: 'PED-1' }), doc({ number: 'PED-2' }), doc({ number: 'PED-3', clientId: 'c2', clientName: 'Hotel Sol' })], { clientes: [cliente('c1'), cliente('c2')] });
    expect(paradasDe(c).map(x => [x.cliente, x.direccion, x.numeros])).toEqual([['Bar Pepe', 'C/ Real 1', ['PED-1', 'PED-2']], ['Hotel Sol', 'C/ Real 1', ['PED-3']]]);
  });
});
