/**
 * LA FACTURA RECTIFICATIVA
 *
 * Una factura emitida no se toca: se corrige con otra que diga qué corrige
 * y por qué. La rectificativa se hacía copiando la original entera y
 * poniendo las cantidades en negativo, y con eso se colaba casi todo lo que
 * no tenía que ir:
 *
 *   · LA FECHA DE LA ORIGINAL. La cadena antifraude no deja emitir con
 *     fecha anterior a la última emitida, así que en cuanto había otra
 *     factura posterior la rectificativa no se podía emitir nunca.
 *   · EL TIPO FISCAL DE LA ORIGINAL. Si era una simplificada (F2), la
 *     rectificativa salía registrada como F2 y no como R5: el servidor
 *     respeta el tipo que trae la factura.
 *   · LA HUELLA, EL QR Y LOS COBROS de la original, que se veían en el
 *     borrador de la rectificativa como si fueran suyos.
 *   · LOS IMPORTES DE LÍNEA EN POSITIVO con la cantidad en negativo: la
 *     línea impresa decía −5 unidades y +100 €.
 *   · Y nada impedía rectificar un borrador, una anulada o la misma
 *     factura dos veces.
 *
 * Se rectifica POR DIFERENCIAS («I» en Veri*Factu, que es lo que manda
 * `verifactu/mapeo.ts`): la rectificativa lleva lo que se resta, no la
 * factura corregida entera. Por sustitución («S») no se hace: el registro
 * tendría que llevar además el importe rectificado (ImporteRectificacion),
 * y eso no lo genera todavía el XML.
 */

import { InvoiceStatus, type CompanySettings, type Invoice, type InvoiceLineItem, type TipoFacturaFiscal } from './types';
import { generateInvoiceNumber } from './utils';
import { serieDeTipo } from './storage';
import { claveLinea, lineaRecalculada } from './compras';

export type TipoRectificativa = Extract<TipoFacturaFiscal, 'R1' | 'R2' | 'R3' | 'R4' | 'R5'>;

/** Los cinco tipos, dichos para quien no tiene por qué saberse la ley. */
export const TIPOS_RECTIFICATIVA: readonly { tipo: TipoRectificativa; nombre: string; cuando: string }[] = [
  { tipo: 'R1', nombre: 'R1 · Error o devolución', cuando: 'Un error en la factura, una devolución de mercancía, un descuento o rappel posterior, una operación que no se llegó a hacer.' },
  { tipo: 'R2', nombre: 'R2 · Concurso de acreedores', cuando: 'El cliente ha entrado en concurso y la deuda no se va a cobrar.' },
  { tipo: 'R3', nombre: 'R3 · Deuda incobrable', cuando: 'Crédito incobrable reclamado judicialmente o por requerimiento notarial.' },
  { tipo: 'R4', nombre: 'R4 · Otras causas', cuando: 'Cualquier otro motivo que no sea de los anteriores.' },
  { tipo: 'R5', nombre: 'R5 · De una simplificada', cuando: 'Rectifica un ticket o una factura simplificada.' },
];

/** Clave de `datosExtras`: la fecha de la factura rectificada, que pide el registro Veri*Factu. */
export const CLAVE_FECHA_RECTIFICADA = 'fechaFacturaRectificada';
export const CLAVE_MOTIVO_RECTIFICACION = 'motivoRectificacion';

const RECTIFICABLES: readonly InvoiceStatus[] = [
  InvoiceStatus.EMITIDA, InvoiceStatus.PENDIENTE, InvoiceStatus.PARCIAL, InvoiceStatus.PAGADA, InvoiceStatus.VENCIDA,
];

export interface OpcionesRectificativa {
  tipo?: TipoRectificativa;
  motivo?: string;
  /**
   * Cuánto se rectifica de cada línea de la original (id de línea →
   * unidades, con el signo de la línea o sin él). Sin esto, todo lo que
   * quede por rectificar.
   */
  cantidades?: Record<string, number>;
  /** Todos los documentos, para saber qué se ha rectificado ya. */
  docs?: readonly Invoice[];
  hoy?: Date;
}

/** Una línea se reconoce en sus rectificativas por artículo y precio. */
const claveRectificada = (l: InvoiceLineItem) =>
  `${claveLinea(l)}|${l.unitPrice}|${l.discountPercent || 0}|${l.discountPercent2 || 0}|${l.discountPercent3 || 0}`;

/** Es simplificada (ticket o F2): se rectifica con R5. */
const esSimplificada = (f: Pick<Invoice, 'posSessionId' | 'tipoFacturaFiscal'>) =>
  Boolean(f.posSessionId) || f.tipoFacturaFiscal === 'F2' || f.tipoFacturaFiscal === 'F3';

/** Las rectificativas vivas (no anuladas) de una factura. */
export function rectificativasDe(original: Pick<Invoice, 'id'>, docs: readonly Invoice[]): Invoice[] {
  return docs.filter(d => d.tipo === 'rectificativa' && d.documentoOrigenId === original.id && d.status !== InvoiceStatus.ANULADA);
}

