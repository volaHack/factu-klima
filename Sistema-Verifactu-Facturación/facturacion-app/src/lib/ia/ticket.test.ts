import { describe, expect, it } from 'vitest';
import { interpretarTicket, instruccionesTicket } from './ticket';
import { cuerpoOpenAI } from './cliente';

const HOY = '2026-09-24';
const leer = (o: unknown, igic = false) => interpretarTicket(JSON.stringify(o), igic, HOY);

describe('ticket', () => {
  it('un ticket bien leído pasa tal cual', () => {
    const t = leer({ proveedor: 'Ferretería López', nif: 'B12345674', fecha: '2026-09-20', concepto: 'Tornillería', categoria: 'material', base: 10, tipo: 21, cuota: 2.1, total: 12.1 });
    expect(t).toMatchObject({ proveedor: 'Ferretería López', nif: 'B12345674', fecha: '2026-09-20', categoria: 'material', base: 10, tipo: 21, cuota: 2.1, total: 12.1 });
    expect(t.avisos).toEqual([]);
  });

  it('si no cuadra, manda el total', () => {
    const t = leer({ base: 10, tipo: 21, cuota: 7.1, total: 12.1 });
    expect(t).toMatchObject({ base: 10, cuota: 2.1, total: 12.1 });
    expect(t.avisos[0]).toMatch(/recalculado/);
  });

  it('sólo el total: se desglosa sin aviso', () => {
    const t = leer({ tipo: 10, total: 22 });
    expect(t).toMatchObject({ base: 20, cuota: 2, total: 22 });
    expect(t.avisos).toEqual([]);
  });

  it('tipo que no existe: el más cercano, o el general con aviso', () => {
    expect(leer({ base: 100, tipo: 20.8, cuota: 21, total: 121 }).tipo).toBe(21);
    const t = leer({ tipo: 13, total: 50 });
    expect(t.tipo).toBe(21);
    expect(t.avisos.join()).toMatch(/tipo/);
    expect(leer({ tipo: 7, total: 10.7 }, true).tipo).toBe(7);
  });

  it('NIF mal leído, fecha rara o del futuro: fuera, con aviso', () => {
    const t = leer({ nif: 'B12345670', fecha: '2027-01-01', total: 5, tipo: 21 });
    expect(t.nif).toBeUndefined();
    expect(t.fecha).toBeUndefined();
    expect(t.avisos).toHaveLength(2);
    expect(leer({ nif: 'ES-B12345674', total: 1, tipo: 21 }).nif).toBe('B12345674');
  });

  it('importes como texto y JSON envuelto', () => {
    const t = interpretarTicket('Aquí está:\n{"total": "12,10", "tipo": "21", "categoria": "Suministros"}', false, HOY);
    expect(t).toMatchObject({ total: 12.1, base: 10, categoria: 'suministros' });
  });

  it('las instrucciones hablan de IGIC en Canarias', () => {
    expect(instruccionesTicket(true, HOY)).toContain('IGIC');
    expect(instruccionesTicket(false, HOY)).not.toContain('IGIC');
  });
});

describe('peticiones con imagen', () => {
  it('formato OpenAI: texto e imagen en el mismo mensaje, con el modelo de visión', () => {
    const cuerpo = cuerpoOpenAI(
      { proveedor: 'local', baseUrl: 'http://x/v1', modelo: 'texto' },
      { instrucciones: 'lee', imagenes: [{ mime: 'image/jpeg', base64: 'QUJD' }], modelo: 'vision' },
    );
    expect(cuerpo.model).toBe('vision');
    expect(cuerpo.messages[0].content).toEqual([
      { type: 'text', text: 'lee' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' } },
    ]);
  });

  it('sin imagen, el mensaje sigue siendo texto', () => {
    const cuerpo = cuerpoOpenAI({ proveedor: 'local', baseUrl: 'http://x/v1', modelo: 'texto' }, { instrucciones: 'hola' });
    expect(cuerpo.messages[0].content).toBe('hola');
    expect(cuerpo.model).toBe('texto');
  });
});
