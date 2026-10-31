import { describe, it, expect, beforeEach } from 'vitest';
import {
  MEMORIA_VACIA, avisosDeTanda, claveMemoria, guardarMemoria, leerMemoria, leerPreferencias, guardarPreferencias,
  marcarAvisados, marcarVistos, novedades, recordar, textoAviso,
} from './avisoPedidos';
import type { PedidoEnCola } from './prepararPedidos';

const pedido = (id: string, extra: Partial<PedidoEnCola> = {}): PedidoEnCola => ({
  origen: 'documento', id, tipo: 'pedido', numero: `PED-${id}`, clienteId: id, cliente: `Cliente ${id}`, direccion: '',
  fecha: '2026-10-31', creado: `2026-10-31T08:0${id}:00Z`, ruta: null,
  lineas: [{ id: 'l', productId: 'p', nombre: 'x', ref: '', unidad: 'ud', unidades: 1, udsCaja: null, cajas: 0, sueltas: 1 }],
  preparado: null, notas: '', ...extra,
});

describe('qué es nuevo', () => {
  it('la primera vez no avisa de lo que ya había, pero sí lo cuenta sin ver', () => {
    const n = novedades([pedido('1'), pedido('2')], MEMORIA_VACIA);
    expect(n.paraAvisar).toEqual([]);
    expect(n.sinVer).toBe(2);
    expect(n.memoria.iniciada).toBe(true);
    expect(n.memoria.avisados).toEqual(['1', '2']);
  });

  it('después, avisa una vez de cada pedido que entra, por orden de llegada', () => {
    const inicio = novedades([pedido('1')], MEMORIA_VACIA).memoria;
    const n = novedades([pedido('3'), pedido('1'), pedido('2')], inicio);
    expect(n.paraAvisar.map(p => p.id)).toEqual(['2', '3']);
    // La misma cola otra vez no vuelve a avisar.
    expect(novedades([pedido('3'), pedido('1'), pedido('2')], n.memoria).paraAvisar).toEqual([]);
  });

  it('lo visto en la cola deja de contar en el menú, pero avisa igual si aún no lo hizo', () => {
    // La cola abierta en la tablet ve el pedido antes de que llegue el aviso:
    // el aviso tiene que salir de todas formas, es lo que se oye.
    let m = novedades([pedido('1')], MEMORIA_VACIA).memoria;
    m = marcarVistos(m, ['1', '2']);
    const n = novedades([pedido('1'), pedido('2'), pedido('3')], m);
    expect(n.sinVer).toBe(1);
    expect(n.paraAvisar.map(p => p.id)).toEqual(['2', '3']);
  });

  it('lo guardado en este equipo no avisa a quien lo acaba de escribir', () => {
    const m = marcarAvisados(novedades([], MEMORIA_VACIA).memoria, ['mio']);
    const n = novedades([pedido('mio')], m);
    expect(n.paraAvisar).toEqual([]);
    expect(n.sinVer).toBe(1);
  });
});

describe('recordar', () => {
  it('sin repetir y con tope: se olvida lo más antiguo', () => {
    expect(recordar(['a', 'b'], ['b', 'c', 'c'])).toEqual(['a', 'b', 'c']);
    expect(recordar(['a', 'b', 'c'], ['d'], 3)).toEqual(['b', 'c', 'd']);
  });
});

describe('el texto del aviso', () => {
  it('«Nuevo pedido de Bar Pepe · 6 líneas»', () => {
    const p = pedido('1', { cliente: 'Bar Pepe', lineas: Array(6).fill(pedido('x').lineas[0]) });
    expect(textoAviso(p).titulo).toBe('Nuevo pedido de Bar Pepe · 6 líneas');
    expect(textoAviso({ ...p, tipo: 'albaran', lineas: p.lineas.slice(0, 1) }).titulo).toBe('Nuevo albarán de Bar Pepe · 1 línea');
  });

  it('hasta tres, uno por pedido; más, uno que los resume', () => {
    expect(avisosDeTanda([pedido('1'), pedido('2'), pedido('3')])).toHaveLength(3);
    const [resumen, ...resto] = avisosDeTanda(['1', '2', '3', '4', '5'].map(id => pedido(id)));
    expect(resto).toEqual([]);
    expect(resumen.titulo).toBe('5 pedidos nuevos para preparar');
    expect(resumen.mensaje).toBe('Cliente 1, Cliente 2, Cliente 3 y 2 más');
  });
});

describe('en localStorage, por cuenta', () => {
  const almacen = new Map<string, string>();
  beforeEach(() => {
    almacen.clear();
    globalThis.localStorage = {
      getItem: (k: string) => almacen.get(k) ?? null,
      setItem: (k: string, v: string) => { almacen.set(k, v); },
      removeItem: (k: string) => { almacen.delete(k); },
      clear: () => almacen.clear(), key: () => null, length: 0,
    } as Storage;
  });

  it('cada cuenta tiene su memoria', () => {
    guardarMemoria('cuenta-a', { iniciada: true, avisados: ['1'], vistos: ['1'] });
    expect(leerMemoria('cuenta-a').vistos).toEqual(['1']);
    expect(leerMemoria('cuenta-b')).toEqual(MEMORIA_VACIA);
    expect(almacen.has(claveMemoria('cuenta-a'))).toBe(true);
  });

  it('lo guardado roto se lee como vacío', () => {
    almacen.set(claveMemoria('x'), '{roto');
    expect(leerMemoria('x')).toEqual(MEMORIA_VACIA);
    almacen.set(claveMemoria('x'), JSON.stringify({ iniciada: true, avisados: [1, 2], vistos: 'no' }));
    expect(leerMemoria('x')).toEqual({ iniciada: true, avisados: [], vistos: [] });
  });

  it('los avisos y el sonido salen encendidos y se apagan por separado', () => {
    expect(leerPreferencias()).toEqual({ avisos: true, sonido: true });
    guardarPreferencias({ avisos: true, sonido: false });
    expect(leerPreferencias()).toEqual({ avisos: true, sonido: false });
  });

  it('sin localStorage no revienta', () => {
    // @ts-expect-error: un navegador con el almacenamiento bloqueado
    globalThis.localStorage = undefined;
    expect(leerMemoria('x')).toEqual(MEMORIA_VACIA);
    expect(() => guardarMemoria('x', MEMORIA_VACIA)).not.toThrow();
    expect(leerPreferencias()).toEqual({ avisos: true, sonido: true });
  });
});
