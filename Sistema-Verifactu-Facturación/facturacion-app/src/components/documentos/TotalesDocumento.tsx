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
  /**
   * Cuánto de `totalDiscount` viene del descuento al pie, y con qué
   * porcentajes. Si se pasa, el descuento se enseña en dos renglones en
   * vez de uno: lo rebajado en las líneas y lo rebajado sobre el total.
   */
  descuentoAlPie?: number;
  porcentajesPie?: number[];
  globalDiscounts?: [number, number, number];
  onGlobalDiscountsChange?: (discounts: [number, number, number]) => void;
  /**
   * El bloque como protagonista de la pantalla: el total en grande y la
   * luz del marco dando vueltas (estilos/neon.css). Sólo en los
   * formularios de crear y editar, donde el total es lo que se mira
   * mientras se rellenan las líneas.
   */
  destacado?: boolean;
  children?: React.ReactNode;
}

export default function TotalesDocumento({
  subtotal,
  totalDiscount,
  taxBreakdown,
  totalTax,
  total,
  etiquetaImpuesto = 'IVA',
  descuentoAlPie = 0,
  porcentajesPie = [],
  globalDiscounts = [0, 0, 0],
  onGlobalDiscountsChange,
  destacado = false,
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

  const tarjeta = (
    <div className={`card${destacado ? ' totales-heroe' : ''}`}>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'var(--space-2)' }}>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Dto. comercial (%)</label>
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
              <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Pronto pago (%)</label>
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
              <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Dto. especial (%)</label>
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
          {totalDiscount - descuentoAlPie > 0.005 && (
            <div className="invoice-totals-row">
              <span className="label">
                {descuentoAlPie > 0 ? 'Descuentos en líneas' : 'Descuentos acumulados'}
              </span>
              <span className="value" style={{ color: 'var(--color-danger)' }}>
                -{formatCurrency(descuentoAlPie > 0 ? totalDiscount - descuentoAlPie : totalDiscount)}
              </span>
            </div>
          )}
          {descuentoAlPie > 0 && (
            <div className="invoice-totals-row">
              <span className="label">
                Descuento a pie de factura
                {porcentajesPie.length > 0 && ` (${porcentajesPie.join(' % + ')} %)`}
              </span>
              <span className="value" style={{ color: 'var(--color-danger)' }}>
                -{formatCurrency(descuentoAlPie)}
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
            <span className="label">Total</span>
            {/* La clave es el importe: cada vez que cambia, la cifra se monta
                de nuevo y su animación de llegada vuelve a sonar. Así se
                nota que el total ha respondido a lo que se acaba de tocar. */}
            <span className="value" key={destacado ? total : undefined}>{formatCurrency(total)}</span>
          </div>
        </div>
      </div>

      {children}
    </div>
  );

  // La luz va en un marco sin fondo alrededor de la tarjeta y no en la
  // tarjeta misma: el halo de .neon se pinta por debajo del contenido del
  // elemento que lo lleva pero por encima de su fondo, así que sobre una
  // tarjeta opaca manchaba el interior. Con el marco, la tarjeta lo tapa
  // y el halo sólo asoma por fuera.
  return destacado ? <div className="totales-marco neon">{tarjeta}</div> : tarjeta;
}
