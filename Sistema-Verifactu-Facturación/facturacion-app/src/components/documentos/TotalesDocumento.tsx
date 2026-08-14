'use client';

import React, { useState } from 'react';
import { TaxBreakdown } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import { Percent, ChevronDown, ChevronUp } from 'lucide-react';

interface TotalesDocumentoProps {
  subtotal: number;
  totalDiscount: number;
  taxBreakdown: TaxBreakdown[];
  totalTax: number;
  total: number;
  etiquetaImpuesto?: string;
  globalDiscounts?: [number, number, number];
  onGlobalDiscountsChange?: (discounts: [number, number, number]) => void;
  children?: React.ReactNode;
}

export default function TotalesDocumento({
  subtotal,
  totalDiscount,
  taxBreakdown,
  totalTax,
  total,
  etiquetaImpuesto = 'IVA',
  globalDiscounts = [0, 0, 0],
  onGlobalDiscountsChange,
  children,
}: TotalesDocumentoProps) {
  const [showGlobalDiscounts, setShowGlobalDiscounts] = useState(
    Boolean(globalDiscounts[0] || globalDiscounts[1] || globalDiscounts[2])
  );

  const handleGlobalChange = (idx: number, val: number) => {
    if (!onGlobalDiscountsChange) return;
    const next: [number, number, number] = [...globalDiscounts];
    next[idx] = val;
    onGlobalDiscountsChange(next);
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        <h3 className="card-title" style={{ margin: 0 }}>Totales</h3>
        {onGlobalDiscountsChange && (
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={() => setShowGlobalDiscounts(!showGlobalDiscounts)}
            style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <Percent size={13} />
            {showGlobalDiscounts ? 'Ocultar dtos. al pie' : 'Añadir dtos. al pie (hasta 3)'}
            {showGlobalDiscounts ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
      </div>

      {onGlobalDiscountsChange && showGlobalDiscounts && (
        <div style={{ background: 'var(--color-bg-subtle, rgba(0,0,0,0.02))', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)' }}>
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, display: 'block', marginBottom: 'var(--space-2)' }}>
            Descuentos globales de pie de documento (en cascada)
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)' }}>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Dto. Comercial (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                className="form-input"
                style={{ padding: '4px 8px', fontSize: 'var(--text-xs)' }}
                placeholder="0 %"
                value={globalDiscounts[0] || ''}
                onChange={e => handleGlobalChange(0, parseFloat(e.target.value) || 0)}
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Pronto Pago (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                className="form-input"
                style={{ padding: '4px 8px', fontSize: 'var(--text-xs)' }}
                placeholder="0 %"
                value={globalDiscounts[1] || ''}
                onChange={e => handleGlobalChange(1, parseFloat(e.target.value) || 0)}
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Dto. Especial (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                className="form-input"
                style={{ padding: '4px 8px', fontSize: 'var(--text-xs)' }}
                placeholder="0 %"
                value={globalDiscounts[2] || ''}
                onChange={e => handleGlobalChange(2, parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>
        </div>
      )}

      <div className="invoice-totals">
        <div className="invoice-totals-table">
          <div className="invoice-totals-row">
            <span className="label">Base imponible</span>
            <span className="value">{formatCurrency(subtotal)}</span>
          </div>
          {totalDiscount > 0 && (
            <div className="invoice-totals-row">
              <span className="label">Descuentos acumulados</span>
              <span className="value" style={{ color: 'var(--color-danger)' }}>
                -{formatCurrency(totalDiscount)}
              </span>
            </div>
          )}
          {taxBreakdown.map(tb => (
            <div className="invoice-totals-row" key={tb.rate}>
              <span className="label">
                {etiquetaImpuesto} {tb.rate}% (base {formatCurrency(tb.base)})
              </span>
              <span className="value">{formatCurrency(tb.amount)}</span>
            </div>
          ))}
          <div className="invoice-totals-row total">
            <span className="label">TOTAL</span>
            <span className="value">{formatCurrency(total)}</span>
          </div>
        </div>
      </div>

      {children}
    </div>
  );
}
