'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, X, RotateCcw } from 'lucide-react';
import {
  getAlbaranes, getInvoices, createDevolucion, getCompanySettings, saveCompanySettings
} from '@/lib/storage';
import {
  Client, Product, Albaran, Invoice, Devolucion, DevolucionLineItem, DevolucionReason, DevolucionOrigin,
  UnitOfMeasure, TaxRate, InvoiceStatus
} from '@/lib/types';
import { generateId, generateInvoiceNumber, getToday, formatCurrency } from '@/lib/utils';
import { DEVOLUCION_REASONS } from '@/lib/constants';
import { useToast } from '@/hooks/useToast';

interface DevolucionFormModalProps {
  clients: Client[];
  products: Product[];
  defaultOrigin?: DevolucionOrigin;
  onClose: () => void;
  onCreated: (message: string) => void;
}

function createEmptyLine(): DevolucionLineItem {
  return {
    id: generateId(),
    productId: '',
    productName: '',
    productRef: '',
    quantity: 1,
    unitPrice: 0,
    unit: UnitOfMeasure.UNIDAD,
    taxRate: TaxRate.REDUCIDO,
    total: 0,
    restock: true,
  };
}

export default function DevolucionFormModal({
  clients, products, defaultOrigin = 'manual', onClose, onCreated,
}: DevolucionFormModalProps) {
  const { error: toastError } = useToast();
  const [origin, setOrigin] = useState<DevolucionOrigin>(defaultOrigin);
  const [albaranes, setAlbaranes] = useState<Albaran[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [originDocId, setOriginDocId] = useState('');
  const [clientId, setClientId] = useState('');
  const [issueDate, setIssueDate] = useState(getToday());
  const [reason, setReason] = useState<DevolucionReason>('otro');
  const [reasonNote, setReasonNote] = useState('');
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<DevolucionLineItem[]>([createEmptyLine()]);
  const [restock, setRestock] = useState(true);
  const [generateAbono, setGenerateAbono] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [a, i] = await Promise.all([getAlbaranes(), getInvoices()]);
      setAlbaranes(a.filter(x => x.status === 'expedido' || x.status === 'facturado'));
      setInvoices(i.filter(x => x.status !== InvoiceStatus.ANULADA && x.status !== InvoiceStatus.BORRADOR));
    })();
  }, []);

  const applyDocLines = (doc: Albaran | Invoice) => {
    setLineItems(doc.lineItems.map(li => ({
      id: generateId(),
      productId: li.productId,
      productName: li.productName,
      productRef: li.productRef,
      quantity: li.quantity,
      unitPrice: li.unitPrice,
      unit: li.unit,
      taxRate: li.taxRate,
      total: li.subtotal,
      restock: true,
    })));
  };

  const handleOriginDocChange = (id: string) => {
    setOriginDocId(id);
    const doc = origin === 'albaran'
      ? albaranes.find(a => a.id === id)
      : invoices.find(i => i.id === id);
    if (doc) {
      setClientId(doc.clientId);
      applyDocLines(doc);
    }
  };

  const handleClientChange = (cId: string) => {
    setClientId(cId);
    setOrigin('manual');
    setOriginDocId('');
  };

  const handleProductSelect = (lineIndex: number, productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    setLineItems(prev => {
      const next = [...prev];
      next[lineIndex] = {
        ...next[lineIndex],
        productId: product.id,
        productName: product.name,
        productRef: product.ref,
        unitPrice: product.unitPrice,
        unit: product.unit,
        taxRate: product.defaultTaxRate,
      };
      return recalc(next);
    });
  };

  const handleLineChange = (lineIndex: number, field: string, value: number | string | boolean) => {
    setLineItems(prev => {
      const next = [...prev];
      (next[lineIndex] as unknown as Record<string, unknown>)[field] = value;
      return recalc(next);
    });
  };

  const recalc = (lines: DevolucionLineItem[]): DevolucionLineItem[] =>
    lines.map(line => ({ ...line, total: Number((line.quantity * line.unitPrice).toFixed(2)) }));

  const addLine = () => setLineItems(prev => [...prev, createEmptyLine()]);
  const removeLine = (index: number) => {
    if (lineItems.length <= 1) return;
    setLineItems(prev => prev.filter((_, i) => i !== index));
  };

  const total = lineItems.reduce((sum, li) => sum + li.total, 0);

  const handleSave = async () => {
    if (origin !== 'manual' && !originDocId) {
      toastError('Error', `Selecciona el ${origin === 'albaran' ? 'albarán' : 'albarán o factura'} de origen.`);
      return;
    }
    if (!clientId) {
      toastError('Error', 'Selecciona un cliente.');
      return;
    }
    const validLines = lineItems.filter(l => l.productId && l.quantity > 0);
    if (validLines.length === 0) {
      toastError('Error', 'Añade al menos un producto a devolver.');
      return;
    }

    const client = clients.find(c => c.id === clientId);
    if (!client) return;
    const settings = await getCompanySettings();
    const number = generateInvoiceNumber(settings.devolucionSeries || 'DEV', settings.nextDevolucionNumber || 1);

    const doc = origin === 'albaran'
      ? albaranes.find(a => a.id === originDocId)
      : invoices.find(i => i.id === originDocId);

    const devolucion: Devolucion = {
      id: generateId(),
      number,
      series: settings.devolucionSeries || 'DEV',
      origin,
      originId: origin === 'manual' ? undefined : originDocId,
      originNumber: origin === 'manual' ? undefined : (doc as Albaran | Invoice | undefined)?.number,
      clientId: client.id,
      clientName: client.tradeName || client.businessName,
      clientNif: client.nif,
      issueDate,
      reason,
      reasonNote: reasonNote.trim(),
      status: 'registrada',
      lineItems: validLines,
      total: Number(total.toFixed(2)),
      notes: notes.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setSaving(true);
    try {
      const final = await createDevolucion(devolucion, { restock, generateAbono });
      settings.nextDevolucionNumber = (settings.nextDevolucionNumber || 1) + 1;
      await saveCompanySettings(settings);
      onCreated(
        `Devolución ${final.number} registrada${final.status === 'abonada' ? ' con abono generado' : ''}`
      );
      onClose();
    } catch (err) {
      toastError('No se pudo registrar', err instanceof Error ? err.message : 'Error desconocido');
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay animate-fade-in" style={{ zIndex: 1100 }}>
      <div className="modal" style={{ maxWidth: 720, padding: 0, overflow: 'hidden' }}>
        <div style={{
          padding: 'var(--space-5) var(--space-6)',
          background: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          borderBottom: '1px solid var(--border-color)',
        }}>
          <h3 className="card-title" style={{ margin: 0 }}>
            <RotateCcw size={18} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
            Registrar devolución
          </h3>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Origen</label>
              <select
                className="form-select"
                value={origin}
                onChange={e => {
                  setOrigin(e.target.value as DevolucionOrigin);
                  setOriginDocId('');
                  if (e.target.value === 'manual') setLineItems([createEmptyLine()]);
                }}
              >
                <option value="manual">Entrada manual (sin documento previo)</option>
                <option value="albaran">Devolver un albarán</option>
                <option value="factura">Devolver una factura</option>
              </select>
            </div>
            {origin !== 'manual' && (
              <div className="form-group">
                <label className="form-label required">{origin === 'albaran' ? 'Albarán' : 'Factura'} de origen</label>
                <select
                  className="form-select"
                  value={originDocId}
                  onChange={e => handleOriginDocChange(e.target.value)}
                >
                  <option value="">-- Seleccionar --</option>
                  {(origin === 'albaran' ? albaranes : invoices).map(d => (
                    <option key={d.id} value={d.id}>{d.number} · {d.clientName}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
            <div className="form-group">
              <label className="form-label required">Cliente</label>
              <select
                className="form-select"
                value={clientId}
                onChange={e => handleClientChange(e.target.value)}
                disabled={origin !== 'manual'}
              >
                <option value="">-- Seleccionar cliente --</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.tradeName || c.businessName} ({c.nif})</option>
                ))}
              </select>
            </div>
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
              <label className="form-label required">Motivo</label>
              <select
                className="form-select"
                value={reason}
                onChange={e => setReason(e.target.value as DevolucionReason)}
              >
                {DEVOLUCION_REASONS.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>

          {reason === 'otro' && (
            <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
              <label className="form-label">Detalle del motivo</label>
              <input
                type="text"
                className="form-input"
                value={reasonNote}
                onChange={e => setReasonNote(e.target.value)}
                placeholder="Explica el motivo de la devolución"
              />
            </div>
          )}

          <div style={{ marginTop: 'var(--space-4)' }}>
            <label className="form-label required">Líneas devueltas</label>
            <div className="line-items">
              <div className="line-items-header">
                <span>Producto</span>
                <span>Cantidad</span>
                <span>Precio ud.</span>
                <span style={{ textAlign: 'right' }}>Total</span>
                <span>Restock</span>
                <span></span>
              </div>
              {lineItems.map((line, index) => (
                <div className="line-item-row" key={line.id}>
                  <select
                    value={line.productId}
                    onChange={e => handleProductSelect(index, e.target.value)}
                    style={{ minWidth: 0 }}
                  >
                    <option value="">Seleccionar producto</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>[{p.ref}] {p.name}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={line.quantity}
                    onChange={e => handleLineChange(index, 'quantity', parseFloat(e.target.value) || 0)}
                    style={{ textAlign: 'right' }}
                  />
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={line.unitPrice}
                    onChange={e => handleLineChange(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                    style={{ textAlign: 'right' }}
                  />
                  <div className="line-item-subtotal">{formatCurrency(line.total)}</div>
                  <input
                    type="checkbox"
                    checked={line.restock}
                    onChange={e => handleLineChange(index, 'restock', e.target.checked)}
                    title="La mercancía vuelve a la nave"
                  />
                  <button className="line-item-delete" onClick={() => removeLine(index)} disabled={lineItems.length <= 1}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <div className="line-items-add">
                <button className="btn btn-ghost btn-sm" onClick={addLine}>
                  <Plus size={14} /> Añadir línea
                </button>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-sm)', cursor: 'pointer' }}>
              <input type="checkbox" checked={restock} onChange={e => setRestock(e.target.checked)} />
              Reponer el stock de las líneas marcadas
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-sm)', cursor: 'pointer' }}>
              <input type="checkbox" checked={generateAbono} onChange={e => setGenerateAbono(e.target.checked)} />
              Generar abono (nota de crédito) por {formatCurrency(Number(total.toFixed(2)))} a favor del cliente
            </label>
          </div>

          <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
            <label className="form-label">Observaciones</label>
            <textarea
              className="form-textarea"
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Notas internas sobre la devolución..."
            />
          </div>
        </div>

        <div style={{
          padding: 'var(--space-4) var(--space-6)',
          borderTop: '1px solid var(--border-color)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)',
        }}>
          <div style={{ fontSize: 'var(--text-sm)' }}>
            <span style={{ color: 'var(--text-tertiary)' }}>Total devuelto: </span>
            <strong style={{ fontFamily: 'var(--font-mono)' }}>{formatCurrency(Number(total.toFixed(2)))}</strong>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Registrando…' : 'Registrar devolución'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
