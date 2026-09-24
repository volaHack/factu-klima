'use client';

/**
 * VENTA AL PESO
 *
 * Se teclea el peso en gramos (o se toca uno habitual) y se ve al momento
 * lo que cuesta. Intro lo añade. El importe va grande porque es lo que se
 * le dice al cliente mientras se envuelve.
 */

import { useState } from 'react';
import { Scale, Plus } from 'lucide-react';

import { Product } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import { pluToKg, pluKgToPrice } from '@/lib/tpvOffline';
import TpvDialogo from './TpvDialogo';

interface TpvWeightModalProps {
  product: Product;
  onAdd: (kg: number) => void;
  onClose: () => void;
}

const PRESETS = [
  { grams: 100, label: '100 g' },
  { grams: 250, label: '¼ kg' },
  { grams: 500, label: '½ kg' },
  { grams: 1000, label: '1 kg' },
  { grams: 2000, label: '2 kg' },
];

export default function TpvWeightModal({ product, onAdd, onClose }: TpvWeightModalProps) {
  const [grams, setGrams] = useState(1000);

  const kg = pluToKg(grams);
  const total = pluKgToPrice(product.unitPrice, kg);

  const commit = () => {
    if (grams <= 0) return;
    onAdd(kg);
    onClose();
  };

  return (
    <TpvDialogo
      titulo={product.name}
      subtitulo={<>Venta al peso · {formatCurrency(product.unitPrice)}/kg</>}
      icono={<Scale size={20} />}
      ancho="sm"
      onClose={onClose}
      pie={
        <>
          <button type="button" className="tpvd-boton" onClick={onClose}>Cancelar</button>
          <button type="submit" form="tpv-peso" className="tpvd-boton tpvd-boton--principal" style={{ flex: 1 }} disabled={grams <= 0}>
            <Plus size={18} /> Añadir · {formatCurrency(total)}
          </button>
        </>
      }
    >
      <form id="tpv-peso" onSubmit={e => { e.preventDefault(); commit(); }} className="tpvx-pila">
        <label className="tpvx-campo-grande">
          <span>Peso</span>
          <div>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              step={5}
              value={grams}
              onChange={e => setGrams(Math.max(0, parseInt(e.target.value) || 0))}
              onFocus={e => e.target.select()}
              data-autofocus
              aria-label="Peso en gramos"
            />
            <em>g</em>
          </div>
        </label>

        <div className="tpvx-chips">
          {PRESETS.map(p => (
            <button key={p.grams} type="button" className={grams === p.grams ? 'is-activo' : ''} onClick={() => setGrams(p.grams)}>
              {p.label}
            </button>
          ))}
        </div>

        <div className="tpvx-resultado">
          <span>{kg.toLocaleString('es-ES', { minimumFractionDigits: 3 })} kg × {formatCurrency(product.unitPrice)}</span>
          <strong>{formatCurrency(total)}</strong>
        </div>
      </form>
    </TpvDialogo>
  );
}
