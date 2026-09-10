/**
 * LA COPIA TIENE QUE ABRIRSE EN EL ORDENADOR DEL ASESOR
 *
 * Un CSV se estropea siempre por lo mismo y siempre en silencio: una coma
 * dentro de un nombre parte la fila en dos columnas, una comilla sin
 * duplicar se come el resto del fichero, y un Excel en español mete
 * «1.234,56» en dos celdas. No da error: da una hoja mal, que es peor.
 */

import { describe, expect, it } from 'vitest';
import {
  campoCsv, construirCsv, importeCsv, libroDeFacturas, libroDeGastos,
  libroDeLineas, prepararExportacion, resumirExportacion, type DatosEmpresa,
} from './exportar';
import { InvoiceStatus, type Client, type CompanySettings, type Gasto, type Invoice } from './types';

/**
 * Lee una línea de CSV como la leería una hoja de cálculo.
 *
 * Las pruebas no pueden partir por «;» a secas: un punto y coma dentro de
 * comillas es texto. Si se contara así, un cliente llamado «Frutas;
 * Verduras S.L.» daría una columna de más y la prueba fallaría por culpa de
 * la prueba, no del código.
 */
function celdas(linea: string): string[] {
  const salida: string[] = [];
  let actual = '';
  let dentro = false;

  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (dentro) {
      if (c === '"' && linea[i + 1] === '"') { actual += '"'; i++; }
      else if (c === '"') dentro = false;
      else actual += c;
    } else if (c === '"') {
      dentro = true;
    } else if (c === ';') {
      salida.push(actual); actual = '';
    } else {
      actual += c;
    }
  }
  salida.push(actual);
  return salida;
}

const factura = (extra: Partial<Invoice> = {}): Invoice => ({
  id: crypto.randomUUID(), number: 'FAC-2026-0001', series: 'FAC',
  clientId: 'c1', clientName: 'Bar Paco', clientNif: 'B12345678', clientAddress: '',
  issueDate: '2026-03-10', dueDate: '2026-04-10',
  status: InvoiceStatus.EMITIDA,
  lineItems: [{
    id: 'l1', productId: 'p1', productName: 'Caja de cerveza', productRef: 'REF-1',
    quantity: 11, unitPrice: 10, unit: 'ud' as never, taxRate: 21,
    discountPercent: 0, subtotal: 100, taxAmount: 21, total: 121,
  }],
  subtotal: 100, totalDiscount: 0, totalTax: 21, total: 121,
  paymentMethod: 'efectivo' as never, notes: '',
  tipo: 'factura', sentido: 'venta',
  createdAt: '2026-03-10T00:00:00Z', updatedAt: '2026-03-10T00:00:00Z',
  ...extra,
} as Invoice);

describe('campoCsv', () => {
  it('lo que no lleva separadores sale tal cual', () => {
    expect(campoCsv('Bar Paco')).toBe('Bar Paco');
    expect(campoCsv(42)).toBe('42');
  });

  it('entrecomilla lo que lleva punto y coma, que es nuestro separador', () => {
    expect(campoCsv('Frutas; Verduras S.L.')).toBe('"Frutas; Verduras S.L."');
  });

  it('entrecomilla lo que lleva coma: el asesor abrirá esto en otro sitio', () => {
    expect(campoCsv('Rodríguez, Hermanos')).toBe('"Rodríguez, Hermanos"');
  });

  it('duplica las comillas, que es lo que se come el fichero entero', () => {
    expect(campoCsv('Bar "El Rincón"')).toBe('"Bar ""El Rincón"""');
  });

  it('entrecomilla los saltos de línea de las notas', () => {
    expect(campoCsv('Entregar\nen mano')).toBe('"Entregar\nen mano"');
  });

  it('lo vacío es vacío, no «null» ni «undefined» escritos en la celda', () => {
    expect(campoCsv(null)).toBe('');
    expect(campoCsv(undefined)).toBe('');
  });
});

