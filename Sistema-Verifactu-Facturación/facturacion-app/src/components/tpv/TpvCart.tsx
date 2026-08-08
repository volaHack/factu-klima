'use client';

import { Minus, Plus, Trash2, PauseCircle, ShoppingBag } from 'lucide-react';
import { PosCartLine } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import { calculateLineSubtotal, calculateLineTax } from '@/lib/utils';

interface TpvCartProps {
  lines: PosCartLine[];
  onIncrement: (productId: string) => void;
  onDecrement: (productId: string) => void;
  onRemove: (productId: string) => void;
  onClear: () => void;
  onHold: () => void;
  onCheckout: () => void;
  heldCount: number;
  onShowHeld: () => void;
}

export default function TpvCart({
  lines, onIncrement, onDecrement, onRemove, onClear, onHold, onCheckout, heldCount, onShowHeld,
}: TpvCartProps) {
  const lineTotal = (l: PosCartLine) => {
    const subtotal = calculateLineSubtotal(l.quantity, l.unitPrice, l.discountPercent);
    return subtotal + calculateLineTax(subtotal, l.taxRate);
  };
  const total = lines.reduce((sum, l) => sum + lineTotal(l), 0);
  const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);

  return (
    <aside className="tpv-cart">
      <div className="tpv-cart-header">
        <h2>Venta actual</h2>
        <button className="tpv-cart-held-btn" onClick={onShowHeld} disabled={heldCount === 0}>
          <PauseCircle size={14} /> Aparcadas {heldCount > 0 ? `(${heldCount})` : ''}
        </button>
      </div>

      <div className="tpv-cart-lines">
        {lines.length === 0 ? (
          <div className="tpv-cart-empty">
            <ShoppingBag size={32} />
            <p>Escanea o toca un producto para empezar</p>
          </div>
        ) : (
          lines.map(l => (
            <div key={l.productId} className="tpv-cart-line">
              <div className="tpv-cart-line-info">
                <span className="tpv-cart-line-name">{l.productName}</span>
                <span className="tpv-cart-line-unit">{formatCurrency(l.unitPrice)} / {l.unit}</span>
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
          <button className="btn btn-secondary" onClick={onClear} disabled={lines.length === 0}>
            Vaciar
          </button>
          <button className="btn btn-secondary" onClick={onHold} disabled={lines.length === 0}>
            Aparcar
          </button>
          <button className="btn btn-primary tpv-checkout-btn" onClick={onCheckout} disabled={lines.length === 0}>
            Cobrar {lines.length > 0 ? formatCurrency(total) : ''}
          </button>
        </div>
      </div>
    </aside>
  );
}
