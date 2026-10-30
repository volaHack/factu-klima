/**
 * EL REPASO DE ASESOR ANTES DE EMITIR
 *
 * Una factura emitida ya no se toca: lo que salga mal se arregla con una
 * rectificativa, y eso es papeleo para quien la hace y para su cliente.
 * `repasarAntesDeEmitir` (validation/antesDeEmitir.ts) ya para lo que la
 * ley no deja emitir. Esto va un paso antes y mira lo que la ley sí deja
 * pero casi siempre es un despiste: lo que un asesor con experiencia vería
 * de un vistazo antes de firmar.
 *
 *   · líneas a 0 € o con cantidad 0;
 *   · un NIF que no cuadra (la letra o el dígito de control);
 *   · un cliente sin dirección;
 *   · un vencimiento anterior a la fecha de la factura;
 *   · otra factura al mismo cliente por el mismo importe en la última
 *     semana (la factura hecha dos veces);
 *   · un descuento muy alto en una línea o al pie;
 *   · un total muy por encima de lo que suele facturarse a ese cliente.
 *
 * Nada de esto impide emitir: se enseña en una lista y se elige entre
 * «Revisar» o «Emitir igualmente». Es lógica pura, sin pantalla ni red.
 */

import { InvoiceStatus, type Invoice, type InvoiceLineItem } from './types';
import { isFactura } from './documentos';
import { detectNifType, isValidNif } from './validation/nif';
import { esClienteEspanol, normalizarNif } from './validation/identidad';
import { diasEntre } from './vencimiento';

/** Desde aquí (combinado, en %) un descuento de línea se pregunta. */
export const DESCUENTO_LINEA_ALTO = 50;
/** Y desde aquí el del pie, que se aplica a toda la factura. */
export const DESCUENTO_PIE_ALTO = 30;
/** Días hacia atrás en los que se busca la misma factura. */
export const DIAS_DUPLICADO = 7;
/** Cuántas veces lo habitual del cliente se considera «muy por encima». */
export const VECES_HABITUAL = 3;
/** Facturas anteriores que hacen falta para saber qué es lo habitual. */
export const MINIMO_HISTORIAL = 3;

export type IdRevision =
  | 'precio-cero' | 'cantidad-cero' | 'nif' | 'direccion' | 'vencimiento'
  | 'duplicada' | 'descuento-linea' | 'descuento-pie' | 'total-alto';

export interface PuntoRevision {
  id: IdRevision;
  titulo: string;
  detalle: string;
}

export type LineaARevisar = Pick<InvoiceLineItem, 'productId' | 'quantity' | 'unitPrice'>
  & Partial<Pick<InvoiceLineItem, 'productName' | 'discountPercent' | 'discountPercent2' | 'discountPercent3'>>;

export interface FacturaARevisar {
  lineas: readonly LineaARevisar[];
  clienteId?: string | null;
  clienteNombre?: string;
  clienteNif?: string;
  /** La dirección de la ficha (o la escrita a mano en un cliente ocasional). */
  clienteDireccion?: string;
  clientePais?: string | null;
  intracomunitaria?: boolean;
  /** Sin datos del cliente (un ticket, una simplificada): no se le pide dirección. */
  simplificada?: boolean;
  fechaEmision: string;
  fechaVencimiento: string;
  total: number;
  descuentosPie?: readonly number[];
}

