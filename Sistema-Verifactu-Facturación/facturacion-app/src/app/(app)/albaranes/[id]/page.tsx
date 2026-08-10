'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Truck, FileText, Ban, Trash2, Printer, ClipboardList, Loader2, FileWarning, CheckCircle2, Building2, Calendar
} from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import {
  getAlbaranById, getCompanySettings, expedirAlbaran, anularAlbaran, deleteAlbaran,
  convertirAlbaranesAFactura
} from '@/lib/storage';
import { Albaran, CompanySettings } from '@/lib/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { ALBARAN_STATUSES, getTaxLabel } from '@/lib/constants';
import { useToast } from '@/hooks/useToast';

export default function AlbaranDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const [albaran, setAlbaran] = useState<Albaran | null>(null);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [mounted, setMounted] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    (async () => {
      const id = params.id as string;
      const [a, settings] = await Promise.all([getAlbaranById(id), getCompanySettings()]);
      setAlbaran(a || null);
      setCompanySettings(settings);
      setMounted(true);
    })();
  }, [params.id]);

  const statusLabel = ALBARAN_STATUSES.find(s => s.value === albaran?.status)?.label ?? albaran?.status ?? '';

  const handleExpedir = async () => {
    if (!albaran) return;
    const ok = confirm(
      `¿Expedir el albarán ${albaran.number}?\n\n` +
      'El stock de los productos se descuenta y el albarán pasa a "Expedido". Ya no podrá editarse.'
    );
    if (!ok) return;
    setWorking(true);
    try {
      const updated = await expedirAlbaran(albaran.id);
      setAlbaran(updated);
      success('Albarán expedido', `${albaran.number} · stock descontado`);
    } catch (err) {
      toastError('No se pudo expedir', err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setWorking(false);
    }
  };

  const handleAnular = async () => {
    if (!albaran) return;
    const reason = prompt(
      `Anular el albarán ${albaran.number}.\n\n` +
      'El albarán queda registrado como anulado. Indica el motivo:'
    );
    if (reason === null) return;
    if (!reason.trim()) {
      toastError('Motivo obligatorio', 'La anulación debe quedar justificada.');
      return;
    }
    setWorking(true);
    try {
      const updated = await anularAlbaran(albaran.id);
      setAlbaran(updated);
      success('Albarán anulado', `${albaran.number} · motivo registrado`);
    } catch (err) {
      toastError('No se pudo anular', err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setWorking(false);
    }
  };

  const handleConvertir = async () => {
    if (!albaran) return;
    const ok = confirm(
      `Convertir el albarán ${albaran.number} en factura.\n\n` +
      'Se creará una factura borrador con sus líneas y el albarán quedará marcado como "Facturado".\n\n' +
      'La factura nace como borrador: revísala antes de emitirla.'
    );
    if (!ok) return;
    setWorking(true);
    try {
      const invoices = await convertirAlbaranesAFactura([albaran.id]);
      success('Albarán convertido', `${invoices.length} factura creada`);
      router.push(`/facturas/${invoices[0].id}`);
    } catch (err) {
      toastError('No se pudo convertir', err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setWorking(false);
    }
  };

  const handleDelete = async () => {
    if (!albaran) return;
    const ok = confirm(`¿Eliminar el borrador ${albaran.number}? Esta acción no se puede deshacer.`);
    if (!ok) return;
    setWorking(true);
    try {
      await deleteAlbaran(albaran.id);
      success('Borrador eliminado', albaran.number);
      router.push('/albaranes');
    } catch (err) {
      toastError('No se pudo eliminar', err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setWorking(false);
    }
  };

  if (!mounted) {
    return <PageSkeleton variant="detail" label="Cargando el albarán" />;
  }

  if (!albaran) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon"><FileWarning strokeWidth={1.6} /></span>
        <h2 className="empty-state-title">Este albarán ya no está</h2>
        <p className="empty-state-description">
          O era un borrador que se eliminó, o el enlace apunta a un número que no existe en tu serie.
        </p>
        <div className="empty-state-actions">
          <Link href="/albaranes" className="btn btn-primary"><ArrowLeft size={16} /> Volver al listado</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <Link href="/albaranes" className="page-back">
            <ArrowLeft /> Albaranes
          </Link>
          <div className="page-title-row">
            <h1 className="page-title" style={{ fontFamily: 'var(--font-mono)', letterSpacing: '-0.01em' }}>
              {albaran.number}
            </h1>
            <span className={`badge badge-${albaran.status}`}>
              <span className="badge-dot" />
              {statusLabel}
            </span>
            {albaran.status === 'expedido' && (
              <span className="badge badge-info"><Truck size={11} /> En el almacén del cliente</span>
            )}
            {albaran.status === 'facturado' && (
              <span className="badge badge-success"><CheckCircle2 size={11} /> Facturado</span>
            )}
          </div>
          <p className="page-subtitle">
            {albaran.clientName} · fechado el {formatDate(albaran.issueDate)}
          </p>
        </div>
        <div className="page-header-actions">
          {albaran.status === 'borrador' && (
            <>
              <button className="btn btn-danger" onClick={handleDelete} disabled={working}>
                <Trash2 size={16} /> Eliminar
              </button>
              <button className="btn btn-primary" onClick={handleExpedir} disabled={working}>
                {working ? <Loader2 size={16} className="spin" /> : <Truck size={16} />} {working ? 'Expidiendo…' : 'Expedir y descontar stock'}
              </button>
            </>
          )}
          {albaran.status === 'expedido' && (
            <>
              <button className="btn btn-danger" onClick={handleAnular} disabled={working}>
                <Ban size={16} /> Anular
              </button>
              <button className="btn btn-primary" onClick={handleConvertir} disabled={working}>
                {working ? <Loader2 size={16} className="spin" /> : <FileText size={16} />} {working ? 'Convirtiendo…' : 'Convertir a factura'}
              </button>
            </>
          )}
          {albaran.status === 'facturado' && albaran.invoiceId && (
            <Link href={`/facturas/${albaran.invoiceId}`} className="btn btn-primary">
              <FileText size={16} /> Ver la factura
            </Link>
          )}
          <button className="btn btn-ghost" onClick={() => window.print()} title="Imprimir o guardar PDF">
            <Printer size={16} />
          </button>
        </div>
      </div>

      <div className="detail-layout">
        {/* Print-ready preview */}
        <div className="detail-main">
          <div className="invoice-preview">
            <div className="invoice-preview-header">
              <div>
                <div className="company-name">{companySettings?.tradeName || companySettings?.businessName}</div>
                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px', lineHeight: 1.6 }}>
                  {companySettings?.businessName}<br />
                  NIF: {companySettings?.nif}<br />
                  {companySettings?.address}<br />
                  {companySettings?.postalCode} {companySettings?.city} ({companySettings?.province})<br />
                  {companySettings?.email} · {companySettings?.phone}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="invoice-number-label">{albaran.number}</div>
                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '8px', lineHeight: 1.6 }}>
                  Fecha: {formatDate(albaran.issueDate)}
                </div>
              </div>
            </div>

            <div style={{
              background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px',
              marginBottom: '24px', fontSize: '13px', lineHeight: 1.6
            }}>
              <strong style={{ color: '#0f172a' }}>Entregar a:</strong><br />
              <strong>{albaran.clientName}</strong><br />
              NIF/CIF: {albaran.clientNif}<br />
              {albaran.clientAddress}
            </div>

            <table className="invoice-preview-table">
              <thead>
                <tr>
                  <th>Ref.</th>
                  <th>Descripción</th>
                  <th style={{ textAlign: 'right' }}>Cant.</th>
                  <th style={{ textAlign: 'right' }}>Precio</th>
                  <th style={{ textAlign: 'right' }}>{getTaxLabel(companySettings)}</th>
                  <th style={{ textAlign: 'right' }}>Dto.</th>
                  <th style={{ textAlign: 'right' }}>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {albaran.lineItems.map(line => (
                  <tr key={line.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: '12px', color: '#64748b' }}>{line.productRef}</td>
                    <td style={{ color: '#0f172a', fontWeight: 600 }}>{line.productName}</td>
                    <td style={{ textAlign: 'right' }}>{line.quantity} {line.unit}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(line.unitPrice)}</td>
                    <td style={{ textAlign: 'right' }}>{line.taxRate}%</td>
                    <td style={{ textAlign: 'right' }}>{line.discountPercent > 0 ? `${line.discountPercent}%` : '-'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{formatCurrency(line.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="invoice-preview-totals">
              <table>
                <tbody>
                  <tr>
                    <td style={{ color: '#64748b' }}>Base imponible</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatCurrency(albaran.subtotal)}</td>
                  </tr>
                  {albaran.totalDiscount > 0 && (
                    <tr>
                      <td style={{ color: '#64748b' }}>Descuentos</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: '#ef4444' }}>-{formatCurrency(albaran.totalDiscount)}</td>
                    </tr>
                  )}
                  {albaran.taxBreakdown.map(tb => (
                    <tr key={tb.rate}>
                      <td style={{ color: '#64748b' }}>{getTaxLabel(companySettings)} {tb.rate}%</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatCurrency(tb.amount)}</td>
                    </tr>
                  ))}
                  <tr className="total-row">
                    <td style={{ paddingTop: '12px' }}>TOTAL ALBARÁN</td>
                    <td style={{ textAlign: 'right', paddingTop: '12px' }}>{formatCurrency(albaran.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {albaran.notes && (
              <div style={{ marginTop: '24px', fontSize: '13px', color: '#475569' }}>
                <strong>Observaciones:</strong> {albaran.notes}
              </div>
            )}

            <div style={{ marginTop: '36px', paddingTop: '20px', borderTop: '2px dashed #cbd5e1', display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b' }}>
              <span>Documento de entrega sin valor fiscal. La facturación se emite al convertir este albarán.</span>
              <span>Firma y sello del cliente: ______________</span>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="detail-sidebar">
          <div className="card">
            <h4 className="card-title" style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}>Detalles del registro</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
                <Calendar size={14} style={{ color: 'var(--text-muted)' }} />
                <span style={{ color: 'var(--text-tertiary)' }}>Fecha:</span>
                <span>{formatDate(albaran.issueDate)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
                <Building2 size={14} style={{ color: 'var(--text-muted)' }} />
                <span style={{ color: 'var(--text-tertiary)' }}>Cliente:</span>
                <span style={{ color: 'var(--text-primary)' }}>{albaran.clientName}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
                <ClipboardList size={14} style={{ color: 'var(--text-muted)' }} />
                <span style={{ color: 'var(--text-tertiary)' }}>Estado:</span>
                <span>{statusLabel}</span>
              </div>
            </div>
          </div>

          <div className="card">
            <h4 className="card-title" style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}>Importes</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}>
                <span style={{ color: 'var(--text-tertiary)' }}>Base imponible</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{formatCurrency(albaran.subtotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}>
                <span style={{ color: 'var(--text-tertiary)' }}>Cuota {getTaxLabel(companySettings)}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{formatCurrency(albaran.totalTax)}</span>
              </div>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                paddingTop: 'var(--space-2)', borderTop: '2px solid var(--accent-500)',
                marginTop: 'var(--space-1)',
              }}>
                <span style={{ fontWeight: 700, fontSize: 'var(--text-md)' }}>TOTAL</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 'var(--text-lg)', color: 'var(--accent-400)' }}>
                  {formatCurrency(albaran.total)}
                </span>
              </div>
            </div>
          </div>

          <div className="card">
            <h4 className="card-title" style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}>Acciones</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <button className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => window.print()}>
                <Printer size={14} /> Imprimir / PDF
              </button>
              {albaran.status === 'borrador' && (
                <button className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={handleExpedir} disabled={working}>
                  <Truck size={14} /> Expedir y descontar stock
                </button>
              )}
              {albaran.status === 'expedido' && (
                <button className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={handleConvertir} disabled={working}>
                  <FileText size={14} /> Convertir a factura
                </button>
              )}
            </div>
          </div>

          <div className="callout callout-info">
            <FileWarning size={16} />
            <div>
              <strong>Sin valor fiscal</strong>
              <p>
                El albarán documenta la entrega. Los importes e impuestos se facturan
                cuando lo conviertes en factura.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
