'use client';

import { useState } from 'react';
import { Loader2, Lock, Unlock } from 'lucide-react';
import { PosSession } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';

interface TpvOpenSessionProps {
  mode: 'open';
  onSubmit: (startingCash: number) => Promise<void>;
  onSkip: () => void;
}

interface TpvCloseSessionProps {
  mode: 'close';
  session: PosSession;
  onSubmit: (countedCash: number) => Promise<PosSession>;
  onDone: () => void;
}

type TpvCashSessionProps = TpvOpenSessionProps | TpvCloseSessionProps;

export default function TpvCashSession(props: TpvCashSessionProps) {
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [closed, setClosed] = useState<PosSession | null>(null);

  const value = Number(amount.replace(',', '.')) || 0;

  if (props.mode === 'open') {
    const handleOpen = async () => {
      setSubmitting(true);
      setError('');
      try {
        await props.onSubmit(value);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo abrir la caja.');
        setSubmitting(false);
      }
    };

    return (
      <div className="modal-overlay">
        <div className="modal tpv-session-modal">
          <div className="tpv-session-icon"><Unlock size={28} /></div>
          <h3>Abrir caja</h3>
          <p className="tpv-checkout-note">
            Indica el efectivo con el que empiezas el turno para poder cuadrarlo al cerrar.
          </p>
          <div className="form-group">
            <label className="form-label">Fondo inicial en efectivo</label>
            <input
              className="form-input"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              placeholder="0,00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              autoFocus
            />
          </div>
          {error && <div className="login-alert login-alert--error" role="alert">{error}</div>}
          <div className="tpv-checkout-actions">
            <button className="btn btn-secondary" onClick={props.onSkip}>Vender sin turno</button>
            <button className="btn btn-primary" onClick={handleOpen} disabled={submitting}>
              {submitting ? <Loader2 size={16} className="spin" /> : 'Abrir caja'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleClose = async () => {
    setSubmitting(true);
    setError('');
    try {
      const result = await props.onSubmit(value);
      setClosed(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cerrar la caja.');
      setSubmitting(false);
    }
  };

  if (closed) {
    const diff = closed.cashDifference ?? 0;
    return (
      <div className="modal-overlay">
        <div className="modal tpv-session-modal">
          <div className="tpv-session-icon"><Lock size={28} /></div>
          <h3>Caja cerrada</h3>
          <div className="tpv-session-summary">
            <div><span>Efectivo esperado</span><strong>{formatCurrency(closed.expectedCash ?? 0)}</strong></div>
            <div><span>Efectivo contado</span><strong>{formatCurrency(closed.countedCash ?? 0)}</strong></div>
            <div className={diff === 0 ? '' : diff > 0 ? 'is-positive' : 'is-negative'}>
              <span>Diferencia</span>
              <strong>{diff > 0 ? '+' : ''}{formatCurrency(diff)}</strong>
            </div>
          </div>
          <button className="btn btn-primary" onClick={props.onDone}>Entendido</button>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal tpv-session-modal">
        <div className="tpv-session-icon"><Lock size={28} /></div>
        <h3>Cerrar caja</h3>
        <p className="tpv-checkout-note">
          Turno abierto con {formatCurrency(props.session.startingCash)} desde las{' '}
          {new Date(props.session.openedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}.
          Cuenta el efectivo del cajón e introduce el total.
        </p>
        <div className="form-group">
          <label className="form-label">Efectivo contado</label>
          <input
            className="form-input"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            placeholder="0,00"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            autoFocus
          />
        </div>
        {error && <div className="login-alert login-alert--error" role="alert">{error}</div>}
        <div className="tpv-checkout-actions">
          <button className="btn btn-primary" onClick={handleClose} disabled={submitting}>
            {submitting ? <Loader2 size={16} className="spin" /> : 'Cerrar caja'}
          </button>
        </div>
      </div>
    </div>
  );
}
