import { getAll, getById, put, remove } from './offlineDb';
import { generateId } from './utils';
import { PosCartLine } from './types';

/**
 * Cuentas abiertas de restaurante (modo mesas). Viven en IndexedDB
 * (store `open_checks`, creado en la v2) y NO se sincronizan: son estado
 * local del dispositivo mientras la mesa está ocupada.
 */
export interface OpenCheck {
  id: string;
  tableId: string;
  openedAt: string;
  lines: PosCartLine[];
}

export async function getOpenChecks(): Promise<OpenCheck[]> {
  return getAll<OpenCheck>('open_checks');
}

export async function getOpenCheck(id: string): Promise<OpenCheck | undefined> {
  return getById<OpenCheck>('open_checks', id);
}

export async function saveOpenCheck(check: OpenCheck): Promise<void> {
  await put('open_checks', check);
}

export async function deleteOpenCheck(id: string): Promise<void> {
  await remove('open_checks', id);
}

export async function createOpenCheck(tableId: string): Promise<OpenCheck> {
  const check: OpenCheck = {
    id: generateId(),
    tableId,
    openedAt: new Date().toISOString(),
    lines: [],
  };
  await saveOpenCheck(check);
  return check;
}

export async function addLineToCheck(check: OpenCheck, line: PosCartLine): Promise<OpenCheck> {
  const existing = check.lines.find(l => l.productId === line.productId);
  const lines = existing
    ? check.lines.map(l => l.productId === line.productId
      ? { ...l, quantity: l.quantity + line.quantity }
      : l)
    : [...check.lines, line];
  const updated = { ...check, lines };
  await saveOpenCheck(updated);
  return updated;
}
