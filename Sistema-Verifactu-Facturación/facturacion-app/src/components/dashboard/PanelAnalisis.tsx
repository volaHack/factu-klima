'use client';

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { Activity, Wallet, Users } from 'lucide-react';
import ChartCard from '@/components/charts/ChartCard';
import { ChartLegend } from '@/components/charts/Charts';
import {
  CategoriasTreemap, CobroWaffle, COLORES_COBRO, DeudaColumnas, DiasConVentas, LeyendaRampa,
  MapaSemanal, PuntualidadScatter, RankingBump, RitmoBullet,
} from '@/components/charts/ChartsAnalisis';
import { CHART_ACCENT, SERIES, modoGrafica } from '@/components/charts/theme';
import {
  antiguedadDeuda, cifrasAnalisis, estadoCobro, mapaSemanal, puntualidadClientes,
  rankingClientes, ritmoDelMes, ventasPorCategoria, ventasPorDia,
} from '@/lib/analitica';
import type { Invoice, Product } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';

// ============================================================
// ANÁLISIS DEL NEGOCIO — la sección de gráficas del panel
//
// Tres pestañas, cada una con una pregunta:
//   Ritmo ........ ¿cómo va el mes y cuándo se vende?
//   Cobros ....... ¿cuánto me deben, desde cuándo y quién tarda?
//   Clientes ..... ¿quién sube, quién baja y qué se vende?
// Ocho gráficas a la vez no se leen; tres por pestaña, sí.
// ============================================================

type Pestana = 'ritmo' | 'cobros' | 'clientes';

const PESTANAS: { id: Pestana; nombre: string; corto: string; icono: typeof Activity }[] = [
  { id: 'ritmo', nombre: 'Ritmo de ventas', corto: 'Ritmo', icono: Activity },
  { id: 'cobros', nombre: 'Cobros', corto: 'Cobros', icono: Wallet },
  { id: 'clientes', nombre: 'Clientes y productos', corto: 'Clientes', icono: Users },
];

const CLAVE_PESTANA = 'panel-analisis-pestana';

/**
 * Ancho real de un elemento, en vivo.
 *
 * Con ref de callback y no `useRef`: el elemento sólo existe mientras su
 * pestaña está abierta, y un efecto que corre una vez al montar nunca se
 * enteraría de que ha aparecido.
 */
function useAncho<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null);
  const [ancho, setAncho] = useState(0);
  useEffect(() => {
    if (!el || typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver(([e]) => setAncho(Math.round(e.contentRect.width)));
    obs.observe(el);
    return () => obs.disconnect();
  }, [el]);
  return [setEl, ancho] as const;
}

const euros = (v: unknown) => formatCurrency(Number(v));
const pct = (parte: number, todo: number) => (todo > 0 ? `${Math.round((parte / todo) * 100)} %` : '—');

