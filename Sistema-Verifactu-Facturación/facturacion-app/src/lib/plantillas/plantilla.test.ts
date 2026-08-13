import { describe, expect, it } from 'vitest';
import { clavesManualesUsadasPorPlantilla } from './plantilla';

describe('clavesManualesUsadasPorPlantilla', () => {
  const base = (schemas: any[], staticSchema: any[] = []) => ({
    basePdf: { width: 210, height: 297, padding: [10, 10, 10, 10], staticSchema },
    schemas,
  });

  it('devuelve las claves custom_N usadas, sin duplicados y ordenadas', () => {
    const t = base([
      [{ name: 'cliente_nombre', type: 'text' }],
      [
        { name: 'custom_2', type: 'text' },
        { name: 'custom_1', type: 'text' },
      ],
    ], [{ name: 'custom_3', type: 'text' }]);
    expect(clavesManualesUsadasPorPlantilla(t as any)).toEqual(['custom_1', 'custom_2', 'custom_3']);
  });

  it('ignora los duplicados con sufijo (_2, _3) y los campos no manuales', () => {
    const t = base([
      [
        { name: 'custom_1', type: 'text' },
        { name: 'custom_1_2', type: 'text' },
        { name: 'total_general', type: 'text' },
      ],
    ]);
    expect(clavesManualesUsadasPorPlantilla(t as any)).toEqual(['custom_1']);
  });

  it('devuelve lista vacía si la plantilla no usa ningún custom', () => {
    expect(clavesManualesUsadasPorPlantilla(base([[{ name: 'doc_numero', type: 'text' }]]) as any)).toEqual([]);
  });
});
