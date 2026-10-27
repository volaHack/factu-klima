'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRevisarAlVolver } from '@/hooks/useRevisarAlVolver';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import {
  Plus, Search, Filter, ChevronUp, ChevronDown, X, FileText, SearchX,
  Eye, Edit, Copy, Trash2, MoreHorizontal, CheckCircle, Download, Store, BarChart3,
  AlertTriangle, RefreshCw,
  Repeat,
} from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import TableEmpty from '@/components/ui/TableEmpty';
import ChartCard from '@/components/charts/ChartCard';
import { ComparisonBarChart, StatusDonut, ChartLegend } from '@/components/charts/Charts';
import { INVOICE_STATUS_COLOR, SERIES, useColoresGrafica } from '@/components/charts/theme';
import { getInvoices, saveInvoice, deleteInvoice as removeInvoice, isSealed, getCompanySettings } from '@/lib/storage';
import { Invoice, InvoiceStatus } from '@/lib/types';
import { formatCurrency, formatDate, generateId, getStatusInfo, getShortMonthName } from '@/lib/utils';
import { isFactura } from '@/lib/documentos';
import { isTpvEnabled } from '@/lib/constants';
import { esTicketTpv, estadosParaFiltrar, mostrarPestanaTickets } from '@/lib/filtroFacturas';
import { useToast } from '@/hooks/useToast';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import DeleteInvoiceModal from '@/components/facturas/DeleteInvoiceModal';
import AvisoHistorial from '@/components/documentos/AvisoHistorial';
import { casaTexto } from '@/lib/casaTexto';
import { usePaginacion } from '@/hooks/usePaginacion';
import Paginacion from '@/components/ui/Paginacion';

import CifraQueCuenta from '@/components/ui/CifraQueCuenta';
type SortField = 'number' | 'clientName' | 'issueDate' | 'dueDate' | 'total' | 'status';