/** Lo que queda por rectificar de cada línea, con el signo de la línea. */
export function lineasPorRectificar(original: Invoice, docs: readonly Invoice[]): { linea: InvoiceLineItem; queda: number }[] {
  const hecho = new Map<string, number>();
  for (const r of rectificativasDe(original, docs)) {
    for (const l of r.lineItems) hecho.set(claveRectificada(l), (hecho.get(claveRectificada(l)) ?? 0) + Number(l.quantity || 0));
  }
  return (original.lineItems ?? []).map(linea => {
    const q = Number(linea.quantity || 0);
    const k = claveRectificada(linea);
    // Lo rectificado va con el signo contrario: se suma hasta dejarla en cero.
    const aplicado = Math.sign(q) * Math.min(Math.abs(q), Math.max(0, -Math.sign(q) * (hecho.get(k) ?? 0)));
    hecho.set(k, (hecho.get(k) ?? 0) + aplicado);
    return { linea, queda: Math.round((q - aplicado) * 1000) / 1000 };
  });
}

/** Por qué no se puede rectificar esta factura ahora (o null si se puede). */
export function porQueNoSeRectifica(original: Invoice, docs: readonly Invoice[] = []): string | null {
  if (original.tipo === 'rectificativa') return 'Una rectificativa no se rectifica: haz otra rectificativa de la factura original.';
  if ((original.tipo ?? 'factura') !== 'factura') return 'Solo se rectifican facturas.';
  if (original.status === InvoiceStatus.ANULADA) return `La factura ${original.number} está anulada: no hay nada que rectificar.`;
  if (!RECTIFICABLES.includes(original.status)) {
    return `La factura ${original.number} está en borrador: corrígela editándola, no hace falta rectificarla.`;
  }
  const vivas = rectificativasDe(original, docs);
  const borrador = vivas.find(r => r.status === InvoiceStatus.BORRADOR);
  if (borrador) return `Ya hay una rectificativa en borrador (${borrador.number}): emítela o elimínala antes de hacer otra.`;
  if (vivas.length && lineasPorRectificar(original, docs).every(l => l.queda === 0)) {
    return `La factura ${original.number} ya está rectificada entera (${vivas.map(r => r.number).join(', ')}).`;
  }
  return null;
}

const fechaCorta = (iso: string) => iso.split('-').reverse().join('/');

/** La rectificativa por diferencias de una factura, en borrador. La original no se toca. */
export function construirRectificativa(original: Invoice, settings: CompanySettings, opts: OpcionesRectificativa = {}): Invoice {
  const docs = opts.docs ?? [];
  const motivo = porQueNoSeRectifica(original, docs);
  if (motivo) throw new Error(motivo);

  const simplificada = esSimplificada(original);
  if (opts.tipo === 'R5' && !simplificada) throw new Error('R5 es solo para rectificar tickets y facturas simplificadas: elige R1 a R4.');
  const tipo: TipoRectificativa = simplificada ? 'R5' : (opts.tipo ?? 'R1');

  const lineas: InvoiceLineItem[] = [];
  for (const { linea, queda } of lineasPorRectificar(original, docs)) {
    const pedida = opts.cantidades ? opts.cantidades[linea.id] : queda;
    if (!pedida) continue;
    const cantidad = Math.sign(queda || linea.quantity) * Math.abs(pedida);
    if (Math.abs(cantidad) > Math.abs(queda) + 1e-9) {
      throw new Error(`De «${linea.productName}» quedan ${Math.abs(queda)} por rectificar, no ${Math.abs(pedida)}.`);
    }
    lineas.push(lineaRecalculada({ ...linea, id: crypto.randomUUID(), quantity: -cantidad, ...(linea.cajas != null ? { cajas: 0 } : {}) }));
  }
  if (lineas.length === 0) throw new Error('Elige al menos una línea con algo que rectificar.');

  const sentido = original.sentido ?? 'venta';
  const { serie, nextNumber } = serieDeTipo(settings, 'rectificativa', sentido);
  const hoy = opts.hoy ?? new Date();
  const fecha = hoy.toISOString().slice(0, 10);
  const porque = opts.motivo?.trim();

  return {
    ...original,
    id: crypto.randomUUID(),
    tipo: 'rectificativa',
    number: generateInvoiceNumber(serie, nextNumber, hoy.getFullYear()),
    series: serie,
    status: InvoiceStatus.BORRADOR,
    issueDate: fecha,
    dueDate: fecha,
    tipoFacturaFiscal: tipo,
    documentoOrigenId: original.id,
    documentoOrigenNumber: original.number,
    lineItems: lineas,
    notes: `Rectifica la factura ${original.number} del ${fechaCorta(original.issueDate)}.${porque ? ` Motivo: ${porque}.` : ''}`,
    datosExtras: {
      ...(original.datosExtras ?? {}),
      [CLAVE_FECHA_RECTIFICADA]: original.issueDate,
      ...(porque ? { [CLAVE_MOTIVO_RECTIFICACION]: porque } : {}),
    },
    // Lo que es de la original y no de la rectificativa.
    posSessionId: undefined,
    numberTemporary: false,
    paidDate: undefined,
    paidAt: undefined,
    paidAmount: 0,
    paymentRecordIds: [],
    verifactu: undefined,
    cancelReason: undefined,
    cancelledAt: undefined,
    siiStatus: undefined,
    stripePaymentUrl: undefined,
    stripeSessionId: undefined,
    createdAt: hoy.toISOString(),
    updatedAt: hoy.toISOString(),
  };
}
