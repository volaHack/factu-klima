import { describe, it, expect } from 'vitest';
import { vocabularioDe, conPlural } from './vocabulario';
import { BUSINESS_SECTORS } from './constants';
import { oficioParaSector } from './plantillas/desdeCero';

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

describe('el formulario y la factura impresa dicen lo mismo', () => {
  it('lo que se cuenta en cada línea sale del oficio, no de una tabla aparte', () => {
    // El fallo que motivó unirlos: el oficio del perito declaraba «Horas» y
    // su factura impresa lo decía, pero el formulario mostraba «Cantidad»
    // porque leía una tabla propia por grupo de sector.
    for (const sector of BUSINESS_SECTORS) {
      expect(vocabularioDe(sector.value).cantidad, sector.value)
        .toBe(oficioParaSector(sector.value).unidad);
    }
  });

  it.each([
    ['peritaje', 'Horas'],
    ['abogacia', 'Horas'],
    ['ingenieria', 'Horas'],
    ['informatica', 'Horas'],
    ['limpieza', 'Horas'],
    ['clases', 'Horas'],
    ['eventos', 'Horas'],
    ['traduccion', 'Palabras'],
    ['psicologia', 'Sesiones'],
    ['fisioterapia', 'Sesiones'],
    ['estetica', 'Sesiones'],
    ['alimentacion', 'Cajas'],
    ['mayorista', 'Cajas'],
    ['supermercado', 'Cantidad'],
  ])('en %s cada línea se cuenta en «%s»', (sector, unidad) => {
    expect(vocabularioDe(sector as never).cantidad).toBe(unidad);
  });

  it('cada oficio trae sus casillas propias de línea', () => {
    // Un abogado necesita el expediente y un taller las horas de mano de
    // obra; sin esto la casilla sólo aparecía si la plantilla activa ya la
    // llevaba, o sea nunca hasta diseñar el impreso.
    expect(vocabularioDe('abogacia').columnasOficio.map(c => c.cabecera)).toContain('Expediente');
    expect(vocabularioDe('taller').columnasOficio.map(c => c.cabecera)).toContain('Horas');
    expect(vocabularioDe('dental').columnasOficio.map(c => c.cabecera)).toContain('Pieza');
    expect(vocabularioDe('psicologia').columnasOficio.map(c => c.cabecera)).toContain('Modalidad');
    expect(vocabularioDe('reformas').columnasOficio.map(c => c.cabecera)).toContain('m²');
  });

  it('las casillas usan la clave que la plantilla les da al imprimirlas', () => {
    // Si aquí se numeraran distinto que en `tablaDelOficio`, lo escrito en
    // «Expediente» saldría impreso bajo otra columna.
    for (const sector of BUSINESS_SECTORS) {
      vocabularioDe(sector.value).columnasOficio.forEach((col, i) => {
        expect(col.clave, sector.value).toBe(`custom_col_${i + 1}`);
      });
    }
  });

  it('quien no tiene casillas propias no arrastra ninguna vacía', () => {
    expect(vocabularioDe('asesoria').columnasOficio).toHaveLength(0);
    expect(vocabularioDe('ingenieria').columnasOficio).toHaveLength(0);
  });
});

describe('los datos que pide cada oficio en la cabecera', () => {
  it('un taller pregunta por la matrícula, no por «Dato libre 2»', () => {
    const etiquetas = vocabularioDe('taller').rotulosOficio.map(r => r.etiqueta);
    expect(etiquetas).toContain('Matrícula');
    expect(etiquetas).toContain('Kilometraje');
  });

  it('cada oficio pide lo suyo', () => {
    const de = (s: string) => vocabularioDe(s as never).rotulosOficio.map(r => r.etiqueta);
    expect(de('medicina')).toContain('Nº de colegiado');
    expect(de('abogacia')).toContain('Nº de expediente');
    expect(de('reformas')).toContain('Nº de obra');
    expect(de('transporte')).toContain('Origen');
    expect(de('inmobiliaria')).toContain('Inmueble');
  });

  it('los avisos legales no se convierten en una casilla que rellenar', () => {
    // «Servicio exento de IVA (art. 20.Uno.3º LIVA)» es una frase que se
    // imprime, no un hueco. Si entrara aquí, el formulario pediría al
    // fisioterapeuta que «rellenara» su exención.
    for (const sector of ['fisioterapia', 'psicologia', 'medicina', 'dental']) {
      const etiquetas = vocabularioDe(sector as never).rotulosOficio.map(r => r.etiqueta);
      expect(etiquetas.some(e => e.includes('exento')), sector).toBe(false);
    }
  });

  it('las claves no pasan de las cinco que existen en el contrato', () => {
    // Sólo hay custom_1..custom_5. Un custom_6 lo rechazaría el revisor
    // al guardar la plantilla.
    for (const sector of BUSINESS_SECTORS) {
      for (const r of vocabularioDe(sector.value).rotulosOficio) {
        expect(['custom_1','custom_2','custom_3','custom_4','custom_5'], sector.value).toContain(r.clave);
      }
    }
  });

  it('van numeradas en orden y sin saltos', () => {
    for (const sector of BUSINESS_SECTORS) {
      vocabularioDe(sector.value).rotulosOficio.forEach((r, i) => {
        expect(r.clave, sector.value).toBe(`custom_${i + 1}`);
      });
    }
  });
});
