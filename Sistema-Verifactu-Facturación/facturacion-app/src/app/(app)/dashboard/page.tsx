'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  TrendingUp, TrendingDown, DollarSign, Clock, Users, AlertTriangle,
  ArrowRight, Eye, ShieldCheck, Sparkles, Package, FileText
} from 'lucide-react';
import CategoryIcon from '@/components/ui/CategoryIcon';
import PageSkeleton from '@/components/ui/PageSkeleton';
import TableEmpty from '@/components/ui/TableEmpty';
import ChartCard from '@/components/charts/ChartCard';
import { RevenueColumns, StatusDonut, ChartLegend, RankedBars } from '@/components/charts/Charts';
import { INVOICE_STATUS_COLOR } from '@/components/charts/theme';
import { getInvoices, getClients, getCompanySettings, getProducts, getOnboardingStatus, completeOnboarding } from '@/lib/storage';
import { Invoice, InvoiceStatus, Client, CompanySettings, Product } from '@/lib/types';
import { formatCurrency, formatDate, getDaysUntilDue, getShortMonthName, getStatusInfo } from '@/lib/utils';
import { BUSINESS_SECTORS } from '@/lib/constants';
import { FirstStepsModal, FirstStepsData } from '@/components/onboarding/FirstStepsModal';
import { VerifactuStatus } from '@/components/verifactu/VerifactuStatus';
import AvisosTendencias from '@/components/dashboard/AvisosTendencias';

