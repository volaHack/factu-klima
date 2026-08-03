'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  TrendingUp, TrendingDown, DollarSign, Clock, Users, AlertTriangle,
  ArrowRight, Eye, ShieldCheck, Sparkles, Package, FileText, UserPlus
} from 'lucide-react';
import CategoryIcon from '@/components/ui/CategoryIcon';
import PageSkeleton from '@/components/ui/PageSkeleton';
import TableEmpty from '@/components/ui/TableEmpty';
import ChartCard from '@/components/charts/ChartCard';
import { RevenueColumns, StatusDonut, ChartLegend } from '@/components/charts/Charts';
import { INVOICE_STATUS_COLOR } from '@/components/charts/theme';
import { getInvoices, getClients, getCompanySettings, getProducts, getOnboardingStatus, completeOnboarding } from '@/lib/storage';
import { Invoice, InvoiceStatus, Client, CompanySettings, Product } from '@/lib/types';
import { formatCurrency, formatDate, getDaysUntilDue, getShortMonthName, getStatusInfo } from '@/lib/utils';
import { BUSINESS_SECTORS } from '@/lib/constants';
import { FirstStepsModal, FirstStepsData } from '@/components/onboarding/FirstStepsModal';
import { VerifactuStatus } from '@/components/verifactu/VerifactuStatus';

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
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const month = d.getMonth();
      const year = d.getFullYear();
      const monthInvs = invoices.filter(inv => {
        const id = new Date(inv.issueDate);
        return id.getMonth() === month && id.getFullYear() === year && inv.status !== InvoiceStatus.ANULADA;
      });
      const total = monthInvs.reduce((sum, inv) => sum + inv.total, 0);
      data.push({
        name: getShortMonthName(month),
        total: Number(total.toFixed(2)),
        count: monthInvs.length,
      });
    }
    return data;
  }, [invoices]);

  // Reparto por estado. Los colores salen de la paleta de ESTADO
  // (verde cobrado / ámbar pendiente / rojo vencido), nunca de la
  // paleta de series: aquí el color significa algo.
  const statusData = useMemo(() => {
    const buckets: { name: string; status: InvoiceStatus }[] = [
      { name: 'Pagadas', status: InvoiceStatus.PAGADA },
      { name: 'Pendientes', status: InvoiceStatus.PENDIENTE },
      { name: 'Emitidas', status: InvoiceStatus.EMITIDA },
      { name: 'Vencidas', status: InvoiceStatus.VENCIDA },
      { name: 'Borradores', status: InvoiceStatus.BORRADOR },
    ];
    return buckets
      .map(b => ({
        name: b.name,
        value: invoices.filter(i => i.status === b.status).length,
        color: INVOICE_STATUS_COLOR[b.status],
      }))
      .filter(s => s.value > 0);
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
    return Array.from(clientRevenue.entries())
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [invoices]);

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
    return Array.from(productSales.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [invoices]);

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
          subtitle="Importe emitido en los últimos 12 meses"
          height={300}
          isEmpty={monthlyData.every(m => m.total === 0)}
          emptyLabel="Sin facturación registrada"
          emptyHint={<>Cuando emitas tu primera factura, aquí verás la evolución mes a mes. <Link href="/facturas/nueva">Crear factura</Link></>}
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
          subtitle={`${invoices.length} facturas en total`}
          height={220}
          isEmpty={statusData.length === 0}
          emptyLabel="Sin facturas todavía"
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
            centerValue={String(invoices.length)}
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

        {/* Top Clients + Upcoming Due */}
        <div className="stack">
          {/* Top Clients */}
          <div className="chart-card" style={{ flex: 1 }}>
            <div className="chart-header">
              <div className="chart-heading">
                <h3 className="chart-title">Clientes por facturación</h3>
                <p className="chart-subtitle">Los cinco que más te han comprado</p>
              </div>
            </div>
            <div className="stats-list">
              {topClients.map((client, i) => (
                <div className="stats-item" key={client.id}>
                  <div className="stats-item-left">
                    <div className="stats-item-rank">{i + 1}</div>
                    <div>
                      <div className="stats-item-name">{client.name}</div>
                      <div className="stats-item-detail">
                        {client.count} {client.count === 1 ? 'factura' : 'facturas'}
                      </div>
                    </div>
                  </div>
                  <div className="stats-item-value">{formatCurrency(client.total)}</div>
                </div>
              ))}
              {topClients.length === 0 && (
                <div className="chart-empty">
                  <UserPlus size={24} strokeWidth={1.5} />
                  <p className="chart-empty-label">Todavía no has facturado a nadie</p>
                  <p className="chart-empty-hint">
                    En cuanto emitas facturas, este ranking te dirá de un vistazo quién sostiene el
                    negocio. <Link href="/clientes">Dar de alta un cliente</Link>
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Top Products */}
          <div className="chart-card" style={{ flex: 1 }}>
            <div className="chart-header">
              <div className="chart-heading">
                <h3 className="chart-title section-title">
                  <Package size={16} />
                  Productos más vendidos
                </h3>
                <p className="chart-subtitle">Por importe facturado</p>
              </div>
              <Link href="/productos" className="btn btn-ghost btn-sm">
                Ver todos ({products.length}) <ArrowRight size={14} />
              </Link>
            </div>
            <div className="stats-list">
              {topProducts.map((prod, i) => (
                <div className="stats-item" key={i}>
                  <div className="stats-item-left">
                    <div className="stats-item-rank" style={{ background: 'var(--accent-glow)', color: 'var(--accent-400)' }}>{i + 1}</div>
                    <div>
                      <div className="stats-item-name">{prod.name}</div>
                      <div className="stats-item-detail">{prod.ref} · {prod.quantity} unidades vendidas</div>
                    </div>
                  </div>
                  <div className="stats-item-value">{formatCurrency(prod.total)}</div>
                </div>
              ))}
              {topProducts.length === 0 && (
                <div className="chart-empty">
                  <Package size={24} strokeWidth={1.5} />
                  <p className="chart-empty-label">Sin ventas por producto todavía</p>
                  <p className="chart-empty-hint">
                    Cuando factures usando productos del catálogo sabrás qué se vende de verdad.{' '}
                    <Link href="/productos">Añadir un producto</Link>
                  </p>
                </div>
              )}
            </div>
          </div>

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
