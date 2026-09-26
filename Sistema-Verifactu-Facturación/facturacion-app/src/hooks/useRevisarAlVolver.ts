'use client';

import { useEffect } from 'react';
import { revisarDatos, type DatosRevisables } from '@/lib/storage';

/**
 * Mantiene la pantalla al día sin recargar: vuelve a mirar el servidor al
 * volver a la pestaña, al recuperar la conexión y cada `cadaMs` mientras la
 * página está a la vista. Si algo cambió, `storage` lanza el aviso de
 * siempre (`klima-invoices-updated`, `klima-clients-updated`…) y la
 * pantalla, que ya lo escucha, se repinta.
 *
 * Con la pestaña en segundo plano no pregunta nada: no gasta datos ni
 * batería para una pantalla que nadie mira.
 */
export function useRevisarAlVolver(tipos: DatosRevisables[], cadaMs = 30_000): void {
  const clave = [...tipos].sort().join(',');
  useEffect(() => {
    const lista = clave.split(',').filter(Boolean) as DatosRevisables[];
    const revisar = () => { if (document.visibilityState === 'visible') void revisarDatos(lista); };
    const cada = setInterval(revisar, cadaMs);
    document.addEventListener('visibilitychange', revisar);
    window.addEventListener('focus', revisar);
    window.addEventListener('online', revisar);
    return () => {
      clearInterval(cada);
      document.removeEventListener('visibilitychange', revisar);
      window.removeEventListener('focus', revisar);
      window.removeEventListener('online', revisar);
    };
  }, [clave, cadaMs]);
}
