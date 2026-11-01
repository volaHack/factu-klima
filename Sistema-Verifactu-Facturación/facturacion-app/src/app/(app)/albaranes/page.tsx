'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import {
  Plus, Search, Filter, ChevronUp, ChevronDown, X, ClipboardList, SearchX,
  Eye, Trash2, MoreHorizontal, Truck, FileText, Ban, CheckCircle2, Edit
} from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import TableEmpty from '@/components/ui/TableEmpty';
import FacturarPeriodo from '@/components/albaranes/FacturarPeriodo';
import { BarraFacturarSeleccion, VentanaFacturasCreadas } from '@/components/albaranes/FacturarSeleccion';
import {
  getAlbaranes, getInvoices, expedirAlbaran, anularAlbaran, deleteAlbaran, convertirAlbaranesAFactura
} from '@/lib/storage';
import { Albaran, AlbaranStatus, Invoice } from '@/lib/types';
import { desdeAlbaran, motivoNoFacturable } from '@/lib/albaranes/aFactura';
import { formatCurrency, formatDate } from '@/lib/utils';
import { ALBARAN_STATUSES } from '@/lib/constants';
import { useToast } from '@/hooks/useToast';
import AvisoHistorial from '@/components/documentos/AvisoHistorial';
import { casaTexto } from '@/lib/casaTexto';
import { usePaginacion } from '@/hooks/usePaginacion';
import Paginacion from '@/components/ui/Paginacion';

import CifraQueCuenta from '@/components/ui/CifraQueCuenta';
type SortField = 'number' | 'clientName' | 'issueDate' | 'total' | 'status';

