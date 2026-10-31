'use client';

import { useCallback, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { rellenoPorCp, type CasillasLugar } from '@/lib/codigosPostales';

/**
 * El código postal rellena la provincia y, en Canarias, el municipio
 * (lib/codigosPostales.ts). El formulario llama a `alCambiarCp` con el
 * código nuevo y lo que hay en las casillas; esto recuerda lo que puso él
 * para no pisar nunca lo escrito a mano, y guarda los municipios para
 * elegir cuando el código tiene varios.
 */
export function useRellenoPorCp(aplicar: (cambio: Partial<CasillasLugar>) => void) {
  const puesto = useRef<Partial<CasillasLugar>>({});
  const [elegir, setElegir] = useState<readonly string[]>([]);

  const alCambiarCp = useCallback((cp: string, actual: CasillasLugar) => {
    const r = rellenoPorCp(cp, actual, puesto.current);
    const cambio: Partial<CasillasLugar> = {};
    if (r.provincia !== undefined) { cambio.provincia = r.provincia; puesto.current.provincia = r.provincia; }
    if (r.municipio !== undefined) { cambio.municipio = r.municipio; puesto.current.municipio = r.municipio; }
    if (Object.keys(cambio).length) aplicar(cambio);
    setElegir(r.elegir);
  }, [aplicar]);

  /** Lo elegido de la lista cuenta como escrito a mano: ya no se cambia solo. */
  const elegirMunicipio = useCallback((m: string) => {
    puesto.current.municipio = undefined;
    aplicar({ municipio: m });
    setElegir([]);
  }, [aplicar]);

  /** Al abrir otra ficha, se olvida lo de la anterior. */
  const reiniciar = useCallback(() => {
    puesto.current = {};
    setElegir([]);
  }, []);

  return { alCambiarCp, elegir, elegirMunicipio, reiniciar };
}

/** «Ese código es de varios municipios: Telde · Las Palmas de Gran Canaria». */
export function MunicipiosParaElegir({ municipios, onElegir }: { municipios: readonly string[]; onElegir: (m: string) => void }) {
  if (municipios.length < 2) return null;
  return (
    <div className="cp-municipios" role="group" aria-label="Municipios de ese código postal">
      <span className="cp-municipios-texto"><MapPin size={13} aria-hidden /> Ese código es de varios municipios:</span>
      {municipios.map(m => (
        <button key={m} type="button" className="chip-rapido" onClick={() => onElegir(m)}>{m}</button>
      ))}
    </div>
  );
}
