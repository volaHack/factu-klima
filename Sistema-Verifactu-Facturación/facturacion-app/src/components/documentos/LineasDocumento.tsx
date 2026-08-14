'use client';

import React, { useState } from 'react';
import { Plus, Trash2, Percent, ChevronDown, ChevronUp } from 'lucide-react';
import { InvoiceLineItem, CompanySettings, Product } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import { recalcularLinea, lineaVacia, getPrecioProductoParaCliente } from '@/lib/documentos';
import TaxRateSlider from '@/components/ui/TaxRateSlider';

export interface ColumnaPersonalizada {
  clave: string;
  cabecera: string;
}

interface LineasDocumentoProps {
  lineItems: InvoiceLineItem[];
  onChange: (lines: InvoiceLineItem[]) => void;
  products: Product[];
  settings: CompanySettings;
  tarifaId?: string;
  defaultDiscounts?: [number, number, number];
  columnasCustom?: ColumnaPersonalizada[];
  titulo?: string;
}

export default function LineasDocumento({
  lineItems,
  onChange,
  products,
  settings,
  tarifaId,
  defaultDiscounts,
  columnasCustom = [],
  titulo = 'Productos y conceptos',
}: LineasDocumentoProps) {
  const [showExtraDiscounts, setShowExtraDiscounts] = useState(false);

  const handleProductSelect = (index: number, productId: string) => {
    const product = products.find(p => p.id === productId);
    const updated = [...lineItems];
    if (product) {
      const resolvedPrice = getPrecioProductoParaCliente(product, tarifaId, settings.tarifas);
      const d1 = updated[index].discountPercent || defaultDiscounts?.[0] || 0;
      const d2 = updated[index].discountPercent2 || defaultDiscounts?.[1] || 0;
      const d3 = updated[index].discountPercent3 || defaultDiscounts?.[2] || 0;

      updated[index] = recalcularLinea({
        ...updated[index],
        productId: product.id,
        productName: product.name,
        productRef: product.ref,
        unitPrice: resolvedPrice,
        unit: product.unit,
        taxRate: product.defaultTaxRate,
        discountPercent: d1,
        discountPercent2: d2,
        discountPercent3: d3,
      });
    } else {
      updated[index] = recalcularLinea({
        ...updated[index],
        productId: '',
        productName: '',
        productRef: '',
        unitPrice: 0,
      });
    }
    onChange(updated);
  };

  const handleLineChange = (index: number, field: keyof InvoiceLineItem, value: unknown) => {
    const updated = [...lineItems];
    updated[index] = recalcularLinea({
      ...updated[index],
      [field]: value,
    });
    onChange(updated);
  };

  const handleCustomColChange = (index: number, clave: string, valor: string) => {
    const updated = [...lineItems];
    const item = updated[index];
    const customCols = { ...(item.customCols ?? {}), [clave]: valor };
    updated[index] = { ...item, customCols };
    onChange(updated);
  };

  const addLine = () => {
    const nueva = lineaVacia(settings);
    if (defaultDiscounts) {
      nueva.discountPercent = defaultDiscounts[0] || 0;
      nueva.discountPercent2 = defaultDiscounts[1] || 0;
      nueva.discountPercent3 = defaultDiscounts[2] || 0;
    }
    onChange([...lineItems, recalcularLinea(nueva)]);
  };

  const removeLine = (index: number) => {
    if (lineItems.length <= 1) return;
    onChange(lineItems.filter((_, i) => i !== index));
  };

  const hasAnyExtraDiscount = lineItems.some(l => (l.discountPercent2 && l.discountPercent2 > 0) || (l.discountPercent3 && l.discountPercent3 > 0));

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        <h3 className="card-title" style={{ margin: 0 }}>{titulo}</h3>
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={() => setShowExtraDiscounts(!showExtraDiscounts)}
          style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          <Percent size={13} />
          {showExtraDiscounts || hasAnyExtraDiscount ? 'Ocultar Dto. 2 y 3 en línea' : 'Mostrar hasta 3 dtos. en cascada'}
          {showExtraDiscounts || hasAnyExtraDiscount ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      <div className="line-items">
        <div className="line-items-header" style={{ display: 'grid', gridTemplateColumns: (showExtraDiscounts || hasAnyExtraDiscount) ? '2fr 1fr 1fr 1.2fr 0.8fr 0.8fr 0.8fr 1.2fr 36px' : '3fr 1fr 1.2fr 1.5fr 1fr 1.2fr 36px' }}>
          <span>Producto</span>
          <span>Cantidad</span>
          <span>Precio ud.</span>
          <span>{settings.igicEnabled ? 'IGIC' : 'IVA'}</span>
          <span>Dto. 1 %</span>
          {(showExtraDiscounts || hasAnyExtraDiscount) && <span>Dto. 2 %</span>}
          {(showExtraDiscounts || hasAnyExtraDiscount) && <span>Dto. 3 %</span>}
          <span style={{ textAlign: 'right' }}>Subtotal</span>
          <span></span>
        </div>
        {lineItems.map((line, index) => (
          <div className="line-item-row" key={line.id} style={{ display: 'grid', gridTemplateColumns: (showExtraDiscounts || hasAnyExtraDiscount) ? '2fr 1fr 1fr 1.2fr 0.8fr 0.8fr 0.8fr 1.2fr 36px' : '3fr 1fr 1.2fr 1.5fr 1fr 1.2fr 36px' }}>
            <select
              value={line.productId}
              onChange={e => handleProductSelect(index, e.target.value)}
              style={{ minWidth: 0 }}
            >
              <option value="">Seleccionar producto</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>
                  [{p.ref}] {p.name} {p.supplierRef ? `(Ref Prov: ${p.supplierRef})` : ''}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              step={0.01}
              value={line.quantity}
              onChange={e => handleLineChange(index, 'quantity', parseFloat(e.target.value) || 0)}
              style={{ textAlign: 'right' }}
            />
            <input
              type="number"
              min={0}
              step={0.01}
              value={line.unitPrice}
              onChange={e => handleLineChange(index, 'unitPrice', parseFloat(e.target.value) || 0)}
              style={{ textAlign: 'right' }}
            />
            <TaxRateSlider compact value={line.taxRate} onChange={v => handleLineChange(index, 'taxRate', v)} />
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              placeholder="0"
              value={line.discountPercent || ''}
              onChange={e => handleLineChange(index, 'discountPercent', parseFloat(e.target.value) || 0)}
              style={{ textAlign: 'right' }}
            />
            {(showExtraDiscounts || hasAnyExtraDiscount) && (
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                placeholder="0"
                value={line.discountPercent2 || ''}
                onChange={e => handleLineChange(index, 'discountPercent2', parseFloat(e.target.value) || 0)}
                style={{ textAlign: 'right' }}
              />
            )}
            {(showExtraDiscounts || hasAnyExtraDiscount) && (
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                placeholder="0"
                value={line.discountPercent3 || ''}
                onChange={e => handleLineChange(index, 'discountPercent3', parseFloat(e.target.value) || 0)}
                style={{ textAlign: 'right' }}
              />
            )}
            <div className="line-item-subtotal">
              {formatCurrency(line.subtotal)}
            </div>
            <button
              type="button"
              className="line-item-delete"
              onClick={() => removeLine(index)}
              disabled={lineItems.length <= 1}
            >
              <Trash2 size={14} />
            </button>
            {columnasCustom.length > 0 && (
              <div className="line-item-custom" style={{ gridColumn: '1 / -1' }}>
                {columnasCustom.map(col => (
                  <div className="form-group" key={col.clave} style={{ flex: '1 1 160px', margin: 0 }}>
                    <label className="form-label" style={{ fontSize: 'var(--text-xs)' }}>{col.cabecera}</label>
                    <input
                      className="form-input"
                      value={line.customCols?.[col.clave] ?? ''}
                      onChange={e => handleCustomColChange(index, col.clave, e.target.value)}
                      placeholder={col.cabecera}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        <div className="line-items-add">
          <button type="button" className="btn btn-ghost btn-sm" onClick={addLine}>
            <Plus size={14} /> Añadir producto
          </button>
        </div>
      </div>
    </div>
  );
}
