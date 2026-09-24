import { describe, it, expect } from 'vitest';

import {
  decodificarTexto, detectarColumnas, detectarTipo, filaDeCabecera, leerCsv, numeroEs,
  resumen, revisarClientes, revisarProductos, tipoImpositivo,
} from './importar';
import type { Client, Product } from '@/lib/types';

let n = 0;
const ctx = { ahora: '2026-09-24T10:00:00Z', nuevoId: () => `id${++n}`, impuestoPorDefecto: 7 };

describe('leer el archivo', () => {
  it('CSV de Excel en español: punto y coma, comillas y saltos dentro de un campo', () => {
    const t = 'Nombre;NIF;Dirección\n"Bar ""El Puerto""";B12345674;"C/ Mayor, 3\nbajo"\r\nPepe;;\n';
    expect(leerCsv(t)).toEqual([
      ['Nombre', 'NIF', 'Dirección'],
      ['Bar "El Puerto"', 'B12345674', 'C/ Mayor, 3\nbajo'],
      ['Pepe', '', ''],
    ]);
  });

  it('CSV con comas y líneas vacías', () => {
    expect(leerCsv('a,b\n\n1,2\n')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('un CSV en Windows-1252 no se come las eñes', () => {
    // «Peñalver» en Windows-1252: la ñ es el byte 0xF1, inválido en UTF-8.
    const bytes = new Uint8Array([0x50, 0x65, 0xf1, 0x61, 0x6c, 0x76, 0x65, 0x72]);
    expect(decodificarTexto(bytes)).toBe('Peñalver');
    expect(decodificarTexto(new TextEncoder().encode('﻿Peñalver'))).toBe('Peñalver');
  });
});

describe('números escritos de cualquier forma', () => {
  it.each([
    ['1.234,56 €', 1234.56], ['1234.56', 1234.56], ['1,234.56', 1234.56], ['12,5', 12.5],
    ['1.234.567', 1234567], ['1,234', 1234], ['-3,5', -3.5], ['', null], ['abc', null],
  ])('%s → %s', (texto, valor) => expect(numeroEs(texto)).toBe(valor));

  it.each([['21', 21], ['21%', 21], ['IVA 21 %', 21], ['0,21', 21], ['7', 7], ['9,5', 9.5]])(
    'impuesto %s → %s', (texto, valor) => expect(tipoImpositivo(texto)).toBe(valor),
  );
});

describe('reconocer las columnas de otros programas', () => {
  it('clientes de Factusol: «Nombre fiscal», «N.I.F.», «Cód. postal»', () => {
    const cab = ['Código', 'Nombre fiscal', 'Nombre comercial', 'Domicilio', 'Población', 'Cód. postal', 'Provincia', 'N.I.F.', 'Teléfono', 'Email'];
    expect(detectarColumnas(cab, 'clientes')).toMatchObject({
      businessName: 1, tradeName: 2, address: 3, city: 4, postalCode: 5, province: 6, nif: 7, phone: 8, email: 9,
    });
  });

  it('clientes de Holded: «Nombre», «NIF», «Móvil» no le quita el sitio a «Teléfono»', () => {
    const cab = ['Nombre', 'NIF', 'Email', 'Móvil', 'Teléfono', 'Dirección', 'Código postal', 'Población'];
    expect(detectarColumnas(cab, 'clientes')).toMatchObject({ businessName: 0, nif: 1, email: 2, phone: 4, address: 5, postalCode: 6, city: 7 });
  });

  it('productos: «PVP con IVA» no se confunde con el precio sin impuesto', () => {
    const cab = ['SKU', 'Nombre', 'Precio', 'PVP con IVA', '% IVA', 'Stock', 'Código de barras'];
    expect(detectarColumnas(cab, 'productos')).toMatchObject({
      ref: 0, name: 1, unitPrice: 2, unitPriceConImpuesto: 3, defaultTaxRate: 4, stockQuantity: 5, barcode: 6,
    });
  });

  it('se salta el título que ponen algunos exportadores encima de la cabecera', () => {
    const tabla = [['Listado de clientes a 12/03/2026'], ['Nombre', 'NIF', 'Email', 'Población'], ['Pepe', '12345678Z', 'a@b.es', 'Arona']];
    expect(filaDeCabecera(tabla, 'clientes')).toBe(1);
  });

  it('distingue un listado de clientes de uno de productos', () => {
    expect(detectarTipo([['Nombre', 'NIF', 'Email', 'Población']])).toBe('clientes');
    expect(detectarTipo([['Referencia', 'Nombre', 'Precio', 'IVA', 'Stock']])).toBe('productos');
  });
});

describe('clientes, fila a fila', () => {
  const tabla = [
    ['Nombre', 'NIF', 'Email', 'Días de pago'],
    ['Construcciones Rivas S.L.', 'b-1234567-4', 'admin@rivas.es', '60'],
    ['Bar Pepe', '', 'pepe@', ''],
    ['', '12345678Z', '', ''],
    ['Distribuidora Lyon', 'FR12345678901', '', ''],
    ['Construcciones Rivas S.L.', 'B12345674', '', ''],
    ['Hostelería Norte', 'A58818501', '', ''],
  ];
  const existentes = [{ nif: 'A58818501', businessName: 'Hostelería Norte S.A.' }] as Client[];
  const filas = revisarClientes(tabla, 1, detectarColumnas(tabla[0], 'clientes'), existentes, ctx);

  it('limpia el NIF y conserva los días de pago', () => {
    expect(filas[0]).toMatchObject({ estado: 'nuevo', fila: 2 });
    expect(filas[0].ficha).toMatchObject({ nif: 'B12345674', paymentDays: 60, country: 'España' });
  });

  it('sin NIF se importa, pero avisa de que sólo admite simplificadas', () => {
    expect(filas[1].estado).toBe('nuevo');
    expect(filas[1].avisos.join(' ')).toMatch(/Sin NIF.*400 €/);
    expect(filas[1].avisos.join(' ')).toMatch(/email/);
  });

  it('sin nombre no se importa', () => {
    expect(filas[2]).toMatchObject({ estado: 'error', ficha: null });
  });

  it('un NIF-IVA francés va como intracomunitario', () => {
    expect(filas[3].ficha).toMatchObject({ nif: '', vatNumber: 'FR12345678901' });
  });

  it('repetido en el archivo y ya existente en la cuenta no se duplican', () => {
    expect(filas[4].estado).toBe('repetido');
    expect(filas[5].estado).toBe('existe');
    expect(resumen(filas)).toEqual({ nuevo: 3, existe: 1, repetido: 1, error: 1 });
  });
});

describe('productos, fila a fila', () => {
  const tabla = [
    ['Referencia', 'Nombre', 'Precio', 'PVP con IGIC', 'IGIC', 'Stock'],
    ['CEM-25', 'Saco de cemento 25 kg', '4,50', '', '7', '120'],
    ['', 'Mano de obra (hora)', '', '37,45', '7%', ''],
    ['X', 'Raro', '-1', '', '7', ''],
    ['CEM-25', 'Saco repetido', '5', '', '7', ''],
    ['LAD-1', 'Ladrillo', '0,30', '', '', ''],
  ];
  const existentes = [{ ref: 'lad-1', name: 'Ladrillo macizo' }] as Product[];
  const filas = revisarProductos(tabla, 1, detectarColumnas(tabla[0], 'productos'), existentes, ctx);

  it('precio y stock con coma decimal', () => {
    expect(filas[0].ficha).toMatchObject({ ref: 'CEM-25', unitPrice: 4.5, defaultTaxRate: 7, stockQuantity: 120 });
  });

  it('si sólo hay PVP con impuesto, se guarda el precio sin él', () => {
    expect(filas[1].ficha?.unitPrice).toBe(35);
    expect(filas[1].avisos.join(' ')).toMatch(/sin impuesto/);
  });

  it('precio negativo no entra; referencia repetida o ya existente, tampoco se duplica', () => {
    expect(filas[2].estado).toBe('error');
    expect(filas[3].estado).toBe('repetido');
    expect(filas[4].estado).toBe('existe');
  });

  it('sin impuesto en la fila, el de la empresa', () => {
    expect(filas[4].ficha?.defaultTaxRate).toBe(7);
  });
});
