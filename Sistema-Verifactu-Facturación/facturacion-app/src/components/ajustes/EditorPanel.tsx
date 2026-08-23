'use client';

import { useMemo } from 'react';
import { ChevronDown, ChevronUp, GripVertical, RotateCcw, X } from 'lucide-react';
import {
  FICHAS, PANEL_POR_DEFECTO, alternarFicha, fichasDisponibles, mover, type FichaId,
} from '@/lib/panel';
import { modulosPorDefecto, type ModuloId } from '@/lib/modulos';
import type { BusinessSector } from '@/lib/types';

interface Props {
  panel?: FichaId[];
  modulos?: ModuloId[];
  sector?: BusinessSector;
  onCambiar: (panel: FichaId[]) => void;
}

/**
 * EL PANEL DE INICIO, A GUSTO DE CADA UNO
 *
 * Lo primero que se ve al entrar debería ser lo que a ESA empresa le quita el
 * sueño. Al de la distribuidora le importa lo que está por cobrar y lo que se
 * va a quedar sin existencias; al fisioterapeuta, las facturas del mes. Un
 * panel fijo obliga a los dos a mirar media pantalla que no les sirve.
 *
 * Se ordena con botones, no arrastrando. Arrastrar es más lucido pero se
 * rompe con el dedo en un móvil y es inservible con el teclado; dos flechas
 * funcionan en todas partes y esto se configura una vez.
 */
export default function EditorPanel({ panel, modulos, sector, onCambiar }: Props) {
  const activos = modulos ?? modulosPorDefecto(sector);
  const puestas = useMemo(() => panel ?? [...PANEL_POR_DEFECTO], [panel]);

  const disponibles = useMemo(() => fichasDisponibles(activos), [activos]);
  const disponiblesIds = useMemo(() => new Set(disponibles.map(f => f.id)), [disponibles]);

  // Las colocadas que hoy se pueden pintar, en su orden.
  const enPanel = puestas.filter(id => disponiblesIds.has(id));
  const fuera = disponibles.filter(f => !puestas.includes(f.id));

  return (
    <div className="panel-editor">
      <div className="panel-editor-cabeza">
        <p className="settings-section-subtitle" style={{ margin: 0 }}>
          {enPanel.length === 0
            ? 'No hay ninguna ficha puesta: el panel saldrá vacío.'
            : `${enPanel.length} ${enPanel.length === 1 ? 'ficha' : 'fichas'} en el panel de inicio.`}
        </p>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => onCambiar([...PANEL_POR_DEFECTO])}
        >
          <RotateCcw size={14} /> Dejarlo como venía
        </button>
      </div>

      <ol className="panel-editor-lista">
        {enPanel.map((id, i) => {
          const ficha = FICHAS.find(f => f.id === id)!;
          return (
            <li key={id} className="panel-editor-item">
              <span className="panel-editor-asa" aria-hidden="true"><GripVertical size={14} /></span>
              <span className="panel-editor-texto">
                <strong>{ficha.nombre}</strong>
                <span>{ficha.explica}</span>
              </span>
              <span className="panel-editor-botones">
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  disabled={i === 0}
                  aria-label={`Subir ${ficha.nombre}`}
                  onClick={() => onCambiar(mover(puestas, id, -1))}
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  disabled={i === enPanel.length - 1}
                  aria-label={`Bajar ${ficha.nombre}`}
                  onClick={() => onCambiar(mover(puestas, id, 1))}
                >
                  <ChevronDown size={14} />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  aria-label={`Quitar ${ficha.nombre}`}
                  onClick={() => onCambiar(alternarFicha(puestas, id))}
                >
                  <X size={14} />
                </button>
              </span>
            </li>
          );
        })}
      </ol>

      {fuera.length > 0 && (
        <div className="panel-editor-sobrantes">
          <h4 className="modulos-titulo">Se pueden añadir</h4>
          <div className="panel-editor-chips">
            {fuera.map(f => (
              <button
                key={f.id}
                type="button"
                className="panel-editor-chip"
                title={f.explica}
                onClick={() => onCambiar(alternarFicha(puestas, f.id))}
              >
                + {f.nombre}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Las que no salen porque su módulo está apagado. Se dice, en vez de
          esconderlas sin explicación: si no, parece que faltan fichas. */}
      {FICHAS.length > disponibles.length && (
        <p className="panel-editor-nota">
          Hay {FICHAS.length - disponibles.length} fichas más que aparecerán al encender
          su módulo correspondiente arriba.
        </p>
      )}
    </div>
  );
}
