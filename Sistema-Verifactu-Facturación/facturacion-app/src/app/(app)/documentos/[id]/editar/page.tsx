'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, Send } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import {
  getInvoiceById, getProducts, getCompanySettings, saveDocumento, isSealed,
} from '@/lib/storage';
import {
  Invoice, InvoiceLineItem, InvoiceStatus, PaymentMethod, CompanySettings,
  Product,
} from '@/lib/types';
import { calculateInvoiceTotals } from '@/lib/utils';
import { PAYMENT_METHODS } from '@/lib/constants';
import { etiquetaTipo } from '@/lib/documentos';
import LineasDocumento from '@/components/documentos/LineasDocumento';
import TotalesDocumento from '@/components/documentos/TotalesDocumento';
import { useToast } from '@/hooks/useToast';

export default function EditarDocumentoPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [documento, setDocumento] = useState<Invoice | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [clientName, setClientName] = useState('');
  const [clientNif, setClientNif] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.TRANSFERENCIA);
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([]);

  const { success, error: toastError } = useToast();

  useEffect(() => {
    const load = async () => {
      try {
        const [doc, prodList, st] = await Promise.all([
          getInvoiceById(id),
          getProducts(),
          getCompanySettings(),
        ]);
        if (!doc) {
          toastError('Documento no encontrado');
          router.push('/documentos');
          return;
        }
        if (doc.status !== InvoiceStatus.BORRADOR && isSealed(doc)) {
          toastError('Este documento no se puede editar');
          router.push(`/documentos/${doc.id}`);
          return;
        }

        setDocumento(doc);
        setProducts(prodList);
        setSettings(st);

        setClientName(doc.clientName);
        setClientNif(doc.clientNif || '');
        setClientAddress(doc.clientAddress || '');
        setIssueDate(doc.issueDate);
        setDueDate(doc.dueDate || doc.issueDate);
        setPaymentMethod(doc.paymentMethod || PaymentMethod.TRANSFERENCIA);
        setNotes(doc.notes || '');
        setLineItems(doc.lineItems || []);
      } catch {
        toastError('Error al cargar documento');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, router]);

  const totals = useMemo(() => calculateInvoiceTotals(lineItems), [lineItems]);

  const handleSave = async (statusToSet: InvoiceStatus = InvoiceStatus.BORRADOR) => {
    if (!documento || !settings) return;
    if (!clientName.trim()) {
      toastError('El nombre es obligatorio');
      return;
    }
    if (lineItems.length === 0) {
      toastError('Añade al menos una línea');
      return;
    }

    setSaving(true);
    try {
      const updated: Invoice = {
        ...documento,
        clientName,
        clientNif,
        clientAddress,
        issueDate,
        dueDate,
        paymentMethod,
        notes,
        status: statusToSet,
        lineItems,
        subtotal: totals.subtotal,
        totalDiscount: totals.totalDiscount,
        taxBreakdown: totals.taxBreakdown,
        totalTax: totals.totalTax,
        total: totals.total,
        updatedAt: new Date().toISOString(),
      };

      await saveDocumento(updated);
      success(`${etiquetaTipo(documento.tipo ?? 'factura')} ${documento.number} actualizado`);
      router.push(`/documentos/${documento.id}`);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !documento || !settings) return <PageSkeleton />;

  const tipo = documento.tipo ?? 'factura';
  const esCompra = documento.sentido === 'compra';

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Link href={`/documentos/${documento.id}`} className="btn btn-ghost btn-sm">
            <ArrowLeft size={16} /> Volver
          </Link>
          <div>
            <h1 className="page-title">Editar {etiquetaTipo(tipo)} {documento.number}</h1>
            <p className="page-subtitle">Modificación de borrador</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => handleSave(InvoiceStatus.BORRADOR)}
            disabled={saving}
          >
            <Save size={16} /> Guardar cambios
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
          <h3 className="card-title" style={{ marginBottom: 'var(--space-3)' }}>
            {esCompra ? 'Datos del Proveedor' : 'Datos del Cliente'}
          </h3>
          <div className="form-group">
            <label className="form-label">Nombre o Razón Social *</label>
            <input
              type="text"
              className="form-input"
              value={clientName}
              onChange={e => setClientName(e.target.value)}
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
              />
            </div>
            <div className="form-group" style={{ flex: 2 }}>
              <label className="form-label">Dirección</label>
              <input
                type="text"
                className="form-input"
                value={clientAddress}
                onChange={e => setClientAddress(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Datos del documento */}
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 'var(--space-3)' }}>Condiciones</h3>
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
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Fecha de vencimiento</label>
              <input
                type="date"
                className="form-input"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
              />
            </div>
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

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Notas</label>
            <textarea
              className="form-textarea"
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Líneas */}
      <LineasDocumento
        lineItems={lineItems}
        onChange={setLineItems}
        products={products}
        settings={settings}
      />

      {/* Totales */}
      <div style={{ marginTop: 'var(--space-4)' }}>
        <TotalesDocumento
          subtotal={totals.subtotal}
          totalDiscount={totals.totalDiscount}
          taxBreakdown={totals.taxBreakdown}
          totalTax={totals.totalTax}
          total={totals.total}
          etiquetaImpuesto={settings.igicEnabled ? 'IGIC' : 'IVA'}
        />
      </div>
    </div>
  );
}
