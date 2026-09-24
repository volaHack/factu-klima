'use client';

import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
  TrendingUp, TrendingDown, Euro, Clock, Users, AlertTriangle,
  ArrowRight, Eye, ShieldCheck, Plus, Package, FileText, Crown
} from 'lucide-react';
import CategoryIcon from '@/components/ui/CategoryIcon';
import PageSkeleton from '@/components/ui/PageSkeleton';
import TableEmpty from '@/components/ui/TableEmpty';
import ChartCard from '@/components/charts/ChartCard';
import { RevenueColumns, StatusDonut, ChartLegend, RankedBars, ComparisonBarChart } from '@/components/charts/Charts';
import { INVOICE_STATUS_COLOR, SERIES, useColoresGrafica } from '@/components/charts/theme';
import { facturadoYCobrado, formasDePago } from '@/lib/analitica';
import { getInvoices, getClients, getCompanySettings, getProducts, getOnboardingStatus, completeOnboarding } from '@/lib/storage';
import { Invoice, InvoiceStatus, Client, CompanySettings, Product } from '@/lib/types';
import { formatCurrency, formatDate, getDaysUntilDue, getShortMonthName, getStatusInfo } from '@/lib/utils';
import { isFactura } from '@/lib/documentos';
import { BUSINESS_SECTORS, PAYMENT_METHODS } from '@/lib/constants';
import { FirstStepsModal, FirstStepsData } from '@/components/onboarding/FirstStepsModal';
import { VerifactuStatus } from '@/components/verifactu/VerifactuStatus';
import AvisosTendencias from '@/components/dashboard/AvisosTendencias';
import PanelAnalisis from '@/components/dashboard/PanelAnalisis';
import { evaluatePlanLimit } from '@/lib/planLimits';
import { fichasVisibles, type FichaId } from '@/lib/panel';

/**
 * Alto de un ranking según cuántas filas trae: 36 px por barra más la
 * banda del eje. Con un alto fijo de 220, un solo cliente dejaba una
 * barra suelta en medio de un recuadro vacío.
 */
const altoRanking = (filas: number) => Math.max(110, 34 + Math.max(1, filas) * 36);

