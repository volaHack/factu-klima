'use client';

import { useMemo, useState } from 'react';
import { ResponsiveBar, type BarDatum, type BarItemProps, type BarCustomLayerProps } from '@nivo/bar';
import { ResponsiveLine } from '@nivo/line';
import { ResponsivePie } from '@nivo/pie';
import {
  SERIES, compactEuro, modoGrafica, resolveAccent, resolveInk,
  type TintaGrafica,
} from './theme';
import { formatCurrency } from '@/lib/utils';

// ============================================================
// GRÁFICAS — Nivo
//
// Se pasó de Recharts a Nivo porque sus capas son abiertas: aquí las
// barras las dibuja esta casa (esquina redondeada SÓLO en el extremo
// del dato, base cuadrada, grosor tope 24 px) en vez de aceptar el
// rectángulo que traiga la librería. Los manejadores de ratón siguen
// siendo los de Nivo, así que el tooltip y el resaltado son nativos.
//
// Las reglas de marca —grosores, hueco de 2 px entre barras, anillo de
// superficie en los puntos, etiqueta selectiva— vienen de la guía de
// visualización de datos; los colores salen de theme.ts, ya validados
// contra las dos superficies reales de la tarjeta.
// ============================================================

/**
 * Acento, tinta y preferencia de movimiento, resueltos UNA vez al
 * montar. Estos componentes sólo se montan en cliente, así que el
 * valor está listo en el primer render y no hace falta un segundo.
 */
export function useGrafica() {
  const [valores] = useState(() => {
    const modo = modoGrafica();
    return {
      modo,
      accent: resolveAccent(),
      ink: resolveInk(modo),
      reducido:
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    };
  });
  return valores;
}

/** Cromo del gráfico: ejes finos, cuadrícula de un paso sobre el fondo. */
export function temaNivo(ink: TintaGrafica) {
  return {
    text: { fontSize: 11, fill: ink.muted, fontFamily: 'inherit' },
    labels: { text: { fontSize: 11, fill: ink.secondary, fontFamily: 'inherit' } },
    axis: {
      domain: { line: { stroke: ink.axis, strokeWidth: 1 } },
      ticks: {
        line: { stroke: 'transparent', strokeWidth: 0 },
        text: { fill: ink.muted, fontSize: 11, fontFamily: 'inherit' },
      },
    },
    grid: { line: { stroke: ink.grid, strokeWidth: 1 } },
  };
}

/** Una etiqueta de eje que no cabe se corta por el final, con «…». */
function recortaEtiqueta(texto: string, max: number): string {
  return texto.length > max ? `${texto.slice(0, max - 1).trimEnd()}…` : texto;
}

/** Grosor máximo de una barra. Nunca llena su banda: el aire es del gráfico. */
const GROSOR_MAX = 24;
const RADIO = 4;

/** Columna: redondeada arriba (el dato), cuadrada abajo (la base). */
function trazadoColumna(x: number, y: number, w: number, h: number): string {
  const r = Math.max(0, Math.min(RADIO, w / 2, h));
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} `
    + `L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}

/** Barra horizontal: redondeada a la derecha, cuadrada contra el eje. */
function trazadoBarra(x: number, y: number, w: number, h: number): string {
  const r = Math.max(0, Math.min(RADIO, h / 2, w));
  return `M${x},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} `
    + `L${x + w},${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} L${x},${y + h} Z`;
}

/**
 * La barra, dibujada a mano.
 *
 * Nivo pinta un <rect> con las cuatro esquinas iguales; la guía pide el
 * redondeo sólo en el extremo del dato. El grosor se recorta aquí a
 * GROSOR_MAX y la barra se recentra en su banda, así que ningún ajuste
 * de `padding` puede engordarla.
 *
 * La animación de entrada la lleva el CSS (`.barra-dato` en globals),
 * con retraso escalonado por posición: entra como una ola de izquierda
 * a derecha en vez de todas a la vez. `prefers-reduced-motion` la anula
 * allí mismo.
 */
