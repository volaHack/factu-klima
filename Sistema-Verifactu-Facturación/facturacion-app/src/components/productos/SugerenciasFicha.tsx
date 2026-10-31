'use client';

/**
 * LO QUE LA FICHA NUEVA PROPONE, A UN TOQUE
 *
 * Mientras se escribe el nombre de un artículo nuevo: las unidades por caja
 * que dice el nombre, la familia de los parecidos, su impuesto y el precio
 * con el margen de esa familia. Nada se pone solo; cada propuesta es un
 * botón. La cuenta está en lib/fichaProducto.
 */

import { Sparkles, Check } from 'lucide-react';
import type { SugerenciaFicha } from '@/lib/fichaProducto';

const ROTULO: Record<SugerenciaFicha['campo'], string> = {
  unitsPerPackage: 'U/C',
  category: 'Categoría',
  defaultTaxRate: 'Impuesto',
  unitPrice: 'Precio de venta',
};

export default function SugerenciasFicha({ sugerencias, onAceptar }: {
  sugerencias: SugerenciaFicha[];
  onAceptar: (s: SugerenciaFicha[]) => void;
}) {
  if (!sugerencias.length) return null;
  return (
    <section className="ficha-sugerencias" aria-label="Sugerencias para la ficha">
      <p className="ficha-sugerencias-titulo">
        <Sparkles size={14} aria-hidden="true" /> Te proponemos
      </p>
      <ul className="ficha-sugerencias-lista">
        {sugerencias.map(s => (
          <li key={s.campo}>
            <button
              type="button"
              className="ficha-sugerencia"
              onClick={() => onAceptar([s])}
              aria-label={`Usar ${ROTULO[s.campo]}: ${s.texto}, ${s.motivo}`}
            >
              <span className="ficha-sugerencia-campo">{ROTULO[s.campo]}</span>
              <strong>{s.texto}</strong>
              <small>{s.motivo}</small>
            </button>
          </li>
        ))}
      </ul>
      {sugerencias.length > 1 && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onAceptar(sugerencias)}>
          <Check size={14} /> Usar todas
        </button>
      )}
    </section>
  );
}
