'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Plus, Search, Filter, Eye, Edit, Trash2, FileText, ArrowRight,
  ChevronRight, RefreshCw, ChevronUp, ChevronDown,
} from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import TableEmpty from '@/components/ui/TableEmpty';
import { getInvoices, deleteInvoice } from '@/lib/storage';
import { Invoice, InvoiceStatus, TipoDocumento, SentidoDocumento } from '@/lib/types';
import { formatCurrency, formatDate, getStatusInfo } from '@/lib/utils';
import { etiquetaTipo, numeroOrigen } from '@/lib/documentos';
import {
  NOMBRE_ORIGEN, estadoDeHistorico, listarHistorico, mezclarOrdenadas, origenDelHistorico,
  type CampoDocumentos, type FilaListadoHistorico,
} from '@/lib/historico';
import { useToast } from '@/hooks/useToast';
import { casaTexto } from '@/lib/casaTexto';

type DocumentoSortField = CampoDocumentos;

/**
 * Los documentos de Klima llegan todos y se filtran aquí; los del programa
 * anterior (lib/historico) son miles y llegan de cincuenta en cincuenta,
 * ya filtrados y ordenados por la base de datos. La lista los junta.
 */
type Fila = { de: 'klima'; doc: Invoice } | { de: 'historico'; doc: FilaListadoHistorico };

const POR_PAGINA = 50;

function valorDeOrden(f: Fila, campo: DocumentoSortField): string | number {
  if (f.de === 'historico') {
    const d = f.doc;
    switch (campo) {
      case 'total': return d.total;
      case 'issueDate': return d.fecha ? new Date(d.fecha).getTime() : 0;
      case 'number': return d.numero;
      case 'tipo': return d.tipo;
      case 'sentido': return d.sentido;
      case 'clientName': return d.cliente || '';
      case 'documentoOrigenNumber': return '';
      case 'status': return d.estado;
    }
  }
  const d = f.doc;
  switch (campo) {
    case 'total': return Number(d.total || 0);
    case 'issueDate': return d.issueDate ? new Date(d.issueDate).getTime() : 0;
    case 'number': return d.number || '';
    case 'tipo': return d.tipo || '';
    case 'sentido': return d.sentido || '';
    case 'clientName': return d.clientName || '';
    case 'documentoOrigenNumber': return d.documentoOrigenNumber || '';
    case 'status': return d.status || '';
  }
}

function compararFilas(a: Fila, b: Fila, campo: DocumentoSortField, dir: 'asc' | 'desc'): number {
  const x = valorDeOrden(a, campo);
  const y = valorDeOrden(b, campo);
  let cmp: number;
  if (typeof x === 'number' && typeof y === 'number') cmp = x - y;
  else if (campo === 'number' || campo === 'documentoOrigenNumber') {
    cmp = String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' });
  } else cmp = String(x).localeCompare(String(y), 'es', { sensitivity: 'base' });
  return dir === 'desc' ? -cmp : cmp;
}

