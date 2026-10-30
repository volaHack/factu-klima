import { describe, it, expect } from 'vitest';
import {
  leerMemoria, recordarFicha, alternarFijada, olvidarFicha, estaFijada, fichaDeRuta, claveMemoria,
  MAX_RECIENTES, MAX_FIJADAS, type AlmacenTexto,
} from './memoriaFichas';

function almacenDePrueba(): AlmacenTexto & { datos: Map<string, string> } {
  const datos = new Map<string, string>();
  return { datos, getItem: k => datos.get(k) ?? null, setItem: (k, v) => { datos.set(k, v); } };
}

const ficha = (n: number) => ({ clave: `cliente:${n}`, tipo: 'cliente' as const, titulo: `Cliente ${n}`, href: `/clientes/${n}` });

describe('memoria de fichas', () => {
  it('lo último abierto va primero, sin repetirse, y con un tope', () => {
    const a = almacenDePrueba();
    for (let i = 0; i < MAX_RECIENTES + 3; i++) recordarFicha('cta', ficha(i), i, a);
    recordarFicha('cta', ficha(5), 100, a);
    const { recientes } = leerMemoria('cta', a);
    expect(recientes).toHaveLength(MAX_RECIENTES);
    expect(recientes[0].clave).toBe('cliente:5');
    expect(recientes.filter(r => r.clave === 'cliente:5')).toHaveLength(1);
  });

  it('cada cuenta tiene lo suyo', () => {
    const a = almacenDePrueba();
    recordarFicha('una', ficha(1), 1, a);
    expect(leerMemoria('otra', a).recientes).toEqual([]);
    expect(a.datos.has(claveMemoria('una'))).toBe(true);
  });

  it('la estrella fija y desfija; con la lista llena sale la más antigua', () => {
    const a = almacenDePrueba();
    let m = alternarFijada('cta', ficha(1), 1, a);
    expect(estaFijada(m, 'cliente:1')).toBe(true);
    m = alternarFijada('cta', ficha(1), 2, a);
    expect(estaFijada(m, 'cliente:1')).toBe(false);
    for (let i = 0; i < MAX_FIJADAS + 1; i++) m = alternarFijada('cta', ficha(i), i, a);
    expect(m.fijadas).toHaveLength(MAX_FIJADAS);
    expect(estaFijada(m, 'cliente:0')).toBe(false);
  });

  it('al volver a abrir una fijada se le pone al día el título', () => {
    const a = almacenDePrueba();
    alternarFijada('cta', ficha(1), 1, a);
    recordarFicha('cta', { ...ficha(1), titulo: 'Bar Pepe' }, 5, a);
    expect(leerMemoria('cta', a).fijadas[0]).toMatchObject({ titulo: 'Bar Pepe', cuando: 1 });
  });

  it('olvidar quita de las dos listas', () => {
    const a = almacenDePrueba();
    recordarFicha('cta', ficha(1), 1, a);
    alternarFijada('cta', ficha(1), 1, a);
    const m = olvidarFicha('cta', 'cliente:1', a);
    expect(m).toEqual({ recientes: [], fijadas: [] });
  });

  it('lo guardado roto o con enlaces raros no se pinta', () => {
    const a = almacenDePrueba();
    a.setItem(claveMemoria('cta'), JSON.stringify({ recientes: [{ ...ficha(1), cuando: 1 }, { ...ficha(2), href: 'javascript:alert(1)', cuando: 1 }, { ...ficha(3), href: '//otro.sitio', cuando: 1 }], fijadas: 'nada' }));
    expect(leerMemoria('cta', a).recientes.map(r => r.clave)).toEqual(['cliente:1']);
    a.setItem(claveMemoria('cta'), '{roto');
    expect(leerMemoria('cta', a)).toEqual({ recientes: [], fijadas: [] });
  });

  it('sin almacenamiento, o si falla, no se rompe nada', () => {
    expect(leerMemoria('cta', null)).toEqual({ recientes: [], fijadas: [] });
    const roto: AlmacenTexto = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('lleno'); } };
    expect(() => recordarFicha('cta', ficha(1), 1, roto)).not.toThrow();
  });

  it('reconoce las fichas por su dirección, pero no las de crear', () => {
    expect(fichaDeRuta('/facturas/abc')).toEqual({ tipo: 'factura', id: 'abc' });
    expect(fichaDeRuta('/facturas/abc/editar')).toEqual({ tipo: 'factura', id: 'abc' });
    expect(fichaDeRuta('/documentos/d1')).toEqual({ tipo: 'documento', id: 'd1' });
    expect(fichaDeRuta('/clientes/c1')).toEqual({ tipo: 'cliente', id: 'c1' });
    expect(fichaDeRuta('/facturas/nueva')).toBeNull();
    expect(fichaDeRuta('/documentos/historico')).toBeNull();
    expect(fichaDeRuta('/facturas')).toBeNull();
    expect(fichaDeRuta('/documentos/historico/x1')).toBeNull();
  });
});
