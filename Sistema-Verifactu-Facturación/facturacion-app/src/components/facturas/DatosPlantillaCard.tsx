'use client';

import type { CSSProperties } from 'react';
import { campoPorClave } from '@/lib/plantillas/contrato';

interface PropsDatosPlantillaCard {
  claves: string[];
  datosExtras: Record<string, string>;
  onChange: (clave: string, valor: string) => void;
  style?: CSSProperties;
}

/**
 * Tarjeta con los campos manuales de la plantilla activa (custom_N: nº de
 * pedido, matrícula, agente, envío, fecha de entrega). Solo se renderiza si
 * la plantilla activa usa alguna de esas claves.
 */
export function DatosPlantillaCard({ claves, datosExtras, onChange, style }: PropsDatosPlantillaCard) {
  if (claves.length === 0) return null;

  return (
    <div className="card" style={style}>
      <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Datos modificables de la plantilla</h3>
      <div className="form-row" style={{ flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        {claves.map(clave => {
          const campo = campoPorClave(clave);
          return (
            <div className="form-group" key={clave} style={{ flex: '1 1 220px' }}>
              <label className="form-label">{campo?.etiqueta ?? clave}</label>
              <input
                className="form-input"
                value={datosExtras[clave] ?? ''}
                onChange={e => onChange(clave, e.target.value)}
                placeholder={campo?.descripcion ?? ''}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
