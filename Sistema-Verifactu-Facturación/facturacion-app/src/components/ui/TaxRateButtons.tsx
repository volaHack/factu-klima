'use client';

import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';

/**
 * El IVA o IGIC de una línea, como una fila de botones: uno por cada tipo
 * que la empresa tiene configurado (0, 3, 7, 13… o 0, 4, 10, 21).
 *
 * El slider de 0 a 99 obligaba a arrastrar con precisión para clavar un
 * 7 % y en el móvil se iba al 6 o al 8 sin querer. Casi todas las líneas
 * llevan uno de cuatro tipos, así que se eligen de un toque.
 *
 * Mismo contrato que el slider: `value` es el porcentaje y `onChange`
 * recibe el porcentaje elegido.
 */

export interface OpcionTipo {
  valor: number;
  /** No es de los configurados: viene de la ficha o de un documento antiguo. */
  fuera: boolean;
}

const igual = (a: number, b: number) => Math.abs(a - b) < 0.0001;

/**
 * Los botones que se pintan, de menor a mayor.
 *
 * Si la línea trae un tipo que no está configurado (un 5 % de una ficha
 * vieja, un 20 % importado), sale como un botón más y marcado: quitarlo
 * de la vista cambiaría el impuesto sin que nadie lo hubiera tocado.
 * `original` es el tipo con el que se abrió la línea, para que un toque
 * de más no lo haga desaparecer sin vuelta atrás.
 */
export function opcionesDeTipo(configurados: readonly number[], actual: number, original?: number): OpcionTipo[] {
  const opciones: OpcionTipo[] = [];
  for (const t of configurados) {
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0 || opciones.some(o => igual(o.valor, n))) continue;
    opciones.push({ valor: n, fuera: false });
  }
  for (const extra of [actual, original]) {
    const n = Number(extra);
    if (extra === undefined || !Number.isFinite(n) || n < 0 || opciones.some(o => igual(o.valor, n))) continue;
    opciones.push({ valor: n, fuera: true });
  }
  return opciones.sort((a, b) => a.valor - b.valor);
}

/** A qué botón lleva cada tecla (patrón de grupo de radio: las flechas dan la vuelta). */
export function indiceTrasTecla(tecla: string, actual: number, total: number): number | null {
  if (total <= 0) return null;
  const desde = actual < 0 ? 0 : actual;
  switch (tecla) {
    case 'ArrowRight':
    case 'ArrowDown':
      return actual < 0 ? 0 : (desde + 1) % total;
    case 'ArrowLeft':
    case 'ArrowUp':
      return actual < 0 ? total - 1 : (desde - 1 + total) % total;
    case 'Home':
      return 0;
    case 'End':
      return total - 1;
    default:
      return null;
  }
}

/** «7 %», «9,5 %»: con coma y el espacio que no se parte. */
export function textoTipo(valor: number): string {
  return `${valor.toLocaleString('es-ES', { maximumFractionDigits: 2 })} %`;
}

interface TaxRateButtonsProps {
  value: number;
  onChange: (value: number) => void;
  /** Los tipos configurados de la empresa (`getConfiguredTaxRates`). */
  rates: readonly number[];
  /** Nombre del grupo para lectores de pantalla («IGIC de la línea 2»). */
  ariaLabel: string;
}

export default function TaxRateButtons({ value, onChange, rates, ariaLabel }: TaxRateButtonsProps) {
  const actual = Number(value) || 0;
  // El tipo con el que llegó la línea, fijado al montar.
  const [original] = useState(actual);
  const opciones = opcionesDeTipo(rates, actual, original);
  const elegido = opciones.findIndex(o => igual(o.valor, actual));
  const grupo = useRef<HTMLDivElement>(null);
  const marca = useRef<HTMLSpanElement>(null);

  /**
   * La pastilla del marcado se desliza de un tipo a otro en vez de saltar.
   *
   * Es una sola pieza debajo de los botones que se mueve con transform: se
   * mide el botón marcado y se le pone encima. Se escribe en el estilo del
   * nodo y no en el estado para no repintar el grupo entero en cada
   * medida. Se vuelve a medir si el grupo cambia de ancho, porque en el
   * móvil los botones bajan a otra fila y el marcado cambia de sitio. La
   * primera vez se coloca sin transición, para que no llegue volando desde
   * la esquina.
   */
  useLayoutEffect(() => {
    const caja = grupo.current;
    const pastilla = marca.current;
    if (!caja || !pastilla) return;
    let primera = !pastilla.dataset.puesta;
    const colocar = () => {
      const boton = caja.querySelectorAll<HTMLButtonElement>('[role="radio"]')[elegido];
      if (!boton) {
        pastilla.style.opacity = '0';
        return;
      }
      if (primera) pastilla.style.transition = 'none';
      pastilla.style.opacity = '1';
      pastilla.style.width = `${boton.offsetWidth}px`;
      pastilla.style.height = `${boton.offsetHeight}px`;
      pastilla.style.transform = `translate(${boton.offsetLeft}px, ${boton.offsetTop}px)`;
      if (primera) {
        // Forzar el estilo antes de devolver la transición.
        pastilla.getBoundingClientRect();
        pastilla.style.transition = '';
        pastilla.dataset.puesta = 'si';
        primera = false;
      }
    };
    colocar();
    if (typeof ResizeObserver === 'undefined') return;
    const vigia = new ResizeObserver(colocar);
    vigia.observe(caja);
    return () => vigia.disconnect();
  }, [elegido, opciones.length]);

  const alPulsarTecla = (e: KeyboardEvent<HTMLDivElement>) => {
    const destino = indiceTrasTecla(e.key, elegido, opciones.length);
    if (destino === null) return;
    e.preventDefault();
    onChange(opciones[destino].valor);
    grupo.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[destino]?.focus();
  };

  return (
    <div className="tipo-impuesto con-marca" role="radiogroup" aria-label={ariaLabel} ref={grupo} onKeyDown={alPulsarTecla}>
      <span className="tipo-impuesto-marca" ref={marca} aria-hidden="true" />
      {opciones.map((o, i) => {
        const marcado = i === elegido;
        return (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={marcado}
            // Un solo punto de tabulación para todo el grupo: el marcado
            // (o el primero si ninguno lo está). Las flechas hacen el resto.
            tabIndex={marcado || (elegido < 0 && i === 0) ? 0 : -1}
            className={`tipo-impuesto-opcion${o.fuera ? ' es-fuera' : ''}`}
            title={o.fuera ? 'Este tipo no está entre los configurados en Ajustes' : o.valor === 0 ? 'Exento' : undefined}
            onClick={() => onChange(o.valor)}
          >
            {textoTipo(o.valor)}
          </button>
        );
      })}
    </div>
  );
}