function barraDe(orientacion: 'vertical' | 'horizontal') {
  return function Barra({ bar, onMouseEnter, onMouseLeave, onClick }: BarItemProps<BarDatum>) {
    let { x, y, width, height } = bar;
    if (width <= 0 || height <= 0) return null;

    if (orientacion === 'vertical' && width > GROSOR_MAX) {
      x += (width - GROSOR_MAX) / 2;
      width = GROSOR_MAX;
    }
    const grosorBarra = GROSOR_MAX - 4;
    if (orientacion === 'horizontal' && height > grosorBarra) {
      y += (height - grosorBarra) / 2;
      height = grosorBarra;
    }

    type ManejadorNivo = ((datum: typeof bar, event: React.MouseEvent<SVGRectElement>) => void) | undefined;
    const puente = (fn: ManejadorNivo) =>
      fn
        ? (event: React.MouseEvent<SVGPathElement>) =>
            fn(bar, event as unknown as React.MouseEvent<SVGRectElement>)
        : undefined;

    return (
      <path
        d={orientacion === 'vertical'
          ? trazadoColumna(x, y, width, height)
          : trazadoBarra(x, y, width, height)}
        fill={bar.color}
        className={`barra-dato${orientacion === 'horizontal' ? ' barra-dato--horizontal' : ''}`}
        style={{ animationDelay: `${Math.min(bar.index, 14) * 26}ms` }}
        onMouseEnter={puente(onMouseEnter as ManejadorNivo)}
        onMouseLeave={puente(onMouseLeave as ManejadorNivo)}
        onClick={puente(onClick as ManejadorNivo)}
      />
    );
  };
}

export const BarraVertical = barraDe('vertical');
const BarraHorizontal = barraDe('horizontal');

/** Tooltip: primero el número, después de qué es. El color va en una llave. */
export function Tip({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="chart-tip">
      <span className="chart-tip-key" style={{ background: color }} aria-hidden="true" />
      <span className="chart-tip-value">{value}</span>
      <span className="chart-tip-label">{label}</span>
    </div>
  );
}

// ============================================================
// COLUMNAS — evolución mensual (una sola serie)
// Una serie ⇒ un color y sin leyenda: el título ya dice qué se pinta.
// ============================================================

export function RevenueColumns({ data }: { data: { name: string; total: number }[] }) {
  const { accent, ink } = useGrafica();
  const plot = useMemo<BarDatum[]>(() => data.map(d => ({ name: d.name, total: d.total })), [data]);
  const max = Math.max(...data.map(d => d.total), 0);

  /** Etiqueta directa sólo en el máximo, no en cada columna. */
  const EtiquetaMaximo = ({ bars }: BarCustomLayerProps<BarDatum>) => (
    <g>
      {bars
        .filter(b => max > 0 && Number(b.data.value) === max)
        .map(b => (
          <text
            key={b.key}
            x={b.x + b.width / 2}
            y={b.y - 8}
            textAnchor="middle"
            style={{ fill: ink.secondary, fontSize: 11, fontFamily: 'inherit' }}
          >
            {compactEuro(Number(b.data.value))}
          </text>
        ))}
    </g>
  );

  return (
    <ResponsiveBar
      data={plot}
      keys={['total']}
      indexBy="name"
      margin={{ top: 24, right: 8, bottom: 28, left: 48 }}
      padding={0.42}
      colors={[accent]}
      theme={temaNivo(ink)}
      animate={false}
      barComponent={BarraVertical}
      layers={['grid', 'axes', 'bars', EtiquetaMaximo]}
      enableLabel={false}
      enableGridX={false}
      axisBottom={{ tickSize: 0, tickPadding: 8 }}
      axisLeft={{ tickSize: 0, tickPadding: 8, format: compactEuro, tickValues: 4 }}
      tooltip={({ data: d, color }) => (
        <Tip color={color} label={String(d.name)} value={formatCurrency(Number(d.total))} />
      )}
      role="img"
      ariaLabel="Facturación por mes"
    />
  );
}

// ============================================================
// LÍNEAS Y ÁREA — tendencia con dos series (total vs base imponible)
// Dos series ⇒ leyenda obligatoria (la pinta la tarjeta).
// ============================================================

/** Un tooltip con TODAS las series de esa X: el puntero no tiene que acertar la línea. */
export function TipRebanada({ puntos }: { puntos: { serie: string; color: string; valor: number }[] }) {
  return (
    <div className="chart-tip chart-tip--lista">
      {puntos.map(p => (
        <div key={p.serie} className="chart-tip-fila">
          <span className="chart-tip-key" style={{ background: p.color }} aria-hidden="true" />
          <span className="chart-tip-value">{formatCurrency(p.valor)}</span>
          <span className="chart-tip-label">{p.serie}</span>
        </div>
      ))}
    </div>
  );
}

