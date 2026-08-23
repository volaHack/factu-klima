'use client';

import { useState } from 'react';
import { AlertTriangle, Trash2, ShieldCheck, X, FileDiff } from 'lucide-react';
import { Invoice } from '@/lib/types';
import { isSealed, deleteInvoice, cancelInvoice } from '@/lib/storage';
import { formatCurrency, formatDate } from '@/lib/utils';

interface DeleteInvoiceModalProps {
  invoice: Invoice;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (error: string) => void;
}

export default function DeleteInvoiceModal({
  invoice,
  onClose,
  onSuccess,
  onError,
}: DeleteInvoiceModalProps) {
  const [reason, setReason] = useState('');
  const [confirmNumber, setConfirmNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const sealed = isSealed(invoice);

  const handleDeleteDraft = async () => {
    if (confirmNumber.trim() !== invoice.number) {
      onError('Escribe el número exacto de la factura para confirmar la eliminación.');
      return;
    }

    setSubmitting(true);
    try {
      await deleteInvoice(invoice.id);
      onSuccess(`Borrador ${invoice.number} eliminado correctamente.`);
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Error al eliminar el borrador.');
      setSubmitting(false);
    }
  };

  const handleCancelSealed = async () => {
    if (!reason.trim()) {
      onError('Debes indicar el motivo de la anulación para cumplir con el registro Verifactu.');
      return;
    }

    setSubmitting(true);
    try {
      // `cancelInvoice` y no `saveInvoice`: sólo toca el estado y el motivo.
      //
      // Reenviar la factura entera para anularla tenía dos problemas. El
      // motivo acababa pegado al final de las observaciones en vez de en su
      // propia columna (`cancel_reason`), que es de donde lo lee cualquier
      // consulta seria. Y sobre todo, arrastraba los importes tal y como
      // los tenía esta pantalla en memoria: al sellar, la base de datos
      // recalcula los totales desde las líneas, así que si diferían aunque
      // fuera en un céntimo el disparador antifraude rechazaba la
      // anulación con un error de manipulación — cuando lo único que
      // quería hacer el usuario era anular.
      await cancelInvoice(invoice.id, reason);
      onSuccess(`Factura ${invoice.number} anulada con registro de auditoría.`);
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Error al anular la factura.');
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay animate-fade-in" style={{ zIndex: 1100 }}>
      <div className="modal" style={{ maxWidth: 480, padding: 0, overflow: 'hidden' }}>
        <div style={{
          padding: 'var(--space-5) var(--space-6)',
          background: sealed ? 'var(--wine-500)' : 'var(--bg-secondary)',
          color: sealed ? '#ffffff' : 'var(--text-primary)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid var(--border-color)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 'var(--radius-md)',
              background: sealed ? 'rgba(255,255,255,0.15)' : 'var(--color-danger-bg)',
              color: sealed ? '#ffffff' : 'var(--color-danger)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {sealed ? <ShieldCheck size={20} /> : <Trash2 size={20} />}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 600 }}>
                {sealed ? 'Comprobante de Anulación' : 'Eliminar Borrador'}
              </h3>
              <p style={{ margin: 0, fontSize: 'var(--text-xs)', opacity: 0.8 }}>
                {invoice.number} · {invoice.clientName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              opacity: 0.7,
              padding: 4,
            }}
          >
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: 'var(--space-6)' }}>
          {sealed ? (
            <div>
              <div className="status-panel" style={{
                background: 'var(--color-warning-bg)',
                borderColor: 'rgba(217, 158, 26, 0.3)',
                marginBottom: 'var(--space-5)',
              }}>
                <AlertTriangle size={20} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-primary)' }}>
                  <strong>Normativa Veri*Factu (RD 1007/2023):</strong> una factura emitida no se borra nunca —
                  romper la cadena sellada es justo lo que la norma impide—. Se queda en los libros marcada como
                  anulada, con el motivo que escribas aquí guardado junto a ella.
                </div>
              </div>

              <div className="form-group">
                <label className="form-label required">Motivo fiscal de anulación</label>
                <textarea
                  className="form-textarea"
                  rows={3}
                  placeholder="Ej: Error en datos del cliente o rectificación de importe..."
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  autoFocus
                />
              </div>

              <div style={{
                background: 'var(--bg-tertiary)',
                padding: 'var(--space-3) var(--space-4)',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-xs)',
                color: 'var(--text-secondary)',
                marginBottom: 'var(--space-5)',
              }}>
                <div><strong>Importe a anular:</strong> {formatCurrency(invoice.total)}</div>
                <div><strong>Fecha emisión:</strong> {formatDate(invoice.issueDate)}</div>
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
                <button
                  className="btn btn-primary"
                  style={{ background: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}
                  onClick={handleCancelSealed}
                  disabled={submitting || !reason.trim()}
                >
                  <FileDiff size={16} /> Anular con este motivo
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginTop: 0, marginBottom: 'var(--space-4)' }}>
                Esta acción eliminará permanentemente el borrador <strong>{invoice.number}</strong> ({formatCurrency(invoice.total)}).
              </p>

              <div className="form-group" style={{ marginBottom: 'var(--space-5)' }}>
                <label className="form-label required">
                  Para confirmar, escribe <code>{invoice.number}</code>
                </label>
                <input
                  className="form-input"
                  type="text"
                  placeholder={invoice.number}
                  value={confirmNumber}
                  onChange={e => setConfirmNumber(e.target.value)}
                  autoFocus
                />
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
                <button
                  className="btn btn-primary"
                  style={{ background: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}
                  onClick={handleDeleteDraft}
                  disabled={submitting || confirmNumber.trim() !== invoice.number}
                >
                  <Trash2 size={16} /> Eliminar Borrador
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
