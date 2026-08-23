import { describe, it, expect } from 'vitest';
import {
  MODULOS, GRUPOS_MODULO, modulosPorDefecto, encender, apagar, tieneModulo,
  type ModuloId,
} from './modulos';
import {
  FICHAS, PANEL_POR_DEFECTO, fichasDisponibles, fichasVisibles, mover, alternarFicha,
} from './panel';
import { BUSINESS_SECTORS } from './constants';

describe('el catálogo de módulos', () => {
  it('no hay dos con el mismo identificador', () => {
    const ids = MODULOS.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('todos caen en un grupo que existe', () => {
    const grupos = new Set(GRUPOS_MODULO.map(g => g.id));
    for (const m of MODULOS) {
      expect(grupos, `${m.id} apunta a un grupo inexistente`).toContain(m.grupo);
    }
  });

  it('lo que un módulo necesita también es un módulo', () => {
    const ids = new Set(MODULOS.map(m => m.id));
    for (const m of MODULOS) {
      for (const req of m.requiere ?? []) {
        expect(ids, `${m.id} necesita ${req}, que no existe`).toContain(req);
      }
    }
  });

  it('ninguno se necesita a sí mismo, ni en círculo', () => {
    // Una dependencia circular cuelga el encendido en cadena.
    const porId = new Map(MODULOS.map(m => [m.id, m]));
    for (const inicio of MODULOS) {
      const vistos = new Set<ModuloId>();
      const cola = [...(inicio.requiere ?? [])];
      while (cola.length > 0) {
        const actual = cola.pop()!;
        expect(actual, `${inicio.id} depende de sí mismo`).not.toBe(inicio.id);
        if (vistos.has(actual)) continue;
        vistos.add(actual);
        cola.push(...(porId.get(actual)?.requiere ?? []));
      }
    }
  });

  it('cada uno explica qué gana quien lo enciende', () => {
    // Un interruptor sin explicación no se toca, y un módulo que nadie toca
    // es un módulo que no existe.
    for (const m of MODULOS) {
      expect(m.descripcion.length, `${m.id} no explica nada`).toBeGreaterThan(30);
    }
  });
});

describe('encender y apagar en cadena', () => {
  it('encender las comisiones enciende los vendedores', () => {
    // Comisiones sin vendedores es una pantalla vacía: no hay a quién
    // comisionar.
    expect(encender([], 'comisiones')).toEqual(expect.arrayContaining(['comisiones', 'vendedores']));
  });

  it('apagar los vendedores apaga las comisiones', () => {
    // Dejarlas encendidas deja un menú que no puede funcionar.
    const activos: ModuloId[] = ['vendedores', 'comisiones', 'tarifas'];
    const despues = apagar(activos, 'vendedores');
    expect(despues).not.toContain('comisiones');
    expect(despues).not.toContain('vendedores');
    // Y no se lleva por delante lo que no dependía de él.
    expect(despues).toContain('tarifas');
  });

  it('apagar arrastra también lo que dependía en segundo grado', () => {
    // vehiculos necesita gastos; apagar gastos tiene que llevarse vehiculos.
    const despues = apagar(['gastos', 'vehiculos'], 'gastos');
    expect(despues).toEqual([]);
  });

  it('encender dos veces no duplica', () => {
    expect(encender(['tarifas'], 'tarifas')).toEqual(['tarifas']);
  });

  it('apagar algo que no estaba no rompe nada', () => {
    expect(apagar(['tarifas'], 'lotes')).toEqual(['tarifas']);
  });
});

describe('con qué arranca cada sector', () => {
  it('todos los sectores tienen algo encendido', () => {
    // Un sector que arranca sin módulos deja la aplicación pelada.
    for (const s of BUSINESS_SECTORS) {
      expect(modulosPorDefecto(s.value).length, `${s.value} arranca vacío`).toBeGreaterThan(0);
    }
  });

  it('sólo se encienden módulos que existen de verdad', () => {
    // Anunciar un menú que abre una pantalla en blanco es peor que no
    // anunciarlo. Los que están por construir no se encienden solos.
    const construidos = new Set(MODULOS.filter(m => m.disponible).map(m => m.id));
    for (const s of BUSINESS_SECTORS) {
      for (const id of modulosPorDefecto(s.value)) {
        expect(construidos, `${s.value} enciende ${id}, que aún no existe`).toContain(id);
      }
    }
  });

  it('lo que arranca encendido trae también lo que necesita', () => {
    const porId = new Map(MODULOS.map(m => [m.id, m]));
    for (const s of BUSINESS_SECTORS) {
      const activos = new Set(modulosPorDefecto(s.value));
      for (const id of activos) {
        for (const req of porId.get(id)?.requiere ?? []) {
          // Sólo se exige si el requisito está construido; si no, el propio
          // módulo tampoco se enciende.
          if (!porId.get(req)?.disponible) continue;
          expect(activos, `${s.value}: ${id} necesita ${req} y no está`).toContain(req);
        }
      }
    }
  });

  it('una asesoría no arranca con almacén, y una distribuidora sí', () => {
    // Es la prueba de que los valores de salida están pensados y no copiados.
    expect(modulosPorDefecto('asesoria')).not.toContain('almacenes');
    expect(modulosPorDefecto('alimentacion')).toContain('almacenes');
  });

  it('quien no ha elegido sector arranca con lo básico', () => {
    expect(modulosPorDefecto(undefined).length).toBeGreaterThan(0);
  });
});

describe('el panel que cada empresa se monta', () => {
  it('no hay dos fichas con el mismo identificador', () => {
    const ids = FICHAS.map(f => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('lo que una ficha necesita es un módulo que existe', () => {
    const ids = new Set(MODULOS.map(m => m.id));
    for (const f of FICHAS) {
      if (f.requiere) expect(ids, `la ficha ${f.id} pide ${f.requiere}`).toContain(f.requiere);
    }
  });

  it('las fichas del panel de salida no dependen de ningún módulo', () => {
    // Si dependieran, quien arranca con pocos módulos vería un panel vacío
    // el primer día.
    for (const id of PANEL_POR_DEFECTO) {
      expect(FICHAS.find(f => f.id === id)?.requiere, `${id} depende de un módulo`).toBeUndefined();
    }
  });

  it('una ficha de almacén no se ofrece a quien no tiene almacén', () => {
    const sinAlmacen = fichasDisponibles(['presupuestos']).map(f => f.id);
    expect(sinAlmacen).not.toContain('sin_movimiento');

    const conAlmacen = fichasDisponibles(['almacenes']).map(f => f.id);
    expect(conAlmacen).toContain('sin_movimiento');
  });

  it('una ficha huérfana desaparece del panel pero no de los ajustes', () => {
    // Si el módulo se vuelve a encender, la ficha vuelve donde estaba en vez
    // de haber que recolocarla.
    const panel = ['facturado_mes', 'sin_movimiento', 'vencido'] as const;
    const visibles = fichasVisibles([...panel], []).map(f => f.id);
    expect(visibles).toEqual(['facturado_mes', 'vencido']);

    const conModulo = fichasVisibles([...panel], ['almacenes']).map(f => f.id);
    expect(conModulo).toEqual(['facturado_mes', 'sin_movimiento', 'vencido']);
  });

  it('el panel se pinta en el orden que se guardó', () => {
    const visibles = fichasVisibles(['vencido', 'facturado_mes'], []).map(f => f.id);
    expect(visibles).toEqual(['vencido', 'facturado_mes']);
  });

  it('sin panel guardado se usa el de salida', () => {
    expect(fichasVisibles(undefined, []).map(f => f.id)).toEqual([...PANEL_POR_DEFECTO]);
  });

  it('mover una ficha la intercambia con su vecina', () => {
    expect(mover(['a', 'b', 'c'] as never, 'b' as never, -1)).toEqual(['b', 'a', 'c']);
    expect(mover(['a', 'b', 'c'] as never, 'b' as never, 1)).toEqual(['a', 'c', 'b']);
  });

  it('mover la primera hacia arriba no hace nada', () => {
    // Sin esto se sale del array y desaparece una ficha.
    expect(mover(['a', 'b'] as never, 'a' as never, -1)).toEqual(['a', 'b']);
    expect(mover(['a', 'b'] as never, 'b' as never, 1)).toEqual(['a', 'b']);
  });

  it('poner y quitar una ficha', () => {
    expect(alternarFicha([], 'vencido')).toEqual(['vencido']);
    expect(alternarFicha(['vencido'], 'vencido')).toEqual([]);
  });

  it('la ficha que se añade va al final, no al principio', () => {
    // Colarla arriba descoloca lo que el usuario ya había ordenado.
    expect(alternarFicha(['facturado_mes'], 'vencido')).toEqual(['facturado_mes', 'vencido']);
  });

  it('cada ficha explica qué contesta', () => {
    for (const f of FICHAS) {
      expect(f.explica.length, `la ficha ${f.id} no explica nada`).toBeGreaterThan(25);
    }
  });
});

describe('tieneModulo', () => {
  it('dice que no cuando no hay nada configurado', () => {
    expect(tieneModulo(undefined, 'lotes')).toBe(false);
  });

  it('dice que sí cuando está encendido', () => {
    expect(tieneModulo(['lotes'], 'lotes')).toBe(true);
  });
});