function LineasBase({
  data, label1, label2, area,
}: {
  data: { name: string; total: number; base: number }[];
  label1: string;
  label2: string;
  area: boolean;
}) {
  const { accent, ink, reducido } = useGrafica();
  const series = useMemo(
    () => [
      { id: label1, data: data.map(d => ({ x: d.name, y: d.total })) },
      { id: label2, data: data.map(d => ({ x: d.name, y: d.base })) },
    ],
    [data, label1, label2],
  );

  return (
    <ResponsiveLine
      data={series}
      margin={{ top: 16, right: 16, bottom: 28, left: 48 }}
      xScale={{ type: 'point' }}
      yScale={{ type: 'linear', min: 0, max: 'auto', stacked: false }}
      curve="monotoneX"
      colors={[accent, SERIES[0]]}
      theme={temaNivo(ink)}
      lineWidth={2}
      enableArea={area}
      areaOpacity={0.12}
      enablePoints
      pointSize={8}
      pointColor={{ from: 'series.color' }}
      pointBorderWidth={2}
      pointBorderColor={ink.surface}
      enableGridX={false}
      axisBottom={{ tickSize: 0, tickPadding: 8 }}
      axisLeft={{ tickSize: 0, tickPadding: 8, format: compactEuro, tickValues: 4 }}
      enableSlices="x"
      enableCrosshair
      crosshairType="x"
      sliceTooltip={({ slice }) => (
        <TipRebanada
          puntos={slice.points.map(p => ({
            serie: String(p.seriesId),
            color: p.seriesColor,
            valor: Number(p.data.y),
          }))}
        />
      )}
      animate={!reducido}
      motionConfig="gentle"
    />
  );
}

export function TrendLines({ data }: { data: { name: string; total: number; base: number }[] }) {
  return <LineasBase data={data} label1="Total facturado" label2="Base imponible" area={false} />;
}

/** Área: el relleno es un lavado al 12 %, no un bloque saturado. */
export function AreaTrendChart({
  data,
  label1 = 'Total facturado',
  label2 = 'Base imponible',
}: {
  data: { name: string; total: number; base: number }[];
  label1?: string;
  label2?: string;
}) {
  return <LineasBase data={data} label1={label1} label2={label2} area />;
}

// ============================================================
// BARRAS HORIZONTALES — rankings con nombres largos
// Comparar magnitud ⇒ un solo tono, no un color por fila.
// ============================================================

export function RankedBars({
  data,
  color,
}: {
  data: { name: string; total: number }[];
  color?: string;
}) {
  const { accent, ink } = useGrafica();
  const fill = color ?? accent;

  // Se proyecta a los dos campos que el gráfico usa: si un llamante pasa
  // objetos con otras claves (los productos traen `ref`), ninguna acaba
  // repartida sobre un nodo del DOM.
  const plot = useMemo<BarDatum[]>(
    () => data.map(({ name, total }) => ({ name, total })),
    [data],
  );

  /** El valor va FUERA del extremo: dentro se recortaría en las barras cortas. */
  const EtiquetaValor = ({ bars }: BarCustomLayerProps<BarDatum>) => (
    <g>
      {bars.map(b => (
        <text
          key={b.key}
          x={b.x + b.width + 8}
          y={b.y + b.height / 2}
          dominantBaseline="central"
          style={{ fill: ink.secondary, fontSize: 11, fontFamily: 'inherit' }}
        >
          {compactEuro(Number(b.data.value))}
        </text>
      ))}
    </g>
  );

  return (
    <ResponsiveBar
      data={plot}
      keys={['total']}
      indexBy="name"
      layout="horizontal"
      margin={{ top: 4, right: 56, bottom: 24, left: 136 }}
      padding={0.34}
      colors={[fill]}
      theme={temaNivo(ink)}
      animate={false}
      barComponent={BarraHorizontal}
      layers={['grid', 'axes', 'bars', EtiquetaValor]}
      enableLabel={false}
      enableGridX
      enableGridY={false}
      axisBottom={{ tickSize: 0, tickPadding: 8, format: compactEuro, tickValues: 4 }}
      // Los 136 px del margen caben unas 20 letras a 11 px: un nombre de
      // sociedad más largo se cortaba por la IZQUIERDA («…adería Artesana»).
      // Se recorta por el final y el nombre entero sigue en el tooltip.
      axisLeft={{ tickSize: 0, tickPadding: 8, format: v => recortaEtiqueta(String(v), 20) }}
      tooltip={({ data: d, color: c }) => (
        <Tip color={c} label={String(d.name)} value={formatCurrency(Number(d.total))} />
      )}
      role="img"
      ariaLabel="Ranking por importe facturado"
    />
  );
}

