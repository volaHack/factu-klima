'use client';

import { Minus, Plus, Trash2, PauseCircle, ShoppingBag, Percent } from 'lucide-react';
import { PosCartLine } from '@/lib/types';
import { formatCurrency, calculateLineSubtotal, calculateLineTax } from '@/lib/utils';

interface TpvCartProps {
  lines: PosCartLine[];
  onIncrement: (productId: string) => void;
  onDecrement: (productId: string) => void;
  onRemove: (productId: string) => void;
  onSetDiscount?: (productId: string, discountPercent: number) => void;
  onClear: () => void;
  onHold: () => void;
  onCheckout: () => void;
  heldCount: number;
  onShowHeld: () => void;
  title?: string;
  tableMode?: boolean;
}

const DISCOUNT_CYCLES = [0, 5, 10, 15, 20];

export default function TpvCart({
  lines,
  onIncrement,
  onDecrement,
  onRemove,
  onSetDiscount,
  onClear,
  onHold,
  onCheckout,
  heldCount,
  onShowHeld,
  title,
  tableMode,
}: TpvCartProps) {
  const lineTotal = (l: PosCartLine) => {
    const subtotal = calculateLineSubtotal(l.quantity, l.unitPrice, l.discountPercent);
    return subtotal + calculateLineTax(subtotal, l.taxRate);
  };
  const total = lines.reduce((sum, l) => sum + lineTotal(l), 0);
  const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);

  const cycleDiscount = (l: PosCartLine) => {
    if (!onSetDiscount) return;
    const currentIndex = DISCOUNT_CYCLES.indexOf(l.discountPercent);
    const nextIndex = (currentIndex + 1) % DISCOUNT_CYCLES.length;
    onSetDiscount(l.productId, DISCOUNT_CYCLES[nextIndex]);
  };

  return (
    <aside className="tpv-cart">
      <div className="tpv-cart-header">
        <h2>{title || 'Venta actual'}</h2>
        {!tableMode && (
          <button className="tpv-cart-held-btn" onClick={onShowHeld} disabled={heldCount === 0}>
            <PauseCircle size={14} /> Aparcadas {heldCount > 0 ? `(${heldCount})` : ''}
          </button>
        )}
      </div>

      <div className="tpv-cart-lines">
        {lines.length === 0 ? (
          <div className="tpv-cart-empty">
            <ShoppingBag size={32} />
            <p>Escanea o toca un producto para empezar</p>
            <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', marginTop: 'var(--space-2)' }}>
              Usa F1 para buscar o F4 para venta libre
            </span>
          </div>
        ) : (
          lines.map(l => (
            <div key={l.productId} className="tpv-cart-line">
              <div className="tpv-cart-line-info">
                <span className="tpv-cart-line-name">{l.productName}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <span className="tpv-cart-line-unit">{formatCurrency(l.unitPrice)} / {l.unit}</span>
                  {onSetDiscount && (
                    <button
                      type="button"
                      className="tpv-discount-badge"
                      style={{
                        background: l.discountPercent > 0 ? 'rgba(234, 179, 8, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                        color: l.discountPercent > 0 ? '#eab308' : 'var(--text-muted)',
                        border: 'none',
                        borderRadius: 'var(--radius-xs)',
                        padding: '1px 5px',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2px',
                      }}
                      onClick={() => cycleDiscount(l)}
                      title="Haz clic para aplicar descuento (0%, 5%, 10%, 15%, 20%)"
                    >
                      <Percent size={10} />
                      {l.discountPercent > 0 ? `-${l.discountPercent}%` : 'Dto'}
                    </button>
                  )}
                </div>
              </div>
              <div className="tpv-cart-line-qty">
                <button onClick={() => onDecrement(l.productId)} aria-label="Quitar uno">
                  <Minus size={14} />
                </button>
                <span>{l.quantity}</span>
                <button onClick={() => onIncrement(l.productId)} aria-label="Añadir uno">
                  <Plus size={14} />
                </button>
              </div>
              <span className="tpv-cart-line-total">{formatCurrency(lineTotal(l))}</span>
              <button className="tpv-cart-line-remove" onClick={() => onRemove(l.productId)} aria-label="Eliminar línea">
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="tpv-cart-footer">
        <div className="tpv-cart-total-row">
          <span>{itemCount} {itemCount === 1 ? 'artículo' : 'artículos'}</span>
          <span className="tpv-cart-total">{formatCurrency(total)}</span>
        </div>
        <div className="tpv-cart-actions">
          <button className="btn btn-secondary" onClick={onClear} disabled={lines.length === 0} title="Vaciar cesta (Esc)">
            Vaciar
          </button>
          {!tableMode && (
            <button className="btn btn-secondary" onClick={onHold} disabled={lines.length === 0} title="Aparcar ticket (F3)">
              Aparcar (F3)
            </button>
          )}
          <button className="btn btn-primary tpv-checkout-btn" onClick={onCheckout} disabled={lines.length === 0} title={tableMode ? 'Cobrar la cuenta de la mesa' : 'Cobrar (F2 / Espacio)'}>
            {tableMode ? 'Cobrar mesa' : `Cobrar ${lines.length > 0 ? formatCurrency(total) : ''} (F2)`}
          </button>
        </div>
      </div>
    </aside>
  );
}
