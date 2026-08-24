import { describe, it, expect } from 'vitest';
import {
  FICHAS, PANEL_POR_DEFECTO, alternarFicha, fichasDisponibles, fichasVisibles, mover,
  type FichaId,
} from './panel';

/**
 * Las fichas que el Dashboard sabe pintar hoy.
 *
 * El panel se guardaba pero no lo leía nadie: podías ordenar y apagar
 * fichas en Ajustes y el Dashboard salía siempre igual. Ahora manda lo
 * guardado, y eso abre dos maneras nuevas de romperlo que estas pruebas
 * cierran: dejar en el panel por defecto una ficha que el Dashboard no
 * sabe dibujar (hueco silencioso), o quitar del panel por defecto una
 * que sí dibuja (desaparece para todos sin que nadie lo pida).
 */
const PINTA_EL_DASHBOARD: FichaId[] = [
  'facturado_mes',
  'pendiente_cobro',
  'vencido',
  'estado_verifactu',
  'evolucion_ventas',
  'ultimas_facturas',
  'clientes_top',
  'productos_top',
  'proximos_vencimientos',
];

describe('el panel por defecto', () => {
  it('sólo trae fichas que el Dashboard sabe pintar', () => {
    for (const id of PANEL_POR_DEFECTO) {
      expect(PINTA_EL_DASHBOARD, `«${id}» está por defecto y el Dashboard no la dibuja`).toContain(id);
    }
  });

  it('trae TODAS las que el Dashboard dibuja', () => {
    // Si se añade un bloque al Dashboard y se olvida esta lista, ese
    // bloque no lo ve nadie hasta que lo active a mano.
    for (const id of PINTA_EL_DASHBOARD) {
      expect(PANEL_POR_DEFECTO, `el Dashboard dibuja «${id}» y no está por defecto`).toContain(id);
    }
  });

  it('no repite ninguna', () => {
    expect(new Set(PANEL_POR_DEFECTO).size).toBe(PANEL_POR_DEFECTO.length);
  });

  it('todas existen en el catálogo', () => {
    const catalogo = new Set(FICHAS.map(f => f.id));
    for (const id of PANEL_POR_DEFECTO) expect(catalogo.has(id), id).toBe(true);
  });

  it('ninguna de las de salida depende de un módulo que haya que encender', () => {
    // Quien entra nuevo no tiene módulos configurados: si una ficha de
    // salida dependiera de uno, su panel arrancaría con un hueco.
    const porId = new Map(FICHAS.map(f => [f.id, f]));
    for (const id of PANEL_POR_DEFECTO) {
      expect(porId.get(id)?.requiere, `«${id}» exige un módulo`).toBeUndefined();
    }
  });
});

describe('fichasVisibles', () => {
  it('sin panel guardado devuelve el de salida, en su orden', () => {
    expect(fichasVisibles(undefined, []).map(f => f.id)).toEqual(PANEL_POR_DEFECTO);
  });

  it('respeta el orden que dejó puesto la empresa', () => {
    const alReves = [...PANEL_POR_DEFECTO].reverse();
    expect(fichasVisibles(alReves, []).map(f => f.id)).toEqual(alReves);
  });

  it('descarta la ficha cuyo módulo está apagado', () => {
    // Colocar «albaranes sin facturar» sin el módulo de albaranes daría
    // una ficha en cero para siempre.
    const conAlbaranes = fichasVisibles(['facturado_mes', 'albaranes_sin_facturar'], ['albaranes']);
    const sinAlbaranes = fichasVisibles(['facturado_mes', 'albaranes_sin_facturar'], []);
    expect(conAlbaranes.map(f => f.id)).toContain('albaranes_sin_facturar');
    expect(sinAlbaranes.map(f => f.id)).not.toContain('albaranes_sin_facturar');
  });

  it('un panel vacío deja el panel vacío, no lo rellena solo', () => {
    // Apagarlas todas es una decisión, no un error que haya que corregir.
    expect(fichasVisibles([], [])).toHaveLength(0);
  });

  it('se salta una ficha guardada que ya no existe en el catálogo', () => {
    expect(fichasVisibles(['facturado_mes', 'inventada' as FichaId], []).map(f => f.id))
      .toEqual(['facturado_mes']);
  });
});

describe('fichasDisponibles', () => {
  it('esconde las que piden un módulo apagado', () => {
    const sinNada = fichasDisponibles([]).map(f => f.id);
    expect(sinNada).toContain('facturado_mes');
    expect(sinNada).not.toContain('albaranes_sin_facturar');
  });
});

describe('mover y alternar', () => {
  it('sube y baja una ficha sin perder ninguna', () => {
    const panel: FichaId[] = ['facturado_mes', 'vencido', 'clientes_top'];
    expect(mover(panel, 'vencido', -1)).toEqual(['vencido', 'facturado_mes', 'clientes_top']);
    expect(mover(panel, 'vencido', 1)).toEqual(['facturado_mes', 'clientes_top', 'vencido']);
  });

  it('en los extremos no hace nada en vez de reventar', () => {
    const panel: FichaId[] = ['facturado_mes', 'vencido'];
    expect(mover(panel, 'facturado_mes', -1)).toEqual(panel);
    expect(mover(panel, 'vencido', 1)).toEqual(panel);
  });

  it('alternar pone la que falta y quita la que está', () => {
    expect(alternarFicha(['facturado_mes'], 'vencido')).toEqual(['facturado_mes', 'vencido']);
    expect(alternarFicha(['facturado_mes', 'vencido'], 'vencido')).toEqual(['facturado_mes']);
  });
});
