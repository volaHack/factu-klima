'use client';

// ============================================================
// TOKENS DE VISUALIZACIÓN DE DATOS
//
// Los colores están VALIDADOS contra la superficie real de las
// tarjetas en modo oscuro (#11131a), no elegidos a ojo:
//
//   Categóricos (6 slots) ... PASS en banda de luminosidad, croma,
//                             separación para daltonismo (peor par
//                             ΔE 8.4) y contraste ≥ 3:1.
//   Los 3 primeros slots ..... PASS también en modo "todos los pares",
//                             que es el que aplica a un donut.
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

/** Tinta y cromo del gráfico. El texto NUNCA lleva el color de la serie.
    Recalibrado 2026-08-08 para el rediseño blush/vino/rosa — este archivo
    usa hex literales, no las variables de globals.css, así que el cambio
    de paleta general no lo tocaba solo; el texto casi blanco y las líneas
    de cuadrícula blancas se quedaban invisibles sobre el fondo claro. */
export const INK = {
  primary: '#1a1216',
  secondary: '#4a3a40',
  muted: '#6f5d63',
  grid: 'rgba(26, 18, 22, 0.08)',
  axis: 'rgba(26, 18, 22, 0.16)',
  surface: '#fbf6f2',
} as const;

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

/**
 * Resuelve el acento del tema activo a un color real.
 *
 * Recharts escribe el valor en el atributo `fill` del SVG. Pasarle
 * `var(--accent-500)` funciona sólo si el navegador resuelve variables
 * CSS en atributos de presentación — y si el <body> aún no tiene la
 * clase del tema aplicada, se queda sin color y la barra desaparece.
 * Por eso se resuelve a hexadecimal antes de pintar.
 */
export function resolveAccent(fallback = '#b02a5c'): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.body).getPropertyValue('--accent-500').trim();
  return value || fallback;
}

/** Estilo compartido de los tooltips. */
export const TOOLTIP_STYLE = {
  background: '#ffffff',
  border: '1px solid rgba(26, 18, 22, 0.14)',
  borderRadius: '10px',
  color: INK.primary,
  fontSize: '12px',
  boxShadow: '0 12px 32px -4px rgba(76, 26, 40, 0.22)',
  padding: '8px 12px',
} as const;

export const TOOLTIP_CURSOR = { fill: 'rgba(26, 18, 22, 0.05)' } as const;

/** Formato compacto para los ticks de importe: 12.400 € → "12k". */
export function compactEuro(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(Math.round(value));
}
