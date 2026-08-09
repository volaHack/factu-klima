import { Invoice, InvoiceStatus, Product } from './types';
import { getDaysUntilDue } from './utils';
import { getMeta, setMeta } from './offlineDb';

export interface StockAlertItem {
  id: string;
  name: string;
  ref: string;
  stock: number;
  threshold?: number;
}

export interface TrendItem {
  name: string;
  current: number;
  previous: number;
  changePct: number;
}

export interface ProjectionItem {
  id: string;
  name: string;
  ref: string;
  stock: number;
  unitsPerDay: number;
  daysLeft: number;
}

export interface RiskClientItem {
  id: string;
  name: string;
  pendingTotal: number;
  pendingCount: number;
  overdueTotal: number;
}

export interface DayStat {
  label: string;
  total: number;
  count: number;
}

export interface AvisosData {
  critical: StockAlertItem[];
  low: StockAlertItem[];
  overdueCount: number;
  overdueTotal: number;
  dueSoonCount: number;
  dueSoonTotal: number;
  riskClients: RiskClientItem[];
  growing: TrendItem[];
  declining: TrendItem[];
  projection: ProjectionItem[];
  bestDay: DayStat | null;
  worstDay: DayStat | null;
  totalCount: number;
}

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DAYS_WINDOW = 30;
const PROJECTION_HORIZON = 7;
const DUE_SOON_DAYS = 7;

function getStockKey(p: Product): string {
  return p.id;
}

function getLineKey(productId: string, productName: string): string {
  return productId || productName || 'Producto';
}

export function getStockAlerts(products: Product[]): { critical: StockAlertItem[]; low: StockAlertItem[] } {
  const critical: StockAlertItem[] = [];
  const low: StockAlertItem[] = [];
  for (const p of products) {
    if (!p.active) continue;
    if (p.lowStockThreshold == null) continue;
    const stock = p.stockQuantity ?? 0;
    const item: StockAlertItem = { id: p.id, name: p.name, ref: p.ref, stock, threshold: p.lowStockThreshold };
    if (stock <= 0) critical.push(item);
    else if (stock <= p.lowStockThreshold) low.push(item);
  }
  return { critical, low };
}

function getUnitsPerDayLast30(invoices: Invoice[]): Map<string, number> {
  const cutoff = Date.now() - DAYS_WINDOW * 24 * 60 * 60 * 1000;
  const byKey = new Map<string, number>();
  for (const inv of invoices) {
    if (inv.status === InvoiceStatus.ANULADA || inv.status === InvoiceStatus.BORRADOR) continue;
    if (new Date(inv.issueDate).getTime() < cutoff) continue;
    for (const li of inv.lineItems) {
      const key = getLineKey(li.productId, li.productName);
      byKey.set(key, (byKey.get(key) || 0) + li.quantity);
    }
  }
  const perDay = new Map<string, number>();
  for (const [k, v] of byKey) perDay.set(k, v / DAYS_WINDOW);
  return perDay;
}

export function getStockProjection(products: Product[], invoices: Invoice[]): ProjectionItem[] {
  const perDay = getUnitsPerDayLast30(invoices);
  const out: ProjectionItem[] = [];
  for (const p of products) {
    if (!p.active) continue;
    const stock = p.stockQuantity ?? 0;
    if (stock <= 0) continue;
    const unitsPerDay = perDay.get(getStockKey(p)) || perDay.get(p.name) || 0;
    if (unitsPerDay <= 0) continue;
    const daysLeft = Math.floor(stock / unitsPerDay);
    if (daysLeft <= PROJECTION_HORIZON) {
      out.push({ id: p.id, name: p.name, ref: p.ref, stock, unitsPerDay, daysLeft });
    }
  }
  out.sort((a, b) => a.daysLeft - b.daysLeft);
  return out.slice(0, 5);
}

