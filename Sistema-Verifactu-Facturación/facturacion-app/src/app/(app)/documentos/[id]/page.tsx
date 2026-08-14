'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Edit, Trash2, Ban, ArrowRight, Printer,
  FileText, CheckCircle, PackageCheck, FileSignature, AlertCircle,
  Copy, RotateCcw, WalletCards,
} from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import BotonDescargarPdf from '@/components/plantillas/BotonDescargarPdf';
import {
  getInvoiceById, getCompanySettings, saveDocumento,
  expedirAlbaranCompra, expedirAlbaranVenta, deleteInvoice,
} from '@/lib/storage';
import {
  Invoice, InvoiceStatus, CompanySettings, TipoDocumento,
} from '@/lib/types';
import { formatCurrency, formatDate, getStatusInfo } from '@/lib/utils';
import {
  etiquetaTipo, documentoConvertido, rectificar, actualizarContadorSerie,
} from '@/lib/documentos';
import { useToast } from '@/hooks/useToast';

export default function DocumentoDetallePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [documento, setDocumento] = useState<Invoice | null>(null);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  const { success, error: toastError } = useToast();

  const cargar = async () => {
    setLoading(true);
    try {
      const [doc, st] = await Promise.all([getInvoiceById(id), getCompanySettings()]);
      setDocumento(doc || null);
      setSettings(st);
    } catch {
      toastError('Error al cargar el documento');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, [id]);

  if (loading) return <PageSkeleton />;
  if (!documento || !settings) {
    return (
      <div className="page-container">
        <div className="card text-center" style={{ padding: 'var(--space-8)' }}>
          <h2>Documento no encontrado</h2>
          <p style={{ color: 'var(--color-text-muted)', margin: 'var(--space-4) 0' }}>
            El documento solicitado no existe o ha sido eliminado.
          </p>
          <Link href="/documentos" className="btn btn-primary">
            Volver al listado
          </Link>
        </div>
      </div>
    );
  }

  const tipo = documento.tipo ?? 'factura';
  const sentido = documento.sentido ?? 'venta';
  const esCompra = sentido === 'compra';
  const statusInfo = getStatusInfo(documento.status);

  // Acciones de conversión
  const handleConvertir = async (nuevoTipo: TipoDocumento) => {
    if (!settings) return;
    setProcessing(true);
    try {
      const nuevoDoc = documentoConvertido(documento, nuevoTipo, settings);
      const guardado = await saveDocumento(nuevoDoc);
      await actualizarContadorSerie(settings, `${nuevoTipo}_${sentido}`, guardado.number);
      success(`Convertido a ${etiquetaTipo(nuevoTipo)} ${guardado.number}`);
      router.push(`/documentos/${guardado.id}`);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al convertir documento');
    } finally {
      setProcessing(false);
    }
  };

  // Expedición de albaranes (actualiza stock)
  const handleExpedir = async () => {
    setProcessing(true);
    try {
      let actualizado: Invoice;
      if (esCompra) {
        actualizado = await expedirAlbaranCompra(documento.id);
        success(`Albarán de compra ${actualizado.number} expedido. Stock aumentado.`);
      } else {
        actualizado = await expedirAlbaranVenta(documento.id);
        success(`Albarán de venta ${actualizado.number} expedido. Stock descontado.`);
      }
      setDocumento(actualizado);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al expedir albarán');
    } finally {
      setProcessing(false);
    }
  };

  // Rectificación de factura
  const handleRectificar = async () => {
    if (!settings) return;
    if (!window.confirm(`¿Crear factura rectificativa para ${documento.number}?`)) return;
    setProcessing(true);
    try {
      const rect = rectificar(documento, settings);
      const guardado = await saveDocumento(rect);
      await actualizarContadorSerie(settings, `rectificativa_${sentido}`, guardado.number);
      success(`Factura rectificativa ${guardado.number} creada.`);
      router.push(`/documentos/${guardado.id}`);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al rectificar factura');
    } finally {
      setProcessing(false);
    }
  };

  // Anulación
  const handleAnular = async () => {
    if (!window.confirm(`¿Seguro que deseas anular el documento ${documento.number}?`)) return;
    setProcessing(true);
    try {
      const actualizado = await saveDocumento({ ...documento, status: InvoiceStatus.ANULADA });
      setDocumento(actualizado);
      success(`Documento ${documento.number} anulado`);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al anular documento');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Link href="/documentos" className="btn btn-ghost btn-sm">
            <ArrowLeft size={16} /> Volver
          </Link>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <h1 className="page-title">{etiquetaTipo(tipo)} {documento.number}</h1>
              <span className={`badge badge-${documento.status}`}>
                {statusInfo.label}
              </span>
              <span className={`badge ${esCompra ? 'badge-warning' : 'badge-neutral'}`}>
                {esCompra ? 'Compra' : 'Venta'}
              </span>
            </div>
            <p className="page-subtitle">Emitido el {formatDate(documento.issueDate)}</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {/* Botón Descargar PDF */}
          <BotonDescargarPdf
            documento={{
              tipo: tipo as any,
              documento: documento as any,
            }}
            settings={settings}
          />

          {/* Botón Editar si está en borrador */}
          {documento.status === InvoiceStatus.BORRADOR && (
            <Link href={`/documentos/${documento.id}/editar`} className="btn btn-outline btn-sm">
              <Edit size={14} /> Editar
            </Link>
          )}

          {/* Acciones para Presupuesto */}
          {tipo === 'presupuesto' && documento.status !== InvoiceStatus.ANULADA && (
            <>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => handleConvertir('pedido')}
                disabled={processing}
              >
                <ArrowRight size={14} /> Pasar a Pedido
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => handleConvertir('albaran')}
                disabled={processing}
              >
                <PackageCheck size={14} /> Pasar a Albarán
              </button>
            </>
          )}

          {/* Acciones para Pedido */}
          {tipo === 'pedido' && documento.status !== InvoiceStatus.ANULADA && (
            <>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => handleConvertir('albaran')}
                disabled={processing}
              >
                <PackageCheck size={14} /> Convertir en Albarán
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => handleConvertir('factura')}
                disabled={processing}
              >
                <FileSignature size={14} /> Facturar
              </button>
            </>
          )}

          {/* Acciones para Albarán */}
          {tipo === 'albaran' && documento.status !== InvoiceStatus.ANULADA && (
            <>
              {documento.status === InvoiceStatus.BORRADOR && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleExpedir}
                  disabled={processing}
                >
                  <CheckCircle size={14} /> Expedir Albarán ({esCompra ? '+Stock' : '-Stock'})
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => handleConvertir('factura')}
                disabled={processing}
              >
                <FileSignature size={14} /> Facturar Albarán
              </button>
            </>
          )}

          {/* Acciones para Factura */}
          {(tipo === 'factura' || tipo === 'rectificativa') && documento.status !== InvoiceStatus.ANULADA && (
            <>
              {documento.status !== InvoiceStatus.BORRADOR && (documento.total - (documento.paidAmount || 0)) > 0.01 && (
                <Link
                  href="/tesoreria"
                  className="btn btn-primary btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  <WalletCards size={14} /> Registrar {esCompra ? 'Pago' : 'Cobro'}
                </Link>
              )}
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={handleRectificar}
                disabled={processing}
              >
                <RotateCcw size={14} /> Rectificar
              </button>
            </>
          )}

          {/* Anular */}
          {documento.status !== InvoiceStatus.ANULADA && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleAnular}
              disabled={processing}
              style={{ color: 'var(--color-danger)' }}
            >
              <Ban size={14} /> Anular
            </button>
          )}
        </div>
      </div>

      {/* Origen encadenado */}
      {documento.documentoOrigenNumber && (
        <div className="card" style={{ marginBottom: 'var(--space-4)', backgroundColor: 'var(--color-bg-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <FileText size={16} color="var(--color-primary)" />
            <span>Documento de origen: <strong>{documento.documentoOrigenNumber}</strong></span>
            {documento.documentoOrigenId && (
              <Link href={`/documentos/${documento.documentoOrigenId}`} className="btn btn-ghost btn-xs">
                Ver original <ArrowRight size={12} />
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Grid de información */}
      <div className="grid-2-cols" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 'var(--space-3)' }}>
            {esCompra ? 'Datos del Proveedor' : 'Datos del Cliente'}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            <div style={{ fontWeight: 600, fontSize: 'var(--text-base)' }}>{documento.clientName}</div>
            {documento.clientNif && <div><strong>NIF:</strong> {documento.clientNif}</div>}
            {documento.clientAddress && <div><strong>Dirección:</strong> {documento.clientAddress}</div>}
          </div>
        </div>

        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 'var(--space-3)' }}>Condiciones y Fechas</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            <div><strong>Fecha de emisión:</strong> {formatDate(documento.issueDate)}</div>
            {documento.dueDate && <div><strong>Fecha de vencimiento:</strong> {formatDate(documento.dueDate)}</div>}
            {documento.paymentMethod && <div><strong>Forma de pago:</strong> {documento.paymentMethod}</div>}
            {documento.notes && (
              <div style={{ marginTop: 'var(--space-2)' }}>
                <strong>Observaciones:</strong>
                <p style={{ color: 'var(--color-text-muted)', margin: 0 }}>{documento.notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabla de Líneas */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 'var(--space-4)' }}>
        <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border)' }}>
          <h3 className="card-title" style={{ margin: 0 }}>Líneas de {etiquetaTipo(tipo).toLowerCase()}</h3>
        </div>
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Ref.</th>
                <th>Descripción</th>
                <th style={{ textAlign: 'right' }}>Cantidad</th>
                <th style={{ textAlign: 'right' }}>Precio Unit.</th>
                <th style={{ textAlign: 'right' }}>Dto. %</th>
                <th style={{ textAlign: 'right' }}>{settings.igicEnabled ? 'IGIC' : 'IVA'}</th>
                <th style={{ textAlign: 'right' }}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {documento.lineItems.map(li => (
                <tr key={li.id}>
                  <td style={{ color: 'var(--color-text-muted)' }}>{li.productRef || '—'}</td>
                  <td style={{ fontWeight: 500 }}>{li.productName}</td>
                  <td style={{ textAlign: 'right' }}>{li.quantity} {li.unit || ''}</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(li.unitPrice)}</td>
                  <td style={{ textAlign: 'right' }}>{li.discountPercent ? `${li.discountPercent}%` : '—'}</td>
                  <td style={{ textAlign: 'right' }}>{li.taxRate}%</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatCurrency(li.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Totales */}
      <div className="card">
        <div className="invoice-totals">
          <div className="invoice-totals-table">
            <div className="invoice-totals-row">
              <span className="label">Base imponible</span>
              <span className="value">{formatCurrency(documento.subtotal)}</span>
            </div>
            {documento.totalDiscount > 0 && (
              <div className="invoice-totals-row">
                <span className="label">Descuentos</span>
                <span className="value" style={{ color: 'var(--color-danger)' }}>
                  -{formatCurrency(documento.totalDiscount)}
                </span>
              </div>
            )}
            {documento.taxBreakdown.map(tb => (
              <div className="invoice-totals-row" key={tb.rate}>
                <span className="label">
                  {settings.igicEnabled ? 'IGIC' : 'IVA'} {tb.rate}% (base {formatCurrency(tb.base)})
                </span>
                <span className="value">{formatCurrency(tb.amount)}</span>
              </div>
            ))}
            <div className="invoice-totals-row total">
              <span className="label">TOTAL</span>
              <span className="value">{formatCurrency(documento.total)}</span>
            </div>

            {(tipo === 'factura' || tipo === 'rectificativa') && (
              <>
                <div className="invoice-totals-row" style={{ borderTop: '1px dashed var(--color-border)', marginTop: 'var(--space-2)', paddingTop: 'var(--space-2)' }}>
                  <span className="label" style={{ color: 'var(--color-text-muted)' }}>Cobrado / Pagado</span>
                  <span className="value" style={{ color: 'var(--color-text-muted)' }}>
                    {formatCurrency(documento.paidAmount || 0)}
                  </span>
                </div>
                <div className="invoice-totals-row" style={{ fontWeight: 700 }}>
                  <span className="label">Saldo Pendiente</span>
                  <span className="value" style={{ color: (documento.total - (documento.paidAmount || 0)) > 0.01 ? (esCompra ? 'var(--color-danger)' : 'var(--color-warning)') : 'var(--color-success)' }}>
                    {formatCurrency(Math.max(0, documento.total - (documento.paidAmount || 0)))}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
