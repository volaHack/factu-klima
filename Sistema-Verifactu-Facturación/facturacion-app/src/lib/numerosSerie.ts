/**
 * UNA UNIDAD, DE PRINCIPIO A FIN
 *
 * Un lote controla una partida entera; esto controla UNA unidad concreta.
 * De qué proveedor entró, a qué cliente se vendió y cuándo, y hasta cuándo
 * cubre la garantía. Es lo que se busca cuando alguien llama diciendo «se
 * me ha roto la número tal» y hay que saber si todavía está en garantía sin
 * tener que revisar factura por factura.
 */

import type { EstadoNumeroSerie, NumeroSerie } from './types';

/** Las unidades de un producto que siguen en stock, sin vender. */
export function numerosEnStock(numeros: NumeroSerie[], productId: string): NumeroSerie[] {
  return numeros
    .filter(n => n.productId === productId && n.estado === 'en_stock')
    .sort((a, b) => a.fechaEntrada.localeCompare(b.fechaEntrada));
}

/**
 * Hasta cuándo cubre la garantía.
 *
 * Sin fecha de venta no hay garantía que contar: una unidad en stock no
 * tiene el reloj corriendo todavía. Sin meses de garantía configurados,
 * tampoco: no se puede calcular un final que no se ha dicho.
 */
export function finGarantia(numero: NumeroSerie): string | null {
  if (!numero.fechaVenta || !numero.garantiaMeses) return null;
  const venta = new Date(numero.fechaVenta);
  if (Number.isNaN(venta.getTime())) return null;
  const fin = new Date(venta);
  fin.setMonth(fin.getMonth() + numero.garantiaMeses);
  return fin.toISOString().slice(0, 10);
}

/** Si una unidad sigue en garantía a día de hoy. */
export function enGarantia(numero: NumeroSerie, hoy = new Date()): boolean {
  const fin = finGarantia(numero);
  if (!fin) return false;
  return fin >= hoy.toISOString().slice(0, 10);
}

/** Busca una unidad por su número de serie exacto. Es case-insensitive: quien llama no siempre respeta mayúsculas. */
export function buscarPorNumero(numeroSerie: string, numeros: NumeroSerie[]): NumeroSerie | null {
  const buscado = numeroSerie.trim().toLowerCase();
  if (!buscado) return null;
  return numeros.find(n => n.numeroSerie.toLowerCase() === buscado) ?? null;
}

/** Marca una unidad como vendida a un cliente, en una factura. */
export function venderNumero(
  numero: NumeroSerie,
  datos: { fechaVenta: string; clienteId: string; clienteNombre: string; invoiceId: string },
): NumeroSerie {
  return {
    ...numero,
    estado: 'vendido' as EstadoNumeroSerie,
    fechaVenta: datos.fechaVenta,
    clienteId: datos.clienteId,
    clienteNombre: datos.clienteNombre,
    invoiceId: datos.invoiceId,
  };
}

/** Las unidades cuya garantía termina dentro de `dias`, la más próxima primero. Útil para avisar antes de que caduque. */
export function garantiasPorTerminar(numeros: NumeroSerie[], dias = 30, hoy = new Date()): NumeroSerie[] {
  const limite = new Date(hoy);
  limite.setDate(limite.getDate() + dias);
  const limiteStr = limite.toISOString().slice(0, 10);
  const hoyStr = hoy.toISOString().slice(0, 10);

  return numeros
    .filter(n => n.estado === 'vendido')
    .filter(n => {
      const fin = finGarantia(n);
      return fin !== null && fin >= hoyStr && fin <= limiteStr;
    })
    .sort((a, b) => finGarantia(a)!.localeCompare(finGarantia(b)!));
}