// ============================================================
// DONUT — reparto por estado (parte-todo, máximo 6 segmentos)
// ============================================================

export interface DonutSlice {
  name: string;
  value: number;
  color: string;
}

export function StatusDonut({ data, centerLabel, centerValue }: {
  data: DonutSlice[];
  centerLabel: string;
  centerValue: string;
}) {
  const { ink, reducido } = useGrafica();
  const slices = useMemo(
    () => data.map(d => ({ id: d.name, label: d.name, value: d.value, color: d.color })),
    [data],
  );

  return (
    <div className="donut-wrap">
      <ResponsivePie
        data={slices}
        margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
        innerRadius={0.62}
        padAngle={2}
        cornerRadius={2}
        activeOuterRadiusOffset={6}
        colors={{ datum: 'data.color' }}
        /* El hueco entre porciones lo hace el color de la superficie, no
           un borde dibujado: separa el blanco, no la tinta. */
        borderWidth={2}
        borderColor={ink.surface}
        theme={temaNivo(ink)}
        enableArcLabels={false}
        enableArcLinkLabels={false}
        tooltip={({ datum }) => (
          <Tip
            color={datum.color}
            label={String(datum.label)}
            value={`${datum.value} ${datum.value === 1 ? 'factura' : 'facturas'}`}
          />
        )}
        animate={!reducido}
        motionConfig="gentle"
      />

      <div className="donut-center" aria-hidden="true">
        <span className="donut-center-value">{centerValue}</span>
        <span className="donut-center-label">{centerLabel}</span>
      </div>
    </div>
  );
}

/** Leyenda con punto de color + etiqueta + valor: el color nunca va solo. */
export function ChartLegend({ items }: { items: { name: string; value: string; color: string }[] }) {
  return (
    <ul className="chart-legend">
      {items.map(item => (
        <li key={item.name}>
          <span className="chart-legend-dot" style={{ background: item.color }} />
          <span className="chart-legend-name">{item.name}</span>
          <span className="chart-legend-value">{item.value}</span>
        </li>
      ))}
    </ul>
  );
}

// ============================================================
// BARRAS DE COMPARACIÓN — dos series por categoría
// `innerPadding` son los 2 px de superficie que separan las dos barras
// de un grupo: el hueco separa, no un borde alrededor.
// ============================================================

export function ComparisonBarChart({
  data,
  name1 = 'Serie 1',
  name2 = 'Serie 2',
}: {
  data: { name: string; series1: number; series2: number }[];
  name1?: string;
  name2?: string;
}) {
  const { accent, ink } = useGrafica();
  const plot = useMemo<BarDatum[]>(
    () => data.map(d => ({ name: d.name, [name1]: d.series1, [name2]: d.series2 })),
    [data, name1, name2],
  );

  return (
    <ResponsiveBar
      data={plot}
      keys={[name1, name2]}
      indexBy="name"
      groupMode="grouped"
      margin={{ top: 16, right: 12, bottom: 28, left: 48 }}
      padding={0.3}
      innerPadding={2}
      colors={[accent, SERIES[0]]}
      theme={temaNivo(ink)}
      animate={false}
      barComponent={BarraVertical}
      enableLabel={false}
      enableGridX={false}
      axisBottom={{ tickSize: 0, tickPadding: 8 }}
      axisLeft={{ tickSize: 0, tickPadding: 8, format: compactEuro, tickValues: 4 }}
      tooltip={({ id, value, color, indexValue }) => (
        <Tip color={color} label={`${indexValue} · ${id}`} value={formatCurrency(Number(value))} />
      )}
      role="img"
      ariaLabel={`Comparación de ${name1} y ${name2}`}
    />
  );
}
