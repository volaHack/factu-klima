'use client';

/**
 * ELEGIR UNO DE UNA LISTA LARGA, BUSCANDO
 *
 * En lugar de un desplegable con cientos de clientes o miles de artículos,
 * una caja donde se escribe un trozo de lo que se sepa y salen los que
 * casan. Flechas e Intro para elegir sin ratón; si lo escrito no deja duda
 * (un NIF, una referencia, un código de barras) Intro lo coge directamente.
 * La X quita lo elegido; vaciar la caja y salir, también.
 *
 * La lista va en <body> con posición fija bajo la caja (o encima si abajo
 * no cabe): dentro de una ventana o de una tarjeta con scroll quedaría
 * recortada. Se recoloca al hacer scroll o al abrirse el teclado del móvil.
 */

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';

const MAXIMO = 50;

export interface BuscadorEnListaProps<T> {
  items: readonly T[];
  /** El id del elegido; vacío si ninguno. */
  value: string;
  onSelect: (id: string) => void;
  idDe: (item: T) => string;
  /** Lo que enseña la caja con uno elegido. */
  etiqueta: (item: T) => string;
  /** Los que casan con lo escrito, el mejor primero. */
  buscar: (items: readonly T[], texto: string, max: number) => T[];
  /** El que se coge con Intro sin bajar por la lista, si no hay duda. */
  unico?: (items: readonly T[], texto: string) => T | null;
  /** Cómo se ve cada uno en la lista. */
  opcion: (item: T) => { nombre: ReactNode; datos?: ReactNode; baja?: boolean };
  placeholder: string;
  ariaLabel?: string;
  className?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  /** Lo que se sugiere con la caja vacía (p. ej. los más usados). */
  sugeridos?: readonly T[];
  pista?: string;
}

export default function BuscadorEnLista<T>({
  items, value, onSelect, idDe, etiqueta, buscar, unico, opcion, placeholder, ariaLabel, className, autoFocus, disabled,
  sugeridos, pista = 'Escribe parte del nombre, el código o lo que sepas.',
}: BuscadorEnListaProps<T>) {
  const elegido = useMemo(() => items.find(i => idDe(i) === value) ?? null, [items, value, idDe]);
  // null: no se está escribiendo y la caja enseña lo elegido.
  const [texto, setTexto] = useState<string | null>(null);
  const [activo, setActivo] = useState(0);
  const [caja, setCaja] = useState<{ top: number; left: number; width: number; arriba: boolean } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const idLista = useId();

  const abierto = texto !== null;
  const resultados = useMemo(
    () => (texto?.trim() ? buscar(items, texto, MAXIMO + 1) : [...(sugeridos ?? [])].slice(0, 8)),
    [items, texto, buscar, sugeridos],
  );
  const visibles = resultados.slice(0, MAXIMO);

  useLayoutEffect(() => {
    if (!abierto) return;
    const colocar = () => {
      const r = input.current?.getBoundingClientRect();
      if (!r) return;
      const abajo = window.innerHeight - r.bottom;
      const arriba = abajo < 240 && r.top > abajo;
      setCaja({ top: arriba ? r.top : r.bottom, left: r.left, width: r.width, arriba });
    };
    colocar();
    window.addEventListener('resize', colocar);
    window.addEventListener('scroll', colocar, true);
    window.visualViewport?.addEventListener('resize', colocar);
    return () => {
      window.removeEventListener('resize', colocar);
      window.removeEventListener('scroll', colocar, true);
      window.visualViewport?.removeEventListener('resize', colocar);
    };
  }, [abierto]);

  useEffect(() => {
    if (!abierto || !caja) return;
    document.getElementById(`${idLista}-${activo}`)?.scrollIntoView({ block: 'nearest' });
  }, [activo, abierto, caja, idLista]);

  const elegir = (item: T | null) => {
    onSelect(item ? idDe(item) : '');
    setTexto(null);
    setCaja(null);
  };

  const cerrar = () => {
    // Borrado del todo = sin elegir; lo demás vuelve a lo que había.
    if (texto !== null && texto.trim() === '' && elegido) onSelect('');
    setTexto(null);
    setCaja(null);
  };

  const alTeclear = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!abierto) { setTexto(''); return; }
      setActivo(i => Math.min(i + 1, Math.max(visibles.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActivo(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (!abierto) return;
      e.preventDefault();
      const directo = activo === 0 && unico ? unico(items, texto ?? '') : null;
      const item = directo ?? visibles[activo];
      if (item) elegir(item);
    } else if (e.key === 'Escape') {
      if (abierto) { e.preventDefault(); e.stopPropagation(); setTexto(null); setCaja(null); }
    }
  };

  const valorCaja = texto ?? (elegido ? etiqueta(elegido) : '');
  const idActivo = abierto && visibles[activo] ? `${idLista}-${activo}` : undefined;

  return (
    <div className={`buscador-producto${className ? ` ${className}` : ''}`}>
      <Search size={15} className="buscador-producto-lupa" aria-hidden="true" />
      <input
        ref={input}
        type="text"
        className="form-input buscador-producto-caja"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={abierto && !!caja}
        aria-controls={idLista}
        aria-activedescendant={idActivo}
        aria-label={ariaLabel ?? placeholder}
        placeholder={placeholder}
        value={valorCaja}
        autoFocus={autoFocus}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        onFocus={e => { setTexto(''); setActivo(0); e.currentTarget.select(); }}
        onChange={e => { setTexto(e.target.value); setActivo(0); }}
        onKeyDown={alTeclear}
        onBlur={cerrar}
      />
      {elegido && !abierto && !disabled && (
        <button
          type="button"
          className="buscador-producto-quitar"
          onMouseDown={e => e.preventDefault()}
          onClick={() => onSelect('')}
          aria-label="Quitar"
          title="Quitar"
        >
          <X size={14} />
        </button>
      )}

      {abierto && caja && createPortal(
        <div
          id={idLista}
          role="listbox"
          className={`buscador-producto-lista${caja.arriba ? ' buscador-producto-lista--arriba' : ''}`}
          style={{ left: caja.left, width: Math.max(caja.width, 280), ...(caja.arriba ? { bottom: window.innerHeight - caja.top + 4 } : { top: caja.top + 4 }) }}
          // Sin esto, pulsar en la lista quita el foco de la caja y se cierra antes de elegir.
          onMouseDown={e => e.preventDefault()}
        >
          {!texto?.trim() && visibles.length === 0 ? (
            <p className="buscador-producto-pista">{pista}</p>
          ) : visibles.length === 0 ? (
            <p className="buscador-producto-pista">Nada con «{texto?.trim()}».</p>
          ) : (
            <>
              {!texto?.trim() && <p className="buscador-producto-pista">Los más usados · o escribe para buscar</p>}
              {visibles.map((item, i) => {
                const o = opcion(item);
                return (
                  <div
                    key={idDe(item)}
                    id={`${idLista}-${i}`}
                    role="option"
                    aria-selected={i === activo}
                    className={`buscador-producto-opcion${i === activo ? ' is-activo' : ''}${o.baja ? ' is-baja' : ''}`}
                    onMouseEnter={() => setActivo(i)}
                    onClick={() => elegir(item)}
                  >
                    <span className="buscador-producto-nombre">{o.nombre}</span>
                    {o.datos && <span className="buscador-producto-datos">{o.datos}</span>}
                  </div>
                );
              })}
              {resultados.length > MAXIMO && (
                <p className="buscador-producto-pista">Hay más: escribe algo más para afinar.</p>
              )}
            </>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
