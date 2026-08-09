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
