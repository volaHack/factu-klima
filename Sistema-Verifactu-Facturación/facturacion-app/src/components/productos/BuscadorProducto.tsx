'use client';

/**
 * EL BUSCADOR DE PRODUCTO DE UNA LÍNEA
 *
 * En lugar del desplegable con todo el catálogo: se escribe la referencia,
 * un trozo del nombre, la referencia del proveedor o se pasa el escáner, y
 * salen los que casan (lib/buscarProductos). Con las flechas y Intro se
 * elige sin ratón; si lo escrito no deja duda (un código de barras, una
 * referencia exacta) Intro lo coge directamente.
 *
 * La lista va en <body>, con posición fija bajo la caja: dentro de una
 * ventana o de una tarjeta con scroll quedaría recortada.
 */

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import type { Product } from '@/lib/types';
import { buscarProductos, unicoProducto } from '@/lib/buscarProductos';
import { formatCurrency } from '@/lib/utils';

const MAXIMO = 50;

export const etiquetaProducto = (p: Pick<Product, 'ref' | 'name'>) => (p.ref ? `[${p.ref}] ${p.name}` : p.name);

export default function BuscadorProducto({
  products, value, onSelect, placeholder = 'Buscar producto: referencia, nombre o código', ariaLabel, className, autoFocus,
}: {
  products: Product[];
  /** El id del producto elegido; vacío si ninguno. */
  value: string;
  onSelect: (productId: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const elegido = useMemo(() => products.find(p => p.id === value) ?? null, [products, value]);
  // null: no se está escribiendo y la caja enseña el producto elegido.
  const [texto, setTexto] = useState<string | null>(null);
  const [activo, setActivo] = useState(0);
  const [caja, setCaja] = useState<{ top: number; left: number; width: number; arriba: boolean } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const idLista = useId();

  const abierto = texto !== null;
  const resultados = useMemo(() => (texto ? buscarProductos(products, texto, MAXIMO + 1) : []), [products, texto]);
  const visibles = resultados.slice(0, MAXIMO);

  // La lista se coloca bajo la caja (o encima si abajo no cabe) y se
  // recoloca al hacer scroll o al abrirse el teclado del móvil.
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

  const elegir = (p: Product | null) => {
    onSelect(p ? p.id : '');
    setTexto(null);
    setCaja(null);
  };

  const cerrar = () => {
    // Borrado del todo = sin producto; lo demás vuelve a lo que había.
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
      const directo = activo === 0 ? unicoProducto(products, texto ?? '') : null;
      const p = directo ?? visibles[activo];
      if (p) elegir(p);
    } else if (e.key === 'Escape') {
      if (abierto) { e.preventDefault(); setTexto(null); setCaja(null); }
    }
  };

  const valorCaja = texto ?? (elegido ? etiquetaProducto(elegido) : '');
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
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        onFocus={e => { setTexto(''); setActivo(0); e.currentTarget.select(); }}
        onChange={e => { setTexto(e.target.value); setActivo(0); }}
        onKeyDown={alTeclear}
        onBlur={cerrar}
      />
      {elegido && !abierto && (
        <button
          type="button"
          className="buscador-producto-quitar"
          onMouseDown={e => e.preventDefault()}
          onClick={() => onSelect('')}
          aria-label="Quitar el producto"
          title="Quitar el producto"
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
          {!texto?.trim() ? (
            <p className="buscador-producto-pista">Escribe la referencia, parte del nombre o pasa el escáner.</p>
          ) : visibles.length === 0 ? (
            <p className="buscador-producto-pista">Ningún producto con «{texto.trim()}».</p>
          ) : (
            <>
              {visibles.map((p, i) => (
                <div
                  key={p.id}
                  id={`${idLista}-${i}`}
                  role="option"
                  aria-selected={i === activo}
                  className={`buscador-producto-opcion${i === activo ? ' is-activo' : ''}${p.active === false ? ' is-baja' : ''}`}
                  onMouseEnter={() => setActivo(i)}
                  onClick={() => elegir(p)}
                >
                  <span className="buscador-producto-nombre">
                    {p.ref && <span className="mono">{p.ref}</span>} {p.name}
                  </span>
                  <span className="buscador-producto-datos">
                    {formatCurrency(p.unitPrice)}
                    {p.stockQuantity != null && <> · {p.stockQuantity} {p.unit}</>}
                    {p.supplierRef && <> · Prov. {p.supplierRef}</>}
                    {p.active === false && <> · de baja</>}
                  </span>
                </div>
              ))}
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
