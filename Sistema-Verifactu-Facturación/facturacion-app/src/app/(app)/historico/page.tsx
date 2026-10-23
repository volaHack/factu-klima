'use client';

/**
 * HISTORIAL DEL PROGRAMA ANTERIOR
 *
 * Todo lo que la empresa emitió en su programa de antes (ISECAN…), en una
 * sola pantalla: lo facturado y lo comprado por año, los albaranes que se
 * quedaron sin facturar y los pedidos sin servir, y la lista entera con un
 * buscador. La ficha de cada cliente enseña lo suyo; esto es para cuando no
 * se sabe de quién era el documento o se quiere ver el año completo.
 *
 * Solo consulta (ver lib/historico). Las sumas las hace la base de datos y
 * la lista llega a trozos de cincuenta: son miles de documentos y en el
 * móvil no pueden bajar todos de golpe.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { History, Search } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import TableEmpty from '@/components/ui/TableEmpty';
import { getClients } from '@/lib/storage';
import type { Client } from '@/lib/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  ETIQUETA_TIPO, NOMBRE_ORIGEN, buscarHistorico, comprasSinImporte, fichasQueCasan, getResumenHistorico,
  numeroVisible, origenDelHistorico, quedoPendiente, resumenGeneral,
  type DocumentoHistorico, type FiltroHistorico, type FilaResumenHistorico, type TipoHistorico,
} from '@/lib/historico';

const POR_PAGINA = 50;

const TIPOS: { value: TipoHistorico | ''; label: string }[] = [
  { value: '', label: 'Todo' },
  { value: 'factura_venta', label: 'Facturas' },
  { value: 'albaran_venta', label: 'Albaranes' },
  { value: 'pedido_venta', label: 'Pedidos' },
  { value: 'factura_compra', label: 'Facturas de compra' },
  { value: 'albaran_compra', label: 'Albaranes de compra' },
];

export default function HistoricoPage() {
  const [filas, setFilas] = useState<FilaResumenHistorico[] | null>(null);
  const [origen, setOrigen] = useState('el programa anterior');
  const [sinImporte, setSinImporte] = useState(0);
  const [fichas, setFichas] = useState<Client[]>([]);
  const [error, setError] = useState('');

  const [texto, setTexto] = useState('');
  const [buscado, setBuscado] = useState('');
  const [tipo, setTipo] = useState<TipoHistorico | ''>('');
  const [anio, setAnio] = useState('');
  const [soloPendientes, setSoloPendientes] = useState(false);

  // La lista va con el filtro con el que se pidió: mientras no llegue la
  // del filtro de ahora, se está cargando.
  const [lista, setLista] = useState<{
    filtro: FiltroHistorico; docs: DocumentoHistorico[]; total: number; error: string;
  } | null>(null);
  const [cargandoMas, setCargandoMas] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([getResumenHistorico(), origenDelHistorico(), comprasSinImporte(), getClients()])
      .then(([f, o, s, c]) => {
        setFilas(f);
        if (o) setOrigen(NOMBRE_ORIGEN[o] ?? 'el programa anterior');
        setSinImporte(s);
        setFichas(c);
      })
      .catch(e => { setFilas([]); setError(e instanceof Error ? e.message : String(e)); });
  }, []);

  // Se busca al dejar de escribir, no con cada letra.
  useEffect(() => {
    const t = setTimeout(() => setBuscado(texto), 300);
    return () => clearTimeout(t);
  }, [texto]);

  const porId = useMemo(() => new Map(fichas.map(c => [c.id, c])), [fichas]);
  const filtro = useMemo<FiltroHistorico>(() => ({
    texto: buscado, clientIds: fichasQueCasan(fichas, buscado), tipo, anio, soloPendientes,
  }), [buscado, fichas, tipo, anio, soloPendientes]);

  useEffect(() => {
    if (filas === null || filas.length === 0) return;
    let vivo = true;
    buscarHistorico(filtro, 0, POR_PAGINA)
      .then(r => { if (vivo) setLista({ filtro, docs: r.docs, total: r.total, error: '' }); })
      .catch(e => { if (vivo) setLista({ filtro, docs: [], total: 0, error: e instanceof Error ? e.message : String(e) }); });
    return () => { vivo = false; };
  }, [filtro, filas]);

  const actual = lista && lista.filtro === filtro ? lista : null;
  const cargando = actual === null;
  const docs = actual?.docs ?? [];
  const total = actual?.total ?? 0;

  const verMas = async () => {
    if (!actual) return;
    const pedida = actual;
    setCargandoMas(true);
    try {
      const r = await buscarHistorico(pedida.filtro, pedida.docs.length, POR_PAGINA);
      setLista(l => (l === pedida ? { ...l, docs: [...l.docs, ...r.docs], total: r.total } : l));
    } catch (e) {
      setLista(l => (l === pedida ? { ...l, error: e instanceof Error ? e.message : String(e) } : l));
    } finally {
      setCargandoMas(false);
    }
  };

  const resumen = useMemo(() => resumenGeneral(filas ?? []), [filas]);

  if (filas === null) return <PageSkeleton variant="list" label="Cargando el historial" />;

  if (filas.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon"><History strokeWidth={1.6} /></span>
        <h2 className="empty-state-title">No hay historial de otro programa</h2>
        <p className="empty-state-description">
          {error || 'Aquí sale lo que la empresa emitió en su programa anterior (ISECAN…) cuando se carga su histórico.'}
        </p>
      </div>
    );
  }

  const verAnio = (a: number | null) => {
    setAnio(a == null ? '' : String(a));
    setTipo('');
    caja.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const hayFiltro = Boolean(buscado.trim() || tipo || anio || soloPendientes);

  return (
    <div className="animate-fade-in historico">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Historial de {origen}</h1>
          <p className="page-subtitle">
            Lo emitido allí antes de pasar a Klima. Solo para consultar: no cuenta en Veri*Factu,
            ni en los modelos de IGIC, ni en la contabilidad.
          </p>
        </div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="kpi-card" style={{ '--kpi-color': 'var(--accent-500)', '--kpi-bg': 'var(--color-success-bg)' } as React.CSSProperties}>
          <div className="kpi-card-value">{formatCurrency(resumen.ventas.total)}</div>
          <div className="kpi-card-label">Facturado ({resumen.ventas.facturas.toLocaleString('es-ES')} facturas)</div>
        </div>
        <div className="kpi-card" style={{ '--kpi-color': 'var(--color-info)', '--kpi-bg': 'var(--color-info-bg)' } as React.CSSProperties}>
          <div className="kpi-card-value">{resumen.compras.facturas.toLocaleString('es-ES')}</div>
          <div className="kpi-card-label">Facturas de compra</div>
        </div>
        <button
          type="button"
          className="kpi-card kpi-card--boton"
          style={{ '--kpi-color': 'var(--color-warning)', '--kpi-bg': 'var(--color-warning-bg)' } as React.CSSProperties}
          onClick={() => { setTipo('albaran_venta'); setSoloPendientes(true); setAnio(''); caja.current?.scrollIntoView({ behavior: 'smooth' }); }}
        >
          <div className="kpi-card-value">{formatCurrency(resumen.albaranesSinFactura.total)}</div>
          <div className="kpi-card-label">
            {resumen.albaranesSinFactura.documentos.toLocaleString('es-ES')}{' '}
            {resumen.albaranesSinFactura.documentos === 1 ? 'albarán' : 'albaranes'} sin factura
          </div>
        </button>
        <button
          type="button"
          className="kpi-card kpi-card--boton"
          style={{ '--kpi-color': 'var(--color-warning)', '--kpi-bg': 'var(--color-warning-bg)' } as React.CSSProperties}
          onClick={() => { setTipo('pedido_venta'); setSoloPendientes(true); setAnio(''); caja.current?.scrollIntoView({ behavior: 'smooth' }); }}
        >
          <div className="kpi-card-value">{formatCurrency(resumen.pedidosSinServir.total)}</div>
          <div className="kpi-card-label">
            {resumen.pedidosSinServir.documentos.toLocaleString('es-ES')}{' '}
            {resumen.pedidosSinServir.documentos === 1 ? 'pedido' : 'pedidos'} sin servir
          </div>
        </button>
      </div>

      <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="card-header">
          <div>
            <h3 className="card-title">Por año</h3>
            <p className="card-subtitle">Pulsa un año para ver sus documentos.</p>
          </div>
        </div>
        <div className="table-container" style={{ border: 'none' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Año</th>
                <th style={{ textAlign: 'right' }}>Facturado</th>
                <th style={{ textAlign: 'right' }}>Compras</th>
              </tr>
            </thead>
            <tbody>
              {resumen.anios.map(a => (
                <tr key={a.anio ?? 'sin'}>
                  <td>
                    <button type="button" className="cell-link historico-anio" onClick={() => verAnio(a.anio)}>
                      {a.anio ?? 'Sin fecha'}
                    </button>
                  </td>
                  <td className="amount">
                    {formatCurrency(a.facturado)}
                    <span className="historico-sub">{a.ventas.toLocaleString('es-ES')} facturas</span>
                  </td>
                  <td className="amount">
                    {formatCurrency(a.comprado)}
                    <span className="historico-sub">{a.compras.toLocaleString('es-ES')} facturas</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sinImporte > 0 && (
          <p className="chart-nota">
            En {origen} hay <strong>{sinImporte.toLocaleString('es-ES')}</strong> compras apuntadas sin importe (0 €):
            el total de compras es solo de las que sí lo llevan.
          </p>
        )}
      </div>

      <div className="card" ref={caja} style={{ scrollMarginTop: 'var(--space-6)' }}>
        <div className="filters-bar">
          <div className="search-bar">
            <div className="search-bar-icon"><Search size={16} /></div>
            <input
              type="search"
              placeholder="Cliente, NIF, código o nº"
              aria-label="Buscar en el historial"
              value={texto}
              onChange={e => setTexto(e.target.value)}
            />
          </div>
          <select className="form-select" aria-label="Tipo de documento" value={tipo} onChange={e => setTipo(e.target.value as TipoHistorico | '')}>
            {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select className="form-select" aria-label="Año" value={anio} onChange={e => setAnio(e.target.value)}>
            <option value="">Todos los años</option>
            {[...new Set(filas.map(f => f.anio).filter((a): a is number => a != null))].sort((a, b) => b - a)
              .map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <label className="historico-check">
            <input type="checkbox" checked={soloPendientes} onChange={e => setSoloPendientes(e.target.checked)} />
            Sin facturar o sin servir
          </label>
          {hayFiltro && (
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => { setTexto(''); setBuscado(''); setTipo(''); setAnio(''); setSoloPendientes(false); }}
            >
              Limpiar
            </button>
          )}
        </div>

        {(error || actual?.error) && (
          <p className="callout callout-danger" role="alert">No se pudo leer el historial: {error || actual?.error}</p>
        )}

        <div className="table-container" style={{ border: 'none' }}>
          <table className="table historico-docs">
            <thead>
              <tr>
                <th>Documento</th>
                <th>Cliente o proveedor</th>
                <th style={{ textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {docs.map(d => {
                const ficha = d.clientId ? porId.get(d.clientId) : undefined;
                return (
                  <tr key={d.id}>
                    <td className="historico-col-doc">
                      <span className="mono" title={d.observaciones ?? undefined}>{numeroVisible(d)}</span>
                      <span className="historico-sub">
                        {ETIQUETA_TIPO[d.tipo]} · {d.fecha ? formatDate(d.fecha) : 'sin fecha'}
                        {quedoPendiente(d) && (
                          <> <span className="badge badge-warning">{d.tipo === 'pedido_venta' ? 'Sin servir' : 'Sin factura'}</span></>
                        )}
                      </span>
                    </td>
                    <td className="historico-col-ficha">
                      {ficha ? (
                        <Link href={`/clientes/${ficha.id}#historial-anterior`} className="cell-link">
                          {ficha.tradeName || ficha.businessName}
                        </Link>
                      ) : (
                        <span className="historico-tercero">{d.codigoTercero ? `Cód. ${d.codigoTercero}` : '—'}</span>
                      )}
                      {d.observaciones && <span className="historico-sub historico-obs">{d.observaciones}</span>}
                    </td>
                    <td className="amount">
                      {formatCurrency(d.total)}
                      {d.formaPago && <span className="historico-sub">{d.formaPago}</span>}
                    </td>
                  </tr>
                );
              })}
              {!cargando && docs.length === 0 && (
                <TableEmpty
                  colSpan={3}
                  icon={Search}
                  title="Nada con esos filtros"
                  hint="Prueba con menos letras o quita algún filtro."
                />
              )}
            </tbody>
          </table>
        </div>

        <div className="historico-pie">
          <span className="card-subtitle" style={{ marginTop: 0 }} aria-live="polite">
            {cargando || cargandoMas ? 'Cargando…' : `${docs.length.toLocaleString('es-ES')} de ${total.toLocaleString('es-ES')}`}
          </span>
          {!cargando && !cargandoMas && docs.length < total && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void verMas()}>
              Ver {Math.min(POR_PAGINA, total - docs.length)} más
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
