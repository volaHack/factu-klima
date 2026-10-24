import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { MENU, ACCESOS, esHojaActiva } from './MenuPrincipal';

const hoja = (label: string) => MENU.flatMap(r => r.hojas).find(h => h.label === label)!;
const p = (q: string) => new URLSearchParams(q);

describe('menú lateral en árbol', () => {
  it('tiene las siete opciones principales en su orden', () => {
    expect(MENU.map(r => r.label)).toEqual([
      'Mantenimientos', 'Compras', 'Ventas', 'Almacén', 'Consultas', 'Listados', 'Utilidades',
    ]);
  });

  it('compras y ventas llevan sus documentos con fecha', () => {
    const de = (id: string) => MENU.find(r => r.id === id)!.hojas.map(h => h.label);
    expect(de('compras')).toEqual(expect.arrayContaining([
      'Pedidos de compra', 'Albaranes de compra', 'Facturas de compra', 'Facturas de compra rectificativas', 'Pagos',
    ]));
    expect(de('ventas')).toEqual(expect.arrayContaining([
      'Presupuestos', 'Pedidos de venta', 'Albaranes de venta', 'Facturas de venta', 'Facturas de venta rectificativas', 'Cobros',
    ]));
    expect(de('mantenimientos').slice(0, 3)).toEqual(['Clientes', 'Proveedores', 'Artículos']);
  });

  it('cada enlace lleva a una pantalla que existe y no hay dos hojas iguales', () => {
    const app = join(__dirname, '../../app/(app)');
    const todas = [...ACCESOS, ...MENU.flatMap(r => r.hojas)];
    for (const h of todas) {
      for (const url of [h.lista, h.nuevo].filter(Boolean) as string[]) {
        expect(existsSync(join(app, url.split('?')[0], 'page.tsx')), url).toBe(true);
      }
    }
    expect(new Set(todas.map(h => h.lista)).size).toBe(todas.length);
  });

  it('marca la hoja cuya ruta y filtros casan con la dirección', () => {
    expect(esHojaActiva(hoja('Albaranes de compra'), '/documentos', p('tipo=albaran&sentido=compra'))).toBe(true);
    expect(esHojaActiva(hoja('Albaranes de venta'), '/documentos', p('tipo=albaran&sentido=compra'))).toBe(false);
    expect(esHojaActiva(hoja('Cobros'), '/tesoreria', p('tab=cobros'))).toBe(true);
    expect(esHojaActiva(hoja('Facturas de venta'), '/facturas/abc', p(''))).toBe(true);
    expect(esHojaActiva(hoja('Todos los documentos'), '/documentos', p(''))).toBe(true);
    expect(esHojaActiva(hoja('Listados'), '/listados-fiscales', p(''))).toBe(false);
  });
});
