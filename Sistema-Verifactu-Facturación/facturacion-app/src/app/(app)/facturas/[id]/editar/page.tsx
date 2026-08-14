'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Plus, Trash2, Save, Send, ArrowLeft, Lock } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import Link from 'next/link';
import {
  getInvoiceById, getClients, getProducts, saveInvoice, issueInvoice, isSealed, getOnboardingStatus,
  applyAbonoToInvoice
} from '@/lib/storage';
import {
  Client, Product, Invoice, InvoiceLineItem, InvoiceStatus,
  PaymentMethod, TaxRate, UnitOfMeasure
} from '@/lib/types';
import { formatCurrency, calculateInvoiceTotals, generateId } from '@/lib/utils';
import { PAYMENT_METHODS } from '@/lib/constants';
import { useToast } from '@/hooks/useToast';
import AbonoPanel, { AbonoSelection } from '@/components/devoluciones/AbonoPanel';
import TaxRateSlider from '@/components/ui/TaxRateSlider';
import { DatosPlantillaCard } from '@/components/facturas/DatosPlantillaCard';
import { ClienteOcasionalCard } from '@/components/facturas/ClienteOcasionalCard';
import { getPlantillaActiva } from '@/lib/plantillas/almacen';
import { clavesManualesUsadasPorPlantilla } from '@/lib/plantillas/plantilla';
import {
  clienteManualComoDatosExtras, clienteManualDesdeDatosExtras,
  type ClienteManual
} from '@/lib/plantillas/datos';

