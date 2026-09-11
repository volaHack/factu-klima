export type ZonaFiscal = 'canarias' | 'peninsula_baleares' | 'ceuta_melilla' | 'desconocida';
export type RegimenIgic = 'general' | 'pequeno_empresario';

export interface Tratamiento {
  tipo: number;
  /** Para Veri*Factu cuando el tipo es 0 y no es una exención. */
  calificacion: 'N2' | null;
  mencion: string | null;
}

export const IGIC_GENERAL = 7;

export function zonaFiscal(cp: string | null | undefined): ZonaFiscal {
  const c = (cp ?? '').trim();
  if (!/^\d{5}$/.test(c)) return 'desconocida';
  const provincia = Number(c.slice(0, 2));
  if (provincia === 35 || provincia === 38) return 'canarias';
  if (provincia === 51 || provincia === 52) return 'ceuta_melilla';
  if (provincia >= 1 && provincia <= 50) return 'peninsula_baleares';
  return 'desconocida';
}

/**
 * El impuesto de un servicio de la plataforma (emisora en Canarias) según
 * dónde esté el cliente. PENDIENTE DE CONFIRMAR POR EL GESTOR.
 */
export function tratamiento(zona: ZonaFiscal, regimen: RegimenIgic): Tratamiento | null {
  if (zona === 'canarias') {
    return regimen === 'general'
      ? { tipo: IGIC_GENERAL, calificacion: null, mencion: null }
      : { tipo: 0, calificacion: null, mencion: 'Operación exenta del IGIC por el régimen especial del pequeño empresario o profesional.' };
  }
  if (zona === 'peninsula_baleares') {
    return {
      tipo: 0,
      calificacion: 'N2',
      mencion: 'Operación no sujeta al IGIC por reglas de localización. inversión del sujeto pasivo: el destinatario autoliquida el IVA (art. 84.Uno.2º de la Ley 37/1992).',
    };
  }
  return null;
}

const cent = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * La base que, con su cuota redondeada como la redondea la base de datos
 * (fn_invoice_seal), da exactamente el total cobrado. Dividir entre 1,07 y
 * redondear no basta: a veces sale un céntimo de más o de menos.
 */
export function baseQueCuadra(total: number, tipo: number): { base: number; cuota: number } {
  const aprox = cent(total / (1 + tipo / 100));
  for (const base of [aprox, cent(aprox - 0.01), cent(aprox + 0.01)]) {
    const cuota = cent((base * tipo) / 100);
    if (cent(base + cuota) === cent(total)) return { base, cuota };
  }
  const base = aprox;
  const cuota = cent(total - base);
  return { base, cuota };
}