export default function DashboardPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [showFirstSteps, setShowFirstSteps] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      const [invs, cls, stg, prods, obStatus] = await Promise.all([
        getInvoices(),
        getClients(),
        getCompanySettings(),
        getProducts(),
        getOnboardingStatus(),
      ]);
      setInvoices(invs.filter(isFactura));
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
      const realTotal = monthInvs.reduce((sum, inv) => sum + inv.total, 0);

      data.push({
        name: getShortMonthName(month),
        total: Number(realTotal.toFixed(2)),
        count: monthInvs.length,
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
    // Sólo facturación real. Antes, sin datos, se inventaban clientes — y
    // peor: con clientes reales se les colgaba un importe ficticio
    // (total: (5 - i) * 1250), así que el panel enseñaba el nombre de un
    // cliente de verdad junto a una cifra facturada que no existía. En una
    // aplicación fiscal eso no es un hueco que rellenar: es un dato falso
    // con toda la pinta de ser bueno. Sin datos, ChartCard enseña su estado
    // vacío, igual que hace /informes.
    return Array.from(clientRevenue.entries())
      .map(([id, data]) => ({ id, name: data.name, total: Number(data.total.toFixed(2)), count: data.count }))
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
    // Igual que con los clientes: sólo lo realmente vendido. Los productos
    // del catálogo con unidades inventadas daban un ranking de ventas que
    // nunca ocurrieron.
    return Array.from(productSales.values())
      .map(p => ({ ...p, total: Number(p.total.toFixed(2)) }))
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

  // Facturado frente a cobrado y formas de pago: llenan la columna de la
  // izquierda, que con sólo las últimas facturas se quedaba en la mitad
  // de alto que la de los rankings.
  const facturadoCobrado = useMemo(() => facturadoYCobrado(invoices, new Date(), 12), [invoices]);
  const pagos = useMemo(
    () => formasDePago(invoices, new Date()).map(f => ({
      name: PAYMENT_METHODS.find(m => m.value === f.metodo)?.label ?? 'Sin indicar',
      total: f.total,
      count: f.facturas,
    })),
    [invoices],
  );
  const { accent: acentoGrafica } = useColoresGrafica();

  /**
   * «Cómo te pagan» va en la columna que quede más corta.
   *
   * Los rankings de la derecha crecen con los datos (una barra por cliente
   * o producto) y la tabla de la izquierda también: con cinco clientes la
   * izquierda es la corta; con uno solo, la derecha. Se mide una vez por
   * cada carga de facturas —las tarjetas tienen alto fijo, así que la
   * medida es buena desde el primer pintado— y sólo se cambia de columna
   * si el hueco es mayor que la propia tarjeta: así, al moverla, el
   * desnivel siempre baja y nunca se queda oscilando.
   */
  const colIzquierda = useRef<HTMLDivElement>(null);
  const colDerecha = useRef<HTMLDivElement>(null);
  const tarjetaPagos = useRef<HTMLDivElement>(null);
  const [pagosDerecha, setPagosDerecha] = useState(false);
  useLayoutEffect(() => {
    const izq = colIzquierda.current?.getBoundingClientRect().height ?? 0;
    const der = colDerecha.current?.getBoundingClientRect().height ?? 0;
    const pagosAlto = (tarjetaPagos.current?.getBoundingClientRect().height ?? 0) + 16;
    const unaColumna = colIzquierda.current && colDerecha.current
      && colIzquierda.current.getBoundingClientRect().left === colDerecha.current.getBoundingClientRect().left;
    if (unaColumna || pagosAlto <= 16) return;
    if (!pagosDerecha && izq - der > pagosAlto) setPagosDerecha(true);
    else if (pagosDerecha && der - izq > pagosAlto) setPagosDerecha(false);
    // Sólo cuando cambian los datos: medir en cada render lo haría saltar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, mounted]);

  const sectorInfo = BUSINESS_SECTORS.find(s => s.value === settings?.sector) || BUSINESS_SECTORS[0];

  /**
   * Qué fichas ha dejado puestas esta empresa.
   *
   * El editor de Ajustes lleva desde el principio dejando elegir, ordenar
   * y apagar fichas… y guardándolo sin que nadie lo leyera: el panel se
   * pintaba siempre igual pusieras lo que pusieras. Ahora manda lo
   * guardado, y `fichasVisibles` descarta además las que dependen de un
   * módulo apagado, para que nadie coloque la ficha de existencias y se
   * encuentre un cero.
   */
  const puestas = new Set<FichaId>(
    fichasVisibles(settings?.panel, settings?.modulos).map(f => f.id),
  );
  const enPanel = (id: FichaId) => puestas.has(id);

  const pagosCard = enPanel('formas_pago') && pagos.length > 0 ? (
    <div ref={tarjetaPagos}>
        <ChartCard
          title="Cómo te pagan"
          subtitle="Importe facturado en 12 meses por forma de pago"
          height={altoRanking(pagos.length)}
          isEmpty={pagos.length === 0}
          emptyLabel="Todavía no hay facturas con forma de pago"
          tableColumns={[
            { key: 'name', label: 'Forma de pago' },
            { key: 'count', label: 'Facturas', align: 'right' },
            { key: 'total', label: 'Importe', align: 'right', format: (v: unknown) => formatCurrency(Number(v)) },
          ]}
          tableRows={pagos}
        >
          <RankedBars data={pagos} />
        </ChartCard>
    </div>
  ) : null;

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
          <div className="hero-panel-series">
            <span className="hero-panel-series-icon">
              <FileText size={14} />
            </span>
            <div className="hero-panel-series-text">
              <span className="hero-panel-series-label">
                Serie {settings?.invoiceSeries}
              </span>
              <span className="hero-panel-series-number">
                {settings?.invoiceSeries}-{new Date().getFullYear()}-
                {String(settings?.nextInvoiceNumber).padStart(4, '0')}
              </span>
            </div>
            <span className="hero-panel-series-hint">siguiente factura</span>
          </div>
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
            <Plus size={16} />
            Nueva factura
          </Link>
        </div>
      </div>

      {/* Membership & Plan Usage Banner */}
      {(() => {
        const planCheck = evaluatePlanLimit(settings, invoices);
        const isInactive = settings?.subscriptionStatus === 'inactive' || settings?.subscriptionStatus === 'canceled';
        const limitStr = isInactive
          ? 'Activa la suscripción para volver a emitir facturas.'
          : planCheck.limit !== null
            ? `${planCheck.currentCount} de ${planCheck.limit} facturas este mes`
            : `${planCheck.currentCount} facturas este mes, sin tope`;
        const conMedidor = isInactive || planCheck.limit !== null;

        const pct = isInactive
          ? 100
          : planCheck.limit !== null
            ? Math.min(100, Math.round((planCheck.currentCount / planCheck.limit) * 100))
            : 0;

        return (
          <div className={`plan-banner ${isInactive ? 'is-inactive' : ''}`}>
            <div className="plan-banner-info">
              <div className={`plan-banner-icon ${isInactive ? 'is-inactive' : ''}`}>
                <Crown size={24} />
              </div>
              <div className="plan-banner-body">
                <div className="plan-banner-name">
                  <span>{planCheck.planName}</span>
                  <span className={`badge ${isInactive ? 'badge-danger' : 'badge-success'}`}>
                    {isInactive ? 'Sin suscripción' : 'Activa'}
                  </span>
                </div>
                <div className="plan-banner-usage">
                  {limitStr}
                </div>
              </div>
            </div>

            <div className="plan-banner-meter-wrap">
              {conMedidor && (
                <div className="plan-banner-meter">
                  <div className="plan-banner-meter-label">
                    <span>Usado este mes</span>
                    <span>{isInactive ? 'Parado' : `${pct} %`}</span>
                  </div>
                  <div className="plan-banner-meter-track">
                    <div
                      className={`plan-banner-meter-fill ${isInactive || pct >= 90 ? 'is-critical' : ''}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )}

              <Link href="/precios" className={`btn btn-sm ${isInactive ? 'btn-primary' : 'btn-secondary'}`}>
                {isInactive ? 'Activar suscripción' : 'Ver planes'}
              </Link>
            </div>
          </div>
        );
      })()}

      {/* Verifactu Status */}
      {enPanel('estado_verifactu') && (
        <div style={{ marginBottom: 'var(--space-5)' }}>
          <VerifactuStatus />
        </div>
      )}

      {/* KPI Cards */}
      <div className="kpi-grid">
        {enPanel('facturado_mes') && (
        <div className="kpi-card">
          <div className="kpi-card-header">
            <div className="kpi-card-icon">
              <Euro size={20} />
            </div>
            {kpis.monthChange !== 0 && (
              <div className={`kpi-card-change ${kpis.monthChange >= 0 ? 'positive' : 'negative'}`}>
                {kpis.monthChange >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {Math.abs(kpis.monthChange).toFixed(1).replace('.', ',')} %
              </div>
            )}
          </div>
          <div className="kpi-card-value">{formatCurrency(kpis.monthTotal)}</div>
          <div className="kpi-card-label">Vendido este mes · {kpis.monthInvoices} facturas</div>
        </div>
        )}

        {enPanel('pendiente_cobro') && (
        <div className="kpi-card">
          <div className="kpi-card-header">
            <div className="kpi-card-icon">
              <Clock size={20} />
            </div>
          </div>
          <div className="kpi-card-value">{formatCurrency(kpis.pendingTotal)}</div>
          <div className="kpi-card-label">Por cobrar · {kpis.pendingCount} facturas</div>
        </div>
        )}

        {enPanel('vencido') && (
        <div className="kpi-card" style={{ '--kpi-icon': kpis.overdueCount > 0 ? 'var(--color-danger)' : undefined } as React.CSSProperties}>
          <div className="kpi-card-header">
            <div className="kpi-card-icon">
              <AlertTriangle size={20} />
            </div>
          </div>
          <div className="kpi-card-value">{formatCurrency(kpis.overdueTotal)}</div>
          <div className="kpi-card-label">Vencido · {kpis.overdueCount} facturas</div>
        </div>
        )}

        {/* Estos dos no son fichas del catálogo: son el recuento de la
            cartera y del catálogo, y van siempre. */}
        <div className="kpi-card">
          <div className="kpi-card-header">
            <div className="kpi-card-icon">
              <Users size={20} />
            </div>
          </div>
          <div className="kpi-card-value">{kpis.activeClients}</div>
          <div className="kpi-card-label">Clientes activos</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-header">
            <div className="kpi-card-icon">
              <Package size={20} />
            </div>
          </div>
          <div className="kpi-card-value">{kpis.totalProducts}</div>
          <div className="kpi-card-label">Productos en catálogo · {kpis.activeProducts} activos</div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="charts-grid">
        {enPanel('evolucion_ventas') && (
        <ChartCard
          title="Evolución de facturación"
          subtitle="Importe emitido en los últimos 12 meses"
          height={300}
          isEmpty={monthlyData.every(m => m.total === 0)}
          emptyLabel="Aún no has emitido ninguna factura"
          emptyHint={<>Cuando emitas la primera, aquí verás tu facturación mes a mes. <Link href="/facturas/nueva">Crear factura</Link>.</>}
          tableColumns={[
            { key: 'name', label: 'Mes' },
            { key: 'count', label: 'Facturas', align: 'right' },
            { key: 'total', label: 'Importe', align: 'right', format: (v: unknown) => formatCurrency(Number(v)) },
          ]}
          tableRows={monthlyData}
        >
          <RevenueColumns data={monthlyData} />
        </ChartCard>
        )}

        {/* El reparto por estado va siempre: es el resumen de en qué punto
            de cobro está todo, y no tiene ficha propia en el catálogo. */}
        <ChartCard
          title="Reparto por estado"
          subtitle={`${invoices.length} ${invoices.length === 1 ? 'factura' : 'facturas'} en total`}
          height={300}
          isEmpty={statusData.length === 0}
          emptyLabel="Todavía no hay facturas que repartir"
          emptyHint={<>Aquí verás cuántas están pagadas, pendientes o vencidas.</>}
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
        <div className="stack" ref={colIzquierda}>
        {/* Recent Invoices */}
        {enPanel('ultimas_facturas') && (
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
                  <th><span className="solo-lectores">Acciones</span></th>
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
                        <Plus size={14} /> Crear la primera factura
                      </Link>
                    }
                  />
                )}
              </tbody>
            </table>
          </div>
        </div>
        )}

        {enPanel('facturado_cobrado') && (
        <ChartCard
          title="Facturado y cobrado"
          subtitle="Lo emitido cada mes frente a lo que entró ese mes"
          height={230}
          isEmpty={facturadoCobrado.every(m => m.series1 === 0 && m.series2 === 0)}
          emptyLabel="Todavía no hay nada facturado ni cobrado"
          emptyHint={<>Lo cobrado cuenta el día en que se marca la factura como pagada.</>}
          tableColumns={[
            { key: 'name', label: 'Mes' },
            { key: 'series1', label: 'Facturado', align: 'right', format: (v: unknown) => formatCurrency(Number(v)) },
            { key: 'series2', label: 'Cobrado', align: 'right', format: (v: unknown) => formatCurrency(Number(v)) },
          ]}
          tableRows={facturadoCobrado as unknown as Record<string, unknown>[]}
          legend={
            <ChartLegend
              items={[
                { name: 'Facturado 12 m', value: formatCurrency(facturadoCobrado.reduce((a, m) => a + m.series1, 0)), color: acentoGrafica },
                { name: 'Cobrado 12 m', value: formatCurrency(facturadoCobrado.reduce((a, m) => a + m.series2, 0)), color: SERIES[0] },
              ]}
            />
          }
        >
          <ComparisonBarChart data={facturadoCobrado} name1="Facturado" name2="Cobrado" />
        </ChartCard>
        )}
        {!pagosDerecha && pagosCard}
        </div>

        {/* Top Clients + Top Products Stack */}
        <div className="stack" ref={colDerecha}>
          {/* Top Clients */}
          {enPanel('clientes_top') && (
          <ChartCard
            title="Clientes por facturación"
            subtitle="Los cinco clientes con mayor volumen (€)"
            height={altoRanking(topClients.length)}
            isEmpty={topClients.length === 0}
            emptyLabel="Todavía no hay facturación por cliente"
            emptyHint={<>Se calcula con las facturas emitidas, sin contar las anuladas.</>}
            tableColumns={[
              { key: 'name', label: 'Cliente' },
              { key: 'count', label: 'Facturas', align: 'right' },
              { key: 'total', label: 'Facturado', align: 'right', format: (v: unknown) => formatCurrency(Number(v)) },
            ]}
            tableRows={topClients}
          >
            <RankedBars data={topClients} />
          </ChartCard>
          )}

          {/* Top Products */}
          {enPanel('productos_top') && (
          <ChartCard
            title="Productos más vendidos"
            subtitle="Por importe acumulado facturado (€)"
            height={altoRanking(topProducts.length)}
            isEmpty={topProducts.length === 0}
            emptyLabel="Todavía no hay productos vendidos"
            emptyHint={<>Se ordena por importe facturado, no por unidades sueltas.</>}
            tableColumns={[
              { key: 'name', label: 'Producto' },
              { key: 'quantity', label: 'Unidades', align: 'right' },
              { key: 'total', label: 'Facturado', align: 'right', format: (v: unknown) => formatCurrency(Number(v)) },
            ]}
            tableRows={topProducts}
          >
            <RankedBars data={topProducts} />
          </ChartCard>
          )}

          {/* Upcoming Due */}
          {enPanel('proximos_vencimientos') && upcomingDue.length > 0 && (
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
          {pagosDerecha && pagosCard}
        </div>
      </div>

      {/* Análisis del negocio: ritmo, cobros, clientes y productos */}
      {enPanel('analisis_negocio') && <PanelAnalisis invoices={invoices} products={products} />}

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