export default function FacturasPage() {
  // El mismo acento con el que se pintan las barras: el de la empresa.
  const { accent: acentoGrafica } = useColoresGrafica();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [deleteTargetInvoice, setDeleteTargetInvoice] = useState<Invoice | null>(null);
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus[]>([]);
  const [docTypeFilter, setDocTypeFilter] = useState<'all' | 'facturas' | 'tickets'>('all');
  const [sortField, setSortField] = useState<SortField>('issueDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [actionMenuPos, setActionMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tpvActivo, setTpvActivo] = useState(false);
  const { success, error: toastError } = useToast();
  const { rejections } = useOnlineStatus();

  // Facturas que el servidor rechazó de forma definitiva: se marcan en el
  // listado con un aviso discreto en lugar de una barra global.
  const rechazadas = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rejections) {
      if (r.table === 'invoices' && r.id) map.set(r.id, r.reason);
    }
    return map;
  }, [rejections]);

  const comparisonData = useMemo(() => {
    const now = new Date();
    const data = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const m = d.getMonth();
      const y = d.getFullYear();

      const ordinarias = invoices.filter(inv => {
        const id = new Date(inv.issueDate);
        return !esTicketTpv(inv) && id.getMonth() === m && id.getFullYear() === y && inv.status !== InvoiceStatus.ANULADA;
      }).reduce((sum, inv) => sum + inv.total, 0);

      const tickets = invoices.filter(inv => {
        const id = new Date(inv.issueDate);
        return esTicketTpv(inv) && id.getMonth() === m && id.getFullYear() === y && inv.status !== InvoiceStatus.ANULADA;
      }).reduce((sum, inv) => sum + inv.total, 0);

      data.push({
        name: getShortMonthName(m),
        series1: Number(ordinarias.toFixed(2)),
        series2: Number(tickets.toFixed(2))
      });
    }
    return data;
  }, [invoices]);

  const statusDistributionData = useMemo(() => {
    const buckets = [
      { name: 'Pagadas', status: InvoiceStatus.PAGADA },
      { name: 'Pendientes', status: InvoiceStatus.PENDIENTE },
      { name: 'Emitidas', status: InvoiceStatus.EMITIDA },
      { name: 'Vencidas', status: InvoiceStatus.VENCIDA },
      { name: 'Borradores', status: InvoiceStatus.BORRADOR },
    ];
    return buckets.map(b => ({
      name: b.name,
      value: invoices.filter(i => i.status === b.status).length,
      color: INVOICE_STATUS_COLOR[b.status] || '#64748b'
    })).filter(s => s.value > 0);
  }, [invoices]);

  useEffect(() => {
    const load = async () => {
      const all = await getInvoices();
      setInvoices(all.filter(isFactura));
      setMounted(true);
    };
    load();

    // Sólo hace falta saber si el TPV está encendido, para decidir si se
    // enseña la pestaña de tickets. Si no se puede leer, se queda apagado:
    // la pestaña sigue saliendo en cuanto haya algún ticket.
    getCompanySettings().then(s => setTpvActivo(isTpvEnabled(s))).catch(() => {});

    const handleAutoRefresh = () => {
      load();
    };
    window.addEventListener('klima-invoices-updated', handleAutoRefresh);
    return () => {
      window.removeEventListener('klima-invoices-updated', handleAutoRefresh);
    };
  }, []);

  // Lo que cambia fuera de esta pestaña (el TPV en otro equipo, las
  // recurrentes que se emiten solas, el estado de cobro): si hay cambios,
  // llega el aviso de arriba y la lista se repinta.
  useRevisarAlVolver(['invoices']);

  // El menú de fila se quedaba abierto hasta volver a pulsar su propio
  // botón: al hacer clic en cualquier otro sitio seguía flotando sobre
  // la tabla. Escape también lo cierra, que es lo que espera cualquiera
  // que navegue con teclado.
  useEffect(() => {
    if (!actionMenuId) return;
    const close = () => setActionMenuId(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKey);
    // El menú se renderiza en un portal posicionado en las coordenadas del
    // botón en el momento de abrirse; si la tabla (o la página) se
    // desplaza sin esto, el menú se queda flotando lejos de su fila.
    // capture:true porque 'scroll' no burbujea, así que hay que
    // interceptarlo en la fase de captura para detectar el scroll del
    // contenedor de la tabla, no solo el de window.
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
    };
  }, [actionMenuId]);

  const reload = async () => {
    setRefreshing(true);
    const all = await getInvoices();
    setInvoices(all.filter(isFactura));
    setTimeout(() => setRefreshing(false), 400);
  };

  // Filter + Sort
  const filtered = useMemo(() => {
    // Filtrado de seguridad: solo facturas auténticas en la pantalla de Facturas
    let result = invoices.filter(isFactura);

    if (search) {
      // Número, cliente, NIF, importe, fecha o un artículo de las líneas.
      result = result.filter(inv => casaTexto(search,
        inv.number, inv.clientName, inv.clientNif, inv.issueDate, inv.total, String(inv.total).replace('.', ','), inv.notes,
        ...inv.lineItems.map(l => `${l.productName} ${l.productRef}`),
      ));
    }

    if (docTypeFilter === 'facturas') {
      result = result.filter(inv => !esTicketTpv(inv));
    } else if (docTypeFilter === 'tickets') {
      result = result.filter(inv => esTicketTpv(inv));
    }

    if (statusFilter.length > 0) {
      result = result.filter(inv => statusFilter.includes(inv.status));
    }

    result.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'total') {
        cmp = Number(a.total || 0) - Number(b.total || 0);
      } else if (sortField === 'issueDate' || sortField === 'dueDate') {
        const timeA = a[sortField] ? new Date(a[sortField]).getTime() : 0;
        const timeB = b[sortField] ? new Date(b[sortField]).getTime() : 0;
        cmp = timeA - timeB;
      } else if (sortField === 'number') {
        cmp = (a.number || '').localeCompare(b.number || '', undefined, { numeric: true, sensitivity: 'base' });
      } else if (sortField === 'clientName') {
        cmp = (a.clientName || '').localeCompare(b.clientName || '', 'es', { sensitivity: 'base' });
      } else if (sortField === 'status') {
        cmp = (a.status || '').localeCompare(b.status || '', 'es', { sensitivity: 'base' });
      } else {
        const aVal = String(a[sortField] ?? '');
        const bVal = String(b[sortField] ?? '');
        cmp = aVal.localeCompare(bVal, 'es', { sensitivity: 'base' });
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return result;
  }, [invoices, search, docTypeFilter, statusFilter, sortField, sortDir]);

  // Por páginas; se vuelve a la primera al cambiar búsqueda, filtros u orden.
  const paginado = usePaginacion(filtered, {
    clave: 'facturas',
    reinicio: [search, docTypeFilter, statusFilter.join(','), sortField, sortDir].join('|'),
  });
  const paginated = paginado.visibles;

  // Cifras de la tira del encabezado. Un listado de facturas sin el
  // dinero pendiente a la vista obliga a sumar de cabeza.
  const counts = useMemo(() => {
    const pending = invoices.filter(i =>
      i.status === InvoiceStatus.PENDIENTE || i.status === InvoiceStatus.EMITIDA
    );
    return {
      pendiente: pending.length,
      pendingTotal: pending.reduce((sum, i) => sum + i.total, 0),
      vencida: invoices.filter(i => i.status === InvoiceStatus.VENCIDA).length,
    };
  }, [invoices]);

  // Cuántas de cada tipo, para las pestañas.
  const numTickets = useMemo(() => invoices.filter(esTicketTpv).length, [invoices]);
  const numOrdinarias = invoices.length - numTickets;
  const conPestanas = mostrarPestanaTickets(numTickets, tpvActivo);

  // Los chips de estado: los de factura y los que tenga alguna cargada.
  const estadosFiltro = useMemo(
    () => estadosParaFiltrar(invoices.map(i => i.status), statusFilter),
    [invoices, statusFilter],
  );

  const hasFilters = search.length > 0 || statusFilter.length > 0 || docTypeFilter !== 'all';
  const clearFilters = () => { setSearch(''); setStatusFilter([]); setDocTypeFilter('all'); };
  // La cifra de vencidas del encabezado también filtra: quien la ve
  // quiere esas facturas, no buscar el chip de «Vencida» más abajo.
  const soloVencidas = statusFilter.length === 1 && statusFilter[0] === InvoiceStatus.VENCIDA;

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      // Por ergonomía: fechas y montos se ordenan de más reciente/mayor a menor por defecto; texto de la A a la Z
      setSortDir(field === 'total' || field === 'issueDate' || field === 'dueDate' ? 'desc' : 'asc');
    }
  };

  const toggleStatus = (status: InvoiceStatus) => {
    setStatusFilter(prev =>
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === paginated.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginated.map(inv => inv.id)));
    }
  };

  const handleMarkPaid = async (id: string) => {
    const inv = invoices.find(i => i.id === id);
    setActionMenuId(null);
    if (!inv) return;

    try {
      await saveInvoice({
        ...inv,
        status: InvoiceStatus.PAGADA,
        paidDate: new Date().toISOString().split('T')[0],
        updatedAt: new Date().toISOString(),
      });
      await reload();
      success('Factura marcada como pagada', inv.number);
    } catch (err) {
      toastError('No se pudo actualizar', err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  const handleDuplicate = async (id: string) => {
    const inv = invoices.find(i => i.id === id);
    setActionMenuId(null);
    if (!inv) return;

    try {
      // La copia nace como borrador y con número provisional: reutilizar
      // el número original crearía un duplicado que el servidor rechaza.
      const newInv: Invoice = {
        ...inv,
        id: generateId(),
        number: `${inv.number}-COPIA`,
        status: InvoiceStatus.BORRADOR,
        paidDate: undefined,
        paidAmount: 0,
        paymentRecordIds: [],
        verifactu: undefined,
        lineItems: (inv.lineItems || []).map(li => ({
          ...li,
          id: generateId(),
        })),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveInvoice(newInv);
      await reload();
      success('Factura duplicada', `Copia en borrador de ${inv.number}`);
    } catch (err) {
      toastError('No se pudo duplicar', err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  const handleDelete = (id: string) => {
    const inv = invoices.find(i => i.id === id);
    setActionMenuId(null);
    if (!inv) return;
    setDeleteTargetInvoice(inv);
  };

  const handleBulkPaid = async () => {
    let updated = 0;
    const failures: string[] = [];

    for (const id of selectedIds) {
      const inv = invoices.find(i => i.id === id);
      if (!inv) continue;
      if (inv.status === InvoiceStatus.PAGADA || inv.status === InvoiceStatus.ANULADA) continue;

      try {
        await saveInvoice({
          ...inv,
          status: InvoiceStatus.PAGADA,
          paidDate: new Date().toISOString().split('T')[0],
          updatedAt: new Date().toISOString(),
        });
        updated += 1;
      } catch {
        failures.push(inv.number);
      }
    }

    await reload();
    setSelectedIds(new Set());

    // Informe honesto: si alguna falla, se dice cuál en vez de cantar
    // un éxito global que no ha ocurrido.
    if (failures.length > 0) {
      toastError(
        `${updated} actualizadas, ${failures.length} rechazadas`,
        `No se pudieron marcar: ${failures.join(', ')}`
      );
    } else {
      success('Facturas actualizadas', `${updated} marcadas como pagadas`);
    }
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    let deleted = 0;
    const failures: string[] = [];

    for (const id of selectedIds) {
      const inv = invoices.find(i => i.id === id);
      if (!inv) continue;
      // No borrar facturas selladas con VeriFactu: son intocables.
      if (isSealed(inv)) {
        failures.push(`${inv.number} (sellada)`);
        continue;
      }
      try {
        await removeInvoice(id);
        deleted += 1;
      } catch {
        failures.push(inv.number);
      }
    }

    await reload();
    setSelectedIds(new Set());
    setBulkDeleteConfirm(false);
    setBulkDeleting(false);

    if (failures.length > 0) {
      toastError(
        `${deleted} eliminadas, ${failures.length} no eliminadas`,
        `No se pudieron eliminar: ${failures.join(', ')}`
      );
    } else {
      success('Facturas eliminadas', `${deleted} factura${deleted !== 1 ? 's' : ''} eliminada${deleted !== 1 ? 's' : ''}`);
    }
  };

  // Declarado como función normal, no como componente: definir un
  // componente dentro del render lo recrea en cada pasada y le hace
  // perder el estado.
  const sortIcon = (field: SortField) => {
    if (sortField !== field) return null;
    return sortDir === 'asc'
      ? <ChevronUp size={14} className="sort-icon" />
      : <ChevronDown size={14} className="sort-icon" />;
  };

  if (!mounted) {
    return <PageSkeleton variant="list" label="Cargando las facturas" />;
  }

  return (
    <div className="animate-fade-in pantalla-lista">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Facturas</h1>
          {invoices.length > 0 && (
            <div className="page-meta">
              <span className="page-meta-item">
                <span className="page-meta-value"><CifraQueCuenta texto={String(invoices.length)} /></span>
                <span className="page-meta-label">emitidas</span>
              </span>
              <span className="page-meta-item">
                <span className={`page-meta-value ${counts.pendiente > 0 ? 'is-warning' : ''}`}>
                  {formatCurrency(counts.pendingTotal)}
                </span>
                <span className="page-meta-label">por cobrar</span>
              </span>
              {/* Lo único del encabezado que pide hacer algo hoy: lleva la
                  luz roja y, al pulsarlo, deja sólo las vencidas. */}
              {counts.vencida > 0 && (
                <button
                  type="button"
                  className="meta-alerta neon neon--peligro neon--lento"
                  aria-pressed={soloVencidas}
                  onClick={() => setStatusFilter(soloVencidas ? [] : [InvoiceStatus.VENCIDA])}
                  title={soloVencidas ? 'Volver a ver todas las facturas' : 'Ver sólo las vencidas'}
                >
                  <span className="meta-alerta-cuerpo">
                    <span className="meta-alerta-punto" aria-hidden="true" />
                    <span className="page-meta-value"><CifraQueCuenta texto={String(counts.vencida)} /></span>
                    <span className="page-meta-label">
                      {counts.vencida === 1 ? 'vencida' : 'vencidas'}
                    </span>
                  </span>
                </button>
              )}
            </div>
          )}
        </div>
        <div className="page-header-actions">
          <Link href="/facturas/recurrentes" className="btn btn-ghost" title="Facturas que se preparan solas cada mes, trimestre o año">
            <Repeat size={16} /> Recurrentes
          </Link>
          <button
            className="btn btn-ghost btn-icon"
            onClick={reload}
            disabled={refreshing}
            title="Refrescar facturas en tiempo real"
            aria-label="Refrescar lista"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
          {invoices.length > 0 && (
            <button className={`btn ${showAnalytics ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setShowAnalytics(v => !v)}>
              <BarChart3 size={16} /> {showAnalytics ? 'Ocultar analítica' : 'Ver analítica'}
            </button>
          )}
          {/* La acción principal de la pantalla: la luz va en un envoltorio
              para que el halo quede por fuera y no aclare el botón. */}
          <span className="neon accion-neon">
            <Link href="/facturas/nueva" className="btn btn-primary">
              <Plus size={16} />
              Nueva factura
            </Link>
          </span>
        </div>
      </div>

      <AvisoHistorial tipo="factura" />

      {/* Panel de analítica */}
      {showAnalytics && invoices.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))', gap: 'var(--space-5)', marginBottom: 'var(--space-6)' }}>
          <ChartCard
            title="Facturas ordinarias frente a tickets TPV"
            subtitle="Evolución del volumen facturado en los últimos 6 meses"
            height={220}
            isEmpty={comparisonData.every(d => d.series1 === 0 && d.series2 === 0)}
            emptyLabel="Sin datos de facturación"
            tableColumns={[
              { key: 'name', label: 'Mes' },
              { key: 'series1', label: 'Facturas ordinarias', align: 'right', format: (v: unknown) => formatCurrency(Number(v)) },
              { key: 'series2', label: 'Tickets TPV', align: 'right', format: (v: unknown) => formatCurrency(Number(v)) },
            ]}
            tableRows={comparisonData}
            legend={
              <ChartLegend
                items={[
                  { name: 'Facturas ordinarias', value: formatCurrency(comparisonData.reduce((sum, d) => sum + d.series1, 0)), color: acentoGrafica },
                  { name: 'Tickets TPV', value: formatCurrency(comparisonData.reduce((sum, d) => sum + d.series2, 0)), color: SERIES[0] },
                ]}
              />
            }
          >
            <ComparisonBarChart data={comparisonData} name1="Facturas ordinarias" name2="Tickets TPV" />
          </ChartCard>

          <ChartCard
            title="Facturas por estado de cobro"
            subtitle="Recuento total de facturas por estado de tramitación"
            height={220}
            isEmpty={statusDistributionData.length === 0}
            emptyLabel="Sin facturas emitidas"
            tableColumns={[
              { key: 'name', label: 'Estado' },
              { key: 'value', label: 'Facturas', align: 'right' },
            ]}
            tableRows={statusDistributionData}
            legend={
              <ChartLegend
                items={statusDistributionData.map(s => ({
                  name: s.name,
                  value: `${s.value} facturas`,
                  color: s.color
                }))}
              />
            }
          >
            <StatusDonut
              data={statusDistributionData}
              centerLabel="Facturas"
              centerValue={String(invoices.length)}
            />
          </ChartCard>
        </div>
      )}

      {/* Pestañas por tipo de documento. Sin TPV y sin tickets no se
          enseñan: «Todos» y «Facturas ordinarias» serían la misma lista. */}
      {conPestanas && (
        <div className="segmentos fila-desplazable" role="group" aria-label="Tipo de documento" style={{ marginBottom: 'var(--space-4)' }}>
          <button
            className="btn btn-sm"
            aria-pressed={docTypeFilter === 'all'}
            onClick={() => setDocTypeFilter('all')}
          >
            Todos <span className="segmentos-num">{invoices.length}</span>
          </button>
          <button
            className="btn btn-sm"
            aria-pressed={docTypeFilter === 'facturas'}
            onClick={() => setDocTypeFilter('facturas')}
          >
            <FileText size={16} /> Facturas ordinarias <span className="segmentos-num">{numOrdinarias}</span>
          </button>
          <button
            className="btn btn-sm"
            aria-pressed={docTypeFilter === 'tickets'}
            onClick={() => setDocTypeFilter('tickets')}
          >
            <Store size={16} /> Tickets TPV / simplificados <span className="segmentos-num">{numTickets}</span>
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="filters-bar">
        <div className="search-bar" style={{ maxWidth: 300 }}>
          <div className="search-bar-icon"><Search size={16} /></div>
          <input
            type="text"
            placeholder="Nº de factura, cliente o NIF"
            aria-label="Buscar facturas"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" className="search-clear" onClick={() => setSearch('')} aria-label="Borrar la búsqueda" title="Borrar">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="cluster-sm">
          <Filter size={14} style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
          {estadosFiltro.map(s => (
            <button
              key={s.value}
              className={`filter-chip ${statusFilter.includes(s.value) ? 'active' : ''}`}
              aria-pressed={statusFilter.includes(s.value)}
              onClick={() => toggleStatus(s.value)}
            >
              <span className="badge-dot" style={{ background: s.color }} />
              {s.label}
            </button>
          ))}
          {hasFilters && (
            <button className="btn btn-ghost btn-sm" onClick={clearFilters}>
              <X size={13} /> Quitar filtros
            </button>
          )}
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div className="bulk-bar" role="region" aria-label="Acciones sobre la selección">
          <span className="bulk-bar-count">
            {selectedIds.size} {selectedIds.size === 1 ? 'factura seleccionada' : 'facturas seleccionadas'}
          </span>
          <button className="btn btn-sm btn-secondary" onClick={handleBulkPaid}>
            <CheckCircle size={14} /> Marcar como pagadas
          </button>
          <button className="btn btn-sm btn-secondary">
            <Download size={14} /> Exportar
          </button>
          {!bulkDeleteConfirm ? (
            <button
              className="btn btn-sm btn-danger-outline"
              onClick={() => setBulkDeleteConfirm(true)}
            >
              <Trash2 size={14} /> Eliminar seleccionadas
            </button>
          ) : (
            <>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-danger)', fontWeight: 600 }}>
                ¿Confirmar borrado de {selectedIds.size}?
              </span>
              <button
                className="btn btn-sm btn-danger"
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
              >
                {bulkDeleting ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => setBulkDeleteConfirm(false)}
                disabled={bulkDeleting}
              >
                Cancelar
              </button>
            </>
          )}
          <span className="bulk-bar-spacer" />
          <button className="btn btn-sm btn-ghost" onClick={() => { setSelectedIds(new Set()); setBulkDeleteConfirm(false); }}>
            Deseleccionar
          </button>
        </div>
      )}

      {/* Table */}
      <div className="table-container">
        <table className="table table--sortable tabla-tarjetas">
          <thead>
            <tr>
              <th className="table-checkbox">
                <input
                  aria-label="Seleccionar todas las filas"
                  type="checkbox"
                  checked={paginated.length > 0 && selectedIds.size === paginated.length}
                  onChange={toggleSelectAll}
                />
              </th>
              <th
                className={sortField === 'number' ? 'sorted' : ''}
                aria-sort={sortField === 'number' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                <button type="button" className="th-orden" onClick={() => handleSort('number')} title="Ordenar por número de factura">
                  Nº factura {sortIcon('number')}
                </button>
              </th>
              <th
                className={sortField === 'clientName' ? 'sorted' : ''}
                aria-sort={sortField === 'clientName' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                <button type="button" className="th-orden" onClick={() => handleSort('clientName')} title="Ordenar por cliente">
                  Cliente {sortIcon('clientName')}
                </button>
              </th>
              <th
                className={sortField === 'issueDate' ? 'sorted' : ''}
                aria-sort={sortField === 'issueDate' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                <button type="button" className="th-orden" onClick={() => handleSort('issueDate')} title="Ordenar por fecha de emisión">
                  Fecha {sortIcon('issueDate')}
                </button>
              </th>
              <th
                className={sortField === 'dueDate' ? 'sorted' : ''}
                aria-sort={sortField === 'dueDate' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                <button type="button" className="th-orden" onClick={() => handleSort('dueDate')} title="Ordenar por fecha de vencimiento">
                  Vencimiento {sortIcon('dueDate')}
                </button>
              </th>
              <th
                className={sortField === 'status' ? 'sorted' : ''}
                aria-sort={sortField === 'status' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                <button type="button" className="th-orden" onClick={() => handleSort('status')} title="Ordenar por estado">
                  Estado {sortIcon('status')}
                </button>
              </th>
              <th
                className={sortField === 'total' ? 'sorted' : ''}
                aria-sort={sortField === 'total' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                style={{ textAlign: 'right' }}
              >
                <button type="button" className="th-orden" onClick={() => handleSort('total')} title="Ordenar por importe total">
                  Total {sortIcon('total')}
                </button>
              </th>
              <th style={{ width: 50 }}><span className="solo-lectores">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {paginated.map(inv => (
              <tr key={inv.id}>
                <td className="table-checkbox" data-m="check">
                  <input
                    aria-label="Seleccionar esta fila"
                    type="checkbox"
                    checked={selectedIds.has(inv.id)}
                    onChange={() => toggleSelect(inv.id)}
                  />
                </td>
                <td className="mono primary" data-m="titulo">
                  <Link href={`/facturas/${inv.id}`} className="cell-link" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {inv.number}
                    {esTicketTpv(inv) ? (
                      <span className="badge badge-info" style={{ fontSize: '10px', padding: '1px 6px' }}>TPV</span>
                    ) : (
                      <span className="badge badge-neutral" style={{ fontSize: '10px', padding: '1px 6px' }}>Factura</span>
                    )}
                  </Link>
                </td>
                <td className="primary" data-m="sub">{inv.clientName}</td>
                <td data-m="dato" data-label="Emitida">{formatDate(inv.issueDate)}</td>
                <td data-m="dato" data-label="Vence">{formatDate(inv.dueDate)}</td>
                <td data-m="estado">
                  <span className={`badge badge-${inv.status}`}>
                    <span className="badge-dot" />
                    {getStatusInfo(inv.status).label}
                  </span>
                  {rechazadas.has(inv.id) && (
                    <span
                      className="badge badge-warning"
                      style={{ fontSize: '10px', padding: '1px 6px', marginLeft: 6, verticalAlign: 'middle' }}
                      title={rechazadas.get(inv.id)}
                    >
                      <AlertTriangle size={10} style={{ verticalAlign: '-1px', marginRight: 2 }} />
                      No registrada
                    </span>
                  )}
                </td>
                <td className="amount" data-m="importe">{formatCurrency(inv.total)}</td>
                <td data-m="menu">
                  <button
                    className="btn btn-ghost btn-icon btn-sm"
                    aria-label={`Acciones para ${inv.number}`}
                    aria-expanded={actionMenuId === inv.id}
                    onClick={e => {
                      e.stopPropagation();
                      if (actionMenuId === inv.id) {
                        setActionMenuId(null);
                        return;
                      }
                      const rect = e.currentTarget.getBoundingClientRect();
                      setActionMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                      setActionMenuId(inv.id);
                    }}
                  >
                    <MoreHorizontal size={16} />
                  </button>
                  {actionMenuId === inv.id && actionMenuPos && createPortal(
                    <div
                      className="action-menu"
                      role="menu"
                      style={{ top: actionMenuPos.top, right: actionMenuPos.right }}
                      onClick={e => e.stopPropagation()}
                    >
                      <Link href={`/facturas/${inv.id}`} className="action-menu-item" role="menuitem" onClick={() => setActionMenuId(null)}>
                        <Eye /> Ver la factura
                      </Link>
                      {inv.status === InvoiceStatus.BORRADOR && (
                        <Link href={`/facturas/${inv.id}/editar`} className="action-menu-item" role="menuitem" onClick={() => setActionMenuId(null)}>
                          <Edit /> Seguir editando
                        </Link>
                      )}
                      <button className="action-menu-item" role="menuitem" onClick={() => handleDuplicate(inv.id)}>
                        <Copy /> Duplicar como borrador
                      </button>
                      {(inv.status === InvoiceStatus.PENDIENTE || inv.status === InvoiceStatus.EMITIDA || inv.status === InvoiceStatus.VENCIDA) && (
                        <button className="action-menu-item" role="menuitem" onClick={() => handleMarkPaid(inv.id)}>
                          <CheckCircle /> Marcar como cobrada
                        </button>
                      )}
                      <span className="action-menu-divider" />
                      <button className="action-menu-item danger" role="menuitem" onClick={() => handleDelete(inv.id)}>
                        <Trash2 /> Eliminar
                      </button>
                    </div>,
                    document.body
                  )}
                </td>
              </tr>
            ))}

            {/* Dos vacíos distintos: "no hay nada" pide crear; "el filtro
                no encuentra nada" pide aflojar el filtro. Ofrecer "crear
                factura" a quien sólo ha escrito mal un NIF es ruido. */}
            {paginated.length === 0 && hasFilters && (
              <TableEmpty
                colSpan={8}
                icon={SearchX}
                title="Ninguna factura coincide con la búsqueda"
                hint={`Revisa el texto o desactiva los filtros de estado. Tienes ${invoices.length} ${invoices.length === 1 ? 'factura' : 'facturas'} en total.`}
                action={
                  <button className="btn btn-secondary btn-sm" onClick={clearFilters}>
                    <X size={14} /> Quitar filtros
                  </button>
                }
              />
            )}
            {paginated.length === 0 && !hasFilters && (
              <TableEmpty
                colSpan={8}
                icon={FileText}
                title="Todavía no has emitido ninguna factura"
                hint="Al emitir la primera se sella con su huella SHA-256 y queda encadenada al resto. A partir de ahí ya no se puede modificar, sólo anular o rectificar."
                action={
                  <Link href="/facturas/nueva" className="btn btn-primary btn-sm">
                    <Plus size={14} /> Crear la primera factura
                  </Link>
                }
              />
            )}
          </tbody>
        </table>

        <Paginacion paginado={paginado} etiqueta="facturas" />
      </div>

      {deleteTargetInvoice && (
        <DeleteInvoiceModal
          invoice={deleteTargetInvoice}
          onClose={() => setDeleteTargetInvoice(null)}
          onSuccess={(msg) => { success('Operación realizada', msg); reload(); }}
          onError={(err) => toastError('Error en la operación', err)}
        />
      )}
    </div>
  );
}
