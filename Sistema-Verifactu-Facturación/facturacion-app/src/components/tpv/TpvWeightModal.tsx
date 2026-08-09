'use client';

import { useState } from 'react';
import { X, Scale } from 'lucide-react';
import { Product } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import { pluToKg, pluKgToPrice } from '@/lib/tpvOffline';

interface TpvWeightModalProps {
  product: Product;
  onAdd: (kg: number) => void;
  onClose: () => void;
}

const PRESETS = [
  { grams: 250, label: '250g' },
  { grams: 500, label: '500g' },
  { grams: 1000, label: '1kg' },
  { grams: 2000, label: '2kg' },
];

export default function TpvWeightModal({ product, onAdd, onClose }: TpvWeightModalProps) {
  const [grams, setGrams] = useState(1000);

  const kg = pluToKg(grams);
  const total = pluKgToPrice(product.unitPrice, kg);

  const commit = (g: number) => {
    onAdd(pluToKg(g));
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420, width: '92vw' }}>
        <div className="tpv-checkout-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Scale size={18} style={{ color: 'var(--accent-500)' }} />
            <h3 style={{ margin: 0 }}>Venta por peso</h3>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="tpv-weight-product" style={{ marginBottom: 'var(--space-3)' }}>
          <div className="tpv-weight-name">{product.name}</div>
          <div className="tpv-weight-price" style={{ color: 'var(--text-muted)' }}>{formatCurrency(product.unitPrice)}/kg</div>
        </div>

        <label className="form-label">Peso en gramos</label>
        <input
          className="form-input"
          type="number"
          inputMode="numeric"
          min={1}
          step={5}
          value={grams}
          onChange={e => setGrams(Math.max(1, parseInt(e.target.value) || 0))}
          autoFocus
          onFocus={e => e.target.select()}
        />

        <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)', flexWrap: 'wrap' }}>
          {PRESETS.map(p => (
            <button
              key={p.grams}
              className="btn btn-secondary btn-sm"
              onClick={() => setGrams(p.grams)}
              style={{ flex: 1 }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="tpv-weight-total" style={{ marginTop: 'var(--space-4)', textAlign: 'center' }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            {kg.toFixed(3)} kg · {formatCurrency(product.unitPrice)}/kg
          </div>
          <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--accent-500)' }}>
            {formatCurrency(total)}
          </div>
        </div>

        <button className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: 'var(--space-4)' }} onClick={() => commit(grams)}>
          Añadir al ticket · {formatCurrency(total)}
        </button>
      </div>
    </div>
  );
}
