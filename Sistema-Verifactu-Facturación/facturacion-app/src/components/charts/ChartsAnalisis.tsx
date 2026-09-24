'use client';

import { useMemo } from 'react';
import { ResponsiveBullet, type BulletTooltipProps } from '@nivo/bullet';
import { ResponsiveTimeRange } from '@nivo/calendar';
import { ResponsiveHeatMap } from '@nivo/heatmap';
import { ResponsiveWaffle } from '@nivo/waffle';
import { ResponsiveScatterPlot, type ScatterPlotLayerProps, type ScatterPlotNodeProps } from '@nivo/scatterplot';
import { ResponsiveBump, type BumpCustomLayerProps } from '@nivo/bump';
import { ResponsiveTreeMap } from '@nivo/treemap';
import { ResponsiveBar, type BarDatum, type BarCustomLayerProps } from '@nivo/bar';
import { ResponsiveLine } from '@nivo/line';
import { BarraVertical, Tip, TipRebanada, temaNivo, useGrafica } from './Charts';
import { CELDA_VACIA, SERIES, STATUS, compactEuro, rampaSecuencial } from './theme';
import { formatCurrency } from '@/lib/utils';
import {
  DIAS_SEMANA, MESES_CORTOS, fechaLocal,
  type AcumuladoMes, type DiaVenta, type EstadoCobro, type FilaSemana, type NodoArbol,
  type PuntualidadCliente, type RitmoDelMes, type SerieRanking, type TramoDeuda,
} from '@/lib/analitica';

// ============================================================
// GRÁFICAS DEL ANÁLISIS — Nivo
//
// Mismas reglas que Charts.tsx: tinta para el texto (nunca el color de
// la serie), rejilla de un paso sobre la tarjeta, 2 px de superficie
// entre marcas que se tocan, el número delante en el tooltip, y la
// animación fuera si quien mira pidió menos movimiento.
// ============================================================

const fechaLarga = (day: string) => {
  const d = fechaLocal(day);
  return d
    ? d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    : day;
};

const recorta = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Luminancia relativa WCAG de un #rrggbb. */
function luminancia(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Texto sobre un relleno de color: blanco o tinta, el que más contraste. */
function textoSobre(fondo: string): string {
  const l = luminancia(fondo);
  return (1.05 / (l + 0.05)) >= ((l + 0.05) / 0.0625) ? '#ffffff' : '#1a1216';
}

// ============================================================
// 1 · RITMO DEL MES — Bullet
//
// Nivo ordena los tramos de menor a mayor y los colorea por POSICIÓN,
// no por el orden en que se pasan. Por eso las medidas van siempre
// [actual, proyección] (la proyección nunca es menor) y los colores se
// dan en ese mismo orden: el primero, sólido; el segundo, el lavado.
// Los ejes de Nivo no admiten formato, así que no se pintan: los
// importes van en el título de cada fila, en la leyenda y en la tabla.
// ============================================================

export function RitmoBullet({ ritmo }: { ritmo: RitmoDelMes }) {
  const { accent, ink, reducido } = useGrafica();

  const filas = [
    { id: 'facturado', titulo: 'Facturado', f: ritmo.facturado },
    { id: 'cobrado', titulo: 'Cobrado', f: ritmo.cobrado },
  ];

  const data = filas.map(({ id, titulo, f }) => ({
    id,
    title: (
      <text textAnchor="start" dominantBaseline="central">
        <tspan x={0} dy="-0.55em" style={{ fill: ink.secondary, fontSize: 11 }}>{titulo}</tspan>
        <tspan x={0} dy="1.35em" style={{ fill: ink.primary, fontSize: 13, fontWeight: 700 }}>
          {compactEuro(f.actual)} €
        </tspan>
      </text>
    ),
    // Media y mejor de los doce meses, y un techo con algo de aire para
    // que ninguna marca quede pegada al borde. Nivo ajusta la escala al
    // mayor de todos los valores, así que el techo manda.
    ranges: [
      ...[f.mediaDoceMeses, f.mejorDoceMeses].filter(v => v > 0),
      Math.max(1, f.proyeccion, f.mejorDoceMeses, f.mesAnterior, f.mismoMesAnioPasado) * 1.08,
    ],
    measures: f.proyeccion > f.actual ? [f.actual, f.proyeccion] : [f.actual],
    markers: [f.mesAnterior, f.mismoMesAnioPasado],
  }));

  // Tres grises de la tinta, del más marcado (hasta la media) al más
  // leve (el aire del final). Nivo los reparte por posición.
  const gris = (a: number) => ink.grid.replace(/[\d.]+\)$/, `${a})`);

  // El tooltip de Nivo sólo trae valor y color: el color dice qué es.
  const nombres = new Map<string, string>([
    [accent, 'Hasta hoy'],
    [`${accent}55`, 'Si sigue a este paso'],
    [ink.primary, 'Mes anterior'],
    [SERIES[0], 'Mismo mes del año pasado'],
  ]);
  const TipBullet = ({ v0, v1, color }: BulletTooltipProps) => (
    <Tip
      color={color}
      label={nombres.get(color) ?? 'Referencia de los 12 meses anteriores'}
      value={v1 === undefined ? formatCurrency(v0) : `${compactEuro(v0)} – ${compactEuro(v1)} €`}
    />
  );

  return (
    <ResponsiveBullet
      data={data}
      margin={{ top: 10, right: 16, bottom: 10, left: 96 }}
      spacing={34}
      titleAlign="start"
      titleOffsetX={-96}
      measureSize={0.34}
      markerSize={0.78}
      rangeColors={[gris(0.16), gris(0.1), gris(0.05)]}
      measureColors={[accent, `${accent}55`]}
      markerColors={[ink.primary, SERIES[0]]}
      theme={{
        ...temaNivo(ink),
        axis: { ticks: { line: { strokeWidth: 0 }, text: { fill: 'transparent' } }, domain: { line: { strokeWidth: 0 } } },
      }}
      tooltip={TipBullet}
      animate={!reducido}
      motionConfig="gentle"
    />
  );
}

