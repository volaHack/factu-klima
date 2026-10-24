'use client';

/**
 * LO QUE PIDE LA DIRECCIÓN
 *
 * El árbol de Mantenimientos del menú abre cada pantalla en su pestaña
 * (`?tab=cobros`) o directamente en «nuevo» (`?nuevo=1`). Estas dos piezas
 * lo leen. Quien las use tiene que estar dentro de un <Suspense>, como todo
 * lo que lee useSearchParams.
 */

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * La pestaña abierta, que sigue a `?tab=` cuando cambia (pasar de una hoja
 * del menú a otra de la misma pantalla no la vuelve a montar).
 */
export function usePestanaDeLaDireccion<T extends string>(validas: readonly T[], porDefecto: T, param = 'tab'): [T, (t: T) => void] {
  const pedida = useSearchParams().get(param);
  const valida = (v: string | null): v is T => v !== null && (validas as readonly string[]).includes(v);
  const [pestana, setPestana] = useState<T>(valida(pedida) ? pedida : porDefecto);
  const [vista, setVista] = useState(pedida);
  if (vista !== pedida) {
    setVista(pedida);
    if (valida(pedida)) setPestana(pedida);
  }
  return [pestana, setPestana];
}

/**
 * Abre el «nuevo» que pide `?nuevo=` en cuanto la pantalla tiene sus datos,
 * una sola vez, y lo quita de la dirección para que recargar no lo vuelva a
 * abrir.
 */
export function useNuevoDeLaDireccion(listo: boolean, abrir: (valor: string) => void, param = 'nuevo'): void {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const pedido = params.get(param);
  const hecho = useRef<string | null>(null);
  const abrirActual = useRef(abrir);
  useEffect(() => { abrirActual.current = abrir; });

  useEffect(() => {
    if (!listo || !pedido) return;
    const clave = params.toString();
    if (hecho.current === clave) return;
    hecho.current = clave;
    abrirActual.current(pedido);
    const resto = new URLSearchParams(params.toString());
    resto.delete(param);
    router.replace(resto.size ? `${pathname}?${resto}` : pathname, { scroll: false });
  }, [listo, pedido, params, pathname, router, param]);
}
