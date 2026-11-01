'use client';

import { celdasDeCantidad } from '@/components/documentos/celdasDeCantidad';
import { cajasTotales } from '@/lib/cajas';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Edit, Ban, ArrowRight, CheckCircle, PackageCheck, FileSignature,
  RotateCcw, WalletCards, ShieldCheck, Send, Link2, Clock,
} from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import BotonDescargarPdf from '@/components/plantillas/BotonDescargarPdf';
import {
  getInvoiceById, getInvoices, getCompanySettings, saveDocumento, isSealed, esSellable,
  expedirAlbaranCompra, expedirAlbaranVenta, createOrderApproval, getApprovalByInvoiceId,
} from '@/lib/storage';
import {
  Invoice, InvoiceStatus, CompanySettings, TipoDocumento, OrderApproval,
} from '@/lib/types';
import { formatCurrency, formatDate, desgloseDescuentos } from '@/lib/utils';
import { PAYMENT_METHODS } from '@/lib/constants';
import {
  etiquetaTipo, rectificar, actualizarContadorSerie, unidadesTotales, descuentoEfectivo,
} from '@/lib/documentos';
import { DESTINOS, etiquetaEstado, excesosSobrePedido, motivoParaNoConvertir, servicioDePedido, textoDeExcesos, trazaDe } from '@/lib/flujoVenta';
import { anularDocumento, avisoAntesDeAnular, convertirYGuardar } from '@/lib/flujoVentaAcciones';
import { impuestoDeFactura } from '@/lib/impuesto';
import { importeRetencion, totalAPagar } from '@/lib/retenciones';
import { vocabularioDe, conPlural } from '@/lib/vocabulario';
import { useToast } from '@/hooks/useToast';
import TrazaDocumento from './_componentes/TrazaDocumento';

/** Lo que dice el botón de cada conversión, según de dónde sale. */
function rotuloConversion(origen: TipoDocumento, destino: TipoDocumento): string {
  if (destino === 'factura') return origen === 'albaran' ? 'Facturar albarán' : 'Facturar';
  if (destino === 'pedido') return 'Pasar a pedido';
  return origen === 'pedido' ? 'Convertir en albarán' : 'Pasar a albarán';
}

const iconoConversion = { pedido: ArrowRight, albaran: PackageCheck, factura: FileSignature } as const;

