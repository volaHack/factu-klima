'use client';

import { periodosRapidos } from '@/lib/periodos';

/** Botones de periodo (este mes, trimestre, año…) que rellenan el desde/hasta. */
export default function AtajosFechas({ desde, hasta, onElegir }: {
  desde?: string;
  hasta?: string;
  onElegir: (desde: string, hasta: string) => void;
}) {
  return (
    <div className="atajos-fechas" role="group" aria-label="Periodos rápidos">
      {periodosRapidos().map(p => {
        const on = p.desde === desde && p.hasta === hasta;
        return (
          <button key={p.id} type="button" className={`ventana-busqueda-chip${on ? ' activo' : ''}`} aria-pressed={on} onClick={() => onElegir(p.desde, p.hasta)}>
            {p.etiqueta}
          </button>
        );
      })}
    </div>
  );
}
