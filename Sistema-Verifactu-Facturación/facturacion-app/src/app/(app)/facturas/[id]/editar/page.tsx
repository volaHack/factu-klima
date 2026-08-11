'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Plus, Trash2, Save, Send, ArrowLeft, Lock } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import Link from 'next/link';
import {
  getInvoiceById, getClients, getProducts, saveInvoice, issueInvoice, isSealed, getOnboardingStatus,
  applyAbonoToInvoice, getCompanySettings
} from '@/lib/storage';
import {
  Client, Product, Invoice, InvoiceLineItem, InvoiceStatus, CompanySettings,
  PaymentMethod, TaxRate, UnitOfMeasure
} from '@/lib/types';
import { formatCurrency, calculateInvoiceTotals, generateId } from '@/lib/utils';
import { PAYMENT_METHODS, getTaxRates, getTaxLabel } from '@/lib/constants';
import { useToast } from '@/hooks/useToast';
import AbonoPanel, { AbonoSelection } from '@/components/devoluciones/AbonoPanel';

function createEmptyLine(): InvoiceLineItem {
  return {
    id: generateId(), productId: '', productName: '', productRef: '',
    quantity: 1, unitPrice: 0, unit: UnitOfMeasure.KG,
    taxRate: TaxRate.REDUCIDO, discountPercent: 0, subtotal: 0, taxAmount: 0, total: 0,
  };
}

