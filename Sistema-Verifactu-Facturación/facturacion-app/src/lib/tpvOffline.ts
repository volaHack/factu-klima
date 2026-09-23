/**
 * Siguiente número correlativo de una serie para el año indicado.
 * Solo se tienen en cuenta números existentes de la misma serie y año;
 * el correlativo es siempre el 3er segmento (SERIE-AÑO-0000), ignorando
 * cualquier sufijo de dispositivo. Añade un sufijo temporal cuando se pide
 * un número offline.
 */
export function nextOfflineNumber(
  existingNumbers: string[],
  series: string,
  year: number,
  deviceSuffix?: string,
): string {
  let max = 0;
  const prefix = `${series}-${year}-`;
  for (const num of existingNumbers) {
    if (!num.startsWith(prefix)) continue;
    const parts = num.split('-');
    if (parts.length < 3) continue;
    const numPart = parseInt(parts[2], 10);
    if (!isNaN(numPart) && numPart > max) max = numPart;
  }
  const base = `${series}-${year}-${String(max + 1).padStart(4, '0')}`;
  return deviceSuffix ? `${base}-${deviceSuffix}` : base;
}

/**
 * LA SERIE PROPIA DE CADA DISPOSITIVO, PARA VENDER SIN CONEXIÓN
 *
 * Sin conexión, el ticket salía con un número provisional
 * («TPV-2026-0012-K3F9») y el servidor lo cambiaba al sincronizar. Pero
 * el cliente ya se había llevado el ticket impreso con ese número y con
 * un QR que apunta a él: al escanearlo, la AEAT no lo encuentra, porque
 * lo registrado es otro número. Y con los albaranes era peor: dos equipos
 * sin conexión cogían el mismo número, el servidor rechazaba el segundo
 * por duplicado y ese albarán nunca llegaba a la base de datos.
 *
 * Ahora cada equipo numera lo que hace sin conexión en SU serie
 * («TPVK3F9-2026-0001»). Ningún otro equipo usa esa serie, así que no
 * puede chocar y nadie tiene que cambiar el número después: lo impreso,
 * el QR y lo registrado son lo mismo. Tener una serie por caja o por
 * establecimiento es legal (art. 6.1.a del Reglamento de facturación) y
 * es lo habitual en los TPV.
 *
 * El número va en el formato de siempre, SERIE-AÑO-0000, que es el que
 * entiende la base de datos; por eso la serie no lleva guiones.
 */
export function serieDelDispositivo(serieBase: string, sufijo: string): string {
  const limpia = (t: string) => t.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return `${limpia(serieBase) || 'DOC'}${limpia(sufijo)}`.slice(0, 20);
}

/** Serie y número definitivos para un documento hecho sin conexión. */
export function numeroSinConexion(
  numerosExistentes: string[],
  serieBase: string,
  sufijo: string,
  ano: number,
): { serie: string; numero: string } {
  const serie = serieDelDispositivo(serieBase, sufijo);
  return { serie, numero: nextOfflineNumber(numerosExistentes, serie, ano) };
}

/**
 * Total de caja esperado al cierre de sesión: fondo inicial más las ventas
 * en efectivo no anuladas, redondeado a 2 decimales.
 */
export function expectedCashForSession(startingCash: number, cashSales: number[]): number {
  return Number((startingCash + cashSales.reduce((s, v) => s + v, 0)).toFixed(2));
}

/**
 * Convierte gramos a kilogramos con precisión de 3 decimales.
 */
export function pluToKg(grams: number): number {
  return Math.round(grams) / 1000;
}

/**
 * Precio total de un artículo vendido a peso, a partir del precio por kg.
 */
export function pluKgToPrice(pricePerKg: number, kg: number): number {
  return Number((pricePerKg * kg).toFixed(2));
}

/**
 * Ordena los artículos de más a menos vendidos, sin mutar el array original.
 */
export function sortByUnitsSold<T extends { unitsSold?: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => (b.unitsSold ?? 0) - (a.unitsSold ?? 0));
}

/**
 * Días estimados hasta agotar el stock al ritmo actual de ventas.
 * El umbral (threshold) solo actúa como guarda de "ya agotado": si
 * stock <= threshold devuelve 0. NO acorta la cuenta atrás; el cálculo
 * es Math.floor(stock / unitsPerDay). Con unitsPerDay <= 0 devuelve Infinity.
 */
export function daysUntilOutOfStock(stock: number, threshold: number, unitsPerDay: number): number {
  if (stock <= threshold) return 0;
  if (unitsPerDay <= 0) return Infinity;
  return Math.floor(stock / unitsPerDay);
}
