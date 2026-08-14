'use client';

import React from 'react';
import { TaxBreakdown } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';

interface TotalesDocumentoProps {
  subtotal: number;
  totalDiscount: number;
  taxBreakdown: TaxBreakdown[];
  totalTax: number;
  total: number;
  etiquetaImpuesto?: string;
  children?: React.ReactNode;
}

export default function TotalesDocumento({
  subtotal,
  totalDiscount,
  taxBreakdown,
  totalTax,
  total,
  etiquetaImpuesto = 'IVA',
  children,
}: TotalesDocumentoProps) {
  return (
    <div className="card">
      <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Totales</h3>

      <div className="invoice-totals">
        <div className="invoice-totals-table">
          <div className="invoice-totals-row">
            <span className="label">Base imponible</span>
            <span className="value">{formatCurrency(subtotal)}</span>
          </div>
          {totalDiscount > 0 && (
            <div className="invoice-totals-row">
              <span className="label">Descuentos</span>
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