// ============================================================
// 2 · DÍAS CON VENTAS — TimeRange
//
// Dos cosas de Nivo que hay que saber:
//  · `weekdays` se da empezando en DOMINGO y Nivo lo rota según
//    `firstWeekday`; los `weekdayTicks` cuentan filas ya rotadas.
//  · La etiqueta del mes le llega con año y mes a cero: el mes bueno
//    sólo está en la fecha, así que se lee de ahí.
// ============================================================

const DIAS_DESDE_DOMINGO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export function DiasConVentas({
  dias, desde, hasta, celda,
}: { dias: DiaVenta[]; desde: Date; hasta: Date; celda: number }) {
  const { ink, modo } = useGrafica();
  const facturasDe = useMemo(() => new Map(dias.map(d => [d.day, d.facturas])), [dias]);

  return (
    <ResponsiveTimeRange
      data={dias.map(({ day, value }) => ({ day, value }))}
      from={desde}
      to={hasta}
      firstWeekday="monday"
      weekdays={DIAS_DESDE_DOMINGO}
      weekdayTicks={[0, 2, 4]}
      weekdayLegendOffset={30}
      monthLegend={(_a, _m, fecha) => MESES_CORTOS[fecha.getMonth()]}
      monthLegendOffset={8}
      margin={{ top: 22, right: 0, bottom: 0, left: 0 }}
      square
      align="top-left"
      daySpacing={2}
      dayRadius={Math.min(3, celda / 4)}
      dayBorderWidth={0}
      emptyColor={CELDA_VACIA[modo]}
      colors={rampaSecuencial(modo)}
      minValue={0}
      theme={temaNivo(ink)}
      tooltip={({ day, value, color }) => (
        <Tip
          color={color}
          value={`${value} €`}
          label={`${fechaLarga(day)} · ${facturasDe.get(day) ?? 0} ${facturasDe.get(day) === 1 ? 'factura' : 'facturas'}`}
        />
      )}
      valueFormat={v => formatCurrency(v).replace(/\s?€$/, '')}
      role="img"
    />
  );
}

/** «Menos ▢▢▢▢▢ Más»: la leyenda de una rampa secuencial. */
export function LeyendaRampa({ menos = 'Menos', mas = 'Más', vacio }: { menos?: string; mas?: string; vacio?: string }) {
  const { modo } = useGrafica();
  return (
    <div className="leyenda-rampa" aria-hidden="true">
      {vacio && (
        <>
          <span className="leyenda-rampa-celda" style={{ background: CELDA_VACIA[modo] }} />
          <span>{vacio}</span>
          <span className="leyenda-rampa-sep" />
        </>
      )}
      <span>{menos}</span>
      {rampaSecuencial(modo).map(c => <span key={c} className="leyenda-rampa-celda" style={{ background: c }} />)}
      <span>{mas}</span>
    </div>
  );
}

