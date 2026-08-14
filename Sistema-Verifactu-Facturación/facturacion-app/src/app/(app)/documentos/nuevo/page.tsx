'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, Send, Plus } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import {
  getClients, getProducts, getCompanySettings, saveDocumento, getProveedores,
} from '@/lib/storage';
import {
  Client, Product, Invoice, InvoiceLineItem, InvoiceStatus,
  PaymentMethod, CompanySettings, TipoDocumento, SentidoDocumento,
} from '@/lib/types';
import {
  generateId, getToday, addDays, calculateInvoiceTotals,
} from '@/lib/utils';
import { PAYMENT_METHODS } from '@/lib/constants';
import {
  lineaVacia, numeroDeDocumento, etiquetaTipo, actualizarContadorSerie,
} from '@/lib/documentos';
import LineasDocumento from '@/components/documentos/LineasDocumento';
import TotalesDocumento from '@/components/documentos/TotalesDocumento';
import { useToast } from '@/hooks/useToast';

function NuevoDocumentoContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tipoParam = (searchParams.get('tipo') as TipoDocumento) || 'presupuesto';
  const sentidoParam = (searchParams.get('sentido') as SentidoDocumento) || 'venta';

  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);

  const [tipo, setTipo] = useState<TipoDocumento>(tipoParam);
  const [sentido, setSentido] = useState<SentidoDocumento>(sentidoParam);

  const [clientId, setClientId] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientNif, setClientNif] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [tarifaId, setTarifaId] = useState('');
  const [globalDiscounts, setGlobalDiscounts] = useState<[number, number, number]>([0, 0, 0]);

  const [issueDate, setIssueDate] = useState(getToday());
  const [dueDate, setDueDate] = useState(addDays(getToday(), 30));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.TRANSFERENCIA);
  const [notes, setNotes] = useState('');

  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([]);
  const { success, error: toastError } = useToast();

  const selectedClient = useMemo(() => clients.find(c => c.id === clientId), [clients, clientId]);

  useEffect(() => {
    const load = async () => {
      try {
        const [loadedSettings, loadedProducts, loadedClients] = await Promise.all([
          getCompanySettings(),
          getProducts(),
          sentidoParam === 'compra' ? getProveedores() : getClients(),
        ]);
        setSettings(loadedSettings);
        setProducts(loadedProducts);
        setClients(loadedClients);

        if (loadedSettings) {
          setLineItems([lineaVacia(loadedSettings)]);
        }
      } catch {
        toastError('Error al cargar datos iniciales');
      } finally {
        setMounted(false);
        setMounted(true);
      }
    };
    load();
  }, [sentidoParam]);

  const handleClientSelect = (id: string) => {
    setClientId(id);
    const client = clients.find(c => c.id === id);
    if (client) {
      setClientName(client.tradeName || client.businessName);
      setClientNif(client.nif);
      setClientAddress(client.address || '');
      setTarifaId(client.tarifaId || '');
      if (client.paymentDays) {
        setDueDate(addDays(issueDate, client.paymentDays));
      }
      if (client.defaultPaymentMethod) {
        setPaymentMethod(client.defaultPaymentMethod);
      }
    } else {
      setClientName('');
      setClientNif('');
      setClientAddress('');
      setTarifaId('');
    }
  };

  const totals = useMemo(
    () => calculateInvoiceTotals(lineItems, globalDiscounts),
    [lineItems, globalDiscounts],
  );

  const handleSave = async (statusToSet: InvoiceStatus = InvoiceStatus.BORRADOR) => {
    if (!settings) return;
    if (!clientName.trim()) {
      toastError(sentido === 'compra' ? 'Indica el proveedor' : 'Indica el cliente');
      return;
    }
    if (lineItems.length === 0 || lineItems.every(l => !l.productName && !l.productId)) {
      toastError('Añade al menos una línea con producto');
      return;
    }

    setSaving(true);
    try {
      const { series, number } = numeroDeDocumento(settings, tipo, sentido);
      const now = new Date().toISOString();

      const doc: Invoice = {
        id: generateId(),
        tipo,
        sentido,
        number,
        series,
        clientId: clientId || '',
        clientName,
        clientNif,
        clientAddress,
        tarifaId: tarifaId || undefined,
        globalDiscountPercent1: globalDiscounts[0] || 0,
        globalDiscountPercent2: globalDiscounts[1] || 0,
        globalDiscountPercent3: globalDiscounts[2] || 0,
        issueDate,
        dueDate: dueDate || issueDate,
        status: statusToSet,
        paymentMethod: paymentMethod || PaymentMethod.TRANSFERENCIA,
        lineItems,
        subtotal: totals.subtotal,
        totalDiscount: totals.totalDiscount,
        taxBreakdown: totals.taxBreakdown,
        totalTax: totals.totalTax,
        total: totals.total,
        notes: notes || '',
        createdAt: now,
        updatedAt: now,
      };

      const guardado = await saveDocumento(doc);
      await actualizarContadorSerie(settings, `${tipo}_${sentido}`, guardado.number);

      success(`${etiquetaTipo(tipo)} ${guardado.number} creado correctamente`);
      router.push(`/documentos/${guardado.id}`);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al guardar el documento');
    } finally {
      setSaving(false);
    }
  };

  if (!mounted || !settings) return <PageSkeleton />;

  const esCompra = sentido === 'compra';
  const labelContraparte = esCompra ? 'Proveedor' : 'Cliente';

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Link href="/documentos" className="btn btn-ghost btn-sm">
            <ArrowLeft size={16} /> Volver
          </Link>
          <div>
            <h1 className="page-title">Nuevo {etiquetaTipo(tipo)} {esCompra ? '(Compra)' : ''}</h1>
            <p className="page-subtitle">Emisión y gestión de {etiquetaTipo(tipo).toLowerCase()}</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => handleSave(InvoiceStatus.BORRADOR)}
            disabled={saving}
          >
            <Save size={16} /> Guardar Borrador
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => handleSave(InvoiceStatus.EMITIDA)}
            disabled={saving}
          >
            <Send size={16} /> Emitir {etiquetaTipo(tipo)}
          </button>
        </div>
      </div>

      <div className="grid-2-cols" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
        {/* Datos de contraparte */}
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 'var(--space-3)' }}>Datos del {labelContraparte}</h3>

          <div className="form-group">
            <label className="form-label">Seleccionar {labelContraparte}</label>
            <select
              className="form-select"
              value={clientId}
              onChange={e => handleClientSelect(e.target.value)}
            >
              <option value="">-- {labelContraparte} ocasional / Manual --</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>
                  {c.tradeName || c.businessName} {c.nif ? `(${c.nif})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Nombre o Razón Social *</label>
            <input
              type="text"
              className="form-input"
              value={clientName}
              onChange={e => setClientName(e.target.value)}
              placeholder="Nombre fiscal"
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">NIF / CIF</label>
              <input
                type="text"
                className="form-input"
                value={clientNif}
                onChange={e => setClientNif(e.target.value)}
                placeholder="B12345678"
              />
            </div>
            <div className="form-group" style={{ flex: 2 }}>
              <label className="form-label">Dirección</label>
              <input
                type="text"
                className="form-input"
                value={clientAddress}
                onChange={e => setClientAddress(e.target.value)}
                placeholder="Calle, número, CP y ciudad"
              />
            </div>
          </div>
        </div>

        {/* Datos del documento */}
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 'var(--space-3)' }}>Datos del documento</h3>

          <div className="form-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Tipo de documento</label>
              <select
                className="form-select"
                value={tipo}
                onChange={e => setTipo(e.target.value as TipoDocumento)}
              >
                <option value="presupuesto">Presupuesto</option>
                <option value="pedido">Pedido</option>
                <option value="albaran">Albarán</option>
                <option value="factura">Factura</option>
                <option value="rectificativa">Rectificativa</option>
              </select>
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Sentido</label>
              <select
                className="form-select"
                value={sentido}
                onChange={e => setSentido(e.target.value as SentidoDocumento)}
              >
                <option value="venta">Venta (Cliente)</option>
                <option value="compra">Compra (Proveedor)</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Fecha de emisión</label>
              <input
                type="date"
                className="form-input"
                value={issueDate}
                onChange={e => setIssueDate(e.target.value)}
              />
            </div>
            {(tipo === 'pedido' || tipo === 'albaran' || tipo === 'factura') && (
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Fecha de vencimiento</label>
                <input
                  type="date"
                  className="form-input"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                />
              </div>
            )}
          </div>

          {(tipo === 'pedido' || tipo === 'albaran' || tipo === 'factura') && (
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
          )}

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Notas u Observaciones</label>
            <textarea
              className="form-textarea"
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Información adicional visible en el documento..."
            />
          </div>
        </div>
      </div>

      {/* Líneas del documento */}
      <LineasDocumento
        lineItems={lineItems}
        onChange={setLineItems}
        products={products}
        settings={settings}
        tarifaId={tarifaId}
        defaultDiscounts={selectedClient?.defaultDiscounts}
        titulo={`Conceptos y líneas de ${etiquetaTipo(tipo).toLowerCase()}`}
      />

      {/* Totales */}
      <div style={{ marginTop: 'var(--space-4)' }}>
        <TotalesDocumento
          subtotal={totals.subtotal}
          totalDiscount={totals.totalDiscount}
          taxBreakdown={totals.taxBreakdown}
          totalTax={totals.totalTax}
          total={totals.total}
          globalDiscounts={globalDiscounts}
          onGlobalDiscountsChange={setGlobalDiscounts}
          etiquetaImpuesto={settings.igicEnabled ? 'IGIC' : 'IVA'}
        />
      </div>
    </div>
  );
}

export default function NuevoDocumentoPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="form" label="Cargando formulario..." />}>
      <NuevoDocumentoContent />
    </Suspense>
  );
}
