/**
 * LO QUE HACEN LOS BOTONES DE LA FICHA DEL DOCUMENTO
 *
 * «Pasar a pedido», «Convertir en albarán», «Facturar» y «Anular», con la
 * lógica de flujoVenta.ts y las vías de guardado de siempre (con y sin
 * conexión: lo que no sube se queda en la cola de sincronización).
 *
 * Cada acción vuelve a leer los documentos guardados en este equipo justo
 * antes de decidir, no se fía de los que la pantalla cargó al abrirse: un
 * segundo clic, una pestaña vieja o volver atrás con el navegador ven así
 * lo que ya salió del documento y se paran. Y mientras una conversión de un
 * documento está en marcha, otra del mismo no empieza (el doble clic que
 * llega antes de que el botón se desactive).
 *
 * Nada de esto emite una factura: la factura sale en borrador y se emite
 * desde Facturas, donde están las comprobaciones de antes de sellar y la
 * confirmación del servidor.
 */

import {
  getInvoices, getInvoiceById, getCompanySettings, saveDocumento, getApprovalByInvoiceId, getApprovalItems,
  soltarAlbaranesDeFactura, recibirPedidoCompra, facturarAlbaranesCompra,
} from './storage';
import { actualizarContadorSerie, isFactura, serieParaCliente } from './documentos';
import { avisoAlAnular, convertirDocumento, type LineaAprobada } from './flujoVenta';
import { conDatosDelProveedor, convertirCompra, problemasFacturaRecibida } from './compras';
import { porQueNoSeAnula } from './anulacion';
import { InvoiceStatus, type Invoice, type TipoDocumento } from './types';

const enCurso = new Set<string>();

/** Los documentos de ahora, con el que se mira dentro aunque aún no estuviera en la lista. */
async function documentosDeAhora(id: string): Promise<{ doc: Invoice; documentos: Invoice[] }> {
  const [documentos, doc] = await Promise.all([getInvoices().catch(() => [] as Invoice[]), getInvoiceById(id)]);
  if (!doc) throw new Error('No se encuentra el documento. Vuelve a cargar la pantalla.');
  return { doc, documentos: documentos.some(d => d.id === doc.id) ? documentos : [...documentos, doc] };
}

/** Lo que contestó el cliente a un pedido aprobado a medias (sólo con conexión). */
async function aprobacionDe(pedido: Invoice): Promise<LineaAprobada[] | null> {
  if (pedido.status !== InvoiceStatus.APROBADO_PARCIAL || !navigator.onLine) return null;
  const aprobacion = await getApprovalByInvoiceId(pedido.id).catch(() => null);
  if (!aprobacion) return null;
  const items = await getApprovalItems(aprobacion.id).catch(() => []);
  return items.length ? items : null;
}

/** Convierte un documento en otro y lo guarda. Devuelve el documento nuevo, en borrador. */
export async function convertirYGuardar(id: string, destino: TipoDocumento): Promise<Invoice> {
  if (enCurso.has(id)) throw new Error('Ya se está convirtiendo este documento.');
  enCurso.add(id);
  try {
    const [{ doc, documentos }, settings] = await Promise.all([documentosDeAhora(id), getCompanySettings()]);
    const sentido = doc.sentido ?? 'venta';

    // En compras, la cadena es la de compras.ts. La recepción de un pedido
    // propone sólo lo que falta por llegar (la segunda recepción ya no
    // vuelve a pedir todo); la factura recibida necesita antes el número y
    // las fechas del papel del proveedor: va por registrarFacturaProveedor.
    if (sentido === 'compra') {
      if (doc.tipo === 'pedido' && destino === 'albaran') return await recibirPedidoCompra(doc.id);
      if (destino === 'factura') throw new Error('Para registrar la factura hacen falta el número y la fecha de la factura del proveedor.');
    }
    const [aprobacion, serie] = await Promise.all([
      aprobacionDe(doc),
      serieParaCliente(doc.clientId, destino, sentido).catch(() => null),
    ]);
    const nuevo = convertirDocumento(doc, destino, documentos, settings, { aprobacion, serie });
    const guardado = await saveDocumento(nuevo);
    await actualizarContadorSerie(settings, `${destino}_${sentido}`, guardado.number);
    // El albarán facturado queda «facturado», como los de la pantalla
    // Albaranes: las listas y los informes lo dejan de contar como pendiente
    // de facturar. El stock no cambia (la base de datos lo trata igual que
    // expedido) y la factura, que cuelga de él, no lo vuelve a mover.
    if (doc.tipo === 'albaran' && destino === 'factura') {
      await saveDocumento({ ...doc, status: InvoiceStatus.FACTURADO, updatedAt: new Date().toISOString() });
    }
    return guardado;
  } finally {
    enCurso.delete(id);
  }
}

