'use client';

import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import {
  Check, X, MessageSquare, Clock, AlertTriangle,
  Building2, Package, Send, CheckCircle2, XCircle,
  Minus, Plus, ShieldCheck, CreditCard
} from 'lucide-react';
import { Invoice, OrderApproval, CompanySettings } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';

interface LineDecision {
  lineItemId: string;
  accepted: boolean;
  adjustedQuantity: number | null;
  rejectionReason: string;
}

export default function ApprovalPortalPage() {
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
        setNotFound(true);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setNotFound(true);
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
      const started = await startStripeCheckout(invoice.id);
      if (started) return; // se ha redirigido a Stripe
    }

    setSubmitting(false);
    if (ok) {
      setSubmitted(true);
    }
  };

  // Crea la sesión de Stripe Checkout ligada a esta factura y a este token
  // de aprobación (el backend valida que ambos coincidan) y redirige al
  // cliente a pagar. Se reutiliza tanto en la confirmación inicial como en
  // el reintento tras un pago cancelado.
  const startStripeCheckout = async (invoiceId: string): Promise<boolean> => {
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
      console.error('No se pudo crear la sesión de pago:', data.error);
    } catch (e) {
      console.error('Error initiating Stripe Checkout:', e);
    }
    return false;
  };

  const handleRetryPayment = async () => {
    if (!invoice) return;
    setRetryingPayment(true);
    const started = await startStripeCheckout(invoice.id);
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

  return (
    <div className="approval-portal">
      {/* Header */}
      <header className="approval-header">
        <div className="approval-header-brand">
          {company?.logoUrl ? (
            <img src={company.logoUrl} alt={company.tradeName} className="approval-logo" />
          ) : (
            <div className="approval-logo-placeholder">
              {(company?.tradeName || company?.businessName || 'E').charAt(0)}
            </div>
          )}
          <div>
            <h1>{company?.tradeName || company?.businessName}</h1>
            <p>{company?.businessName}</p>
          </div>
        </div>
        <div className="approval-header-badge">
          <ShieldCheck size={14} />
          Revisión de pedido
        </div>
      </header>

      {/* Info Banner */}
      <div className="approval-info-banner">
        <AlertTriangle size={18} />
        <div>
          <strong>Revisa tu pedido antes de la entrega</strong>
          <p>Marca los productos que aceptas o rechaza los que no necesitas. Así evitamos devoluciones innecesarias.</p>
        </div>
      </div>

      {/* Order Summary */}
      <div className="approval-order-meta">
        <div className="approval-meta-item">
          <span className="approval-meta-label">Pedido Nº</span>
          <span className="approval-meta-value">{invoice!.number}</span>
        </div>
        <div className="approval-meta-item">
          <span className="approval-meta-label">Fecha</span>
          <span className="approval-meta-value">{new Date(invoice!.issueDate).toLocaleDateString('es-ES')}</span>
        </div>
        <div className="approval-meta-item">
          <span className="approval-meta-label">Cliente</span>
          <span className="approval-meta-value">{invoice!.clientName}</span>
        </div>
        <div className="approval-meta-item">
          <span className="approval-meta-label">Expira</span>
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
          <span><CheckCircle2 size={16} style={{ color: '#10b981' }} /> Aceptados</span>
          <strong>{acceptedCount} producto{acceptedCount !== 1 ? 's' : ''}</strong>
        </div>
        {rejectedCount > 0 && (
          <div className="approval-summary-row">
            <span><XCircle size={16} style={{ color: '#ef4444' }} /> Rechazados</span>
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

      {/* Submit Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', maxWidth: 640, margin: '0 auto var(--space-5)' }}>
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
              Enviando...
            </>
          ) : (
            <>
              <Send size={18} />
              Confirmar revisión del pedido (pago posterior)
            </>
          )}
        </button>
      </div>

      {/* Footer */}
      <footer className="approval-footer">
        <p>Revisión del pedido <strong>{invoice!.number}</strong> · {company?.tradeName || company?.businessName}</p>
        <p>{company?.email} · {company?.phone}</p>
      </footer>
    </div>
  );
}