export default function DashboardPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [mounted, setMounted] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      const [invs, cls, stg, prods, obStatus] = await Promise.all([
        getInvoices(),
        getClients(),
        getCompanySettings(),
        getProducts(),
        getOnboardingStatus(),
      ]);
      setInvoices(invs);
      setClients(cls);
      setSettings(stg);
      setProducts(prods);
      setShowOnboarding(!obStatus.isComplete);
      setOnboardingChecked(true);
      setMounted(true);
    };
    loadData();
  }, []);

  // KPI calculations
  const kpis = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const monthInvoices = invoices.filter(inv => {
      const d = new Date(inv.issueDate);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear && inv.status !== InvoiceStatus.ANULADA;
    });
    const monthTotal = monthInvoices.reduce((sum, inv) => sum + inv.total, 0);

    const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    const lastMonthInvoices = invoices.filter(inv => {
      const d = new Date(inv.issueDate);
      return d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear && inv.status !== InvoiceStatus.ANULADA;
    });
    const lastMonthTotal = lastMonthInvoices.reduce((sum, inv) => sum + inv.total, 0);
    const monthChange = lastMonthTotal > 0 ? ((monthTotal - lastMonthTotal) / lastMonthTotal * 100) : 0;

    const pending = invoices.filter(inv =>
      inv.status === InvoiceStatus.PENDIENTE || inv.status === InvoiceStatus.EMITIDA
    );
    const pendingTotal = pending.reduce((sum, inv) => sum + inv.total, 0);

    const overdue = invoices.filter(inv => inv.status === InvoiceStatus.VENCIDA);
    const overdueTotal = overdue.reduce((sum, inv) => sum + inv.total, 0);

    const activeClients = clients.filter(c => c.active).length;
    const totalProducts = products.length;
    const activeProducts = products.filter(p => p.active).length;

    return {
      monthTotal, monthChange, monthInvoices: monthInvoices.length,
      pendingCount: pending.length, pendingTotal,
      overdueCount: overdue.length, overdueTotal,
      activeClients, totalProducts, activeProducts,
    };
  }, [invoices, clients, products]);

  // Chart data - monthly revenue
  const monthlyData = useMemo(() => {
    const now = new Date();
    const data = [];
    const hasRealData = invoices.some(inv => inv.status !== InvoiceStatus.ANULADA);
    const demoValues = [1450, 2100, 3200, 2850, 4300, 3900, 5100, 4750, 6200, 6900, 7500, 8400];

    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const month = d.getMonth();
      const year = d.getFullYear();
      const monthInvs = invoices.filter(inv => {
        const id = new Date(inv.issueDate);
        return id.getMonth() === month && id.getFullYear() === year && inv.status !== InvoiceStatus.ANULADA;
      });
      const realTotal = monthInvs.reduce((sum, inv) => sum + inv.total, 0);

      data.push({
        name: getShortMonthName(month),
        total: hasRealData ? Number(realTotal.toFixed(2)) : demoValues[11 - i],
        count: hasRealData ? monthInvs.length : Math.ceil(demoValues[11 - i] / 500),
      });
    }
    return data;
  }, [invoices]);

  // Reparto por estado
  const statusData = useMemo(() => {
    const buckets: { name: string; status: InvoiceStatus }[] = [
      { name: 'Pagadas', status: InvoiceStatus.PAGADA },
      { name: 'Pendientes', status: InvoiceStatus.PENDIENTE },
      { name: 'Emitidas', status: InvoiceStatus.EMITIDA },
      { name: 'Vencidas', status: InvoiceStatus.VENCIDA },
      { name: 'Borradores', status: InvoiceStatus.BORRADOR },
    ];
    const realBuckets = buckets
      .map(b => ({
        name: b.name,
        value: invoices.filter(i => i.status === b.status).length,
        color: INVOICE_STATUS_COLOR[b.status],
      }))
      .filter(s => s.value > 0);

    if (realBuckets.length > 0) return realBuckets;

    return [
      { name: 'Pagadas', value: 14, color: INVOICE_STATUS_COLOR.pagada },
      { name: 'Pendientes', value: 5, color: INVOICE_STATUS_COLOR.pendiente },
      { name: 'Emitidas', value: 3, color: INVOICE_STATUS_COLOR.emitida },
      { name: 'Vencidas', value: 1, color: INVOICE_STATUS_COLOR.vencida },
      { name: 'Borradores', value: 2, color: INVOICE_STATUS_COLOR.borrador },
    ];
  }, [invoices]);

  // Recent invoices
  const recentInvoices = useMemo(() => {
    return [...invoices]
      .sort((a, b) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime())
      .slice(0, 5);
  }, [invoices]);

  // Top clients by revenue
  const topClients = useMemo(() => {
    const clientRevenue = new Map<string, { name: string; total: number; count: number }>();
    invoices.forEach(inv => {
      if (inv.status === InvoiceStatus.ANULADA) return;
      const existing = clientRevenue.get(inv.clientId) || { name: inv.clientName, total: 0, count: 0 };
      existing.total += inv.total;
      existing.count += 1;
      clientRevenue.set(inv.clientId, existing);
    });
    const realTop = Array.from(clientRevenue.entries())
      .map(([id, data]) => ({ id, name: data.name, total: Number(data.total.toFixed(2)), count: data.count }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    if (realTop.length > 0) return realTop;

    if (clients.length > 0) {
      return clients.slice(0, 5).map((c, i) => ({
        id: c.id,
        name: c.tradeName || c.businessName,
        total: (5 - i) * 1250,
        count: (5 - i) * 2
      }));
    }

    return [
      { id: '1', name: 'Klima Solutions S.L.', total: 6850, count: 5 },
      { id: '2', name: 'Hostelería Norte S.A.', total: 4900, count: 4 },
      { id: '3', name: 'Construcciones Rivas', total: 3400, count: 3 },
      { id: '4', name: 'Comercial Ibérica S.L.', total: 2150, count: 2 },
      { id: '5', name: 'Tech Consultores S.L.', total: 1200, count: 1 },
    ];
  }, [invoices, clients]);

  // Top products by sales volume
  const topProducts = useMemo(() => {
    const productSales = new Map<string, { ref: string; name: string; quantity: number; total: number }>();
    invoices.forEach(inv => {
      if (inv.status === InvoiceStatus.ANULADA) return;
      inv.lineItems.forEach(li => {
        const key = li.productName || 'Producto';
        const existing = productSales.get(key) || { ref: li.productRef || 'REF', name: key, quantity: 0, total: 0 };
        existing.quantity += li.quantity;
        existing.total += li.total;
        productSales.set(key, existing);
      });
    });
    const realTop = Array.from(productSales.values())
      .map(p => ({ ...p, total: Number(p.total.toFixed(2)) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    if (realTop.length > 0) return realTop;

    if (products.length > 0) {
      return products.slice(0, 5).map((p, i) => ({
        ref: p.ref,
        name: p.name,
        quantity: (5 - i) * 15,
        total: (5 - i) * p.unitPrice * 15 || (5 - i) * 850
      }));
    }

    return [
      { ref: 'PRD-001', name: 'Aceite de Oliva 1L', quantity: 75, total: 3750 },
      { ref: 'PRD-002', name: 'Jamón Ibérico Reserva', quantity: 24, total: 2880 },
      { ref: 'PRD-003', name: 'Vino D.O. Ribera 75cl', quantity: 60, total: 1980 },
      { ref: 'PRD-004', name: 'Queso Manchego Curado 1kg', quantity: 35, total: 1400 },
      { ref: 'PRD-005', name: 'Café Arábica Grano 1kg', quantity: 40, total: 960 },
    ];
  }, [invoices, products]);

  // Upcoming due invoices
  const upcomingDue = useMemo(() => {
    return invoices
      .filter(inv => inv.status === InvoiceStatus.PENDIENTE || inv.status === InvoiceStatus.EMITIDA)
      .map(inv => ({ ...inv, daysLeft: getDaysUntilDue(inv.dueDate) }))
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 5);
  }, [invoices]);

  const sectorInfo = BUSINESS_SECTORS.find(s => s.value === settings?.sector) || BUSINESS_SECTORS[0];

  if (!mounted) {
    return <PageSkeleton variant="dashboard" label="Cargando el panel" />;
  }

  return (
    <div className="animate-fade-in">
      {/* Cabecera de identidad del negocio */}
      <div className="hero-panel">
        <div className="hero-panel-body">
          <p className="hero-panel-sector">
            <CategoryIcon name={sectorInfo.icon} size={15} />
            {sectorInfo.label}
          </p>
          <h2 className="hero-panel-name">
            {settings?.tradeName || settings?.businessName}
          </h2>
          <p className="hero-panel-meta">
            Serie <strong>{settings?.invoiceSeries}</strong> · la siguiente factura saldrá con el
            número{' '}
            <strong>
              {settings?.invoiceSeries}-2026-{String(settings?.nextInvoiceNumber).padStart(4, '0')}
            </strong>
          </p>
        </div>

        <div className="hero-panel-aside">
          {settings?.verifactuEnabled && (
            <div className="seal-chip">
              <ShieldCheck size={18} />
              <div>
                <div className="seal-chip-title">Facturas selladas</div>
                <div className="seal-chip-sub">Huella SHA-256 encadenada</div>
              </div>
            </div>
          )}
          <Link href="/facturas/nueva" className="btn btn-primary btn-lg">
            <Sparkles size={16} />
            Nueva factura
          </Link>
        </div>
      </div>

      {/* Verifactu Status */}
      <div style={{ marginBottom: 'var(--space-5)' }}>
        <VerifactuStatus />
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid">
        <div className="kpi-card" style={{ '--kpi-color': 'var(--accent-500)', '--kpi-bg': 'var(--color-success-bg)' } as React.CSSProperties}>
          <div className="kpi-card-header">
            <div className="kpi-card-icon">
              <DollarSign size={20} />
            </div>
            {kpis.monthChange !== 0 && (
              <div className={`kpi-card-change ${kpis.monthChange >= 0 ? 'positive' : 'negative'}`}>
                {kpis.monthChange >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {Math.abs(kpis.monthChange).toFixed(1)}%
              </div>
            )}
          </div>
          <div className="kpi-card-value">{formatCurrency(kpis.monthTotal)}</div>
          <div className="kpi-card-label">Ventas este mes ({kpis.monthInvoices} facturas)</div>
        </div>

        <div className="kpi-card" style={{ '--kpi-color': 'var(--color-warning)', '--kpi-bg': 'var(--color-warning-bg)' } as React.CSSProperties}>
          <div className="kpi-card-header">
            <div className="kpi-card-icon">
              <Clock size={20} />
            </div>
          </div>
          <div className="kpi-card-value">{formatCurrency(kpis.pendingTotal)}</div>
          <div className="kpi-card-label">{kpis.pendingCount} facturas pendientes de cobro</div>
        </div>

        <div className="kpi-card" style={{ '--kpi-color': 'var(--color-danger)', '--kpi-bg': 'var(--color-danger-bg)' } as React.CSSProperties}>
          <div className="kpi-card-header">
            <div className="kpi-card-icon">
              <AlertTriangle size={20} />
            </div>
          </div>
          <div className="kpi-card-value">{formatCurrency(kpis.overdueTotal)}</div>
          <div className="kpi-card-label">{kpis.overdueCount} facturas vencidas</div>
        </div>

        <div className="kpi-card" style={{ '--kpi-color': 'var(--color-info)', '--kpi-bg': 'var(--color-info-bg)' } as React.CSSProperties}>
          <div className="kpi-card-header">
            <div className="kpi-card-icon">
              <Users size={20} />
            </div>
          </div>
          <div className="kpi-card-value">{kpis.activeClients}</div>
          <div className="kpi-card-label">Clientes activos en cartera</div>
        </div>

        <div className="kpi-card" style={{ '--kpi-color': 'var(--accent-400)', '--kpi-bg': 'var(--accent-glow)' } as React.CSSProperties}>
          <div className="kpi-card-header">
            <div className="kpi-card-icon">
              <Package size={20} />
            </div>
          </div>
          <div className="kpi-card-value">{kpis.totalProducts}</div>
          <div className="kpi-card-label">{kpis.activeProducts} productos activos en catálogo</div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="charts-grid">
        <ChartCard
          title="Evolución de facturación"
          subtitle={invoices.length > 0 ? "Importe emitido en los últimos 12 meses" : "Datos ilustrativos · Evolución de facturación"}
          height={300}
          isEmpty={false}
          tableColumns={[
            { key: 'name', label: 'Mes' },
            { key: 'count', label: 'Facturas', align: 'right' },
            { key: 'total', label: 'Importe', align: 'right', format: (v: unknown) => formatCurrency(Number(v)) },
          ]}
          tableRows={monthlyData}
        >
          <RevenueColumns data={monthlyData} />
        </ChartCard>

        <ChartCard
          title="Reparto por estado"
          subtitle={invoices.length > 0 ? `${invoices.length} facturas en total` : "Datos ilustrativos · Distribución por estado"}
          height={300}
          isEmpty={false}
          tableColumns={[
            { key: 'name', label: 'Estado' },
            { key: 'value', label: 'Facturas', align: 'right' },
          ]}
          tableRows={statusData}
          legend={
            <ChartLegend
              items={statusData.map(s => ({ name: s.name, value: String(s.value), color: s.color }))}
            />
          }
        >
          <StatusDonut
            data={statusData}
            centerValue={String(statusData.reduce((sum, s) => sum + s.value, 0))}
            centerLabel="facturas"
          />
        </ChartCard>
      </div>

      {/* Bottom Row */}
      <div className="charts-grid" style={{ marginTop: 'var(--space-4)' }}>
        {/* Recent Invoices */}
        <div className="chart-card">
          <div className="chart-header">
            <h3 className="chart-title">Últimas facturas</h3>
            <Link href="/facturas" className="btn btn-ghost btn-sm">
              Ver todas <ArrowRight size={14} />
            </Link>
          </div>
          <div className="table-container" style={{ border: 'none' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Nº Factura</th>
                  <th>Cliente</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {recentInvoices.map(inv => (
                  <tr key={inv.id}>
                    <td className="mono primary">{inv.number}</td>
                    <td>{inv.clientName}</td>
                    <td>{formatDate(inv.issueDate)}</td>
                    <td>
                      <span className={`badge badge-${inv.status}`}>
                        <span className="badge-dot" />
                        {getStatusInfo(inv.status).label}
                      </span>
                    </td>
                    <td className="amount">{formatCurrency(inv.total)}</td>
                    <td>
                      <Link
                        href={`/facturas/${inv.id}`}
                        className="btn btn-ghost btn-icon btn-sm"
                        aria-label={`Ver la factura ${inv.number}`}
                      >
                        <Eye size={14} />
                      </Link>
                    </td>
                  </tr>
                ))}
                {recentInvoices.length === 0 && (
                  <TableEmpty
                    colSpan={6}
                    icon={FileText}
                    title="Aquí irán apareciendo tus facturas"
                    hint="Las cinco más recientes se listan solas en cuanto emitas la primera."
                    action={
                      <Link href="/facturas/nueva" className="btn btn-primary btn-sm">
                        <Sparkles size={14} /> Crear la primera factura
                      </Link>
                    }
                  />
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Clients + Top Products Stack */}
        <div className="stack">
          {/* Top Clients */}
          <ChartCard
            title="Clientes por facturación"
            subtitle="Los cinco clientes con mayor volumen (€)"
            height={220}
            isEmpty={false}
            tableColumns={[
              { key: 'name', label: 'Cliente' },
              { key: 'count', label: 'Facturas', align: 'right' },
              { key: 'total', label: 'Facturado', align: 'right', format: (v: unknown) => formatCurrency(Number(v)) },
            ]}
            tableRows={topClients}
          >
            <RankedBars data={topClients} />
          </ChartCard>

          {/* Top Products */}
          <ChartCard
            title="Productos más vendidos"
            subtitle="Por importe acumulado facturado (€)"
            height={220}
            isEmpty={false}
            tableColumns={[
              { key: 'name', label: 'Producto' },
              { key: 'quantity', label: 'Unidades', align: 'right' },
              { key: 'total', label: 'Facturado', align: 'right', format: (v: unknown) => formatCurrency(Number(v)) },
            ]}
            tableRows={topProducts}
          >
            <RankedBars data={topProducts} />
          </ChartCard>

          {/* Upcoming Due */}
          {upcomingDue.length > 0 && (
            <div className="chart-card">
              <div className="chart-header">
                <div className="chart-heading">
                  <h3 className="chart-title">Próximos cobros</h3>
                  <p className="chart-subtitle">Ordenados por lo que queda para vencer</p>
                </div>
              </div>
              <div className="stats-list">
                {upcomingDue.map(inv => (
                  <Link href={`/facturas/${inv.id}`} key={inv.id} className="stats-item">
                    <div className="stats-item-left">
                      <div>
                        <div className="stats-item-name">{inv.number}</div>
                        <div className="stats-item-detail">{inv.clientName}</div>
                      </div>
                    </div>
                    <div className={`badge ${
                      inv.daysLeft <= 0 ? 'badge-vencida'
                        : inv.daysLeft <= 7 ? 'badge-pendiente'
                        : 'badge-borrador'
                    }`}>
                      {inv.daysLeft <= 0
                        ? `Vencida hace ${Math.abs(inv.daysLeft)} ${Math.abs(inv.daysLeft) === 1 ? 'día' : 'días'}`
                        : inv.daysLeft === 0 ? 'Vence hoy'
                        : `Vence en ${inv.daysLeft} ${inv.daysLeft === 1 ? 'día' : 'días'}`}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Avisos y tendencias IA */}
      <AvisosTendencias products={products} invoices={invoices} />

      {onboardingChecked && showOnboarding && (
        <FirstStepsModal
          isDismissible={true}
          onClose={() => setShowOnboarding(false)}
          onComplete={async (data: FirstStepsData) => {
            await completeOnboarding(data);
            setShowOnboarding(false);
            const updatedSettings = await getCompanySettings();
            setSettings(updatedSettings);
          }}
        />
      )}
    </div>
  );
}
