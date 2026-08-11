'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Save, Send, ArrowLeft } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import Link from 'next/link';
import {
  getClients, getProducts, getCompanySettings, saveInvoice,
  saveCompanySettings, issueInvoice, getOnboardingStatus, getInvoices,
  applyAbonoToInvoice
} from '@/lib/storage';
import {
  Client, Product, Invoice, InvoiceLineItem, InvoiceStatus,
  PaymentMethod, UnitOfMeasure, CompanySettings
} from '@/lib/types';
import {
  generateId, generateInvoiceNumber, getToday, addDays,
  formatCurrency, calculateInvoiceTotals
} from '@/lib/utils';
import { PAYMENT_METHODS, getDefaultTaxRate } from '@/lib/constants';
import { useToast } from '@/hooks/useToast';
import { evaluatePlanLimit } from '@/lib/planLimits';
import SubscriptionPaywallModal from '@/components/ui/SubscriptionPaywallModal';
import AbonoPanel, { AbonoSelection } from '@/components/devoluciones/AbonoPanel';
import TaxRateSlider from '@/components/ui/TaxRateSlider';

function createEmptyLine(settings?: CompanySettings | null): InvoiceLineItem {
  return {
    id: generateId(),
    productId: '',
    productName: '',
    productRef: '',
    quantity: 1,
    unitPrice: 0,
    unit: UnitOfMeasure.KG,
    taxRate: getDefaultTaxRate(settings),
    discountPercent: 0,
    subtotal: 0,
    taxAmount: 0,
    total: 0,
  };
}

