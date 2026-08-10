'use client';

import { useState, useEffect, useMemo } from 'react';
import { X, CreditCard, CheckCircle2 } from 'lucide-react';
import {
  applyAbonoToInvoice, getAbonoAplicacionesByInvoice, saveInvoice
} from '@/lib/storage';
import { Abono, Invoice, InvoiceStatus } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';

interface AplicarAbonoModalProps {
  abono: Abono;
  invoices: Invoice[];
  onClose: () => void;
  onApplied: (message: string) => void;
}

export default function AplicarAbonoModal({
  abono, invoices, onClose, onApplied,
}: AplicarAbonoModalProps) {
  const { error: toastError } = useToast();
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [amount, setAmount] = useState(0);
  const [aplicadoPorFactura, setAplicadoPorFactura] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  const candidatas = useMemo(
    () => invoices.filter(i =>
      i.clientId === abono.clientId &&
      (i.status === InvoiceStatus.PENDIENTE || i.status === InvoiceStatus.EMITIDA || i.status === InvoiceStatus.VENCIDA)
    ),
    [invoices, abono]
  );

  useEffect(() => {
    (async () => {
      const map: Record<string, number> = {};
      for (const inv of candidatas) {
        const apps = await getAbonoAplicacionesByInvoice(inv.id);
        map[inv.id] = apps.reduce((sum, a) => sum + a.amount, 0);
      }
      setAplicadoPorFactura(map);
    })();
  }, [candidatas]);

  const disponible = Number((abono.total - abono.usedAmount).toFixed(2));
  const selected = candidatas.find(i => i.id === selectedInvoiceId);
  const aplicadoYa = selected ? (aplicadoPorFactura[selected.id] || 0) : 0;
  const pendienteFactura = selected ? Number((selected.total - aplicadoYa).toFixed(2)) : 0;
  const maxAplicable = Math.min(disponible, pendienteFactura);

  const handleApply = async () => {
    if (!selected) {
      toastError('Error', 'Selecciona una factura a la que aplicar el abono.');
      return;
    }
    if (amount <= 0 || amount > maxAplicable) {
      toastError('Importe no válido', `Sólo puedes aplicar hasta ${formatCurrency(maxAplicable)}.`);
      return;
    }

    setSaving(true);
    try {
      await applyAbonoToInvoice(abono.id, selected.id, selected.number, amount);

      const restante = Number((pendienteFactura - amount).toFixed(2));
      if (restante <= 0.01 && selected.status !== InvoiceStatus.PAGADA) {
        await saveInvoice({
          ...selected,
          status: InvoiceStatus.PAGADA,
          paidDate: new Date().toISOString().split('T')[0],
          updatedAt: new Date().toISOString(),
        });
      }

      onApplied(
        `${formatCurrency(amount)} aplicados a ${selected.number}${restante <= 0.01 ? ' · factura cobrada' : ''}`
      );
      onClose();
    } catch (err) {
      toastError('No se pudo aplicar', err instanceof Error ? err.message : 'Error desconocido');
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay animate-fade-in" style={{ zIndex: 1100 }}>
      <div className="modal" style={{ maxWidth: 520, padding: 0, overflow: 'hidden' }}>
        <div style={{
          padding: 'var(--space-5) var(--space-6)',
          background: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          borderBottom: '1px solid var(--border-color)',
        }}>
          <h3 className="card-title" style={{ margin: 0 }}>
            <CreditCard size={18} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
            Aplicar {abono.number}
          </h3>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <div style={{
            background: 'var(--bg-tertiary)', padding: 'var(--space-3) var(--space-4)',
            borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-4)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-tertiary)' }}>Importe del abono</span>
              <strong>{formatCurrency(abono.total)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-tertiary)' }}>Ya aplicado</span>
              <span>{formatCurrency(abono.usedAmount)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-success)' }}>
              <span>Disponible</span>
              <strong>{formatCurrency(disponible)}</strong>
            </div>
          </div>

          {candidatas.length === 0 ? (
            <div className="callout callout-info">
              <CheckCircle2 size={16} />
              <div>
                <strong>No hay facturas pendientes de este cliente</strong>
                <p>El abono queda disponible para futuras facturas.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="form-group">
                <label className="form-label required">Factura a compensar</label>
                <select
                  className="form-select"
                  value={selectedInvoiceId}
                  onChange={e => {
                    setSelectedInvoiceId(e.target.value);
                    const inv = candidatas.find(i => i.id === e.target.value);
                    if (inv) {
                      const pend = Number((inv.total - (aplicadoPorFactura[inv.id] || 0)).toFixed(2));
                      setAmount(Math.min(disponible, pend));
                    }
                  }}
                >
                  <option value="">-- Seleccionar factura --</option>
                  {candidatas.map(inv => (
                    <option key={inv.id} value={inv.id}>
                      {inv.number} · {formatCurrency(inv.total)} · resta {formatCurrency(Number((inv.total - (aplicadoPorFactura[inv.id] || 0)).toFixed(2)))}
                    </option>
                  ))}
                </select>
              </div>

              {selected && (
                <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
                  <label className="form-label required">Importe a aplicar (máx. {formatCurrency(maxAplicable)})</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    className="form-input"
                    value={amount}
                    onChange={e => setAmount(parseFloat(e.target.value) || 0)}
                  />
                </div>
              )}
            </>
          )}
        </div>

        <div style={{
          padding: 'var(--space-4) var(--space-6)',
          borderTop: '1px solid var(--border-color)',
          display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)',
        }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleApply} disabled={saving || !selected || candidatas.length === 0}>
            {saving ? 'Aplicando…' : 'Aplicar abono'}
          </button>
        </div>
      </div>
    </div>
  );
}