function DocumentosContent() {
  const searchParams = useSearchParams();
  const tipoParam = searchParams.get('tipo') as TipoDocumento | null;
  const sentidoParam = searchParams.get('sentido') as SentidoDocumento | null;
  const origenParam = searchParams.get('origen');

  const [documentos, setDocumentos] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState<string>(tipoParam || 'todos');
  const [sentidoFiltro, setSentidoFiltro] = useState<string>(sentidoParam || 'todos');
  // Al pasar de una hoja del menú Mantenimientos a otra la página no se
  // vuelve a montar: los filtros siguen a la dirección cuando esta cambia.
  const [paramsVistos, setParamsVistos] = useState(`${tipoParam}|${sentidoParam}`);
  if (paramsVistos !== `${tipoParam}|${sentidoParam}`) {
    setParamsVistos(`${tipoParam}|${sentidoParam}`);
    setTipoFiltro(tipoParam || 'todos');
    setSentidoFiltro(sentidoParam || 'todos');
  }
  const [estadoFiltro, setEstadoFiltro] = useState<string>('todos');
  const [sortField, setSortField] = useState<DocumentoSortField>('issueDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // El programa de antes, si lo hubo (undefined: aún no se sabe).
  const [origenHistorico, setOrigenHistorico] = useState<string | null | undefined>(undefined);
  const [origenFiltro, setOrigenFiltro] = useState<string>(
    origenParam === 'klima' || origenParam === 'historico' ? origenParam : 'todos',
  );
  const [buscado, setBuscado] = useState('');
  // La página del historial va con los filtros y el orden con que se pidió.
  const [hist, setHist] = useState<{ clave: string; filas: FilaListadoHistorico[]; total: number; error: string } | null>(null);
  const [pagina, setPagina] = useState({ clave: '', limite: POR_PAGINA });
  const [cargandoMas, setCargandoMas] = useState(false);

  const { success, error: toastError } = useToast();

  const handleSort = (field: DocumentoSortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir(field === 'total' || field === 'issueDate' ? 'desc' : 'asc');
    }
  };

  const sortIcon = (field: DocumentoSortField) => {
    if (sortField !== field) return null;
    return sortDir === 'asc'
      ? <ChevronUp size={13} className="sort-icon" />
      : <ChevronDown size={13} className="sort-icon" />;
  };

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
    origenDelHistorico().then(setOrigenHistorico);
  }, []);

  // El historial se busca en la base de datos: al dejar de escribir, no con cada letra.
  useEffect(() => {
    const t = setTimeout(() => setBuscado(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (tipoParam) setTipoFiltro(tipoParam);
    if (sentidoParam) setSentidoFiltro(sentidoParam);
  }, [tipoParam, sentidoParam]);

  const filtrados = useMemo(() => {
    if (origenFiltro === 'historico') return [];
    return documentos.filter(doc => {
      const tipo = doc.tipo ?? 'factura';
      const sentido = doc.sentido ?? 'venta';

      if (tipoFiltro !== 'todos' && tipo !== tipoFiltro) return false;
      if (sentidoFiltro !== 'todos' && sentido !== sentidoFiltro) return false;
      if (estadoFiltro !== 'todos' && doc.status !== estadoFiltro) return false;

      if (search.trim() && !casaTexto(search,
        doc.number, doc.clientName, doc.clientNif, doc.documentoOrigenNumber, doc.issueDate, doc.total, String(doc.total).replace('.', ','), doc.notes,
        ...doc.lineItems.map(l => `${l.productName} ${l.productRef}`),
      )) {
        return false;
      }
      return true;
    }).sort((a, b) => compararFilas({ de: 'klima', doc: a }, { de: 'klima', doc: b }, sortField, sortDir));
  }, [documentos, tipoFiltro, sentidoFiltro, estadoFiltro, search, sortField, sortDir, origenFiltro]);

  const pideHistorial = Boolean(origenHistorico) && origenFiltro !== 'klima';
  const filtroHist = useMemo(
    () => ({ tipo: tipoFiltro, sentido: sentidoFiltro, estado: estadoFiltro, texto: buscado }),
    [tipoFiltro, sentidoFiltro, estadoFiltro, buscado],
  );
  const clave = JSON.stringify([filtroHist, sortField, sortDir]);

  useEffect(() => {
    if (!pideHistorial) return;
    let vivo = true;
    listarHistorico(filtroHist, { campo: sortField, asc: sortDir === 'asc' }, 0, POR_PAGINA)
      .then(r => { if (vivo) setHist({ clave, filas: r.filas, total: r.total, error: '' }); })
      .catch(e => { if (vivo) setHist({ clave, filas: [], total: 0, error: e instanceof Error ? e.message : String(e) }); });
    return () => { vivo = false; };
  }, [clave, pideHistorial, filtroHist, sortField, sortDir]);

  // Mientras llega la del filtro de ahora se ve la anterior, atenuada.
  const histActual = pideHistorial && hist?.clave === clave ? hist : null;
  const histMostrado = pideHistorial ? hist : null;
  const histCargando = origenHistorico === undefined || (pideHistorial && histActual === null);
  const limite = pagina.clave === clave ? pagina.limite : POR_PAGINA;
  const nombreOrigen = origenHistorico ? (NOMBRE_ORIGEN[origenHistorico] ?? 'el programa anterior') : '';

  const { visibles, totalFilas } = useMemo(() => {
    const deKlima: Fila[] = filtrados.map(doc => ({ de: 'klima', doc }));
    if (!histMostrado) return { visibles: deKlima, totalFilas: deKlima.length };
    const delHistorial: Fila[] = histMostrado.filas.map(doc => ({ de: 'historico', doc }));
    const juntas = mezclarOrdenadas(deKlima, delHistorial, (a, b) => compararFilas(a, b, sortField, sortDir));
    // Lo que va detrás del último del historial que ha llegado podría ir
    // detrás de los que aún faltan: no se enseña hasta que lleguen.
    let seguras = juntas;
    if (histMostrado.filas.length < histMostrado.total) {
      let ultimo = -1;
      for (let i = juntas.length - 1; i >= 0; i--) if (juntas[i].de === 'historico') { ultimo = i; break; }
      seguras = juntas.slice(0, ultimo + 1);
    }
    return { visibles: seguras.slice(0, limite), totalFilas: deKlima.length + histMostrado.total };
  }, [filtrados, histMostrado, sortField, sortDir, limite]);

  const verMas = async () => {
    const nuevo = limite + POR_PAGINA;
    setPagina({ clave, limite: nuevo });
    if (!histActual || histActual.filas.length >= Math.min(nuevo, histActual.total)) return;
    const pedida = histActual;
    setCargandoMas(true);
    try {
      const r = await listarHistorico(filtroHist, { campo: sortField, asc: sortDir === 'asc' }, pedida.filas.length, nuevo - pedida.filas.length);
      setHist(h => (h === pedida ? { ...h, filas: [...h.filas, ...r.filas], total: r.total } : h));
    } catch (e) {
      setHist(h => (h === pedida ? { ...h, error: e instanceof Error ? e.message : String(e) } : h));
    } finally {
      setCargandoMas(false);
    }
  };

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
          <h1 className="page-title">Documentos</h1>
          <p className="page-subtitle">
            Presupuestos, pedidos, albaranes y facturas de venta y compra
            {nombreOrigen && <>. Los de {nombreOrigen} son de solo consulta</>}
          </p>
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
              <option value="todos">Venta y compra</option>
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

            {origenHistorico && (
              <select
                className="form-select"
                value={origenFiltro}
                onChange={e => setOrigenFiltro(e.target.value)}
                style={{ width: 'auto' }}
                aria-label="Origen"
              >
                <option value="todos">Todos los orígenes</option>
                <option value="klima">Hechos en Klima</option>
                <option value="historico">De {nombreOrigen}</option>
              </select>
            )}

            <button className="btn btn-ghost btn-sm" onClick={cargar} title="Recargar">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-responsive">
          <table className="table table--sortable tabla-tarjetas">
            <thead>
              <tr>
                <th
                  className={sortField === 'number' ? 'sorted' : ''}
                  onClick={() => handleSort('number')}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('number'); } }}
                  aria-sort={sortField === 'number' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  title="Ordenar por número"
                >
                  Número {sortIcon('number')}
                </th>
                <th
                  className={sortField === 'tipo' ? 'sorted' : ''}
                  onClick={() => handleSort('tipo')}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('tipo'); } }}
                  aria-sort={sortField === 'tipo' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  title="Ordenar por tipo de documento"
                >
                  Tipo {sortIcon('tipo')}
                </th>
                <th
                  className={sortField === 'sentido' ? 'sorted' : ''}
                  onClick={() => handleSort('sentido')}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('sentido'); } }}
                  aria-sort={sortField === 'sentido' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  title="Ordenar por sentido (venta o compra)"
                >
                  Sentido {sortIcon('sentido')}
                </th>
                <th
                  className={sortField === 'issueDate' ? 'sorted' : ''}
                  onClick={() => handleSort('issueDate')}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('issueDate'); } }}
                  aria-sort={sortField === 'issueDate' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  title="Ordenar por fecha"
                >
                  Fecha {sortIcon('issueDate')}
                </th>
                <th
                  className={sortField === 'clientName' ? 'sorted' : ''}
                  onClick={() => handleSort('clientName')}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('clientName'); } }}
                  aria-sort={sortField === 'clientName' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  title="Ordenar por cliente o proveedor"
                >
                  Cliente / Proveedor {sortIcon('clientName')}
                </th>
                <th
                  className={sortField === 'documentoOrigenNumber' ? 'sorted' : ''}
                  onClick={() => handleSort('documentoOrigenNumber')}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('documentoOrigenNumber'); } }}
                  aria-sort={sortField === 'documentoOrigenNumber' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  title="Ordenar por documento de origen"
                >
                  Origen {sortIcon('documentoOrigenNumber')}
                </th>
                <th
                  className={sortField === 'total' ? 'sorted' : ''}
                  onClick={() => handleSort('total')}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('total'); } }}
                  aria-sort={sortField === 'total' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  style={{ textAlign: 'right' }}
                  title="Ordenar por total"
                >
                  Total {sortIcon('total')}
                </th>
                <th
                  className={sortField === 'status' ? 'sorted' : ''}
                  onClick={() => handleSort('status')}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('status'); } }}
                  aria-sort={sortField === 'status' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  title="Ordenar por estado"
                >
                  Estado {sortIcon('status')}
                </th>
                <th style={{ textAlign: 'right' }}><span className="solo-lectores">Acciones</span></th>
              </tr>
            </thead>
            <tbody className={histMostrado && !histActual ? 'tabla-atenuada' : undefined} aria-busy={histCargando || undefined}>
              {visibles.length === 0 && histCargando ? (
                <tr><td colSpan={9} className="tabla-cargando">Cargando los documentos…</td></tr>
              ) : visibles.length === 0 ? (
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
                visibles.map(fila => {
                  if (fila.de === 'historico') {
                    const d = fila.doc;
                    const verlo = `/documentos/historico/${d.id}`;
                    return (
                      <tr key={`h-${d.id}`}>
                        <td style={{ fontWeight: 600 }} data-m="titulo">
                          <Link href={verlo} style={{ color: 'var(--color-primary)' }}>
                            {d.numero}
                          </Link>
                          <span className="historico-sub" title="Del programa anterior. Solo consulta">{nombreOrigen}</span>
                        </td>
                        <td data-m="dato">
                          <span className="badge badge-outline">{etiquetaTipo(d.tipo)}</span>
                        </td>
                        <td data-m="dato">
                          <span className={`badge ${d.sentido === 'compra' ? 'badge-warning' : 'badge-neutral'}`}>
                            {d.sentido === 'compra' ? 'Compra' : 'Venta'}
                          </span>
                        </td>
                        <td data-m="dato">{d.fecha ? formatDate(d.fecha) : '—'}</td>
                        <td data-m="sub">
                          <div>{d.cliente || (d.codigoTercero ? `Cód. ${d.codigoTercero}` : 'Sin cliente')}</div>
                          {d.clienteNif && <small style={{ color: 'var(--text-muted)' }}>{d.clienteNif}</small>}
                        </td>
                        <td data-m="oculto">—</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }} data-m="importe">
                          {formatCurrency(d.total)}
                        </td>
                        <td data-m="estado">
                          <span className={`badge badge-${d.estado}`}>{estadoDeHistorico(d)}</span>
                        </td>
                        <td style={{ textAlign: 'right' }} data-m="acciones">
                          <Link href={verlo} className="btn btn-ghost btn-xs" title="Ver detalle">
                            <Eye size={14} />
                          </Link>
                        </td>
                      </tr>
                    );
                  }
                  const doc = fila.doc;
                  const tipo = doc.tipo ?? 'factura';
                  const sentido = doc.sentido ?? 'venta';
                  const statusInfo = getStatusInfo(doc.status);

                  return (
                    <tr key={doc.id}>
                      <td style={{ fontWeight: 600 }} data-m="titulo">
                        <Link href={`/documentos/${doc.id}`} style={{ color: 'var(--color-primary)' }}>
                          {doc.number}
                        </Link>
                      </td>
                      <td data-m="dato">
                        <span className="badge badge-outline">
                          {etiquetaTipo(tipo)}
                        </span>
                      </td>
                      <td data-m="dato">
                        <span className={`badge ${sentido === 'compra' ? 'badge-warning' : 'badge-neutral'}`}>
                          {sentido === 'compra' ? 'Compra' : 'Venta'}
                        </span>
                      </td>
                      <td data-m="dato">{formatDate(doc.issueDate)}</td>
                      <td data-m="sub">
                        <div>{doc.clientName || 'Sin cliente'}</div>
                        {doc.clientNif && <small style={{ color: 'var(--text-muted)' }}>{doc.clientNif}</small>}
                      </td>
                      <td data-m={doc.documentoOrigenNumber ? 'dato' : 'oculto'}>
                        {doc.documentoOrigenNumber ? (
                          <small style={{ color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <ArrowRight size={12} /> {doc.documentoOrigenNumber}
                          </small>
                        ) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }} data-m="importe">
                        {formatCurrency(doc.total)}
                      </td>
                      <td data-m="estado">
                        <span className={`badge badge-${doc.status}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }} data-m="acciones">
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

      {histMostrado && (
        <div className="historico-pie">
          {(histActual?.error || hist?.error) && (
            <p className="callout callout-danger" role="alert" style={{ width: '100%', margin: 0 }}>
              No se pudieron leer los documentos de {nombreOrigen}: {histActual?.error || hist?.error}
            </p>
          )}
          <span className="card-subtitle" style={{ marginTop: 0 }} aria-live="polite">
            {histCargando || cargandoMas
              ? 'Cargando…'
              : `${visibles.length.toLocaleString('es-ES')} de ${totalFilas.toLocaleString('es-ES')}`}
          </span>
          {!histCargando && !cargandoMas && visibles.length < totalFilas && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void verMas()}>
              Ver {Math.min(POR_PAGINA, totalFilas - visibles.length).toLocaleString('es-ES')} más
            </button>
          )}
        </div>
      )}
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
