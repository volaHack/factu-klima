import { describe, it, expect } from 'vitest';
import { decidirPlantillaParaSector } from './porSector';
import type { PlantillaDocumento } from './tipos';

/**
 * Sólo se prueba la regla, que es donde está la decisión. Montar la
 * plantilla de verdad necesita lienzo y no aporta nada aquí: lo que puede
 * romperse es a quién se le cambia el diseño y a quién no.
 */
function plantilla(over: Partial<PlantillaDocumento> & { id: string }): PlantillaDocumento {
  return {
    nombre: over.id,
    aplicaA: ['factura'],
    plantilla: {} as PlantillaDocumento['plantilla'],
    diagnostico: {} as PlantillaDocumento['diagnostico'],
    predeterminada: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}
const conOficio = (id: string, oficio: string | undefined, extra: Partial<PlantillaDocumento> = {}) =>
  plantilla({ id, diagnostico: { oficio } as PlantillaDocumento['diagnostico'], ...extra });

describe('decidirPlantillaParaSector', () => {
  it('no toca nada si la plantilla ya es la del oficio del sector', () => {
    const p = [conOficio('a', 'inmobiliaria', { predeterminada: true })];
    expect(decidirPlantillaParaSector(p, 'inmobiliaria')).toEqual({ accion: 'ninguna' });
  });

  it('cambia la de un distribuidor cuando el sector pasa a inmobiliaria', () => {
    const p = [conOficio('a', 'distribucion', { predeterminada: true })];
    expect(decidirPlantillaParaSector(p, 'inmobiliaria'))
      .toEqual({ accion: 'crear', oficioId: 'inmobiliaria' });
  });

  it('reutiliza la del oficio si ya estaba guardada, en vez de duplicarla', () => {
    const p = [
      conOficio('vieja', 'distribucion', { predeterminada: true }),
      conOficio('suya', 'inmobiliaria'),
    ];
    expect(decidirPlantillaParaSector(p, 'inmobiliaria'))
      .toEqual({ accion: 'marcar', id: 'suya', oficioId: 'inmobiliaria' });
  });

  /**
   * El caso que no se puede fallar: un calco del PDF real de la empresa no
   * lleva oficio anotado. Es el membrete de verdad de quien factura, y
   * sustituirlo por un papel generado sería destruirle el diseño.
   */
  it('NO toca un calco del PDF real de la empresa', () => {
    const p = [conOficio('calco', undefined, { predeterminada: true })];
    expect(decidirPlantillaParaSector(p, 'inmobiliaria')).toEqual({ accion: 'ninguna' });
  });

  it('NO toca la genérica: es una factura española normal y vale para todos', () => {
    const p = [conOficio('gen', 'generico', { predeterminada: true })];
    expect(decidirPlantillaParaSector(p, 'inmobiliaria')).toEqual({ accion: 'ninguna' });
  });

  it('sin ninguna plantilla no inventa nada: el formulario ya sigue al oficio', () => {
    expect(decidirPlantillaParaSector([], 'inmobiliaria')).toEqual({ accion: 'ninguna' });
  });

  it('sin sector no decide nada', () => {
    const p = [conOficio('a', 'distribucion', { predeterminada: true })];
    expect(decidirPlantillaParaSector(p, undefined)).toEqual({ accion: 'ninguna' });
  });

  it('ignora las plantillas que no imprimen facturas', () => {
    const p = [
      conOficio('albaran', 'distribucion', { predeterminada: true, aplicaA: ['albaran'] }),
      conOficio('fac', 'inmobiliaria', { aplicaA: ['factura'] }),
    ];
    expect(decidirPlantillaParaSector(p, 'inmobiliaria')).toEqual({ accion: 'ninguna' });
  });

  it('si ninguna esta marcada, mira la primera, como hace getPlantillaActiva', () => {
    const p = [conOficio('primera', 'distribucion'), conOficio('otra', 'abogado')];
    expect(decidirPlantillaParaSector(p, 'inmobiliaria'))
      .toEqual({ accion: 'crear', oficioId: 'inmobiliaria' });
  });
});
