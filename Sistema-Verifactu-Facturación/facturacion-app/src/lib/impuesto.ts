/**
 * IVA O IGIC
 *
 * En la península y Baleares el impuesto indirecto es el IVA; en Canarias,
 * el IGIC. Lo decide el régimen de la empresa (Ajustes → IGIC), pero una
 * factura ya hecha no puede cambiar de impuesto si ese ajuste cambia luego:
 * desde la migración 077 cada factura guarda el suyo al crearse.
 *
 * Este es el único sitio donde se resuelve: lo que guarda la factura y, si
 * es anterior a eso (no guarda nada), el régimen de la empresa.
 */

export type NombreImpuesto = 'IVA' | 'IGIC';

export function esNombreImpuesto(valor: unknown): valor is NombreImpuesto {
  return valor === 'IVA' || valor === 'IGIC';
}

/** El régimen de la empresa, para lo que aún no tiene factura (o es anterior a la 077). */
export function impuestoDeEmpresa(ajustes: { igicEnabled?: boolean } | null | undefined): NombreImpuesto {
  return ajustes?.igicEnabled ? 'IGIC' : 'IVA';
}

/** El impuesto con el que se emitió una factura. */
export function impuestoDeFactura(
  factura: { impuesto?: NombreImpuesto | null } | null | undefined,
  ajustes: { igicEnabled?: boolean } | null | undefined,
): NombreImpuesto {
  return factura?.impuesto ?? impuestoDeEmpresa(ajustes);
}