describe('construirCsv', () => {
  it('separa por punto y coma, que es lo que espera un Excel español', () => {
    const csv = construirCsv(['A', 'B'], [[1, 2]]);
    expect(csv).toContain('A;B');
    expect(csv).toContain('1;2');
  });

  it('empieza con BOM: sin él los acentos salen como jeroglíficos', () => {
    expect(construirCsv(['Año'], [['Café']]).charCodeAt(0)).toBe(0xFEFF);
  });

  it('termina las líneas con CRLF', () => {
    expect(construirCsv(['A'], [['x']])).toBe('﻿A\r\nx\r\n');
  });

  it('una tabla sin filas sigue teniendo cabecera', () => {
    expect(construirCsv(['A', 'B'], [])).toBe('﻿A;B\r\n');
  });
});

describe('importeCsv', () => {
  it('con coma decimal, que es como se lee aquí', () => {
    expect(importeCsv(1234.5)).toBe('1234,50');
    expect(importeCsv(0)).toBe('0,00');
  });

  it('lo que no es número se queda en blanco, no en «NaN»', () => {
    expect(importeCsv(undefined)).toBe('');
    expect(importeCsv(NaN)).toBe('');
  });
});

describe('el libro de facturas', () => {
  it('lleva la huella Veri*Factu de cada una', () => {
    const csv = libroDeFacturas([factura({ verifactu: { chainedHash: 'abc123' } as never })]);
    expect(csv).toContain('abc123');
  });

  it('deja fuera los borradores: todavía no son nada', () => {
    const csv = libroDeFacturas([factura({ status: InvoiceStatus.BORRADOR, number: 'BORRADOR-1' })]);
    expect(csv).not.toContain('BORRADOR-1');
  });

  it('INCLUYE las anuladas: un libro con huecos hace saltar una inspección', () => {
    const csv = libroDeFacturas([factura({ status: InvoiceStatus.ANULADA, number: 'FAC-2026-0007' })]);
    expect(csv).toContain('FAC-2026-0007');
    expect(csv).toContain('anulada');
  });

  it('deja fuera las compras: es el libro de EMITIDAS', () => {
    const csv = libroDeFacturas([factura({ sentido: 'compra', number: 'COMPRA-1' } as never)]);
    expect(csv).not.toContain('COMPRA-1');
  });

  it('sale ordenado por fecha', () => {
    const csv = libroDeFacturas([
      factura({ number: 'FAC-3', issueDate: '2026-05-01' }),
      factura({ number: 'FAC-1', issueDate: '2026-01-01' }),
      factura({ number: 'FAC-2', issueDate: '2026-03-01' }),
    ]);
    expect(csv.indexOf('FAC-1')).toBeLessThan(csv.indexOf('FAC-2'));
    expect(csv.indexOf('FAC-2')).toBeLessThan(csv.indexOf('FAC-3'));
  });

  it('un nombre de cliente con punto y coma no parte la fila', () => {
    const csv = libroDeFacturas([factura({ clientName: 'Frutas; Verduras S.L.' })]);
    const [cabecera, fila] = csv.split('\r\n');

    // Se cuenta como lo contaría una hoja de cálculo: un punto y coma DENTRO
    // de comillas es texto, no un separador. Partir por «;» a secas daría
    // catorce columnas donde hay trece, y es justo el fallo que este caso
    // existe para detectar.
    expect(celdas(fila)).toHaveLength(celdas(cabecera).length);
    expect(celdas(fila)[3]).toBe('Frutas; Verduras S.L.');
  });
});

describe('el libro de líneas', () => {
  it('saca el descuento de la oferta en su propia columna', () => {
    const csv = libroDeLineas([factura({
      lineItems: [{
        id: 'l1', productId: 'p1', productName: 'Cerveza', productRef: 'R1',
        quantity: 11, unitPrice: 10, unit: 'ud' as never, taxRate: 21,
        discountPercent: 5, discountPercent2: 9.09,
        subtotal: 86.36, taxAmount: 18.14, total: 104.5,
      }],
    })]);
    expect(csv).toContain('Dto. oferta %');
    expect(csv).toContain('9.09');
  });

  it('lleva el lote, que es lo que pide una trazabilidad', () => {
    const csv = libroDeLineas([factura({
      lineItems: [{
        id: 'l1', productId: 'p1', productName: 'Leche', productRef: 'R1',
        quantity: 2, unitPrice: 1, unit: 'ud' as never, taxRate: 4,
        discountPercent: 0, subtotal: 2, taxAmount: 0.08, total: 2.08,
        loteCodigo: 'L-4471',
      }],
    })]);
    expect(csv).toContain('L-4471');
  });
});