export default function NuevaFacturaPage() {
  const router = useRouter();
  const { success, error } = useToast();
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [paywallState, setPaywallState] = useState<{ title: string; description: string; requiredPlan: 'basico' | 'pro' | 'sin_limite' } | null>(null);

  // Form state
  const [clientId, setClientId] = useState('');
  const [issueDate, setIssueDate] = useState(getToday());
  const [dueDate, setDueDate] = useState(addDays(getToday(), 30));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.TRANSFERENCIA);
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([createEmptyLine()]);
  const [abonoSelection, setAbonoSelection] = useState<AbonoSelection | null>(null);

  useEffect(() => {
    (async () => {
      const [c, p, settings] = await Promise.all([
        getClients(),
        getProducts(),
        getCompanySettings()
      ]);
      setClients(c.filter(cl => cl.active));
      setProducts(p.filter(pr => pr.active));
      setPaymentMethod(settings.defaultPaymentMethod);
      setDueDate(addDays(getToday(), settings.defaultPaymentDays));
      setLineItems([createEmptyLine(settings)]);
      setMounted(true);
    })();
  }, []);

  // When client changes, update payment terms
  const handleClientChange = (cId: string) => {
    setClientId(cId);
    setAbonoSelection(null);
    const client = clients.find(c => c.id === cId);
    if (client) {
      setPaymentMethod(client.defaultPaymentMethod);
      setDueDate(addDays(issueDate, client.paymentDays));
    }
  };

  // When product selected on a line
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

  const recalcLines = (lines: InvoiceLineItem[]): InvoiceLineItem[] => {
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

  // Totals
  const totals = useMemo(() => calculateInvoiceTotals(lineItems), [lineItems]);

  const selectedClient = clients.find(c => c.id === clientId);

  const handleSave = async (status: InvoiceStatus) => {
    if (!clientId) {
      error('Error', 'Selecciona un cliente');
      return;
    }
    const validLines = lineItems.filter(l => l.productId && l.quantity > 0);
    if (validLines.length === 0) {
      error('Error', 'Añade al menos un producto');
      return;
    }

    // Bloquear emisión si falta completar datos críticos
    if (status === InvoiceStatus.EMITIDA) {
      const obStatus = await getOnboardingStatus();
      if (!obStatus.isComplete) {
        error('Completa los primeros pasos', obStatus.message);
        return;
      }
    }

    const settings = await getCompanySettings();
    const existingInvoices = await getInvoices();
    const check = evaluatePlanLimit(settings, existingInvoices);
    if (!check.allowed) {
      setPaywallState({
        title: 'Límite de Plan Alcanzado',
        description: check.reason || 'Has alcanzado el límite de uso de tu plan.',
        requiredPlan: check.requiredPlan || 'pro',
      });
      return;
    }

    const invoiceNumber = generateInvoiceNumber(settings.invoiceSeries, settings.nextInvoiceNumber);
    const client = clients.find(c => c.id === clientId)!;

    const invoice: Invoice = {
      id: generateId(),
      number: invoiceNumber,
      series: settings.invoiceSeries,
      clientId: client.id,
      clientName: client.tradeName || client.businessName,
      clientNif: client.nif,
      clientAddress: `${client.address}, ${client.postalCode} ${client.city}`,
      issueDate,
      dueDate,
      status,
      lineItems: validLines,
      ...totals,
      paymentMethod,
      notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setSaving(true);
    try {
      if (status === InvoiceStatus.BORRADOR) {
        await saveInvoice(invoice);
        success('Borrador guardado', `${invoiceNumber} · ${client.tradeName || client.businessName}`);
      } else {
        // Emitir es un proceso en dos pasos: primero se consolidan las
        // líneas como borrador y después el servidor sella la cabecera.
        // Al revés, la factura quedaría sellada antes de tener líneas y
        // el servidor rechazaría escribirlas.
        const issued = await issueInvoice(invoice);

        let abonoNote = '';
        if (abonoSelection && abonoSelection.amount > 0) {
          await applyAbonoToInvoice(abonoSelection.abono.id, invoice.id, invoiceNumber, abonoSelection.amount);
          const restante = Number((invoice.total - abonoSelection.amount).toFixed(2));
          if (restante <= 0.01) {
            await saveInvoice({
              ...issued,
              status: InvoiceStatus.PAGADA,
              paidDate: new Date().toISOString().split('T')[0],
              updatedAt: new Date().toISOString(),
            });
            abonoNote = ' · abono aplicado, factura cobrada';
          } else {
            abonoNote = ' · abono aplicado';
          }
        }

        success(
          'Factura emitida y sellada',
          `${invoiceNumber} · huella ${issued.verifactu?.chainedHash?.slice(0, 12) ?? ''}…${abonoNote}`
        );
      }

      // El contador sólo avanza si la factura se ha guardado de verdad.
      settings.nextInvoiceNumber += 1;
      await saveCompanySettings(settings);

      router.push('/facturas');
    } catch (err) {
      error('No se pudo guardar', err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSaving(false);
    }
  };

  if (!mounted) {
    return <PageSkeleton variant="form" label="Preparando la factura" />;
  }

  return (
    <div className="animate-fade-in">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-left">
          <Link href="/facturas" className="page-back">
            <ArrowLeft /> Facturas
          </Link>
          <h1 className="page-title">Nueva factura</h1>
          <p className="page-subtitle">
            Puedes guardarla como borrador y seguir después. Al emitirla se sella y ya no se podrá
            modificar.
          </p>
        </div>
        <div className="page-header-actions">
          <button
            className="btn btn-secondary"
            onClick={() => handleSave(InvoiceStatus.BORRADOR)}
            disabled={saving}
          >
            <Save size={16} /> Guardar borrador
          </button>
          <button
            className="btn btn-primary"
            onClick={() => handleSave(InvoiceStatus.EMITIDA)}
            disabled={saving}
            title="Al emitir, la factura se sella y no podrá modificarse"
          >
            <Send size={16} /> {saving ? 'Sellando…' : 'Emitir factura'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--space-6)', maxWidth: '900px' }}>
        {/* Client & Dates */}
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Datos generales</h3>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label required">Cliente</label>
              <select
                className="form-select"
                value={clientId}
                onChange={e => handleClientChange(e.target.value)}
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
              <label className="form-label">Forma de pago</label>
              <select
                className="form-select"
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}
              >
                {PAYMENT_METHODS.map(pm => (
                  <option key={pm.value} value={pm.value}>{pm.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
            <div className="form-group">
              <label className="form-label required">Fecha de emisión</label>
              <input
                type="date"
                className="form-input"
                value={issueDate}
                onChange={e => setIssueDate(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label required">Fecha de vencimiento</label>
              <input
                type="date"
                className="form-input"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
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

        {/* Line Items */}
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Líneas de factura</h3>

          <div className="line-items">
            <div className="line-items-header">
              <span>Producto</span>
              <span>Cantidad</span>
              <span>Precio ud.</span>
              <span>IVA</span>
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

          {/* Totals */}
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
                  <span className="label">IVA {tb.rate}% (base {formatCurrency(tb.base)})</span>
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

        {/* Notes */}
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Observaciones</h3>
          <textarea
            className="form-textarea"
            placeholder="Notas adicionales que aparecerán en la factura..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
          />
        </div>

        {clientId && (
          <AbonoPanel key={clientId} clientId={clientId} invoiceTotal={totals.total} onSelection={setAbonoSelection} />
        )}
      </div>

      {paywallState && (
        <SubscriptionPaywallModal
          title={paywallState.title}
          description={paywallState.description}
          requiredPlan={paywallState.requiredPlan}
          onClose={() => setPaywallState(null)}
        />
      )}
    </div>
  );
}
