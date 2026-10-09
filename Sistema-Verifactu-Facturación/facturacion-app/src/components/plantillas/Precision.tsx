'use client';

/**
 * PRECISIÓN AL MILÍMETRO
 *
 * Lo que convierte el editor en una mesa de maquetar:
 *
 *   · `Regla`: regla en milímetros arriba y a la izquierda del papel, con
 *     una marca que sigue al ratón. Pulsar en ella saca una guía.
 *   · `ListaGuias`: las guías puestas, con su medida exacta editable.
 *   · `PanelForma`: el estilo de una raya, recuadro u óvalo.
 *
 * Todo mide en milímetros de papel; los píxeles salen de `pxPorMm`, que el
 * editor mide sobre el lienzo de verdad.
 */

import type { CSSProperties, PointerEvent as EventoPuntero, RefObject } from 'react';
import { Circle, Minus, Square, Trash2, X } from 'lucide-react';
import { redondearMm } from '@/lib/plantillas/editor';
import type { FormaDibujo, GuiaUsuario, TipoForma } from '@/lib/plantillas/tipos';

// ------------------------------------------------------------------
// Regla
// ------------------------------------------------------------------

export interface ReglaProps {
  readonly eje: 'x' | 'y';
  /** Lo que mide el papel en ese eje, en mm. */
  readonly longitud: number;
  readonly pxPorMm: number;
  /** Marca que sigue al cursor; el editor la mueve sin repintar. */
  readonly marcador: RefObject<HTMLSpanElement | null>;
  /** Pulsar en la regla: saca una guía en ese punto. */
  readonly onPulsar: (evento: EventoPuntero<HTMLDivElement>) => void;
}

export function Regla({ eje, longitud, pxPorMm, marcador, onPulsar }: ReglaProps) {
  // Con poco zoom no se pintan los milímetros sueltos: serían una mancha.
  const verMilimetros = pxPorMm >= 3;
  const cadaCuanto = pxPorMm * 10 >= 26 ? 10 : 20;
  const numeros: number[] = [];
  for (let mm = cadaCuanto; mm < longitud; mm += cadaCuanto) numeros.push(mm);

  const horizontal = eje === 'x';
  const capas = [
    verMilimetros ? { paso: pxPorMm, largo: '25%' } : null,
    { paso: pxPorMm * 5, largo: '45%' },
    { paso: pxPorMm * 10, largo: '100%' },
  ].filter(Boolean) as { paso: number; largo: string }[];

  const fondo: CSSProperties = horizontal
    ? {
      backgroundImage: capas.map(() => 'linear-gradient(to right, var(--regla-marca) 1px, transparent 1px)').join(','),
      backgroundSize: capas.map(c => `${c.paso}px ${c.largo}`).join(','),
      backgroundPosition: capas.map(() => '0 100%').join(','),
      backgroundRepeat: capas.map(() => 'repeat-x').join(','),
    }
    : {
      backgroundImage: capas.map(() => 'linear-gradient(to bottom, var(--regla-marca) 1px, transparent 1px)').join(','),
      backgroundSize: capas.map(c => `${c.largo} ${c.paso}px`).join(','),
      backgroundPosition: capas.map(() => '100% 0').join(','),
      backgroundRepeat: capas.map(() => 'repeat-y').join(','),
    };

  return (
    <div
      className={`plantilla-regla plantilla-regla--${eje}`}
      style={fondo}
      onPointerDown={onPulsar}
      title={horizontal ? 'Pulsa y arrastra para sacar una guía vertical' : 'Pulsa y arrastra para sacar una guía horizontal'}
      aria-hidden="true"
    >
      {numeros.map(mm => (
        <span
          key={mm}
          className="plantilla-regla-numero"
          style={horizontal ? { left: `${(mm / longitud) * 100}%` } : { top: `${(mm / longitud) * 100}%` }}
        >
          {mm}
        </span>
      ))}
      <span ref={marcador} className="plantilla-regla-cursor" />
    </div>
  );
}

// ------------------------------------------------------------------
// Guías
// ------------------------------------------------------------------

export interface ListaGuiasProps {
  readonly guias: readonly GuiaUsuario[];
  readonly onCambiar: (guias: GuiaUsuario[]) => void;
}

export function ListaGuias({ guias, onCambiar }: ListaGuiasProps) {
  if (guias.length === 0) return null;
  const ordenadas = [...guias].sort((a, b) => (a.eje === b.eje ? a.valor - b.valor : a.eje === 'x' ? -1 : 1));
  return (
    <div className="plantilla-guias-lista" aria-label="Guías">
      <span className="plantilla-guias-titulo">Guías</span>
      {ordenadas.map(g => (
        <label key={g.id} className="plantilla-guia-chip">
          <span>{g.eje === 'x' ? '↔' : '↕'}</span>
          <input
            type="number"
            className="form-input form-input-sm"
            step={0.1}
            value={redondearMm(g.valor)}
            aria-label={g.eje === 'x' ? 'Distancia de la guía al borde izquierdo, en mm' : 'Distancia de la guía al borde de arriba, en mm'}
            onChange={(e) => {
              const valor = Number(e.target.value);
              if (!Number.isFinite(valor)) return;
              onCambiar(guias.map(x => (x.id === g.id ? { ...x, valor: redondearMm(valor) } : x)));
            }}
          />
          <span>mm</span>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" title="Quitar la guía"
            onClick={() => onCambiar(guias.filter(x => x.id !== g.id))}>
            <X size={12} />
          </button>
        </label>
      ))}
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onCambiar([])}>Quitar todas</button>
    </div>
  );
}

