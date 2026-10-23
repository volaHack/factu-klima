import { describe, it, expect } from 'vitest';

import {
  FICHAS_POR_BUSQUEDA, busquedaEnListado, claveDeDocumento, condicionesDeBusqueda, documentoDeFila, estadoDeHistorico,
  fichasQueCasan, filaListadoDe, filaResumenDe, filtroAlcanzaHistorial, mezclarOrdenadas, numeroVisible, partesDeClave,
  quedoPendiente, resumenGeneral, resumenHistorico, textoParaFiltro, tipoYEstado, type DocumentoHistorico, type FilaResumenHistorico,
} from './historico';

const doc = (o: Partial<DocumentoHistorico>): DocumentoHistorico => ({
  id: 'x', origen: 'isecan', tipo: 'factura_venta', serie: '26', numero: '26000001', fecha: '2026-01-02',
  clientId: null, codigoTercero: null,
  base: 100, impuestos: 7, total: 107, bases: [], formaPago: null, observaciones: null, pasaA: [], ...o,
});

describe('número como lo conocían', () => {
  it('las facturas de ISECAN ya llevan el año en el número', () => {
    expect(numeroVisible({ serie: '24', numero: '24000001' })).toBe('24000001');
  });
  it('los pedidos no: serie delante', () => {
    expect(numeroVisible({ serie: 't24', numero: '100269' })).toBe('T24/100269');
    expect(numeroVisible({ serie: '', numero: '7' })).toBe('7');
  });
  it('un albarán cuyo número empieza como la serie también la lleva delante', () => {
    expect(numeroVisible({ serie: '25', numero: '25' })).toBe('25/25');
    expect(numeroVisible({ serie: '26', numero: '260' })).toBe('26/260');
    expect(numeroVisible({ serie: '26', numero: '1' })).toBe('26/1');
  });
});

describe('qué quedó pendiente', () => {
  it('un albarán sin documento posterior no se facturó', () => {
    expect(quedoPendiente(doc({ tipo: 'albaran_venta' }))).toBe(true);
    expect(quedoPendiente(doc({ tipo: 'albaran_compra', pasaA: ['factura_compra:25/16'] }))).toBe(false);
  });
  it('una factura nunca está «pendiente de facturar»', () => {
    expect(quedoPendiente(doc({ tipo: 'factura_venta' }))).toBe(false);
  });
});

describe('resumen de la ficha', () => {
  const docs = [
    doc({ fecha: '2026-03-01', total: 107 }),
    doc({ fecha: '2026-09-15', total: 53.5 }),
    doc({ fecha: '2025-12-31', total: 0.1 }),
    doc({ fecha: '2025-06-01', total: 0.2 }),
    doc({ tipo: 'albaran_venta', fecha: '2026-10-01', total: 20 }),
    doc({ tipo: 'albaran_venta', fecha: '2026-10-02', total: 30, pasaA: ['factura_venta:26/26000009'] }),
    doc({ tipo: 'pedido_venta', fecha: '2026-10-20', total: 5.55 }),
  ];
  const r = resumenHistorico(docs);

  it('facturas por año, la más reciente primero, sin errores de redondeo', () => {
    expect(r.anios).toEqual([
      { anio: '2026', facturas: 2, total: 160.5 },
      { anio: '2025', facturas: 2, total: 0.3 },
    ]);
  });
  it('la última factura es la de fecha más alta, no la de un albarán', () => {
    expect(r.ultimaFactura).toBe('2026-09-15');
  });
  it('albaranes sin facturar y pedidos sin servir, aparte', () => {
    expect(r.pendientes).toEqual({ albaranes: 1, pedidos: 1, total: 25.55 });
  });
  it('sin documentos, un resumen vacío', () => {
    expect(resumenHistorico([])).toEqual({ anios: [], ultimaFactura: null, pendientes: { albaranes: 0, pedidos: 0, total: 0 } });
  });
});

describe('fila de la base de datos', () => {
  it('numeric llega como texto y se pasa a número', () => {
    const d = documentoDeFila({ id: 'a', origen: 'isecan', tipo: 'factura_compra', serie: '25', numero: '25000016',
      fecha: '2025-03-06', base: '704.32', impuestos: '47.17', total: '751.49', bases: [{ tipo: 7, base: 704.32, cuota: 47.17 }],
      forma_pago: 'Efectivo', observaciones: null, pasa_a: null });
    expect(d.total).toBe(751.49);
    expect(d.pasaA).toEqual([]);
    expect(d.formaPago).toBe('Efectivo');
    expect(d.clientId).toBeNull();
  });
});

