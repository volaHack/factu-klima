'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Save, Send, ArrowLeft, Lock } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import Link from 'next/link';
import {
  getInvoiceById, getClients, getProducts, saveInvoice, issueInvoice, isSealed, getOnboardingStatus,
  applyAbonoToInvoice, getCompanySettings
} from '@/lib/storage';
import {
  Client, CompanySettings, Product, Invoice, InvoiceLineItem, InvoiceStatus,
  PaymentMethod, TaxRate, UnitOfMeasure
} from '@/lib/types';
import { formatCurrency, calculateInvoiceTotals, generateId } from '@/lib/utils';
import { PAYMENT_METHODS } from '@/lib/constants';
import { esOperacionIntracomunitaria, tipoOperacion349 } from '@/lib/intracomunitarias';
import { useToast } from '@/hooks/useToast';
import AbonoPanel, { AbonoSelection } from '@/components/devoluciones/AbonoPanel';
import LineasDocumento from '@/components/documentos/LineasDocumento';
import { DatosPlantillaCard } from '@/components/facturas/DatosPlantillaCard';
import { ClienteOcasionalCard } from '@/components/facturas/ClienteOcasionalCard';
import AvisoPlantillaDeOtroOficio from '@/components/facturas/AvisoPlantillaDeOtroOficio';
import { getPlantillaActiva } from '@/lib/plantillas/almacen';
import { clavesManualesUsadasPorPlantilla, columnasPersonalizadasDePlantilla } from '@/lib/plantillas/plantilla';
import {
  clienteManualComoDatosExtras, clienteManualDesdeDatosExtras, customColsDeLineas,
  lineasConCustomCols, type ClienteManual
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
  // De aquí sale si se factura con IVA o con IGIC. Antes esta página llevaba
  // «IVA» escrito a fuego en la cabecera de las líneas.
  const [ajustes, setAjustes] = useState<CompanySettings | null>(null);

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
  const [columnasCustom, setColumnasCustom] = useState<{ clave: string; cabecera: string }[]>([]);
  /** Con qué oficio se montó la plantilla activa, si se hizo desde cero. */
  const [oficioDeLaPlantilla, setOficioDeLaPlantilla] = useState<string | undefined>(undefined);
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
      setLineItems(lineasConCustomCols(
        inv.lineItems.length > 0 ? inv.lineItems : [createEmptyLine()],
        inv.datosExtras,
      ));
      setDatosExtras(inv.datosExtras ?? {});
      const [clients, products, settings] = await Promise.all([
        getClients().then(c => c.filter(cl => cl.active)),
        getProducts().then(p => p.filter(pr => pr.active)),
        getCompanySettings()
      ]);
      setClients(clients);
      setProducts(products);
      setAjustes(settings);
      try {
        const plantilla = await getPlantillaActiva('factura');
        if (plantilla?.plantilla) {
          setClavesManuales(clavesManualesUsadasPorPlantilla(plantilla.plantilla));
          setColumnasCustom(columnasPersonalizadasDePlantilla(plantilla.plantilla));
          setOficioDeLaPlantilla(plantilla.diagnostico?.oficio);
        }
      } catch {
        // Sin plantilla activa no hay campos manuales que mostrar.
      }
      setMounted(true);
    })();
  }, [params.id, router]);

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
    const datosExtrasFinal = {
      ...datosExtras,
      ...(esOcasional ? clienteManualComoDatosExtras(clienteManual) : {}),
      ...customColsDeLineas(validLines),
    };
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
      ...totals, paymentMethod, notes, datosExtras: datosExtrasFinal,
      esIntracomunitaria: client ? esOperacionIntracomunitaria(client, ajustes || undefined) : false,
      clientVatNumber: client?.vatNumber,
      updatedAt: new Date().toISOString(),
    };
    if (updated.esIntracomunitaria) {
      updated.tipoOperacion349 = tipoOperacion349(updated) || 'E';
    }

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
        <AvisoPlantillaDeOtroOficio oficioDeLaPlantilla={oficioDeLaPlantilla} sector={ajustes?.sector} />

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

        {/* Por el componente compartido y no por una copia propia: es lo que
            trae los tres descuentos en cascada y la etiqueta IVA o IGIC según
            el régimen de la empresa. Esta página llevaba «IVA» escrito a
            fuego, así que a un canario le mentía la cabecera. */}
        {ajustes && (
          <LineasDocumento
            lineItems={lineItems}
            onChange={setLineItems}
            products={products}
            settings={ajustes}
            columnasCustom={columnasCustom}
          />
        )}


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