// ------------------------------------------------------------------
// Formas
// ------------------------------------------------------------------

export const ICONO_FORMA: Record<TipoForma, typeof Square> = { linea: Minus, rectangulo: Square, elipse: Circle };
export const NOMBRE_FORMA: Record<TipoForma, string> = { linea: 'Línea', rectangulo: 'Recuadro', elipse: 'Óvalo' };

export function formaNueva(id: string, tipo: TipoForma, caja: { x: number; y: number; ancho: number; alto: number }): FormaDibujo {
  return {
    id, tipo, ...caja,
    color: '#1f1f1f',
    grosor: tipo === 'linea' ? 0.3 : 0.25,
    relleno: '',
    radio: 0,
  };
}

/** Estilo en pantalla de una forma, igual que saldrá en el PDF. */
export function estiloDeForma(forma: FormaDibujo, pxPorMm: number): CSSProperties {
  const grosorPx = Math.max(1, forma.grosor * pxPorMm);
  if (forma.tipo === 'linea') {
    const horizontal = forma.ancho >= forma.alto;
    return {
      background: `linear-gradient(${horizontal ? 'to bottom' : 'to right'}, transparent calc(50% - ${grosorPx / 2}px), ${forma.color} calc(50% - ${grosorPx / 2}px), ${forma.color} calc(50% + ${grosorPx / 2}px), transparent calc(50% + ${grosorPx / 2}px))`,
    };
  }
  return {
    background: forma.relleno || 'transparent',
    border: forma.grosor > 0 ? `${grosorPx}px solid ${forma.color}` : 'none',
    borderRadius: forma.tipo === 'elipse' ? '50%' : `${forma.radio * pxPorMm}px`,
  };
}

export interface PanelFormaProps {
  readonly forma: FormaDibujo;
  readonly onCambiar: (cambios: Partial<FormaDibujo>) => void;
  readonly onEliminar: () => void;
}

const color = (c: string, defecto: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : defecto);

export function PanelForma({ forma, onCambiar, onEliminar }: PanelFormaProps) {
  const Icono = ICONO_FORMA[forma.tipo];
  const horizontal = forma.ancho >= forma.alto;
  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h4 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icono size={14} /> {NOMBRE_FORMA[forma.tipo]}
          </h4>
          <p className="card-subtitle">Se imprime en todas las páginas, debajo de los datos.</p>
        </div>
        <button className="btn btn-ghost btn-icon btn-sm text-danger" onClick={onEliminar} title="Eliminar (Supr)"><Trash2 size={14} /></button>
      </div>

      <div className="plantilla-interruptor">
        {(Object.keys(NOMBRE_FORMA) as TipoForma[]).map(t => {
          const I = ICONO_FORMA[t];
          return (
            <button key={t} type="button" className={`btn btn-sm ${forma.tipo === t ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => onCambiar({ tipo: t })}>
              <I size={14} /> {NOMBRE_FORMA[t]}
            </button>
          );
        })}
      </div>

      <div className="plantilla-estilo">
        <label className="form-label" htmlFor="forma-color">{forma.tipo === 'linea' ? 'Color' : 'Color del borde'}</label>
        <input id="forma-color" className="form-input plantilla-color" type="color" value={color(forma.color, '#1f1f1f')}
          onChange={(e) => onCambiar({ color: e.target.value })} />

        <label className="form-label" htmlFor="forma-grosor">{forma.tipo === 'linea' ? 'Grueso (mm)' : 'Borde (mm)'}</label>
        <input id="forma-grosor" className="form-input form-input-sm" type="number" min={forma.tipo === 'linea' ? 0.05 : 0} max={10} step={0.05}
          value={forma.grosor}
          onChange={(e) => onCambiar({ grosor: Math.max(0, Math.round((Number(e.target.value) || 0) * 100) / 100) })} />

        {forma.tipo !== 'linea' && (
          <>
            <label className="form-label" htmlFor="forma-relleno-si">Relleno</label>
            <input id="forma-relleno-si" type="checkbox" checked={Boolean(forma.relleno)}
              onChange={(e) => onCambiar({ relleno: e.target.checked ? '#f2f2f2' : '' })} />
            {forma.relleno && (
              <>
                <label className="form-label" htmlFor="forma-relleno">Color de relleno</label>
                <input id="forma-relleno" className="form-input plantilla-color" type="color" value={color(forma.relleno, '#f2f2f2')}
                  onChange={(e) => onCambiar({ relleno: e.target.value })} />
              </>
            )}
          </>
        )}

        {forma.tipo === 'rectangulo' && (
          <>
            <label className="form-label" htmlFor="forma-radio">Esquinas (mm)</label>
            <input id="forma-radio" className="form-input form-input-sm" type="number" min={0} max={50} step={0.5}
              value={forma.radio}
              onChange={(e) => onCambiar({ radio: Math.max(0, Number(e.target.value) || 0) })} />
          </>
        )}
      </div>

      {forma.tipo === 'linea' && (
        <p className="plantilla-ayuda">
          Línea {horizontal ? 'horizontal' : 'vertical'} de {redondearMm(horizontal ? forma.ancho : forma.alto)} mm.
          Para cambiarla de sentido, estírala por el otro lado.
        </p>
      )}
    </div>
  );
}
