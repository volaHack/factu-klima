'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Plus, Search, Filter, Eye, Edit, Trash2, FileText, ArrowRight,
  ChevronRight, RefreshCw,
} from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import TableEmpty from '@/components/ui/TableEmpty';
import { getInvoices, deleteInvoice } from '@/lib/storage';
import { Invoice, InvoiceStatus, TipoDocumento, SentidoDocumento } from '@/lib/types';
import { formatCurrency, formatDate, getStatusInfo } from '@/lib/utils';
import { etiquetaTipo, numeroOrigen } from '@/lib/documentos';
import { useToast } from '@/hooks/useToast';

function DocumentosContent() {
  const searchParams = useSearchParams();
  const tipoParam = searchParams.get('tipo') as TipoDocumento | null;
  const sentidoParam = searchParams.get('sentido') as SentidoDocumento | null;

  const [documentos, setDocumentos] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState<string>(tipoParam || 'todos');
  const [sentidoFiltro, setSentidoFiltro] = useState<string>(sentidoParam || 'todos');
  const [estadoFiltro, setEstadoFiltro] = useState<string>('todos');

  const { success, error: toastError } = useToast();

  const cargar = async () => {
    setLoading(true);
    try {
      const all = await getInvoices();
      setDocumentos(all);
    } catch {
      toastError('Error al cargar los documentos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  useEffect(() => {
    if (tipoParam) setTipoFiltro(tipoParam);
    if (sentidoParam) setSentidoFiltro(sentidoParam);
  }, [tipoParam, sentidoParam]);

  const filtrados = useMemo(() => {
    return documentos.filter(doc => {
      const tipo = doc.tipo ?? 'factura';
      const sentido = doc.sentido ?? 'venta';

      if (tipoFiltro !== 'todos' && tipo !== tipoFiltro) return false;
      if (sentidoFiltro !== 'todos' && sentido !== sentidoFiltro) return false;
      if (estadoFiltro !== 'todos' && doc.status !== estadoFiltro) return false;

      if (search.trim()) {
        const query = search.toLowerCase();
        const num = (doc.number || '').toLowerCase();
        const cli = (doc.clientName || '').toLowerCase();
        const nif = (doc.clientNif || '').toLowerCase();
        const orig = (doc.documentoOrigenNumber || '').toLowerCase();
        if (!num.includes(query) && !cli.includes(query) && !nif.includes(query) && !orig.includes(query)) {
          return false;
        }
      }
      return true;
    }).sort((a, b) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime());
  }, [documentos, tipoFiltro, sentidoFiltro, estadoFiltro, search]);

  const handleDelete = async (id: string, number: string) => {
    if (!window.confirm(`¿Seguro que deseas eliminar el documento ${number}?`)) return;
    try {
      await deleteInvoice(id);
      success(`Documento ${number} eliminado`);
      cargar();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al eliminar');
    }
  };

  if (loading) return <PageSkeleton />;

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h1 className="page-title">Gestión de Documentos</h1>
          <p className="page-subtitle">Presupuestos, pedidos, albaranes y facturas de venta y compra</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <Link href="/documentos/nuevo?tipo=presupuesto&sentido=venta" className="btn btn-secondary btn-sm">
            <Plus size={14} /> Presupuesto
          </Link>
          <Link href="/documentos/nuevo?tipo=pedido&sentido=venta" className="btn btn-secondary btn-sm">
            <Plus size={14} /> Pedido
          </Link>
          <Link href="/documentos/nuevo?tipo=albaran&sentido=venta" className="btn btn-secondary btn-sm">
            <Plus size={14} /> Albarán
          </Link>
          <Link href="/documentos/nuevo?tipo=pedido&sentido=compra" className="btn btn-outline btn-sm">
            <Plus size={14} /> Compra
          </Link>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '1 1 240px', position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-input"
              style={{ paddingLeft: '36px' }}
              placeholder="Buscar por número, cliente o referencia..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <select
              className="form-select"
              value={tipoFiltro}
              onChange={e => setTipoFiltro(e.target.value)}
              style={{ width: 'auto' }}
            >
              <option value="todos">Todos los tipos</option>
              <option value="presupuesto">Presupuestos</option>
              <option value="pedido">Pedidos</option>
              <option value="albaran">Albaranes</option>
              <option value="factura">Facturas</option>
              <option value="rectificativa">Rectificativas</option>
            </select>

            <select
              className="form-select"
              value={sentidoFiltro}
              onChange={e => setSentidoFiltro(e.target.value)}
              style={{ width: 'auto' }}
            >
              <option value="todos">Venta y Compra</option>
              <option value="venta">Solo Ventas</option>
              <option value="compra">Solo Compras</option>
            </select>

            <select
              className="form-select"
              value={estadoFiltro}
              onChange={e => setEstadoFiltro(e.target.value)}
              style={{ width: 'auto' }}
            >
              <option value="todos">Todos los estados</option>
              <option value="borrador">Borrador</option>
              <option value="emitida">Emitida</option>
              <option value="expedido">Expedido</option>
              <option value="facturado">Facturado</option>
              <option value="pendiente">Pendiente</option>
              <option value="pagada">Pagada</option>
              <option value="anulada">Anulada</option>
            </select>

            <button className="btn btn-ghost btn-sm" onClick={cargar} title="Recargar">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Número</th>
                <th>Tipo</th>
                <th>Sentido</th>
                <th>Fecha</th>
                <th>Cliente / Proveedor</th>
                <th>Origen</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th>Estado</th>
                <th style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 ? (
                <TableEmpty
                  colSpan={9}
                  icon={FileText}
                  title="No hay documentos"
                  hint={search ? 'No se encontraron documentos con los filtros aplicados' : 'Crea tu primer presupuesto o pedido para comenzar'}
                  action={
                    <Link href="/documentos/nuevo?tipo=presupuesto" className="btn btn-primary btn-sm">
                      <Plus size={14} /> Crear presupuesto
                    </Link>
                  }
                />
              ) : (
                filtrados.map(doc => {
                  const tipo = doc.tipo ?? 'factura';
                  const sentido = doc.sentido ?? 'venta';
                  const statusInfo = getStatusInfo(doc.status);

                  return (
                    <tr key={doc.id}>
                      <td style={{ fontWeight: 600 }}>
                        <Link href={`/documentos/${doc.id}`} style={{ color: 'var(--color-primary)' }}>
                          {doc.number}
                        </Link>
                      </td>
                      <td>
                        <span className="badge badge-outline">
                          {etiquetaTipo(tipo)}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${sentido === 'compra' ? 'badge-warning' : 'badge-neutral'}`}>
                          {sentido === 'compra' ? 'Compra' : 'Venta'}
                        </span>
                      </td>
                      <td>{formatDate(doc.issueDate)}</td>
                      <td>
                        <div>{doc.clientName || 'Sin cliente'}</div>
                        {doc.clientNif && <small style={{ color: 'var(--text-muted)' }}>{doc.clientNif}</small>}
                      </td>
                      <td>
                        {doc.documentoOrigenNumber ? (
                          <small style={{ color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <ArrowRight size={12} /> {doc.documentoOrigenNumber}
                          </small>
                        ) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {formatCurrency(doc.total)}
                      </td>
                      <td>
                        <span className={`badge badge-${doc.status}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 'var(--space-1)' }}>
                          <Link
                            href={`/documentos/${doc.id}`}
                            className="btn btn-ghost btn-xs"
                            title="Ver detalle"
                          >
                            <Eye size={14} />
                          </Link>
                          {doc.status === InvoiceStatus.BORRADOR && (
                            <Link
                              href={`/documentos/${doc.id}/editar`}
                              className="btn btn-ghost btn-xs"
                              title="Editar"
                            >
                              <Edit size={14} />
                            </Link>
                          )}
                          {doc.status === InvoiceStatus.BORRADOR && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs"
                              onClick={() => handleDelete(doc.id, doc.number)}
                              title="Eliminar"
                              style={{ color: 'var(--color-danger)' }}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function DocumentosPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="list" label="Cargando documentos..." />}>
      <DocumentosContent />
    </Suspense>
  );
}
