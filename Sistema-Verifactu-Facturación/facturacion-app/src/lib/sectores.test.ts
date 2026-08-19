import { describe, it, expect } from 'vitest';
import { BUSINESS_SECTORS, GRUPOS_SECTOR, SECTOR_DEFAULT_CATEGORIES } from './constants';
import { ICON_MAP } from '@/components/ui/CategoryIcon';

describe('los sectores de actividad', () => {
  it('no hay dos con la misma clave', () => {
    // Una clave repetida se guarda en los ajustes y luego no se sabe cuál
    // de las dos era.
    const claves = BUSINESS_SECTORS.map(s => s.value);
    expect(new Set(claves).size).toBe(claves.length);
  });

  it('todos pertenecen a un grupo que existe', () => {
    // Un sector con un grupo inventado no sale en el selector: se pierde.
    const grupos = new Set(GRUPOS_SECTOR.map(g => g.value));
    for (const s of BUSINESS_SECTORS) {
      expect(grupos, `${s.value} apunta a un grupo inexistente`).toContain(s.grupo);
    }
  });

  it('ningún grupo se queda vacío', () => {
    // Un encabezado sin nada debajo es una sección rota.
    for (const g of GRUPOS_SECTOR) {
      expect(BUSINESS_SECTORS.some(s => s.grupo === g.value), `${g.value} no tiene sectores`).toBe(true);
    }
  });

  it('todos tienen categorías o conceptos de fábrica', () => {
    // Sin esto, quien lo elige se encuentra el desplegable de familias vacío
    // y tiene que inventárselas.
    for (const s of BUSINESS_SECTORS) {
      const cats = SECTOR_DEFAULT_CATEGORIES[s.value];
      expect(cats, `${s.value} no tiene categorías`).toBeDefined();
      expect(cats.length, `${s.value} tiene la lista vacía`).toBeGreaterThan(2);
    }
  });

  it('dentro de un sector no se repite ninguna categoría', () => {
    for (const [sector, cats] of Object.entries(SECTOR_DEFAULT_CATEGORIES)) {
      const claves = cats.map(c => c.value);
      expect(new Set(claves).size, `${sector} repite alguna categoría`).toBe(claves.length);
    }
  });

  it('cada sector tiene una salida para lo que no encaje', () => {
    // Siempre hay algo que no entra en ninguna casilla; sin «otros» hay que
    // crear una categoría a mano para facturar una sola cosa rara.
    for (const [sector, cats] of Object.entries(SECTOR_DEFAULT_CATEGORIES)) {
      expect(cats.some(c => c.value === 'otros'), `${sector} no tiene «otros»`).toBe(true);
    }
  });
});

describe('los iconos', () => {
  it('todos los de los sectores están dados de alta', () => {
    // El resolutor devuelve una caja para los nombres que no conoce, así
    // que un icono sin registrar no rompe nada: sale mal y en silencio.
    for (const s of BUSINESS_SECTORS) {
      expect(ICON_MAP[s.icon], `el sector ${s.value} pide el icono ${s.icon}`).toBeDefined();
    }
  });

  it('y los de todas las categorías también', () => {
    for (const [sector, cats] of Object.entries(SECTOR_DEFAULT_CATEGORIES)) {
      for (const c of cats) {
        expect(ICON_MAP[c.icon], `${sector}/${c.value} pide el icono ${c.icon}`).toBeDefined();
      }
    }
  });
});

describe('los oficios que venden trabajo', () => {
  it('están todos los que se pidieron', () => {
    const claves = new Set(BUSINESS_SECTORS.map(s => s.value));
    for (const oficio of [
      'psicologia', 'medicina', 'dental', 'fisioterapia', 'nutricion', 'veterinaria',
      'abogacia', 'procuraduria', 'asesoria', 'peritaje', 'traduccion',
      'arquitectura', 'interiorismo', 'ingenieria', 'informatica', 'diseno',
      'fotografia', 'marketing', 'formacion', 'clases', 'freelance',
      'electricidad', 'fontaneria', 'reformas', 'taller', 'limpieza', 'transporte',
      'peluqueria', 'estetica', 'eventos', 'inmobiliaria',
    ]) {
      expect(claves, `falta ${oficio}`).toContain(oficio);
    }
  });

  it('los cinco de mercancía siguen ahí', () => {
    // Añadir no puede quitar: quien ya tenía un sector guardado se quedaría
    // sin categorías de golpe.
    const claves = new Set(BUSINESS_SECTORS.map(s => s.value));
    for (const viejo of ['alimentacion', 'supermercado', 'mayorista', 'bebidas', 'servicios_industriales']) {
      expect(claves, `se ha perdido ${viejo}`).toContain(viejo);
    }
  });

  it('sus conceptos hablan de trabajo, no de género', () => {
    // Un fontanero no factura «Frutas frescas»: factura mano de obra.
    const fontaneria = SECTOR_DEFAULT_CATEGORIES.fontaneria.map(c => c.value);
    expect(fontaneria).toContain('mano_obra');
    expect(fontaneria).toContain('desplazamiento');

    const abogacia = SECTOR_DEFAULT_CATEGORIES.abogacia.map(c => c.value);
    expect(abogacia).toContain('minuta');
    expect(abogacia).toContain('suplidos');
  });
});