const CLIENTE_MANUAL_VACIO: ClienteManual = {
  nombre: '', nif: '', direccion: '', cp: '', ciudad: '', provincia: '', email: '', telefono: '',
};

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

  const [clientId, setClientId] = useState('');
  const [clienteOcasional, setClienteOcasional] = useState(false);
  const [clienteManual, setClienteManual] = useState<ClienteManual>(CLIENTE_MANUAL_VACIO);
  const [cobradaAlEmitir, setCobradaAlEmitir] = useState(false);
  const [issueDate, setIssueDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.TRANSFERENCIA);
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([createEmptyLine()]);
  const [originalInvoice, setOriginalInvoice] = useState<Invoice | null>(null);
  const [abonoSelection, setAbonoSelection] = useState<AbonoSelection | null>(null);
  const [clavesManuales, setClavesManuales] = useState<string[]>([]);
  const [datosExtras, setDatosExtras] = useState<Record<string, string>>({});

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
      const manual = clienteManualDesdeDatosExtras(inv.datosExtras);
      setClienteOcasional(!inv.clientId && Boolean(manual));
      setClienteManual(manual ?? CLIENTE_MANUAL_VACIO);
      setIssueDate(inv.issueDate);
      setDueDate(inv.dueDate);
      setPaymentMethod(inv.paymentMethod);
      setNotes(inv.notes);
      setLineItems(inv.lineItems.length > 0 ? inv.lineItems : [createEmptyLine()]);
      setDatosExtras(inv.datosExtras ?? {});
      const [clients, products] = await Promise.all([
        getClients().then(c => c.filter(cl => cl.active)),
        getProducts().then(p => p.filter(pr => pr.active))
      ]);
      setClients(clients);
      setProducts(products);
      try {
        const plantilla = await getPlantillaActiva('factura');
        if (plantilla?.plantilla) {
          setClavesManuales(clavesManualesUsadasPorPlantilla(plantilla.plantilla));
        }
      } catch {
        // Sin plantilla activa no hay campos manuales que mostrar.
      }
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

  const handleSave = async (status: InvoiceStatus) => {
    const esOcasional = clienteOcasional;
    if (!esOcasional && !clientId) { showError('Error', 'Selecciona un cliente'); return; }
    if (esOcasional && !clienteManual.nombre.trim()) { showError('Error', 'Escribe el nombre del cliente'); return; }
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

    const client = esOcasional ? undefined : clients.find(c => c.id === clientId);
    const datosExtrasFinal = esOcasional
      ? { ...datosExtras, ...clienteManualComoDatosExtras(clienteManual) }
      : datosExtras;
    const nombreCliente = esOcasional ? clienteManual.nombre : (client?.tradeName || client?.businessName || '');
    const clientAddress = esOcasional
      ? [clienteManual.direccion, clienteManual.cp, clienteManual.ciudad]
          .map(s => s.trim()).filter(Boolean).join(', ')
      : `${client?.address ?? ''}, ${client?.postalCode ?? ''} ${client?.city ?? ''}`;

    const updated: Invoice = {
      ...originalInvoice,
      clientId: esOcasional ? '' : (client?.id ?? ''),
      clientName: nombreCliente,
      clientNif: esOcasional ? clienteManual.nif : (client?.nif ?? ''),
      clientAddress,
      issueDate, dueDate, status, lineItems: validLines,
      ...totals, paymentMethod, notes, datosExtras: datosExtrasFinal, updatedAt: new Date().toISOString(),
    };

    setSaving(true);
    try {
      if (status === InvoiceStatus.BORRADOR) {
        const saved = await saveInvoice(updated);
        success('Borrador actualizado', saved.number);
      } else {
        const issued = await issueInvoice(updated);

        let abonoNote = '';
        let cobrada = cobradaAlEmitir;
        if (abonoSelection && abonoSelection.amount > 0) {
          await applyAbonoToInvoice(abonoSelection.abono.id, updated.id, issued.number, abonoSelection.amount);
          const restante = Number((updated.total - abonoSelection.amount).toFixed(2));
          if (restante <= 0.01) {
            cobrada = true;
            abonoNote = ' · abono aplicado, factura cobrada';
          } else {
            abonoNote = ' · abono aplicado';
          }
        }
        if (cobrada) {
          await saveInvoice({
            ...issued,
            status: InvoiceStatus.PAGADA,
            paidDate: new Date().toISOString().split('T')[0],
            updatedAt: new Date().toISOString(),
          });
          abonoNote = cobradaAlEmitir && !abonoNote ? ' · emitida como cobrada' : abonoNote;
        }

        success(
          'Factura emitida y sellada',
          `${issued.number} · huella ${issued.verifactu?.chainedHash?.slice(0, 12) ?? ''}…${abonoNote}`
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
              <label className={`form-label${clienteOcasional ? '' : ' required'}`}>Cliente</label>
              {clienteOcasional ? (
                <div className="field-message" style={{ paddingTop: 'var(--space-2)' }}>
                  Se usa el cliente ocasional definido abajo.
                </div>
              ) : (
                <select className="form-select" value={clientId} onChange={e => { setClientId(e.target.value); setAbonoSelection(null); if (e.target.value) setClienteOcasional(false); }}>
                  <option value="">-- Seleccionar --</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.tradeName || c.businessName} ({c.nif})</option>)}
                </select>
              )}
            </div>
            <div className="form-group">
              <label className="form-label required">Fecha emisión</label>
              <input type="date" className="form-input" value={issueDate} onChange={e => setIssueDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label required">Vencimiento</label>
              <input type="date" className="form-input" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
          </div>

          <ClienteOcasionalCard
            activo={clienteOcasional}
            onActivo={setClienteOcasional}
            cliente={clienteManual}
            onChange={setClienteManual}
          />
        </div>

        <DatosPlantillaCard
          claves={clavesManuales}
          datosExtras={datosExtras}
          onChange={(clave, valor) => setDatosExtras(prev => ({ ...prev, [clave]: valor }))}
          style={{ marginBottom: 'var(--space-6)' }}
        />

        {/* Lines */}
        <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
          <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Productos facturados</h3>
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
                <TaxRateSlider compact value={line.taxRate} onChange={v => handleLineChange(i, 'taxRate', v)} />
                <input type="number" min={0} max={100} step={0.5} value={line.discountPercent} onChange={e => handleLineChange(i, 'discountPercent', parseFloat(e.target.value) || 0)} style={{ textAlign: 'right' }} />
                <div className="line-item-subtotal">{formatCurrency(line.subtotal)}</div>
                <button className="line-item-delete" onClick={() => removeLine(i)} disabled={lineItems.length <= 1}><Trash2 size={14} /></button>
              </div>
            ))}
            <div className="line-items-add">
              <button className="btn btn-ghost btn-sm" onClick={addLine}><Plus size={14} /> Añadir producto</button>
            </div>
          </div>
        </div>

        {/* Totales y pago */}
        <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
          <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Totales y pago</h3>
          <div className="invoice-totals">
            <div className="invoice-totals-table">
              <div className="invoice-totals-row"><span className="label">Base imponible</span><span className="value">{formatCurrency(totals.subtotal)}</span></div>
              {totals.totalDiscount > 0 && (
                <div className="invoice-totals-row"><span className="label">Descuentos</span><span className="value" style={{ color: 'var(--color-danger)' }}>-{formatCurrency(totals.totalDiscount)}</span></div>
              )}
              {totals.taxBreakdown.map(tb => (
                <div className="invoice-totals-row" key={tb.rate}><span className="label">IVA {tb.rate}% (base {formatCurrency(tb.base)})</span><span className="value">{formatCurrency(tb.amount)}</span></div>
              ))}
              <div className="invoice-totals-row total"><span className="label">TOTAL</span><span className="value">{formatCurrency(totals.total)}</span></div>
            </div>
          </div>
          <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
            <div className="form-group">
              <label className="form-label">Forma de pago</label>
              <select className="form-select" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}>
                {PAYMENT_METHODS.map(pm => <option key={pm.value} value={pm.value}>{pm.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="field-check" style={{ marginTop: 'var(--space-5)' }}>
                <input
                  type="checkbox"
                  checked={cobradaAlEmitir}
                  onChange={e => setCobradaAlEmitir(e.target.checked)}
                />
                Marcar como cobrada al emitir
              </label>
              <div className="field-message">Registra la fecha de cobro de hoy en el momento de emitir.</div>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Observaciones</h3>
          <textarea className="form-textarea" value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Notas..." />
        </div>

        {!clienteOcasional && clientId && (
          <div style={{ marginTop: 'var(--space-6)' }}>
            <AbonoPanel key={clientId} clientId={clientId} invoiceTotal={totals.total} onSelection={setAbonoSelection} />
          </div>
        )}
      </div>
    </div>
  );
}
