'use client';

import { useState, useEffect, useRef } from 'react';
import { X, PackagePlus, Barcode, Check, Loader2, ImagePlus, ImageOff } from 'lucide-react';
import { Product, TaxRate, UnitOfMeasure, CompanySettings } from '@/lib/types';
import { getTaxLabel, getDefaultTaxRate, UNITS_OF_MEASURE } from '@/lib/constants';
import { generateId, processImageFile } from '@/lib/utils';
import { saveProduct, getCompanySettings } from '@/lib/storage';
import TaxRateSlider from '@/components/ui/TaxRateSlider';

interface CategoryOption {
  value: string;
  label: string;
}

interface TpvQuickCreateProductModalProps {
  initialBarcode?: string;
  categories: CategoryOption[];
  onCreated: (newProduct: Product) => void;
  onClose: () => void;
}

export default function TpvQuickCreateProductModal({
  initialBarcode = '',
  categories,
  onCreated,
  onClose,
}: TpvQuickCreateProductModalProps) {
  const [barcode, setBarcode] = useState(initialBarcode);
  const [name, setName] = useState('');
  const [unitPriceInput, setUnitPriceInput] = useState('');
  const [category, setCategory] = useState(categories[0]?.value || 'otros');
  const [taxRate, setTaxRate] = useState<number>(TaxRate.GENERAL);
  const [unit, setUnit] = useState<UnitOfMeasure>(UnitOfMeasure.UNIDAD);
  const [stockQuantity, setStockQuantity] = useState(50);
  const [imageUrl, setImageUrl] = useState('');
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handlePickImage = async (file?: File | null) => {
    if (!file) return;
    try {
      setImageUrl(await processImageFile(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la imagen');
    }
  };

  useEffect(() => {
    (async () => {
      const s = await getCompanySettings();
      setSettings(s);
      if (s) {
        setTaxRate(getDefaultTaxRate(s));
      }
    })();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const price = Number(unitPriceInput.replace(',', '.'));
    if (isNaN(price) || price < 0) {
      setError('Introduce un precio válido en euros (€)');
      return;
    }
    if (!name.trim()) {
      setError('Introduce el nombre del producto');
      return;
    }

    setSubmitting(true);
    try {
      const generatedRef = `PRD-${Math.floor(1000 + Math.random() * 9000)}`;
      const newProduct: Product = {
        id: generateId(),
        ref: generatedRef,
        name: name.trim(),
        description: '',
        category,
        unitPrice: price,
        defaultTaxRate: taxRate,
        unit,
        active: true,
        barcode: barcode.trim() || undefined,
        stockQuantity: Number(stockQuantity) || 0,
        lowStockThreshold: 5,
        imageUrl: imageUrl || undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await saveProduct(newProduct);
      onCreated(newProduct);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar el nuevo producto');
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 1100, backdropFilter: 'blur(6px)' }}>
      <div
        className="modal tpv-quick-create-modal"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: 500,
          width: '92vw',
          padding: 0,
          borderRadius: 'var(--radius-xl)',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: 'var(--space-5) var(--space-6)',
          background: 'linear-gradient(135deg, var(--wine-500) 0%, #2a0e17 100%)',
          color: '#ffffff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <div style={{
              width: 40,
              height: 40,
              borderRadius: 'var(--radius-lg)',
              background: 'rgba(255, 255, 255, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
            }}>
              <PackagePlus size={22} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#ffffff' }}>
                Dar de Alta Nuevo Producto
              </h3>
              <p style={{ margin: 0, fontSize: 'var(--text-xs)', opacity: 0.85 }}>
                Registro exprés en catálogo desde la caja TPV
              </p>
            </div>
          </div>
          <button
            className="btn btn-ghost btn-icon"
            onClick={onClose}
            style={{ color: '#ffffff', opacity: 0.8 }}
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 'var(--space-6)', background: 'var(--bg-card)' }}>
          {initialBarcode && (
            <div style={{
              background: 'var(--accent-50)',
              border: '1px solid var(--accent-500)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-3) var(--space-4)',
              marginBottom: 'var(--space-4)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              color: 'var(--accent-500)',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
            }}>
              <Barcode size={20} />
              <span>Código escaneado: <strong style={{ fontFamily: 'var(--font-mono)' }}>{initialBarcode}</strong></span>
            </div>
          )}

          <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
            <label className="form-label required">Nombre del producto</label>
            <input
              type="text"
              className="form-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="ej. Leche Entera 1L, Detergente Líquido..."
              autoFocus
              required
              style={{ fontSize: 'var(--text-md)' }}
            />
          </div>

          <div className="form-row" style={{ marginBottom: 'var(--space-4)' }}>
            <div className="form-group">
              <label className="form-label required">Precio de venta (€)</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  inputMode="decimal"
                  className="form-input"
                  value={unitPriceInput}
                  onChange={e => setUnitPriceInput(e.target.value)}
                  placeholder="0,00"
                  required
                  style={{ fontSize: '1.2rem', fontWeight: 700, paddingLeft: 34 }}
                />
                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontWeight: 700, color: 'var(--text-tertiary)' }}>
                  €
                </span>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Categoría</label>
              <select
                className="form-select"
                value={category}
                onChange={e => setCategory(e.target.value)}
              >
                {categories.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row" style={{ marginBottom: 'var(--space-4)' }}>
            <div className="form-group">
              <TaxRateSlider
                label={`${getTaxLabel(settings)} aplicado (%)`}
                value={taxRate}
                onChange={setTaxRate}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Unidad de medida</label>
              <select
                className="form-select"
                value={unit}
                onChange={e => setUnit(e.target.value as UnitOfMeasure)}
              >
                {UNITS_OF_MEASURE.map(u => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row" style={{ marginBottom: 'var(--space-5)' }}>
            <div className="form-group">
              <label className="form-label">Código de barras EAN</label>
              <input
                type="text"
                className="form-input"
                value={barcode}
                onChange={e => setBarcode(e.target.value)}
                placeholder="Escanea o escribe EAN-13..."
              />
            </div>

            <div className="form-group">
              <label className="form-label">Stock inicial</label>
              <input
                type="number"
                min={0}
                className="form-input"
                value={stockQuantity}
                onChange={e => setStockQuantity(parseInt(e.target.value) || 0)}
              />
            </div>
          </div>

          {error && (
            <div className="status-panel" style={{ background: 'var(--color-danger-bg)', borderColor: 'var(--color-danger)', marginBottom: 'var(--space-4)', padding: 'var(--space-3)' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger)' }}>{error}</span>
            </div>
          )}

          <div className="form-group" style={{ marginBottom: 'var(--space-5)' }}>
            <label className="form-label">Imagen del producto (opcional)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              {imageUrl ? (
                <>
                  <img
                    src={imageUrl}
                    alt="Vista previa"
                    style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)' }}
                  />
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setImageUrl('')}>
                    <ImageOff size={14} /> Quitar imagen
                  </button>
                </>
              ) : (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => imageInputRef.current?.click()}>
                  <ImagePlus size={14} /> Añadir foto
                </button>
              )}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={e => {
                  handlePickImage(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-6)' }}>
            <button type="button" className="btn btn-secondary" style={{ flex: 1, padding: '12px', justifyContent: 'center' }} onClick={onClose} disabled={submitting}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" style={{ flex: 1.4, padding: '12px', justifyContent: 'center', fontWeight: 700 }} disabled={submitting}>
              {submitting ? <Loader2 size={18} className="spin" /> : <><Check size={18} /> Guardar e Incluir</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
