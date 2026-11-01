'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, Send, AlertTriangle } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import {
  getInvoiceById, getProducts, getCompanySettings, saveDocumento, isSealed,
  getAlmacenes, getClientById, getInvoices, expedirAlbaranCompra, expedirAlbaranVenta,
} from '@/lib/storage';
import { excesosSobrePedido, pasoAlTerminar, rotuloAlTerminar, textoDeExcesos } from '@/lib/flujoVenta';
import { esFacturaRecibida, sePuedeEditar } from '@/lib/fichaDocumento';
import { CLAVE_FECHA_REGISTRO, conDatosDelProveedor, numeroDelProveedor, problemasFacturaRecibida } from '@/lib/compras';
import CamposFacturaProveedor from '../_componentes/CamposFacturaProveedor';
import { impuestoDeFactura } from '@/lib/impuesto';
import {
  Invoice, InvoiceLineItem, InvoiceStatus, PaymentMethod, CompanySettings,
  Product, Almacen, Client,
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
  const [documentos, setDocumentos] = useState<Invoice[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [clientName, setClientName] = useState('');
  const [clientNif, setClientNif] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [tarifaId, setTarifaId] = useState('');
  // La ficha del cliente, para sus descuentos y precios especiales (sólo ventas).
  const [cliente, setCliente] = useState<Client | null>(null);
  const [almacenId, setAlmacenId] = useState('');
  const [globalDiscounts, setGlobalDiscounts] = useState<[number, number, number]>([0, 0, 0]);
  const [issueDate, setIssueDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.TRANSFERENCIA);
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([]);
  // La factura recibida: el número del proveedor y la fecha de registro.
  const [numeroProveedor, setNumeroProveedor] = useState('');
  const [fechaRegistro, setFechaRegistro] = useState('');

  const { success, error: toastError } = useToast();

  useEffect(() => {
    const load = async () => {
      try {
        const [doc, prodList, st, loadedAlmacenes, todos] = await Promise.all([
          getInvoiceById(id),
          getProducts(),
          getCompanySettings(),
          getAlmacenes(),
          getInvoices().catch(() => [] as Invoice[]),
        ]);
        setDocumentos(todos);
        if (!doc) {
          toastError('Documento no encontrado');
          router.push('/documentos');
          return;
        }
        // Sólo se edita lo que está en borrador, sea del tipo que sea y de
        // venta o de compra (sePuedeEditar). Antes valía cualquier documento
        // no sellado: un albarán ya expedido, recibido o facturado se abría
        // aquí (escribiendo la dirección a mano) y «Guardar» lo devolvía a
        // borrador, con el stock que movió devuelto sin que nadie lo pidiera.
        if (!sePuedeEditar(doc) || isSealed(doc)) {
          toastError('Este documento no se puede editar', 'Sólo se editan los borradores.');
          router.push(`/documentos/${doc.id}`);
          return;
        }

        setDocumento(doc);
        setProducts(prodList);
        setSettings(st);
        setAlmacenes(loadedAlmacenes);

        setClientName(doc.clientName);
        setClientNif(doc.clientNif || '');
        setClientAddress(doc.clientAddress || '');
        setTarifaId(doc.tarifaId || '');
        if (doc.clientId && doc.sentido !== 'compra') setCliente((await getClientById(doc.clientId)) ?? null);
        setAlmacenId(doc.almacenId || '');
        setGlobalDiscounts([
          doc.globalDiscountPercent1 || 0,
          doc.globalDiscountPercent2 || 0,
          doc.globalDiscountPercent3 || 0,
        ]);
        setIssueDate(doc.issueDate);
        setDueDate(doc.dueDate || doc.issueDate);
        setPaymentMethod(doc.paymentMethod || PaymentMethod.TRANSFERENCIA);
        setNotes(doc.notes || '');
        setLineItems(doc.lineItems || []);
        setNumeroProveedor(numeroDelProveedor(doc));
        setFechaRegistro(doc.datosExtras?.[CLAVE_FECHA_REGISTRO] || doc.issueDate);
      } catch {
        toastError('Error al cargar documento');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, router]);

  const totals = useMemo(
    () => calculateInvoiceTotals(lineItems, globalDiscounts),
    [lineItems, globalDiscounts],
  );

  // Un albarán (o factura) sacado de un pedido que, con lo que ya salió,
  // sirve más de lo pedido: se puede, pero se ve mientras se escribe y se
  // pregunta antes de guardar.
  const excesos = useMemo(
    () => (documento ? excesosSobrePedido({ ...documento, lineItems }, documentos) : []),
    [documento, lineItems, documentos],
  );

  // La factura recibida, con lo que se está escribiendo: número repetido de
  // ese proveedor o registro anterior a la factura paran el guardado.
  const recibida = documento ? esFacturaRecibida(documento) : false;
  const problemas = useMemo(
    () => (documento && recibida
      ? problemasFacturaRecibida(conDatosDelProveedor({ ...documento, issueDate }, { numero: numeroProveedor, fechaRegistro }), documentos)
      : []),
    [documento, recibida, issueDate, numeroProveedor, fechaRegistro, documentos],
  );

  // `terminar`: el segundo botón (emitir, expedir o pasar a Facturas para
  // emitir, según el tipo: ver pasoAlTerminar).
  const handleSave = async (terminar = false) => {
    if (!documento || !settings) return;
    const tipoDoc = documento.tipo ?? 'factura';
    const sentidoDoc = documento.sentido ?? 'venta';
    const paso = pasoAlTerminar(tipoDoc, sentidoDoc);
    const statusToSet = terminar && paso === 'emitir' ? InvoiceStatus.EMITIDA : InvoiceStatus.BORRADOR;
    if (!clientName.trim()) {
      toastError('El nombre es obligatorio');
      return;
    }
    if (lineItems.length === 0) {
      toastError('Añade al menos una línea');
      return;
    }
    const errorRecibida = problemas.find(p => p.gravedad === 'error');
    if (errorRecibida) {
      toastError('Revisa la factura del proveedor', errorRecibida.texto);
      return;
    }
    if (sentidoDoc === 'venta' && excesos.length && !window.confirm(`Esto sirve más de lo pedido en ${documento.documentoOrigenNumber}:\n\n${textoDeExcesos(excesos)}\n\n¿Guardarlo igualmente?`)) {
      return;
    }

    setSaving(true);
    try {
      const lineItemsWithCosts: InvoiceLineItem[] = lineItems.map(li => {
        const prod = products.find(p => p.id === li.productId);
        return {
          ...li,
          costPrice: li.costPrice && li.costPrice > 0 ? li.costPrice : (prod?.costePmp || prod?.unitPrice || 0),
        };
      });

      const updated: Invoice = {
        ...documento,
        clientName,
        clientNif,
        clientAddress,
        tarifaId: tarifaId || undefined,
        almacenId: almacenId || undefined,
        globalDiscountPercent1: globalDiscounts[0] || 0,
        globalDiscountPercent2: globalDiscounts[1] || 0,
        globalDiscountPercent3: globalDiscounts[2] || 0,
        issueDate,
        dueDate,
        paymentMethod,
        notes,
        status: statusToSet,
        lineItems: lineItemsWithCosts,
        subtotal: totals.subtotal,
        totalDiscount: totals.totalDiscount,
        taxBreakdown: totals.taxBreakdown,
        totalTax: totals.totalTax,
        total: totals.total,
        updatedAt: new Date().toISOString(),
      };

      const guardado = await saveDocumento(recibida ? conDatosDelProveedor(updated, { numero: numeroProveedor, fechaRegistro }) : updated);
      if (terminar && paso === 'facturas') {
        success(`Guardada en borrador: ${guardado.number}`, 'Revísala y emítela: la huella y el registro Veri*Factu los pone el servidor al emitir.');
        router.push(`/facturas/${guardado.id}`);
        return;
      }
      if (terminar && paso === 'expedir') {
        try {
          const expedido = sentidoDoc === 'compra' ? await expedirAlbaranCompra(guardado.id) : await expedirAlbaranVenta(guardado.id);
          success(`Albarán ${expedido.number} ${sentidoDoc === 'compra' ? 'recibido' : 'expedido'}`, sentidoDoc === 'compra' ? 'Stock aumentado.' : 'Stock descontado.');
        } catch (e) {
          toastError(`Guardado en borrador: ${guardado.number}`, `No se ha ${sentidoDoc === 'compra' ? 'recibido' : 'expedido'}: ${e instanceof Error ? e.message : 'error desconocido'}`);
        }
      } else {
        success(`${etiquetaTipo(tipoDoc)} ${guardado.number} actualizado`);
      }
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
            <p className="page-subtitle">Modificación de documento no sellado</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => handleSave(false)}
            disabled={saving}
          >
            <Save size={16} /> Guardar
          </button>
          <button
            type="button"
            className="btn btn-primary neon neon--al-pasar"
            onClick={() => handleSave(true)}
            disabled={saving}
          >
            <Send size={16} /> {rotuloAlTerminar(tipo, esCompra ? 'compra' : 'venta')}
          </button>
        </div>
      </div>

      {excesos.length > 0 && (
        <div className="flujo-exceso" role="alert">
          <AlertTriangle size={16} aria-hidden />
          <div>
            <strong>Sirve más de lo pedido en {documento.documentoOrigenNumber}.</strong>
            <ul>
              {excesos.map(e => (
                <li key={e.nombre}>
                  {e.nombre}: {e.pedido === 0 ? 'no estaba en el pedido' : `pedido ${e.pedido}, ya servido ${e.otros}, aquí ${e.este}`} ({e.exceso} de más)
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="grid-2-cols" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
        {/* Datos de contraparte */}
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 'var(--space-3)' }}>
            {esCompra ? 'Proveedor' : 'Cliente'}
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
              <label className="form-label">NIF</label>
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

          {recibida && (
            <CamposFacturaProveedor
              numero={numeroProveedor} fechaRegistro={fechaRegistro} problemas={problemas}
              onNumero={setNumeroProveedor} onFechaRegistro={setFechaRegistro}
            />
          )}

          <div className="form-row">
            <div className="form-group" style={{ flex: 1 }}>
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

            {almacenes.length > 0 && (
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Almacén / Ubicación</label>
                <select
                  className="form-select"
                  value={almacenId}
                  onChange={e => setAlmacenId(e.target.value)}
                >
                  {almacenes.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.nombre} {a.principal ? '(Principal)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
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
        tarifaId={tarifaId}
        defaultDiscounts={cliente?.defaultDiscounts}
        cliente={cliente}
        sentido={documento.sentido === 'compra' ? 'compra' : 'venta'}
        clienteId={documento.clientId}
        documentoId={documento.id}
      />

      {/* Totales */}
      <div style={{ marginTop: 'var(--space-4)' }}>
        <TotalesDocumento
          subtotal={totals.subtotal}
          totalDiscount={totals.totalDiscount}
          taxBreakdown={totals.taxBreakdown}
          totalTax={totals.totalTax}
          total={totals.total}
          descuentoAlPie={totals.globalDiscountAmount ?? 0}
          porcentajesPie={globalDiscounts.filter(p => p > 0)}
          globalDiscounts={globalDiscounts}
          onGlobalDiscountsChange={setGlobalDiscounts}
          destacado
          etiquetaImpuesto={impuestoDeFactura(documento, settings)}
        />
      </div>
    </div>
  );
}