// ============================================================
// 3 · QUÉ DÍA SE VENDE — HeatMap
// ============================================================

export function MapaSemanal({ filas }: { filas: FilaSemana[] }) {
  const { ink, modo, reducido } = useGrafica();
  const rampa = rampaSecuencial(modo);
  const max = Math.max(0, ...filas.flatMap(f => f.data.map(c => c.y ?? 0)));

  return (
    <ResponsiveHeatMap
      data={filas}
      margin={{ top: 26, right: 4, bottom: 4, left: 40 }}
      xInnerPadding={0.08}
      yInnerPadding={0.12}
      borderRadius={3}
      colors={cell => {
        if (cell.value === null || cell.value <= 0 || max <= 0) return CELDA_VACIA[modo];
        const i = Math.min(rampa.length - 1, Math.floor((cell.value / max) * rampa.length));
        return rampa[i];
      }}
      emptyColor={CELDA_VACIA[modo]}
      enableLabels={false}
      axisTop={{ tickSize: 0, tickPadding: 8 }}
      axisLeft={{ tickSize: 0, tickPadding: 8 }}
      axisRight={null}
      axisBottom={null}
      theme={temaNivo(ink)}
      hoverTarget="cell"
      inactiveOpacity={0.55}
      tooltip={({ cell }) => {
        const d = cell.data as FilaSemana['data'][number];
        return (
          <Tip
            color={cell.color}
            value={cell.value === null ? 'Sin datos' : formatCurrency(cell.value)}
            label={`de media cada ${cell.serieId.toLowerCase()} · ${d.x} (${d.dias} ${d.dias === 1 ? 'día' : 'días'})`}
          />
        );
      }}
      animate={!reducido}
      motionConfig="gentle"
      role="img"
      ariaLabel="Venta media por día de la semana y mes"
    />
  );
}

export const ORDEN_DIAS = DIAS_SEMANA;

// ============================================================
// 4 · EN QUÉ PUNTO ESTÁ EL COBRO — Waffle
//
// Cien casillas = lo facturado en doce meses. Colores de ESTADO, que
// aquí sí significan estado; la leyenda lleva etiqueta e importe para
// que el color no sea el único canal.
// ============================================================

export const COLORES_COBRO = {
  cobrado: STATUS.good,
  pendiente: STATUS.warning,
  vencido: STATUS.critical,
} as const;

export function CobroWaffle({ estado }: { estado: EstadoCobro }) {
  const { ink, modo, reducido } = useGrafica();
  const data = [
    { id: 'cobrado', label: 'Cobrado', value: estado.cobrado },
    { id: 'pendiente', label: 'Pendiente, a tiempo', value: estado.pendiente },
    { id: 'vencido', label: 'Vencido', value: estado.vencido },
  ];

  return (
    <ResponsiveWaffle
      data={data}
      total={estado.total}
      rows={10}
      columns={10}
      fillDirection="top"
      padding={2}
      borderRadius={2}
      margin={{ top: 4, right: 4, bottom: 4, left: 4 }}
      colors={d => COLORES_COBRO[d.id as keyof typeof COLORES_COBRO]}
      emptyColor={CELDA_VACIA[modo]}
      emptyOpacity={1}
      borderWidth={0}
      theme={temaNivo(ink)}
      tooltip={({ data: d }) => (
        <Tip
          color={d.color}
          value={formatCurrency(d.value)}
          label={`${d.label} · ${estado.total ? Math.round((d.value / estado.total) * 100) : 0} %`}
        />
      )}
      animate={!reducido}
      motionStagger={reducido ? 0 : 3}
      role="img"
      ariaLabel="Reparto de lo facturado entre cobrado, pendiente y vencido"
    />
  );
}

// ============================================================
// 5 · ANTIGÜEDAD DE LA DEUDA — columnas de estado
//
// Cuanto más vieja, más grave: la paleta de estado escala de azul
// (todavía no vence) a rojo. El importe va encima de cada columna.
// ============================================================

/** Por POSICIÓN del tramo: de «todavía no vence» (azul) a «más de 90 días» (rojo oscuro). */
const COLOR_TRAMO = [STATUS.neutral, STATUS.warning, STATUS.serious, STATUS.critical, '#9e2a2a'];

