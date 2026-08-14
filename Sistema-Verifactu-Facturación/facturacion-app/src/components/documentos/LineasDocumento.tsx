'use client';

import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { InvoiceLineItem, CompanySettings, Product } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import { recalcularLinea, lineaVacia } from '@/lib/documentos';
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
  columnasCustom?: ColumnaPersonalizada[];
  titulo?: string;
}

export default function LineasDocumento({
  lineItems,
  onChange,
  products,
  settings,
  columnasCustom = [],
  titulo = 'Productos y conceptos',
}: LineasDocumentoProps) {
  const handleProductSelect = (index: number, productId: string) => {
    const product = products.find(p => p.id === productId);
    const updated = [...lineItems];
    if (product) {
      updated[index] = recalcularLinea({
        ...updated[index],
        productId: product.id,
        productName: product.name,
        productRef: product.ref,
        unitPrice: product.unitPrice,
        unit: product.unit,
        taxRate: product.defaultTaxRate,
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
    onChange([...lineItems, lineaVacia(settings)]);
  };

  const removeLine = (index: number) => {
    if (lineItems.length <= 1) return;
    onChange(lineItems.filter((_, i) => i !== index));
  };

  return (
    <div className="card">
      <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>{titulo}</h3>

      <div className="line-items">
        <div className="line-items-header">
          <span>Producto</span>
          <span>Cantidad</span>
          <span>Precio ud.</span>
          <span>{settings.igicEnabled ? 'IGIC' : 'IVA'}</span>
          <span>Dto. %</span>
          <span style={{ textAlign: 'right' }}>Subtotal</span>
          <span></span>
        </div>
        {lineItems.map((line, index) => (
          <div className="line-item-row" key={line.id}>
            <select
              value={line.productId}
              onChange={e => handleProductSelect(index, e.target.value)}
              style={{ minWidth: 0 }}
            >
              <option value="">Seleccionar producto</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>
                  [{p.ref}] {p.name}
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
              value={line.discountPercent}
              onChange={e => handleLineChange(index, 'discountPercent', parseFloat(e.target.value) || 0)}
              style={{ textAlign: 'right' }}
            />
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
              <div className="line-item-custom">
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