export default function DocumentoDetallePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [documento, setDocumento] = useState<Invoice | null>(null);
  const [documentos, setDocumentos] = useState<Invoice[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [aprobacion, setAprobacion] = useState<OrderApproval | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  // El estado tarda un repintado en desactivar los botones: un doble clic
  // rápido llegaba dos veces. La marca síncrona para el segundo.
  const ocupado = useRef(false);

  const { success, error: toastError, warning } = useToast();

  const cargar = useCallback(async () => {
    try {
      const [doc, st, todos] = await Promise.all([getInvoiceById(id), getCompanySettings(), getInvoices().catch(() => [] as Invoice[])]);
      setDocumento(doc || null);
      setSettings(st);
      setDocumentos(todos);
      if (doc?.status === InvoiceStatus.PRE_APROBACION && navigator.onLine) {
        setAprobacion(await getApprovalByInvoiceId(doc.id).catch(() => null));
      }
    } catch {
      toastError('Error al cargar el documento');
    } finally {
      setLoading(false);
    }
  }, [id, toastError]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- la primera carga
    void cargar();
    // Lo que cambia en otro sitio (la cola de sincronización al subir, otra
    // pestaña, el refresco de fondo) se ve aquí sin recargar a mano: el
    // número definitivo, el estado, un albarán que acaba de salir.
    const alCambiar = () => { void cargar(); };
    window.addEventListener('klima-invoices-updated', alCambiar);
    return () => window.removeEventListener('klima-invoices-updated', alCambiar);
  }, [cargar]);

  const traza = useMemo(() => (documento ? trazaDe(documento, documentos) : null), [documento, documentos]);
  const servicio = useMemo(
    () => (documento?.tipo === 'pedido' ? servicioDePedido(documento, documentos) : null),
    [documento, documentos],
  );

  if (loading) return <PageSkeleton />;
  if (!documento || !settings) {
    return (
      <div className="page-container">
        <div className="card text-center" style={{ padding: 'var(--space-8)' }}>
          <h2>Documento no encontrado</h2>
          <p style={{ color: 'var(--text-muted)', margin: 'var(--space-4) 0' }}>
            El documento solicitado no existe o ha sido eliminado.
          </p>
          <Link href="/documentos" className="btn btn-primary">
            Volver al listado
          </Link>
        </div>
      </div>
    );
  }

  const tipo = documento.tipo ?? 'factura';
  const sentido = documento.sentido ?? 'venta';
  const esCompra = sentido === 'compra';

  const descuentos = desgloseDescuentos(documento);
  const anulado = documento.status === InvoiceStatus.ANULADA;
  const borrador = documento.status === InvoiceStatus.BORRADOR;
  // Una factura de venta se emite (y se anula) desde Facturas: allí están
  // el repaso de antes de sellar, la confirmación del servidor y el motivo
  // de anulación que exige Veri*Factu. Aquí sólo se enlaza.
  const facturaDeVenta = esSellable(documento);
  const sellada = isSealed(documento);
  const etiquetaImpuesto = impuestoDeFactura(documento, settings);
  const retencion = documento.retencionPct ? importeRetencion(documento.subtotal, documento.retencionPct) : 0;
  const formaDePago = PAYMENT_METHODS.find(p => p.value === documento.paymentMethod)?.label ?? documento.paymentMethod;

  // Las palabras de este oficio (ver src/lib/vocabulario.ts). La columna de
  // unidades sólo sale si el oficio agrupa en bultos Y este documento
  // concreto los usa: un presupuesto de una sola pieza no necesita
  // explicar que trae una unidad.
  const voz = vocabularioDe(settings.sector);
  const muestraUnidades = voz.usaBultos
    && documento.lineItems.some(l => (l.unitsPerPackage ?? 0) > 0 || (l.cajas ?? 0) > 0);

  const conversiones = anulado ? [] : DESTINOS[tipo].map(destino => ({
    destino, motivo: motivoParaNoConvertir(documento, destino, documentos),
  }));

  /** Una acción a la vez, aunque lleguen dos clics antes del repintado. */
  const enUnaVez = async (accion: () => Promise<void>) => {
    if (ocupado.current) return;
    ocupado.current = true;
    setProcessing(true);
    try {
      await accion();
    } finally {
      ocupado.current = false;
      setProcessing(false);
    }
  };

  const sinConexion = () => typeof navigator !== 'undefined' && !navigator.onLine;

  const handleConvertir = (nuevoTipo: TipoDocumento) => enUnaVez(async () => {
    try {
      const guardado = await convertirYGuardar(documento.id, nuevoTipo);
      const nombre = `${etiquetaTipo(nuevoTipo)} ${guardado.number}`;
      const detalle = [
        nuevoTipo === 'factura' && !esCompra ? 'Queda en borrador: revísala y emítela desde Facturas.' : 'Queda en borrador.',
        sinConexion() ? 'Sin conexión: se ha guardado en este equipo y subirá al volver la red.' : '',
      ].filter(Boolean).join(' ');
      success(`Creado: ${nombre}`, detalle);
      router.push(`/documentos/${guardado.id}`);
    } catch (e) {
      toastError('No se ha convertido', e instanceof Error ? e.message : 'Error al convertir el documento');
      void cargar();
    }
  });

  // Expedición de albaranes: es lo que mueve el stock (la base de datos, al
  // dejar de ser borrador). Si sirve más de lo que pidió el cliente, se avisa.
  const handleExpedir = () => enUnaVez(async () => {
    const excesos = excesosSobrePedido(documento, documentos);
    if (excesos.length && !window.confirm(`Este albarán sirve más de lo pedido en ${documento.documentoOrigenNumber}:\n\n${textoDeExcesos(excesos)}\n\n¿Expedirlo igualmente?`)) return;
    try {
      const actualizado = esCompra ? await expedirAlbaranCompra(documento.id) : await expedirAlbaranVenta(documento.id);
      success(`Albarán ${actualizado.number} expedido`, esCompra ? 'Stock aumentado.' : 'Stock descontado.');
      setDocumento(actualizado);
      void cargar();
    } catch (e) {
      toastError('No se ha expedido', e instanceof Error ? e.message : 'Error al expedir el albarán');
    }
  });

  // Rectificación de factura
  const handleRectificar = () => enUnaVez(async () => {
    if (!window.confirm(`¿Crear factura rectificativa para ${documento.number}?`)) return;
    try {
      const rect = rectificar(documento, settings);
      const guardado = await saveDocumento(rect);
      await actualizarContadorSerie(settings, `rectificativa_${sentido}`, guardado.number);
      success(`Factura rectificativa ${guardado.number} creada.`);
      router.push(`/documentos/${guardado.id}`);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al rectificar factura');
    }
  });

  // Anulación: lo que salió de él sigue como está; lo que lo impide (un
  // albarán ya facturado) se dice antes de preguntar.
  const handleAnular = () => enUnaVez(async () => {
    try {
      const aviso = await avisoAntesDeAnular(documento.id);
      if (aviso?.bloquea) {
        toastError('No se puede anular', aviso.texto);
        return;
      }
      if (!window.confirm(`¿Anular ${etiquetaTipo(tipo).toLowerCase()} ${documento.number}?${aviso ? `\n\n${aviso.texto}` : ''}`)) return;
      const actualizado = await anularDocumento(documento.id);
      setDocumento(actualizado);
      success(`Anulado: ${documento.number}`);
      void cargar();
    } catch (e) {
      toastError('No se ha anulado', e instanceof Error ? e.message : 'Error al anular el documento');
    }
  });

  const enlaceAprobacion = aprobacion ? `${window.location.origin}/aprobar/${aprobacion.token}` : '';

  const handleEnviarAprobacion = () => enUnaVez(async () => {
    if (sinConexion()) {
      warning('Hace falta conexión', 'El enlace de aprobación lo crea el servidor.');
      return;
    }
    const creada = await createOrderApproval(documento.id);
    if (!creada) {
      toastError('No se ha podido crear el enlace de aprobación');
      return;
    }
    setAprobacion(creada);
    setDocumento({ ...documento, status: InvoiceStatus.PRE_APROBACION });
    const enlace = `${window.location.origin}/aprobar/${creada.token}`;
    const copiado = await navigator.clipboard?.writeText(enlace).then(() => true, () => false);
    success('Enviado para aprobación', copiado ? 'Enlace copiado: mándaselo al cliente.' : enlace);
  });

  return (
    <div className="page-container">
      <div className={`page-header detalle-cabecera detalle-cabecera--${documento.status}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Link href="/documentos" className="btn btn-ghost btn-sm">
            <ArrowLeft size={16} /> Volver
          </Link>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <h1 className="page-title">{etiquetaTipo(tipo)} {documento.number}</h1>
              <span className={`badge badge-${documento.status}`}>
                {etiquetaEstado(documento)}
              </span>
              <span className={`badge ${esCompra ? 'badge-warning' : 'badge-neutral'}`}>
                {esCompra ? 'Compra' : 'Venta'}
              </span>
            </div>
            <p className="page-subtitle">{documento.clientName} · {formatDate(documento.issueDate)}</p>
          </div>
        </div>

        <div className="flujo-acciones" style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <BotonDescargarPdf documento={{ tipo, documento }} />

          {borrador && (
            <Link href={`/documentos/${documento.id}/editar`} className="btn btn-outline btn-sm">
              <Edit size={14} /> Editar
            </Link>
          )}

          {/* La factura de venta: emitir y anular, en Facturas */}
          {facturaDeVenta && !anulado && (
            <Link href={`/facturas/${documento.id}`} className={`btn btn-sm ${borrador ? 'btn-primary' : 'btn-outline'}`}>
              <ShieldCheck size={14} /> {borrador ? 'Revisar y emitir' : 'Abrir en Facturas'}
            </Link>
          )}

          {/* El pedido de venta, al cliente para que lo apruebe */}
          {tipo === 'pedido' && !esCompra && borrador && (
            <button type="button" className="btn btn-outline btn-sm" onClick={handleEnviarAprobacion} disabled={processing}>
              <Send size={14} /> Enviar para aprobación
            </button>
          )}

          {tipo === 'albaran' && borrador && (
            <button type="button" className="btn btn-primary btn-sm" onClick={handleExpedir} disabled={processing}>
              <CheckCircle size={14} /> Expedir albarán ({esCompra ? '+stock' : '−stock'})
            </button>
          )}

          {/* Convertir: el botón se ve aunque no se pueda, y dice por qué */}
          {conversiones.map(({ destino, motivo }, i) => {
            const Icono = iconoConversion[destino as keyof typeof iconoConversion] ?? ArrowRight;
            const principal = i === 0 && !(tipo === 'albaran' && borrador);
            return (
              <button
                key={destino}
                type="button"
                className={`btn btn-sm ${principal ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => handleConvertir(destino)}
                disabled={processing || Boolean(motivo)}
                title={motivo ?? undefined}
                aria-describedby={motivo ? `motivo-${destino}` : undefined}
              >
                <Icono size={14} /> {rotuloConversion(tipo, destino)}
              </button>
            );
          })}

          {(tipo === 'factura' || tipo === 'rectificativa') && !anulado && !borrador && (
            <>
              {(documento.total - (documento.paidAmount || 0)) > 0.01 && (
                <Link href="/tesoreria" className="btn btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <WalletCards size={14} /> Registrar {esCompra ? 'pago' : 'cobro'}
                </Link>
              )}
              <button type="button" className="btn btn-outline btn-sm" onClick={handleRectificar} disabled={processing}>
                <RotateCcw size={14} /> Rectificar
              </button>
            </>
          )}

          {!anulado && !sellada && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleAnular} disabled={processing} style={{ color: 'var(--color-danger)' }}>
              <Ban size={14} /> Anular
            </button>
          )}
        </div>
      </div>

      {/* Por qué no se puede convertir, dicho también fuera del botón */}
      {conversiones.some(c => c.motivo) && (
        <ul className="flujo-motivos" aria-label="Lo que no se puede hacer ahora">
          {[...new Map(conversiones.filter(c => c.motivo).map(c => [c.motivo, c])).values()].map(c => (
            <li key={c.destino} id={`motivo-${c.destino}`}>{c.motivo}</li>
          ))}
        </ul>
      )}

      {documento.status === InvoiceStatus.PRE_APROBACION && (
        <div className="card flujo-aprobacion" role="status">
          <Clock size={16} aria-hidden />
          <span>Esperando la aprobación del cliente.{aprobacion && <> Expira el {formatDate(aprobacion.expiresAt)}.</>}</span>
          {enlaceAprobacion && (
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => { void navigator.clipboard?.writeText(enlaceAprobacion).then(() => success('Enlace copiado')); }}>
              <Link2 size={12} /> Copiar enlace
            </button>
          )}
        </div>
      )}

      {traza && <TrazaDocumento documento={documento} traza={traza} servicio={servicio} />}

      {/* Grid de información */}
      <div className="grid-2-cols" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 'var(--space-3)' }}>
            {esCompra ? 'Datos del proveedor' : 'Datos del cliente'}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            <div style={{ fontWeight: 600, fontSize: 'var(--text-base)' }}>{documento.clientName}</div>
            {documento.clientNif && <div><strong>NIF:</strong> {documento.clientNif}</div>}
            {documento.clientAddress && <div><strong>Dirección:</strong> {documento.clientAddress}</div>}
          </div>
        </div>

        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 'var(--space-3)' }}>Condiciones y fechas</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            <div><strong>Fecha:</strong> {formatDate(documento.issueDate)}</div>
            {documento.dueDate && <div><strong>Vencimiento:</strong> {formatDate(documento.dueDate)}</div>}
            {formaDePago && <div><strong>Forma de pago:</strong> {formaDePago}</div>}
            {!!documento.retencionPct && <div><strong>Retención:</strong> {documento.retencionPct}%</div>}
            {documento.notes && (
              <div style={{ marginTop: 'var(--space-2)' }}>
                <strong>Observaciones:</strong>
                <p style={{ color: 'var(--text-muted)', margin: 0, whiteSpace: 'pre-line' }}>{documento.notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabla de Líneas */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 'var(--space-4)' }}>
        <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--border-color)' }}>
          <h3 className="card-title" style={{ margin: 0 }}>{voz.titulo}</h3>
        </div>
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Ref.</th>
                <th>Descripción</th>
                {muestraUnidades ? (
                  <>
                    <th style={{ textAlign: 'right' }} title="Cajas completas">CAJ.</th>
                    <th style={{ textAlign: 'right' }} title="Unidades por caja">U/C</th>
                    <th style={{ textAlign: 'right' }} title="Unidades en total">UDES.</th>
                  </>
                ) : <th style={{ textAlign: 'right' }}>Cantidad</th>}
                <th style={{ textAlign: 'right' }}>Precio Unit.</th>
                <th style={{ textAlign: 'right' }}>Dto. %</th>
                <th style={{ textAlign: 'right' }}>{etiquetaImpuesto}</th>
                <th style={{ textAlign: 'right' }}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {documento.lineItems.map(li => {
                // Los tres descuentos en cascada, en uno solo: el que de verdad se hace.
                const dto = descuentoEfectivo(li);
                return (
                  <tr key={li.id}>
                    <td style={{ color: 'var(--text-muted)' }}>{li.productRef || '—'}</td>
                    <td style={{ fontWeight: 500 }}>{li.productName}</td>
                    {celdasDeCantidad(li, muestraUnidades)}
                    <td style={{ textAlign: 'right' }}>{formatCurrency(li.unitPrice)}</td>
                    <td style={{ textAlign: 'right' }} title={li.discountPercent2 || li.discountPercent3 ? [li.discountPercent, li.discountPercent2, li.discountPercent3].filter(Boolean).join(' % + ') + ' %' : undefined}>
                      {dto ? `${dto.toLocaleString('es-ES')} %` : '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>{li.taxRate}%</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatCurrency(li.subtotal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {muestraUnidades && (
          <p style={{ padding: '0 var(--space-4) var(--space-4)', margin: 0, fontSize: '12px', color: 'var(--text-muted)', textAlign: 'right' }}>
            Total: {conPlural(cajasTotales(documento.lineItems), ['caja', 'cajas'])}
            {' · '}
            <strong>{unidadesTotales(documento.lineItems)}</strong> {voz.contenido[1]}
          </p>
        )}
      </div>

      {/* Totales */}
      <div className="card">
        <div className="invoice-totals">
          <div className="invoice-totals-table">
            <div className="invoice-totals-row">
              <span className="label">Base imponible</span>
              <span className="value">{formatCurrency(documento.subtotal)}</span>
            </div>
            {descuentos.enLineas > 0.005 && (
              <div className="invoice-totals-row">
                <span className="label">
                  {descuentos.alPie > 0 ? 'Descuentos en líneas' : 'Descuentos'}
                </span>
                <span className="value" style={{ color: 'var(--color-danger)' }}>
                  -{formatCurrency(descuentos.enLineas)}
                </span>
              </div>
            )}
            {descuentos.alPie > 0 && (
              <div className="invoice-totals-row">
                <span className="label">
                  Descuento al pie
                  {` (${descuentos.porcentajesPie.join(' % + ')} %)`}
                </span>
                <span className="value" style={{ color: 'var(--color-danger)' }}>
                  -{formatCurrency(descuentos.alPie)}
                </span>
              </div>
            )}
            {documento.taxBreakdown.map(tb => (
              <div className="invoice-totals-row" key={tb.rate}>
                <span className="label">
                  {etiquetaImpuesto} {tb.rate}% (base {formatCurrency(tb.base)})
                </span>
                <span className="value">{formatCurrency(tb.amount)}</span>
              </div>
            ))}
            <div className="invoice-totals-row total">
              <span className="label">TOTAL</span>
              <span className="value">{formatCurrency(documento.total)}</span>
            </div>
            {retencion > 0 && (
              <>
                <div className="invoice-totals-row">
                  <span className="label">Retención ({documento.retencionPct}% de la base)</span>
                  <span className="value" style={{ color: 'var(--color-danger)' }}>-{formatCurrency(retencion)}</span>
                </div>
                <div className="invoice-totals-row" style={{ fontWeight: 700 }}>
                  <span className="label">A pagar</span>
                  <span className="value">{formatCurrency(totalAPagar(documento.total, documento.subtotal, documento.retencionPct))}</span>
                </div>
              </>
            )}

            {(tipo === 'factura' || tipo === 'rectificativa') && (
              <>
                <div className="invoice-totals-row" style={{ borderTop: '1px dashed var(--border-color)', marginTop: 'var(--space-2)', paddingTop: 'var(--space-2)' }}>
                  <span className="label" style={{ color: 'var(--text-muted)' }}>Cobrado / Pagado</span>
                  <span className="value" style={{ color: 'var(--text-muted)' }}>
                    {formatCurrency(documento.paidAmount || 0)}
                  </span>
                </div>
                <div className="invoice-totals-row" style={{ fontWeight: 700 }}>
                  <span className="label">Saldo Pendiente</span>
                  <span className="value" style={{ color: (documento.total - (documento.paidAmount || 0)) > 0.01 ? (esCompra ? 'var(--color-danger)' : 'var(--color-warning)') : 'var(--color-success)' }}>
                    {formatCurrency(Math.max(0, documento.total - (documento.paidAmount || 0)))}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
