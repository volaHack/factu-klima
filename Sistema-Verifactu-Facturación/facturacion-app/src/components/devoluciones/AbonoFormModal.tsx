'use client';

import { useState } from 'react';
import { X, ReceiptText } from 'lucide-react';
import { saveAbono, getCompanySettings, saveCompanySettings } from '@/lib/storage';
import { Client, Abono } from '@/lib/types';
import { generateId, generateInvoiceNumber, getToday } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';

interface AbonoFormModalProps {
  clients: Client[];
  onClose: () => void;
  onCreated: (message: string) => void;
}

export default function AbonoFormModal({
  clients, onClose, onCreated,
}: AbonoFormModalProps) {
  const { error: toastError } = useToast();
  const [clientId, setClientId] = useState('');
  const [issueDate, setIssueDate] = useState(getToday());
  const [total, setTotal] = useState(0);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!clientId) {
      toastError('Error', 'Selecciona un cliente.');
      return;
    }
    if (total <= 0) {
      toastError('Error', 'El importe del abono debe ser mayor que cero.');
      return;
    }
    if (!reason.trim()) {
      toastError('Error', 'Indica el motivo del abono.');
      return;
    }
    const client = clients.find(c => c.id === clientId);
    if (!client) return;

    const settings = await getCompanySettings();
    const abono: Abono = {
      id: generateId(),
      number: generateInvoiceNumber(settings.abonoSeries || 'ABO', settings.nextAbonoNumber || 1),
      series: settings.abonoSeries || 'ABO',
      clientId: client.id,
      clientName: client.tradeName || client.businessName,
      clientNif: client.nif,
      issueDate,
      total: Number(total.toFixed(2)),
      usedAmount: 0,
      status: 'emitido',
      reason: reason.trim(),
      notes: notes.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setSaving(true);
    try {
      await saveAbono(abono);
      settings.nextAbonoNumber = (settings.nextAbonoNumber || 1) + 1;
      await saveCompanySettings(settings);
      onCreated(`Abono ${abono.number} emitido`);
      onClose();
    } catch (err) {
      toastError('No se pudo guardar', err instanceof Error ? err.message : 'Error desconocido');
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
            <ReceiptText size={18} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
            Nuevo abono
          </h3>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <div className="form-group">
            <label className="form-label required">Cliente</label>
            <select
              className="form-select"
              value={clientId}
              onChange={e => setClientId(e.target.value)}
            >
              <option value="">-- Seleccionar cliente --</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.tradeName || c.businessName} ({c.nif})</option>
              ))}
            </select>
          </div>

          <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
            <div className="form-group">
              <label className="form-label required">Fecha</label>
              <input
                type="date"
                className="form-input"
                value={issueDate}
                onChange={e => setIssueDate(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label required">Importe</label>
              <input
                type="number"
                min={0}
                step={0.01}
                className="form-input"
                value={total}
                onChange={e => setTotal(parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
            <label className="form-label required">Motivo</label>
            <input
              type="text"
              className="form-input"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Ej.: rectificación del pedido 123, descuento comercial…"
            />
          </div>

          <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
            <label className="form-label">Observaciones</label>
            <textarea
              className="form-textarea"
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div style={{
          padding: 'var(--space-4) var(--space-6)',
          borderTop: '1px solid var(--border-color)',
          display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)',
        }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando…' : 'Emitir abono'}
          </button>
        </div>
      </div>
    </div>
  );
}
