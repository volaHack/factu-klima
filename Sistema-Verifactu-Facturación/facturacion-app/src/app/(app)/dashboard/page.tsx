'use client';

import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { apartarParaHacienda, presentacionPendiente } from '@/lib/fiscal/apartarHacienda';
import { useRevisarAlVolver } from '@/hooks/useRevisarAlVolver';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ArrowRight, Eye, Plus, FileText } from 'lucide-react';
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
import { evaluatePlanLimit } from '@/lib/planLimits';
import { colocar, fichasVisibles, type FichaId } from '@/lib/panel';
import {
  abiertos, albaranesSinFacturar, bajoMinimos, borradores, cobradoMes, gastosMes, impuestosTrimestre, lotesCaducando,
  margenMes, obrasAbiertas, ordenesAtrasadas, paradoEnAlmacen, type Pendiente,
} from '@/lib/panelDatos';
import FichaLista from '@/components/dashboard/FichaLista';
import CabeceraPanel from '@/components/dashboard/CabeceraPanel';
import EstadoCuentas, { type CifraPanel } from '@/components/dashboard/EstadoCuentas';
import AccesosPanel from '@/components/dashboard/AccesosPanel';
import { modulosDe } from '@/lib/modulos';
import ParaHoy from '@/components/dashboard/ParaHoy';
import AvisoPlan from '@/components/dashboard/AvisoPlan';
import ResumenPorCorreo from '@/components/dashboard/ResumenPorCorreo';
import { comparativaMes, plural, tareasDeHoy, type EntradaHoy, type TareaHoy } from '@/lib/panelHoy';
import { avisoRegimen } from '@/lib/regimenFiscal';
import { getFacturasElectronicas } from '@/lib/facturaElectronica/almacen';
import type { FeResumen } from '@/lib/facturaElectronica/estados';
import DeudoresHoy from '@/components/dashboard/DeudoresHoy';
import ClientesFrios from '@/components/dashboard/ClientesFrios';
import ObjetivoMes from '@/components/dashboard/ObjetivoMes';
import { deudoresDe } from '@/lib/reclamar';
import { clientesFrios } from '@/lib/clientesFrios';
import { objetivoPropuesto } from '@/lib/objetivoMes';

/** Lo que cada ficha necesita leer además de facturas, clientes y productos. */
interface Extras {
  documentos: Invoice[];
  albaranes: Albaran[];
  gastos: Gasto[];
  obras: Obra[];
  ordenes: OrdenTrabajo[];
  lotes: Lote[];
  /** Facturas electrónicas recibidas, para «Para hoy». */
  fe: FeResumen[];
  /** Bancos conectados, para avisar del permiso y de lo que falta conciliar. */
  banco: EntradaHoy['banco'];
}
const SIN_EXTRAS: Extras = { documentos: [], albaranes: [], gastos: [], obras: [], ordenes: [], lotes: [], fe: [], banco: null };

/** Lo justo de `/api/banco` para «Para hoy»; sin banco conectado (o sin servicio), nada. */
async function leerBanco(): Promise<EntradaHoy['banco']> {
  try {
    const r = await fetch('/api/banco', { cache: 'no-store' });
    if (!r.ok) return null;
    const d = await r.json() as { disponible?: boolean; conexiones?: { banco: string; caducada: boolean; diasParaCaducar: number | null }[]; sinConciliar?: number };
    if (!d.disponible || !d.conexiones?.length) return null;
    return {
      conexiones: d.conexiones.map(c => ({ banco: c.banco, caducada: c.caducada, diasParaCaducar: c.diasParaCaducar })),
      sinConciliar: d.sinConciliar ?? 0,
    };
  } catch {
    return null;
  }
}

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

