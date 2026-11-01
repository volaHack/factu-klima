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
} from './storage';
import { actualizarContadorSerie, serieParaCliente } from './documentos';
import { avisoAlAnular, convertirDocumento, type LineaAprobada } from './flujoVenta';
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

/**
 * Anula un documento que no es una factura emitida (ésas se anulan desde
 * Facturas, con su motivo y la comunicación a Veri*Factu). Lo que impide
 * anularlo (un albarán ya facturado) se comprueba otra vez aquí, con los
 * documentos de ahora.
 */
export async function anularDocumento(id: string): Promise<Invoice> {
  const { doc, documentos } = await documentosDeAhora(id);
  const aviso = avisoAlAnular(doc, documentos);
  if (aviso?.bloquea) throw new Error(aviso.texto);
  return saveDocumento({ ...doc, status: InvoiceStatus.ANULADA, updatedAt: new Date().toISOString() });
}

/** Lo que se le enseña a quien va a anular: lo mismo que decide `anularDocumento`. */
export async function avisoAntesDeAnular(id: string): Promise<{ bloquea: boolean; texto: string } | null> {
  const { doc, documentos } = await documentosDeAhora(id);
  return avisoAlAnular(doc, documentos);
}
