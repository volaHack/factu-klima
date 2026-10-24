'use client';

/**
 * LA CAJA DE BUSCAR DE UNA LISTA
 *
 * Lupa, lo escrito, una X para borrarlo y cuántos salen de cuántos. La
 * lista se filtra mientras se escribe (con lib/casaTexto). Esc la vacía.
 */

import { Search, X } from 'lucide-react';

export default function CajaBusqueda({ value, onChange, placeholder, total, visibles, autoFocus }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  /** Cuántos hay en total y cuántos casan: «3 de 40». */
  total?: number;
  visibles?: number;
  autoFocus?: boolean;
}) {
  return (
    <div className="caja-busqueda">
      <Search size={16} className="caja-busqueda-lupa" aria-hidden />
      <input
        type="search"
        className="form-input"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape' && value) { e.preventDefault(); onChange(''); } }}
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
      />
      {value && (
        <>
          {total !== undefined && visibles !== undefined && (
            <span className="caja-busqueda-cuenta" aria-live="polite">{visibles} de {total}</span>
          )}
          <button type="button" className="caja-busqueda-borrar" onClick={() => onChange('')} aria-label="Borrar la búsqueda" title="Borrar">
            <X size={14} />
          </button>
        </>
      )}
    </div>
  );
}
