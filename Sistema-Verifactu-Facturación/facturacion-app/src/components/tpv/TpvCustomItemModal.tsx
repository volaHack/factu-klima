'use client';

import { useState, useEffect } from 'react';
import { X, PlusCircle, Tag, ShoppingBag } from 'lucide-react';
import { TaxRate, CompanySettings } from '@/lib/types';
import { getTaxRates, getTaxLabel } from '@/lib/constants';
import { getCompanySettings } from '@/lib/storage';

interface TpvCustomItemModalProps {
  onAdd: (item: {
    name: string;
    unitPrice: number;
    quantity: number;
    taxRate: number;
  }) => void;
  onClose: () => void;
}

export default function TpvCustomItemModal({ onAdd, onClose }: TpvCustomItemModalProps) {
  const [name, setName] = useState('Venta Libre / Varios');
  const [priceInput, setPriceInput] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [taxRate, setTaxRate] = useState<number>(TaxRate.GENERAL);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const s = await getCompanySettings();
      setSettings(s);
      if (s?.igicEnabled) {
        setTaxRate(TaxRate.IGIC_GENERAL);
      }
    })();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const price = Number(priceInput.replace(',', '.'));
    if (isNaN(price) || price <= 0) {
      setError('Introduce un precio válido mayor a 0 €');
      return;
    }
    onAdd({
      name: name.trim() || 'Venta Libre',
      unitPrice: price,
      quantity,
      taxRate,
    });
    onClose();
  };

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 1100, backdropFilter: 'blur(6px)' }}>
      <div
        className="modal tpv-custom-item-modal"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: 460,
          width: '92vw',
          padding: 0,
          borderRadius: 'var(--radius-xl)',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-xl)',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <div style={{
              width: 40,
              height: 40,
              borderRadius: 'var(--radius-lg)',
              background: 'rgba(255, 255, 255, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
            }}>
              <PlusCircle size={22} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#ffffff' }}>
                Añadir Venta Libre / Varios
              </h3>
              <p style={{ margin: 0, fontSize: 'var(--text-xs)', opacity: 0.85 }}>
                Artículo improvisado no registrado en el catálogo
              </p>
            </div>
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

        <form onSubmit={handleSubmit} style={{ padding: 'var(--space-6)', background: 'var(--bg-card)' }}>
          <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
            <label className="form-label required">Descripción del artículo</label>
            <input
              type="text"
              className="form-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="ej. Pan artesano, Fruta a granel, Servicio..."
              autoFocus
              required
              style={{ fontSize: 'var(--text-md)' }}
            />
          </div>

          <div className="form-row" style={{ marginBottom: 'var(--space-4)' }}>
            <div className="form-group">
              <label className="form-label required">Precio (€/ud)</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  inputMode="decimal"
                  className="form-input"
                  value={priceInput}
                  onChange={e => setPriceInput(e.target.value)}
                  placeholder="0,00"
                  required
                  style={{
                    fontSize: '1.2rem',
                    fontWeight: 700,
                    paddingLeft: 34,
                  }}
                />
                <span style={{
                  position: 'absolute',
                  left: 14,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontWeight: 700,
                  color: 'var(--text-tertiary)',
                }}>
                  €
                </span>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Cantidad</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ width: 42, height: 42, padding: 0, fontWeight: 700, fontSize: '1.2rem' }}
                  onClick={() => setQuantity(prev => Math.max(1, prev - 1))}
                >
                  -
                </button>
                <input
                  type="number"
                  min={1}
                  className="form-input"
                  style={{ textAlign: 'center', fontWeight: 700, fontSize: '1.1rem', height: 42 }}
                  value={quantity}
                  onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ width: 42, height: 42, padding: 0, fontWeight: 700, fontSize: '1.2rem' }}
                  onClick={() => setQuantity(prev => prev + 1)}
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 'var(--space-5)' }}>
            <label className="form-label">Tipo de {getTaxLabel(settings)} aplicado</label>
            <select
              className="form-select"
              value={taxRate}
              onChange={e => setTaxRate(Number(e.target.value))}
            >
              {getTaxRates(settings).map(tr => (
                <option key={tr.value} value={tr.rate}>
                  {tr.label}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div className="status-panel" style={{ background: 'var(--color-danger-bg)', borderColor: 'var(--color-danger)', marginBottom: 'var(--space-4)', padding: 'var(--space-3)' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger)' }}>{error}</span>
            </div>
          )}

          <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-5)' }}>
            <button type="button" className="btn btn-secondary" style={{ flex: 1, padding: '12px', justifyContent: 'center' }} onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" style={{ flex: 1.4, padding: '12px', justifyContent: 'center', fontWeight: 700 }}>
              <ShoppingBag size={18} /> Añadir al carrito
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
