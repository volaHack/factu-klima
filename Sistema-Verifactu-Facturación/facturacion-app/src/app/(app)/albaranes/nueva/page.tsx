'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Trash2, Save, Truck, ArrowLeft } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import {
  getClients, getProducts, getCompanySettings, saveAlbaran, expedirAlbaran,
  saveCompanySettings
} from '@/lib/storage';
import {
  Client, Product, Albaran, AlbaranLineItem, UnitOfMeasure, TaxRate, CompanySettings
} from '@/lib/types';
import { generateId, generateInvoiceNumber, getToday, formatCurrency, calculateInvoiceTotals } from '@/lib/utils';
import { getTaxRates, getTaxLabel } from '@/lib/constants';
import { useToast } from '@/hooks/useToast';

function createEmptyLine(settings?: CompanySettings | null): AlbaranLineItem {
  return {
    id: generateId(),
    productId: '',
    productName: '',
    productRef: '',
    quantity: 1,
    unitPrice: 0,
    unit: UnitOfMeasure.KG,
    taxRate: settings?.igicEnabled ? TaxRate.IGIC_GENERAL : TaxRate.REDUCIDO,
    discountPercent: 0,
    subtotal: 0,
    taxAmount: 0,
    total: 0,
  };
}

export default function NuevoAlbaranPage() {
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);

  const [clientId, setClientId] = useState('');
  const [issueDate, setIssueDate] = useState(getToday());
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<AlbaranLineItem[]>([createEmptyLine()]);

  useEffect(() => {
    (async () => {
      const [c, p, settings] = await Promise.all([getClients(), getProducts(), getCompanySettings()]);
      setClients(c.filter(cl => cl.active));
      setProducts(p.filter(pr => pr.active));
      setSettings(settings);
      setLineItems([createEmptyLine(settings)]);
      setMounted(true);
    })();
  }, []);

  const handleProductSelect = (lineIndex: number, productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    setLineItems(prev => {
      const next = [...prev];
      next[lineIndex] = {
        ...next[lineIndex],
        productId: product.id,
        productName: product.name,
        productRef: product.ref,
        unitPrice: product.unitPrice,
        unit: product.unit,
        taxRate: product.defaultTaxRate,
      };
      return recalcLines(next);
    });
  };

  const handleLineChange = (lineIndex: number, field: string, value: number | string) => {
    setLineItems(prev => {
      const next = [...prev];
      (next[lineIndex] as unknown as Record<string, unknown>)[field] = value;
      return recalcLines(next);
    });
  };

  const recalcLines = (lines: AlbaranLineItem[]): AlbaranLineItem[] => {
    return lines.map(line => {
      const gross = line.quantity * line.unitPrice;
      const discount = gross * (line.discountPercent / 100);
      const subtotal = Number((gross - discount).toFixed(2));
      const taxAmount = Number((subtotal * (line.taxRate / 100)).toFixed(2));
      return { ...line, subtotal, taxAmount, total: Number((subtotal + taxAmount).toFixed(2)) };
    });
  };

  const addLine = () => setLineItems(prev => [...prev, createEmptyLine()]);

  const removeLine = (index: number) => {
    if (lineItems.length <= 1) return;
    setLineItems(prev => prev.filter((_, i) => i !== index));
  };

  const totals = useMemo(() => calculateInvoiceTotals(lineItems), [lineItems]);
  const selectedClient = clients.find(c => c.id === clientId);

  const handleSave = async (expedir: boolean) => {
    if (!clientId) {
      toastError('Error', 'Selecciona un cliente');
      return;
    }
    const validLines = lineItems.filter(l => l.productId && l.quantity > 0);
    if (validLines.length === 0) {
      toastError('Error', 'Añade al menos un producto');
      return;
    }

    const settings = await getCompanySettings();
    const number = generateInvoiceNumber(settings.albaranSeries || 'ALB', settings.nextAlbaranNumber || 1);
    const client = clients.find(c => c.id === clientId)!;

    const albaran: Albaran = {
      id: generateId(),
      number,
      series: settings.albaranSeries || 'ALB',
      clientId: client.id,
      clientName: client.tradeName || client.businessName,
      clientNif: client.nif,
      clientAddress: `${client.address}, ${client.postalCode} ${client.city}`,
      issueDate,
      status: 'borrador',
      lineItems: validLines,
      ...totals,
      notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setSaving(true);
    try {
      await saveAlbaran(albaran);
      settings.nextAlbaranNumber = (settings.nextAlbaranNumber || 1) + 1;
      await saveCompanySettings(settings);

      if (expedir) {
        await expedirAlbaran(albaran.id);
        success('Albarán creado y expedido', `${number} · stock descontado`);
      } else {
        success('Albarán guardado', `${number} · queda en borrador`);
      }
      router.push('/albaranes');
    } catch (err) {
      toastError('No se pudo guardar', err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSaving(false);
    }
  };

  if (!mounted) {
    return <PageSkeleton variant="form" label="Preparando el albarán" />;
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <Link href="/albaranes" className="page-back">
            <ArrowLeft /> Albaranes
          </Link>
          <h1 className="page-title">Nuevo albarán</h1>
          <p className="page-subtitle">
            Prepara la entrega como borrador. Al expedirlo se descuenta el stock y queda listo para facturar.
          </p>
        </div>
        <div className="page-header-actions">
          <button
            className="btn btn-secondary"
            onClick={() => handleSave(false)}
            disabled={saving}
          >
            <Save size={16} /> Guardar borrador
          </button>
          <button
            className="btn btn-primary"
            onClick={() => handleSave(true)}
            disabled={saving}
            title="Descuenta el stock de los productos y marca el albarán como entregado"
          >
            <Truck size={16} /> {saving ? 'Guardando…' : 'Guardar y expedir'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--space-6)', maxWidth: '900px' }}>
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Datos generales</h3>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label required">Cliente</label>
              <select
                className="form-select"
                value={clientId}
                onChange={e => setClientId(e.target.value)}
              >
                <option value="">-- Seleccionar cliente --</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.tradeName || c.businessName} ({c.nif})
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label required">Fecha del albarán</label>
              <input
                type="date"
                className="form-input"
                value={issueDate}
                onChange={e => setIssueDate(e.target.value)}
              />
            </div>
          </div>

          {selectedClient && (
            <div style={{
              marginTop: 'var(--space-4)', padding: 'var(--space-3) var(--space-4)',
              background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-sm)', color: 'var(--text-secondary)',
            }}>
              <strong style={{ color: 'var(--text-primary)' }}>{selectedClient.businessName}</strong>
              <br />{selectedClient.nif} · {selectedClient.address}, {selectedClient.postalCode} {selectedClient.city}
              <br />{selectedClient.email} · {selectedClient.phone}
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Líneas del albarán</h3>

          <div className="line-items">
            <div className="line-items-header">
              <span>Producto</span>
              <span>Cantidad</span>
              <span>Precio ud.</span>
              <span>{getTaxLabel(settings)}</span>
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
                <select
                  value={line.taxRate}
                  onChange={e => handleLineChange(index, 'taxRate', parseInt(e.target.value))}
                >
                  {getTaxRates(settings).map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
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
                <button className="line-item-delete" onClick={() => removeLine(index)} disabled={lineItems.length <= 1}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <div className="line-items-add">
              <button className="btn btn-ghost btn-sm" onClick={addLine}>
                <Plus size={14} /> Añadir línea
              </button>
            </div>
          </div>

          <div className="invoice-totals">
            <div className="invoice-totals-table">
              <div className="invoice-totals-row">
                <span className="label">Base imponible</span>
                <span className="value">{formatCurrency(totals.subtotal)}</span>
              </div>
              {totals.totalDiscount > 0 && (
                <div className="invoice-totals-row">
                  <span className="label">Descuentos</span>
                  <span className="value" style={{ color: 'var(--color-danger)' }}>-{formatCurrency(totals.totalDiscount)}</span>
                </div>
              )}
              {totals.taxBreakdown.map(tb => (
                <div className="invoice-totals-row" key={tb.rate}>
                  <span className="label">{getTaxLabel(settings)} {tb.rate}% (base {formatCurrency(tb.base)})</span>
                  <span className="value">{formatCurrency(tb.amount)}</span>
                </div>
              ))}
              <div className="invoice-totals-row total">
                <span className="label">TOTAL</span>
                <span className="value">{formatCurrency(totals.total)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Observaciones</h3>
          <textarea
            className="form-textarea"
            placeholder="Notas que aparecerán en el albarán..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
          />
        </div>
      </div>
    </div>
  );
}