describe('el libro de gastos', () => {
  it('saca la base y la cuota por separado, que es lo que pide el 303', () => {
    const gasto = {
      id: 'g1', fecha: '2026-02-01', concepto: 'Alquiler nave',
      categoria: 'alquiler', baseImponible: 800, taxRate: 21, taxAmount: 168, total: 968,
      paymentMethod: 'transferencia',
    } as unknown as Gasto;
    const csv = libroDeGastos([gasto]);
    expect(csv).toContain('800,00');
    expect(csv).toContain('168,00');
    expect(csv).toContain('968,00');
  });
});

// ============================================================
// EL PAQUETE
// ============================================================

const datos = (extra: Partial<DatosEmpresa> = {}): DatosEmpresa => ({
  ajustes: { businessName: 'Distribuciones Alimentarias del Sur S.L.' } as CompanySettings,
  facturas: [factura()],
  clientes: [{ id: 'c1', businessName: 'Bar Paco', nif: 'B1' } as Client],
  productos: [],
  albaranes: [],
  devoluciones: [],
  abonos: [],
  gastos: [],
  lotes: [],
  ofertas: [],
  ...extra,
});

describe('prepararExportacion', () => {
  const ahora = new Date('2026-09-10T12:00:00Z');

  it('saca la copia completa y los libros', () => {
    const ficheros = prepararExportacion(datos(), ahora);
    const nombres = ficheros.map(f => f.nombre);
    expect(nombres.some(n => n.includes('copia-completa.json'))).toBe(true);
    expect(nombres.some(n => n.includes('libro-facturas.csv'))).toBe(true);
    expect(nombres.some(n => n.includes('libro-lineas.csv'))).toBe(true);
    expect(nombres.some(n => n.includes('clientes.csv'))).toBe(true);
  });

  it('el nombre lleva la empresa y la fecha, sin acentos ni espacios', () => {
    const [json] = prepararExportacion(datos(), ahora);
    expect(json.nombre).toBe('distribuciones-alimentarias-del-sur-s-l-2026-09-10-copia-completa.json');
  });

  it('el JSON dice de cuándo es y con qué se hizo', () => {
    const [json] = prepararExportacion(datos(), ahora);
    const copia = JSON.parse(json.contenido);
    expect(copia.formato).toBe(1);
    expect(copia.exportadoEn).toBe('2026-09-10T12:00:00.000Z');
    expect(copia.generadoPor).toContain('Klima');
    // Y lleva los datos de verdad, no sólo la cabecera.
    expect(copia.facturas).toHaveLength(1);
  });

  it('el JSON se puede volver a leer entero', () => {
    const [json] = prepararExportacion(datos(), ahora);
    expect(() => JSON.parse(json.contenido)).not.toThrow();
  });

  it('una empresa sin nombre no rompe el nombre del fichero', () => {
    const sinNombre = datos({ ajustes: { businessName: '' } as CompanySettings });
    expect(prepararExportacion(sinNombre, ahora)[0].nombre).toContain('empresa-2026-09-10');
  });
});

describe('resumirExportacion', () => {
  it('cuenta lo que se lleva, para poder decírselo al usuario', () => {
    const resumen = resumirExportacion(datos());
    expect(resumen).toContainEqual({ que: 'Facturas', cuantos: 1 });
    expect(resumen).toContainEqual({ que: 'Clientes', cuantos: 1 });
  });

  it('no enseña lo que está a cero', () => {
    expect(resumirExportacion(datos()).map(r => r.que)).not.toContain('Lotes');
  });

  it('los borradores no cuentan como facturas', () => {
    const conBorrador = datos({ facturas: [factura({ status: InvoiceStatus.BORRADOR })] });
    expect(resumirExportacion(conBorrador).find(r => r.que === 'Facturas')).toBeUndefined();
  });
});