describe('el buscador del historial', () => {
  it('lo que partiría el filtro de PostgREST se quita', () => {
    expect(textoParaFiltro(' a,b(c)*d%e\\f"g ')).toBe('a b c  d e f g');
  });

  it('busca en el número, el código y las observaciones', () => {
    expect(condicionesDeBusqueda('4501')).toEqual([
      'numero.ilike.*4501*', 'codigo_tercero.ilike.*4501*', 'observaciones.ilike.*4501*',
    ]);
  });

  it('un pedido se escribe como se ve (T24/100269) y se busca por su número', () => {
    expect(condicionesDeBusqueda('T24/100269')[0]).toBe('numero.ilike.*100269*');
  });

  it('las fichas que casan por nombre entran, con tope', () => {
    const ids = Array.from({ length: FICHAS_POR_BUSQUEDA + 20 }, (_, i) => `id${i}`);
    const c = condicionesDeBusqueda('', ids);
    expect(c).toHaveLength(1);
    expect(c[0].startsWith('client_id.in.(id0,id1,')).toBe(true);
    expect(c[0].split(',')).toHaveLength(FICHAS_POR_BUSQUEDA);
  });

  it('sin texto ni fichas, no hay filtro', () => {
    expect(condicionesDeBusqueda('  ,  ')).toEqual([]);
  });

  it('las fichas se encuentran por nombre sin tildes, NIF o código', () => {
    const fichas = [
      { id: 'a', businessName: 'Comercial García SL', tradeName: 'La Despensa', nif: 'B00000000', codigo: '12' },
      { id: 'b', businessName: 'Otra', tradeName: '', nif: 'X1234567L', codigo: '60' },
    ];
    expect(fichasQueCasan(fichas, 'garcia')).toEqual(['a']);
    expect(fichasQueCasan(fichas, 'despensa')).toEqual(['a']);
    expect(fichasQueCasan(fichas, 'x1234')).toEqual(['b']);
    expect(fichasQueCasan(fichas, '60')).toEqual(['b']);
    // Con una letra casaría media cartera: no se manda.
    expect(fichasQueCasan(fichas, 'a')).toEqual([]);
  });
});

describe('el resumen de toda la cuenta', () => {
  const fila = (o: Partial<FilaResumenHistorico>): FilaResumenHistorico => ({
    anio: 2025, tipo: 'factura_venta', documentos: 0, total: 0, pendientes: 0, totalPendiente: 0, ...o,
  });
  const r = resumenGeneral([
    fila({ anio: 2026, tipo: 'factura_venta', documentos: 10, total: 1000.1 }),
    fila({ anio: 2025, tipo: 'factura_venta', documentos: 5, total: 500.2 }),
    fila({ anio: 2025, tipo: 'factura_compra', documentos: 3, total: 0.1 }),
    fila({ anio: 2026, tipo: 'albaran_venta', documentos: 9, total: 90, pendientes: 4, totalPendiente: 40.05 }),
    fila({ anio: 2025, tipo: 'albaran_venta', documentos: 2, total: 20, pendientes: 1, totalPendiente: 0.1 }),
    fila({ anio: 2024, tipo: 'pedido_venta', documentos: 2, total: 30, pendientes: 2, totalPendiente: 30 }),
    fila({ anio: null, tipo: 'albaran_compra', documentos: 2, total: 0, pendientes: 1, totalPendiente: 0 }),
  ]);

  it('ventas y compras por separado, sin errores de redondeo', () => {
    expect(r.ventas).toEqual({ facturas: 15, total: 1500.3 });
    expect(r.compras).toEqual({ facturas: 3, total: 0.1 });
  });

  it('lo que quedó sin facturar o sin servir', () => {
    expect(r.albaranesSinFactura).toEqual({ documentos: 5, total: 40.15 });
    expect(r.pedidosSinServir).toEqual({ documentos: 2, total: 30 });
  });

  it('los años, el más reciente primero, solo con facturas', () => {
    expect(r.anios).toEqual([
      { anio: 2026, ventas: 10, facturado: 1000.1, compras: 0, comprado: 0 },
      { anio: 2025, ventas: 5, facturado: 500.2, compras: 3, comprado: 0.1 },
    ]);
  });

  it('la fila de la base de datos llega con números como texto', () => {
    expect(filaResumenDe({ anio: 2026, tipo: 'albaran_venta', documentos: '309', total: '197319.18', pendientes: 299, total_pendiente: '186567.12' }))
      .toEqual({ anio: 2026, tipo: 'albaran_venta', documentos: 309, total: 197319.18, pendientes: 299, totalPendiente: 186567.12 });
    expect(filaResumenDe({ anio: null, tipo: 'albaran_compra', documentos: 2, total: '0', pendientes: 1, total_pendiente: '0' }).anio).toBeNull();
  });
});