export default function EditInvoicePage() {
  const params = useParams();
  const router = useRouter();
  const { success, error: showError } = useToast();
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);

  const [clientId, setClientId] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.TRANSFERENCIA);
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([createEmptyLine()]);
  const [originalInvoice, setOriginalInvoice] = useState<Invoice | null>(null);
  const [abonoSelection, setAbonoSelection] = useState<AbonoSelection | null>(null);

  useEffect(() => {
    (async () => {
      const id = params.id as string;
      const inv = await getInvoiceById(id);
      if (!inv || inv.status !== InvoiceStatus.BORRADOR) {
        router.push('/facturas');
        return;
      }
      setOriginalInvoice(inv);
      setClientId(inv.clientId);
      setIssueDate(inv.issueDate);
      setDueDate(inv.dueDate);
      setPaymentMethod(inv.paymentMethod);
      setNotes(inv.notes);
      setLineItems(inv.lineItems.length > 0 ? inv.lineItems : [createEmptyLine()]);
      const [clients, products] = await Promise.all([
        getClients().then(c => c.filter(cl => cl.active)),
        getProducts().then(p => p.filter(pr => pr.active))
      ]);
      setClients(clients);
      setProducts(products);
      setSettings(await getCompanySettings());
      setMounted(true);
    })();
  }, [params.id, router]);

  const handleProductSelect = (lineIndex: number, productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    setLineItems(prev => {
      const next = [...prev];
      next[lineIndex] = { ...next[lineIndex], productId: product.id, productName: product.name, productRef: product.ref, unitPrice: product.unitPrice, unit: product.unit, taxRate: product.defaultTaxRate };
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
  const totals = useMemo(() => calculateInvoiceTotals(lineItems), [lineItems]);

  // Opciones de impuesto del régimen activo. Si una línea ya guardada usa un
  // porcentaje que ya no está en la lista configurada, se añade para no perderlo.
  const taxOptionsFor = (line: InvoiceLineItem) => {
    const base = getTaxRates(settings);
    return base.some(r => r.value === line.taxRate)
      ? base
      : [...base, { value: line.taxRate, label: `${getTaxLabel(settings)} ${line.taxRate}%`, rate: line.taxRate }];
  };

  const handleSave = async (status: InvoiceStatus) => {
    if (!clientId) { showError('Error', 'Selecciona un cliente'); return; }
    const validLines = lineItems.filter(l => l.productId && l.quantity > 0);
    if (validLines.length === 0) { showError('Error', 'Añade al menos un producto'); return; }
    if (!originalInvoice) return;

    // Bloquear emisión si falta completar datos críticos
    if (status === InvoiceStatus.EMITIDA && originalInvoice.status !== InvoiceStatus.EMITIDA) {
      const obStatus = await getOnboardingStatus();
      if (!obStatus.isComplete) {
        showError('Completa los primeros pasos', obStatus.message);
        return;
      }
    }

    const client = clients.find(c => c.id === clientId)!;
    const updated: Invoice = {
      ...originalInvoice,
      clientId: client.id, clientName: client.tradeName || client.businessName,
      clientNif: client.nif, clientAddress: `${client.address}, ${client.postalCode} ${client.city}`,
      issueDate, dueDate, status, lineItems: validLines,
      ...totals, paymentMethod, notes, updatedAt: new Date().toISOString(),
    };

    setSaving(true);
    try {
      if (status === InvoiceStatus.BORRADOR) {
        await saveInvoice(updated);
        success('Borrador actualizado', originalInvoice.number);
      } else {
        const issued = await issueInvoice(updated);

        let abonoNote = '';
        if (abonoSelection && abonoSelection.amount > 0) {
          await applyAbonoToInvoice(abonoSelection.abono.id, updated.id, originalInvoice.number, abonoSelection.amount);
          const restante = Number((updated.total - abonoSelection.amount).toFixed(2));
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
          `${originalInvoice.number} · huella ${issued.verifactu?.chainedHash?.slice(0, 12) ?? ''}…${abonoNote}`
        );
      }
      router.push(`/facturas/${originalInvoice.id}`);
    } catch (err) {
      showError('No se pudo guardar', err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSaving(false);
    }
  };

  if (!mounted) {
    return <PageSkeleton variant="form" label="Cargando la factura" />;
  }

  // Una factura emitida no se edita. El servidor lo rechazaría igualmente,
  // pero abrir un formulario que no va a poder guardar es engañar al usuario.
  if (originalInvoice && isSealed(originalInvoice)) {
    return (
      <div className="animate-fade-in" style={{ maxWidth: 620 }}>
        <Link href={`/facturas/${originalInvoice.id}`} className="page-back">
          <ArrowLeft /> Volver al detalle
        </Link>
        <div className="callout callout-warning">
          <Lock size={16} />
          <div>
            <strong>La factura {originalInvoice.number} está emitida</strong>
            <p>
              Sus importes, fechas y numeración quedaron sellados con una huella SHA-256
              encadenada. Modificarlos rompería la cadena de integridad, así que ni la
              aplicación ni la base de datos lo permiten.
            </p>
            <p>
              Si necesitas corregirla, anúlala indicando el motivo o emite una factura
              rectificativa. Ambas opciones dejan constancia en el registro.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <Link href={`/facturas/${originalInvoice?.id}`} className="page-back">
            <ArrowLeft /> Volver al detalle
          </Link>
          <div className="page-title-row">
            <h1 className="page-title">Editar borrador</h1>
            <span className="badge badge-borrador" style={{ fontFamily: 'var(--font-mono)' }}>
              {originalInvoice?.number}
            </span>
          </div>
          <p className="page-subtitle">Los cambios no salen de aquí hasta que guardes.</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={() => handleSave(InvoiceStatus.BORRADOR)} disabled={saving}>
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

      <div style={{ maxWidth: 900 }}>
        {/* Client & Dates */}
        <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
          <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Datos generales</h3>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label required">Cliente</label>
              <select className="form-select" value={clientId} onChange={e => { setClientId(e.target.value); setAbonoSelection(null); }}>
                <option value="">-- Seleccionar --</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.tradeName || c.businessName} ({c.nif})</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Forma de pago</label>
              <select className="form-select" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}>
                {PAYMENT_METHODS.map(pm => <option key={pm.value} value={pm.value}>{pm.label}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
            <div className="form-group">
              <label className="form-label required">Fecha emisión</label>
              <input type="date" className="form-input" value={issueDate} onChange={e => setIssueDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label required">Vencimiento</label>
              <input type="date" className="form-input" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Lines */}
        <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
          <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Líneas</h3>
          <div className="line-items">
            <div className="line-items-header">
              <span>Producto</span><span>Cant.</span><span>Precio</span><span>IVA</span><span>Dto.%</span><span style={{ textAlign: 'right' }}>Subtotal</span><span></span>
            </div>
            {lineItems.map((line, i) => (
              <div className="line-item-row" key={line.id}>
                <select value={line.productId} onChange={e => handleProductSelect(i, e.target.value)}>
                  <option value="">Seleccionar</option>
                  {products.map(p => <option key={p.id} value={p.id}>[{p.ref}] {p.name}</option>)}
                </select>
                <input type="number" min={0} step={0.01} value={line.quantity} onChange={e => handleLineChange(i, 'quantity', parseFloat(e.target.value) || 0)} style={{ textAlign: 'right' }} />
                <input type="number" min={0} step={0.01} value={line.unitPrice} onChange={e => handleLineChange(i, 'unitPrice', parseFloat(e.target.value) || 0)} style={{ textAlign: 'right' }} />
                <select value={line.taxRate} onChange={e => handleLineChange(i, 'taxRate', parseInt(e.target.value))}>
                  {taxOptionsFor(line).map(t => <option key={t.value} value={t.value}>{t.rate}%</option>)}
                </select>
                <input type="number" min={0} max={100} step={0.5} value={line.discountPercent} onChange={e => handleLineChange(i, 'discountPercent', parseFloat(e.target.value) || 0)} style={{ textAlign: 'right' }} />
                <div className="line-item-subtotal">{formatCurrency(line.subtotal)}</div>
                <button className="line-item-delete" onClick={() => removeLine(i)} disabled={lineItems.length <= 1}><Trash2 size={14} /></button>
              </div>
            ))}
            <div className="line-items-add">
              <button className="btn btn-ghost btn-sm" onClick={addLine}><Plus size={14} /> Añadir línea</button>
            </div>
          </div>

          <div className="invoice-totals">
            <div className="invoice-totals-table">
              <div className="invoice-totals-row"><span className="label">Base imponible</span><span className="value">{formatCurrency(totals.subtotal)}</span></div>
              {totals.taxBreakdown.map(tb => (
                <div className="invoice-totals-row" key={tb.rate}><span className="label">IVA {tb.rate}%</span><span className="value">{formatCurrency(tb.amount)}</span></div>
              ))}
              <div className="invoice-totals-row total"><span className="label">TOTAL</span><span className="value">{formatCurrency(totals.total)}</span></div>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Observaciones</h3>
          <textarea className="form-textarea" value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Notas..." />
        </div>

        {clientId && (
          <div style={{ marginTop: 'var(--space-6)' }}>
            <AbonoPanel key={clientId} clientId={clientId} invoiceTotal={totals.total} onSelection={setAbonoSelection} />
          </div>
        )}
      </div>
    </div>
  );
}
