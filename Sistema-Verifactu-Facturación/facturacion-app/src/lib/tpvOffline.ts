export function nextOfflineNumber(
  existingNumbers: string[],
  series: string,
  year: number,
  deviceSuffix?: string,
): string {
  let max = 0;
  for (const num of existingNumbers) {
    const digitParts = num.split('-').filter(part => /^\d+$/.test(part));
    const numPart = parseInt(digitParts[digitParts.length - 1] || '0', 10);
    if (!isNaN(numPart) && numPart > max) max = numPart;
  }
  const base = `${series}-${year}-${String(max + 1).padStart(4, '0')}`;
  return deviceSuffix ? `${base}-${deviceSuffix}` : base;
}

export function expectedCashForSession(startingCash: number, cashSales: number[]): number {
  return Number((startingCash + cashSales.reduce((s, v) => s + v, 0)).toFixed(2));
}

export function pluToKg(grams: number): number {
  return Math.round(grams) / 1000;
}

export function pluKgToPrice(pricePerKg: number, kg: number): number {
  return Number((pricePerKg * kg).toFixed(2));
}

export function sortByUnitsSold<T extends { unitsSold?: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => (b.unitsSold ?? 0) - (a.unitsSold ?? 0));
}

export function daysUntilOutOfStock(stock: number, threshold: number, unitsPerDay: number): number {
  if (stock <= threshold) return 0;
  if (unitsPerDay <= 0) return Infinity;
  return Math.floor(stock / unitsPerDay);
}
