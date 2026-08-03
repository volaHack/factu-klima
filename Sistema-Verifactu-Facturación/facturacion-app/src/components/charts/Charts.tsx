'use client';

import { useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis, LabelList,
} from 'recharts';
import { INK, SERIES, TOOLTIP_CURSOR, TOOLTIP_STYLE, compactEuro, resolveAccent } from './theme';
import { formatCurrency } from '@/lib/utils';

/**
 * Acento del tema activo, leído una sola vez al montar.
 *
 * Se resuelve en el inicializador perezoso de useState en vez de en un
 * efecto: los gráficos sólo se montan cuando la página ya está en
 * cliente, así que el valor está disponible en el primer render y no
 * hace falta provocar un segundo.
 */
function useAccent(): string {
  const [accent] = useState(() => resolveAccent());
  return accent;
}

/**
 * Recharts anima por defecto (1500ms) pero no consulta `prefers-reduced-
 * motion` por sí solo. Se resuelve una vez, igual que useAccent: estos
 * componentes sólo se montan en cliente, así que el valor ya está
 * disponible en el primer render.
 */
function usePrefersReducedMotion(): boolean {
  const [reduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  return reduced;
}

// Entrada más ágil que el 1500ms/ease por defecto de Recharts — coherente
// con --ease-settle del resto de la app — y desactivada por completo si
// el usuario pide menos movimiento.
const CHART_ANIM_MS = 700;

const AXIS_TICK = { fill: INK.muted, fontSize: 11 } as const;
const AXIS_LINE = { stroke: INK.axis } as const;

// ============================================================
// COLUMNAS — evolución mensual (una sola serie)
// Una serie ⇒ un color y sin leyenda: el título ya dice qué se pinta.
// ============================================================

export function RevenueColumns({ data }: { data: { name: string; total: number }[] }) {
  const accent = useAccent();
  const reducedMotion = usePrefersReducedMotion();
  const max = Math.max(...data.map(d => d.total), 0);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 20, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke={INK.grid} />
        <XAxis dataKey="name" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
        <YAxis
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
          width={44}
          tickFormatter={compactEuro}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          cursor={TOOLTIP_CURSOR}
          labelStyle={{ color: INK.secondary, marginBottom: 4 }}
          formatter={(value) => [formatCurrency(Number(value)), 'Facturado']}
        />
        {/* maxBarSize evita bloques gruesos: la barra no llena la banda. */}
        <Bar
          dataKey="total" fill={accent} radius={[4, 4, 0, 0]} maxBarSize={24}
          isAnimationActive={!reducedMotion} animationDuration={CHART_ANIM_MS} animationEasing="ease-out"
        >
          {/* Etiqueta directa sólo en el máximo, no en cada columna. */}
          <LabelList
            dataKey="total"
            position="top"
            fill={INK.secondary}
            fontSize={11}
            formatter={(v) => (Number(v) > 0 && Number(v) === max ? compactEuro(Number(v)) : '')}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ============================================================
// LÍNEAS — tendencia con dos series (total vs base imponible)
// Dos series ⇒ leyenda obligatoria (la pinta la tarjeta).
// ============================================================

export function TrendLines({ data }: { data: { name: string; total: number; base: number }[] }) {
  const accent = useAccent();
  const reducedMotion = usePrefersReducedMotion();

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={INK.grid} />
        <XAxis dataKey="name" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={44} tickFormatter={compactEuro} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={{ color: INK.secondary, marginBottom: 4 }}
          formatter={(value, name) => [
            formatCurrency(Number(value)),
            name === 'total' ? 'Total facturado' : 'Base imponible',
          ]}
        />
        <Line
          type="monotone" dataKey="total" name="total"
          stroke={accent} strokeWidth={2} strokeLinecap="round"
          dot={{ r: 4, fill: accent, stroke: INK.surface, strokeWidth: 2 }}
          activeDot={{ r: 6, stroke: INK.surface, strokeWidth: 2 }}
          isAnimationActive={!reducedMotion} animationDuration={CHART_ANIM_MS} animationEasing="ease-out"
        />
        <Line
          type="monotone" dataKey="base" name="base"
          stroke={SERIES[0]} strokeWidth={2} strokeLinecap="round"
          dot={{ r: 3, fill: SERIES[0], stroke: INK.surface, strokeWidth: 2 }}
          activeDot={{ r: 5, stroke: INK.surface, strokeWidth: 2 }}
          isAnimationActive={!reducedMotion} animationDuration={CHART_ANIM_MS} animationEasing="ease-out"
        />
      </LineChart>
    </ResponsiveContainer>
  );
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
  const accent = useAccent();
  const reducedMotion = usePrefersReducedMotion();
  const fill = color ?? accent;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 56, left: 0, bottom: 0 }}
        barCategoryGap="26%"
      >
        <CartesianGrid horizontal={false} stroke={INK.grid} />
        <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={compactEuro} />
        <YAxis
          type="category"
          dataKey="name"
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
          width={132}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          cursor={TOOLTIP_CURSOR}
          labelStyle={{ color: INK.secondary, marginBottom: 4 }}
          formatter={(value) => [formatCurrency(Number(value)), 'Facturado']}
        />
        <Bar
          dataKey="total" fill={fill} radius={[0, 4, 4, 0]} maxBarSize={20}
          isAnimationActive={!reducedMotion} animationDuration={CHART_ANIM_MS} animationEasing="ease-out"
        >
          {/* La etiqueta va FUERA del extremo de la barra: dentro se
              recortaría en las barras cortas. */}
          <LabelList
            dataKey="total"
            position="right"
            fill={INK.secondary}
            fontSize={11}
            formatter={(v) => compactEuro(Number(v))}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
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
  const reducedMotion = usePrefersReducedMotion();
  // El color va en el propio dato: <Cell> está obsoleto y desaparece en
  // Recharts 4. Pie ya lee `fill` de cada entrada.
  const slices = data.map(d => ({ ...d, fill: d.color }));

  return (
    <div className="donut-wrap">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={slices}
            dataKey="value"
            cx="50%"
            cy="50%"
            innerRadius="62%"
            outerRadius="88%"
            /* El hueco entre segmentos lo hace el color de fondo, no un
               borde dibujado alrededor de cada porción. */
            paddingAngle={2}
            stroke={INK.surface}
            strokeWidth={2}
            isAnimationActive={!reducedMotion}
            animationDuration={CHART_ANIM_MS}
            animationEasing="ease-out"
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value, name) => [`${Number(value)} facturas`, String(name)]}
          />
        </PieChart>
      </ResponsiveContainer>

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