export function DeudaColumnas({ tramos }: { tramos: TramoDeuda[] }) {
  const { ink } = useGrafica();
  const plot = useMemo<BarDatum[]>(
    () => tramos.map(t => ({ tramo: t.tramo, importe: t.importe, facturas: t.facturas })),
    [tramos],
  );

  const Importes = ({ bars }: BarCustomLayerProps<BarDatum>) => (
    <g>
      {bars.filter(b => Number(b.data.value) > 0).map(b => (
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
      keys={['importe']}
      indexBy="tramo"
      margin={{ top: 24, right: 8, bottom: 28, left: 44 }}
      padding={0.4}
      colors={({ index }) => COLOR_TRAMO[index] ?? STATUS.critical}
      theme={temaNivo(ink)}
      animate={false}
      barComponent={BarraVertical}
      layers={['grid', 'axes', 'bars', Importes]}
      enableLabel={false}
      enableGridX={false}
      axisBottom={{ tickSize: 0, tickPadding: 8 }}
      axisLeft={{ tickSize: 0, tickPadding: 8, format: compactEuro, tickValues: 4 }}
      tooltip={({ data: d, color }) => (
        <Tip
          color={color}
          value={formatCurrency(Number(d.importe))}
          label={`${d.tramo} · ${d.facturas} ${Number(d.facturas) === 1 ? 'factura' : 'facturas'}`}
        />
      )}
      role="img"
      ariaLabel="Deuda por antigüedad del vencimiento"
    />
  );
}

// ============================================================
// 6 · QUIÉN PAGA Y CUÁNTO TARDA — ScatterPlot
//
// El tamaño del punto es cuántas facturas ha pagado (más punto, más
// fiable la media). Punto con anillo de superficie: cuando dos se
// solapan, se sigue viendo el borde de cada uno. Nombre directo sólo en
// los tres que más facturan.
// ============================================================

interface PuntoCliente {
  x: number;
  y: number;
  nombre: string;
  facturas: number;
}

export function PuntualidadScatter({ clientes, plazo = 30 }: { clientes: PuntualidadCliente[]; plazo?: number }) {
  const { accent, ink, reducido } = useGrafica();
  const maxFacturas = Math.max(1, ...clientes.map(c => c.facturasCobradas));
  const destacados = new Set(clientes.slice(0, 3).map(c => c.nombre));

  const data = useMemo(
    () => [{
      id: 'Clientes',
      data: clientes.map(c => ({ x: c.diasMedios, y: c.facturado, nombre: c.nombre, facturas: c.facturasCobradas })),
    }],
    [clientes],
  );

  const Nodo = ({ node }: ScatterPlotNodeProps<PuntoCliente>) => (
    <circle
      cx={node.x}
      cy={node.y}
      r={node.size / 2}
      fill={node.color}
      fillOpacity={0.88}
      stroke={ink.surface}
      strokeWidth={2}
    />
  );

  const Nombres = ({ nodes }: ScatterPlotLayerProps<PuntoCliente>) => (
    <g>
      {nodes.filter(n => destacados.has(n.data.nombre)).map(n => (
        <text
          key={n.id}
          x={n.x + n.size / 2 + 6}
          y={n.y}
          dominantBaseline="central"
          style={{ fill: ink.secondary, fontSize: 11, fontFamily: 'inherit' }}
        >
          {recorta(n.data.nombre, 18)}
        </text>
      ))}
    </g>
  );

  return (
    <ResponsiveScatterPlot<PuntoCliente>
      data={data}
      margin={{ top: 16, right: 24, bottom: 44, left: 52 }}
      xScale={{ type: 'linear', min: 0, max: 'auto' }}
      yScale={{ type: 'linear', min: 0, max: 'auto' }}
      colors={[accent]}
      nodeSize={n => 8 + ((n.data.facturas - 1) / Math.max(1, maxFacturas - 1)) * 14}
      nodeComponent={Nodo}
      layers={['grid', 'axes', 'markers', 'nodes', Nombres, 'mesh']}
      markers={[{
        axis: 'x',
        value: plazo,
        lineStyle: { stroke: ink.axis, strokeWidth: 1, strokeDasharray: '4 4' },
        legend: `${plazo} días`,
        legendPosition: 'bottom-right',
        textStyle: { fill: ink.muted, fontSize: 11 },
      }]}
      theme={temaNivo(ink)}
      enableGridX={false}
      axisBottom={{
        tickSize: 0, tickPadding: 8, tickValues: 5,
        legend: 'Días medios entre emitir y cobrar', legendPosition: 'middle', legendOffset: 34,
      }}
      axisLeft={{ tickSize: 0, tickPadding: 8, format: v => compactEuro(Number(v)), tickValues: 4 }}
      tooltip={({ node }) => (
        <Tip
          color={node.color}
          value={`${node.data.x} días`}
          label={`${node.data.nombre} · ${formatCurrency(node.data.y)} · ${node.data.facturas} ${node.data.facturas === 1 ? 'cobro' : 'cobros'}`}
        />
      )}
      animate={!reducido}
      motionConfig="gentle"
      role="img"
      ariaLabel="Clientes según lo que facturan y lo que tardan en pagar"
    />
  );
}

// ============================================================
// 7 · CÓMO SE MUEVEN LOS MEJORES CLIENTES — Bump
//
// Un color por cliente, en el orden fijo de la paleta y según su total
// en el periodo: el color sigue al cliente, no al puesto del mes.
// Nombre al final de cada línea (etiqueta directa) y leyenda debajo.
// ============================================================

interface PuestoBump {
  x: string;
  y: number | null;
  importe: number;
}

export function RankingBump({ series, estrecho }: { series: SerieRanking[]; estrecho: boolean }) {
  const { ink, reducido } = useGrafica();
  const colorDe = new Map(series.map((s, i) => [s.id, SERIES[i]]));
  const nombreDe = new Map(series.map(s => [s.id, s.nombre]));

  /** Las etiquetas de Nivo heredan el color de la serie; aquí van en tinta. */
  // Nivo prolonga cada línea hasta el borde del área de dibujo: el nombre
  // va DESPUÉS de ese borde, en el margen, o la línea lo tacharía.
  const Nombres = ({ series: computadas, innerWidth }: BumpCustomLayerProps<PuestoBump, { nombre: string; total: number }>) => (
    <g>
      {computadas.map(s => {
        const ultimo = [...s.points].reverse().find(p => p.y !== null);
        if (!ultimo || ultimo.y === null) return null;
        return (
          <text
            key={s.id}
            x={innerWidth + 10}
            y={ultimo.y}
            dominantBaseline="central"
            style={{ fill: ink.secondary, fontSize: 11, fontFamily: 'inherit' }}
          >
            {recorta(nombreDe.get(s.id) ?? s.id, 16)}
          </text>
        );
      })}
    </g>
  );

  return (
    <ResponsiveBump<PuestoBump, { nombre: string; total: number }>
      data={series}
      margin={{ top: 12, right: estrecho ? 16 : 128, bottom: 28, left: 36 }}
      colors={s => colorDe.get(s.id) ?? SERIES[5]}
      lineWidth={2}
      activeLineWidth={4}
      inactiveLineWidth={2}
      inactiveOpacity={0.2}
      pointSize={9}
      activePointSize={13}
      inactivePointSize={6}
      pointColor={{ from: 'serie.color' }}
      pointBorderWidth={2}
      activePointBorderWidth={2}
      inactivePointBorderWidth={0}
      pointBorderColor={ink.surface}
      startLabel={false}
      endLabel={false}
      layers={estrecho ? ['grid', 'axes', 'lines', 'points', 'mesh'] : ['grid', 'axes', 'lines', 'points', Nombres, 'mesh']}
      enableGridX={false}
      axisTop={null}
      axisRight={null}
      axisBottom={{ tickSize: 0, tickPadding: 8 }}
      axisLeft={{ tickSize: 0, tickPadding: 8, format: v => `${v}º` }}
      theme={temaNivo(ink)}
      useMesh
      pointTooltip={({ point }) => (
        <Tip
          color={point.color}
          value={`${point.data.y}º`}
          label={`${nombreDe.get(point.serie.id) ?? point.serie.id} · ${point.data.x} · ${formatCurrency(point.data.importe)}`}
        />
      )}
      animate={!reducido}
      motionConfig="gentle"
      role="img"
    />
  );
}

// ============================================================
// 8 · DE DÓNDE SALE LA FACTURACIÓN — TreeMap
//
// Área = base facturada. Color = categoría (orden fijo, seis como mucho);
// los productos de una misma categoría comparten color y se separan por
// 2 px de superficie. Etiqueta sólo si cabe.
// ============================================================

export function CategoriasTreemap({ arbol }: { arbol: NodoArbol }) {
  const { ink, reducido } = useGrafica();
  const total = (arbol.children ?? []).reduce(
    (s, c) => s + (c.children ?? []).reduce((t, h) => t + (h.value ?? 0), 0),
    0,
  );

  return (
    <ResponsiveTreeMap<NodoArbol>
      data={arbol}
      identity="id"
      value="value"
      leavesOnly
      tile="squarify"
      innerPadding={2}
      outerPadding={0}
      margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
      colors={n => SERIES[(n.data as NodoArbol).categoria] ?? SERIES[5]}
      nodeOpacity={1}
      borderWidth={0}
      // La etiqueta se recorta al ancho de SU casilla (≈6,6 px por letra a
      // 11 px en seminegrita); si no caben ni cuatro letras, no se pone.
      label={n => {
        const cabe = Math.floor((n.width - 10) / 6.6);
        return cabe < 4 || n.height < 18 ? '' : recorta((n.data as NodoArbol).nombre, cabe);
      }}
      labelSkipSize={0}
      labelTextColor={n => textoSobre(n.color)}
      orientLabel={false}
      enableParentLabel={false}
      theme={{ ...temaNivo(ink), labels: { text: { fontSize: 11, fontWeight: 600, fontFamily: 'inherit' } } }}
      tooltip={({ node }) => {
        const d = node.data as NodoArbol;
        return (
          <Tip
            color={node.color}
            value={formatCurrency(node.value)}
            label={`${d.nombre} · ${d.nombreCategoria} · ${total ? ((node.value / total) * 100).toFixed(1) : 0} %`}
          />
        );
      }}
      animate={!reducido}
      motionConfig="gentle"
      role="img"
      ariaLabel="Facturación por categoría y producto"
    />
  );
}

// ============================================================
// 9 · ACUMULADO DEL AÑO — Line
//
// Este año en vino, el pasado en azul y con trazo discontinuo: es la
// referencia, no el dato. Los meses que no han llegado van en null y
// la línea de este año se corta ahí, sin caer a cero.
// ============================================================

export function AcumuladoLineas({ datos, anio }: { datos: AcumuladoMes[]; anio: number }) {
  const { accent, ink, reducido } = useGrafica();
  const actual = String(anio);
  const anterior = String(anio - 1);
  const series = useMemo(
    () => [
      { id: anterior, data: datos.map(d => ({ x: d.name, y: d.anterior })) },
      { id: actual, data: datos.map(d => ({ x: d.name, y: d.actual })) },
    ],
    [datos, actual, anterior],
  );

  return (
    <ResponsiveLine
      data={series}
      margin={{ top: 12, right: 16, bottom: 28, left: 48 }}
      xScale={{ type: 'point' }}
      yScale={{ type: 'linear', min: 0, max: 'auto', stacked: false }}
      curve="monotoneX"
      colors={[SERIES[0], accent]}
      theme={temaNivo(ink)}
      lineWidth={2}
      enablePoints
      pointSize={6}
      pointColor={{ from: 'series.color' }}
      pointBorderWidth={2}
      pointBorderColor={ink.surface}
      enableGridX={false}
      axisBottom={{ tickSize: 0, tickPadding: 8 }}
      axisLeft={{ tickSize: 0, tickPadding: 8, format: v => compactEuro(Number(v)), tickValues: 4 }}
      layers={[
        'grid', 'axes', 'areas', 'crosshair',
        // El año pasado discontinuo: se pinta a mano sobre la línea de Nivo.
        ({ series: s, lineGenerator }) => (
          <g>
            {s.map(serie => (
              <path
                key={serie.id}
                d={lineGenerator(serie.data.map(p => p.position)) ?? ''}
                fill="none"
                stroke={serie.color}
                strokeWidth={2}
                strokeDasharray={serie.id === anterior ? '5 4' : undefined}
                strokeLinecap="round"
              />
            ))}
          </g>
        ),
        'points', 'slices', 'mesh',
      ]}
      enableSlices="x"
      enableCrosshair
      crosshairType="x"
      sliceTooltip={({ slice }) => (
        <TipRebanada
          puntos={slice.points
            .filter(p => p.data.y !== null)
            .map(p => ({ serie: `Acumulado ${p.seriesId}`, color: p.seriesColor, valor: Number(p.data.y) }))}
        />
      )}
      animate={!reducido}
      motionConfig="gentle"
      role="img"
    />
  );
}