// El análisis trae siete gráficas de Nivo más: se carga aparte, cuando el
// panel ya está pintado, para que la primera vista no espere por ellas.
const PanelAnalisis = dynamic(() => import('@/components/dashboard/PanelAnalisis'), {
  ssr: false,
  loading: () => <div className="analisis analisis--cargando" aria-busy="true" />,
});

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
      const [albaranes, gastos, obras, ordenes, lotes, fe, banco] = await Promise.all([
        si(['albaranes_sin_facturar'], getAlbaranes),
        // Los gastos van siempre: «Para hoy» calcula con ellos el IVA del trimestre a presentar.
        getGastos().catch(() => [] as Gasto[]),
        si(['obras_abiertas'], getObras),
        si(['ordenes_atrasadas'], getOrdenesTrabajo),
        si(['lotes_caducando'], getLotes),
        getFacturasElectronicas('recibida').catch(() => []),
        leerBanco(),
      ]);
      setExtras({
        documentos: invs, albaranes, gastos, obras, ordenes, lotes, banco,
        fe: fe.map(f => ({ id: f.id, sentido: f.sentido, estado: f.estado, numero: f.numero, nombreEmisor: f.nombreEmisor, total: f.total, fecha: f.fecha, vencimiento: f.vencimiento })),
      });
      setInvoices(invs.filter(isFactura));
      setClients(cls);
      setSettings(stg);
      setProducts(prods);
      setShowOnboarding(!obStatus.isComplete);
      setOnboardingChecked(true);
      setMounted(true);
    };
    loadData();
    // Una factura o un cliente nuevo (aquí o en otro equipo) cambian las cifras: se repinta solo.
    const alCambiar = () => { void loadData(); };
    const avisos = ['klima-invoices-updated', 'klima-clients-updated', 'klima-products-updated'];
    avisos.forEach(a => window.addEventListener(a, alCambiar));
    return () => avisos.forEach(a => window.removeEventListener(a, alCambiar));
  }, []);

  useRevisarAlVolver(['invoices', 'clients', 'products'], 60_000);

  // KPI calculations
  const kpis = useMemo(() => {
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

  // El asesor: a quién reclamar hoy, quién ha dejado de pedir y qué meta
  // proponer. Todo sale de los documentos que ya se han leído.
  const fichas = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients]);
  const deudores = useMemo(() => deudoresDe(invoices, hoyIso()), [invoices]);
  const frios = useMemo(() => clientesFrios(extras.documentos, clients, hoyIso()), [extras.documentos, clients]);
  const propuesto = useMemo(() => objetivoPropuesto(invoices, hoyIso()), [invoices]);

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
  const mes = comparativaMes(invoices, hoy);
  const tareasDelDia = tareasDeHoy({
    documentos: extras.documentos,
    fe: extras.fe,
    presentacion: presentacionPendiente(
      { facturas: invoices, gastos: extras.gastos, nif: settings?.nif, igic: settings?.igicEnabled },
      new Date(`${hoy}T12:00:00`),
    ),
    igic: settings?.igicEnabled,
    banco: extras.banco,
    hoy,
  });
  // Un régimen (IVA/IGIC) que no cuadra con la dirección de la empresa sale
  // en cada factura: va detrás de lo urgente y delante de lo demás.
  const regimen = avisoRegimen(settings);
  const tareas: TareaHoy[] = regimen ? (() => {
    const tarea: TareaHoy = { id: 'regimen', tono: 'aviso', titulo: regimen.titulo, detalle: regimen.texto, href: '/ajustes#regimen-fiscal', accion: 'Revisar' };
    const i = tareasDelDia.findIndex(t => t.tono !== 'peligro');
    return i < 0 ? [...tareasDelDia, tarea] : [...tareasDelDia.slice(0, i), tarea, ...tareasDelDia.slice(i)];
  })() : tareasDelDia;

  const planCheck = evaluatePlanLimit(settings, invoices);
  const remitente = { nombre: settings?.tradeName || settings?.businessName || '', email: settings?.email, telefono: settings?.phone, iban: settings?.iban };

  if (!mounted) {
    return <PageSkeleton variant="dashboard" label="Cargando el panel" />;
  }

  /** Cada cifra suelta de arriba, como dato: la pinta `EstadoCuentas`. */
  const datoCifra = (id: FichaId): CifraPanel | null => {
    const facturas = (n: number) => plural(n, 'factura', 'facturas');
    switch (id) {
      case 'facturado_mes': {
        const nombreMes = new Date(`${hoy}T12:00:00`).toLocaleDateString('es-ES', { month: 'long' });
        return {
          id, etiqueta: `Facturado en ${nombreMes}`, valor: formatCurrency(mes.total),
          detalle: facturas(mes.facturas),
          // Los doce meses de «Evolución de facturación»: la línea y la gráfica cuadran.
          serie: monthlyData.map(m => m.total),
          cambio: mes.variacion != null && mes.variacion !== 0 ? {
            porcentaje: mes.variacion,
            texto: `frente al 1–${mes.hastaDia} del mes pasado`,
            titulo: `Del 1 al ${mes.hastaDia} del mes pasado se facturaron ${formatCurrency(mes.anterior)}`,
          } : undefined,
        };
      }
      case 'pendiente_cobro':
        return { id, etiqueta: 'Por cobrar', valor: formatCurrency(kpis.pendingTotal), detalle: facturas(kpis.pendingCount), href: '/tesoreria?tab=vencimientos' };
      case 'vencido':
        return {
          id, etiqueta: 'Vencido sin cobrar', valor: formatCurrency(kpis.overdueTotal),
          detalle: kpis.overdueCount ? facturas(kpis.overdueCount) : 'Nada fuera de plazo',
          tono: kpis.overdueCount > 0 ? 'peligro' : undefined, href: '/recordatorios',
        };
      case 'cobrado_mes':
        return {
          id, etiqueta: 'Cobrado este mes', valor: formatCurrency(cobradoMes(invoices, hoy)), detalle: 'Lo que ha entrado de verdad',
          serie: facturadoCobrado.map(m => m.series2),
        };
      case 'margen_mes': {
        const m = margenMes(invoices, products, hoy);
        if (m.porcentaje == null && m.lineasSinCoste) {
          return { id, etiqueta: 'Margen del mes', valor: '—', detalle: 'Faltan los costes de compra de los artículos' };
        }
        return {
          id, etiqueta: 'Margen del mes', valor: formatCurrency(m.margen),
          detalle: [m.porcentaje != null ? `${String(m.porcentaje).replace('.', ',')} % sobre ventas` : '', m.lineasSinCoste ? `${m.lineasSinCoste} líneas sin coste` : ''].filter(Boolean).join(' · ') || undefined,
          tono: m.margen < 0 ? 'peligro' : undefined,
        };
      }
      case 'borradores': {
        const b = borradores(extras.documentos, hoy);
        return {
          id, etiqueta: 'Borradores sin emitir', valor: String(b.lista.length),
          detalle: b.lista.length ? `${formatCurrency(b.total)} sin facturar` : 'Ninguno a medias', href: '/facturas',
        };
      }
      case 'gastos_mes': {
        const g = gastosMes(extras.gastos, hoy);
        return { id, etiqueta: 'Gastos del mes', valor: formatCurrency(g.total), detalle: `${g.numero} ${g.numero === 1 ? 'gasto' : 'gastos'}`, href: '/gastos' };
      }
      default:
        return null;
    }
  };

  /** Cada ficha del catálogo, pintada. */
  const tarjeta = (id: FichaId): ReactNode => {
    switch (id) {
      // --- Cifras: van juntas en el estado de cuentas (`datoCifra`) ---
      case 'facturado_mes':
      case 'pendiente_cobro':
      case 'vencido':
      case 'cobrado_mes':
      case 'margen_mes':
      case 'borradores':
      case 'gastos_mes':
        return null;

      // --- Grandes ---
      case 'estado_verifactu':
        // Va en la columna de la derecha, junto a los atajos (ver abajo).
        return null;
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
      case 'hacienda_trimestre': {
        const h = apartarParaHacienda({ facturas: invoices, gastos: extras.gastos, nif: settings?.nif, igic: settings?.igicEnabled }, new Date(`${hoy}T12:00:00`));
        const plazo = new Date(`${h.plazo}T00:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
        const cerca = h.diasParaPlazo <= 10;
        return (
          <FichaLista
            titulo="Para Hacienda este trimestre"
            subtitulo={`${h.trimestre}.º trimestre · hasta el ${plazo} (${h.diasParaPlazo === 1 ? 'queda 1 día' : `quedan ${h.diasParaPlazo} días`}). Estimación con lo apuntado hasta hoy.`}
            href="/listados-fiscales"
            enlace="Modelos"
            vacio="Sin datos del trimestre todavía."
            filas={[
              ...h.conceptos.map(c => ({
                key: c.modelo,
                principal: `${c.nombre} · modelo ${c.modelo}`,
                detalle: c.importe >= 0 ? 'A pagar' : 'Sale a tu favor: a compensar o devolver',
                valor: formatCurrency(c.importe),
                href: `/listados-fiscales/${c.modelo}`,
              })),
              { key: 'total', principal: 'Apártalo ya', detalle: 'No es tuyo aunque esté en tu cuenta', valor: formatCurrency(h.total), tono: cerca && h.total > 0 ? 'aviso' as const : undefined },
            ]}
          />
        );
      }
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
            {/* En el móvil, una lista: la tabla escondía estado y total
                fuera de la pantalla. */}
            {recentInvoices.length > 0 && (
              <ul className="ultimas-movil">
                {recentInvoices.map(inv => (
                  <li key={inv.id}>
                    <Link href={`/facturas/${inv.id}`} className="ultimas-movil-fila">
                      <span className="ultimas-movil-arriba">
                        <span className="mono primary">{inv.number}</span>
                        <span className={`badge badge-${inv.status}`}>
                          <span className="badge-dot" />
                          {getStatusInfo(inv.status).label}
                        </span>
                      </span>
                      <span className="ultimas-movil-cliente">{inv.clientName}</span>
                      <span className="ultimas-movil-abajo">
                        <span>{formatDate(inv.issueDate)}</span>
                        <strong className="amount">{formatCurrency(inv.total)}</strong>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div className={`table-container${recentInvoices.length > 0 ? ' ultimas-tabla' : ''}`} style={{ border: 'none' }}>
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

  // La conexión con la AEAT va en la columna de los atajos, no a todo el
  // ancho: es un estado que se consulta, no lo primero que hay que leer.
  const conAeat = visibles.some(f => f.id === 'estado_verifactu');
  const bloquesCentro = bloques.filter(b => !(b.tipo === 'grande' && b.id === 'estado_verifactu'));

  return (
    <div className="panel animate-fade-in">
      <CabeceraPanel
        nombre={settings?.tradeName || settings?.businessName || 'Tu negocio'}
        sector={sectorInfo}
        fecha={new Date(`${hoy}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
        siguiente={`${settings?.invoiceSeries ?? 'FAC'}-${hoy.slice(0, 4)}-${String(settings?.nextInvoiceNumber ?? 1).padStart(4, '0')}`}
        plan={planCheck.planName}
        sellado={!!settings?.verifactuEnabled}
      />

      <AvisoPlan
        plan={planCheck.planName}
        inactiva={settings?.subscriptionStatus === 'inactive' || settings?.subscriptionStatus === 'canceled'}
        usadas={planCheck.currentCount}
        limite={planCheck.limit}
      />

      {/* Dos columnas: el trabajo a la izquierda y, a la derecha, los atajos,
          que se quedan a mano mientras se baja por el panel. En pantallas
          estrechas los atajos van justo después de «Para hoy». */}
      <div className="panel-cuerpo">
        {/* 1. ¿Cómo va mi negocio? Las cifras elegidas, en su orden. */}
        <EstadoCuentas cifras={cifras.map(datoCifra).filter((c): c is CifraPanel => c !== null)} />

        {/* 2. ¿Qué requiere mi atención? */}
        <ParaHoy
          tareas={tareas}
          sinDocumentos={extras.documentos.length === 0}
          debajo={{ vencidas: <DeudoresHoy deudores={deudores} clientes={fichas} remitente={remitente} /> }}
        />

        {/* 3. ¿Qué puedo hacer ahora? */}
        <AccesosPanel
          modulos={modulosDe(settings)}
          clientesActivos={kpis.activeClients}
          productos={kpis.totalProducts}
          productosActivos={kpis.activeProducts}
          estadoAeat={conAeat ? <VerifactuStatus /> : undefined}
        />

        {/* 4. ¿Llego a fin de mes, y a quién no he vuelto a ver? */}
        <div className="asesor-pareja">
          <ObjetivoMes facturado={mes.total} propuesto={propuesto} hoy={hoy} />
          <ClientesFrios frios={frios} clientes={fichas} remitente={remitente.nombre} />
        </div>

        {/* El resto, en el orden elegido: las grandes a todo el ancho de la
            columna y las medianas en dos por turnos (ver `colocar`). */}
        {bloquesCentro.map((b, i) => (b.tipo === 'grande' ? (
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

        {/* Avisos y tendencias: calculados aquí con facturas y stock */}
        <AvisosTendencias products={products} invoices={invoices} />

        {/* El resumen del mes por correo: ahora o cada día 1 */}
        <ResumenPorCorreo />
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
