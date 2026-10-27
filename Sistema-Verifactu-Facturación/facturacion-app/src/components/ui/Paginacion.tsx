'use client';

import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { TAMANOS_PAGINA, botonesPagina, esTamanoPagina } from '@/lib/paginacion';
import type { Paginado } from '@/hooks/usePaginacion';

/**
 * Los controles de páginas que van al pie de una lista larga.
 *
 * Dice qué filas se ven y de cuántas, deja elegir cuántas por página y
 * mueve entre páginas. Al cambiar de página desde abajo, la lista vuelve a
 * su principio: sin eso, la página nueva se empezaba a leer por el final.
 * Con menos filas que el tamaño más pequeño no aparece: no hay nada que
 * paginar.
 */
export default function Paginacion<T>({ paginado, etiqueta }: {
  paginado: Paginado<T>;
  /** Qué se cuenta, en plural: «clientes», «artículos», «documentos». */
  etiqueta: string;
}) {
  const nav = useRef<HTMLElement>(null);
  const { pagina, totalPaginas, porPagina, total, desde, hasta, irA, cambiarPorPagina } = paginado;
  if (total <= TAMANOS_PAGINA[0]) return null;

  const ir = (p: number) => {
    if (p === pagina || p < 1 || p > totalPaginas) return;
    irA(p);
    // Vuelve al principio de la lista si se ha quedado arriba, fuera de la vista.
    const lista = nav.current?.parentElement;
    if (lista && lista.getBoundingClientRect().top < 0) {
      const quieto = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      lista.style.scrollMarginTop = 'calc(var(--header-height, 56px) + 16px)';
      lista.scrollIntoView({ block: 'start', behavior: quieto ? 'auto' : 'smooth' });
    }
  };

  return (
    <nav ref={nav} className="paginacion" aria-label={`Páginas de ${etiqueta}`}>
      <div className="paginacion-info">
        <span className="paginacion-rango">
          <strong>{desde.toLocaleString('es-ES')}–{hasta.toLocaleString('es-ES')}</strong> de {total.toLocaleString('es-ES')} {etiqueta}
        </span>
        <label className="paginacion-tamano">
          <span>Ver</span>
          <select
            value={porPagina}
            onChange={e => { const n = Number(e.target.value); if (esTamanoPagina(n)) cambiarPorPagina(n); }}
            aria-label={`${etiqueta} por página`}
          >
            {TAMANOS_PAGINA.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <span>por página</span>
        </label>
      </div>

      <div className="paginacion-botones">
        <button type="button" className="paginacion-paso" onClick={() => ir(pagina - 1)} disabled={pagina <= 1} aria-label="Página anterior">
          <ChevronLeft size={15} aria-hidden="true" /><span>Anterior</span>
        </button>
        {botonesPagina(pagina, totalPaginas).map((b, i) => (b === 'hueco' ? (
          <span key={`h${i}`} className="paginacion-hueco" aria-hidden="true">…</span>
        ) : (
          <button
            key={b}
            type="button"
            className={`paginacion-num${b === pagina ? ' es-actual' : ''}`}
            onClick={() => ir(b)}
            aria-label={`Página ${b}`}
            aria-current={b === pagina ? 'page' : undefined}
          >
            {b}
          </button>
        )))}
        {/* Con `key` el número se monta de nuevo en cada página y vuelve a
            hacer su entrada: en el teléfono es la única señal del cambio. */}
        <span key={pagina} className="paginacion-movil" aria-hidden="true">{pagina} / {totalPaginas}</span>
        <button type="button" className="paginacion-paso" onClick={() => ir(pagina + 1)} disabled={pagina >= totalPaginas} aria-label="Página siguiente">
          <span>Siguiente</span><ChevronRight size={15} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
