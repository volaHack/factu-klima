// ============================================================
// UTILIDADES DEL SISTEMA
// ============================================================

import { InvoiceLineItem, TaxBreakdown, InvoiceStatus } from './types';
import { INVOICE_STATUSES } from './constants';

/**
 * Format a number as currency (EUR, Spanish locale)
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format a date string to Spanish locale format
 */
export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

/**
 * Format a date as relative (e.g., "hace 3 días")
 */
export function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return `Hace ${diffDays} días`;
  if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} semanas`;
  if (diffDays < 365) return `Hace ${Math.floor(diffDays / 30)} meses`;
  return `Hace ${Math.floor(diffDays / 365)} años`;
}

/**
 * Generate an invoice number based on series and next number
 */
export function generateInvoiceNumber(series: string, nextNumber: number, year?: number): string {
  const y = year || new Date().getFullYear();
  const num = String(nextNumber).padStart(4, '0');
  return `${series}-${y}-${num}`;
}

/**
 * Extrae la secuencia numérica final de un número de documento.
 * "FAC-2026-0007" → 7. Se usa para recomponer el contador al guardar.
 */
export function sequenceFromNumber(number: string): number {
  const match = /-(\d+)$/.exec(number);
  return match ? Number(match[1]) : 0;
}

/**
 * Calculate line item subtotal
 */
export function calculateLineSubtotal(
  quantity: number,
  unitPrice: number,
  discountPercent: number = 0
): number {
  const gross = quantity * unitPrice;
  const discount = gross * (discountPercent / 100);
  return Number((gross - discount).toFixed(2));
}

/**
 * Calculate line item tax amount
 */
export function calculateLineTax(subtotal: number, taxRate: number): number {
  return Number((subtotal * (taxRate / 100)).toFixed(2));
}

/**
 * Calculate complete invoice totals from line items
 */
export function calculateInvoiceTotals(lineItems: InvoiceLineItem[]): {
  subtotal: number;
  totalDiscount: number;
  taxBreakdown: TaxBreakdown[];
  totalTax: number;
  total: number;
} {
  let subtotal = 0;
  let totalDiscount = 0;
  const taxMap = new Map<number, { base: number; amount: number }>();

  for (const item of lineItems) {
    const gross = item.quantity * item.unitPrice;
    const discount = gross * (item.discountPercent / 100);
    const lineSubtotal = gross - discount;
    const lineTax = lineSubtotal * (item.taxRate / 100);

    subtotal += lineSubtotal;
    totalDiscount += discount;

    const existing = taxMap.get(item.taxRate) || { base: 0, amount: 0 };
    taxMap.set(item.taxRate, {
      base: existing.base + lineSubtotal,
      amount: existing.amount + lineTax,
    });
  }

  const taxBreakdown: TaxBreakdown[] = Array.from(taxMap.entries()).map(([rate, data]) => ({
    rate,
    base: Number(data.base.toFixed(2)),
    amount: Number(data.amount.toFixed(2)),
  }));

  const totalTax = taxBreakdown.reduce((sum, tb) => sum + tb.amount, 0);

  return {
    subtotal: Number(subtotal.toFixed(2)),
    totalDiscount: Number(totalDiscount.toFixed(2)),
    taxBreakdown,
    totalTax: Number(totalTax.toFixed(2)),
    total: Number((subtotal + totalTax).toFixed(2)),
  };
}

/**
 * Validate Spanish NIF/CIF
 */
export function validateNIF(nif: string): boolean {
  if (!nif || nif.length < 8) return false;
  const cleaned = nif.toUpperCase().replace(/[\s-]/g, '');
  // Basic format check: letter + 7 digits + letter, or 8 digits + letter, or letter + 8 digits
  const nifRegex = /^[0-9]{8}[A-Z]$/; // DNI
  const cifRegex = /^[ABCDEFGHJKLMNPQRSUVW][0-9]{7}[0-9A-J]$/; // CIF
  const nieRegex = /^[XYZ][0-9]{7}[A-Z]$/; // NIE
  return nifRegex.test(cleaned) || cifRegex.test(cleaned) || nieRegex.test(cleaned);
}

/**
 * Generate a unique ID. Debe ser un UUID válido: los IDs generados aquí
 * acaban como clave primaria en columnas `uuid` de Postgres (clients,
 * products, invoices, invoice_line_items...), que rechazan cualquier
 * otro formato.
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Get status label and color
 */
export function getStatusInfo(status: InvoiceStatus) {
  return INVOICE_STATUSES.find(s => s.value === status) || INVOICE_STATUSES[0];
}

/**
 * Get days until due date (negative means overdue)
 */
export function getDaysUntilDue(dueDate: string): number {
  const due = new Date(dueDate);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Get today's date as ISO string (date only)
 */
export function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Add days to a date
 */
export function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

/**
 * Get month name in Spanish
 */
export function getMonthName(monthIndex: number): string {
  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];
  return months[monthIndex] || '';
}

/**
 * Clamp a number between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Get short month name
 */
export function getShortMonthName(monthIndex: number): string {
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return months[monthIndex] || '';
}

/**
 * Comprime una imagen del dispositivo a una miniatura data URL (JPEG ~75%).
 * Pensada para el modo offline-first: ocupa pocos KB y viaja bien por la cola
 * de sincronización y el IndexedDB local. maxSize = lado mayor en px.
 */
export function processImageFile(file: File, maxSize = 160): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const ratio = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * ratio));
        const h = Math.max(1, Math.round(img.height * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas no disponible en este navegador');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      } catch (err) {
        reject(err instanceof Error ? err : new Error('No se pudo procesar la imagen'));
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('No se pudo leer el archivo de imagen'));
    };
    img.src = objectUrl;
  });
}
