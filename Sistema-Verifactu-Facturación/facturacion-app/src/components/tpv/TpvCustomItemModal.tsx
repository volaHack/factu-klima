'use client';

import { useState, useEffect } from 'react';
import { PlusCircle, ShoppingBag, Plus, Minus } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import TpvDialogo from './TpvDialogo';
import { TaxRate, CompanySettings } from '@/lib/types';
import { getTaxLabel, getDefaultTaxRate } from '@/lib/constants';
import { getCompanySettings } from '@/lib/storage';
import TaxRateSlider from '@/components/ui/TaxRateSlider';

interface TpvCustomItemModalProps {
  onAdd: (item: {
    name: string;
    unitPrice: number;
    quantity: number;
    taxRate: number;
  }) => void;
  onClose: () => void;
}

/** Los conceptos que más se cobran «a mano», a un toque. */
const CONCEPTOS = ['Varios', 'Servicio', 'Bolsa', 'Envío', 'Suplemento', 'Depósito'];

export default function TpvCustomItemModal({ onAdd, onClose }: TpvCustomItemModalProps) {
  const [name, setName] = useState('Varios');
  const [priceInput, setPriceInput] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [taxRate, setTaxRate] = useState<number>(TaxRate.GENERAL);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const s = await getCompanySettings();
      setSettings(s);
      if (s) {
        setTaxRate(getDefaultTaxRate(s));
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

  const precio = Number(priceInput.replace(',', '.')) || 0;

  return (
    <TpvDialogo
      titulo="Artículo libre"
      subtitulo="Algo que no está en el catálogo: se cobra y listo"
      icono={<PlusCircle size={20} />}
      ancho="md"
      onClose={onClose}
      pie={
        <>
          <button type="button" className="tpvd-boton" onClick={onClose}>Cancelar</button>
          <button type="submit" form="tpv-libre" className="tpvd-boton tpvd-boton--principal" style={{ flex: 1 }}>
            <ShoppingBag size={18} /> Añadir{precio > 0 ? ` · ${formatCurrency(precio * quantity)}` : ''}
          </button>
        </>
      }
    >
      <form id="tpv-libre" onSubmit={handleSubmit} className="tpvx-pila">
        <label className="tpvx-campo-grande">
          <span>Precio por unidad</span>
          <div>
            <input
              type="text"
              inputMode="decimal"
              value={priceInput}
              onChange={e => { setPriceInput(e.target.value); setError(''); }}
              placeholder="0,00"
              data-autofocus
              aria-label="Precio por unidad"
            />
            <em>€</em>
          </div>
        </label>

        <div className="form-group">
          <label className="form-label">Concepto</label>
          <input
            type="text"
            className="form-input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Pan artesano, fruta a granel, servicio…"
          />
          <div className="tpvx-chips tpvx-chips--suaves">
            {CONCEPTOS.map(c => (
              <button key={c} type="button" className={name === c ? 'is-activo' : ''} onClick={() => setName(c)}>{c}</button>
            ))}
          </div>
        </div>

        <div className="tpvx-fila">
          <div className="form-group">
            <label className="form-label">Cantidad</label>
            <div className="tpvx-contador">
              <button type="button" onClick={() => setQuantity(q => Math.max(1, q - 1))} aria-label="Una menos"><Minus size={18} /></button>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                aria-label="Cantidad"
              />
              <button type="button" onClick={() => setQuantity(q => q + 1)} aria-label="Una más"><Plus size={18} /></button>
            </div>
          </div>
          <div className="form-group">
            <TaxRateSlider
              label={`${getTaxLabel(settings)} (%)`}
              value={taxRate}
              onChange={setTaxRate}
            />
          </div>
        </div>

        {error && <div className="tpvc-error" role="alert">{error}</div>}
      </form>
    </TpvDialogo>
  );
}