describe('el historial dentro de Documentos', () => {
  it('el estado se dice como en la lista: un pedido se sirve, un albarán se factura', () => {
    expect(estadoDeHistorico({ tipo: 'factura', estado: 'emitida' })).toBe('Emitida');
    expect(estadoDeHistorico({ tipo: 'albaran', estado: 'pendiente' })).toBe('Sin facturar');
    expect(estadoDeHistorico({ tipo: 'albaran', estado: 'facturado' })).toBe('Facturado');
    expect(estadoDeHistorico({ tipo: 'pedido', estado: 'pendiente' })).toBe('Sin servir');
    expect(estadoDeHistorico({ tipo: 'pedido', estado: 'facturado' })).toBe('Servido');
  });

  it('el estado de un documento suelto, igual que en la vista', () => {
    expect(tipoYEstado(doc({ tipo: 'factura_compra' }))).toEqual({ tipo: 'factura', estado: 'emitida' });
    expect(tipoYEstado(doc({ tipo: 'albaran_compra', pasaA: ['factura_compra:26/311'] }))).toEqual({ tipo: 'albaran', estado: 'facturado' });
    expect(tipoYEstado(doc({ tipo: 'pedido_venta' }))).toEqual({ tipo: 'pedido', estado: 'pendiente' });
  });

  it('presupuestos, borradores o pagadas no los hay en el historial: ni se pregunta', () => {
    expect(filtroAlcanzaHistorial({ tipo: 'todos', estado: 'todos' })).toBe(true);
    expect(filtroAlcanzaHistorial({ tipo: 'albaran', estado: 'pendiente' })).toBe(true);
    expect(filtroAlcanzaHistorial({ tipo: 'presupuesto', estado: 'todos' })).toBe(false);
    expect(filtroAlcanzaHistorial({ tipo: 'rectificativa', estado: 'todos' })).toBe(false);
    expect(filtroAlcanzaHistorial({ tipo: 'todos', estado: 'borrador' })).toBe(false);
    expect(filtroAlcanzaHistorial({ tipo: 'factura', estado: 'pagada' })).toBe(false);
  });

  it('el buscador mira número, nombre, razón social, NIF, código y observaciones', () => {
    expect(busquedaEnListado(' T24/100269 ')).toEqual([
      'numero.ilike.*T24/100269*', 'cliente.ilike.*T24/100269*', 'razon_social.ilike.*T24/100269*',
      'cliente_nif.ilike.*T24/100269*', 'codigo_tercero.ilike.*T24/100269*', 'observaciones.ilike.*T24/100269*',
    ]);
    expect(busquedaEnListado('a,b')[0]).toBe('numero.ilike.*a b*');
    expect(busquedaEnListado(' (*) ')).toEqual([]);
  });

  it('la fila de la vista llega con el total como texto', () => {
    const f = filaListadoDe({ id: 'a', origen: 'isecan', tipo: 'pedido', sentido: 'venta', numero: 'T24/100269',
      fecha: null, client_id: null, cliente: null, cliente_nif: null, codigo_tercero: '60', total: '12.50',
      estado: 'pendiente', observaciones: null });
    expect(f.total).toBe(12.5);
    expect(f.codigoTercero).toBe('60');
    expect(f.fecha).toBeNull();
  });

  it('dos listas ordenadas se juntan sin reordenar ninguna', () => {
    const klima = [{ f: 9 }, { f: 5 }, { f: 1 }];
    // Del historial, en el orden en que lo dio la base de datos (aquí, empate entre 5 y 5).
    const historial = [{ f: 7, id: 'x' }, { f: 5, id: 'y' }, { f: 5, id: 'z' }, { f: 0, id: 'w' }];
    const r = mezclarOrdenadas(klima, historial, (a, b) => b.f - a.f);
    expect(r.map(x => x.f)).toEqual([9, 7, 5, 5, 5, 1, 0]);
    expect(r.filter(x => 'id' in x).map(x => (x as { id: string }).id)).toEqual(['x', 'y', 'z', 'w']);
    expect(mezclarOrdenadas([], historial, () => 0)).toEqual(historial);
  });

  it('pasa_a nombra los documentos como tipo:serie/número, y se puede deshacer', () => {
    expect(claveDeDocumento({ tipo: 'albaran_venta', serie: '26', numero: '235' })).toBe('albaran_venta:26/235');
    expect(partesDeClave('factura_venta:26/26003518')).toEqual({ tipo: 'factura_venta', serie: '26', numero: '26003518' });
    expect(partesDeClave('factura_compra:/16')).toEqual({ tipo: 'factura_compra', serie: '', numero: '16' });
    expect(partesDeClave('otra_cosa:1/2')).toBeNull();
    expect(partesDeClave('factura_venta:26')).toBeNull();
  });
});