export function getProductTrends(invoices: Invoice[]): { growing: TrendItem[]; declining: TrendItem[] } {
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();
  let lastMonth = thisMonth - 1;
  let lastYear = thisYear;
  if (lastMonth < 0) {
    lastMonth = 11;
    lastYear -= 1;
  }
  const totals = new Map<string, { name: string; current: number; previous: number }>();
  for (const inv of invoices) {
    if (inv.status === InvoiceStatus.ANULADA) continue;
    const d = new Date(inv.issueDate);
    const isThis = d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    const isPrev = d.getMonth() === lastMonth && d.getFullYear() === lastYear;
    if (!isThis && !isPrev) continue;
    for (const li of inv.lineItems) {
      const key = getLineKey(li.productId, li.productName);
      const t = totals.get(key) || { name: li.productName || key, current: 0, previous: 0 };
      if (isThis) t.current += li.total;
      else t.previous += li.total;
      totals.set(key, t);
    }
  }
  const growing: TrendItem[] = [];
  const declining: TrendItem[] = [];
  for (const t of totals.values()) {
    const changePct = t.previous === 0
      ? (t.current > 0 ? 100 : 0)
      : ((t.current - t.previous) / t.previous) * 100;
    if (t.current >= 20 && changePct >= 20) {
      growing.push({ name: t.name, current: t.current, previous: t.previous, changePct });
    }
    if (t.current >= 0 && t.previous > 0 && changePct <= -20) {
      declining.push({ name: t.name, current: t.current, previous: t.previous, changePct });
    }
  }
  growing.sort((a, b) => b.changePct - a.changePct);
  declining.sort((a, b) => a.changePct - b.changePct);
  return { growing: growing.slice(0, 5), declining: declining.slice(0, 5) };
}

export function getBestWorstDay(invoices: Invoice[]): { best: DayStat | null; worst: DayStat | null } {
  const days: DayStat[] = Array.from({ length: 7 }, (_, i) => ({ label: DAY_LABELS[i], total: 0, count: 0 }));
  for (const inv of invoices) {
    if (inv.status === InvoiceStatus.ANULADA) continue;
    const dow = new Date(inv.issueDate).getDay();
    days[dow].total += inv.total;
    days[dow].count += 1;
  }
  const withData = days.filter(d => d.count > 0);
  if (withData.length === 0) return { best: null, worst: null };
  let best = withData[0];
  let worst = withData[0];
  for (const d of withData) {
    if (d.total > best.total) best = d;
    if (d.total < worst.total) worst = d;
  }
  if (best === worst) return { best, worst: null };
  return { best, worst };
}

export function getRiskClients(invoices: Invoice[]): RiskClientItem[] {
  const map = new Map<string, RiskClientItem>();
  for (const inv of invoices) {
    const isPending = inv.status === InvoiceStatus.PENDIENTE || inv.status === InvoiceStatus.EMITIDA;
    const isOverdue = inv.status === InvoiceStatus.VENCIDA;
    if (!isPending && !isOverdue) continue;
    const item = map.get(inv.clientId) || {
      id: inv.clientId,
      name: inv.clientName,
      pendingTotal: 0,
      pendingCount: 0,
      overdueTotal: 0,
    };
    item.pendingTotal += inv.total;
    item.pendingCount += 1;
    if (isOverdue) item.overdueTotal += inv.total;
    map.set(inv.clientId, item);
  }
  return Array.from(map.values())
    .sort((a, b) => b.pendingTotal - a.pendingTotal)
    .slice(0, 5);
}

export function buildAvisosData(products: Product[], invoices: Invoice[]): AvisosData {
  const { critical, low } = getStockAlerts(products);
  const overdue = invoices.filter(inv => inv.status === InvoiceStatus.VENCIDA);
  const dueSoon = invoices.filter(inv =>
    (inv.status === InvoiceStatus.PENDIENTE || inv.status === InvoiceStatus.EMITIDA) &&
    getDaysUntilDue(inv.dueDate) <= DUE_SOON_DAYS
  );
  const riskClients = getRiskClients(invoices);
  const { growing, declining } = getProductTrends(invoices);
  const projection = getStockProjection(products, invoices);
  const { best, worst } = getBestWorstDay(invoices);
  const overdueTotal = overdue.reduce((s, i) => s + i.total, 0);
  const dueSoonTotal = dueSoon.reduce((s, i) => s + i.total, 0);
  const totalCount =
    critical.length + low.length + overdue.length + dueSoon.length + riskClients.length;

  return {
    critical,
    low,
    overdueCount: overdue.length,
    overdueTotal,
    dueSoonCount: dueSoon.length,
    dueSoonTotal,
    riskClients,
    growing,
    declining,
    projection,
    bestDay: best,
    worstDay: worst,
    totalCount,
  };
}

export async function getLastSeenAvisoCount(): Promise<number> {
  const v = await getMeta('avisos_last_seen_count');
  return typeof v === 'number' ? v : 0;
}

export async function setAvisosSeen(count: number): Promise<void> {
  await setMeta('avisos_last_seen_count', count);
}
