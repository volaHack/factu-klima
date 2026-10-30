'use client';

import { CalendarClock, AlertTriangle } from 'lucide-react';
import { explicarVencimiento, opcionesVencimiento } from '@/lib/vencimiento';

/**
 * Los plazos de siempre junto a la fecha de vencimiento: Contado, +15, +30,
 * +60, Fin de mes y, si la ficha los tiene, los días de pago del cliente.
 * Debajo, el día de la semana en que cae (ver lib/vencimiento.ts).
 *
 * No es `AtajosFechas`: aquel rellena un desde/hasta para filtrar listados
 * («este trimestre»); esto pone una sola fecha contando desde la emisión.
 */
export default function AtajosVencimiento({ emision, vencimiento, diasCliente, onElegir }: {
  emision: string;
  vencimiento: string;
  diasCliente?: number | null;
  onElegir: (fecha: string) => void;
}) {
  const opciones = opcionesVencimiento(emision, diasCliente);
  const dicho = explicarVencimiento(emision, vencimiento);
  if (!opciones.length) return null;
  return (
    <div className="vencimiento-rapido">
      <div className="vencimiento-rapido-chips" role="group" aria-label="Plazos de pago rápidos">
        {opciones.map(o => {
          const puesto = o.fecha === vencimiento;
          return (
            <button
              key={o.id}
              type="button"
              className={`chip-rapido${puesto ? ' es-puesto' : ''}${o.id === 'cliente' ? ' chip-rapido--cliente' : ''}`}
              aria-pressed={puesto}
              title={o.descripcion}
              onClick={() => onElegir(o.fecha)}
            >
              {o.etiqueta}
            </button>
          );
        })}
      </div>
      {dicho && (
        <p className={`vencimiento-rapido-dia${dicho.aviso ? ' tiene-aviso' : ''}`} aria-live="polite">
          {dicho.aviso ? <AlertTriangle size={12} aria-hidden /> : <CalendarClock size={12} aria-hidden />}
          <span>{dicho.texto}{dicho.aviso && <> · {dicho.aviso}</>}</span>
        </p>
      )}
    </div>
  );
}
