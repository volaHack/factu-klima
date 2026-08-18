'use client';

import { useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';
import {
  guardarTema, leerTemaEfectivo, leerTemaEnServidor, suscribirseAlTema, type Tema,
} from '@/lib/tema';

/**
 * El interruptor de claro/oscuro de la barra superior.
 *
 * Un solo botón, no tres. Se pulsa y cambia al otro esquema, que es lo que
 * espera cualquiera; el estado «automático» existe por dentro y es el de
 * salida, pero no ocupa un tercio de un control que se usa a diario.
 *
 * Se lee con `useSyncExternalStore` porque el tema vive fuera de React y lo
 * cambian tres cosas: este botón, el mismo botón en otra pestaña, y el
 * sistema operativo al anochecer.
 */
export default function BotonTema() {
  const tema = useSyncExternalStore(suscribirseAlTema, leerTemaEfectivo, leerTemaEnServidor);
  const esOscuro = tema === 'oscuro';

  const alternar = () => guardarTema((esOscuro ? 'claro' : 'oscuro') as Tema);

  return (
    <button
      type="button"
      className="tema-boton"
      onClick={alternar}
      aria-label={esOscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      title={esOscuro ? 'Modo claro' : 'Modo oscuro'}
    >
      {esOscuro ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
