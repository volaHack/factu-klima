'use client';

import { useState, useEffect } from 'react';
import { ReceiptText } from 'lucide-react';
import { getAbonosByClient } from '@/lib/storage';
import { Abono } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';

export interface AbonoSelection {
  abono: Abono;
  amount: number;
}

interface AbonoPanelProps {
  clientId: string;
  invoiceTotal: number;
  onSelection: (selection: AbonoSelection | null) => void;
}

export default function AbonoPanel({ clientId, invoiceTotal, onSelection }: AbonoPanelProps) {
  const [abonos, setAbonos] = useState<Abono[]>([]);
  const [abonoId, setAbonoId] = useState('');
  const [amount, setAmount] = useState(0);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    (async () => {
      const list = await getAbonosByClient(clientId);
      if (!cancelled) setAbonos(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const selected = abonos.find(a => a.id === abonoId) || null;
  const disponible = selected ? Number((selected.total - selected.usedAmount).toFixed(2)) : 0;
  const maxAplicable = selected ? Math.min(disponible, Math.max(invoiceTotal, 0)) : 0;

  const pushSelection = (en: boolean, id: string, amt: number) => {
    const ab = abonos.find(a => a.id === id);
    if (!en || !ab || amt <= 0) {
      onSelection(null);
      return;
    }
    onSelection({
      abono: ab,
      amount: Math.min(amt, Number((ab.total - ab.usedAmount).toFixed(2)), Math.max(invoiceTotal, 0)),
    });
  };

  const handleToggle = (checked: boolean) => {
    setEnabled(checked);
    if (checked) {
      const first = abonos[0];
      const firstMax = Math.min(Number((first.total - first.usedAmount).toFixed(2)), Math.max(invoiceTotal, 0));
      setAbonoId(first.id);
      setAmount(firstMax);
      pushSelection(true, first.id, firstMax);
    } else {
      setAbonoId('');
      setAmount(0);
      onSelection(null);
    }
  };

  const handleAbonoChange = (id: string) => {
    setAbonoId(id);
    const ab = abonos.find(a => a.id === id);
    if (ab) {
      const m = Math.min(Number((ab.total - ab.usedAmount).toFixed(2)), Math.max(invoiceTotal, 0));
      setAmount(m);
      pushSelection(enabled, id, m);
    }
  };

  const handleAmountChange = (value: number) => {
    const clamped = Math.min(value, maxAplicable);
    setAmount(clamped);
    pushSelection(enabled, abonoId, clamped);
  };

  if (!clientId || abonos.length === 0) return null;

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)' }}>
        <h3 className="card-title" style={{ margin: 0 }}>
          <ReceiptText size={16} style={{ marginRight: 8, verticalAlign: 'middle' }} />
          Abono disponible
        </h3>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-sm)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={e => handleToggle(e.target.checked)}
            disabled={abonos.length === 0}
          />
          Aplicar al emitir
        </label>
      </div>

      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: 'var(--space-2) 0 0' }}>
        Este cliente tiene <strong style={{ color: 'var(--color-success)' }}>{formatCurrency(abonos.reduce((s, a) => s + (a.total - a.usedAmount), 0))}</strong> en notas de crédito.
      </p>

      {enabled && (
        <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
          <div className="form-group">
            <label className="form-label required">Abono</label>
            <select className="form-select" value={abonoId} onChange={e => handleAbonoChange(e.target.value)}>
              {abonos.map(a => (
                <option key={a.id} value={a.id}>
                  {a.number} · disponible {formatCurrency(Number((a.total - a.usedAmount).toFixed(2)))}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label required">Importe a aplicar (máx. {formatCurrency(maxAplicable)})</label>
            <input
              type="number"
              min={0}
              step={0.01}
              className="form-input"
              value={amount}
              onChange={e => handleAmountChange(parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>
      )}

      {enabled && selected && (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', margin: 'var(--space-3) 0 0' }}>
          Al emitir se registrará {formatCurrency(amount)} de {selected.number} sobre esta factura.
          El abono compensa la deuda; el importe sellado de la factura no cambia.
          {maxAplicable >= invoiceTotal && invoiceTotal > 0 && ' Si cubre el total, la factura quedará marcada como cobrada.'}
        </p>
      )}
    </div>
  );
}
