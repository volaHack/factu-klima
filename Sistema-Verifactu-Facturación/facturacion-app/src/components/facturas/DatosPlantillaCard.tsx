'use client';

import type { CSSProperties } from 'react';
import { campoPorClave } from '@/lib/plantillas/contrato';
import { vocabularioDe } from '@/lib/vocabulario';
import type { BusinessSector } from '@/lib/types';

interface PropsDatosPlantillaCard {
  claves: string[];
  datosExtras: Record<string, string>;
  onChange: (clave: string, valor: string) => void;
  style?: CSSProperties;
  /** Para llamar a cada casilla como la llama este oficio. */
  sector?: BusinessSector;
}

/**
 * Tarjeta con los campos manuales de la plantilla activa (`custom_N`).
 *
 * Los nombres salen del oficio de la empresa cuando lo hay. El contrato
 * los llama «Dato libre 2 (Matrícula / Obra)», que es lo que tiene que
 * decir un campo que sirve para todo; pero en la pantalla de un taller lo
 * que hay que preguntar es «Matrícula», y en la de un abogado «Nº de
 * expediente». Es la misma casilla y sale impresa en el mismo sitio: lo
 * único que cambia es que se pregunta por su nombre.
 */
export function DatosPlantillaCard({ claves, datosExtras, onChange, style, sector }: PropsDatosPlantillaCard) {
  if (claves.length === 0) return null;

  const delOficio = new Map(vocabularioDe(sector).rotulosOficio.map(r => [r.clave, r.etiqueta]));

  return (
    <div className="card" style={style}>
      <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Datos modificables de la plantilla</h3>
      <div className="form-row" style={{ flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        {claves.map(clave => {
          const campo = campoPorClave(clave);
          const propio = delOficio.get(clave);
          return (
            <div className="form-group" key={clave} style={{ flex: '1 1 220px' }}>
              <label className="form-label">{propio ?? campo?.etiqueta ?? clave}</label>
              <input
                className="form-input"
                value={datosExtras[clave] ?? ''}
                onChange={e => onChange(clave, e.target.value)}
                placeholder={propio ? '' : (campo?.descripcion ?? '')}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
