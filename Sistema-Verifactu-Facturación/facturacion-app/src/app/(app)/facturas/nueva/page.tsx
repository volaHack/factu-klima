'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Send, ArrowLeft } from 'lucide-react';
import LineasDocumento from '@/components/documentos/LineasDocumento';
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
  formatCurrency, calculateInvoiceTotals, sequenceFromNumber
} from '@/lib/utils';
import { PAYMENT_METHODS, getDefaultTaxRate } from '@/lib/constants';
import { esOperacionIntracomunitaria, tipoOperacion349 } from '@/lib/intracomunitarias';
import { useToast } from '@/hooks/useToast';
import { evaluatePlanLimit } from '@/lib/planLimits';
import SubscriptionPaywallModal from '@/components/ui/SubscriptionPaywallModal';
import AbonoPanel, { AbonoSelection } from '@/components/devoluciones/AbonoPanel';
import { getPlantillaActiva } from '@/lib/plantillas/almacen';
import { clavesManualesUsadasPorPlantilla, columnasPersonalizadasDePlantilla } from '@/lib/plantillas/plantilla';
import { ajustarPlantillaAlSector } from '@/lib/plantillas/porSector';
import { DatosPlantillaCard } from '@/components/facturas/DatosPlantillaCard';
import { ClienteOcasionalCard } from '@/components/facturas/ClienteOcasionalCard';
import AvisoPlantillaDeOtroOficio from '@/components/facturas/AvisoPlantillaDeOtroOficio';
import {
  clienteManualComoDatosExtras, customColsDeLineas, type ClienteManual
} from '@/lib/plantillas/datos';

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
  const [clienteOcasional, setClienteOcasional] = useState(false);
  const [clienteManual, setClienteManual] = useState<ClienteManual>({
    nombre: '', nif: '', direccion: '', cp: '', ciudad: '', provincia: '', email: '', telefono: '',
  });
  const [cobradaAlEmitir, setCobradaAlEmitir] = useState(false);
  const [issueDate, setIssueDate] = useState(getToday());
  const [dueDate, setDueDate] = useState(addDays(getToday(), 30));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.TRANSFERENCIA);
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([createEmptyLine()]);
  const [abonoSelection, setAbonoSelection] = useState<AbonoSelection | null>(null);
  const [clavesManuales, setClavesManuales] = useState<string[]>([]);
  const [columnasCustom, setColumnasCustom] = useState<{ clave: string; cabecera: string }[]>([]);
  /** Con qué oficio se montó la plantilla activa, si se hizo desde cero. */
  const [oficioDeLaPlantilla, setOficioDeLaPlantilla] = useState<string | undefined>(undefined);
  // Los ajustes de la empresa hacen falta en el editor de líneas: de ahí sale
  // si se factura con IVA o con IGIC y qué tipos se ofrecen.
  const [ajustes, setAjustes] = useState<CompanySettings | null>(null);
  const [datosExtras, setDatosExtras] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const [c, p, settings] = await Promise.all([
        getClients(),
        getProducts(),
        getCompanySettings()
      ]);
      setClients(c.filter(cl => cl.active));
      setProducts(p.filter(pr => pr.active));
      setAjustes(settings);
      setPaymentMethod(settings.defaultPaymentMethod);
      setDueDate(addDays(getToday(), settings.defaultPaymentDays));
      setLineItems([createEmptyLine(settings)]);
      try {
        // Antes de leer el diseño, que siga al sector. Ajustes ya lo hace al
        // tocar el selector, pero eso no alcanza a quien cambió de gremio
        // antes de que esto existiera: se quedaría con las columnas del
        // oficio anterior para siempre. Aquí se corrige solo, y no hace nada
        // cuando ya coinciden.
        const ajuste = await ajustarPlantillaAlSector(settings.sector, settings);
        if (ajuste.cambiada) {
          success(
            `Tu factura pasa a la de ${ajuste.oficio}`,
            'Las líneas te piden ahora lo de tu oficio. La anterior sigue guardada en Diseño de facturas.',
          );
        }
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
  }, []);

  // When client changes, update payment terms
  const handleClientChange = (cId: string) => {
    setClientId(cId);
    setAbonoSelection(null);
    if (cId) setClienteOcasional(false);
    const client = clients.find(c => c.id === cId);
    if (client) {
      setPaymentMethod(client.defaultPaymentMethod);
      setDueDate(addDays(issueDate, client.paymentDays));
    }
  };

  // Totals
  const totals = useMemo(() => calculateInvoiceTotals(lineItems), [lineItems]);

  const selectedClient = clients.find(c => c.id === clientId);

  const handleSave = async (status: InvoiceStatus) => {
    const esOcasional = clienteOcasional;
    if (!esOcasional && !clientId) {
      error('Error', 'Selecciona un cliente');
      return;
    }
    if (esOcasional && !clienteManual.nombre.trim()) {
      error('Error', 'Escribe el nombre del cliente');
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

    const invoice: Invoice = {
      id: generateId(),
      number: invoiceNumber,
      series: settings.invoiceSeries,
      clientId: esOcasional ? '' : (client?.id ?? ''),
      clientName: nombreCliente,
      clientNif: esOcasional ? clienteManual.nif : (client?.nif ?? ''),
      clientAddress,
      issueDate,
      dueDate,
      status,
      lineItems: validLines,
      ...totals,
      paymentMethod,
      notes,
      esIntracomunitaria: client ? esOperacionIntracomunitaria(client, settings) : false,
      clientVatNumber: client?.vatNumber,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      datosExtras: datosExtrasFinal,
    };
    if (invoice.esIntracomunitaria) {
      invoice.tipoOperacion349 = tipoOperacion349(invoice) || 'E';
    }

    setSaving(true);
    try {
      if (status === InvoiceStatus.BORRADOR) {
        const saved = await saveInvoice(invoice);
        success('Borrador guardado', `${saved.number} · ${nombreCliente}`);
        // El contador se sincroniza con el número REAL persistido:
        // saveInvoice reasigna el número si el previsto ya estaba en uso
        // (colisión) y un contador desfasado es la causa de la numeración
        // saltada (FAC-2026-0026 previsto → 0033 guardado).
        settings.nextInvoiceNumber = sequenceFromNumber(saved.number) + 1;
      } else {
        // Emitir es un proceso en dos pasos: primero se consolidan las
        // líneas como borrador y después el servidor sella la cabecera.
        // Al revés, la factura quedaría sellada antes de tener líneas y
        // el servidor rechazaría escribirlas.
        const issued = await issueInvoice(invoice);

        let abonoNote = '';
        let cobrada = cobradaAlEmitir;
        if (abonoSelection && abonoSelection.amount > 0) {
          await applyAbonoToInvoice(abonoSelection.abono.id, invoice.id, issued.number, abonoSelection.amount);
          const restante = Number((invoice.total - abonoSelection.amount).toFixed(2));
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

        settings.nextInvoiceNumber = sequenceFromNumber(issued.number) + 1;

        success(
          'Factura emitida y sellada',
          `${issued.number} · huella ${issued.verifactu?.chainedHash?.slice(0, 12) ?? ''}…${abonoNote}`
        );
      }

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

      <div style={{ maxWidth: '900px' }}>
        <AvisoPlantillaDeOtroOficio oficioDeLaPlantilla={oficioDeLaPlantilla} sector={ajustes?.sector} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--space-6)', maxWidth: '900px' }}>
        {/* Client & Dates */}
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Datos generales</h3>
          <div className="form-row">
            <div className="form-group">
              <label className={`form-label${clienteOcasional ? '' : ' required'}`}>Cliente</label>
              {clienteOcasional ? (
                <div className="field-message" style={{ paddingTop: 'var(--space-2)' }}>
                  Se usa el cliente ocasional definido abajo.
                </div>
              ) : (
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
              )}
            </div>
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

          {selectedClient && !clienteOcasional && (
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
          sector={ajustes?.sector}
        />

        {/* Las líneas van por el componente compartido y no por una copia
            propia: es lo que trae los tres descuentos en cascada, la etiqueta
            IVA o IGIC según el régimen de la empresa y las columnas que pida
            la plantilla. Manteniendo dos editores parecidos, lo que se
            arreglaba en uno seguía roto en el otro. */}
        {ajustes && (
          <LineasDocumento
            lineItems={lineItems}
            onChange={setLineItems}
            products={products}
            settings={ajustes}
            tarifaId={selectedClient?.tarifaId}
            columnasCustom={columnasCustom}
          />
        )}

        {/* Totales y pago */}
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Totales y pago</h3>

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

          <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
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
