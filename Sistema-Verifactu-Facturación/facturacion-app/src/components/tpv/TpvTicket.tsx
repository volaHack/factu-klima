'use client';

import { Printer, Plus } from 'lucide-react';
import { Invoice, CompanySettings } from '@/lib/types';
import { formatCurrency, formatDate } from '@/lib/utils';

interface TpvTicketProps {
  invoice: Invoice;
  settings: CompanySettings;
  cashGiven?: number;
  onNewSale: () => void;
}

export default function TpvTicket({ invoice, settings, cashGiven, onNewSale }: TpvTicketProps) {
  const change = cashGiven != null ? cashGiven - invoice.total : undefined;

  return (
    <div className="modal-overlay">
      <div className="modal tpv-ticket-modal">
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
                <div key={tb.rate}><span>IVA {tb.rate}%</span><span>{formatCurrency(tb.amount)}</span></div>
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

        <div className="tpv-checkout-actions tpv-ticket-actions">
          <button className="btn btn-secondary" onClick={() => window.print()}>
            <Printer size={16} /> Imprimir ticket
          </button>
          <button className="btn btn-primary tpv-checkout-btn" onClick={onNewSale}>
            <Plus size={16} /> Nueva venta
          </button>
        </div>
      </div>
    </div>
  );
}
