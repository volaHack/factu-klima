import { describe, expect, it } from 'vitest';
import { UnitOfMeasure, type InvoiceLineItem, type Product } from './types';
import {
  claveDePacks, conPackNuevo, escribirPacks, leerPacks, lineasDePack, lineasParaPack, MAX_PACKS,
  packConNombre, resumenPack, sinPack, type AlmacenTexto,
} from './packsLineas';

function almacen(): AlmacenTexto & { datos: Map<string, string> } {
  const datos = new Map<string, string>();
  return { datos, getItem: k => datos.get(k) ?? null, setItem: (k, v) => { datos.set(k, v); } };
}

function linea(extra: Partial<InvoiceLineItem>): InvoiceLineItem {
  return {
    id: crypto.randomUUID(), productId: '', productName: '', productRef: '', quantity: 1, unitPrice: 0,
    unit: UnitOfMeasure.UNIDAD, taxRate: 7, discountPercent: 0, subtotal: 0, taxAmount: 0, total: 0, ...extra,
  };
}

function producto(id: string, name: string, extra: Partial<Product> = {}): Product {
  return {
    id, ref: id.toUpperCase(), name, description: '', category: '', unitPrice: 2, defaultTaxRate: 7,
    unit: UnitOfMeasure.UNIDAD, active: true, createdAt: '', updatedAt: '', ...extra,
  };
}

// Inventado: un surtido de bar.
const lineas = [
  linea({ productId: 'agua', productName: 'AGUA 0,5 L', productRef: 'AGU', quantity: 48, cajas: 2, unitsPerPackage: 24, unitPrice: 0.3, discountPercent: 5 }),
  linea({ productId: 'cerv', productName: 'CERVEZA 33 CL', productRef: 'CER', quantity: 24, cajas: 1, unitsPerPackage: 24, unitPrice: 0.6 }),
  linea({ productId: '', productName: 'Portes', quantity: 1, unitPrice: 12, taxRate: 7 }),
  linea({ productId: '', productName: '', quantity: 1 }),
];

describe('lineasParaPack', () => {
  it('guarda artículos y cantidades, sin precios salvo en lo escrito a mano', () => {
    const p = lineasParaPack(lineas);
    expect(p).toHaveLength(3);
    expect(p[0]).toMatchObject({ productId: 'agua', quantity: 48, cajas: 2, unitsPerPackage: 24, unitPrice: 0, discountPercent: 0 });
    expect(p[2]).toMatchObject({ productId: '', productName: 'Portes', unitPrice: 12 });
  });
});

describe('conPackNuevo', () => {
  it('pone el pack delante', () => {
    const packs = conPackNuevo([], '  Surtido bar ', lineas, 1000, 'p1')!;
    expect(packs).toHaveLength(1);
    expect(packs[0]).toMatchObject({ id: 'p1', nombre: 'Surtido bar', creado: 1000 });
    expect(packs[0].lineas).toHaveLength(3);
  });

  it('con el mismo nombre sustituye al de antes, y conserva su id', () => {
    const uno = conPackNuevo([], 'Surtido bar', lineas, 1, 'p1')!;
    const dos = conPackNuevo(uno, 'SURTIDO BAR', lineas.slice(0, 1), 2, 'p2')!;
    expect(dos).toHaveLength(1);
    expect(dos[0]).toMatchObject({ id: 'p1', nombre: 'SURTIDO BAR' });
    expect(dos[0].lineas).toHaveLength(1);
  });

  it('sin nombre o sin líneas no guarda', () => {
    expect(conPackNuevo([], '  ', lineas)).toBeNull();
    expect(conPackNuevo([], 'Vacío', [linea({})])).toBeNull();
  });

  it('no pasa del máximo', () => {
    let packs = conPackNuevo([], 'p0', lineas, 0, 'id0')!;
    for (let i = 1; i < MAX_PACKS + 5; i++) packs = conPackNuevo(packs, `p${i}`, lineas, i, `id${i}`)!;
    expect(packs).toHaveLength(MAX_PACKS);
    expect(packs[0].nombre).toBe(`p${MAX_PACKS + 4}`);
  });
});

