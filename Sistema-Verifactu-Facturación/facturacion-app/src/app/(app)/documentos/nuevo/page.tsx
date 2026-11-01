'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, Send, Plus, Wand2 } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import {
  getClients, getProducts, getCompanySettings, saveDocumento, getProveedores,
  getAlmacenes, getVendedores, getObras, getLotes, expedirAlbaranCompra, expedirAlbaranVenta, getInvoices,
} from '@/lib/storage';
import { pasoAlTerminar, rotuloAlTerminar } from '@/lib/flujoVenta';
import { esFacturaRecibida } from '@/lib/fichaDocumento';
import { conDatosDelProveedor, problemasFacturaRecibida } from '@/lib/compras';
import CamposFacturaProveedor from '../[id]/_componentes/CamposFacturaProveedor';
import { impuestoDeEmpresa } from '@/lib/impuesto';
import {
  Client, Product, Invoice, InvoiceLineItem, InvoiceStatus,
  PaymentMethod, CompanySettings, TipoDocumento, SentidoDocumento,
  Almacen, Vendedor, Obra, Lote,
} from '@/lib/types';
import { tieneModulo, modulosDe } from '@/lib/modulos';
import {
  generateId, getToday, addDays, calculateInvoiceTotals, formatCurrency,
} from '@/lib/utils';
import { importeRetencion, totalAPagar } from '@/lib/retenciones';
import { PAYMENT_METHODS } from '@/lib/constants';
import {
  lineaVacia, numeroDeDocumento, etiquetaTipo, actualizarContadorSerie, serieParaCliente,
} from '@/lib/documentos';
import LineasDocumento from '@/components/documentos/LineasDocumento';
import AtajosVencimiento from '@/components/documentos/AtajosVencimiento';
import TotalesDocumento from '@/components/documentos/TotalesDocumento';
import { useToast } from '@/hooks/useToast';
import BuscadorFicha from '@/components/clientes/BuscadorFicha';
import ResumenFichaElegida from '@/components/clientes/ResumenFichaElegida';

function NuevoDocumentoContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tipoParam = (searchParams.get('tipo') as TipoDocumento) || 'presupuesto';
  const sentidoParam = (searchParams.get('sentido') as SentidoDocumento) || 'venta';
  // Para llegar aquí ya con el cliente puesto desde otra pantalla —una orden
  // de trabajo que se factura, por ejemplo— en vez de obligar a buscarlo de
  // nuevo.
  const clientIdParam = searchParams.get('clientId');
  const obraIdParam = searchParams.get('obraId');

  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);

  const [tipo, setTipo] = useState<TipoDocumento>(tipoParam);
  const [sentido, setSentido] = useState<SentidoDocumento>(sentidoParam);

  const [clientId, setClientId] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientNif, setClientNif] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [tarifaId, setTarifaId] = useState('');
  const [almacenId, setAlmacenId] = useState('');
  const [obraId, setObraId] = useState(obraIdParam ?? '');
  const [obras, setObras] = useState<Obra[]>([]);
  const [modoObras, setModoObras] = useState(false);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [modoLotes, setModoLotes] = useState(false);
  const [retencionPct, setRetencionPct] = useState<number | undefined>(undefined);
  const [modoRetenciones, setModoRetenciones] = useState(false);
  const [globalDiscounts, setGlobalDiscounts] = useState<[number, number, number]>([0, 0, 0]);

  const [issueDate, setIssueDate] = useState(getToday());
  const [dueDate, setDueDate] = useState(addDays(getToday(), 30));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.TRANSFERENCIA);
  const [notes, setNotes] = useState('');
  // La factura recibida: el número del proveedor y la fecha de registro, y
  // los documentos para ver si ese número ya está registrado.
  const [numeroProveedor, setNumeroProveedor] = useState('');
  const [fechaRegistro, setFechaRegistro] = useState(getToday());
  const [documentos, setDocumentos] = useState<Invoice[]>([]);

  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [vendedorId, setVendedorId] = useState('');
  // La serie que impone el vendedor, si tiene una propia. Se resuelve al
  // elegir cliente y se enseña antes de guardar, porque el número de una
  // factura no puede ser una sorpresa.
  const [serieVendedor, setSerieVendedor] = useState<{ serie: string; nextNumber: number } | null>(null);
  const { success, error: toastError } = useToast();

  const selectedClient = useMemo(() => clients.find(c => c.id === clientId), [clients, clientId]);

  useEffect(() => {
    const load = async () => {
      try {
        const [loadedSettings, loadedProducts, loadedClients, loadedAlmacenes, loadedVendedores, loadedObras, loadedLotes] = await Promise.all([
          getCompanySettings(),
          getProducts(),
          sentidoParam === 'compra' ? getProveedores() : getClients(),
          getAlmacenes(),
          getVendedores(),
          getObras(),
          getLotes(),
        ]);
        setSettings(loadedSettings);
        setProducts(loadedProducts);
        setClients(loadedClients);
        setAlmacenes(loadedAlmacenes);
        setVendedores(loadedVendedores);
        setObras(loadedObras);
        setModoObras(tieneModulo(modulosDe(loadedSettings), 'obras'));
        setLotes(loadedLotes);
        setModoLotes(tieneModulo(modulosDe(loadedSettings), 'lotes'));
        setModoRetenciones(tieneModulo(modulosDe(loadedSettings), 'retenciones'));

        const principalAlm = loadedAlmacenes.find(a => a.principal) || loadedAlmacenes[0];
        if (principalAlm) {
          setAlmacenId(principalAlm.id);
        }

        // Se llega aquí ya con cliente elegido desde otra pantalla —una orden
        // de trabajo que se factura, por ejemplo—. Se resuelve contra la
        // lista recién cargada, no contra el estado `clients`, que en este
        // mismo instante todavía está vacío.
        if (clientIdParam) {
          const cliente = loadedClients.find(c => c.id === clientIdParam);
          if (cliente) {
            setClientId(cliente.id);
            setClientName(cliente.tradeName || cliente.businessName);
            setClientNif(cliente.nif);
            setClientAddress(cliente.address || '');
            setTarifaId(cliente.tarifaId || '');
            if (cliente.defaultPaymentMethod) setPaymentMethod(cliente.defaultPaymentMethod);
          }
        }

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

  // `nueva`: la ficha recién creada desde el buscador, que aún no está en `clients`.
  const handleClientSelect = (id: string, nueva?: Client) => {
    setClientId(id);
    const client = nueva ?? clients.find(c => c.id === id);
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

      // El vendedor asignado al cliente, y con él dos cosas que hasta ahora
      // había que acordarse de poner a mano en cada documento: su almacén y
      // su serie. La serie por vendedor estaba programada desde hacía tiempo
      // y no la usaba nadie, así que todos los documentos salían con la serie
      // de la empresa aunque el vendedor tuviera la suya.
      setVendedorId(client.vendedorId || '');
      const vendedor = vendedores.find(v => v.id === client.vendedorId);
      if (vendedor?.almacenId) setAlmacenId(vendedor.almacenId);
      void serieParaCliente(client.id, tipo, sentido).then(setSerieVendedor);
    } else {
      setClientName('');
      setClientNif('');
      setClientAddress('');
      setTarifaId('');
      setVendedorId('');
      setSerieVendedor(null);
    }
  };

  // Cambiar la fecha del documento mueve también el vencimiento.
  //
  // Antes se calculaba una sola vez, al elegir el cliente. Si luego se
  // corregía la fecha de emisión —cosa que se hace a diario, porque el
  // albarán es del viernes y se factura el lunes— el vencimiento se quedaba
  // colgado de la fecha vieja y salía a 33 días en vez de a 30.
  const cambiarFechaEmision = (fecha: string) => {
    setIssueDate(fecha);
    const dias = selectedClient?.paymentDays;
    if (dias) setDueDate(addDays(fecha, dias));
  };

  const totals = useMemo(
    () => calculateInvoiceTotals(lineItems, globalDiscounts),
    [lineItems, globalDiscounts],
  );

  // La factura recibida pide los datos del papel del proveedor; lo que no
  // cuadra se ve mientras se escribe y, si es un error, para el guardado.
  const recibida = esFacturaRecibida({ tipo, sentido });
  useEffect(() => {
    if (!recibida) return;
    let vivo = true;
    getInvoices().then(d => { if (vivo) setDocumentos(d); }).catch(() => {});
    return () => { vivo = false; };
  }, [recibida]);
  const problemas = useMemo(() => {
    if (!recibida) return [];
    const prueba = {
      id: '__nueva', tipo, sentido, clientId, clientName, clientNif, issueDate, status: InvoiceStatus.BORRADOR,
    } as Invoice;
    return problemasFacturaRecibida(conDatosDelProveedor(prueba, { numero: numeroProveedor, fechaRegistro }), documentos);
  }, [recibida, tipo, sentido, clientId, clientName, clientNif, issueDate, numeroProveedor, fechaRegistro, documentos]);

  // `terminar`: el segundo botón (emitir, expedir o pasar a Facturas para
  // emitir, según el tipo: ver pasoAlTerminar).
  const handleSave = async (terminar = false) => {
    if (!settings) return;
    const paso = pasoAlTerminar(tipo, sentido);
    const statusToSet = terminar && paso === 'emitir' ? InvoiceStatus.EMITIDA : InvoiceStatus.BORRADOR;
    if (!clientName.trim()) {
      toastError(sentido === 'compra' ? 'Indica el proveedor' : 'Indica el cliente');
      return;
    }
    if (lineItems.length === 0 || lineItems.every(l => !l.productName && !l.productId)) {
      toastError('Añade al menos una línea con producto');
      return;
    }
    const errorRecibida = problemas.find(p => p.gravedad === 'error');
    if (errorRecibida) {
      toastError('Revisa la factura del proveedor', errorRecibida.texto);
      return;
    }

    setSaving(true);
    try {
      // La serie del vendedor manda sobre la de la empresa: si el comercial
      // tiene la suya, sus documentos van en ella.
      const { series, number } = serieVendedor
        ? { series: serieVendedor.serie, number: `${serieVendedor.serie}-${new Date(issueDate).getFullYear()}-${String(serieVendedor.nextNumber).padStart(4, '0')}` }
        : numeroDeDocumento(settings, tipo, sentido);
      const now = new Date().toISOString();

      const lineItemsWithCosts: InvoiceLineItem[] = lineItems.map(li => {
        const prod = products.find(p => p.id === li.productId);
        return {
          ...li,
          costPrice: prod?.costePmp && prod.costePmp > 0 ? prod.costePmp : (prod?.unitPrice || 0),
        };
      });

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
        almacenId: almacenId || undefined,
        obraId: obraId || undefined,
        retencionPct: retencionPct || undefined,
        vendedorId: vendedorId || undefined,
        globalDiscountPercent1: globalDiscounts[0] || 0,
        globalDiscountPercent2: globalDiscounts[1] || 0,
        globalDiscountPercent3: globalDiscounts[2] || 0,
        issueDate,
        dueDate: dueDate || issueDate,
        status: statusToSet,
        paymentMethod: paymentMethod || PaymentMethod.TRANSFERENCIA,
        lineItems: lineItemsWithCosts,
        subtotal: totals.subtotal,
        totalDiscount: totals.totalDiscount,
        taxBreakdown: totals.taxBreakdown,
        totalTax: totals.totalTax,
        total: totals.total,
        notes: notes || '',
        createdAt: now,
        updatedAt: now,
      };

      const guardado = await saveDocumento(recibida ? conDatosDelProveedor(doc, { numero: numeroProveedor, fechaRegistro }) : doc);
      await actualizarContadorSerie(settings, `${tipo}_${sentido}`, guardado.number);

      if (terminar && paso === 'facturas') {
        success(`Guardada en borrador: ${guardado.number}`, 'Revísala y emítela: la huella y el registro Veri*Factu los pone el servidor al emitir.');
        router.push(`/facturas/${guardado.id}`);
        return;
      }
      if (terminar && paso === 'expedir') {
        try {
          const expedido = sentido === 'compra' ? await expedirAlbaranCompra(guardado.id) : await expedirAlbaranVenta(guardado.id);
          success(`Albarán ${expedido.number} ${sentido === 'compra' ? 'recibido' : 'expedido'}`, sentido === 'compra' ? 'Stock aumentado.' : 'Stock descontado.');
        } catch (e) {
          toastError(`Guardado en borrador: ${guardado.number}`, `No se ha ${sentido === 'compra' ? 'recibido' : 'expedido'}: ${e instanceof Error ? e.message : 'error desconocido'}`);
        }
        router.push(`/documentos/${guardado.id}`);
        return;
      }
      success(`Guardado: ${etiquetaTipo(tipo)} ${guardado.number}`);
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
            onClick={() => handleSave(false)}
            disabled={saving}
          >
            <Save size={16} /> Guardar Borrador
          </button>
          <button
            type="button"
            className="btn btn-primary neon neon--al-pasar"
            onClick={() => handleSave(true)}
            disabled={saving}
          >
            <Send size={16} /> {rotuloAlTerminar(tipo, sentido)}
          </button>
        </div>
      </div>

      <div className="grid-2-cols" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
        {/* Datos de contraparte */}
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 'var(--space-3)' }}>Datos del {labelContraparte}</h3>

          <div className="form-group">
            <label className="form-label">Seleccionar {labelContraparte}</label>
            <BuscadorFicha
              fichas={clients}
              value={clientId}
              onSelect={id => handleClientSelect(id)}
              placeholder={`Buscar ${labelContraparte.toLowerCase()} (vacío: ocasional / manual)`}
              ariaLabel={labelContraparte}
              esProveedor={sentido === 'compra'}
              alCrear={c => { setClients(prev => [...prev, c]); handleClientSelect(c.id, c); }}
            />
            <ResumenFichaElegida ficha={clients.find(c => c.id === clientId)} />
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
                onChange={e => cambiarFechaEmision(e.target.value)}
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
                <AtajosVencimiento
                  emision={issueDate}
                  vencimiento={dueDate}
                  diasCliente={selectedClient?.paymentDays || null}
                  onElegir={setDueDate}
                />
              </div>
            )}
          </div>

          {recibida && (
            <CamposFacturaProveedor
              numero={numeroProveedor} fechaRegistro={fechaRegistro} problemas={problemas}
              onNumero={setNumeroProveedor} onFechaRegistro={setFechaRegistro}
            />
          )}

          {/* Lo que se ha rellenado solo, dicho en voz alta.
              Un formulario que decide por su cuenta y no lo cuenta da más
              miedo que uno que no decide nada, sobre todo si lo que decide
              es la serie con la que va a salir numerada la factura. */}
          {(serieVendedor || vendedorId) && (
            <p className="doc-automatico">
              <Wand2 size={14} />
              <span>
                {vendedorId && (
                  <>Vendedor <strong>{vendedores.find(v => v.id === vendedorId)?.nombre}</strong></>
                )}
                {serieVendedor && (
                  <> · serie <strong>{serieVendedor.serie}</strong>, nº {String(serieVendedor.nextNumber).padStart(4, '0')}</>
                )}
                {almacenes.find(a => a.id === almacenId) && (
                  <> · almacén <strong>{almacenes.find(a => a.id === almacenId)!.nombre}</strong></>
                )}
              </span>
            </p>
          )}

          <div className="form-row">
            {(tipo === 'pedido' || tipo === 'albaran' || tipo === 'factura') && (
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
            )}

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

            {modoObras && (
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Obra / Expediente</label>
                <select
                  className="form-select"
                  value={obraId}
                  onChange={e => setObraId(e.target.value)}
                >
                  <option value="">— Sin obra —</option>
                  {obras.filter(o => o.estado === 'abierta' || o.id === obraId).map(o => (
                    <option key={o.id} value={o.id}>{o.numero} · {o.nombre}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

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
        cliente={sentido === 'venta' ? selectedClient : null}
        lotes={modoLotes ? lotes : []}
        sentido={sentido}
        clienteId={selectedClient?.id}
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
          etiquetaImpuesto={impuestoDeEmpresa(settings)}
        >
          {modoRetenciones && (tipo === 'factura' || tipo === 'rectificativa') && (
            <div className="doc-retencion">
              <label className="doc-retencion-campo">
                <span>Retención IRPF %</span>
                <input
                  type="number" min={0} max={100} step={0.5}
                  value={retencionPct ?? ''}
                  onChange={e => setRetencionPct(e.target.value === '' ? undefined : parseFloat(e.target.value))}
                  placeholder="—"
                />
              </label>
              {!!retencionPct && (
                <div className="doc-retencion-resumen">
                  <span>Retención ({retencionPct}% de la base)</span>
                  <strong>−{formatCurrency(importeRetencion(totals.subtotal, retencionPct))}</strong>
                  <span>Total a {sentido === 'compra' ? 'pagar' : 'cobrar'}</span>
                  <strong>{formatCurrency(totalAPagar(totals.total, totals.subtotal, retencionPct))}</strong>
                </div>
              )}
            </div>
          )}
        </TotalesDocumento>
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
