/**
 * LA CADENA DE COMPRA: PEDIDO → RECEPCIÓN (ALBARÁN) → FACTURA RECIBIDA
 *
 * Se convertía con la misma función que la venta, y en compras eso tenía
 * tres consecuencias que no se veían en pantalla:
 *
 *   · LA FACTURA APUNTABA AL PEDIDO, NO AL ALBARÁN. La conversión copiaba
 *     el origen «de toda la cadena», así que la factura de un albarán que
 *     venía de un pedido decía venir del pedido. La base de datos decide si
 *     una factura de compra mete género mirando si su origen es un albarán
 *     (migración 074): al no verlo, la factura volvía a sumar al stock lo
 *     que ya había sumado el albarán. Cada compra completa entraba dos
 *     veces y el precio medio se recalculaba con la segunda entrada.
 *   · LO PENDIENTE DE RECIBIR SALÍA DE MENOS. Con el albarán y la factura
 *     colgando los dos del pedido, lo servido se contaba dos veces: un
 *     pedido de 10 recibido a medias (4) y facturado decía que faltaban 2.
 *   · SE PODÍA FACTURAR UN ALBARÁN SIN RECIBIR. La factura que sale de un
 *     albarán no mueve stock (lo mueve el albarán al recibirse); facturar un
 *     albarán en borrador dejaba la compra pagada y el género sin entrar.
 *
 * Aquí cada documento cuelga del inmediatamente anterior, la recepción de
 * un pedido propone solo lo que falta por llegar y un albarán se factura
 * una vez, después de recibirlo.
 *
 * LOS DATOS DE LA FACTURA DEL PROVEEDOR
 * La factura recibida lleva NUESTRO número (el de la serie de compras, que
 * hace de número de registro) pero el libro de facturas recibidas pide el
 * SUYO, el que figura en su papel, y la fecha en que se registró, que es la
 * que decide en qué trimestre se deduce el impuesto. No hay columnas para
 * eso (ver el informe: migración propuesta), así que van en `datosExtras`
 * con claves propias que no chocan con los campos de plantilla (`custom_N`).
 */

import { InvoiceStatus, type CompanySettings, type Invoice, type InvoiceLineItem, type TipoDocumento } from './types';
import { calculateLineSubtotal, calculateLineTax, generateInvoiceNumber } from './utils';
import { serieDeTipo } from './storage';

/** Lo que no cuenta como servido ni como documento vivo. */
const MUERTOS: readonly InvoiceStatus[] = [InvoiceStatus.ANULADA, InvoiceStatus.RECHAZADO];

/** Claves de `datosExtras` de una factura recibida. */
export const CLAVE_NUMERO_PROVEEDOR = 'numeroFacturaProveedor';
export const CLAVE_FECHA_REGISTRO = 'fechaRegistro';

const hoyIso = (hoy: Date) => hoy.toISOString().slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Cómo se cruza una línea con las de otros documentos: por artículo y, sin artículo, por descripción. */
export const claveLinea = (l: Pick<InvoiceLineItem, 'productId' | 'productName'>) =>
  l.productId ? `id:${l.productId}` : `nombre:${(l.productName || '').trim().toLowerCase()}`;

/** Los documentos vivos que salieron directamente de este. */
export function derivadosDe(id: string, docs: readonly Invoice[]): Invoice[] {
  return docs.filter(d => d.id !== id && d.documentoOrigenId === id && !MUERTOS.includes(d.status));
}

/** Lo ya recibido (o facturado sin albarán) de cada línea de un pedido. */
export function recibidoDePedido(pedidoId: string, docs: readonly Invoice[]): Map<string, number> {
  const recibido = new Map<string, number>();
  for (const d of derivadosDe(pedidoId, docs)) {
    if (d.tipo !== 'albaran' && d.tipo !== 'factura') continue;
    for (const l of d.lineItems ?? []) {
      const k = claveLinea(l);
      recibido.set(k, (recibido.get(k) ?? 0) + Number(l.quantity || 0));
    }
  }
  return recibido;
}