describe('guardar y leer, por cuenta', () => {
  it('cada cuenta ve los suyos', () => {
    const a = almacen();
    const packs = conPackNuevo([], 'Pedido semanal hotel', lineas, 1, 'p1')!;
    expect(escribirPacks('cuenta-1', packs, a)).toBe(true);
    expect(leerPacks('cuenta-1', a)).toEqual(packs);
    expect(leerPacks('cuenta-2', a)).toEqual([]);
    expect(a.datos.has(claveDePacks('cuenta-1'))).toBe(true);
  });

  it('sin almacén, o con el almacén roto, no falla', () => {
    expect(leerPacks('c', null)).toEqual([]);
    expect(escribirPacks('c', [], null)).toBe(false);
    const roto: AlmacenTexto = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('lleno'); } };
    expect(leerPacks('c', roto)).toEqual([]);
    expect(escribirPacks('c', [], roto)).toBe(false);
  });

  it('lo leído se revisa: lo mal formado se descarta', () => {
    const a = almacen();
    a.setItem(claveDePacks('c'), JSON.stringify([
      { id: 'x', nombre: 'Bueno', creado: 1, lineas: [{ productId: 'agua', productName: 'AGUA', quantity: 2 }, { productId: 3 }] },
      { id: 'y', nombre: '', lineas: [{ productId: 'agua', productName: 'AGUA', quantity: 2 }] },
      { id: 'z', nombre: 'Sin líneas', lineas: [] },
      'basura',
    ]));
    const leidos = leerPacks('c', a);
    expect(leidos).toHaveLength(1);
    expect(leidos[0].lineas).toHaveLength(1);
    a.setItem(claveDePacks('c'), '{no es json');
    expect(leerPacks('c', a)).toEqual([]);
  });
});

describe('lineasDePack', () => {
  const pack = conPackNuevo([], 'Surtido bar', lineas, 1, 'p1')![0];
  const nueva = () => linea({ cajas: 0 });
  const condiciones = (p: Product) => ({ unitPrice: p.unitPrice, descuentos: [10, 0, 0], taxRate: p.defaultTaxRate });

  it('mete las líneas con sus cantidades y el precio de hoy', () => {
    const { lineas: l, sinFicha } = lineasDePack(pack, [producto('agua', 'AGUA 0,5 L'), producto('cerv', 'CERVEZA 33 CL')], condiciones, nueva);
    expect(sinFicha).toEqual([]);
    expect(l).toHaveLength(3);
    expect(l[0]).toMatchObject({ productId: 'agua', quantity: 48, cajas: 2, unitPrice: 2, discountPercent: 10 });
    expect(l[2]).toMatchObject({ productName: 'Portes', unitPrice: 12 });
  });

  it('lo dado de baja no entra y se dice', () => {
    const { lineas: l, sinFicha } = lineasDePack(pack, [producto('agua', 'AGUA 0,5 L'), producto('cerv', 'CERVEZA 33 CL', { active: false })], condiciones, nueva);
    expect(l).toHaveLength(2);
    expect(sinFicha).toEqual(['CERVEZA 33 CL']);
  });
});

describe('utilidades', () => {
  const packs = conPackNuevo([], 'Surtido bar', lineas, 1, 'p1')!;

  it('sinPack y packConNombre', () => {
    expect(sinPack(packs, 'p1')).toEqual([]);
    expect(packConNombre(packs, 'surtido BAR')?.id).toBe('p1');
    expect(packConNombre(packs, '')).toBeUndefined();
  });

  it('resumenPack', () => {
    expect(resumenPack(packs[0])).toBe('3 líneas · 3 cajas');
  });
});
