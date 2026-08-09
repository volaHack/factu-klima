import { Printer, Plus, Share2, Mail, MessageCircle, X, CloudOff } from 'lucide-react';
import { Invoice, CompanySettings } from '@/lib/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { getTaxLabel } from '@/lib/constants';

interface TpvTicketProps {
  invoice: Invoice;
  settings: CompanySettings;
  cashGiven?: number;
  onNewSale: () => void;
  onClose?: () => void;
}

export default function TpvTicket({ invoice, settings, cashGiven, onNewSale, onClose }: TpvTicketProps) {
  const change = cashGiven != null ? cashGiven - invoice.total : undefined;

  const getTicketTextSummary = () => {
    const header = `${settings.tradeName || settings.businessName}\nTicket N.º ${invoice.number}\nFecha: ${formatDate(invoice.issueDate)}\n------------------------\n`;
    const lines = invoice.lineItems.map(li => `${li.quantity}x ${li.productName}: ${formatCurrency(li.total)}`).join('\n');
    const footer = `\n------------------------\nTOTAL: ${formatCurrency(invoice.total)}\nGracias por su compra.`;
    return encodeURIComponent(header + lines + footer);
  };

  const shareWhatsApp = () => {
    const text = getTicketTextSummary();
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const shareEmail = () => {
    const text = getTicketTextSummary();
    window.open(`mailto:?subject=${encodeURIComponent(`Ticket de compra ${invoice.number}`)}&body=${text}`, '_blank');
  };

  return (
    <div className="modal-overlay" onClick={onClose || onNewSale}>
      <div className="modal tpv-ticket-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <span className="badge badge-rose">Ticket Generado</span>
            {invoice.numberTemporary && (
              <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }} title="Emitido sin conexión: se sellará en el servidor al reconectar">
                <CloudOff size={12} /> Pendiente de sincronizar
              </span>
            )}
          </div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose || onNewSale} aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>

        <div className="tpv-ticket-print-area">
          <div className="tpv-ticket">
            <div className="tpv-ticket-header">
              <strong>{settings.tradeName || settings.businessName}</strong>
              <span>{settings.nif}</span>
              <span>{settings.address}, {settings.city}</span>
            </div>
            <div className="tpv-ticket-meta">
              <span>{invoice.number}</span>
              <span>{formatDate(invoice.issueDate)} {new Date(invoice.createdAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div className="tpv-ticket-divider" />
            <table className="tpv-ticket-lines">
              <tbody>
                {invoice.lineItems.map(li => (
                  <tr key={li.id}>
                    <td>{li.quantity}× {li.productName}</td>
                    <td>{formatCurrency(li.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="tpv-ticket-divider" />
            <div className="tpv-ticket-totals">
              <div><span>Subtotal</span><span>{formatCurrency(invoice.subtotal)}</span></div>
              {invoice.taxBreakdown.map(tb => (
                <div key={tb.rate}><span>{getTaxLabel(settings)} {tb.rate}%</span><span>{formatCurrency(tb.amount)}</span></div>
              ))}
              <div className="tpv-ticket-total-final"><span>TOTAL</span><span>{formatCurrency(invoice.total)}</span></div>
              {cashGiven != null && (
                <>
                  <div><span>Entregado</span><span>{formatCurrency(cashGiven)}</span></div>
                  <div><span>Cambio</span><span>{formatCurrency(change ?? 0)}</span></div>
                </>
              )}
            </div>
            <div className="tpv-ticket-divider" />
            <p className="tpv-ticket-footer">
              Factura simplificada · Sellada SHA-256
              {invoice.verifactu?.chainedHash ? ` · ${invoice.verifactu.chainedHash.slice(0, 16)}…` : ''}
            </p>
          </div>
        </div>

        {/* Action bar with WhatsApp & Email options */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
          <button className="btn btn-secondary btn-sm" onClick={shareWhatsApp} style={{ color: '#16a34a', borderColor: 'rgba(22, 163, 74, 0.3)' }}>
            <MessageCircle size={15} /> WhatsApp
          </button>
          <button className="btn btn-secondary btn-sm" onClick={shareEmail}>
            <Mail size={15} /> Email
          </button>
        </div>

        <div className="tpv-checkout-actions tpv-ticket-actions" style={{ marginTop: 'var(--space-3)' }}>
          <button className="btn btn-secondary" onClick={() => window.print()} style={{ flex: 1 }}>
            <Printer size={16} /> Imprimir
          </button>
          <button className="btn btn-primary tpv-checkout-btn" onClick={onNewSale} style={{ flex: 1.2 }}>
            <Plus size={16} /> Nueva venta
          </button>
        </div>
      </div>
    </div>
  );
}
