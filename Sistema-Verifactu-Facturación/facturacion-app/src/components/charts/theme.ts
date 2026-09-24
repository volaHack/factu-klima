'use client';

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

/** Paleta de estado. Reservada: jamás se usa para identificar una serie. */
export const STATUS = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
  neutral: '#3987e5',
  muted: '#8b8b93',
} as const;

/**
 * EL VINO DE LA CASA, EN VERSIÓN GRÁFICA
 *
 * El acento del tema NO sirve como color de serie. Se probó: en modo
 * oscuro `--accent-500` vale #7a2436 en los temas de sector, que da
 * luminosidad 0.399 (fuera de la banda 0.48–0.67) y 1.79:1 de
 * contraste sobre la tarjeta — una barra que casi no se ve. Y el
 * #e87fa6 del tema oscuro general se va por el otro lado (L 0.78).
 *
 * Así que el gráfico lleva su propio paso de vino por modo, validado
 * contra su superficie y contra el azul con el que convive:
 *   claro  #b02a5c → L 0.47, contraste 5.3:1, ΔE 29.3 frente al azul
 *   oscuro #c9407a → L 0.58, contraste 3.6:1, ΔE 17.7 frente al azul
 * Sigue siendo el vino de la marca; es el mismo tono, en el paso que
 * la superficie admite.
 */
export const CHART_ACCENT = {
  claro: '#b02a5c',
  oscuro: '#c9407a',
} as const;

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
 * El acento con el que se pinta una serie.
 *
 * Se llama igual que antes porque lo usan varias páginas, pero ya no
 * lee `--accent-500`: devuelve el paso validado del modo activo (ver
 * CHART_ACCENT). El `fallback` se respeta sólo en servidor.
 */
export function resolveAccent(fallback = CHART_ACCENT.claro): string {
  if (typeof window === 'undefined') return fallback;
  return CHART_ACCENT[modoGrafica()];
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

/**
 * RAMPA SECUENCIAL — magnitud en un solo tono, de claro a oscuro
 *
 * Para mapas de calor y la rejilla de días: más oscuro es más. Es el vino
 * de la casa en cinco pasos, uno por modo, porque en oscuro el orden se
 * invierte: lo que se acerca a «nada» se funde con la tarjeta, que allí
 * es casi negra. El paso 4 de cada rampa es el acento validado de
 * CHART_ACCENT, así que el tono fuerte coincide con el de las barras.
 */
export const SECUENCIAL: Record<ModoGrafica, readonly string[]> = {
  claro: ['#f2d9e2', '#e3a9bf', '#cf7298', '#b02a5c', '#7a1a3f'],
  oscuro: ['#4a2231', '#74304b', '#a13a66', '#c9407a', '#ef8db4'],
};

/** Celda sin dato: un paso sobre la tarjeta, que se vea el hueco sin gritar. */
export const CELDA_VACIA: Record<ModoGrafica, string> = {
  claro: '#f0e6e1',
  oscuro: '#2d2024',
};