export default function AlbaranesPage() {
  const { success, error: toastError } = useToast();
  const [albaranes, setAlbaranes] = useState<Albaran[]>([]);
  // Las facturas, para decir en qué factura está cada albarán facturado.
  const [facturas, setFacturas] = useState<Invoice[]>([]);
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<AlbaranStatus[]>([]);
  const [sortField, setSortField] = useState<SortField>('issueDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [actionMenuPos, setActionMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [creadas, setCreadas] = useState<{ facturas: Invoice[]; error?: string } | null>(null);

  // Al volver a leer, la selección se queda con lo que sigue existiendo:
  // si un albarán marcado cambió de estado en otro equipo, la barra lo dice.
  const leer = useCallback(() => Promise.all([
    getAlbaranes(), getInvoices().catch(() => [] as Invoice[]),
  ]).then(([a, f]) => {
    setAlbaranes(a);
    setFacturas(f);
    setSelectedIds(prev => {
      const siguen = new Set([...prev].filter(id => a.some(x => x.id === id)));
      return siguen.size === prev.size ? prev : siguen;
    });
    setMounted(true);
  }), []);

  useEffect(() => {
    // Primera lectura y, después, cada vez que algo cambie albaranes o
    // facturas (en esta pantalla, en otra pestaña o al sincronizar).
    void leer();
    const alCambiar = () => { void leer(); };
    window.addEventListener('klima-albaranes-updated', alCambiar);
    window.addEventListener('klima-invoices-updated', alCambiar);
    return () => {
      window.removeEventListener('klima-albaranes-updated', alCambiar);
      window.removeEventListener('klima-invoices-updated', alCambiar);
    };
  }, [leer]);

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

  const reload = leer;

  // Cada albarán, en la forma con la que se decide si se puede facturar.
  const paraFacturar = useMemo(
    () => new Map(albaranes.map(a => [a.id, desdeAlbaran(a, facturas)])),
    [albaranes, facturas],
  );
  const seleccion = useMemo(
    () => [...selectedIds].map(id => paraFacturar.get(id)).filter(a => a !== undefined),
    [selectedIds, paraFacturar],
  );

  const filtered = useMemo(() => {
    let result = [...albaranes];
    if (search) {
      result = result.filter(a => casaTexto(search,
        a.number, a.clientName, a.clientNif, a.issueDate, a.total, String(a.total).replace('.', ','),
        ...a.lineItems.map(l => `${l.productName} ${l.productRef}`),
      ));
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

  // Por páginas; se vuelve a la primera al cambiar búsqueda, filtros u orden.
  const paginado = usePaginacion(filtered, {
    clave: 'albaranes',
    reinicio: [search, statusFilter.join(','), sortField, sortDir].join('|'),
  });
  const paginated = paginado.visibles;

  const counts = useMemo(() => ({
    preparacion: albaranes.filter(a => a.status === 'borrador').length,
    porFacturar: albaranes.filter(a => a.status === 'expedido').length,
    total: albaranes.length,
  }), [albaranes]);

  const hasFilters = search.length > 0 || statusFilter.length > 0;
  const clearFilters = () => { setSearch(''); setStatusFilter([]); };

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
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // «Todos» son los que se pueden facturar de lo que se ve con los filtros
  // de ahora (todas las páginas): un borrador o uno ya facturado no tiene
  // nada que hacer en un lote de facturación.
  const facturablesVistos = useMemo(
    () => filtered.filter(a => { const p = paraFacturar.get(a.id); return p && !motivoNoFacturable(p); }),
    [filtered, paraFacturar],
  );
  const todosMarcados = facturablesVistos.length > 0 && facturablesVistos.every(a => selectedIds.has(a.id));
  const toggleSelectAll = () => {
    setSelectedIds(todosMarcados ? new Set() : new Set(facturablesVistos.map(a => a.id)));
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

  // Desde el menú de una fila: se marca ese albarán solo y se abre la
  // misma ventana que con varios.
  const handleConvert = (id: string) => {
    setActionMenuId(null);
    setSelectedIds(new Set([id]));
    setConfirmando(true);
  };

  const statusLabel = (s: AlbaranStatus) => ALBARAN_STATUSES.find(x => x.value === s)?.label ?? s;

  if (!mounted) {
    return <PageSkeleton variant="list" label="Cargando los albaranes" />;
  }

  return (
    <div className="animate-fade-in pantalla-lista">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Albaranes</h1>
          {albaranes.length > 0 && (
            <div className="page-meta">
              <span className="page-meta-item">
                <span className="page-meta-value"><CifraQueCuenta texto={String(counts.total)} /></span>
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
          <span className="neon accion-neon">
            <Link href="/albaranes/nueva" className="btn btn-primary">
              <Plus size={16} />
              Nuevo albarán
            </Link>
          </span>
        </div>
      </div>

      <AvisoHistorial tipo="albaran" />

      {counts.porFacturar > 0 && (
        <FacturarPeriodo
          albaranes={albaranes}
          onFacturado={async (hechas, error) => {
            await reload();
            setCreadas({ facturas: hechas, error });
          }}
        />
      )}

      {/* Filters */}
      <div className="filters-bar">
        <div className="search-bar" style={{ maxWidth: 300 }}>
          <div className="search-bar-icon"><Search size={16} /></div>
          <input
            type="text"
            placeholder="Nº de albarán, cliente o NIF"
            aria-label="Buscar albaranes"
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

      {/* Facturar lo marcado */}
      <BarraFacturarSeleccion
        seleccion={seleccion}
        facturar={convertirAlbaranesAFactura}
        confirmando={confirmando}
        onConfirmando={setConfirmando}
        onQuitar={ids => setSelectedIds(prev => new Set([...prev].filter(id => !ids.includes(id))))}
        onLimpiar={() => setSelectedIds(new Set())}
        onCreadas={async (hechas, error) => {
          setSelectedIds(new Set());
          await reload();
          setCreadas({ facturas: hechas, error });
          if (!error) success(hechas.length === 1 ? 'Factura borrador creada' : `${hechas.length} facturas borrador creadas`, 'Revísalas y emítelas.');
        }}
      />
      {creadas && (
        <VentanaFacturasCreadas facturas={creadas.facturas} error={creadas.error} onCerrar={() => setCreadas(null)} />
      )}

      {/* Table */}
      <div className="table-container">
        <table className="table table--sortable tabla-tarjetas">
          <thead>
            <tr>
              <th className="table-checkbox">
                <input
                  aria-label={`Seleccionar los ${facturablesVistos.length} que se pueden facturar`}
                  title={facturablesVistos.length > 0 ? `Seleccionar los ${facturablesVistos.length} que se pueden facturar` : 'No hay ninguno que se pueda facturar'}
                  type="checkbox"
                  checked={todosMarcados}
                  disabled={facturablesVistos.length === 0}
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
              <th style={{ width: 50 }}><span className="solo-lectores">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {paginated.map(a => {
              const p = paraFacturar.get(a.id);
              const motivo = p ? motivoNoFacturable(p) : null;
              const factura = p?.factura;
              return (
              <tr key={a.id} className={selectedIds.has(a.id) ? 'is-selected' : undefined}>
                <td className="table-checkbox" data-m="check">
                  <input
                    aria-label={motivo ? `${a.number}: ${motivo}` : `Seleccionar ${a.number} para facturar`}
                    title={motivo ? `No se puede facturar: ${motivo}` : 'Seleccionar para facturar'}
                    type="checkbox"
                    checked={selectedIds.has(a.id)}
                    // Uno que ya no se puede facturar pero sigue marcado se
                    // puede desmarcar; lo que no se puede es marcarlo.
                    disabled={!!motivo && !selectedIds.has(a.id)}
                    onChange={() => toggleSelect(a.id)}
                  />
                </td>
                <td className="mono primary" data-m="titulo">
                  <Link href={`/albaranes/${a.id}`} className="cell-link">{a.number}</Link>
                </td>
                <td className="primary" data-m="sub">{a.clientName}</td>
                <td data-m="dato">{formatDate(a.issueDate)}</td>
                <td data-m="estado">
                  <span className={`badge badge-${a.status}`}>
                    <span className="badge-dot" />
                    {statusLabel(a.status)}
                  </span>
                  {factura && (
                    <Link href={`/facturas/${factura.id}`} className="cell-link albaran-factura">
                      {factura.number || 'Ver la factura'}
                    </Link>
                  )}
                </td>
                <td className="amount" data-m="importe">{formatCurrency(a.total)}</td>
                <td data-m="menu">
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
                        <Link href={`/albaranes/${a.id}/editar`} className="action-menu-item" role="menuitem" onClick={() => setActionMenuId(null)}>
                          <Edit /> Seguir editando
                        </Link>
                      )}
                      {a.status === 'borrador' && (
                        <button className="action-menu-item" role="menuitem" onClick={() => handleExpedir(a.id)}>
                          <Truck /> Expedir y descontar stock
                        </button>
                      )}
                      {a.status === 'expedido' && (
                        <button className="action-menu-item" role="menuitem" onClick={() => handleConvert(a.id)}>
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
              );
            })}

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

        {/* Por páginas */}
        <Paginacion paginado={paginado} etiqueta="albaranes" />
      </div>

      {counts.porFacturar > 0 && (
        <div className="callout callout-info" style={{ marginTop: 'var(--space-4)' }}>
          <CheckCircle2 size={16} />
          <div>
            <strong>{counts.porFacturar} {counts.porFacturar === 1 ? 'albarán pendiente' : 'albaranes pendientes'} de facturar</strong>
            <p>
              Usa «Facturar el mes» de arriba para hacerlo de una vez, o marca albaranes sueltos
              y pulsa «Facturar…». Sale una factura por cliente, con cada albarán citado.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