const eur = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
const pct = (n: number) => `${n.toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`;
const cascada = (ds: readonly (number | undefined)[]) => 100 * (1 - ds.reduce<number>((f, d) => f * (1 - (d || 0) / 100), 1));
const nombreLinea = (l: { productName?: string }, i: number) => `la línea ${i + 1}${l.productName ? ` (${l.productName})` : ''}`;
const lista = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}`);

function mediana(xs: number[]): number {
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

/** Las facturas de venta anteriores de ese cliente que cuentan (ni anuladas ni rectificativas). */
function facturasDelCliente(anteriores: readonly Invoice[], clienteId: string): Invoice[] {
  return anteriores.filter(d => d.clientId === clienteId && isFactura(d) && d.tipo !== 'rectificativa'
    && d.status !== InvoiceStatus.ANULADA && (Number(d.total) || 0) > 0);
}

/**
 * Lo que conviene mirar antes de emitir. Lista vacía: todo en orden.
 * `anteriores` son los documentos que ya hay (para el duplicado y lo habitual).
 */
export function revisarAntesDeEmitir(f: FacturaARevisar, anteriores: readonly Invoice[] = []): PuntoRevision[] {
  const puntos: PuntoRevision[] = [];
  const lineas = f.lineas.filter(l => l.productId || l.productName?.trim());

  const aCero = lineas.flatMap((l, i) => (l.unitPrice === 0 && Number(l.quantity) !== 0 ? [nombreLinea(l, i)] : []));
  if (aCero.length) {
    puntos.push({ id: 'precio-cero', titulo: aCero.length === 1 ? 'Una línea va a 0 €' : `${aCero.length} líneas van a 0 €`,
      detalle: `Revisa ${lista(aCero)}. Si es un regalo o una muestra, puedes dejarlo así.` });
  }
  const sinCantidad = lineas.flatMap((l, i) => (!Number(l.quantity) ? [nombreLinea(l, i)] : []));
  if (sinCantidad.length) {
    puntos.push({ id: 'cantidad-cero', titulo: sinCantidad.length === 1 ? 'Una línea no tiene cantidad' : `${sinCantidad.length} líneas no tienen cantidad`,
      detalle: `${lista(sinCantidad).replace(/^l/, 'L')} ${sinCantidad.length === 1 ? 'sale' : 'salen'} con 0 unidades y no suma${sinCantidad.length === 1 ? '' : 'n'} nada.` });
  }

  const nif = normalizarNif(f.clienteNif);
  if (nif && !f.intracomunitaria && esClienteEspanol(f.clientePais) && !isValidNif(nif)) {
    const tipo = detectNifType(nif);
    puntos.push({ id: 'nif', titulo: 'El NIF del cliente no cuadra',
      detalle: tipo === 'UNKNOWN'
        ? `«${nif}» no tiene forma de NIF, NIE ni CIF. Corrígelo en la ficha del cliente.`
        : `«${nif}» tiene forma de ${tipo}, pero la letra o el dígito de control no corresponden. Suele ser una cifra cambiada.` });
  }

  if (!f.simplificada && !(f.clienteDireccion ?? '').replace(/[\s,]/g, '')) {
    puntos.push({ id: 'direccion', titulo: 'El cliente no tiene dirección',
      detalle: 'Una factura completa tiene que llevar el domicilio del cliente. Ponlo en su ficha y saldrá en esta y en las siguientes.' });
  }

  const plazo = diasEntre(f.fechaEmision, f.fechaVencimiento);
  if (plazo != null && plazo < 0) {
    puntos.push({ id: 'vencimiento', titulo: 'Vence antes de emitirse',
      detalle: `El vencimiento es ${-plazo === 1 ? 'un día' : `${-plazo} días`} anterior a la fecha de la factura. Elige «Contado» o el plazo que toque.` });
  }

  if (f.clienteId && f.total > 0) {
    const iguales = facturasDelCliente(anteriores, f.clienteId).filter(d => {
      const dias = diasEntre(d.issueDate, f.fechaEmision);
      return dias != null && dias >= 0 && dias <= DIAS_DUPLICADO && Math.abs((Number(d.total) || 0) - f.total) < 0.005;
    });
    if (iguales.length) {
      const d = iguales[0];
      const como = d.status === InvoiceStatus.BORRADOR ? 'el borrador' : 'la factura';
      puntos.push({ id: 'duplicada', titulo: '¿La has hecho ya?',
        detalle: `${como.charAt(0).toUpperCase()}${como.slice(1)} ${d.number} del ${d.issueDate.split('-').reverse().join('/')} es a ${f.clienteNombre || 'este cliente'} por el mismo importe (${eur(f.total)}).` });
    }
  }

  const conDtoAlto = lineas.flatMap((l, i) => {
    const d = cascada([l.discountPercent, l.discountPercent2, l.discountPercent3]);
    return d >= DESCUENTO_LINEA_ALTO && l.unitPrice > 0 ? [`${nombreLinea(l, i)}, un ${pct(d)}`] : [];
  });
  if (conDtoAlto.length) {
    puntos.push({ id: 'descuento-linea', titulo: 'Descuento muy alto',
      detalle: `${lista(conDtoAlto).replace(/^l/, 'L')}. Comprueba que no sobra una cifra (5 % y no 50 %).` });
  }
  const pie = cascada(f.descuentosPie ?? []);
  if (pie >= DESCUENTO_PIE_ALTO) {
    puntos.push({ id: 'descuento-pie', titulo: 'Descuento al pie muy alto',
      detalle: `Toda la factura lleva un ${pct(pie)} de descuento. Si es correcto, adelante.` });
  }

  if (f.clienteId && f.total > 0) {
    // Las doce últimas emitidas: lo de hace tres años ya no dice lo que es normal.
    const previas = facturasDelCliente(anteriores, f.clienteId)
      .filter(d => d.status !== InvoiceStatus.BORRADOR)
      .sort((a, b) => (b.issueDate ?? '').localeCompare(a.issueDate ?? ''))
      .slice(0, 12)
      .map(d => Number(d.total));
    if (previas.length >= MINIMO_HISTORIAL) {
      const habitual = mediana(previas);
      if (habitual > 0 && f.total >= habitual * VECES_HABITUAL && f.total - habitual >= 100) {
        const veces = Math.round(f.total / habitual);
        // Diez veces lo de siempre suele ser un cero de más en una cantidad o un precio.
        const cero = Math.abs(f.total / 10 - habitual) <= habitual * 0.25 ? ' ¿Hay un cero de más en alguna cantidad o precio?' : '';
        puntos.push({ id: 'total-alto', titulo: 'Mucho más de lo habitual',
          detalle: `${eur(f.total)} es unas ${veces} veces lo que sueles facturar a ${f.clienteNombre || 'este cliente'} (lo normal son ${eur(habitual)}, mirando sus ${previas.length} últimas facturas).${cero}` });
      }
    }
  }

  return puntos;
}
