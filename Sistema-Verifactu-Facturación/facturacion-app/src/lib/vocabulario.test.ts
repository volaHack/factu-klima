import { describe, it, expect } from 'vitest';
import { vocabularioDe, conPlural } from './vocabulario';
import { BUSINESS_SECTORS } from './constants';

describe('vocabularioDe', () => {
  it('un distribuidor cuenta bultos', () => {
    const v = vocabularioDe('alimentacion');
    expect(v.usaBultos).toBe(true);
    expect(v.bulto[1]).toBe('bultos');
    expect(v.contenido[1]).toBe('unidades');
  });

  it('un psicólogo factura sesiones, no cajas', () => {
    const v = vocabularioDe('psicologia');
    expect(v.usaBultos).toBe(false);
    expect(v.cantidad).toBe('Sesiones');
    expect(v.titulo).toBe('Servicios prestados');
  });

  it('un abogado minuta conceptos', () => {
    const v = vocabularioDe('abogacia');
    expect(v.usaBultos).toBe(false);
    expect(v.linea).toBe('concepto');
  });

  it('un fontanero factura mano de obra y material en la misma hoja', () => {
    const v = vocabularioDe('fontaneria');
    expect(v.titulo).toBe('Mano de obra y materiales');
    expect(v.usaBultos).toBe(false);
  });

  it('una empresa de reparto sí cuenta bultos, aunque su grupo no los use', () => {
    // `transporte` va en el grupo «oficio», con el fontanero — pero lo que
    // descarga del camión y firma el cliente son bultos.
    expect(vocabularioDe('fontaneria').usaBultos).toBe(false);
    expect(vocabularioDe('transporte').usaBultos).toBe(true);
    expect(vocabularioDe('transporte').contenido[1]).toBe('unidades');
  });

  it('sin sector configurado factura como hasta ahora: como un comercio', () => {
    const v = vocabularioDe(undefined);
    expect(v.usaBultos).toBe(true);
    expect(v.titulo).toBe('Productos y conceptos');
  });

  it('cada sector del programa tiene palabras, no sólo los que se listan aparte', () => {
    for (const sector of BUSINESS_SECTORS) {
      const v = vocabularioDe(sector.value);
      expect(v.titulo, sector.value).toBeTruthy();
      expect(v.linea, sector.value).toBeTruthy();
      expect(v.cantidad, sector.value).toBeTruthy();
    }
  });

  it('quien no usa bultos no arrastra una etiqueta de bulto vacía a medias', () => {
    for (const sector of BUSINESS_SECTORS) {
      const v = vocabularioDe(sector.value);
      if (v.usaBultos) expect(v.bultoCorto, sector.value).toBeTruthy();
    }
  });
});

describe('conPlural', () => {
  it('usa el singular con uno y el plural con el resto', () => {
    expect(conPlural(1, ['bulto', 'bultos'])).toBe('1 bulto');
    expect(conPlural(12, ['bulto', 'bultos'])).toBe('12 bultos');
    expect(conPlural(0, ['bulto', 'bultos'])).toBe('0 bultos');
  });

  it('respeta las palabras del oficio', () => {
    expect(conPlural(1, vocabularioDe('psicologia').contenido)).toBe('1 sesión');
    expect(conPlural(3, vocabularioDe('psicologia').contenido)).toBe('3 sesiones');
  });
});
