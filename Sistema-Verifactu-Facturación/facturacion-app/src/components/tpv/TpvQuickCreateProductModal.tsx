import { useState, useEffect } from 'react';
import { X, PackagePlus, Barcode, Check } from 'lucide-react';
import { Product, TaxRate, UnitOfMeasure, CompanySettings } from '@/lib/types';
import { getTaxRates, getTaxLabel, UNITS_OF_MEASURE } from '@/lib/constants';
import { generateId } from '@/lib/utils';
import { saveProduct, getCompanySettings } from '@/lib/storage';

interface CategoryOption {
  value: string;
  label: string;
}

interface TpvQuickCreateProductModalProps {
  initialBarcode?: string;
  categories: CategoryOption[];
  onCreated: (newProduct: Product) => void;
  onClose: () => void;
}

export default function TpvQuickCreateProductModal({
  initialBarcode = '',
  categories,
  onCreated,
  onClose,
}: TpvQuickCreateProductModalProps) {
  const [barcode, setBarcode] = useState(initialBarcode);
  const [name, setName] = useState('');
  const [unitPriceInput, setUnitPriceInput] = useState('');
  const [category, setCategory] = useState(categories[0]?.value || 'otros');
  const [taxRate, setTaxRate] = useState<number>(TaxRate.GENERAL);
  const [unit, setUnit] = useState<UnitOfMeasure>(UnitOfMeasure.UNIDAD);
  const [stockQuantity, setStockQuantity] = useState(50);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [submitting, setSubmitting] = useState(false);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const price = Number(unitPriceInput.replace(',', '.'));
    if (isNaN(price) || price < 0) {
      setError('Introduce un precio válido en euros (€)');
      return;
    }
    if (!name.trim()) {
      setError('Introduce el nombre del producto');
      return;
    }

    setSubmitting(true);
    try {
      const generatedRef = `PRD-${Math.floor(1000 + Math.random() * 9000)}`;
      const newProduct: Product = {
        id: generateId(),
        ref: generatedRef,
        name: name.trim(),
        description: '',
        category,
        unitPrice: price,
        defaultTaxRate: taxRate,
        unit,
        active: true,
        barcode: barcode.trim() || undefined,
        stockQuantity: Number(stockQuantity) || 0,
        lowStockThreshold: 5,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await saveProduct(newProduct);
      onCreated(newProduct);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar el nuevo producto');
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal tpv-quick-create-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="tpv-checkout-header">
          <h3><PackagePlus size={22} className="text-accent" /> Dar de alta nuevo producto</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Cerrar (Esc)">
            <X size={18} />
          </button>
        </div>

        {initialBarcode && (
          <div style={{
            background: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-3) var(--space-4)',
            marginTop: 'var(--space-3)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            color: '#3b82f6',
            fontSize: 'var(--text-sm)'
          }}>
            <Barcode size={20} />
            <span>Código de barras escaneado: <strong style={{ fontFamily: 'var(--font-mono)' }}>{initialBarcode}</strong></span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ marginTop: 'var(--space-4)' }}>
          <div className="form-group">
            <label className="form-label required">Nombre del producto</label>
            <input
              type="text"
              className="form-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="ej. Leche Entera 1L, Detergente Líquido..."
              autoFocus
              required
            />
          </div>

          <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
            <div className="form-group">
              <label className="form-label required">Precio de venta (€)</label>
              <div className="field-affix has-prefix">
                <span className="field-affix-prefix">€</span>
                <input
                  type="text"
                  inputMode="decimal"
                  className="form-input"
                  value={unitPriceInput}
                  onChange={e => setUnitPriceInput(e.target.value)}
                  placeholder="0,00"
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Categoría</label>
              <select
                className="form-select"
                value={category}
                onChange={e => setCategory(e.target.value)}
              >
                {categories.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
            <div className="form-group">
              <label className="form-label">Tipo de {getTaxLabel(settings)}</label>
              <select
                className="form-select"
                value={taxRate}
                onChange={e => setTaxRate(Number(e.target.value))}
              >
                {getTaxRates(settings).map(tr => (
                  <option key={tr.value} value={tr.rate}>{tr.label}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Unidad de medida</label>
              <select
                className="form-select"
                value={unit}
                onChange={e => setUnit(e.target.value as UnitOfMeasure)}
              >
                {UNITS_OF_MEASURE.map(u => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
            <div className="form-group">
              <label className="form-label">Código de barras</label>
              <input
                type="text"
                className="form-input"
                value={barcode}
                onChange={e => setBarcode(e.target.value)}
                placeholder="Escanea o escribe EAN-13..."
              />
            </div>

            <div className="form-group">
              <label className="form-label">Stock inicial</label>
              <input
                type="number"
                min={0}
                className="form-input"
                value={stockQuantity}
                onChange={e => setStockQuantity(parseInt(e.target.value) || 0)}
              />
            </div>
          </div>

          {error && (
            <div className="login-alert login-alert--error" style={{ marginTop: 'var(--space-4)' }}>
              {error}
            </div>
          )}

          <div className="tpv-checkout-actions" style={{ marginTop: 'var(--space-6)', display: 'flex', gap: 'var(--space-3)' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} disabled={submitting}>
              <Check size={16} /> {submitting ? 'Guardando…' : 'Guardar y añadir al ticket (Enter)'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
