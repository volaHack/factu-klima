import { describe, it, expect } from 'vitest';
import {
  RELACIONES, filasDeAlbaranes, filasDeCobrosPagos, filasDeDocumentos,
  filtrarFilas, listadoComoCsv, relacionesDisponibles, secuenciaDe, totalesDe,
  type FilaListado,
} from './listados';
import type { Albaran, CobroPago, Invoice } from './types';

const fila = (p: Partial<FilaListado> = {}): FilaListado => ({
  id: 'f1', serie: 'FAC', numero: 'FAC-2026-0010', secuencia: 10,
  fecha: '2026-06-15', nombre: 'Panadería Ruiz', documento: '',
  neto: 100, impuestos: 21, total: 121, pendiente: false,
  ...p,
});

describe('secuenciaDe', () => {
  it('se queda con el último grupo de dígitos, no con el año', () => {
    // «FAC-2026-0042» → 42. Cogiendo el primero saldría 2026, y acotar
    // «del 10 al 50» no devolvería nada nunca.
    expect(secuenciaDe('FAC-2026-0042')).toBe(42);
    expect(secuenciaDe('2026/A/7')).toBe(7);
    expect(secuenciaDe('A-100')).toBe(100);
  });

  it('sin dígitos devuelve cero en vez de NaN', () => {
    // Un NaN aquí envenena todas las comparaciones del filtro: cualquier
    // acotado por número dejaría de devolver esa fila sin decir por qué.
    expect(secuenciaDe('')).toBe(0);
    expect(secuenciaDe('SIN-NUMERO')).toBe(0);
  });
});

describe('filtrarFilas', () => {
  const filas = [
    fila({ id: 'a', numero: 'A-5', secuencia: 5, fecha: '2026-01-10', serie: 'A', nombre: 'Álvarez' }),
    fila({ id: 'b', numero: 'B-20', secuencia: 20, fecha: '2026-06-15', serie: 'B', nombre: 'Méndez' }),
    fila({ id: 'c', numero: 'B-30', secuencia: 30, fecha: '2026-12-01', serie: 'B', nombre: 'Zapata', pendiente: true }),
  ];

  it('sin filtro devuelve todo, ordenado por fecha', () => {
    expect(filtrarFilas(filas, {}).map(f => f.id)).toEqual(['a', 'b', 'c']);
  });

  it('acota por fecha con los dos extremos dentro', () => {
    const r = filtrarFilas(filas, { fechaDesde: '2026-01-10', fechaHasta: '2026-06-15' });
    expect(r.map(f => f.id)).toEqual(['a', 'b']);
  });

  it('dejar un extremo en blanco significa «sin tope por ese lado»', () => {
    expect(filtrarFilas(filas, { fechaDesde: '2026-06-01' }).map(f => f.id)).toEqual(['b', 'c']);
    expect(filtrarFilas(filas, { fechaHasta: '2026-06-01' }).map(f => f.id)).toEqual(['a']);
  });

  it('acota por número usando la secuencia y no el texto', () => {
    // Como texto, «B-30» < «B-5»: acotar por el número escrito daría un
    // resultado absurdo en cuanto se pasa de nueve documentos.
    expect(filtrarFilas(filas, { numeroDesde: 20 }).map(f => f.id)).toEqual(['b', 'c']);
    expect(filtrarFilas(filas, { numeroHasta: 20 }).map(f => f.id)).toEqual(['a', 'b']);
  });

  it('acota por serie y por tercero sin distinguir mayúsculas ni acentos', () => {
    expect(filtrarFilas(filas, { serieDesde: 'b' }).map(f => f.id)).toEqual(['b', 'c']);
    // «Álvarez» tiene que caer dentro de un rango que empieza en «a».
    expect(filtrarFilas(filas, { terceroDesde: 'a', terceroHasta: 'm' }).map(f => f.id)).toEqual(['a']);
  });

  it('la casilla de pendientes deja sólo lo que queda por hacer', () => {
    expect(filtrarFilas(filas, { soloPendientes: true }).map(f => f.id)).toEqual(['c']);
  });

  it('ordena por fecha y, dentro del mismo día, por número', () => {
    const mismoDia = [
      fila({ id: 'x', secuencia: 9, fecha: '2026-03-03' }),
      fila({ id: 'y', secuencia: 2, fecha: '2026-03-03' }),
    ];
    expect(filtrarFilas(mismoDia, {}).map(f => f.id)).toEqual(['y', 'x']);
  });
});

describe('totalesDe', () => {
  it('suma cada columna y cuenta los documentos', () => {
    const t = totalesDe([fila(), fila({ id: 'f2', neto: 50, impuestos: 10.5, total: 60.5 })]);
    expect(t.documentos).toBe(2);
    expect(t.neto).toBe(150);
    expect(t.impuestos).toBe(31.5);
    expect(t.total).toBe(181.5);
  });

  it('no arrastra colas de céntimos al acumular', () => {
    // 0.1 + 0.2 en coma flotante da 0.30000000000000004: con cien líneas
    // el total impreso se separa del que suma la asesoría a mano.
    const centimos = Array.from({ length: 3 }, (_, i) =>
      fila({ id: `c${i}`, neto: 0.1, impuestos: 0, total: 0.1 }));
    expect(totalesDe(centimos).total).toBe(0.3);
  });

  it('una relación vacía suma cero, no NaN', () => {
    expect(totalesDe([])).toEqual({ documentos: 0, neto: 0, impuestos: 0, total: 0 });
  });
});

