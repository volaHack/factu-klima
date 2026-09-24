'use client';

import { useSyncExternalStore } from 'react';
import { acentoActual, suscribirseAlAcento, type Acento } from '@/lib/acento';

// ============================================================
// TOKENS DE VISUALIZACIÓN DE DATOS
//
// Los colores están VALIDADOS con el script de la skill de datos
// (scripts/validate_palette.js), no elegidos a ojo, y contra las dos
// superficies REALES de las tarjetas tras el rediseño blush:
// clara #fbf6f2 y oscura #211619.
//
//   Categóricos (6 slots), superficie clara .... banda de luminosidad,
//       croma y separación para daltonismo PASS (peor par adyacente
//       #c98500↔#199e70, ΔE 8.4 protan). Contraste: el amarillo
//       #c98500 se queda en 2.86:1 → WARN, permitido porque estos
//       gráficos SIEMPRE traen etiqueta visible o vista de tabla.
//   Categóricos (6 slots), superficie oscura ... TODO PASS, contraste
//       de los seis ≥ 3:1.
//   Acento + azul (las dos series de tendencia) . PASS en ambos modos
//       con los pasos de CHART_ACCENT (ΔE 29.3 claro / 17.7 oscuro).
//
// El comentario anterior decía que estaban validados contra #11131a:
// esa superficie desapareció con el rediseño y nadie revalidó. Ahora
// las cifras de arriba corresponden a las superficies que se pintan.
//
// La paleta de ESTADO es fija y no se tematiza: verde = cobrado,
// ámbar = pendiente, rojo = vencido. Nunca se reutiliza para
// identificar series, y siempre va acompañada de etiqueta y valor
// en la leyenda, para que el color no sea el único canal.
// ============================================================

/** Slots categóricos, en orden fijo. Nunca se ciclan ni se generan más. */
export const SERIES = [
  '#3987e5', // 1 · azul
  '#d95926', // 2 · naranja
  '#199e70', // 3 · aqua
  '#c98500', // 4 · amarillo
  '#d55181', // 5 · magenta
  '#008300', // 6 · verde
] as const;

/**
 * Paleta de estado. Reservada: jamás se usa para identificar una serie.
 *
 * Antes era la de fábrica (verde #0ca30c, amarillo #fab219, azul #3987e5):
 * saturada, ajena al blush y con el amarillo a 1,7:1 sobre la tarjeta. El
 * donut de «Reparto por estado» era lo primero que se veía y parecía de
 * plantilla. Estos tonos son más sobrios y, validados sobre #fbf6f2 con
 * todos los pares: banda de luminosidad PASS, daltonismo PASS (peor par
 * vencido↔cobrado ΔE 8.0 deutan), visión normal PASS (≥ 15,6). El gris
 * del borrador no llega al croma mínimo a propósito: es gris.
 */
export const STATUS = {
  good: '#17876f',
  warning: '#cc8b0f',
  serious: '#d9652e',
  critical: '#cc3f48',
  neutral: '#3570c8',
  muted: '#a7a3ad',
} as const;

/**
 * EL ACENTO DE CADA EMPRESA, EN VERSIÓN GRÁFICA
 *
 * Cada empresa elige su acento en Ajustes (rosa, vino, terracota o
 * ciruela) y la interfaz entera lo toma… salvo las gráficas, que iban
 * siempre en rosa: se cambiaba a terracota y los botones cambiaban,
 * pero las barras del panel no.
 *
 * El `--accent-500` del tema no sirve tal cual como color de serie (en
 * oscuro se va a luminosidades de 0.7–0.78, fuera de la banda 0.48–0.67
 * en la que una barra se lee bien junto al azul). Así que cada acento
 * lleva su paso de gráfica por modo, VALIDADO con el script de la guía
 * de visualización contra su superficie (#fbf6f2 / #211619) y contra el
 * azul de SERIES con el que convive. Los ocho pasan todo:
 *   rosa      claro #b02a5c · oscuro #c9407a
 *   vino      claro #8f2e46 · oscuro #c25a70
 *   terracota claro #b04d2b · oscuro #c9683d
 *   ciruela   claro #8e4569 · oscuro #b0529a
 */
export type TemaAcento = Acento;

export const ACENTO_GRAFICA: Record<TemaAcento, { claro: string; oscuro: string }> = {
  rose: { claro: '#b02a5c', oscuro: '#c9407a' },
  wine: { claro: '#8f2e46', oscuro: '#c25a70' },
  terracotta: { claro: '#b04d2b', oscuro: '#c9683d' },
  plum: { claro: '#8e4569', oscuro: '#b0529a' },
};

/** Compatibilidad: el acento rosa, que es el de por defecto. */
export const CHART_ACCENT = ACENTO_GRAFICA.rose;

/** El acento que ha elegido la empresa (ver lib/acento.ts). */
export function temaAcento(): TemaAcento {
  return acentoActual();
}

export type ModoGrafica = 'claro' | 'oscuro';

/** Qué tema está puesto ahora mismo: el explícito manda sobre el del sistema. */
export function modoGrafica(): ModoGrafica {
  if (typeof document === 'undefined') return 'claro';
  const explicito = document.documentElement.getAttribute('data-theme');
  if (explicito === 'dark') return 'oscuro';
  if (explicito === 'light') return 'claro';
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro';
}

/**
 * El acento con el que se pinta una serie: el de la empresa, en el paso
 * validado para el modo activo (ver ACENTO_GRAFICA). El `fallback` se
 * respeta sólo en servidor.
 */
export function resolveAccent(fallback: string = ACENTO_GRAFICA.rose.claro): string {
  if (typeof window === 'undefined') return fallback;
  return ACENTO_GRAFICA[temaAcento()][modoGrafica()];
}