export default function PanelAnalisis({ invoices, products }: { invoices: Invoice[]; products: Product[] }) {
  const [pestana, setPestana] = useState<Pestana>(() => {
    try {
      const guardada = localStorage.getItem(CLAVE_PESTANA);
      if (guardada === 'ritmo' || guardada === 'cobros' || guardada === 'clientes') return guardada;
    } catch { /* sin almacenamiento: se empieza por la primera */ }
    return 'ritmo';
  });
  const elegir = (p: Pestana) => {
    setPestana(p);
    try { localStorage.setItem(CLAVE_PESTANA, p); } catch { /* no pasa nada */ }
  };
  const alTeclado = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = PESTANAS.findIndex(p => p.id === pestana);
    const j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : -99;
    if (j === -99) return;
    e.preventDefault();
    const siguiente = PESTANAS[(j + PESTANAS.length) % PESTANAS.length].id;
    elegir(siguiente);
    document.getElementById(`pestana-${siguiente}`)?.focus();
  };

  const [hoy] = useState(() => new Date());
  const [refRejilla, anchoRejilla] = useAncho<HTMLDivElement>();
  const [refRanking, anchoRanking] = useAncho<HTMLDivElement>();

  // Cuántas semanas caben sin que la casilla baje de 11 px: en el móvil,
  // medio año; en el ordenador, el año entero. Lo que se mide es la
  // envoltura de la tarjeta: al área de dibujo le faltan los 20 px de
  // relleno por cada lado y los 30 del nombre de los días.
  const util = anchoRejilla - 2 * 20 - 30;
  const semanas = anchoRejilla > 0 ? Math.max(13, Math.min(53, Math.floor(util / 13) - 1)) : 53;
  const celda = anchoRejilla > 0 ? Math.min(18, (util - 2 * (semanas + 2)) / (semanas + 1)) : 14;
  const altoRejilla = Math.round(22 + 7 * (celda + 2) + 6);

  const cifras = useMemo(() => cifrasAnalisis(invoices, hoy), [invoices, hoy]);
  const ritmo = useMemo(() => ritmoDelMes(invoices, hoy), [invoices, hoy]);
  const dias = useMemo(() => ventasPorDia(invoices, hoy, semanas), [invoices, hoy, semanas]);
  const semana = useMemo(() => mapaSemanal(invoices, hoy, 6), [invoices, hoy]);
  const cobro = useMemo(() => estadoCobro(invoices, hoy), [invoices, hoy]);
  const deuda = useMemo(() => antiguedadDeuda(invoices, hoy), [invoices, hoy]);
  const puntualidad = useMemo(() => puntualidadClientes(invoices, hoy), [invoices, hoy]);
  const ranking = useMemo(() => rankingClientes(invoices, hoy, 6, 5), [invoices, hoy]);
  const arbol = useMemo(() => ventasPorCategoria(invoices, products, hoy), [invoices, products, hoy]);

  const [acento] = useState(() => CHART_ACCENT[modoGrafica()]);
  const hayVentas = cifras.facturas > 0;
  const deudaTotal = deuda.reduce((s, t) => s + t.importe, 0);
  const categorias = arbol.children ?? [];
  const totalCategorias = categorias.reduce(
    (s, c) => s + (c.children ?? []).reduce((t, h) => t + (h.value ?? 0), 0), 0);

  const sinVentas = (
    <>Cuando emitas facturas, aquí verás cómo se mueve el negocio. <Link href="/facturas/nueva">Crear factura</Link>.</>
  );

  return (
    <section className="analisis" aria-labelledby="analisis-titulo">
      <header className="analisis-cabecera">
        <div>
          <h2 id="analisis-titulo" className="analisis-titulo">Análisis del negocio</h2>
          <p className="analisis-sub">Últimos doce meses, sin borradores ni facturas anuladas</p>
        </div>
        <div className="analisis-pestanas" role="tablist" aria-label="Qué analizar">
          {PESTANAS.map(({ id, nombre, corto, icono: Icono }) => (
            <button
              key={id}
              id={`pestana-${id}`}
              type="button"
              role="tab"
              aria-selected={pestana === id}
              aria-controls={`panel-${id}`}
              aria-label={nombre}
              tabIndex={pestana === id ? 0 : -1}
              className="analisis-pestana"
              onClick={() => elegir(id)}
              onKeyDown={alTeclado}
            >
              <Icono size={14} aria-hidden="true" />
              <span className="analisis-pestana-largo">{nombre}</span>
              <span className="analisis-pestana-corto" aria-hidden="true">{corto}</span>
            </button>
          ))}
        </div>
      </header>

      {/* Cuatro cifras de cabecera: lo que las gráficas desarrollan. */}
      <dl className="analisis-cifras">
        <div className="analisis-cifra">
          <dt>Ticket medio</dt>
          <dd>{hayVentas ? formatCurrency(cifras.ticketMedio) : '—'}</dd>
          <span>{cifras.facturas} {cifras.facturas === 1 ? 'factura' : 'facturas'} en 12 meses</span>
        </div>
        <div className="analisis-cifra">
          <dt>Cobrado</dt>
          <dd>{cifras.porcentajeCobrado === null ? '—' : `${cifras.porcentajeCobrado} %`}</dd>
          <span>de lo facturado en 12 meses</span>
        </div>
        <div className="analisis-cifra">
          <dt>Días medios de cobro</dt>
          <dd>{cifras.diasMediosCobro === null ? '—' : `${cifras.diasMediosCobro} días`}</dd>
          <span>desde que se emite hasta que se cobra</span>
        </div>
        <div className="analisis-cifra">
          <dt>Clientes activos</dt>
          <dd>{cifras.clientesActivos}</dd>
          <span>
            en 90 días{cifras.clientesNuevos > 0 && <>, {cifras.clientesNuevos} {cifras.clientesNuevos === 1 ? 'nuevo' : 'nuevos'}</>}
          </span>
        </div>
      </dl>

      {pestana === 'ritmo' && (
        <div id="panel-ritmo" role="tabpanel" aria-labelledby="pestana-ritmo" className="analisis-rejilla">
          <ChartCard
            title="Cómo va el mes"
            subtitle={ritmo.facturado.actual > 0
              ? `Día ${ritmo.diaDelMes} de ${ritmo.diasDelMes} · ${formatCurrency(ritmo.facturado.proyeccion)} si sigue a este paso`
              : `Día ${ritmo.diaDelMes} de ${ritmo.diasDelMes} · aún sin ventas este mes`}
            height={170}
            isEmpty={!hayVentas && ritmo.facturado.actual === 0}
            emptyLabel="Todavía no hay ventas que medir"
            emptyHint={sinVentas}
            tableColumns={[
              { key: 'fila', label: '' },
              { key: 'actual', label: 'Hasta hoy', align: 'right', format: euros },
              { key: 'proyeccion', label: 'A este paso', align: 'right', format: euros },
              { key: 'mesAnterior', label: 'Mes anterior', align: 'right', format: euros },
              { key: 'mismoMesAnioPasado', label: 'Hace un año', align: 'right', format: euros },
              { key: 'mediaDoceMeses', label: 'Media 12 m', align: 'right', format: euros },
            ]}
            tableRows={[
              { fila: 'Facturado', ...ritmo.facturado },
              { fila: 'Cobrado', ...ritmo.cobrado },
            ]}
            legend={
              // Qué es cada marca, sin cifras: son dos filas con dos escalas
              // distintas, y las cifras de las dos están en la tabla.
              <ChartLegend
                items={[
                  { name: 'Hasta hoy', value: '', color: acento },
                  { name: 'Si sigue a este paso', value: '', color: `${acento}55` },
                  { name: 'Mes anterior', value: '', color: 'var(--text-primary)' },
                  { name: 'Hace un año', value: '', color: SERIES[0] },
                  { name: 'Media y mejor de 12 meses', value: '', color: 'var(--border-color-hover)' },
                ]}
              />
            }
          >
            <RitmoBullet ritmo={ritmo} />
          </ChartCard>

          <ChartCard
            title="Qué día de la semana se vende más"
            subtitle="Venta media por día, en los últimos seis meses"
            height={270}
            isEmpty={semana.every(f => f.data.every(c => !c.y))}
            emptyLabel="Todavía no hay ventas que repartir por días"
            emptyHint={sinVentas}
            tableColumns={[
              { key: 'dia', label: 'Día' },
              ...semana[0].data.map(c => ({ key: c.x, label: c.x, align: 'right' as const, format: (v: unknown) => (v === null ? '—' : euros(v)) })),
            ]}
            tableRows={semana.map(f => ({ dia: f.id, ...Object.fromEntries(f.data.map(c => [c.x, c.y])) }))}
            legend={<LeyendaRampa />}
          >
            <MapaSemanal filas={semana} />
          </ChartCard>
          <div ref={refRejilla} className="analisis-ancho">
            <ChartCard
              title="Días con ventas"
              subtitle={dias.mejorDia
                ? `${dias.diasConVenta} días con ventas en ${semanas} semanas · mejor día: ${formatCurrency(dias.mejorDia.value)}`
                : `Las últimas ${semanas} semanas, día a día`}
              height={altoRejilla}
              isEmpty={dias.dias.length === 0}
              emptyLabel="Ningún día con ventas en este periodo"
              emptyHint={sinVentas}
              tableColumns={[
                { key: 'day', label: 'Día' },
                { key: 'facturas', label: 'Facturas', align: 'right' },
                { key: 'value', label: 'Importe', align: 'right', format: euros },
              ]}
              tableRows={[...dias.dias].reverse() as unknown as Record<string, unknown>[]}
              legend={<LeyendaRampa vacio="Sin ventas" />}
            >
              <DiasConVentas dias={dias.dias} desde={dias.desde} hasta={dias.hasta} celda={celda} />
            </ChartCard>
          </div>

        </div>
      )}

      {pestana === 'cobros' && (
        <div id="panel-cobros" role="tabpanel" aria-labelledby="pestana-cobros" className="analisis-rejilla">
          <ChartCard
            title="En qué punto está el cobro"
            subtitle={`Cada casilla es un 1 % de ${formatCurrency(cobro.total)} facturados en 12 meses`}
            height={230}
            isEmpty={cobro.total === 0}
            emptyLabel="Todavía no hay nada facturado"
            emptyHint={sinVentas}
            tableColumns={[
              { key: 'estado', label: 'Estado' },
              { key: 'importe', label: 'Importe', align: 'right', format: euros },
              { key: 'parte', label: 'Parte', align: 'right' },
            ]}
            tableRows={[
              { estado: 'Cobrado', importe: cobro.cobrado, parte: pct(cobro.cobrado, cobro.total) },
              { estado: 'Pendiente, a tiempo', importe: cobro.pendiente, parte: pct(cobro.pendiente, cobro.total) },
              { estado: 'Vencido', importe: cobro.vencido, parte: pct(cobro.vencido, cobro.total) },
            ]}
            legend={
              <ChartLegend
                items={[
                  { name: `Cobrado · ${pct(cobro.cobrado, cobro.total)}`, value: formatCurrency(cobro.cobrado), color: COLORES_COBRO.cobrado },
                  { name: `Pendiente · ${pct(cobro.pendiente, cobro.total)}`, value: formatCurrency(cobro.pendiente), color: COLORES_COBRO.pendiente },
                  { name: `Vencido · ${pct(cobro.vencido, cobro.total)}`, value: formatCurrency(cobro.vencido), color: COLORES_COBRO.vencido },
                ]}
              />
            }
          >
            <div className="analisis-waffle">
              <CobroWaffle estado={cobro} />
            </div>
          </ChartCard>

          <ChartCard
            title="Antigüedad de la deuda"
            subtitle={deudaTotal > 0
              ? `${formatCurrency(deudaTotal)} sin cobrar, por días desde el vencimiento`
              : 'Lo que falta por cobrar, por días desde el vencimiento'}
            height={230}
            isEmpty={deudaTotal === 0}
            emptyLabel="No hay nada pendiente de cobro"
            emptyHint={<>Todo lo facturado está cobrado. Buen trabajo.</>}
            tableColumns={[
              { key: 'tramo', label: 'Retraso' },
              { key: 'facturas', label: 'Facturas', align: 'right' },
              { key: 'importe', label: 'Importe', align: 'right', format: euros },
            ]}
            tableRows={deuda as unknown as Record<string, unknown>[]}
          >
            <DeudaColumnas tramos={deuda} />
          </ChartCard>

          <div className="analisis-ancho">
            <ChartCard
              title="Quién paga y cuánto tarda"
              subtitle="Cada punto es un cliente: arriba, los que más facturan; a la derecha, los que más tardan en pagar"
              height={300}
              isEmpty={puntualidad.length === 0}
              emptyLabel="Todavía no hay facturas cobradas con fecha de cobro"
              emptyHint={<>Al marcar una factura como pagada, su fecha de cobro alimenta esta gráfica.</>}
              tableColumns={[
                { key: 'nombre', label: 'Cliente' },
                { key: 'facturasCobradas', label: 'Cobros', align: 'right' },
                { key: 'diasMedios', label: 'Días medios', align: 'right' },
                { key: 'facturado', label: 'Facturado', align: 'right', format: euros },
              ]}
              tableRows={puntualidad as unknown as Record<string, unknown>[]}
            >
              <PuntualidadScatter clientes={puntualidad} />
            </ChartCard>
          </div>
        </div>
      )}

      {pestana === 'clientes' && (
        <div id="panel-clientes" role="tabpanel" aria-labelledby="pestana-clientes" className="analisis-rejilla">
          <div ref={refRanking} className="analisis-ancho">
            <ChartCard
              title="Cómo se mueven tus mejores clientes"
              subtitle="Puesto de cada uno, mes a mes, entre los cinco que más facturan en seis meses"
              height={260}
              isEmpty={ranking.length < 2}
              emptyLabel="Hacen falta al menos dos clientes con ventas"
              emptyHint={<>El ranking se dibuja en cuanto factures a más de un cliente.</>}
              tableColumns={[
                { key: 'nombre', label: 'Cliente' },
                ...(ranking[0]?.data ?? []).map(p => ({ key: p.x, label: p.x, align: 'right' as const, format: (v: unknown) => (v ? `${v}º` : '—') })),
                { key: 'total', label: 'Total', align: 'right', format: euros },
              ]}
              tableRows={ranking.map(s => ({ nombre: s.nombre, total: s.total, ...Object.fromEntries(s.data.map(p => [p.x, p.y])) }))}
              legend={
                <ChartLegend
                  items={ranking.map((s, i) => ({ name: s.nombre, value: formatCurrency(s.total), color: SERIES[i] }))}
                />
              }
            >
              <RankingBump series={ranking} estrecho={anchoRanking > 0 && anchoRanking < 520} />
            </ChartCard>
          </div>

          <div className="analisis-ancho">
            <ChartCard
              title="De dónde sale la facturación"
              subtitle="Base facturada en 12 meses, por categoría y producto: el área es el importe"
              height={320}
              isEmpty={categorias.length === 0}
              emptyLabel="Todavía no hay líneas facturadas"
              emptyHint={<>Se agrupa por la categoría de cada producto del catálogo.</>}
              tableColumns={[
                { key: 'categoria', label: 'Categoría' },
                { key: 'producto', label: 'Producto' },
                { key: 'importe', label: 'Base', align: 'right', format: euros },
              ]}
              tableRows={categorias.flatMap(c => (c.children ?? []).map(h => ({ categoria: c.nombre, producto: h.nombre, importe: h.value })))}
              legend={
                <ChartLegend
                  items={categorias.map(c => {
                    const t = (c.children ?? []).reduce((s, h) => s + (h.value ?? 0), 0);
                    return { name: `${c.nombre} · ${pct(t, totalCategorias)}`, value: formatCurrency(t), color: SERIES[c.categoria] };
                  })}
                />
              }
            >
              <CategoriasTreemap arbol={arbol} />
            </ChartCard>
          </div>
        </div>
      )}
    </section>
  );
}
