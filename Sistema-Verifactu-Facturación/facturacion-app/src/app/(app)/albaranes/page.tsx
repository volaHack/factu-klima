'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plus, Search, Filter, ChevronUp, ChevronDown, X, ClipboardList, SearchX,
  Eye, Trash2, MoreHorizontal, Truck, FileText, Ban, CheckCircle2
} from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import TableEmpty from '@/components/ui/TableEmpty';
import {
  getAlbaranes, expedirAlbaran, anularAlbaran, deleteAlbaran, convertirAlbaranesAFactura
} from '@/lib/storage';
import { Albaran, AlbaranStatus } from '@/lib/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { ALBARAN_STATUSES } from '@/lib/constants';
import { useToast } from '@/hooks/useToast';

type SortField = 'number' | 'clientName' | 'issueDate' | 'total' | 'status';

export default function AlbaranesPage() {
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const [albaranes, setAlbaranes] = useState<Albaran[]>([]);
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<AlbaranStatus[]>([]);
  const [sortField, setSortField] = useState<SortField>('issueDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [actionMenuPos, setActionMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    const load = async () => { setAlbaranes(await getAlbaranes()); setMounted(true); };
    load();
  }, []);

  useEffect(() => {
    if (!actionMenuId) return;
    const close = () => setActionMenuId(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
    };
  }, [actionMenuId]);

  const reload = async () => { setAlbaranes(await getAlbaranes()); setSelectedIds(new Set()); };

  const filtered = useMemo(() => {
    let result = [...albaranes];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(a =>
        a.number.toLowerCase().includes(q) ||
        a.clientName.toLowerCase().includes(q) ||
        a.clientNif.toLowerCase().includes(q)
      );
    }
    if (statusFilter.length > 0) {
      result = result.filter(a => statusFilter.includes(a.status));
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
  }, [albaranes, search, statusFilter, sortField, sortDir]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const counts = useMemo(() => ({
    preparacion: albaranes.filter(a => a.status === 'borrador').length,
    porFacturar: albaranes.filter(a => a.status === 'expedido').length,
    total: albaranes.length,
  }), [albaranes]);

  const hasFilters = search.length > 0 || statusFilter.length > 0;
  const clearFilters = () => { setSearch(''); setStatusFilter([]); setPage(1); };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const toggleStatus = (status: AlbaranStatus) => {
    setStatusFilter(prev => (prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]));
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
    if (selectedIds.size === paginated.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(paginated.map(a => a.id)));
  };

  const sortIcon = (field: SortField) => {
    if (sortField !== field) return null;
    return sortDir === 'asc'
      ? <ChevronUp size={14} className="sort-icon" />
      : <ChevronDown size={14} className="sort-icon" />;
  };

  const handleExpedir = async (id: string) => {
    const a = albaranes.find(x => x.id === id);
    setActionMenuId(null);
    if (!a) return;
    const ok = confirm(
      `¿Expedir el albarán ${a.number}?\n\n` +
      'El albarán pasa a estado "Expedido" y el stock de los productos despachados se descuenta. ' +
      'A partir de aquí ya no se puede editar, sólo facturarlo o anularlo.'
    );
    if (!ok) return;
    try {
      await expedirAlbaran(id);
      await reload();
      success('Albarán expedido', a.number);
    } catch (err) {
      toastError('No se pudo expedir', err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  const handleAnular = async (id: string) => {
    const a = albaranes.find(x => x.id === id);
    setActionMenuId(null);
    if (!a) return;
    const reason = prompt(
      `Anular el albarán ${a.number}.\n\n` +
      'El albarán queda registrado como anulado. Indica el motivo:'
    );
    if (reason === null) return;
    if (!reason.trim()) {
      toastError('Motivo obligatorio', 'La anulación debe quedar justificada.');
      return;
    }
    try {
      await anularAlbaran(id, reason);
      await reload();
      success('Albarán anulado', `${a.number} · motivo registrado`);
    } catch (err) {
      toastError('No se pudo anular', err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  const handleDelete = async (id: string) => {
    const a = albaranes.find(x => x.id === id);
    setActionMenuId(null);
    if (!a) return;
    const ok = confirm(`¿Eliminar el borrador ${a.number}? Esta acción no se puede deshacer.`);
    if (!ok) return;
    try {
      await deleteAlbaran(id);
      await reload();
      success('Borrador eliminado', a.number);
    } catch (err) {
      toastError('No se pudo eliminar', err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  const handleConvert = async (ids: string[]) => {
    const seleccionados = albaranes.filter(a => ids.includes(a.id));
    const expedidos = seleccionados.filter(a => a.status === 'expedido');
    if (expedidos.length === 0) {
      toastError('Nada que facturar', 'Sólo los albaranes expedidos se pueden convertir en factura.');
      return;
    }
    const clientes = new Set(expedidos.map(a => a.clientId));
    const desc = clientes.size === 1
      ? `Se generará 1 factura borrador con los ${expedidos.length} albaranes seleccionados.`
      : `Se generarán ${clientes.size} facturas borrador: los albaranes se agrupan por cliente.`;
    const ok = confirm(
      `Convertir ${expedidos.length} albarán(es) a factura.\n\n` +
      `${desc}\nLos albaranes quedarán marcados como "Facturados".\n\n` +
      'Las facturas nacen como borradores: revísalas antes de emitirlas.'
    );
    if (!ok) return;

    setConverting(true);
    try {
      const invoices = await convertirAlbaranesAFactura(expedidos.map(a => a.id));
      await reload();
      success('Albaranes convertidos', `${invoices.length} ${invoices.length === 1 ? 'factura creada' : 'facturas creadas'}`);
      if (invoices.length === 1) {
        router.push(`/facturas/${invoices[0].id}`);
      }
    } catch (err) {
      toastError('No se pudo convertir', err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setConverting(false);
    }
  };

  const statusLabel = (s: AlbaranStatus) => ALBARAN_STATUSES.find(x => x.value === s)?.label ?? s;

  if (!mounted) {
    return <PageSkeleton variant="list" label="Cargando los albaranes" />;
  }

  return (
    <div className="animate-fade-in">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-left">
          <p className="page-eyebrow"><ClipboardList /> Logística</p>
          <h1 className="page-title">Albaranes</h1>
          {albaranes.length > 0 && (
            <div className="page-meta">
              <span className="page-meta-item">
                <span className="page-meta-value">{counts.total}</span>
                <span className="page-meta-label">albaranes</span>
              </span>
              <span className="page-meta-item">
                <span className={`page-meta-value ${counts.preparacion > 0 ? 'is-warning' : ''}`}>
                  {counts.preparacion}
                </span>
                <span className="page-meta-label">en preparación</span>
              </span>
              <span className="page-meta-item">
                <span className={`page-meta-value ${counts.porFacturar > 0 ? 'is-warning' : ''}`}>
                  {counts.porFacturar}
                </span>
                <span className="page-meta-label">por facturar</span>
              </span>
            </div>
          )}
        </div>
        <div className="page-header-actions">
          <Link href="/albaranes/nueva" className="btn btn-primary">
            <Plus size={16} />
            Nuevo albarán
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="filters-bar">
        <div className="search-bar" style={{ maxWidth: 300 }}>
          <div className="search-bar-icon"><Search size={16} /></div>
          <input
            type="text"
            placeholder="Nº de albarán, cliente o NIF"
            aria-label="Buscar albaranes"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <div className="cluster-sm">
          <Filter size={14} style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
          {ALBARAN_STATUSES.map(s => (
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
            {selectedIds.size} {selectedIds.size === 1 ? 'albarán seleccionado' : 'albaranes seleccionados'}
          </span>
          <button
            className="btn btn-sm btn-secondary"
            onClick={() => handleConvert([...selectedIds])}
            disabled={converting}
          >
            <FileText size={14} /> {converting ? 'Convirtiendo…' : 'Convertir a factura'}
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
                Nº Albarán {sortIcon('number')}
              </th>
              <th className={sortField === 'clientName' ? 'sorted' : ''} onClick={() => handleSort('clientName')}>
                Cliente {sortIcon('clientName')}
              </th>
              <th className={sortField === 'issueDate' ? 'sorted' : ''} onClick={() => handleSort('issueDate')}>
                Fecha {sortIcon('issueDate')}
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
            {paginated.map(a => (
              <tr key={a.id}>
                <td className="table-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(a.id)}
                    onChange={() => toggleSelect(a.id)}
                  />
                </td>
                <td className="mono primary">
                  <Link href={`/albaranes/${a.id}`} className="cell-link">{a.number}</Link>
                </td>
                <td className="primary">{a.clientName}</td>
                <td>{formatDate(a.issueDate)}</td>
                <td>
                  <span className={`badge badge-${a.status}`}>
                    <span className="badge-dot" />
                    {statusLabel(a.status)}
                  </span>
                </td>
                <td className="amount">{formatCurrency(a.total)}</td>
                <td>
                  <button
                    className="btn btn-ghost btn-icon btn-sm"
                    aria-label={`Acciones para ${a.number}`}
                    aria-expanded={actionMenuId === a.id}
                    onClick={e => {
                      e.stopPropagation();
                      if (actionMenuId === a.id) { setActionMenuId(null); return; }
                      const rect = e.currentTarget.getBoundingClientRect();
                      setActionMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                      setActionMenuId(a.id);
                    }}
                  >
                    <MoreHorizontal size={16} />
                  </button>
                  {actionMenuId === a.id && actionMenuPos && createPortal(
                    <div
                      className="action-menu"
                      role="menu"
                      style={{ top: actionMenuPos.top, right: actionMenuPos.right }}
                      onClick={e => e.stopPropagation()}
                    >
                      <Link href={`/albaranes/${a.id}`} className="action-menu-item" role="menuitem" onClick={() => setActionMenuId(null)}>
                        <Eye /> Ver el albarán
                      </Link>
                      {a.status === 'borrador' && (
                        <button className="action-menu-item" role="menuitem" onClick={() => handleExpedir(a.id)}>
                          <Truck /> Expedir y descontar stock
                        </button>
                      )}
                      {a.status === 'expedido' && (
                        <button className="action-menu-item" role="menuitem" onClick={() => handleConvert([a.id])}>
                          <FileText /> Convertir a factura
                        </button>
                      )}
                      {(a.status === 'borrador' || a.status === 'expedido') && (
                        <button className="action-menu-item" role="menuitem" onClick={() => handleAnular(a.id)}>
                          <Ban /> Anular
                        </button>
                      )}
                      {a.status === 'borrador' && (
                        <>
                          <span className="action-menu-divider" />
                          <button className="action-menu-item danger" role="menuitem" onClick={() => handleDelete(a.id)}>
                            <Trash2 /> Eliminar borrador
                          </button>
                        </>
                      )}
                    </div>,
                    document.body
                  )}
                </td>
              </tr>
            ))}

            {paginated.length === 0 && hasFilters && (
              <TableEmpty
                colSpan={7}
                icon={SearchX}
                title="Ningún albarán coincide con la búsqueda"
                hint={`Revisa el texto o desactiva los filtros de estado. Tienes ${albaranes.length} ${albaranes.length === 1 ? 'albarán' : 'albaranes'} en total.`}
                action={
                  <button className="btn btn-secondary btn-sm" onClick={clearFilters}>
                    <X size={14} /> Quitar filtros
                  </button>
                }
              />
            )}
            {paginated.length === 0 && !hasFilters && (
              <TableEmpty
                colSpan={7}
                icon={ClipboardList}
                title="Todavía no hay albaranes"
                hint="Un albarán prepara la entrega sin facturar. Al expedirlo se descuenta el stock y al final del mes lo conviertes en factura."
                action={
                  <Link href="/albaranes/nueva" className="btn btn-primary btn-sm">
                    <Plus size={14} /> Crear el primer albarán
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

      {counts.porFacturar > 0 && (
        <div className="callout callout-info" style={{ marginTop: 'var(--space-4)' }}>
          <CheckCircle2 size={16} />
          <div>
            <strong>{counts.porFacturar} {counts.porFacturar === 1 ? 'albarán pendiente' : 'albaranes pendientes'} de facturar</strong>
            <p>
              Selecciona los albaranes expedidos y pulsa «Convertir a factura». Se agrupan por cliente
              en una sola factura, lista para revisar y emitir.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
