/**
 * ¿COMPLETA O SIMPLIFICADA? SE DECIDE AL EMITIR, NO AL ENVIAR
 *
 * Una factura completa (F1) tiene que identificar al cliente con su NIF.
 * El programa sólo miraba si venía del TPV: cualquier factura hecha desde
 * «Nueva factura» salía como F1 aunque el cliente fuese «Venta al
 * público» sin NIF. Se sellaba igual, y el problema aparecía al mandarla
 * a la AEAT —comprobado con los registros reales: los nueve en cola
 * tenían ese fallo—, cuando ya no se puede corregir porque una factura
 * sellada no se toca.
 *
 * La regla (art. 4 del Reglamento de facturación; el de Canarias, Decreto
 * 268/2011, fija el mismo importe):
 *  - Sin NIF del cliente y hasta 400 € (impuestos incluidos): se emite
 *    como simplificada, F2, que no necesita identificarlo.
 *  - Sin NIF y por encima de 400 €: no se puede emitir. Se pide el NIF.
 *
 * El límite de 3.000 € que la ley admite para comercio minorista,
 * hostelería y otros sectores se deja fuera a propósito: depende de la
 * actividad, y equivocarse emite una factura inválida. Quien lo necesite
 * puede forzar el tipo a mano (`tipoFacturaFiscal`).
 */

import type { TipoFacturaFiscal } from '@/lib/types';

export const LIMITE_SIMPLIFICADA_SIN_NIF = 400;

interface FacturaAEmitir {
  tipo?: string;
  posSessionId?: string;
  tipoFacturaFiscal?: TipoFacturaFiscal;
  clientNif?: string;
  clientVatNumber?: string;
  total: number;
  number?: string;
}

/** El cliente está identificado con algo que la AEAT acepta. */
export function clienteIdentificado(f: Pick<FacturaAEmitir, 'clientNif' | 'clientVatNumber'>): boolean {
  return Boolean(f.clientNif?.trim()) || (f.clientVatNumber?.trim().length ?? 0) > 2;
}

/**
 * El tipo fiscal con el que hay que sellar, o un error que explica qué
 * falta. `undefined` = dejar la decisión a la base de datos como siempre.
 */
export function tipoFiscalAlEmitir(f: FacturaAEmitir): TipoFacturaFiscal | undefined {
  if (f.tipoFacturaFiscal) return f.tipoFacturaFiscal;
  if (f.tipo !== 'factura' || f.posSessionId) return undefined;
  if (clienteIdentificado(f)) return undefined;

  if (Math.abs(f.total) <= LIMITE_SIMPLIFICADA_SIN_NIF) return 'F2';

  throw new Error(
    `La factura${f.number ? ` ${f.number}` : ''} es de más de ${LIMITE_SIMPLIFICADA_SIN_NIF} € y el cliente no tiene NIF. ` +
    'Hacienda exige identificarlo: ponle el NIF al cliente antes de emitirla.',
  );
}