export interface DatosFacturaProveedor {
  /** El número que el proveedor puso a su factura. */
  numero?: string;
  /** La fecha de su factura. */
  fechaExpedicion?: string;
  /** Cuándo la registramos: decide el trimestre en que se deduce el impuesto. */
  fechaRegistro?: string;
}

/**
 * La factura del proveedor de un albarán recibido o de un pedido de compra
 * (sin albarán: lo que quede por llegar), con su número y sus fechas. Queda
 * en borrador para repasarla contra el papel. Una factura ya registrada con
 * el mismo número del mismo proveedor no se registra otra vez.
 */
export async function registrarFacturaProveedor(id: string, datos: DatosFacturaProveedor): Promise<Invoice> {
  if (enCurso.has(id)) throw new Error('Ya se está registrando esta factura.');
  enCurso.add(id);
  try {
    const [{ doc, documentos }, settings] = await Promise.all([documentosDeAhora(id), getCompanySettings()]);
    if (doc.sentido !== 'compra') throw new Error('Sólo las compras llevan la factura del proveedor.');
    if (doc.tipo === 'albaran') return await facturarAlbaranesCompra([doc.id], datos);
    const factura = conDatosDelProveedor(convertirCompra(doc, 'factura', settings, documentos), datos);
    const error = problemasFacturaRecibida(factura, documentos).find(p => p.gravedad === 'error');
    if (error) throw new Error(error.texto);
    const guardada = await saveDocumento(factura);
    await actualizarContadorSerie(settings, 'factura_compra', guardada.number);
    return guardada;
  } finally {
    enCurso.delete(id);
  }
}

/**
 * Lo que impide anular un documento: lo de la venta (flujoVenta: un
 * albarán facturado) y lo de la compra y las rectificativas (anulacion.ts:
 * un pedido recibido entero, una factura con rectificativa).
 */
function antesDeAnular(doc: Invoice, documentos: readonly Invoice[]): { bloquea: boolean; texto: string } | null {
  const impide = porQueNoSeAnula(doc, documentos);
  if (impide) return { bloquea: true, texto: impide };
  return avisoAlAnular(doc, documentos);
}

/**
 * Anula un documento que no es una factura emitida de venta (ésas se
 * anulan desde Facturas, con su motivo y la comunicación a Veri*Factu).
 * Siempre con motivo, que queda guardado en el documento. Lo que impide
 * anularlo se comprueba otra vez aquí, con los documentos de ahora.
 */
export async function anularDocumento(id: string, motivo: string): Promise<Invoice> {
  const razon = (motivo ?? '').trim();
  if (!razon) throw new Error('Indica el motivo de la anulación: queda guardado en el documento.');
  const { doc, documentos } = await documentosDeAhora(id);
  const aviso = antesDeAnular(doc, documentos);
  if (aviso?.bloquea) throw new Error(aviso.texto);
  // saveDocumento con ANULADA delega en el anularDocumento de storage, que
  // guarda el motivo y devuelve a «recibido» los albaranes de una factura de compra.
  const anulado = await saveDocumento({ ...doc, status: InvoiceStatus.ANULADA, cancelReason: razon, updatedAt: new Date().toISOString() });
  // Una factura que recogía albaranes los suelta: la entrega se hizo y
  // hay que poder facturarla otra vez (igual que al anular desde Facturas).
  if (isFactura(doc)) {
    await soltarAlbaranesDeFactura(doc.id).catch(err => console.warn('[albaranes] No se pudieron soltar los albaranes', err));
  }
  return anulado;
}

/** Lo que se le enseña a quien va a anular: lo mismo que decide `anularDocumento`. */
export async function avisoAntesDeAnular(id: string): Promise<{ bloquea: boolean; texto: string } | null> {
  const { doc, documentos } = await documentosDeAhora(id);
  return antesDeAnular(doc, documentos);
}