/** Colores por estado de factura. */
export const INVOICE_STATUS_COLOR: Record<string, string> = {
  pagada: STATUS.good,
  pendiente: STATUS.warning,
  emitida: STATUS.neutral,
  vencida: STATUS.critical,
  borrador: STATUS.muted,
  anulada: '#5b5b63',
  pre_aprobacion: SERIES[4],
  aprobado: SERIES[2],
  aprobado_parcial: STATUS.serious,
  rechazado: STATUS.critical,
};

/** Tinta y cromo del gráfico. El texto NUNCA lleva el color de la serie. */
export interface TintaGrafica {
  primary: string;
  secondary: string;
  muted: string;
  grid: string;
  axis: string;
  surface: string;
}

const TINTA_CLARA: TintaGrafica = {
  primary: '#1a1216',
  secondary: '#4a3a40',
  muted: '#6f5d63',
  grid: 'rgba(26, 18, 22, 0.08)',
  axis: 'rgba(26, 18, 22, 0.16)',
  surface: '#fbf6f2',
};

/**
 * La misma tinta, para fondo oscuro. Faltaba entera: `INK` era fija y
 * clara, así que en modo oscuro los ejes y las etiquetas se pintaban
 * en tinta casi negra sobre una tarjeta casi negra. La cuadrícula y el
 * eje son hueso a muy baja opacidad, no blanco puro: una retícula que
 * compite con los datos deja de ser cromo y pasa a ser ruido.
 */
const TINTA_OSCURA: TintaGrafica = {
  primary: '#f7ebef',
  secondary: '#d3bfc7',
  muted: '#a08d95',
  grid: 'rgba(247, 235, 239, 0.10)',
  axis: 'rgba(247, 235, 239, 0.20)',
  surface: '#211619',
};

/** Compatibilidad: quien importe `INK` sigue recibiendo la tinta clara. */
export const INK = TINTA_CLARA;

/** La tinta del modo activo. Se resuelve al montar, como el acento. */
export function resolveInk(modo: ModoGrafica = modoGrafica()): TintaGrafica {
  return modo === 'oscuro' ? TINTA_OSCURA : TINTA_CLARA;
}

/** Formato compacto para los ticks de importe: 12.400 € → "12k". */
export function compactEuro(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(Math.round(value));
}

/** Mezcla dos colores #rrggbb: t = 0 da `a`, t = 1 da `b`. */
export function mezclar(a: string, b: string, t: number): string {
  const ca = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16));
  const cb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
  return '#' + ca.map((v, i) => Math.round(v + (cb[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

/**
 * RAMPA SECUENCIAL — magnitud en un solo tono, de claro a oscuro
 *
 * Para mapas de calor y la rejilla de días: más intenso es más. Se genera
 * a partir del acento de la empresa, así que sigue al tema igual que las
 * barras: cuatro pasos que van de la superficie de la tarjeta al acento
 * validado, y un quinto más allá (más oscuro en claro, más luminoso en
 * oscuro, porque allí «nada» es casi negro y el orden se invierte).
 * El cuarto paso ES el color de las barras.
 */
export function rampaSecuencial(modo: ModoGrafica = modoGrafica(), tema: TemaAcento = temaAcento()): string[] {
  const acento = ACENTO_GRAFICA[tema][modo];
  const superficie = modo === 'oscuro' ? '#211619' : '#fbf6f2';
  const extremo = modo === 'oscuro' ? mezclar(acento, '#ffffff', 0.38) : mezclar(acento, '#000000', 0.32);
  return [
    mezclar(superficie, acento, modo === 'oscuro' ? 0.28 : 0.2),
    mezclar(superficie, acento, modo === 'oscuro' ? 0.48 : 0.42),
    mezclar(superficie, acento, 0.7),
    acento,
    extremo,
  ];
}

/** Compatibilidad: la rampa del acento rosa. */
export const SECUENCIAL: Record<ModoGrafica, readonly string[]> = {
  claro: rampaSecuencial('claro', 'rose'),
  oscuro: rampaSecuencial('oscuro', 'rose'),
};

/** Celda sin dato: un paso sobre la tarjeta, que se vea el hueco sin gritar. */
export const CELDA_VACIA: Record<ModoGrafica, string> = {
  claro: '#f0e6e1',
  oscuro: '#2d2024',
};

/**
 * LOS COLORES DE LA GRÁFICA, EN VIVO
 *
 * Las gráficas leían el acento y el modo una sola vez, al montarse: si la
 * empresa cambiaba de acento en Ajustes o se pasaba a modo oscuro, las
 * barras se quedaban con el color de antes hasta recargar. Aquí se
 * escuchan los dos —la clase del acento en <body> y `data-theme` en
 * <html>— y la gráfica se repinta sola.
 */
function suscribirseAColores(alCambiar: () => void): () => void {
  if (typeof MutationObserver === 'undefined') return () => {};
  const html = new MutationObserver(alCambiar);
  html.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const quitarAcento = suscribirseAlAcento(alCambiar);
  return () => { html.disconnect(); quitarAcento(); };
}
const instantaneaColores = () => `${temaAcento()}|${modoGrafica()}`;
const instantaneaServidor = () => 'rose|claro';

export function useColoresGrafica() {
  const clave = useSyncExternalStore(suscribirseAColores, instantaneaColores, instantaneaServidor);
  const [tema, modo] = clave.split('|') as [TemaAcento, ModoGrafica];
  return { tema, modo, accent: ACENTO_GRAFICA[tema][modo], ink: resolveInk(modo) };
}
