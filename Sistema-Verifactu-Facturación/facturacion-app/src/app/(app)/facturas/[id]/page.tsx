'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Edit, Copy, Ban, CheckCircle, Printer,
  Calendar, Building2, CreditCard, ShieldCheck, Check,
  Send, Link2, MessageSquare, Clock, CheckCircle2, XCircle, AlertTriangle,
  Fingerprint, FileWarning, Loader2, Trash2,
} from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import BotonDescargarPdf, { BotonVistaPreviaPdf, AvisoSinPlantilla } from '@/components/plantillas/BotonDescargarPdf';
import DeleteInvoiceModal from '@/components/facturas/DeleteInvoiceModal';
import {
  getInvoiceById, saveInvoice, getCompanySettings, createOrderApproval,
  getApprovalByInvoiceId, getApprovalItems, issueInvoice, isSealed, getOnboardingStatus,
} from '@/lib/storage';
import { Invoice, InvoiceStatus, CompanySettings, OrderApproval, OrderApprovalItem } from '@/lib/types';
import { formatCurrency, formatDate, generateId, getStatusInfo } from '@/lib/utils';
import { PAYMENT_METHODS } from '@/lib/constants';
import { descuentoEfectivo } from '@/lib/documentos';
import { useToast } from '@/hooks/useToast';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const { rejections } = useOnlineStatus();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [mounted, setMounted] = useState(false);
  const [copiedIban, setCopiedIban] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [approval, setApproval] = useState<OrderApproval | null>(null);
  const [approvalItems, setApprovalItems] = useState<OrderApprovalItem[]>([]);
  const [sendingApproval, setSendingApproval] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [borrando, setBorrando] = useState(false);

  useEffect(() => {
    (async () => {
      const id = params.id as string;
      const [inv, settings] = await Promise.all([getInvoiceById(id), getCompanySettings()]);
      setInvoice(inv || null);
      setCompanySettings(settings);
      setMounted(true);

      // Load approval if exists
      if (inv) {
        const appr = await getApprovalByInvoiceId(inv.id);
        if (appr) {
          setApproval(appr);
          if (appr.status !== 'pending') {
            const items = await getApprovalItems(appr.id);
            setApprovalItems(items);
          }
        }
      }
    })();
  }, [params.id]);

  const handleMarkPaid = async () => {
    if (!invoice) return;
    try {
      const updated = {
        ...invoice,
        status: InvoiceStatus.PAGADA,
        paidDate: new Date().toISOString().split('T')[0],
        updatedAt: new Date().toISOString(),
      };
      await saveInvoice(updated);
      setInvoice(updated);
      success('Factura marcada como pagada', invoice.number);
    } catch (err) {
      toastError('No se pudo actualizar', err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  /**
   * Emite la factura. Es el punto de no retorno: el servidor le asigna
   * su posición en la cadena y calcula la huella. A partir de aquí ya
   * no se puede editar ni borrar.
   */
  const handleIssue = async () => {
    if (!invoice) return;

    // Validar que el onboarding esté completo
    const obStatus = await getOnboardingStatus();
    if (!obStatus.isComplete) {
      toastError('Completa los primeros pasos', obStatus.message);
      return;
    }

    const ok = confirm(
      `¿Emitir la factura ${invoice.number}?\n\n` +
      'Al emitirla queda sellada con su huella SHA-256 y ya no podrá modificarse ' +
      'ni eliminarse. Para corregirla habría que anularla o rectificarla.'
    );
    if (!ok) return;

    setIssuing(true);
    try {
      const issued = await issueInvoice(invoice);
      setInvoice(issued);
      success('Factura emitida y sellada', `Huella ${issued.verifactu?.chainedHash?.slice(0, 12) ?? ''}…`);
    } catch (err) {
      toastError('No se pudo emitir', err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setIssuing(false);
    }
  };

  /**
   * Qué pasa al terminar en el modal de eliminar/anular.
   *
   * Un borrador desaparece de verdad, así que no hay ficha a la que
   * volver: se vuelve al listado. Una factura emitida sigue existiendo
   * anulada, así que se recarga para verla en su nuevo estado, con el
   * motivo ya visible.
   */
  const trasEliminarOAnular = async (mensaje: string) => {
    if (!invoice || !isSealed(invoice)) {
      success('Borrador eliminado', mensaje);
      router.push('/facturas');
      return;
    }
    success('Factura anulada', mensaje);
    setInvoice(await getInvoiceById(invoice.id) || null);
  };

  const handleDuplicate = async () => {
    if (!invoice) return;
    const newInv: Invoice = {
      ...invoice,
      id: generateId(),
      number: `${invoice.number}-COPIA`,
      status: InvoiceStatus.BORRADOR,
      paidDate: undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveInvoice(newInv);
    success('Factura duplicada', `Copia creada: ${newInv.number}`);
    router.push(`/facturas/${newInv.id}`);
  };

  const handleCopyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
    success('Huella copiada', 'Puedes usarla para verificar la factura');
  };

  const handleCopyIban = (iban: string) => {
    navigator.clipboard.writeText(iban);
    setCopiedIban(true);
    setTimeout(() => setCopiedIban(false), 2000);
    success('Copiado', 'IBAN copiado al portapapeles');
  };

  const handleSendForApproval = async () => {
    if (!invoice) return;
    setSendingApproval(true);
    const appr = await createOrderApproval(invoice.id);
    setSendingApproval(false);
    if (appr) {
      setApproval(appr);
      setInvoice({ ...invoice, status: InvoiceStatus.PRE_APROBACION });
      success('Enlace de aprobación creado', 'Comparte el enlace con tu cliente');
    }
  };

  const getApprovalLink = () => {
    if (!approval) return '';
    return `${window.location.origin}/aprobar/${approval.token}`;
  };

  const handleCopyApprovalLink = () => {
    navigator.clipboard.writeText(getApprovalLink());
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
    success('Enlace copiado', 'Compártelo con tu cliente por WhatsApp o email');
  };

  const handleShareWhatsApp = () => {
    const link = getApprovalLink();
    const text = `Hola, te envío el pedido ${invoice!.number} para tu revisión antes de la entrega.\n\nPulsa aquí para revisar y confirmar:\n${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  if (!mounted) {
    return <PageSkeleton variant="detail" label="Cargando la factura" />;
  }

  if (!invoice) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon"><FileWarning strokeWidth={1.6} /></span>
        <h2 className="empty-state-title">Esta factura ya no está</h2>
        <p className="empty-state-description">
          O era un borrador que se eliminó, o el enlace apunta a un número que no existe en tu
          serie. Las facturas emitidas nunca se borran, así que si estaba emitida seguirá en el
          listado.
        </p>
        <div className="empty-state-actions">
          <Link href="/facturas" className="btn btn-primary"><ArrowLeft size={16} /> Volver al listado</Link>
        </div>
      </div>
    );
  }


  const pmLabel = PAYMENT_METHODS.find(pm => pm.value === invoice.paymentMethod)?.label || '';

  // Huella real. Antes aquí había un hash inventado en el cliente que se
  // enseñaba como si fuera una firma fiscal: parecía que la factura
  // estaba sellada cuando no lo estaba.
  const chainedHash = invoice.verifactu?.chainedHash ?? null;
  const sealed = isSealed(invoice);
  const rechazo = invoice
    ? rejections.find(r => r.table === 'invoices' && r.id === invoice.id)
    : undefined;

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <Link href="/facturas" className="page-back">
            <ArrowLeft /> Facturas
          </Link>
          <div className="page-title-row">
            <h1 className="page-title" style={{ fontFamily: 'var(--font-mono)', letterSpacing: '-0.01em' }}>
              {invoice.number}
            </h1>
            <span className={`badge badge-${invoice.status}`}>
              <span className="badge-dot" />
              {getStatusInfo(invoice.status).label}
            </span>
            {sealed && (
              <span className="verifactu-badge"><Fingerprint size={11} /> Sellada</span>
            )}
            {rechazo && (
              <span className="badge badge-warning" title={rechazo.reason}>
                <AlertTriangle size={11} style={{ verticalAlign: '-1px', marginRight: 2 }} />
                No registrada en el servidor
              </span>
            )}
          </div>
          <p className="page-subtitle">
            {invoice.clientName} · emitida el {formatDate(invoice.issueDate)} · vence el {formatDate(invoice.dueDate)}
          </p>
        </div>
        <div className="page-header-actions">
          {invoice.status === InvoiceStatus.BORRADOR && (
            <>
              <Link href={`/facturas/${invoice.id}/editar`} className="btn btn-secondary">
                <Edit size={16} /> Editar
              </Link>
              <button className="btn btn-secondary" onClick={handleSendForApproval} disabled={sendingApproval}>
                {sendingApproval ? <Loader2 size={16} className="spin" /> : <Send size={16} />} {sendingApproval ? 'Generando…' : 'Enviar para aprobación'}
              </button>
              <button className="btn btn-primary" onClick={handleIssue} disabled={issuing}>
                {issuing ? <Loader2 size={16} className="spin" /> : <ShieldCheck size={16} />} {issuing ? 'Sellando…' : 'Emitir y sellar'}
              </button>
            </>
          )}
          {invoice.status !== InvoiceStatus.BORRADOR && invoice.status !== InvoiceStatus.PRE_APROBACION && (
            <button className="btn btn-secondary" onClick={handleDuplicate}>
              <Copy size={16} /> Duplicar
            </button>
          )}
          {(invoice.status === InvoiceStatus.PENDIENTE || invoice.status === InvoiceStatus.EMITIDA || invoice.status === InvoiceStatus.VENCIDA) && (
            <button className="btn btn-primary" onClick={handleMarkPaid}>
              <CheckCircle size={16} /> Marcar como pagada
            </button>
          )}
          {/* Un solo botón para las dos cosas, porque para quien lo pulsa es
              la misma intención: quitar de en medio una factura que no
              debería estar. Lo que cambia es lo que la ley permite hacer con
              ella, y eso lo resuelve el modal — un borrador se borra de
              verdad; una emitida se anula dejando el motivo, porque romper
              la cadena sellada es justo lo que Veri*Factu impide. */}
          {invoice.status !== InvoiceStatus.ANULADA && invoice.status !== InvoiceStatus.PAGADA && (
            <button className="btn btn-danger" onClick={() => setBorrando(true)}>
              {sealed ? <><Ban size={16} /> Anular</> : <><Trash2 size={16} /> Eliminar borrador</>}
            </button>
          )}
          <BotonVistaPreviaPdf tipo="factura" documento={invoice} />
          <BotonDescargarPdf tipo="factura" documento={invoice} />
          <button className="btn btn-ghost" onClick={() => window.print()} title="Imprimir o guardar PDF">
            <Printer size={16} />
          </button>
        </div>
      </div>

      {/* Por qué se anuló. El motivo se venía guardando desde siempre pero
          no se leía en ninguna parte: quien anulaba una factura no podía
          volver a ver más tarde por qué lo hizo, que es justo lo que
          pregunta una inspección. */}
      {invoice.status === InvoiceStatus.ANULADA && (
        <div className="status-panel status-panel--danger" style={{ marginBottom: 'var(--space-5)' }}>
          <span className="status-panel-icon"><Ban size={18} /></span>
          <div className="status-panel-body">
            <div className="status-panel-title">
              Factura anulada
              {invoice.cancelledAt && ` el ${formatDate(invoice.cancelledAt)}`}
            </div>
            <p className="status-panel-text">
              {invoice.cancelReason
                ? `Motivo: ${invoice.cancelReason}`
                : 'No se guardó el motivo de la anulación.'}
              {' '}Sigue contando en los libros y conserva su huella sellada: anular no es borrar.
            </p>
          </div>
        </div>
      )}

      <div className="detail-layout">
        {/* Main Content - Print Ready Preview */}
        <div className="detail-main">
          <div className="invoice-preview">
            {/* Header */}
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
                <div className="invoice-number-label">{invoice.number}</div>
                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '8px', lineHeight: 1.6 }}>
                  Fecha emisión: {formatDate(invoice.issueDate)}<br />
                  Vencimiento: {formatDate(invoice.dueDate)}<br />
                  {invoice.paidDate && <>Pagada el: {formatDate(invoice.paidDate)}<br /></>}
                </div>
              </div>
            </div>

            {/* Client Info */}
            <div style={{
              background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px',
              marginBottom: '24px', fontSize: '13px', lineHeight: 1.6
            }}>
              <strong style={{ color: '#0f172a' }}>Facturar a:</strong><br />
              <strong>{invoice.clientName}</strong><br />
              NIF/CIF: {invoice.clientNif}<br />
              {invoice.clientAddress}
            </div>

            {/* Line Items Table */}
            <table className="invoice-preview-table">
              <thead>
                <tr>
                  <th>Ref.</th>
                  <th>Descripción</th>
                  <th style={{ textAlign: 'right' }}>Cant.</th>
                  <th style={{ textAlign: 'right' }}>Precio</th>
                  <th style={{ textAlign: 'right' }}>IVA</th>
                  <th style={{ textAlign: 'right' }}>Dto.</th>
                  <th style={{ textAlign: 'right' }}>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lineItems.map(line => (
                  <tr key={line.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: '12px', color: '#64748b' }}>{line.productRef}</td>
                    <td style={{ color: '#0f172a', fontWeight: 600 }}>{line.productName}</td>
                    <td style={{ textAlign: 'right' }}>{line.quantity} {line.unit}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(line.unitPrice)}</td>
                    <td style={{ textAlign: 'right' }}>{line.taxRate}%</td>
                    <td style={{ textAlign: 'right' }} title={
                      (line.discountPercent2 || line.discountPercent3)
                        ? `En cascada: ${[line.discountPercent, line.discountPercent2, line.discountPercent3].filter(Boolean).join('% + ')}%`
                        : undefined
                    }>
                      {descuentoEfectivo(line) > 0 ? `${descuentoEfectivo(line)}%` : '-'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{formatCurrency(line.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals */}
            <div className="invoice-preview-totals">
              <table>
                <tbody>
                  <tr>
                    <td style={{ color: '#64748b' }}>Base imponible</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatCurrency(invoice.subtotal)}</td>
                  </tr>
                  {invoice.totalDiscount > 0 && (
                    <tr>
                      <td style={{ color: '#64748b' }}>Descuentos</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: '#ef4444' }}>-{formatCurrency(invoice.totalDiscount)}</td>
                    </tr>
                  )}
                  {invoice.taxBreakdown.map(tb => (
                    <tr key={tb.rate}>
                      <td style={{ color: '#64748b' }}>IVA {tb.rate}%</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatCurrency(tb.amount)}</td>
                    </tr>
                  ))}
                  <tr className="total-row">
                    <td style={{ paddingTop: '12px' }}>TOTAL FACTURA</td>
                    <td style={{ textAlign: 'right', paddingTop: '12px' }}>{formatCurrency(invoice.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Footer + Verifactu Verification Block */}
            <div style={{ marginTop: '36px', paddingTop: '20px', borderTop: '2px dashed #cbd5e1' }}>
              {invoice.notes && (
                <div style={{ fontSize: '13px', color: '#475569', marginBottom: '16px' }}>
                  <strong>Observaciones:</strong> {invoice.notes}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px' }}>
                <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.6 }}>
                  Forma de pago: <strong>{pmLabel}</strong><br />
                  {companySettings?.iban && <>IBAN: <strong>{companySettings?.iban}</strong> ({companySettings?.bankName})<br /></>}
                  {companySettings?.invoiceFooterText}
                </div>

                {/* Huella real calculada por el servidor. Sólo existe si
                    la factura está emitida: un borrador no tiene sello. */}
                {companySettings?.verifactuEnabled && chainedHash && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px',
                    background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px',
                    maxWidth: 360,
                  }}>
                    <div style={{
                      width: 54, height: 54, background: '#0f172a', color: 'white', borderRadius: 4,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, fontSize: 9, textAlign: 'center', lineHeight: 1.2,
                      flexShrink: 0,
                    }}>
                      SELLO<br />SHA-256
                    </div>
                    <div style={{ fontSize: '10px', color: '#475569', lineHeight: 1.45, minWidth: 0 }}>
                      <strong style={{ color: '#0f172a', display: 'block', fontSize: '11px' }}>
                        Registro encadenado
                      </strong>
                      <span style={{ fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                        {chainedHash.slice(0, 32)}…
                      </span>
                      <br />
                      Sellada el {invoice.verifactu?.timestamp ? formatDate(invoice.verifactu.timestamp) : '—'}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="detail-sidebar">
          {/* Estado de sellado: qué protege esta factura y qué ya no se puede tocar */}
          {sealed ? (
            <div className="card">
              <h4 className="card-title" style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}>
                Sello fiscal
              </h4>
              <div className="hash-seal">
                <Fingerprint size={18} style={{ color: 'var(--verifactu-gold)', flexShrink: 0 }} />
                <div className="hash-seal-body">
                  <div className="hash-seal-label">Huella SHA-256 encadenada</div>
                  <div className="hash-seal-value">{chainedHash ?? 'Pendiente de sincronizar'}</div>
                </div>
                {chainedHash && (
                  <button
                    className="btn btn-ghost btn-icon btn-sm"
                    onClick={() => handleCopyHash(chainedHash)}
                    title="Copiar huella"
                  >
                    {copiedHash ? <Check size={14} style={{ color: 'var(--color-success)' }} /> : <Copy size={14} />}
                  </button>
                )}
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 'var(--space-3)', lineHeight: 1.5 }}>
                Esta factura está sellada: sus importes, fecha y numeración ya no pueden
                modificarse ni eliminarse. <Link href="/integridad" style={{ color: 'var(--accent-400)' }}>Verificar cadena</Link>
              </p>
            </div>
          ) : (
            <div className="callout callout-info">
              <FileWarning size={16} />
              <div>
                <strong>Borrador sin valor fiscal</strong>
                <p>
                  Todavía puedes editarla libremente. Al emitirla se sellará con su huella
                  y quedará bloqueada de forma permanente.
                </p>
              </div>
            </div>
          )}

          {/* Info Card */}
          <div className="card">
            <h4 className="card-title" style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}>Detalles del registro</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
                <Calendar size={14} style={{ color: 'var(--text-muted)' }} />
                <span style={{ color: 'var(--text-tertiary)' }}>Emitida:</span>
                <span>{formatDate(invoice.issueDate)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
                <Calendar size={14} style={{ color: 'var(--text-muted)' }} />
                <span style={{ color: 'var(--text-tertiary)' }}>Vence:</span>
                <span>{formatDate(invoice.dueDate)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
                <Building2 size={14} style={{ color: 'var(--text-muted)' }} />
                <span style={{ color: 'var(--text-tertiary)' }}>Cliente:</span>
                <Link href={`/clientes/${invoice.clientId}`} style={{ color: 'var(--accent-400)' }}>{invoice.clientName}</Link>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
                <CreditCard size={14} style={{ color: 'var(--text-muted)' }} />
                <span style={{ color: 'var(--text-tertiary)' }}>Forma de pago:</span>
                <span>{pmLabel}</span>
              </div>
            </div>
          </div>

          {/* Bank IBAN Copy Box */}
          {companySettings?.iban && (
            <div className="card">
              <h4 className="card-title" style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-2)' }}>Cobro por transferencia</h4>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-2)' }}>{companySettings?.bankName}</div>
              <div style={{
                background: 'var(--bg-tertiary)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)'
              }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-primary)', wordBreak: 'break-all' }}>{companySettings?.iban}</span>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleCopyIban(companySettings?.iban)}>
                  {copiedIban ? <Check size={14} style={{ color: 'var(--color-success)' }} /> : <Copy size={14} />}
                </button>
              </div>
            </div>
          )}

          {/* Amounts Summary */}
          <div className="card">
            <h4 className="card-title" style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}>Importes</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}>
                <span style={{ color: 'var(--text-tertiary)' }}>Base imponible</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{formatCurrency(invoice.subtotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}>
                <span style={{ color: 'var(--text-tertiary)' }}>Cuota IVA total</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{formatCurrency(invoice.totalTax)}</span>
              </div>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                paddingTop: 'var(--space-2)', borderTop: '2px solid var(--accent-500)',
                marginTop: 'var(--space-1)',
              }}>
                <span style={{ fontWeight: 700, fontSize: 'var(--text-md)' }}>TOTAL</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 'var(--text-lg)', color: 'var(--accent-400)' }}>
                  {formatCurrency(invoice.total)}
                </span>
              </div>
            </div>
          </div>

          {/* Approval Status Card */}
          {approval && invoice.status === InvoiceStatus.PRE_APROBACION && (
            <div className="card" style={{ border: '1px solid rgba(59, 130, 246, 0.3)', background: 'rgba(59, 130, 246, 0.06)' }}>
              <h4 className="card-title" style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)', color: 'var(--color-info)' }}>
                <Clock size={16} style={{ marginRight: '6px' }} />
                Esperando Respuesta del Cliente
              </h4>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-3)' }}>
                Expira el {new Date(approval.expiresAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
              <div style={{
                background: 'var(--bg-tertiary)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
                display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)',
              }}>
                <Link2 size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-secondary)', wordBreak: 'break-all', flex: 1 }}>
                  {getApprovalLink().substring(0, 50)}...
                </span>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={handleCopyApprovalLink}>
                  {copiedLink ? <Check size={14} style={{ color: 'var(--color-success)' }} /> : <Copy size={14} />}
                </button>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={handleCopyApprovalLink}>
                  <Link2 size={14} /> Copiar Enlace
                </button>
                <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={handleShareWhatsApp}>
                  <MessageSquare size={14} /> WhatsApp
                </button>
              </div>
            </div>
          )}

          {/* Approval Response Card */}
          {approval && approval.status !== 'pending' && approvalItems.length > 0 && (
            <div className="card" style={{
              border: `1px solid ${approval.status === 'approved' ? 'rgba(16, 185, 129, 0.3)' : approval.status === 'rejected' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
              background: approval.status === 'approved' ? 'rgba(16, 185, 129, 0.06)' : approval.status === 'rejected' ? 'rgba(239, 68, 68, 0.06)' : 'rgba(245, 158, 11, 0.06)',
            }}>
              <h4 className="card-title" style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {approval.status === 'approved' && <><CheckCircle2 size={16} style={{ color: 'var(--color-success)' }} /> Pedido Aprobado</>}
                {approval.status === 'rejected' && <><XCircle size={16} style={{ color: 'var(--color-danger)' }} /> Pedido Rechazado</>}
                {approval.status === 'partial' && <><AlertTriangle size={16} style={{ color: 'var(--color-warning)' }} /> Aprobado Parcialmente</>}
              </h4>

              {approval.respondedAt && (
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-3)' }}>
                  Respondido el {new Date(approval.respondedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
                {approvalItems.map(item => {
                  const line = invoice.lineItems.find(li => li.id === item.lineItemId);
                  if (!line) return null;
                  return (
                    <div key={item.id} style={{
                      display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                      padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)',
                      background: item.accepted ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                      fontSize: 'var(--text-xs)',
                    }}>
                      {item.accepted ? (
                        <CheckCircle2 size={14} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
                      ) : (
                        <XCircle size={14} style={{ color: 'var(--color-danger)', flexShrink: 0 }} />
                      )}
                      <span style={{ flex: 1, color: 'var(--text-primary)' }}>{line.productName}</span>
                      {item.adjustedQuantity && item.adjustedQuantity !== line.quantity && (
                        <span style={{ color: 'var(--color-warning)', fontWeight: 700 }}>
                          {line.quantity}→{item.adjustedQuantity}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {approval.clientMessage && (
                <div style={{
                  background: 'var(--bg-tertiary)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-xs)', marginBottom: 'var(--space-2)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>
                    <MessageSquare size={12} /> Mensaje del cliente:
                  </div>
                  <p style={{ color: 'var(--text-primary)', fontStyle: 'italic' }}>&laquo;{approval.clientMessage}&raquo;</p>
                </div>
              )}
            </div>
          )}

          {/* Quick Actions */}
          <div className="card">
            <h4 className="card-title" style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}>Acciones</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <BotonDescargarPdf
                tipo="factura"
                documento={invoice}
                className="btn btn-secondary btn-sm"
                etiqueta="Descargar con mi diseño"
              />
              <button className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => window.print()}>
                <Printer size={14} /> Imprimir / PDF
              </button>
              <button className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={handleDuplicate}>
                <Copy size={14} /> Duplicar Factura
              </button>
            </div>
            <AvisoSinPlantilla />
          </div>
        </div>
      </div>

      {borrando && (
        <DeleteInvoiceModal
          invoice={invoice}
          onClose={() => setBorrando(false)}
          onSuccess={trasEliminarOAnular}
          onError={texto => toastError('No se ha podido completar', texto)}
        />
      )}
    </div>
  );
}
