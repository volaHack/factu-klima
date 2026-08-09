'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import {
  Plus, Search, Filter, ChevronUp, ChevronDown, X, FileText, SearchX,
  Eye, Edit, Copy, Trash2, MoreHorizontal, CheckCircle, Download, Store, BarChart3
} from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import TableEmpty from '@/components/ui/TableEmpty';
import ChartCard from '@/components/charts/ChartCard';
import { ComparisonBarChart, StatusDonut, ChartLegend } from '@/components/charts/Charts';
import { INVOICE_STATUS_COLOR } from '@/components/charts/theme';
import { getInvoices, saveInvoice, deleteInvoice as removeInvoice, isSealed } from '@/lib/storage';
import { Invoice, InvoiceStatus } from '@/lib/types';
import { formatCurrency, formatDate, generateId, getStatusInfo, getShortMonthName } from '@/lib/utils';
import { INVOICE_STATUSES } from '@/lib/constants';
import { useToast } from '@/hooks/useToast';
import DeleteInvoiceModal from '@/components/facturas/DeleteInvoiceModal';

type SortField = 'number' | 'clientName' | 'issueDate' | 'dueDate' | 'total' | 'status';

export default function FacturasPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [deleteTargetInvoice, setDeleteTargetInvoice] = useState<Invoice | null>(null);
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus[]>([]);
  const [docTypeFilter, setDocTypeFilter] = useState<'all' | 'facturas' | 'tickets'>('all');
  const [sortField, setSortField] = useState<SortField>('issueDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [actionMenuPos, setActionMenuPos] = useState<{ top: number; right: number } | null>(null);
  const { success, error: toastError } = useToast();

  const comparisonData = useMemo(() => {
    const now = new Date();
    const data = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const m = d.getMonth();
      const y = d.getFullYear();

      const ordinarias = invoices.filter(inv => {
        const isTpv = inv.series === 'TPV' || inv.number.startsWith('TPV') || !!inv.posSessionId;
        const id = new Date(inv.issueDate);
        return !isTpv && id.getMonth() === m && id.getFullYear() === y && inv.status !== InvoiceStatus.ANULADA;
      }).reduce((sum, inv) => sum + inv.total, 0);

      const tickets = invoices.filter(inv => {
        const isTpv = inv.series === 'TPV' || inv.number.startsWith('TPV') || !!inv.posSessionId;
        const id = new Date(inv.issueDate);
        return isTpv && id.getMonth() === m && id.getFullYear() === y && inv.status !== InvoiceStatus.ANULADA;
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
    const load = async () => { setInvoices(await getInvoices()); setMounted(true); };
    load();
  }, []);

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

  const reload = async () => setInvoices(await getInvoices());

  // Filter + Sort
  const filtered = useMemo(() => {
    let result = [...invoices];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(inv =>
        inv.number.toLowerCase().includes(q) ||
        inv.clientName.toLowerCase().includes(q) ||
        inv.clientNif.toLowerCase().includes(q)
      );
    }

    if (docTypeFilter === 'facturas') {
      result = result.filter(inv => !(inv.series === 'TPV' || inv.number.startsWith('TPV') || !!inv.posSessionId));
    } else if (docTypeFilter === 'tickets') {
      result = result.filter(inv => inv.series === 'TPV' || inv.number.startsWith('TPV') || !!inv.posSessionId);
    }

    if (statusFilter.length > 0) {
      result = result.filter(inv => statusFilter.includes(inv.status));
    }

    result.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      let cmp = 0;
      if (typeof aVal === 'string' && typeof bVal === 'string') cmp = aVal.localeCompare(bVal);
      else if (typeof aVal === 'number' && typeof bVal === 'number') cmp = aVal - bVal;
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return result;
  }, [invoices, search, statusFilter, sortField, sortDir]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

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

  const hasFilters = search.length > 0 || statusFilter.length > 0;
  const clearFilters = () => { setSearch(''); setStatusFilter([]); setPage(1); };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const toggleStatus = (status: InvoiceStatus) => {
    setStatusFilter(prev =>
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
    setPage(1);
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
        verifactu: undefined,
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
    <div className="animate-fade-in">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-left">
          <p className="page-eyebrow"><FileText /> Emisión</p>
          <h1 className="page-title">Facturas</h1>
          {invoices.length > 0 && (
            <div className="page-meta">
              <span className="page-meta-item">
                <span className="page-meta-value">{invoices.length}</span>
                <span className="page-meta-label">emitidas</span>
              </span>
              <span className="page-meta-item">
                <span className={`page-meta-value ${counts.pendiente > 0 ? 'is-warning' : ''}`}>
                  {formatCurrency(counts.pendingTotal)}
                </span>
                <span className="page-meta-label">por cobrar</span>
              </span>
              {counts.vencida > 0 && (
                <span className="page-meta-item">
                  <span className="page-meta-value is-danger">{counts.vencida}</span>
                  <span className="page-meta-label">
                    {counts.vencida === 1 ? 'vencida' : 'vencidas'}
                  </span>
                </span>
              )}
            </div>
          )}
        </div>
        <div className="page-header-actions">
          {invoices.length > 0 && (
            <button className={`btn ${showAnalytics ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setShowAnalytics(v => !v)}>
              <BarChart3 size={16} /> {showAnalytics ? 'Ocultar analítica' : 'Analítica Recharts'}
            </button>
          )}
          <Link href="/facturas/nueva" className="btn btn-primary">
            <Plus size={16} />
            Nueva factura
          </Link>
        </div>
      </div>

      {/* Recharts Analytics Panel */}
      {showAnalytics && invoices.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 'var(--space-5)', marginBottom: 'var(--space-6)' }}>
          <ChartCard
            title="Facturas Ordinarias vs. Tickets TPV"
            subtitle="Evolución del volumen facturado en los últimos 6 meses"
            height={220}
            isEmpty={comparisonData.every(d => d.series1 === 0 && d.series2 === 0)}
            emptyLabel="Sin datos de facturación"
            tableColumns={[
              { key: 'name', label: 'Mes' },
              { key: 'series1', label: 'Facturas Ordinarias', align: 'right', format: (v: unknown) => formatCurrency(Number(v)) },
              { key: 'series2', label: 'Tickets TPV', align: 'right', format: (v: unknown) => formatCurrency(Number(v)) },
            ]}
            tableRows={comparisonData}
            legend={
              <ChartLegend
                items={[
                  { name: 'Facturas Ordinarias', value: formatCurrency(comparisonData.reduce((sum, d) => sum + d.series1, 0)), color: '#b02a5c' },
                  { name: 'Tickets TPV', value: formatCurrency(comparisonData.reduce((sum, d) => sum + d.series2, 0)), color: '#3987e5' },
                ]}
              />
            }
          >
            <ComparisonBarChart data={comparisonData} name1="Facturas Ordinarias" name2="Tickets TPV" />
          </ChartCard>

          <ChartCard
            title="Distribución por Estado de Cobro"
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

      {/* Document Type Tabs */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
        <button
          className={`btn ${docTypeFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => { setDocTypeFilter('all'); setPage(1); }}
        >
          Todos ({invoices.length})
        </button>
        <button
          className={`btn ${docTypeFilter === 'facturas' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => { setDocTypeFilter('facturas'); setPage(1); }}
        >
          <FileText size={16} /> Facturas Ordinarias ({invoices.filter(i => !(i.series === 'TPV' || i.number.startsWith('TPV') || !!i.posSessionId)).length})
        </button>
        <button
          className={`btn ${docTypeFilter === 'tickets' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => { setDocTypeFilter('tickets'); setPage(1); }}
        >
          <Store size={16} /> Tickets TPV / Simplificados ({invoices.filter(i => i.series === 'TPV' || i.number.startsWith('TPV') || !!i.posSessionId).length})
        </button>
      </div>

      {/* Filters */}
      <div className="filters-bar">
        <div className="search-bar" style={{ maxWidth: 300 }}>
          <div className="search-bar-icon"><Search size={16} /></div>
          <input
            type="text"
            placeholder="Nº de factura, cliente o NIF"
            aria-label="Buscar facturas"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <div className="cluster-sm">
          <Filter size={14} style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
          {INVOICE_STATUSES.map(s => (
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
          <span className="bulk-bar-spacer" />
          <button className="btn btn-sm btn-ghost" onClick={() => setSelectedIds(new Set())}>
            Deseleccionar
          </button>
        </div>
      )}

      {/* Table */}
      <div className="table-container">
        <table className="table table--sortable">
          <thead>
            <tr>
              <th className="table-checkbox">
                <input
                  type="checkbox"
                  checked={paginated.length > 0 && selectedIds.size === paginated.length}
                  onChange={toggleSelectAll}
                />
              </th>
              <th className={sortField === 'number' ? 'sorted' : ''} onClick={() => handleSort('number')}>
                Nº Factura {sortIcon('number')}
              </th>
              <th className={sortField === 'clientName' ? 'sorted' : ''} onClick={() => handleSort('clientName')}>
                Cliente {sortIcon('clientName')}
              </th>
              <th className={sortField === 'issueDate' ? 'sorted' : ''} onClick={() => handleSort('issueDate')}>
                Fecha {sortIcon('issueDate')}
              </th>
              <th className={sortField === 'dueDate' ? 'sorted' : ''} onClick={() => handleSort('dueDate')}>
                Vencimiento {sortIcon('dueDate')}
              </th>
              <th className={sortField === 'status' ? 'sorted' : ''} onClick={() => handleSort('status')}>
                Estado {sortIcon('status')}
              </th>
              <th className={sortField === 'total' ? 'sorted' : ''} onClick={() => handleSort('total')} style={{ textAlign: 'right' }}>
                Total {sortIcon('total')}
              </th>
              <th style={{ width: 50 }}></th>
            </tr>
          </thead>
          <tbody>
            {paginated.map(inv => (
              <tr key={inv.id}>
                <td className="table-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(inv.id)}
                    onChange={() => toggleSelect(inv.id)}
                  />
                </td>
                <td className="mono primary">
                  <Link href={`/facturas/${inv.id}`} className="cell-link" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {inv.number}
                    {inv.series === 'TPV' || inv.number.startsWith('TPV') || !!inv.posSessionId ? (
                      <span className="badge badge-info" style={{ fontSize: '10px', padding: '1px 6px' }}>TPV</span>
                    ) : (
                      <span className="badge badge-neutral" style={{ fontSize: '10px', padding: '1px 6px' }}>Factura</span>
                    )}
                  </Link>
                </td>
                <td className="primary">{inv.clientName}</td>
                <td>{formatDate(inv.issueDate)}</td>
                <td>{formatDate(inv.dueDate)}</td>
                <td>
                  <span className={`badge badge-${inv.status}`}>
                    <span className="badge-dot" />
                    {getStatusInfo(inv.status).label}
                  </span>
                </td>
                <td className="amount">{formatCurrency(inv.total)}</td>
                <td>
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="pagination">
            <div className="pagination-info">
              Viendo {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} de {filtered.length}
            </div>
            <div className="pagination-controls">
              <button className="pagination-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                let pageNum = i + 1;
                if (totalPages > 5) {
                  if (page <= 3) pageNum = i + 1;
                  else if (page >= totalPages - 2) pageNum = totalPages - 4 + i;
                  else pageNum = page - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    className={`pagination-btn ${page === pageNum ? 'active' : ''}`}
                    onClick={() => setPage(pageNum)}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button className="pagination-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Siguiente</button>
            </div>
          </div>
        )}
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
