'use client';

/**
 * UNA CIFRA QUE SUBE HASTA SU VALOR
 *
 * La primera vez que aparece, la cifra cuenta desde cero hasta la de verdad
 * en algo menos de un segundo, frenando al final. Así el panel se lee como
 * algo que se acaba de calcular, no como un cartel. Sólo la primera vez: si
 * luego cambia (llega una factura nueva), se pone directamente.
 *
 * Recibe el texto ya formateado («3.796,16 €», «12», «−240,00 €») y respeta
 * su formato: mismos decimales, mismos puntos de miles, mismo símbolo.
 * Quien pide menos movimiento ve la cifra final desde el principio, y a los
 * lectores de pantalla se les da siempre la final, nunca las intermedias.
 */

import { useLayoutEffect, useRef, useState } from 'react';

const NUMERO = /-?\d{1,3}(?:\.\d{3})+(?:,\d+)?|-?\d+(?:,\d+)?/;

export interface CifraPartida {
  antes: string;
  valor: number;
  decimales: number;
  despues: string;
}

/** «3.796,16 €» → { antes: '', valor: 3796.16, decimales: 2, despues: ' €' }. */
export function partirCifra(texto: string): CifraPartida | null {
  const m = NUMERO.exec(texto);
  if (!m) return null;
  const numero = m[0];
  const valor = Number(numero.replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(valor)) return null;
  return {
    antes: texto.slice(0, m.index),
    valor,
    decimales: numero.includes(',') ? numero.split(',')[1].length : 0,
    despues: texto.slice(m.index + numero.length),
  };
}

/** El número con puntos de miles y coma decimal, como lo pinta la app. */
export function escribirCifra(valor: number, decimales: number): string {
  const [entera, frac] = Math.abs(valor).toFixed(decimales).split('.');
  const conMiles = entera.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${valor < 0 ? '-' : ''}${conMiles}${frac ? `,${frac}` : ''}`;
}

const frenada = (t: number) => 1 - Math.pow(1 - t, 4);

export default function CifraQueCuenta({ texto, duracion = 800 }: { texto: string; duracion?: number }) {
  const [mostrado, setMostrado] = useState(texto);
  const contada = useRef(false);

  useLayoutEffect(() => {
    const partes = partirCifra(texto);
    const quieto = typeof window === 'undefined'
      || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (contada.current || !partes || partes.valor === 0 || quieto) {
      setMostrado(texto);
      return;
    }
    contada.current = true;
    const inicio = performance.now();
    let cuadro = 0;
    const paso = (ahora: number) => {
      const t = Math.min(1, (ahora - inicio) / duracion);
      if (t >= 1) { setMostrado(texto); return; }
      setMostrado(`${partes.antes}${escribirCifra(partes.valor * frenada(t), partes.decimales)}${partes.despues}`);
      cuadro = requestAnimationFrame(paso);
    };
    setMostrado(`${partes.antes}${escribirCifra(0, partes.decimales)}${partes.despues}`);
    cuadro = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro);
  }, [texto, duracion]);

  return (
    <>
      <span aria-hidden="true">{mostrado}</span>
      <span className="sr-only">{texto}</span>
    </>
  );
}
