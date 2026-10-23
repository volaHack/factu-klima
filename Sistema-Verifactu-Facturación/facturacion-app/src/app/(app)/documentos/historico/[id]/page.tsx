'use client';

/**
 * UN DOCUMENTO DEL PROGRAMA ANTERIOR
 *
 * Lo que trajo la copia de ISECAN de una factura, un albarán o un pedido:
 * la fecha, el cliente o proveedor, los totales por tipo de impuesto y con
 * qué otros documentos se enlaza (el albarán con su factura). Las líneas de
 * artículos no venían en la copia.
 *
 * Solo consulta (ver lib/historico): no se cambia, no pasa por Veri*Factu
 * y no cuenta en los modelos ni en la contabilidad.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { getCompanySettings } from '@/lib/storage';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  ETIQUETA_TIPO, NOMBRE_ORIGEN, estadoDeHistorico, getDetalleHistorico, numeroVisible, tipoYEstado,
  type DetalleHistorico, type DocumentoHistorico,
} from '@/lib/historico';

function Enlazados({ titulo, docs }: { titulo: string; docs: DocumentoHistorico[] }) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 'var(--space-4)' }}>
      <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--border-color)' }}>
        <h3 className="card-title" style={{ margin: 0 }}>{titulo}</h3>
      </div>
      <div className="table-container" style={{ border: 'none' }}>
        <table className="table">
          <tbody>
            {docs.map(d => (
              <tr key={d.id}>
                <td>
                  <Link href={`/documentos/historico/${d.id}`} className="cell-link">
                    {ETIQUETA_TIPO[d.tipo]} {numeroVisible(d)}
                  </Link>
                </td>
                <td>{d.fecha ? formatDate(d.fecha) : '—'}</td>
                <td className="amount">{formatCurrency(d.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function DocumentoHistoricoPage() {
  const params = useParams();
  const id = params.id as string;

  // El detalle va con el documento que se pidió: al saltar a otro enlazado,
  // hasta que llega se está cargando.
  const [detalle, setDetalle] = useState<{ id: string; d: DetalleHistorico | null; error: string } | null>(null);
  const [impuesto, setImpuesto] = useState('IGIC');

  useEffect(() => {
    let vivo = true;
    Promise.all([getDetalleHistorico(id), getCompanySettings().catch(() => null)])
      .then(([d, ajustes]) => {
        if (!vivo) return;
        setDetalle({ id, d, error: '' });
        if (ajustes) setImpuesto(ajustes.igicEnabled ? 'IGIC' : 'IVA');
      })
      .catch(e => { if (vivo) setDetalle({ id, d: null, error: e instanceof Error ? e.message : String(e) }); });
    return () => { vivo = false; };
  }, [id]);

  const actual = detalle?.id === id ? detalle : null;
  if (!actual) return <PageSkeleton />;

  if (!actual.d) {
    return (
      <div className="page-container">
        <div className="card text-center" style={{ padding: 'var(--space-8)' }}>
          <h2>Documento no encontrado</h2>
          <p style={{ color: 'var(--text-muted)', margin: 'var(--space-4) 0' }}>
            {actual.error ? `No se pudo leer: ${actual.error}` : 'Este documento del programa anterior no está en tu cuenta.'}
          </p>
          <Link href="/documentos" className="btn btn-primary">Volver al listado</Link>
        </div>
      </div>
    );
  }

  const { doc, cliente, clienteNif, pasoA, vieneDe } = actual.d;
  const origen = NOMBRE_ORIGEN[doc.origen] ?? 'el programa anterior';
  const esCompra = doc.tipo.endsWith('compra');
  const { tipo, estado } = tipoYEstado(doc);
  const nombre = cliente || (doc.codigoTercero ? `Código ${doc.codigoTercero} (sin ficha)` : 'Sin cliente');

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Link href="/documentos" className="btn btn-ghost btn-sm">
            <ArrowLeft size={16} /> Volver
          </Link>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <h1 className="page-title">{ETIQUETA_TIPO[doc.tipo]} {numeroVisible(doc)}</h1>
              <span className={`badge badge-${estado}`}>{estadoDeHistorico({ tipo, estado })}</span>
              <span className={`badge ${esCompra ? 'badge-warning' : 'badge-neutral'}`}>{esCompra ? 'Compra' : 'Venta'}</span>
            </div>
            <p className="page-subtitle">
              {doc.fecha ? `Emitido el ${formatDate(doc.fecha)} en ${origen}` : `Emitido en ${origen}, sin fecha`}
            </p>
          </div>
        </div>
      </div>

      <div className="callout" style={{ marginBottom: 'var(--space-4)' }}>
        <p>
          Viene de {origen} y es solo para consultar: no se puede cambiar, no pasa por Veri*Factu y no cuenta
          en los modelos ni en la contabilidad. La copia de {origen} trae los totales de cada documento, no sus
          líneas de artículos.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 'var(--space-3)' }}>
            {esCompra ? 'Proveedor' : 'Cliente'}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            <div style={{ fontWeight: 600, fontSize: 'var(--text-base)' }}>
              {doc.clientId
                ? <Link href={`/clientes/${doc.clientId}#historial-anterior`} className="cell-link">{nombre}</Link>
                : nombre}
            </div>
            {clienteNif && <div><strong>NIF:</strong> {clienteNif}</div>}
            {doc.codigoTercero && <div><strong>Código en {origen}:</strong> {doc.codigoTercero}</div>}
          </div>
        </div>

        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 'var(--space-3)' }}>Condiciones</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            <div><strong>Fecha:</strong> {doc.fecha ? formatDate(doc.fecha) : 'sin fecha'}</div>
            {doc.formaPago && <div><strong>Forma de pago:</strong> {doc.formaPago}</div>}
            {doc.observaciones && (
              <div style={{ marginTop: 'var(--space-2)' }}>
                <strong>Observaciones:</strong>
                <p style={{ color: 'var(--text-muted)', margin: 0 }}>{doc.observaciones}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {pasoA.length > 0 && <Enlazados titulo="Pasó a" docs={pasoA} />}
      {vieneDe.length > 0 && (
        <Enlazados titulo={tipo === 'factura' ? 'Albaranes de esta factura' : 'Viene de'} docs={vieneDe} />
      )}

      <div className="card">
        {estado === 'pendiente' && (
          <p className="card-subtitle" style={{ marginTop: 0 }}>
            {tipo === 'pedido' ? 'Este pedido no llegó a servirse' : 'Este albarán no llegó a facturarse'} en {origen}.
          </p>
        )}
        {esCompra && doc.total === 0 && (
          <p className="card-subtitle" style={{ marginTop: 0 }}>En {origen} esta compra se apuntó sin importe.</p>
        )}
        <div className="invoice-totals">
          <div className="invoice-totals-table">
            <div className="invoice-totals-row">
              <span className="label">Base imponible</span>
              <span className="value">{formatCurrency(doc.base)}</span>
            </div>
            {doc.bases.map(b => (
              <div className="invoice-totals-row" key={b.tipo}>
                <span className="label">{impuesto} {b.tipo}% (base {formatCurrency(b.base)})</span>
                <span className="value">{formatCurrency(b.cuota)}</span>
              </div>
            ))}
            <div className="invoice-totals-row total">
              <span className="label">TOTAL</span>
              <span className="value">{formatCurrency(doc.total)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
