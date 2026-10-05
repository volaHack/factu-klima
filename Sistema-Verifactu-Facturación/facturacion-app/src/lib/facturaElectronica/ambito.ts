/**
 * A QUIÉN Y CUÁNDO: EL ALCANCE DE LA FACTURA ELECTRÓNICA OBLIGATORIA
 *
 * La obligación (Ley 18/2022, RD 238/2026) es entre empresarios y
 * profesionales establecidos en España. No alcanza:
 *  - a los particulares (consumidores finales);
 *  - a los tickets (facturas simplificadas);
 *  - a las Administraciones, que ya reciben Facturae por FACe desde 2015;
 *  - a los clientes de fuera de España (intracomunitarias, exportaciones).
 *
 * Con la Orden HAC/1028/2026 (BOE del 5 de octubre de 2026) empiezan a
 * contar los plazos: un año para quien factura más de 8 millones al año y
 * dos para el resto. Antes de esa fecha se puede usar igual, y conviene:
 * a esa fecha se llega con los clientes ya acostumbrados.
 */

import type { Client, Invoice } from '@/lib/types';
import { paisIso2, limpiarNif } from './ubl';

export type TipoFiscalCliente = 'empresa' | 'autonomo' | 'particular' | 'administracion';

export const NOMBRE_TIPO_FISCAL: Record<TipoFiscalCliente, string> = {
  empresa: 'Empresa', autonomo: 'Autónomo o profesional', particular: 'Particular', administracion: 'Administración pública',
};

/**
 * El tipo de cliente. Si no se ha dicho en la ficha, se deduce del NIF:
 * una sociedad (B, A…) es empresa; las letras P, Q y S son organismos
 * públicos; un DNI o NIE puede ser un particular o un autónomo y no hay
 * forma de saberlo, así que se toma por particular hasta que se marque.
 */
export function tipoFiscalDe(c?: Pick<Client, 'nif'> & Partial<Pick<Client, 'tipoFiscal' | 'dir3' | 'isWalkIn' | 'vatNumber'>>): TipoFiscalCliente {
  if (!c) return 'particular';
  if (c.tipoFiscal) return c.tipoFiscal;
  if (c.isWalkIn) return 'particular';
  if (c.dir3 && (c.dir3.oficinaContable || c.dir3.organoGestor || c.dir3.unidadTramitadora)) return 'administracion';
  const nif = limpiarNif(c.nif).replace(/^ES(?=[A-Z0-9]{9}$)/, '');
  if (/^[PQS]/.test(nif)) return 'administracion';
  if (/^[ABCDEFGHJNRUVW][0-9]{7}[0-9A-J]$/.test(nif)) return 'empresa';
  return 'particular';
}

export interface ConfigFacturaElectronica {
  /** Factura más de 8 millones al año: la obligación le llega un año antes. */
  volumenMas8M?: boolean;
  /**
   * Por dónde sale. «simulado» genera, valida y guarda la factura y sus
   * estados sin mandar nada a ningún sitio: es el modo de pruebas. La
   * conexión con la solución pública de la AEAT se activa cuando la AEAT
   * abra el servicio y se haya probado en su entorno de pruebas.
   */
  canal: 'simulado' | 'spfe';
  /** Generar la factura electrónica al emitir cada factura a una empresa o autónomo. */
  automatica: boolean;
  /** Comunicar los cobros de las facturas emitidas (es voluntario para quien emite). */
  comunicarCobros: boolean;
}

export const CONFIG_FE_INICIAL: ConfigFacturaElectronica = { canal: 'simulado', automatica: true, comunicarCobros: false };

export const leerConfigFe = (v: unknown): ConfigFacturaElectronica => ({ ...CONFIG_FE_INICIAL, ...(v && typeof v === 'object' ? v : {}) });

/** Desde cuándo es obligatoria para esta empresa. */
export function obligatoriaDesde(cfg: Pick<ConfigFacturaElectronica, 'volumenMas8M'>): { mes: string; texto: string } {
  return cfg.volumenMas8M
    ? { mes: '2027-10', texto: 'octubre de 2027' }
    : { mes: '2028-10', texto: 'octubre de 2028' };
}

export interface Alcance {
  /** Entra en la obligación entre empresas. */
  obligatoria: boolean;
  /** Se puede generar igual (aunque no sea obligatoria). */
  posible: boolean;
  motivo: string;
}

/** ¿Esta factura tiene que ir como factura electrónica? */
export function alcanceDe(
  f: Pick<Invoice, 'tipo' | 'sentido' | 'tipoFacturaFiscal' | 'esIntracomunitaria' | 'clientNif' | 'posSessionId'>,
  cliente?: Pick<Client, 'nif'> & Partial<Pick<Client, 'tipoFiscal' | 'dir3' | 'isWalkIn' | 'vatNumber' | 'country'>>,
): Alcance {
  if (f.tipo && f.tipo !== 'factura' && f.tipo !== 'rectificativa') return { obligatoria: false, posible: false, motivo: 'Sólo las facturas y rectificativas.' };
  if (f.sentido === 'compra') return { obligatoria: false, posible: false, motivo: 'Es una compra: la factura electrónica la emite tu proveedor.' };
  if (f.tipoFacturaFiscal === 'F2' || (f.posSessionId && !limpiarNif(f.clientNif))) {
    return { obligatoria: false, posible: false, motivo: 'Es un ticket (factura simplificada).' };
  }
  if (!limpiarNif(f.clientNif || cliente?.nif)) return { obligatoria: false, posible: false, motivo: 'El cliente no tiene NIF.' };
  const tipo = tipoFiscalDe(cliente ? { ...cliente, nif: cliente.nif || f.clientNif } : { nif: f.clientNif });
  if (tipo === 'administracion') return { obligatoria: false, posible: true, motivo: 'A una Administración se le factura con Facturae por FACe.' };
  if (f.esIntracomunitaria || paisIso2(cliente?.country) !== 'ES') {
    return { obligatoria: false, posible: true, motivo: 'El cliente no está en España: la obligación es entre empresas españolas.' };
  }
  if (tipo === 'particular') {
    return { obligatoria: false, posible: true, motivo: 'Es un particular. Si es autónomo o profesional, márcalo en su ficha.' };
  }
  return { obligatoria: true, posible: true, motivo: tipo === 'empresa' ? 'Factura a una empresa.' : 'Factura a un autónomo o profesional.' };
}
