'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { BarChart3 } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import Rentabilidad from '@/components/informes/Rentabilidad';
import ChartCard from '@/components/charts/ChartCard';
import { RankedBars, ChartLegend, AreaTrendChart, ComparisonBarChart } from '@/components/charts/Charts';
import { SERIES, resolveAccent } from '@/components/charts/theme';
import { getInvoices } from '@/lib/storage';
import { Invoice, InvoiceStatus } from '@/lib/types';
import { formatCurrency, getShortMonthName } from '@/lib/utils';

export default function InformesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [mounted, setMounted] = useState(false);
  const [period, setPeriod] = useState<'year' | 'quarter' | 'month'>('year');

  useEffect(() => {
    (async () => {
      const allInvoices = await getInvoices();
      setInvoices(allInvoices.filter(i => i.status !== InvoiceStatus.ANULADA));
      setMounted(true);
    })();
  }, []);

  // Monthly revenue trend
  const monthlyRevenue = useMemo(() => {
    const now = new Date();
    const months = period === 'month' ? 1 : period === 'quarter' ? 3 : 12;
    const data = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const m = d.getMonth();
      const y = d.getFullYear();
      const monthInvs = invoices.filter(inv => {
        const id = new Date(inv.issueDate);
        return id.getMonth() === m && id.getFullYear() === y;
      });
      const total = monthInvs.reduce((sum, inv) => sum + inv.total, 0);
      const base = monthInvs.reduce((sum, inv) => sum + inv.subtotal, 0);
      const tax = monthInvs.reduce((sum, inv) => sum + inv.totalTax, 0);
      data.push({ name: getShortMonthName(m), total: Number(total.toFixed(2)), base: Number(base.toFixed(2)), tax: Number(tax.toFixed(2)), count: monthInvs.length });
    }
    return data;
  }, [invoices, period]);

  // Client distribution
  const clientDistribution = useMemo(() => {
    const map = new Map<string, { name: string; total: number }>();
    invoices.forEach(inv => {
      const existing = map.get(inv.clientId) || { name: inv.clientName, total: 0 };
      existing.total += inv.total;
      map.set(inv.clientId, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 8);
  }, [invoices]);

  // El acento del tema activo, resuelto a hexadecimal para la leyenda.
  const [accent] = useState(() => resolveAccent());

  // Category distribution
  const categoryDistribution = useMemo(() => {
    const map = new Map<string, number>();
    invoices.forEach(inv => {
      inv.lineItems.forEach(li => {
        const existing = map.get(li.productName) || 0;
        map.set(li.productName, existing + li.subtotal);
      });
    });
    return Array.from(map.entries())
      .map(([name, total]) => ({ name, total: Number(total.toFixed(2)) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [invoices]);

  // Tax summary
  const taxSummary = useMemo(() => {
    const map = new Map<number, { base: number; tax: number }>();
    invoices.forEach(inv => {
      inv.taxBreakdown.forEach(tb => {
        const existing = map.get(tb.rate) || { base: 0, tax: 0 };
        existing.base += tb.base;
        existing.tax += tb.amount;
        map.set(tb.rate, existing);
      });
    });
    return Array.from(map.entries())
      .map(([rate, data]) => ({ rate, base: Number(data.base.toFixed(2)), tax: Number(data.tax.toFixed(2)) }))
      .sort((a, b) => b.rate - a.rate);
  }, [invoices]);

  // Totals
  const totalRevenue = invoices.reduce((sum, inv) => sum + inv.total, 0);
  const totalBase = invoices.reduce((sum, inv) => sum + inv.subtotal, 0);
  const totalTax = invoices.reduce((sum, inv) => sum + inv.totalTax, 0);

  if (!mounted) return <PageSkeleton variant="report" label="Calculando los informes" />;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <p className="page-eyebrow"><BarChart3 /> Análisis</p>
          <h1 className="page-title">Informes</h1>
          <p className="page-subtitle">
            Cómo evoluciona la facturación y qué IVA has repercutido. Se excluyen las facturas anuladas.
          </p>
        </div>
        <div className="page-header-actions">
          <div className="tabs" style={{ border: 'none', marginBottom: 0 }} role="tablist" aria-label="Periodo">
            <button role="tab" aria-selected={period === 'month'} className={`tab ${period === 'month' ? 'active' : ''}`} onClick={() => setPeriod('month')}>Este mes</button>
            <button role="tab" aria-selected={period === 'quarter'} className={`tab ${period === 'quarter' ? 'active' : ''}`} onClick={() => setPeriod('quarter')}>Trimestre</button>
            <button role="tab" aria-selected={period === 'year'} className={`tab ${period === 'year' ? 'active' : ''}`} onClick={() => setPeriod('year')}>Últimos 12 meses</button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 'var(--space-6)' }}>
        <div className="kpi-card" style={{ '--kpi-color': 'var(--accent-500)' } as React.CSSProperties}>
          <div className="kpi-card-value">{formatCurrency(totalRevenue)}</div>
          <div className="kpi-card-label">Facturación total ({invoices.length} facturas)</div>
        </div>
        <div className="kpi-card" style={{ '--kpi-color': 'var(--color-info)' } as React.CSSProperties}>
          <div className="kpi-card-value">{formatCurrency(totalBase)}</div>
          <div className="kpi-card-label">Base imponible total</div>
        </div>
        <div className="kpi-card" style={{ '--kpi-color': 'var(--color-warning)' } as React.CSSProperties}>
          <div className="kpi-card-value">{formatCurrency(totalTax)}</div>
          <div className="kpi-card-label">IVA repercutido total</div>
        </div>
      </div>

      {/* Charts */}
      <div className="charts-grid charts-grid--even">
        <ChartCard
          title="Tendencia de facturación"
          subtitle="Total facturado frente a base imponible"
          height={300}
          isEmpty={monthlyRevenue.every(m => m.total === 0)}
          emptyLabel="Sin datos en el periodo seleccionado"
          emptyHint={<>Prueba a ampliar el periodo o <Link href="/facturas/nueva">emite una factura</Link>.</>}
          tableColumns={[
            { key: 'name', label: 'Mes' },
            { key: 'base', label: 'Base', align: 'right', format: (v: unknown) => formatCurrency(Number(v)) },
            { key: 'tax', label: 'IVA', align: 'right', format: (v: unknown) => formatCurrency(Number(v)) },
            { key: 'total', label: 'Total', align: 'right', format: (v: unknown) => formatCurrency(Number(v)) },
          ]}
          tableRows={monthlyRevenue}
          legend={
            <ChartLegend
              items={[
                { name: 'Total facturado', value: formatCurrency(totalRevenue), color: accent },
                { name: 'Base imponible', value: formatCurrency(totalBase), color: SERIES[0] },
              ]}
            />
          }
        >
          <AreaTrendChart data={monthlyRevenue} label1="Total facturado" label2="Base imponible" />
        </ChartCard>

        <ChartCard
          title="Facturación por cliente"
          subtitle="Los 8 clientes con mayor volumen"
          height={300}
          isEmpty={clientDistribution.length === 0}
          emptyLabel="Sin clientes facturados"
          tableColumns={[
            { key: 'name', label: 'Cliente' },
            { key: 'total', label: 'Facturado', align: 'right', format: (v: unknown) => formatCurrency(Number(v)) },
          ]}
          tableRows={clientDistribution}
        >
          <RankedBars data={clientDistribution} />
        </ChartCard>
      </div>

      <div className="charts-grid charts-grid--even" style={{ marginTop: 'var(--space-4)' }}>
        <ChartCard
          title="Productos más vendidos"
          subtitle="Por importe facturado acumulado"
          height={320}
          isEmpty={categoryDistribution.length === 0}
          emptyLabel="Sin ventas registradas"
          tableColumns={[
            { key: 'name', label: 'Producto' },
            { key: 'total', label: 'Facturado', align: 'right', format: (v: unknown) => formatCurrency(Number(v)) },
          ]}
          tableRows={categoryDistribution}
        >
          <RankedBars data={categoryDistribution} color={SERIES[0]} />
        </ChartCard>

        <ChartCard
          title="Resumen Fiscal por Tipo de IVA"
          subtitle="Base imponible y cuota tributaria acumulada para el Modelo 303"
          height={320}
          isEmpty={taxSummary.length === 0}
          emptyLabel="Todavía no has repercutido IVA"
          emptyHint={<>Se calcula solo con cada factura emitida.</>}
          tableColumns={[
            { key: 'rate', label: 'Tipo IVA', format: (v: unknown) => `IVA ${v}%` },
            { key: 'base', label: 'Base imponible', align: 'right', format: (v: unknown) => formatCurrency(Number(v)) },
            { key: 'tax', label: 'Cuota IVA', align: 'right', format: (v: unknown) => formatCurrency(Number(v)) },
          ]}
          tableRows={taxSummary}
          legend={
            <ChartLegend
              items={[
                { name: 'Base imponible total', value: formatCurrency(totalBase), color: '#b02a5c' },
                { name: 'Cuota IVA total', value: formatCurrency(totalTax), color: '#3987e5' },
              ]}
            />
          }
        >
          <ComparisonBarChart
            data={taxSummary.map(t => ({
              name: `IVA ${t.rate}%`,
              series1: t.base,
              series2: t.tax
            }))}
            name1="Base imponible"
            name2="Cuota IVA"
          />
        </ChartCard>
      </div>

      {/* Qué deja cada cosa, con los costes reconstruidos en orden de fecha
          y no con los que se guardaron al vender. */}
      <Rentabilidad />
    </div>
  );
}
