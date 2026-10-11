/**
 * La factura de un mayorista impresa con su plantilla de siempre (la de
 * Sucamosa, tal y como quedó guardada: CAJ. y U/C sin dato y «RECIO»).
 */
import { describe, expect, it } from 'vitest';
import type { Template } from '@pdfme/common';
import { DEFAULT_COMPANY_SETTINGS } from '../constants';
import { recalcularLinea } from '../documentos';
import type { InvoiceLineItem } from '../types';
import { TABLA_LINEAS } from './contrato';
import { construirDatos, facturaDeMuestra } from './datos';
import { construirEntrada } from './generar';
import { columnasPersonalizadasDePlantilla, normalizarPlantilla } from './plantilla';

const plantillaSucamosa = (): Template => ({
  basePdf: { width: 210, height: 297, padding: [0, 0, 0, 0] },
  schemas: [[{
    name: TABLA_LINEAS, type: 'table', position: { x: 10, y: 80 }, width: 190, height: 100, content: '[]',
    head: ['CÓDIGO', 'DESCRIPCIÓN', 'CAJ.', 'U/C', 'UDES.', 'RECIO', 'IGIC', 'TOTAL'],
    __columnas: ['ref', 'descripcion', 'custom_col_1', 'custom_col_2', 'cantidad', 'precio', 'impuesto_pct', 'importe_total'],
  } as never]],
} as unknown as Template);

const linea = (o: Partial<InvoiceLineItem>): InvoiceLineItem => recalcularLinea({
  id: Math.random().toString(36), productId: 'p', productName: 'Corn Flakes', productRef: 'PRD-002',
  quantity: 1, unitPrice: 1.4, unit: 'ud' as InvoiceLineItem['unit'], taxRate: 7, discountPercent: 0,
  subtotal: 0, taxAmount: 0, total: 0, ...o,
});

describe('la plantilla de mayorista ya guardada', () => {
  const factura = { ...facturaDeMuestra(), lineItems: [
    linea({ cajas: 2, unitsPerPackage: 24, quantity: 51 }),
    linea({ productName: 'Leche Asturiana', productRef: 'PRD-3724', cajas: 0, unitsPerPackage: 6, quantity: 15, unitPrice: 1.2 }),
  ] };
  const datos = construirDatos({ tipo: 'factura', documento: factura }, { ...DEFAULT_COMPANY_SETTINGS, igicEnabled: true });
  const plantilla = normalizarPlantilla(plantillaSucamosa());
  const filas = JSON.parse(construirEntrada(plantilla, datos)[TABLA_LINEAS]) as string[][];

  it('CAJ., U/C y UDES. salen rellenas', () => {
    // CÓDIGO, DESCRIPCIÓN, CAJ., U/C, UDES., PRECIO, IGIC, TOTAL
    expect(filas[0].slice(0, 5)).toEqual(['PRD-002', 'Corn Flakes', '2', '24', '51']);
    expect(filas[1].slice(0, 5)).toEqual(['PRD-3724', 'Leche Asturiana', '', '6', '15']);
  });
  it('el precio es por unidad y el total es unidades × precio', () => {
    expect(filas[0][5].replace(/\s/g, ' ')).toBe('1,40 €');
    expect(filas[1][7].replace(/\s/g, ' ')).toBe('19,26 €'); // 15 × 1,20 = 18 + 7 % IGIC
  });
  it('la cabecera vuelve a decir PRECIO', () => {
    const tabla = plantilla.schemas[0][0] as unknown as { head: string[] };
    expect(tabla.head[5]).toBe('PRECIO');
  });
  it('al hacer la factura ya no pide CAJ. y U/C como casillas sueltas', () => {
    expect(columnasPersonalizadasDePlantilla(plantillaSucamosa())).toEqual([]);
  });
});

describe('el «Total de CAJ.» del pie', () => {
  const conPie = (): Template => {
    const t = plantillaSucamosa() as unknown as { basePdf: Record<string, unknown> };
    t.basePdf.staticSchema = [
      { name: 'total_col_1', type: 'text', position: { x: 10, y: 250 }, width: 30, height: 8, content: '{total_col_1}', readOnly: true },
      { name: 'total_unidades', type: 'text', position: { x: 50, y: 250 }, width: 30, height: 8, content: '{total_unidades}', readOnly: true },
    ];
    return t as unknown as Template;
  };
  const factura = { ...facturaDeMuestra(), lineItems: [
    linea({ cajas: 2, unitsPerPackage: 24, quantity: 51 }),
    linea({ cajas: 3, unitsPerPackage: 6, quantity: 18 }),
    linea({ cajas: 0, unitsPerPackage: 6, quantity: 4 }),
  ] };
  const datos = construirDatos({ tipo: 'factura', documento: factura }, DEFAULT_COMPANY_SETTINGS);

  it('suma las cajas de las líneas', () => {
    const plantilla = normalizarPlantilla(conPie());
    const pie = (plantilla.basePdf as { staticSchema: { name: string; content: string }[] }).staticSchema;
    const casilla = pie.find(e => e.content.includes('total_bultos'))!;
    expect(casilla).toBeDefined();
    const entrada = construirEntrada(plantilla, datos);
    expect(entrada[casilla.name]).toBe('5');
    expect(entrada.total_unidades).toBe('73');
  });
  it('normalizar dos veces no lo estropea', () => {
    const plantilla = normalizarPlantilla(normalizarPlantilla(conPie()));
    const entrada = construirEntrada(plantilla, datos);
    const pie = (plantilla.basePdf as { staticSchema: { name: string }[] }).staticSchema;
    expect(pie.map(e => e.name)).not.toContain('total_col_1');
    expect(entrada[pie[0].name]).toBe('5');
  });
});

describe('el «Total de CAJ.» del pie', () => {
  const conPie = (): Template => {
    const t = plantillaSucamosa() as unknown as { basePdf: Record<string, unknown> };
    t.basePdf.staticSchema = [
      { name: 'total_col_1', type: 'text', position: { x: 10, y: 250 }, width: 30, height: 8, content: '{total_col_1}', readOnly: true },
      { name: 'total_unidades', type: 'text', position: { x: 50, y: 250 }, width: 30, height: 8, content: '{total_unidades}', readOnly: true },
    ];
    return t as unknown as Template;
  };
  const factura = { ...facturaDeMuestra(), lineItems: [
    linea({ cajas: 2, unitsPerPackage: 24, quantity: 51 }),
    linea({ cajas: 3, unitsPerPackage: 6, quantity: 18 }),
    linea({ cajas: 0, unitsPerPackage: 6, quantity: 4 }),
  ] };
  const datos = construirDatos({ tipo: 'factura', documento: factura }, DEFAULT_COMPANY_SETTINGS);
  const pieDe = (p: Template) => (p.basePdf as unknown as { staticSchema: { name: string; content: string }[] }).staticSchema;

  it('suma las cajas de las líneas', () => {
    const plantilla = normalizarPlantilla(conPie());
    const casilla = pieDe(plantilla).find(e => e.content.includes('total_bultos'));
    expect(casilla).toBeDefined();
    const entrada = construirEntrada(plantilla, datos);
    expect(entrada[casilla!.name]).toBe('5');
    expect(entrada.total_unidades).toBe('73');
  });
  it('normalizar dos veces no lo estropea', () => {
    const plantilla = normalizarPlantilla(normalizarPlantilla(conPie()));
    expect(pieDe(plantilla).map(e => e.name)).not.toContain('total_col_1');
    expect(construirEntrada(plantilla, datos)[pieDe(plantilla)[0].name]).toBe('5');
  });
});
