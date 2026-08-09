'use client';


import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import {
  Check, X, MessageSquare, Clock, AlertTriangle,
  Building2, Package, Send, CheckCircle2, XCircle,
  Minus, Plus, ShieldCheck, CreditCard, Sparkles
} from 'lucide-react';
import { Invoice, OrderApproval, CompanySettings } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';

interface LineDecision {
  lineItemId: string;
  accepted: boolean;
  adjustedQuantity: number | null;
  rejectionReason: string;
}

export default function ApprovalContent() {
  const params = useParams();
  const token = params.token as string;
  const searchParams = useSearchParams();
  const justPaid = searchParams.get('paid') === 'true';
  const justCancelled = searchParams.get('cancelled') === 'true';

  const [loading, setLoading] = useState(true);
  const [retryingPayment, setRetryingPayment] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [expired, setExpired] = useState(false);
  const [alreadyResponded, setAlreadyResponded] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [serverError, setServerError] = useState(false);
  const [paymentInlineError, setPaymentInlineError] = useState<string | null>(null);

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [approval, setApproval] = useState<OrderApproval | null>(null);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [decisions, setDecisions] = useState<LineDecision[]>([]);
  const [clientMessage, setClientMessage] = useState('');

  useEffect(() => {
    (async () => {
      let res: Response;
      try {
        res = await fetch(`/api/aprobar/${token}`);
      } catch {
        // Fallo de red: sin esto, la promesa rechazada dejaba el spinner
        // "Cargando tu pedido..." girando indefinidamente.
        setServerError(true);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        if (res.status === 404) {
          setNotFound(true);
        } else {
          // 500, 429, etc. — error de servicio, no "enlace inválido"
          setServerError(true);
        }
        setLoading(false);
        return;
      }
      const result: { approval: OrderApproval; invoice: Invoice; companySettings: CompanySettings | null } = await res.json();

      const { approval, invoice, companySettings } = result;

      if (new Date(approval.expiresAt) < new Date()) {
        setExpired(true);
        setLoading(false);
        return;
      }

      if (approval.status !== 'pending') {
        setAlreadyResponded(true);
        setApproval(approval);
        setInvoice(invoice);
        setCompany(companySettings);
        setLoading(false);
        return;
      }

      setApproval(approval);
      setInvoice(invoice);
      setCompany(companySettings);

      // Initialize decisions for each line item (all accepted by default)
      setDecisions(
        invoice.lineItems.map(li => ({
          lineItemId: li.id,
          accepted: true,
          adjustedQuantity: null,
          rejectionReason: '',
        }))
      );

      setLoading(false);
    })();
  }, [token]);

  const updateDecision = (lineItemId: string, updates: Partial<LineDecision>) => {
    setDecisions(prev =>
      prev.map(d => d.lineItemId === lineItemId ? { ...d, ...updates } : d)
    );
  };

  const acceptedCount = decisions.filter(d => d.accepted).length;
  const rejectedCount = decisions.filter(d => !d.accepted).length;
  const hasAdjustments = decisions.some(d => d.adjustedQuantity !== null);

  const handleSubmit = async (andPay: boolean = false) => {
    setSubmitting(true);
    const mapped = decisions.map(d => ({
      lineItemId: d.lineItemId,
      accepted: d.accepted,
      adjustedQuantity: d.adjustedQuantity ?? undefined,
      rejectionReason: d.rejectionReason || undefined,
    }));
    let ok = false;
    try {
      const res = await fetch(`/api/aprobar/${token}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: mapped, clientMessage }),
      });
      ok = res.ok;
    } catch {
      // Fallo de red: sin esto, la promesa rechazada dejaba el botón
      // atascado en "Enviando..." para siempre.
      ok = false;
    }

    if (ok && andPay && invoice) {
      const started = await startStripeCheckout(invoice.id, true);
      if (started) return; // se ha redirigido a Stripe
    }

    setSubmitting(false);
    if (ok) {
      setSubmitted(true);
    }
  };

  const startStripeCheckout = async (invoiceId: string, responseWasSaved = false): Promise<boolean> => {
    setPaymentInlineError(null);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId, approvalToken: token }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return true;
      }
      
      const errMsg = data.error || 'La empresa emisora no tiene configurado el cobro online con tarjeta.';
      setPaymentInlineError(
        responseWasSaved 
          ? `⚠️ ${errMsg} Tu confirmación de pedido ha sido enviada correctamente. Puedes coordinar el pago posterior con la empresa.`
          : `⚠️ ${errMsg}`
      );
    } catch (e) {
      setPaymentInlineError('⚠️ No se pudo conectar con el servidor de pago. Por favor, reinténtalo.');
    }
    return false;
  };

  const handleRetryPayment = async () => {
    if (!invoice) return;
    setRetryingPayment(true);
    const started = await startStripeCheckout(invoice.id, false);
    if (!started) setRetryingPayment(false);
  };

  // --- Render States ---

  if (loading) {
    return (
      <div className="approval-portal">
        <div className="approval-loading">
          <div className="approval-spinner" />
          <p>Cargando tu pedido...</p>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="approval-portal">
        <div className="approval-error-card">
          <XCircle size={56} />
          <h2>Enlace no válido</h2>
          <p>Este enlace de revisión no existe o ha sido eliminado. Contacta con tu proveedor para solicitar un nuevo enlace.</p>
        </div>
      </div>
    );
  }

  if (serverError) {
    return (
      <div className="approval-portal">
        <div className="approval-error-card">
          <AlertTriangle size={56} />
          <h2>Error temporal del servidor</h2>
          <p>No hemos podido cargar tu pedido en este momento. Inténtalo de nuevo en unos minutos.</p>
          <button
            className="approval-submit-btn"
            style={{ marginTop: 'var(--space-3)' }}
            onClick={() => window.location.reload()}
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="approval-portal">
        <div className="approval-error-card">
          <Clock size={56} />
          <h2>Enlace expirado</h2>
          <p>Este enlace de revisión ha expirado. Contacta con tu proveedor para solicitar uno nuevo.</p>
        </div>
      </div>
    );
  }

  if (alreadyResponded) {
    const invoicePaid = invoice?.status === 'pagada';
    const canPayOnline = !invoicePaid && company?.stripeEnabled !== false;

    return (
      <div className="approval-portal">
        <div className="approval-success-card">
          <CheckCircle2 size={56} />
          <h2>Ya has respondido</h2>
          <p>Tu revisión de este pedido ya fue enviada el {new Date(approval!.respondedAt!).toLocaleDateString('es-ES')}. Tu proveedor procesará tu respuesta.</p>

          {justPaid && (
            <p style={{ color: '#10b981', fontWeight: 600, marginTop: 'var(--space-3)' }}>
              Pago recibido correctamente. Gracias.
            </p>
          )}

          {justCancelled && !invoicePaid && (
            <p style={{ marginTop: 'var(--space-3)' }}>
              El pago se canceló antes de completarse. Tu revisión ya ha quedado registrada, pero la factura sigue pendiente de cobro.
            </p>
          )}

          {canPayOnline && (
            <button
              className="approval-submit-btn"
              style={{ marginTop: 'var(--space-3)', background: 'linear-gradient(135deg, #6366f1, #4f46e5)' }}
              onClick={handleRetryPayment}
              disabled={retryingPayment}
            >
              {retryingPayment ? (
                <>
                  <div className="approval-spinner-sm" />
                  Conectando con Stripe...
                </>
              ) : (
                <>
                  <CreditCard size={16} /> {justCancelled ? 'Reintentar pago online' : 'Pagar pedido online'}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="approval-portal">
        <div className="approval-success-card">
          <CheckCircle2 size={56} />
          <h2>¡Revisión enviada!</h2>
          <p>
            {rejectedCount === 0 && !hasAdjustments
              ? 'Has aceptado todos los productos del pedido. Tu proveedor procederá con la entrega.'
              : `Has aceptado ${acceptedCount} producto${acceptedCount !== 1 ? 's' : ''} y rechazado ${rejectedCount}. Tu proveedor ajustará el pedido.`
            }
          </p>
          <p style={{ fontSize: 'var(--text-base)', color: '#64748b', marginTop: 'var(--space-3)' }}>Puedes cerrar esta página.</p>
        </div>
      </div>
    );
  }

  // --- Main Review Form ---

  // --- Main Review Form ---

  return (
    <div className="approval-portal">
      {/* Klima Solutions Top Navbar */}
      <nav className="pricing-nav" style={{ margin: '-16px -16px 24px -16px', borderRadius: 0 }}>
        <div className="pricing-nav-inner">
          <div className="pricing-nav-brand">
            <img src="/klima-mark.svg" alt="Klima Solutions" className="pricing-nav-logo" width={32} height={32} />
            <span>Klima Solutions</span>
          </div>
          <div className="approval-header-badge">
            <ShieldCheck size={14} />
            Portal Verifactu Certificado
          </div>
        </div>
      </nav>

      {/* Hero Branding Card */}
      <header className="approval-header">
        <div className="approval-header-brand">
          {company?.logoUrl ? (
            <img src={company.logoUrl} alt={company.tradeName} className="approval-logo" />
          ) : (
            <div className="approval-logo-placeholder">
              {(company?.tradeName || company?.businessName || 'K').charAt(0)}
            </div>
          )}
          <div>
            <h1>{company?.tradeName || company?.businessName}</h1>
            <p>{company?.businessName} {company?.nif ? `· NIF: ${company.nif}` : ''}</p>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pedido</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-md)', fontWeight: 800, color: 'var(--text-primary)' }}>{invoice!.number}</span>
        </div>
      </header>

      {/* Info Banner */}
      <div className="approval-info-banner">
        <AlertTriangle size={18} style={{ flexShrink: 0 }} />
        <div>
          <strong>Revisión y Conformidad de Pedido</strong>
          <p>Confirma los productos que aceptas o indica ajustes en las cantidades antes de la entrega. Así garantizamos un proceso sin devoluciones.</p>
        </div>
      </div>

      {/* Order Summary */}
      <div className="approval-order-meta">
        <div className="approval-meta-item">
          <span className="approval-meta-label">Factura / Nº</span>
          <span className="approval-meta-value">{invoice!.number}</span>
        </div>
        <div className="approval-meta-item">
          <span className="approval-meta-label">Fecha Emisión</span>
          <span className="approval-meta-value">{new Date(invoice!.issueDate).toLocaleDateString('es-ES')}</span>
        </div>
        <div className="approval-meta-item">
          <span className="approval-meta-label">Cliente Receptor</span>
          <span className="approval-meta-value">{invoice!.clientName}</span>
        </div>
        <div className="approval-meta-item">
          <span className="approval-meta-label">Caducidad Enlace</span>
          <span className="approval-meta-value">{new Date(approval!.expiresAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>

      {/* Line Items */}
      <div className="approval-items-section">
        <h3>
          <Package size={18} />
          Productos del pedido ({invoice!.lineItems.length})
        </h3>

        <div className="approval-items-list">
          {invoice!.lineItems.map((line) => {
            const decision = decisions.find(d => d.lineItemId === line.id);
            const isAccepted = decision?.accepted ?? true;

            return (
              <div
                key={line.id}
                className={`approval-item ${isAccepted ? 'accepted' : 'rejected'}`}
              >
                <div className="approval-item-main">
                  <div className="approval-item-info">
                    <span className="approval-item-ref">{line.productRef}</span>
                    <span className="approval-item-name">{line.productName}</span>
                    <span className="approval-item-detail">
                      {line.quantity} {line.unit} × {formatCurrency(line.unitPrice)}
                    </span>
                  </div>
                  <div className="approval-item-price">
                    {formatCurrency(line.subtotal)}
                  </div>
                </div>

                <div className="approval-item-actions">
                  <button
                    type="button"
                    className={`approval-action-btn accept ${isAccepted ? 'active' : ''}`}
                    onClick={() => updateDecision(line.id, { accepted: true, rejectionReason: '' })}
                  >
                    <Check size={16} />
                    Aceptar
                  </button>
                  <button
                    type="button"
                    className={`approval-action-btn reject ${!isAccepted ? 'active' : ''}`}
                    onClick={() => updateDecision(line.id, { accepted: false })}
                  >
                    <X size={16} />
                    Rechazar
                  </button>
                </div>

                {/* Adjust quantity (when accepted) */}
                {isAccepted && (
                  <div className="approval-item-adjust">
                    <span className="approval-adjust-label">Cantidad:</span>
                    <div className="approval-qty-control">
                      <button
                        type="button"
                        onClick={() => {
                          const current = decision?.adjustedQuantity ?? line.quantity;
                          if (current > 1) updateDecision(line.id, { adjustedQuantity: current - 1 });
                        }}
                      >
                        <Minus size={14} />
                      </button>
                      <span>{decision?.adjustedQuantity ?? line.quantity}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const current = decision?.adjustedQuantity ?? line.quantity;
                          updateDecision(line.id, { adjustedQuantity: current + 1 });
                        }}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    {decision?.adjustedQuantity !== null && decision?.adjustedQuantity !== line.quantity && (
                      <button
                        type="button"
                        className="approval-reset-qty"
                        onClick={() => updateDecision(line.id, { adjustedQuantity: null })}
                      >
                        Restaurar original ({line.quantity})
                      </button>
                    )}
                  </div>
                )}

                {/* Rejection reason */}
                {!isAccepted && (
                  <div className="approval-item-reason">
                    <input
                      type="text"
                      placeholder="Motivo del rechazo (opcional)"
                      value={decision?.rejectionReason || ''}
                      onChange={e => updateDecision(line.id, { rejectionReason: e.target.value })}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Summary */}
      <div className="approval-summary">
        <div className="approval-summary-row">
          <span><CheckCircle2 size={16} style={{ color: '#10b981' }} /> Productos Aceptados</span>
          <strong>{acceptedCount} producto{acceptedCount !== 1 ? 's' : ''}</strong>
        </div>
        {rejectedCount > 0 && (
          <div className="approval-summary-row">
            <span><XCircle size={16} style={{ color: '#ef4444' }} /> Productos Rechazados</span>
            <strong>{rejectedCount} producto{rejectedCount !== 1 ? 's' : ''}</strong>
          </div>
        )}
      </div>

      {/* Comments */}
      <div className="approval-comments">
        <label>
          <MessageSquare size={16} />
          Comentarios para el proveedor (opcional)
        </label>
        <textarea
          placeholder="¿Alguna indicación especial sobre la entrega, cantidades o productos?"
          value={clientMessage}
          onChange={e => setClientMessage(e.target.value)}
          rows={3}
        />
      </div>

      {/* Inline Error Notification Banner (si Stripe no está activado o falla) */}
      {paymentInlineError && (
        <div className="approval-info-banner animate-fade-in" style={{
          maxWidth: 680,
          background: 'rgba(239, 68, 68, 0.08)',
          borderColor: 'rgba(239, 68, 68, 0.3)',
          color: '#b91c1c',
          marginBottom: 'var(--space-4)',
        }}>
          <AlertTriangle size={18} style={{ color: '#ef4444', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <strong style={{ color: '#991b1b' }}>Aviso de cobro</strong>
            <p style={{ color: '#b91c1c' }}>{paymentInlineError}</p>
          </div>
          <button
            type="button"
            onClick={() => setPaymentInlineError(null)}
            style={{ background: 'none', border: 'none', color: '#b91c1c', cursor: 'pointer', padding: 2 }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Submit Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', maxWidth: 680, margin: '0 auto var(--space-5)' }}>
        {company?.stripeEnabled !== false && (
          <button
            className="approval-submit-btn"
            style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)' }}
            onClick={() => handleSubmit(true)}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <div className="approval-spinner-sm" />
                Conectando con Stripe...
              </>
            ) : (
              <>
                <CreditCard size={16} /> Confirmar y pagar pedido online
              </>
            )}
          </button>
        )}

        <button
          className="approval-submit-btn"
          onClick={() => handleSubmit(false)}
          disabled={submitting}
        >
          {submitting ? (
            <>
              <div className="approval-spinner-sm" />
              Enviando respuesta...
            </>
          ) : (
            <>
              <Send size={18} />
              Confirmar revisión del pedido (pago posterior)
            </>
          )}
        </button>
      </div>

      {/* Klima Solutions Footer */}
      <footer style={{ marginTop: 'var(--space-12)', borderTop: '1px solid var(--border-color, #e2e8f0)', paddingTop: 'var(--space-6)', textAlign: 'center' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
            <img src="/klima-mark.svg" alt="Klima Solutions" width={20} height={20} />
            <span style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>Klima Solutions · Verifactu</span>
          </div>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: 'var(--space-2)', lineHeight: 1.5 }}>
            Portal oficial de revisión de pedidos emitidos por <strong>{company?.tradeName || company?.businessName}</strong> ({company?.email || ''}).
          </p>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            © 2026 Klima Solutions S.L. · Sistema de Facturación Certificado RD 1007/2023.
          </p>
        </div>
      </footer>
    </div>
  );
}
