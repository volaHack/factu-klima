'use client';

/**
 * Lo que va a entrar en los próximos tres meses, semana a semana, separado
 * en seguro y probable, y aparte lo que es de riesgo (ver `previsionCobros`).
 *
 * La gráfica es una columna apilada por semana con las mismas piezas que el
 * resto de gráficas (Nivo, tinta y colores de `charts/theme`). Lo que dice
 * va también escrito encima y en tabla: ningún importe depende de ver el
 * color.
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { ResponsiveBar, type BarDatum } from '@nivo/bar';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import ChartCard from '@/components/charts/ChartCard';
import { ChartLegend, Tip, temaNivo, useGrafica } from '@/components/charts/Charts';
import { STATUS, compactEuro } from '@/components/charts/theme';
import type { Invoice } from '@/lib/types';
import { previsionDeCobros } from '@/lib/previsionCobros';
import { hoyLocal } from '@/lib/perfilPago';
import { formatCurrency } from '@/lib/utils';

const COLOR = { Seguro: STATUS.good, Probable: STATUS.neutral } as const;
const RIESGO_VISIBLES = 6;

function ColumnasSemanas({ datos }: { datos: BarDatum[] }) {
  const { ink, reducido } = useGrafica();
  return (
    <ResponsiveBar
      data={datos}
      keys={['Seguro', 'Probable']}
      indexBy="semana"
      margin={{ top: 12, right: 8, bottom: 28, left: 48 }}
      padding={0.38}
      colors={({ id }) => COLOR[id as keyof typeof COLOR]}
      // El hueco de superficie entre lo seguro y lo probable separa sin bordes.
      borderWidth={1}
      borderColor={ink.surface}
      borderRadius={3}
      theme={temaNivo(ink)}
      animate={!reducido}
      enableLabel={false}
      enableGridX={false}
      axisBottom={{ tickSize: 0, tickPadding: 8, tickValues: datos.filter((_, i) => i % 2 === 0).map(d => d.semana as string) }}
      axisLeft={{ tickSize: 0, tickPadding: 8, format: compactEuro, tickValues: 4 }}
      tooltip={({ id, value, color, indexValue }) => (
        <Tip color={color} label={`Semana del ${indexValue} · ${id}`} value={formatCurrency(Number(value))} />
      )}
      role="img"
      ariaLabel="Cobros previstos por semana, seguros y probables"
    />
  );
}

export default function PrevisionTesoreria({ invoices }: { invoices: Invoice[] }) {
  const p = useMemo(() => previsionDeCobros(invoices, hoyLocal()), [invoices]);
  const datos = useMemo<BarDatum[]>(() => p.semanas.map(s => ({ semana: s.etiqueta, Seguro: s.seguro, Probable: s.probable })), [p]);
  const filas = useMemo(() => p.semanas.map(s => ({ semana: `${s.etiqueta} – ${Number(s.hasta.slice(8, 10))}`, seguro: s.seguro, probable: s.probable, facturas: s.facturas })), [p]);
  const vacio = p.cobros.length === 0;
  const [t30] = p.tramos;

  return (
    <section className="prevision" aria-labelledby="prevision-titulo">
      <div className="prevision-cabeza">
        <h2 id="prevision-titulo" className="prevision-titulo">Lo que va a entrar</h2>
        <p className="prevision-sub">
          Por vencimiento y corregido con lo que tarda de verdad cada cliente en pagar.
        </p>
      </div>

      {vacio ? (
        <p className="prevision-vacio"><ShieldCheck size={16} aria-hidden /> No hay nada pendiente de cobro: todo lo facturado está cobrado.</p>
      ) : (
        <>
          <p className="prevision-resumen">
            En los próximos 30 días cuentas con <strong>{formatCurrency(t30.seguro)}</strong> seguros
            y <strong>{formatCurrency(t30.probable)}</strong> probables.
            {p.totalRiesgo > 0 && <> Hay <strong className="prevision-riesgo-cifra">{formatCurrency(p.totalRiesgo)}</strong> que no conviene dar por cobrados.</>}
          </p>

          <ul className="prevision-tramos">
            {p.tramos.map(t => (
              <li key={t.dias} className="prevision-tramo">
                <span className="prevision-tramo-etiqueta">A {t.dias} días</span>
                <span className="prevision-tramo-total">{formatCurrency(t.total)}</span>
                <span className="prevision-tramo-detalle">
                  <span className="prevision-punto is-seguro" aria-hidden="true" />{formatCurrency(t.seguro)} seguro
                  <span className="prevision-punto is-probable" aria-hidden="true" />{formatCurrency(t.probable)} probable
                </span>
              </li>
            ))}
          </ul>

          <ChartCard
            title="Cobros previstos por semana"
            subtitle="Las próximas 13 semanas. Lo de riesgo no se suma."
            height={220}
            isEmpty={p.semanas.every(s => !s.seguro && !s.probable)}
            emptyLabel="Nada previsto en los próximos 90 días"
            tableColumns={[
              { key: 'semana', label: 'Semana' },
              { key: 'seguro', label: 'Seguro', align: 'right', format: v => formatCurrency(Number(v)) },
              { key: 'probable', label: 'Probable', align: 'right', format: v => formatCurrency(Number(v)) },
              { key: 'facturas', label: 'Facturas', align: 'right' },
            ]}
            tableRows={filas}
            legend={
              <ChartLegend items={[
                { name: 'Seguro', value: formatCurrency(p.tramos[2].seguro), color: COLOR.Seguro },
                { name: 'Probable', value: formatCurrency(p.tramos[2].probable), color: COLOR.Probable },
              ]} />
            }
          >
            <ColumnasSemanas datos={datos} />
          </ChartCard>

          {p.riesgo.length > 0 && (
            <div className="prevision-riesgo">
              <h3 className="prevision-riesgo-titulo">
                <AlertTriangle size={15} aria-hidden /> Cobros de riesgo · {formatCurrency(p.totalRiesgo)}
              </h3>
              <ul className="prevision-riesgo-lista">
                {p.riesgo.slice(0, RIESGO_VISIBLES).map(c => (
                  <li key={c.facturaId}>
                    <Link href={`/facturas/${c.facturaId}`} className="prevision-riesgo-fila">
                      <span className="prevision-riesgo-quien">
                        <strong>{c.cliente}</strong> · {c.numero}
                        <span className="prevision-riesgo-motivo">{c.motivo}</span>
                      </span>
                      <span className="prevision-riesgo-importe">{formatCurrency(c.pendiente)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              {p.riesgo.length > RIESGO_VISIBLES && (
                <Link href="/recordatorios" className="prevision-riesgo-mas">Ver todas en Recordatorios ({p.riesgo.length})</Link>
              )}
            </div>
          )}
          {p.despues > 0 && (
            <p className="prevision-nota">Además, {formatCurrency(p.despues)} vencen más allá de 90 días.</p>
          )}
        </>
      )}
    </section>
  );
}
