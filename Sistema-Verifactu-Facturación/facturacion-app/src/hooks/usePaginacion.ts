'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  TAMANO_POR_DEFECTO, esTamanoPagina, paginaValida, rango, totalPaginas, trozo, type TamanoPagina,
} from '@/lib/paginacion';

const claveGuardada = (clave: string) => `klima-por-pagina:${clave}`;

/** El tamaño que se eligió la última vez en esta lista, si se puede leer. */
export function tamanoGuardado(clave: string): TamanoPagina {
  if (typeof window === 'undefined') return TAMANO_POR_DEFECTO;
  try {
    const n = Number(window.localStorage.getItem(claveGuardada(clave)));
    return esTamanoPagina(n) ? n : TAMANO_POR_DEFECTO;
  } catch {
    return TAMANO_POR_DEFECTO;
  }
}

/** Recuerda en este equipo el tamaño elegido para la lista. */
export function guardarTamano(clave: string, n: TamanoPagina): void {
  try { window.localStorage.setItem(claveGuardada(clave), String(n)); } catch { /* sin almacenamiento: sólo esta vez */ }
}

export interface Paginado<T> {
  /** Las filas de la página que toca. */
  visibles: T[];
  pagina: number;
  totalPaginas: number;
  porPagina: TamanoPagina;
  total: number;
  desde: number;
  hasta: number;
  irA: (pagina: number) => void;
  cambiarPorPagina: (n: TamanoPagina) => void;
}

/**
 * Parte una lista en páginas.
 *
 * `clave` identifica la lista (el tamaño elegido se recuerda en este
 * equipo para cada una). `reinicio` es lo que, al cambiar, devuelve a la
 * primera página: la búsqueda, los filtros o el orden. No se vuelve a la
 * primera cada vez que llega la lista de nuevo (al refrescar del servidor
 * llega otra igual), sólo cuando cambia lo que se está mirando; y si la
 * lista encoge, la página se ajusta a la última que exista.
 */
export function usePaginacion<T>(lista: readonly T[], { clave, reinicio = '' }: { clave: string; reinicio?: string }): Paginado<T> {
  const [porPagina, setPorPagina] = useState<TamanoPagina>(() => tamanoGuardado(clave));
  const [estado, setEstado] = useState({ reinicio, pagina: 1 });

  const pagina = estado.reinicio === reinicio ? paginaValida(estado.pagina, lista.length, porPagina) : 1;
  const visibles = useMemo(() => trozo(lista, pagina, porPagina), [lista, pagina, porPagina]);
  const { desde, hasta } = rango(pagina, lista.length, porPagina);

  const irA = useCallback((p: number) => setEstado({ reinicio, pagina: p }), [reinicio]);
  const cambiarPorPagina = useCallback((n: TamanoPagina) => {
    setPorPagina(n);
    setEstado({ reinicio, pagina: 1 });
    guardarTamano(clave, n);
  }, [clave, reinicio]);

  return {
    visibles, pagina, porPagina, total: lista.length, desde, hasta,
    totalPaginas: totalPaginas(lista.length, porPagina),
    irA, cambiarPorPagina,
  };
}
