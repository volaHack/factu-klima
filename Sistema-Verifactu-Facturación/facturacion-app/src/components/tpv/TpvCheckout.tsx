'use client';

import { useMemo, useState } from 'react';
import { X, Banknote, CreditCard, Smartphone, Loader2, Delete } from 'lucide-react';
import { PaymentMethod } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';

interface TpvCheckoutProps {
  total: number;
  onConfirm: (method: PaymentMethod, cashGiven?: number) => Promise<void>;
  onClose: () => void;
}

const QUICK_ADD = [5, 10, 20, 50];

export default function TpvCheckout({ total, onConfirm, onClose }: TpvCheckoutProps) {
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [cashInput, setCashInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const cashGiven = Number(cashInput.replace(',', '.')) || 0;
  const change = useMemo(() => Math.max(0, cashGiven - total), [cashGiven, total]);
  const canConfirmCash = cashGiven >= total;

  const appendDigit = (d: string) => {
    if (d === '.' && cashInput.includes('.')) return;
    setCashInput(prev => (prev + d).slice(0, 9));
  };
  const backspace = () => setCashInput(prev => prev.slice(0, -1));
  const setExact = () => setCashInput(total.toFixed(2));
  const addQuick = (amount: number) => setCashInput(prev => {
    const current = Number(prev.replace(',', '.')) || 0;
    return (current + amount).toFixed(2);
  });

  const handleConfirm = async () => {
    if (!method) return;
    setSubmitting(true);
    setError('');
    try {
      await onConfirm(method, method === PaymentMethod.EFECTIVO ? cashGiven : undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cobrar la venta.');
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal tpv-checkout-modal" onClick={e => e.stopPropagation()}>
        <div className="tpv-checkout-header">
          <h3>Cobrar {formatCurrency(total)}</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        {!method ? (
          <div className="tpv-payment-methods">
            <button className="tpv-payment-method-btn" onClick={() => setMethod(PaymentMethod.EFECTIVO)}>
              <Banknote size={28} /> Efectivo
            </button>
            <button className="tpv-payment-method-btn" onClick={() => setMethod(PaymentMethod.TARJETA)}>
              <CreditCard size={28} /> Tarjeta
            </button>
            <button className="tpv-payment-method-btn" onClick={() => setMethod(PaymentMethod.BIZUM)}>
              <Smartphone size={28} /> Bizum
            </button>
          </div>
        ) : method === PaymentMethod.EFECTIVO ? (
          <div className="tpv-cash-panel">
            <div className="tpv-cash-display">
              <div>
                <span className="tpv-cash-display-label">Entregado</span>
                <span className="tpv-cash-display-value">{cashInput ? formatCurrency(cashGiven) : '—'}</span>
              </div>
              <div>
                <span className="tpv-cash-display-label">Cambio</span>
                <span className={`tpv-cash-display-value ${canConfirmCash ? 'is-positive' : ''}`}>
                  {formatCurrency(change)}
                </span>
              </div>
            </div>

            <div className="tpv-cash-quick">
              <button onClick={setExact}>Exacto</button>
              {QUICK_ADD.map(a => (
                <button key={a} onClick={() => addQuick(a)}>+{a}€</button>
              ))}
            </div>

            <div className="tpv-keypad">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0'].map(k => (
                <button key={k} onClick={() => appendDigit(k)}>{k}</button>
              ))}
              <button onClick={backspace} aria-label="Borrar"><Delete size={18} /></button>
            </div>

            <div className="tpv-checkout-actions">
              <button className="btn btn-secondary" onClick={() => { setMethod(null); setCashInput(''); }}>
                Atrás
              </button>
              <button
                className="btn btn-primary tpv-checkout-btn"
                onClick={handleConfirm}
                disabled={!canConfirmCash || submitting}
              >
                {submitting ? <Loader2 size={16} className="spin" /> : `Confirmar cobro`}
              </button>
            </div>
          </div>
        ) : (
          <div className="tpv-cash-panel">
            <p className="tpv-checkout-note">
              Cobra {formatCurrency(total)} con el datáfono o la app de Bizum y confirma aquí.
            </p>
            <div className="tpv-checkout-actions">
              <button className="btn btn-secondary" onClick={() => setMethod(null)}>Atrás</button>
              <button className="btn btn-primary tpv-checkout-btn" onClick={handleConfirm} disabled={submitting}>
                {submitting ? <Loader2 size={16} className="spin" /> : 'Confirmar cobro'}
              </button>
            </div>
          </div>
        )}

        {error && <div className="login-alert login-alert--error" role="alert">{error}</div>}
      </div>
    </div>
  );
}
