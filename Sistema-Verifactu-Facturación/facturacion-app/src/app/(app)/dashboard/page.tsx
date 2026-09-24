'use client';

import { Fragment, useState, useEffect, useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import {
  TrendingUp, TrendingDown, Euro, Clock, Users, AlertTriangle,
  ArrowRight, Eye, ShieldCheck, Plus, Package, FileText, Crown, Wallet, Percent, FilePen, Receipt,
} from 'lucide-react';
import CategoryIcon from '@/components/ui/CategoryIcon';
import PageSkeleton from '@/components/ui/PageSkeleton';
import TableEmpty from '@/components/ui/TableEmpty';
import ChartCard from '@/components/charts/ChartCard';
import { RevenueColumns, StatusDonut, ChartLegend, RankedBars, ComparisonBarChart } from '@/components/charts/Charts';
import { INVOICE_STATUS_COLOR, SERIES, useColoresGrafica } from '@/components/charts/theme';
import { facturadoYCobrado, formasDePago } from '@/lib/analitica';
import {
  getInvoices, getClients, getCompanySettings, getProducts, getOnboardingStatus, completeOnboarding,
  getAlbaranes, getGastos, getObras, getOrdenesTrabajo, getLotes,
} from '@/lib/storage';
import { Invoice, InvoiceStatus, Client, CompanySettings, Product, Albaran, Gasto, Obra, OrdenTrabajo, Lote } from '@/lib/types';
import { formatCurrency, formatDate, getDaysUntilDue, getShortMonthName, getStatusInfo } from '@/lib/utils';
import { isFactura } from '@/lib/documentos';
import { BUSINESS_SECTORS, PAYMENT_METHODS } from '@/lib/constants';
import { FirstStepsModal, FirstStepsData } from '@/components/onboarding/FirstStepsModal';
import { VerifactuStatus } from '@/components/verifactu/VerifactuStatus';
import AvisosTendencias from '@/components/dashboard/AvisosTendencias';
import PanelAnalisis from '@/components/dashboard/PanelAnalisis';
import { evaluatePlanLimit } from '@/lib/planLimits';
import { colocar, fichasVisibles, type FichaId } from '@/lib/panel';
import {
  abiertos, albaranesSinFacturar, bajoMinimos, borradores, cobradoMes, gastosMes, impuestosTrimestre, lotesCaducando,
  margenMes, obrasAbiertas, ordenesAtrasadas, paradoEnAlmacen, type Pendiente,
} from '@/lib/panelDatos';
import FichaLista from '@/components/dashboard/FichaLista';

/** Lo que cada ficha necesita leer además de facturas, clientes y productos. */
interface Extras {
  documentos: Invoice[];
  albaranes: Albaran[];
  gastos: Gasto[];
  obras: Obra[];
  ordenes: OrdenTrabajo[];
  lotes: Lote[];
}
const SIN_EXTRAS: Extras = { documentos: [], albaranes: [], gastos: [], obras: [], ordenes: [], lotes: [] };

const hoyIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dias = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`;
const filasPendientes = (lista: Pendiente[], conImporte = true) => lista.map(p => ({
  key: p.id, principal: `${p.numero} · ${p.quien}`, detalle: `hace ${dias(p.dias)}`,
  valor: conImporte && p.importe ? formatCurrency(p.importe) : undefined, href: p.href,
}));

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
  const [extras, setExtras] = useState<Extras>(SIN_EXTRAS);

  useEffect(() => {
    const loadData = async () => {
      const [invs, cls, stg, prods, obStatus] = await Promise.all([
        getInvoices(),
        getClients(),
        getCompanySettings(),
        getProducts(),
        getOnboardingStatus(),
      ]);
      // Sólo se lee lo que alguna ficha puesta necesita.
      const puestas = new Set(fichasVisibles(stg?.panel, stg?.modulos).map(f => f.id));
      const si = <T,>(ids: FichaId[], leer: () => Promise<T[]>) =>
        (ids.some(id => puestas.has(id)) ? leer().catch(() => [] as T[]) : Promise.resolve([] as T[]));
      const [albaranes, gastos, obras, ordenes, lotes] = await Promise.all([
        si(['albaranes_sin_facturar'], getAlbaranes),
        si(['gastos_mes'], getGastos),
        si(['obras_abiertas'], getObras),
        si(['ordenes_atrasadas'], getOrdenesTrabajo),
        si(['lotes_caducando'], getLotes),
      ]);
      setExtras({ documentos: invs, albaranes, gastos, obras, ordenes, lotes });
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

  const sectorInfo = BUSINESS_SECTORS.find(s => s.value === settings?.sector) || BUSINESS_SECTORS[0];

  /**
   * Qué fichas ha dejado puestas esta empresa, y en qué orden.
   *
   * Manda lo guardado en Ajustes: qué fichas, en qué orden (ver `colocar`
   * para cómo se reparten en pantalla) y sólo las de módulos encendidos.
   */
  const visibles = fichasVisibles(settings?.panel, settings?.modulos);
  const { cifras, bloques } = colocar(visibles);
  const hoy = hoyIso();

  if (!mounted) {
    return <PageSkeleton variant="dashboard" label="Cargando el panel" />;
  }

  /** Cifra suelta de la fila de arriba. */
  const cifra = (icono: ReactNode, valor: string, etiqueta: string, peligro = false, extra?: ReactNode) => (
    <div className="kpi-card" style={peligro ? { '--kpi-icon': 'var(--color-danger)' } as React.CSSProperties : undefined}>
      <div className="kpi-card-header">
        <div className="kpi-card-icon">{icono}</div>
        {extra}
      </div>
      <div className="kpi-card-value">{valor}</div>
      <div className="kpi-card-label">{etiqueta}</div>
    </div>
  );

  /** Cada ficha del catálogo, pintada. */
  const tarjeta = (id: FichaId): ReactNode => {
    switch (id) {
      // --- Cifras ---
      case 'facturado_mes':
        return cifra(<Euro size={20} />, formatCurrency(kpis.monthTotal), `Vendido este mes · ${kpis.monthInvoices} facturas`, false,
          kpis.monthChange !== 0 && (
            <div className={`kpi-card-change ${kpis.monthChange >= 0 ? 'positive' : 'negative'}`}>
              {kpis.monthChange >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {Math.abs(kpis.monthChange).toFixed(1).replace('.', ',')} %
            </div>
          ));
      case 'pendiente_cobro':
        return cifra(<Clock size={20} />, formatCurrency(kpis.pendingTotal), `Por cobrar · ${kpis.pendingCount} facturas`);
      case 'vencido':
        return cifra(<AlertTriangle size={20} />, formatCurrency(kpis.overdueTotal), `Vencido · ${kpis.overdueCount} facturas`, kpis.overdueCount > 0);
      case 'cobrado_mes':
        return cifra(<Wallet size={20} />, formatCurrency(cobradoMes(invoices, hoy)), 'Cobrado este mes');
      case 'margen_mes': {
        const m = margenMes(invoices, products, hoy);
        if (m.porcentaje == null && m.lineasSinCoste) {
          return cifra(<Percent size={20} />, '—', 'Margen del mes · faltan los costes de compra de los artículos');
        }
        return cifra(<Percent size={20} />, formatCurrency(m.margen),
          `Margen del mes${m.porcentaje != null ? ` · ${String(m.porcentaje).replace('.', ',')} %` : ''}${m.lineasSinCoste ? ` · ${m.lineasSinCoste} líneas sin coste` : ''}`,
          m.margen < 0);
      }
      case 'borradores': {
        const b = borradores(extras.documentos, hoy);
        return (
          <Link href="/facturas" className="panel-cifra-enlace">
            {cifra(<FilePen size={20} />, String(b.lista.length), b.lista.length ? `Borradores sin emitir · ${formatCurrency(b.total)}` : 'Borradores sin emitir')}
          </Link>
        );
      }
      case 'gastos_mes': {
        const g = gastosMes(extras.gastos, hoy);
        return cifra(<Receipt size={20} />, formatCurrency(g.total), `Gastos del mes · ${g.numero} ${g.numero === 1 ? 'gasto' : 'gastos'}`);
      }

      // --- Grandes ---
      case 'estado_verifactu':
        return <VerifactuStatus />;
      case 'analisis_negocio':
        return <PanelAnalisis invoices={invoices} products={products} />;

      // --- Gráficas ---
      case 'evolucion_ventas':
        return (
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
        );
      case 'reparto_estado':
        return (
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
            legend={<ChartLegend items={statusData.map(s => ({ name: s.name, value: String(s.value), color: s.color }))} />}
          >
            <StatusDonut data={statusData} centerValue={String(statusData.reduce((sum, s) => sum + s.value, 0))} centerLabel="facturas" />
          </ChartCard>
        );
      case 'facturado_cobrado':
        return (
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
        );
      case 'formas_pago':
        return (
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
        );
      case 'clientes_top':
        return (
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
        );
      case 'productos_top':
        return (
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
        );
      case 'reparto_impuestos': {
        const t = impuestosTrimestre(invoices, hoy);
        const imp = settings?.igicEnabled ? 'IGIC' : 'IVA';
        return (
          <FichaLista
            titulo="Desglose de impuestos"
            subtitulo={`${t.trimestre}.º trimestre: bases y ${imp} repercutido por tipo`}
            href="/listados-fiscales"
            enlace="Modelos"
            vacio="Todavía no hay facturas emitidas este trimestre."
            filas={t.tipos.map(x => ({
              key: String(x.tipo), principal: `${String(x.tipo).replace('.', ',')} %`,
              detalle: `Base ${formatCurrency(x.base)}`, valor: formatCurrency(x.cuota),
            }))}
          />
        );
      }

      // --- Listas ---
      case 'ultimas_facturas':
        return (
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
                        <Link href={`/facturas/${inv.id}`} className="btn btn-ghost btn-icon btn-sm" aria-label={`Ver la factura ${inv.number}`}>
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
        );
      case 'proximos_vencimientos':
        return (
          <FichaLista
            titulo="Próximos cobros"
            subtitulo="Ordenados por lo que queda para vencer"
            href="/recordatorios"
            enlace="Recordatorios"
            vacio="No hay facturas pendientes de vencer."
            filas={upcomingDue.map(inv => ({
              key: inv.id, principal: inv.number, detalle: inv.clientName, href: `/facturas/${inv.id}`,
              valor: inv.daysLeft < 0 ? `Vencida hace ${dias(-inv.daysLeft)}` : inv.daysLeft === 0 ? 'Vence hoy' : `Vence en ${dias(inv.daysLeft)}`,
              tono: inv.daysLeft <= 0 ? 'peligro' as const : inv.daysLeft <= 7 ? 'aviso' as const : undefined,
            }))}
          />
        );
      case 'albaranes_sin_facturar':
        return <FichaLista titulo="Albaranes sin facturar" subtitulo="Entregado y todavía sin factura" href="/albaranes" vacio="Todos los albaranes expedidos están facturados." filas={filasPendientes(albaranesSinFacturar(extras.albaranes, hoy))} />;
      case 'presupuestos_abiertos':
        return <FichaLista titulo="Presupuestos abiertos" subtitulo="Enviados y sin respuesta" href="/documentos" vacio="No hay presupuestos esperando respuesta." filas={filasPendientes(abiertos(extras.documentos, 'presupuesto', 'venta', hoy))} />;
      case 'pedidos_pendientes':
        return <FichaLista titulo="Pedidos por servir" subtitulo="Comprometido con el cliente y sin entregar" href="/documentos" vacio="No hay pedidos de clientes por servir." filas={filasPendientes(abiertos(extras.documentos, 'pedido', 'venta', hoy))} />;
      case 'compras_pendientes':
        return <FichaLista titulo="Pendiente de recibir" subtitulo="Pedido a proveedores y aún no llegado" href="/documentos" vacio="No hay pedidos a proveedores pendientes." filas={filasPendientes(abiertos(extras.documentos, 'pedido', 'compra', hoy))} />;
      case 'stock_bajo':
        return (
          <FichaLista titulo="Bajo mínimos" subtitulo="Artículos por debajo de su mínimo" href="/productos" vacio="Ningún artículo está por debajo de su mínimo."
            filas={bajoMinimos(products).map(a => ({ key: a.id, principal: a.nombre, detalle: a.detalle, valor: `${a.stock} ud.`, tono: a.stock <= 0 ? 'peligro' as const : 'aviso' as const, href: `/productos` }))} />
        );
      case 'sin_movimiento':
        return (
          <FichaLista titulo="Parado en almacén" subtitulo="Con existencias y sin venderse en 90 días" href="/productos" vacio="Todo lo que hay en almacén se ha vendido en los últimos 90 días."
            filas={paradoEnAlmacen(products, invoices, hoy).map(a => ({ key: a.id, principal: a.nombre, detalle: `${a.stock} ud. · ${a.detalle}`, valor: a.valor != null ? formatCurrency(a.valor) : undefined }))} />
        );
      case 'lotes_caducando':
        return (
          <FichaLista titulo="Lotes por caducar" subtitulo="En los próximos siete días, con existencias" href="/lotes" vacio="Ningún lote con existencias caduca esta semana."
            filas={lotesCaducando(extras.lotes, hoy).map(a => ({ key: a.id, principal: a.nombre, detalle: `${a.stock} ud.`, valor: a.detalle, tono: a.detalle.startsWith('caducado') ? 'peligro' as const : 'aviso' as const }))} />
        );
      case 'obras_abiertas':
        return <FichaLista titulo="Obras abiertas" subtitulo="Proyectos en marcha" href="/obras" vacio="No hay obras abiertas." filas={filasPendientes(obrasAbiertas(extras.obras, hoy))} />;
      case 'ordenes_atrasadas':
        return <FichaLista titulo="Órdenes atrasadas" subtitulo="Más de una semana sin cerrarse" href="/ordenes-trabajo" vacio="No hay órdenes de trabajo atrasadas." filas={filasPendientes(ordenesAtrasadas(extras.ordenes, hoy), false)} />;
      default: {
        // Si se añade una ficha al catálogo sin su dibujo, esto no compila:
        // el editor de Ajustes no puede volver a ofrecer fichas que no salen.
        const sinDibujo: never = id;
        return sinDibujo;
      }
    }
  };

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

      {/* Las cifras de arriba, en el orden elegido. Clientes y catálogo no
          son fichas: son el recuento de la cartera y van siempre al final. */}
      <div className="kpi-grid">
        {cifras.map(id => <Fragment key={id}>{tarjeta(id)}</Fragment>)}
        <div className="kpi-card">
          <div className="kpi-card-header">
            <div className="kpi-card-icon"><Users size={20} /></div>
          </div>
          <div className="kpi-card-value">{kpis.activeClients}</div>
          <div className="kpi-card-label">Clientes activos</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-header">
            <div className="kpi-card-icon"><Package size={20} /></div>
          </div>
          <div className="kpi-card-value">{kpis.totalProducts}</div>
          <div className="kpi-card-label">Productos en catálogo · {kpis.activeProducts} activos</div>
        </div>
      </div>

      {/* El resto, en el orden elegido: las grandes a todo el ancho y las
          medianas en dos columnas por turnos (ver `colocar`). */}
      {bloques.map((b, i) => (b.tipo === 'grande' ? (
        <div key={b.id} className="panel-bloque">{tarjeta(b.id)}</div>
      ) : b.derecha.length === 0 ? (
        // Una mediana sola entre dos grandes: a todo el ancho, sin media fila vacía.
        <div key={`p${i}`} className="panel-bloque">{tarjeta(b.izquierda[0])}</div>
      ) : (
        // En el móvil las dos columnas se deshacen (`display: contents`) y
        // `order` devuelve cada tarjeta a su puesto: 1, 2, 3… y no 1, 3, 5, 2, 4.
        <div key={`p${i}`} className="charts-grid charts-grid--even panel-bloque panel-pareja">
          <div className="stack">{b.izquierda.map((id, k) => <div key={id} style={{ order: 2 * k }}>{tarjeta(id)}</div>)}</div>
          <div className="stack">{b.derecha.map((id, k) => <div key={id} style={{ order: 2 * k + 1 }}>{tarjeta(id)}</div>)}</div>
        </div>
      )))}

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