describe('de cada documento a su fila', () => {
  const factura = {
    id: 'i1', number: 'FAC-2026-0003', series: 'FAC', issueDate: '2026-05-02',
    clientName: 'Bar Manolo', subtotal: 200, totalTax: 42, total: 242,
    paidAmount: 0, status: 'emitida', tipo: 'factura', sentido: 'venta',
  } as unknown as Invoice;

  it('sólo coge el tipo y el sentido pedidos', () => {
    const compra = { ...factura, id: 'i2', sentido: 'compra' } as Invoice;
    const soloVenta = filasDeDocumentos([factura, compra], 'factura', 'venta');
    expect(soloVenta.map(f => f.id)).toEqual(['i1']);
  });

  it('una factura sin cobrar sale como pendiente', () => {
    expect(filasDeDocumentos([factura], 'factura', 'venta')[0].pendiente).toBe(true);
  });

  it('una factura cobrada del todo, no', () => {
    const cobrada = { ...factura, paidAmount: 242 } as Invoice;
    expect(filasDeDocumentos([cobrada], 'factura', 'venta')[0].pendiente).toBe(false);
  });

  it('una anulada no debe nada a nadie', () => {
    // Sigue en los libros con su importe, pero no es un cobro que
    // reclamar: colarla entre los pendientes hincharía la lista.
    const anulada = { ...factura, status: 'anulada' } as Invoice;
    expect(filasDeDocumentos([anulada], 'factura', 'venta')[0].pendiente).toBe(false);
  });

  it('en un albarán lo pendiente es facturarlo, no cobrarlo', () => {
    const alb = {
      id: 'a1', number: 'ALB-1', series: 'ALB', issueDate: '2026-05-02',
      clientName: 'Bar Manolo', subtotal: 100, totalTax: 21, total: 121,
      status: 'expedido',
    } as unknown as Albaran;
    const facturado = { ...alb, id: 'a2', status: 'facturado', invoiceId: 'i1' } as Albaran;
    expect(filasDeAlbaranes([alb])[0].pendiente).toBe(true);
    expect(filasDeAlbaranes([facturado])[0].pendiente).toBe(false);
  });

  it('un cobro no desglosa impuestos: mueve dinero, no lo devenga', () => {
    const cobro = {
      id: 'c1', tipo: 'cobro', series: 'COB', number: 'COB-1', fecha: '2026-05-10',
      contraparteNombre: 'Bar Manolo', importeTotal: 242,
      desglose: [{ invoiceId: 'i1', invoiceNumber: 'FAC-2026-0003', importeAplicado: 242 }],
    } as unknown as CobroPago;
    const [f] = filasDeCobrosPagos([cobro], 'cobro');
    expect(f.impuestos).toBe(0);
    expect(f.total).toBe(242);
    // Contra qué factura se aplicó: es lo que se busca cuando un cobro
    // no cuadra.
    expect(f.documento).toBe('FAC-2026-0003');
  });
});

describe('el catálogo de relaciones', () => {
  it('no hay dos relaciones con el mismo id', () => {
    const ids = RELACIONES.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('las que dependen de un módulo desaparecen si está apagado', () => {
    const sinNada = relacionesDisponibles([]);
    expect(sinNada.some(r => r.id === 'albaranes_venta')).toBe(false);
    // Facturar no es un módulo que se pueda apagar: siempre está.
    expect(sinNada.some(r => r.id === 'facturas_venta')).toBe(true);
    expect(sinNada.some(r => r.id === 'cobros')).toBe(true);
  });

  it('con los módulos encendidos vuelven a ofrecerse', () => {
    const con = relacionesDisponibles(['albaranes', 'almacenes']);
    expect(con.some(r => r.id === 'albaranes_venta')).toBe(true);
    expect(con.some(r => r.id === 'regularizaciones')).toBe(true);
  });

  it('las de almacén cuentan unidades, no euros', () => {
    // Un ajuste de stock no tiene importe guardado en ningún sitio:
    // enseñar ahí «Neto» e «Impuestos» sería inventárselo.
    for (const id of ['regularizaciones', 'traspasos']) {
      expect(RELACIONES.find(r => r.id === id)!.enUnidades, id).toBe(true);
    }
    expect(RELACIONES.find(r => r.id === 'facturas_venta')!.enUnidades).toBeUndefined();
  });
});

describe('la exportación a Excel', () => {
  const filas = [fila({ nombre: 'Panadería "La Real"; S.L.' })];

  it('separa con punto y coma, no con coma', () => {
    // En un Windows en español la coma es el separador DECIMAL: con un
    // CSV separado por comas, Excel amontona todo en la primera columna.
    const csv = listadoComoCsv(filas, 'Cliente');
    expect(csv.split('\r\n')[0]).toContain('Serie;Número;Fecha;Cliente');
  });

  it('lleva BOM delante para que Excel lea los acentos', () => {
    expect(listadoComoCsv(filas, 'Cliente').charCodeAt(0)).toBe(0xfeff);
  });

  it('entrecomilla lo que lleva punto y coma o comillas dentro', () => {
    const csv = listadoComoCsv(filas, 'Cliente');
    expect(csv).toContain('"Panadería ""La Real""; S.L."');
  });

  it('los importes van con coma decimal, como los espera Excel en español', () => {
    const csv = listadoComoCsv([fila({ neto: 1234.5 })], 'Cliente');
    expect(csv).toContain('1234,50');
  });

  it('cierra con la fila de total', () => {
    const csv = listadoComoCsv(filas, 'Cliente');
    expect(csv.trimEnd().split('\r\n').at(-1)).toContain('TOTAL;100,00;21,00;121,00');
  });
});
