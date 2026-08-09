'use client';

import { useState, useEffect, useMemo } from 'react';
import { X, Search, Printer, RotateCcw, CheckCircle, Clock, Banknote, CreditCard, Smartphone, ShieldCheck, CloudOff } from 'lucide-react';
import { Invoice, InvoiceStatus, PaymentMethod } from '@/lib/types';
import { getInvoices, cancelInvoice } from '@/lib/storage';
import { formatCurrency, getToday } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';

interface TpvTodaySalesModalProps {
  onReprint: (invoice: Invoice) => void;
  onClose: () => void;
}

export default function TpvTodaySalesModal({ onReprint, onClose }: TpvTodaySalesModalProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('Devolución de cliente');
  const { success, error: toastError } = useToast();

  const loadTodayInvoices = async () => {
    setLoading(true);
    try {
      const all = await getInvoices();
      const todayStr = getToday();
      const filtered = all
        .filter(inv => inv.issueDate === todayStr || inv.createdAt.startsWith(todayStr))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setInvoices(filtered);
      if (filtered.length > 0 && !selectedId) {
        setSelectedId(filtered[0].id);
      }
    } catch {
      toastError('Error', 'No se pudieron cargar las ventas del día');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTodayInvoices();
  }, []);

  const selectedInvoice = useMemo(() => {
    return invoices.find(inv => inv.id === selectedId) || null;
  }, [invoices, selectedId]);

  const filteredInvoices = useMemo(() => {
    if (!search.trim()) return invoices;
    const q = search.toLowerCase();
    return invoices.filter(inv =>
      inv.number.toLowerCase().includes(q) ||
      inv.clientName.toLowerCase().includes(q) ||
      inv.lineItems.some(li => li.productName.toLowerCase().includes(q))
    );
  }, [invoices, search]);

  const totalSalesToday = useMemo(() => {
    return invoices
      .filter(inv => inv.status !== InvoiceStatus.ANULADA)
      .reduce((sum, inv) => sum + inv.total, 0);
  }, [invoices]);

  const pendingSync = useMemo(() => invoices.filter(inv => inv.numberTemporary).length, [invoices]);

  const handleConfirmCancel = async () => {
    if (!selectedInvoice) return;
    try {
      await cancelInvoice(selectedInvoice.id, cancelReason || 'Devolución de producto en TPV');
      success('Ticket anulado', `El ticket ${selectedInvoice.number} se ha registrado como anulado`);
      setCancellingId(null);
      await loadTodayInvoices();
    } catch (err) {
      toastError('No se pudo anular', err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  const getMethodIcon = (pm: PaymentMethod) => {
    if (pm === PaymentMethod.EFECTIVO) return <Banknote size={15} style={{ color: 'var(--color-success)' }} />;
    if (pm === PaymentMethod.TARJETA) return <CreditCard size={15} style={{ color: 'var(--accent-500)' }} />;
    return <Smartphone size={15} style={{ color: 'var(--color-info)' }} />;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal tpv-today-sales-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 840, width: '92vw' }}>
        <div className="tpv-checkout-header" style={{ paddingBottom: 'var(--space-3)', borderBottom: '1px solid var(--border-color)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span className="badge badge-rose">Turno actual</span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{invoices.length} tickets emitidos hoy</span>
            </div>
            <h3 style={{ fontSize: 'var(--text-xl)', fontWeight: 800, color: 'var(--text-primary)', margin: 0, marginTop: 4 }}>
              Ventas del Día · Total: <span style={{ color: 'var(--accent-500)' }}>{formatCurrency(totalSalesToday)}</span>
            </h3>
            {pendingSync > 0 && (
              <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6 }} title="Emitidos sin conexión: se sellarán en el servidor al reconectar">
                <CloudOff size={12} /> {pendingSync} {pendingSync === 1 ? 'ticket' : 'tickets'} sin sincronizar
              </span>
            )}
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Cerrar (Esc)">
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 'var(--space-4)', marginTop: 'var(--space-4)', minHeight: 420 }}>
          {/* List panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div className="search-bar">
              <Search size={15} className="search-icon" />
              <input
                type="text"
                className="search-input"
                placeholder="Buscar ticket por número o producto..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            <div style={{ flex: 1, overflowY: 'auto', maxHeight: 360, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', paddingRight: 4 }}>
              {loading ? (
                <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando ventas...</div>
              ) : filteredInvoices.length === 0 ? (
                <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
                  No hay tickets cobrados hoy todavía.
                </div>
              ) : (
                filteredInvoices.map(inv => (
                  <button
                    key={inv.id}
                    onClick={() => setSelectedId(inv.id)}
                    className={`choice-card ${selectedId === inv.id ? 'active' : ''}`}
                    style={{
                      padding: 'var(--space-3)',
                      textAlign: 'left',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      borderColor: selectedId === inv.id ? 'var(--accent-500)' : 'var(--border-color)',
                      opacity: inv.status === InvoiceStatus.ANULADA ? 0.6 : 1,
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                        <span style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>{inv.number}</span>
                        {inv.numberTemporary && (
                          <CloudOff size={12} style={{ color: 'var(--color-warning)' }} aria-label="Pendiente de sincronizar" />
                        )}
                        {inv.status === InvoiceStatus.ANULADA && (
                          <span className="badge badge-danger" style={{ fontSize: '10px' }}>ANULADA</span>
                        )}
                      </div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <Clock size={12} />
                        {new Date(inv.createdAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                        <span>·</span>
                        {getMethodIcon(inv.paymentMethod)}
                        <span style={{ textTransform: 'capitalize' }}>{inv.paymentMethod}</span>
                      </div>
                    </div>
                    <div style={{ fontWeight: 800, fontSize: 'var(--text-base)', color: inv.status === InvoiceStatus.ANULADA ? 'var(--text-muted)' : 'var(--accent-500)' }}>
                      {formatCurrency(inv.total)}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Details panel */}
          <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', display: 'flex', flexDirection: 'column' }}>
            {selectedInvoice ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 'var(--space-3)', borderBottom: '1px solid var(--border-color)' }}>
                  <div>
                    <h4 style={{ margin: 0, fontWeight: 800, fontSize: 'var(--text-lg)', color: 'var(--text-primary)' }}>{selectedInvoice.number}</h4>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                      Emitida a las {new Date(selectedInvoice.createdAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 900, fontSize: 'var(--text-xl)', color: 'var(--accent-500)' }}>
                      {formatCurrency(selectedInvoice.total)}
                    </div>
                    {selectedInvoice.numberTemporary ? (
                      <span className="badge badge-warning" style={{ fontSize: '11px', marginTop: 2 }}>
                        <CloudOff size={12} /> Pendiente de sincronizar
                      </span>
                    ) : (
                      <span className="badge badge-success" style={{ fontSize: '11px', marginTop: 2 }}>
                        <ShieldCheck size={12} /> SHA-256 Validado
                      </span>
                    )}
                  </div>
                </div>

                {/* Line items summary */}
                <div style={{ flex: 1, overflowY: 'auto', margin: 'var(--space-3) 0', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                    Detalle de artículos ({selectedInvoice.lineItems.length}):
                  </span>
                  {selectedInvoice.lineItems.map(li => (
                    <div key={li.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', padding: '4px 0', borderBottom: '1px dashed var(--border-subtle)' }}>
                      <span style={{ color: 'var(--text-primary)' }}>
                        <strong>{li.quantity}x</strong> {li.productName}
                      </span>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {formatCurrency(li.total)}
                      </span>
                    </div>
                  ))}
                </div>

                {cancellingId === selectedInvoice.id ? (
                  <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', marginTop: 'auto' }}>
                    <label className="form-label" style={{ color: '#ef4444', fontWeight: 700, marginBottom: 4 }}>Motivo de la anulación / devolución:</label>
                    <input
                      type="text"
                      className="form-input"
                      value={cancelReason}
                      onChange={e => setCancelReason(e.target.value)}
                      placeholder="Ej. Devolución de producto, error de cobro..."
                    />
                    <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
                      <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => setCancellingId(null)}>
                        Cancelar
                      </button>
                      <button className="btn btn-danger btn-sm" style={{ flex: 1 }} onClick={handleConfirmCancel}>
                        Confirmar Anulación
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'auto', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--border-color)' }}>
                    <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => onReprint(selectedInvoice)}>
                      <Printer size={16} /> Reimprimir
                    </button>
                    {selectedInvoice.status !== InvoiceStatus.ANULADA && (
                      <button className="btn btn-ghost" style={{ color: '#ef4444' }} onClick={() => setCancellingId(selectedInvoice.id)}>
                        <RotateCcw size={16} /> Devolver
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                Selecciona un ticket para ver sus detalles.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
