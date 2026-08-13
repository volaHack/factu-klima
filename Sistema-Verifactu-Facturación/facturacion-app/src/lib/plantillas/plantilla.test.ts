import type { Schema, Template } from '@pdfme/common';
import { describe, expect, it } from 'vitest';
import { clavesManualesUsadasPorPlantilla } from './plantilla';

describe('clavesManualesUsadasPorPlantilla', () => {
  const campo = (name: string): Schema => ({ name, type: 'text', position: { x: 0, y: 0 }, width: 10, height: 10 });
  const base = (schemas: Schema[][], staticSchema: Schema[] = []): Template => ({
    basePdf: { width: 210, height: 297, padding: [10, 10, 10, 10], staticSchema },
    schemas,
  });

  it('devuelve las claves custom_N usadas, sin duplicados y ordenadas', () => {
    const t = base(
      [
        [campo('cliente_nombre')],
        [campo('custom_2'), campo('custom_1')],
      ],
      [campo('custom_3')],
    );
    expect(clavesManualesUsadasPorPlantilla(t)).toEqual(['custom_1', 'custom_2', 'custom_3']);
  });

  it('ignora los duplicados con sufijo (_2, _3) y los campos no manuales', () => {
    const t = base([
      [campo('custom_1'), campo('custom_1_2'), campo('total_general')],
    ]);
    expect(clavesManualesUsadasPorPlantilla(t)).toEqual(['custom_1']);
  });

  it('devuelve lista vacía si la plantilla no usa ningún custom', () => {
    expect(clavesManualesUsadasPorPlantilla(base([[campo('doc_numero')]]))).toEqual([]);
  });

  it('deduplica la misma clave repetida en páginas y en el staticSchema', () => {
    const t = base(
      [
        [campo('custom_1')],
        [campo('custom_1_2')],
      ],
      [campo('custom_1')],
    );
    expect(clavesManualesUsadasPorPlantilla(t)).toEqual(['custom_1']);
  });

  it('excluye custom_6 y custom_10, fuera del rango 1..5', () => {
    const t = base([
      [campo('custom_6'), campo('custom_10'), campo('custom_3')],
    ]);
    expect(clavesManualesUsadasPorPlantilla(t)).toEqual(['custom_3']);
  });

  it('detecta una clave manual que sólo vive en el staticSchema', () => {
    const t = base([[campo('doc_numero')]], [campo('custom_4')]);
    expect(clavesManualesUsadasPorPlantilla(t)).toEqual(['custom_4']);
  });
});
