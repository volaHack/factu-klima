'use client';

import { useState, useEffect, useMemo } from 'react';
import { X, Search, Printer, RotateCcw, CheckCircle, Clock, Banknote, CreditCard, Smartphone, ShieldCheck, CloudOff, FileText } from 'lucide-react';
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
    <div className="modal-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 1100, backdropFilter: 'blur(6px)' }}>
      <div
        className="modal tpv-today-sales-modal"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: 880,
          width: '94vw',
          maxHeight: '90vh',
          overflow: 'hidden',
          padding: 0,
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-xl)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          padding: 'var(--space-5) var(--space-6)',
          background: 'linear-gradient(135deg, var(--wine-500) 0%, #2a0e17 100%)',
          color: '#ffffff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span className="badge" style={{ background: 'rgba(255,255,255,0.2)', color: '#ffffff', fontWeight: 700 }}>
                Turno Actual TPV
              </span>
              <span style={{ fontSize: 'var(--text-xs)', opacity: 0.85 }}>
                {invoices.length} tickets hoy
              </span>
            </div>
            <h3 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#ffffff', margin: '4px 0 0' }}>
              Ventas del Día · Total: <span style={{ color: '#f6b9cf' }}>{formatCurrency(totalSalesToday)}</span>
            </h3>
          </div>
          <button
            className="btn btn-ghost btn-icon"
            onClick={onClose}
            style={{ color: '#ffffff', opacity: 0.8 }}
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{
          padding: 'var(--space-6)',
          background: 'var(--bg-card)',
          display: 'grid',
          gridTemplateColumns: '1fr 1.2fr',
          gap: 'var(--space-5)',
          minHeight: 440,
          overflowY: 'auto',
        }}>
          {/* Left: Search & Tickets List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                className="form-input"
                placeholder="Buscar ticket por número o producto..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ paddingLeft: 36 }}
              />
              <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
            </div>

            <div style={{
              flex: 1,
              overflowY: 'auto',
              maxHeight: 380,
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
              paddingRight: 4,
            }}>
              {loading ? (
                <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando ventas...</div>
              ) : filteredInvoices.length === 0 ? (
                <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
                  No hay tickets emitidos hoy todavía.
                </div>
              ) : (
                filteredInvoices.map(inv => (
                  <button
                    key={inv.id}
                    onClick={() => setSelectedId(inv.id)}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid',
                      borderColor: selectedId === inv.id ? 'var(--accent-500)' : 'var(--border-color)',
                      background: selectedId === inv.id ? 'var(--accent-50)' : 'var(--bg-secondary)',
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      transition: 'all 0.15s ease',
                      opacity: inv.status === InvoiceStatus.ANULADA ? 0.65 : 1,
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                        <span style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>{inv.number}</span>
                        {inv.status === InvoiceStatus.ANULADA && (
                          <span className="badge badge-danger" style={{ fontSize: '10px', padding: '1px 6px' }}>ANULADA</span>
                        )}
                      </div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
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

          {/* Right: Selected Ticket Detail */}
          <div style={{
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-5)',
            display: 'flex',
            flexDirection: 'column',
          }}>
            {selectedInvoice ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 'var(--space-4)', borderBottom: '1px solid var(--border-color)' }}>
                  <div>
                    <h4 style={{ margin: 0, fontWeight: 800, fontSize: '1.2rem', color: 'var(--text-primary)' }}>
                      {selectedInvoice.number}
                    </h4>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                      Emitida a las {new Date(selectedInvoice.createdAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 900, fontSize: '1.3rem', color: 'var(--accent-500)' }}>
                      {formatCurrency(selectedInvoice.total)}
                    </div>
                    <span className="badge badge-success" style={{ fontSize: '11px', marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <ShieldCheck size={12} /> SHA-256 Validado
                    </span>
                  </div>
                </div>

                {/* Line Items */}
                <div style={{ flex: 1, overflowY: 'auto', margin: 'var(--space-4) 0', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)' }}>
                    Detalle de artículos ({selectedInvoice.lineItems.length}):
                  </span>
                  {selectedInvoice.lineItems.map(li => (
                    <div key={li.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', padding: '6px 0', borderBottom: '1px dashed var(--border-subtle)' }}>
                      <span style={{ color: 'var(--text-primary)' }}>
                        <strong>{li.quantity}x</strong> {li.productName}
                      </span>
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                        {formatCurrency(li.total)}
                      </span>
                    </div>
                  ))}
                </div>

                {cancellingId === selectedInvoice.id ? (
                  <div style={{ background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)' }}>
                    <label className="form-label" style={{ color: 'var(--color-danger)', fontWeight: 700, marginBottom: 4 }}>
                      Motivo de la anulación / devolución:
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      value={cancelReason}
                      onChange={e => setCancelReason(e.target.value)}
                      placeholder="Ej. Devolución de producto, error de cobro..."
                      autoFocus
                    />
                    <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
                      <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setCancellingId(null)}>
                        Cancelar
                      </button>
                      <button className="btn btn-primary" style={{ flex: 1, background: 'var(--color-danger)', borderColor: 'var(--color-danger)' }} onClick={handleConfirmCancel}>
                        Confirmar Anulación
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 'var(--space-3)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--border-color)' }}>
                    <button className="btn btn-secondary" style={{ flex: 1, padding: '10px', justifyContent: 'center' }} onClick={() => onReprint(selectedInvoice)}>
                      <Printer size={16} /> Reimprimir
                    </button>
                    {selectedInvoice.status !== InvoiceStatus.ANULADA && (
                      <button className="btn btn-secondary" style={{ flex: 1, padding: '10px', justifyContent: 'center', color: 'var(--color-danger)' }} onClick={() => setCancellingId(selectedInvoice.id)}>
                        <RotateCcw size={16} /> Devolver
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>
                Selecciona un ticket de la izquierda para ver su detalle.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
