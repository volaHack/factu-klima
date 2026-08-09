import { useState, useEffect } from 'react';
import { X, PlusCircle, Tag } from 'lucide-react';
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
      if (s.igicEnabled) {
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal tpv-custom-item-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="tpv-checkout-header">
          <h3><PlusCircle size={20} className="text-accent" /> Añadir Venta Libre / Varios</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="tpv-custom-item-form" style={{ marginTop: 'var(--space-4)' }}>
          <div className="form-group">
            <label className="form-label required">Descripción del artículo</label>
            <input
              type="text"
              className="form-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="ej. Pan artesano, Fruta a granel, Servicio..."
              autoFocus
              required
            />
          </div>

          <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
            <div className="form-group">
              <label className="form-label required">Precio (€/ud)</label>
              <div className="field-affix has-prefix">
                <span className="field-affix-prefix">€</span>
                <input
                  type="text"
                  inputMode="decimal"
                  className="form-input"
                  value={priceInput}
                  onChange={e => setPriceInput(e.target.value)}
                  placeholder="0,00"
                  required
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Cantidad</label>
              <div className="tpv-qty-stepper" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ width: 38, height: 38, padding: 0 }}
                  onClick={() => setQuantity(prev => Math.max(1, prev - 1))}
                >
                  -
                </button>
                <input
                  type="number"
                  min={1}
                  className="form-input"
                  style={{ textAlign: 'center', fontWeight: 'bold' }}
                  value={quantity}
                  onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ width: 38, height: 38, padding: 0 }}
                  onClick={() => setQuantity(prev => prev + 1)}
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
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
            <div className="login-alert login-alert--error" style={{ marginTop: 'var(--space-3)' }}>
              {error}
            </div>
          )}

          <div className="tpv-checkout-actions" style={{ marginTop: 'var(--space-6)' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary">
              <Tag size={16} /> Añadir al carrito
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
