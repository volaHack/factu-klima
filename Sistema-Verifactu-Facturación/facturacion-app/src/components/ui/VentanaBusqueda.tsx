'use client';

/**
 * LA VENTANA DE BÚSQUEDA (la lupa, o F2)
 *
 * La de los programas de gestión de siempre: toda la lista en columnas,
 * una caja para afinar, filtros rápidos, columnas que se ordenan al
 * pulsarlas y el teclado para todo (flechas, Intro elige, Esc cierra). Si
 * lo buscado no existe, «Crear nuevo» lo da de alta sin salir de lo que se
 * estaba haciendo.
 *
 * La abre cualquier campo hecho con BuscadorEnLista (clientes, proveedores,
 * artículos). Va por encima de todo, también de las ventanas desde las que
 * se abre.
 */

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, Plus, Search, X } from 'lucide-react';

export interface ColumnaVentana<T> {
  titulo: string;
  valor: (item: T) => string | number | null | undefined;
  /** Se alinea a la derecha y se ordena como número. */
  num?: boolean;
  /** Cómo se pinta, si no es el valor tal cual. */
  pintar?: (item: T) => ReactNode;
}

export interface FiltroVentana<T> {
  id: string;
  etiqueta: string;
  aplica: (item: T) => boolean;
}

const MAXIMO = 300;

export default function VentanaBusqueda<T>({
  titulo, items, idDe, buscar, columnas, filtros = [], textoInicial = '', elegidoId, onElegir, onCerrar, crear, baja,
}: {
  titulo: string;
  items: readonly T[];
  idDe: (item: T) => string;
  buscar: (items: readonly T[], texto: string, max: number) => T[];
  columnas: ColumnaVentana<T>[];
  filtros?: FiltroVentana<T>[];
  textoInicial?: string;
  elegidoId?: string;
  onElegir: (item: T) => void;
  onCerrar: () => void;
  /** «Crear nuevo»: recibe lo escrito, para no tener que teclearlo otra vez. */
  crear?: { etiqueta: string; accion: (texto: string) => void };
  baja?: (item: T) => boolean;
}) {
  const [texto, setTexto] = useState(textoInicial);
  const [activos, setActivos] = useState<string[]>([]);
  const [orden, setOrden] = useState<{ col: number; asc: boolean } | null>(null);
  const [activo, setActivo] = useState(0);
  const caja = useRef<HTMLInputElement>(null);
  const cuerpo = useRef<HTMLTableSectionElement>(null);
  const idTitulo = useId();

  useEffect(() => { caja.current?.focus(); caja.current?.select(); }, []);

  const filas = useMemo(() => {
    let lista = texto.trim() ? buscar(items, texto, 100_000) : [...items];
    for (const id of activos) {
      const f = filtros.find(x => x.id === id);
      if (f) lista = lista.filter(f.aplica);
    }
    if (orden) {
      const c = columnas[orden.col];
      lista = [...lista].sort((a, b) => {
        const va = c.valor(a); const vb = c.valor(b);
        const r = c.num ? (Number(va) || 0) - (Number(vb) || 0) : String(va ?? '').localeCompare(String(vb ?? ''), 'es', { sensitivity: 'base', numeric: true });
        return orden.asc ? r : -r;
      });
    }
    return lista;
  }, [items, texto, activos, filtros, orden, columnas, buscar]);

  const visibles = filas.slice(0, MAXIMO);
  const indice = Math.min(activo, Math.max(visibles.length - 1, 0));

  useEffect(() => {
    cuerpo.current?.querySelector(`[data-fila="${indice}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [indice]);

  const alTeclear = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActivo(Math.min(indice + 1, visibles.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActivo(Math.max(indice - 1, 0)); }
    else if (e.key === 'PageDown') { e.preventDefault(); setActivo(Math.min(indice + 10, visibles.length - 1)); }
    else if (e.key === 'PageUp') { e.preventDefault(); setActivo(Math.max(indice - 10, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (visibles[indice]) onElegir(visibles[indice]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCerrar(); }
  };

  const ordenarPor = (col: number) => setOrden(o => (o?.col === col ? { col, asc: !o.asc } : { col, asc: true }));

  return createPortal(
    <div className="ventana-busqueda-fondo" onMouseDown={onCerrar}>
      <div
        className="ventana-busqueda"
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        onMouseDown={e => e.stopPropagation()}
        onKeyDown={alTeclear}
      >
        <div className="ventana-busqueda-cabeza">
          <h3 id={idTitulo}>{titulo}</h3>
          <button type="button" className="ventana-busqueda-cerrar" onClick={onCerrar} aria-label="Cerrar"><X size={18} /></button>
        </div>

        <div className="ventana-busqueda-filtros">
          <div className="ventana-busqueda-caja">
            <Search size={16} aria-hidden />
            <input
              ref={caja}
              type="search"
              className="form-input"
              value={texto}
              onChange={e => { setTexto(e.target.value); setActivo(0); }}
              placeholder="Escribe para afinar: nombre, código, NIF, teléfono…"
              aria-label="Buscar"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          {filtros.length > 0 && (
            <div className="ventana-busqueda-chips" role="group" aria-label="Filtros">
              {filtros.map(f => {
                const on = activos.includes(f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    className={`ventana-busqueda-chip${on ? ' activo' : ''}`}
                    aria-pressed={on}
                    onClick={() => { setActivos(a => (on ? a.filter(x => x !== f.id) : [...a, f.id])); setActivo(0); }}
                  >
                    {f.etiqueta}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="ventana-busqueda-tabla">
          <table>
            <thead>
              <tr>
                {columnas.map((c, i) => (
                  <th key={c.titulo} className={c.num ? 'num' : ''}>
                    <button type="button" onClick={() => ordenarPor(i)} title="Ordenar por esta columna">
                      {c.titulo}
                      {orden?.col === i && (orden.asc ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody ref={cuerpo}>
              {visibles.length === 0 ? (
                <tr><td colSpan={columnas.length} className="ventana-busqueda-vacio">Nada con «{texto.trim()}».</td></tr>
              ) : visibles.map((item, i) => (
                <tr
                  key={idDe(item)}
                  data-fila={i}
                  className={`${i === indice ? 'activa' : ''}${idDe(item) === elegidoId ? ' elegida' : ''}${baja?.(item) ? ' baja' : ''}`}
                  onMouseEnter={() => setActivo(i)}
                  onClick={() => setActivo(i)}
                  onDoubleClick={() => onElegir(item)}
                >
                  {columnas.map(c => (
                    <td key={c.titulo} className={c.num ? 'num' : ''}>{c.pintar ? c.pintar(item) : c.valor(item)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ventana-busqueda-pie">
          <span>
            {filas.length.toLocaleString('es-ES')} {filas.length === 1 ? 'resultado' : 'resultados'}
            {filas.length > MAXIMO && ` · se ven ${MAXIMO}, escribe para afinar`}
            <span className="ventana-busqueda-ayuda"> · ↑↓ moverse · Intro o doble clic elige · Esc cierra</span>
          </span>
          <div className="ventana-busqueda-acciones">
            {crear && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => crear.accion(texto.trim())}>
                <Plus size={14} /> {crear.etiqueta}{texto.trim() ? ` «${texto.trim()}»` : ''}
              </button>
            )}
            <button type="button" className="btn btn-primary btn-sm" disabled={!visibles[indice]} onClick={() => visibles[indice] && onElegir(visibles[indice])}>
              Elegir
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