/**
 * Las líneas de un pedido con lo que todavía falta por llegar. Si el mismo
 * artículo está en dos líneas, lo recibido se reparte en orden.
 */
export function pendienteDePedido(pedido: Invoice, docs: readonly Invoice[]): InvoiceLineItem[] {
  const queda = recibidoDePedido(pedido.id, docs);
  const salida: InvoiceLineItem[] = [];
  for (const l of pedido.lineItems ?? []) {
    const k = claveLinea(l);
    const pedida = Number(l.quantity || 0);
    const yaLlegado = Math.min(Math.max(queda.get(k) ?? 0, 0), pedida);
    queda.set(k, (queda.get(k) ?? 0) - yaLlegado);
    const falta = Math.round((pedida - yaLlegado) * 1000) / 1000;
    if (falta > 0) salida.push({ ...l, quantity: falta, ...(l.cajas != null ? { cajas: cajasDe(l, falta) } : {}) });
  }
  return salida;
}

/** Las cajas completas que caben en unas unidades (ver cajas.ts: la cantidad son las UDES.). */
function cajasDe(l: Pick<InvoiceLineItem, 'unitsPerPackage'>, unidades: number): number {
  const porCaja = Number(l.unitsPerPackage || 0);
  return porCaja > 0 ? Math.floor(unidades / porCaja) : 0;
}

/** Recalcula los importes de una línea, que son los que se guardan y se imprimen. */
export function lineaRecalculada(l: InvoiceLineItem): InvoiceLineItem {
  const subtotal = calculateLineSubtotal(l.quantity, l.unitPrice, l.discountPercent, l.discountPercent2, l.discountPercent3);
  const taxAmount = calculateLineTax(subtotal, l.taxRate);
  return { ...l, subtotal, taxAmount, total: r2(subtotal + taxAmount) };
}

/** Por qué no se puede pasar este documento de compra al siguiente paso (o null si se puede). */
export function porQueNoSeConvierte(
  original: Invoice,
  nuevoTipo: TipoDocumento,
  docs?: readonly Invoice[],
): string | null {
  const nombre = `${original.tipo === 'albaran' ? 'El albarán' : original.tipo === 'pedido' ? 'El pedido' : 'El documento'} ${original.number}`;
  if (MUERTOS.includes(original.status)) return `${nombre} está ${original.status === InvoiceStatus.ANULADA ? 'anulado' : 'rechazado'}: no se puede pasar a otro documento.`;
  if (original.tipo === 'albaran' && nuevoTipo === 'factura') {
    if (original.status === InvoiceStatus.BORRADOR) {
      return `${nombre} todavía no se ha recibido. Recíbelo primero: la factura que sale de un albarán no mete el género en el almacén, lo mete el albarán al recibirse.`;
    }
    if (original.status === InvoiceStatus.FACTURADO) return `${nombre} ya está facturado.`;
    const factura = docs && derivadosDe(original.id, docs).find(d => d.tipo === 'factura');
    if (factura) return `${nombre} ya está facturado en ${factura.number}.`;
  }
  if (original.tipo === 'pedido' && docs && pendienteDePedido(original, docs).length === 0) {
    return `${nombre} ya se ha recibido entero: no queda nada pendiente.`;
  }
  return null;
}

/**
 * El documento siguiente de la cadena de compra, en borrador.
 *
 * Con `docs` (todos los documentos), la recepción de un pedido lleva solo lo
 * que falta por llegar y se comprueba que el albarán no esté ya facturado.
 * Sin ellos copia todas las líneas, como hacía hasta ahora.
 */
