import { describe, it, expect } from 'vitest';
import { categoriasTrasBorrar } from './storage';
import type { CustomCategory } from './types';

const DEFECTO = [
  { value: 'frutas', label: 'Frutas', icon: 'Apple' },
  { value: 'bebidas', label: 'Bebidas', icon: 'Wine' },
  { value: 'otros', label: 'Otros', icon: 'Package' },
];

describe('categoriasTrasBorrar', () => {
  it('quita las propias y oculta las del sector, en una sola pasada', () => {
    const propias: CustomCategory[] = [
      { id: 'custom_1', name: 'Embutidos', icon: 'Beef' },
      { id: 'custom_2', name: 'Quesos', icon: 'Package' },
    ];
    const r = categoriasTrasBorrar(propias, DEFECTO, new Set(['custom_1', 'frutas']), 'alimentacion');
    expect(r.map(c => c.id)).toEqual(['custom_2', 'frutas']);
    expect(r.find(c => c.id === 'frutas')).toMatchObject({ name: 'Frutas', hidden: true, sector: 'alimentacion' });
  });

  it('una del sector que ya estaba renombrada se oculta sin perder el nombre', () => {
    const propias: CustomCategory[] = [{ id: 'bebidas', name: 'Refrescos', icon: 'Wine' }];
    const r = categoriasTrasBorrar(propias, DEFECTO, new Set(['bebidas']));
    expect(r).toEqual([{ id: 'bebidas', name: 'Refrescos', icon: 'Wine', hidden: true }]);
  });

  it('no toca lo que no está seleccionado', () => {
    const propias: CustomCategory[] = [{ id: 'custom_9', name: 'Varios', icon: 'Package' }];
    expect(categoriasTrasBorrar(propias, DEFECTO, new Set())).toEqual(propias);
  });
});