export function convertirCompra(
  original: Invoice,
  nuevoTipo: TipoDocumento,
  settings: CompanySettings,
  docs?: readonly Invoice[],
  hoy = new Date(),
): Invoice {
  const motivo = porQueNoSeConvierte(original, nuevoTipo, docs);
  if (motivo) throw new Error(motivo);

  const { serie, nextNumber } = serieDeTipo(settings, nuevoTipo, 'compra');
  const fecha = hoyIso(hoy);
  const ahora = hoy.toISOString();
  const lineas = original.tipo === 'pedido' && docs ? pendienteDePedido(original, docs) : (original.lineItems ?? []);
  // Los días de pago que tenía el documento se mantienen desde hoy.
  const dias = Math.max(0, Math.round((Date.parse(original.dueDate) - Date.parse(original.issueDate)) / 86_400_000) || 0);
  const vence = new Date(hoy.getTime() + dias * 86_400_000).toISOString().slice(0, 10);
  const { [CLAVE_NUMERO_PROVEEDOR]: _num, [CLAVE_FECHA_REGISTRO]: _fecha, ...extras } = original.datosExtras ?? {};
  void _num; void _fecha;

  return {
    ...original,
    id: crypto.randomUUID(),
    tipo: nuevoTipo,
    sentido: 'compra',
    series: serie,
    number: generateInvoiceNumber(serie, nextNumber, hoy.getFullYear()),
    status: InvoiceStatus.BORRADOR,
    issueDate: fecha,
    dueDate: vence,
    // Del inmediatamente anterior, no del primero de la cadena: es lo que
    // dice si la factura viene de un albarán (y no vuelve a meter stock).
    documentoOrigenId: original.id,
    documentoOrigenNumber: original.number,
    lineItems: lineas.map(l => lineaRecalculada({ ...l, id: crypto.randomUUID() })),
    datosExtras: extras,
    paidDate: undefined,
    paidAt: undefined,
    paidAmount: 0,
    paymentRecordIds: [],
    cancelReason: undefined,
    cancelledAt: undefined,
    verifactu: undefined,
    tipoFacturaFiscal: undefined,
    siiStatus: undefined,
    stripePaymentUrl: undefined,
    stripeSessionId: undefined,
    numberTemporary: false,
    posSessionId: undefined,
    createdAt: ahora,
    updatedAt: ahora,
  };
}

/**
 * Una factura recibida que agrupa varios albaranes de un mismo proveedor (la
 * factura mensual del distribuidor, que es lo corriente). Cuelga del primer
 * albarán —así la base de datos sabe que el género ya entró— y nombra los
 * demás en el origen y en las observaciones.
 */
export function facturaDeAlbaranesCompra(
  albaranes: readonly Invoice[],
  settings: CompanySettings,
  docs: readonly Invoice[],
  hoy = new Date(),
): Invoice {
  if (albaranes.length === 0) throw new Error('Elige al menos un albarán de compra.');
  if (albaranes.some(a => a.tipo !== 'albaran' || a.sentido !== 'compra')) throw new Error('Solo se facturan juntos albaranes de compra.');
  const proveedor = (a: Invoice) => a.clientId || a.clientNif || a.clientName;
  if (new Set(albaranes.map(proveedor)).size > 1) throw new Error('Los albaranes son de proveedores distintos: cada proveedor manda su factura.');
  for (const a of albaranes) {
    const motivo = porQueNoSeConvierte(a, 'factura', docs);
    if (motivo) throw new Error(motivo);
  }
  const [primero, ...resto] = albaranes;
  const factura = convertirCompra(primero, 'factura', settings, docs, hoy);
  if (resto.length === 0) return factura;
  const numeros = albaranes.map(a => a.number);
  return {
    ...factura,
    documentoOrigenNumber: numeros.join(', '),
    lineItems: albaranes.flatMap(a => a.lineItems.map(l => lineaRecalculada({ ...l, id: crypto.randomUUID() }))),
    notes: [`Albaranes: ${numeros.join(', ')}.`, primero.notes].filter(Boolean).join('\n'),
  };
}

/**
 * Los albaranes de compra que agrupa una factura recibida: el de su origen
 * y los que nombra en `documentoOrigenNumber` (ver facturaDeAlbaranesCompra).
 */
export function albaranesDeFacturaCompra(factura: Invoice, docs: readonly Invoice[]): Invoice[] {
  if (factura.sentido !== 'compra' || factura.tipo !== 'factura' || !factura.documentoOrigenId) return [];
  const numeros = new Set((factura.documentoOrigenNumber ?? '').split(',').map(n => n.trim()).filter(Boolean));
  const origen = docs.find(d => d.id === factura.documentoOrigenId);
  if (!origen || origen.tipo !== 'albaran') return [];
  return docs.filter(d => d.tipo === 'albaran' && d.sentido === 'compra'
    && (d.id === factura.documentoOrigenId || numeros.has(d.number)));
}

// ============================================================
// LA FACTURA DEL PROVEEDOR
// ============================================================

/** El número que el proveedor puso a su factura (no el nuestro). */
export function numeroDelProveedor(f: Pick<Invoice, 'datosExtras'>): string {
  return (f.datosExtras?.[CLAVE_NUMERO_PROVEEDOR] ?? '').trim();
}

/**
 * La fecha en que se registró la factura recibida. Es la que decide el
 * trimestre en que se deduce el impuesto: el soportado se deduce cuando se
 * tiene la factura, no antes, aunque el proveedor la fechara el mes
 * anterior. Sin fecha de registro, la de la factura.
 */
export function fechaDeRegistro(f: Pick<Invoice, 'datosExtras' | 'issueDate'>): string {
  const registro = (f.datosExtras?.[CLAVE_FECHA_REGISTRO] ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(registro) ? registro : f.issueDate;
}

/** Los datos de la factura del proveedor sobre una factura recibida. */
export function conDatosDelProveedor(
  f: Invoice,
  datos: { numero?: string; fechaExpedicion?: string; fechaRegistro?: string },
): Invoice {
  const extras = { ...(f.datosExtras ?? {}) };
  if (datos.numero !== undefined) extras[CLAVE_NUMERO_PROVEEDOR] = datos.numero.trim();
  if (datos.fechaRegistro !== undefined) extras[CLAVE_FECHA_REGISTRO] = datos.fechaRegistro;
  return { ...f, issueDate: datos.fechaExpedicion || f.issueDate, datosExtras: extras };
}

export interface ProblemaRecibida { gravedad: 'error' | 'aviso'; texto: string }

/** Lo que falta o no cuadra en una factura recibida antes de darla por registrada. */
export function problemasFacturaRecibida(f: Invoice, docs: readonly Invoice[]): ProblemaRecibida[] {
  if (f.sentido !== 'compra' || (f.tipo !== 'factura' && f.tipo !== 'rectificativa')) return [];
  const problemas: ProblemaRecibida[] = [];
  const numero = numeroDelProveedor(f);
  if (!numero) {
    problemas.push({ gravedad: 'aviso', texto: 'Falta el número de la factura del proveedor: el libro de facturas recibidas lo pide.' });
  } else {
    const nif = (f.clientNif || '').trim().toUpperCase();
    const repetida = docs.find(d => d.id !== f.id && d.sentido === 'compra' && d.tipo === f.tipo
      && !MUERTOS.includes(d.status) && numeroDelProveedor(d).toUpperCase() === numero.toUpperCase()
      && ((d.clientId && d.clientId === f.clientId) || (nif && (d.clientNif || '').trim().toUpperCase() === nif)));
    if (repetida) {
      problemas.push({ gravedad: 'error', texto: `La factura ${numero} de ${f.clientName} ya está registrada (${repetida.number}).` });
    }
  }
  if (fechaDeRegistro(f) < f.issueDate) {
    problemas.push({ gravedad: 'error', texto: 'La fecha de registro no puede ser anterior a la de la factura del proveedor.' });
  }
  return problemas;
}
