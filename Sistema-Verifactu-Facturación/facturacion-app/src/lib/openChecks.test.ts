import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('@/lib/offlineDb', () => ({
  getAll: vi.fn(async () => []),
  getById: vi.fn(async () => undefined),
  put: vi.fn(async () => {}),
  remove: vi.fn(async () => {}),
}));

import { getAll, getById, put, remove } from './offlineDb';
import { createOpenCheck, deleteOpenCheck, getOpenCheck, getOpenChecks, saveOpenCheck, addLineToCheck } from './openChecks';
import { TaxRate, UnitOfMeasure } from './types';

const getAllMock = getAll as Mock;
const getByIdMock = getById as Mock;
const putMock = put as Mock;
const removeMock = remove as Mock;

const line = {
  productId: 'prod-1',
  productName: 'Coca-Cola',
  productRef: 'REF-1',
  unitPrice: 2.5,
  unit: UnitOfMeasure.UNIDAD,
  taxRate: TaxRate.REDUCIDO,
  quantity: 1,
  discountPercent: 0,
  stockQuantity: 99,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('openChecks', () => {
  it('crea una cuenta abierta con id único y líneas vacías', async () => {
    const check = await createOpenCheck('mesa-3');
    expect(check.tableId).toBe('mesa-3');
    expect(check.lines).toEqual([]);
    expect(check.id).toBeTruthy();
    expect(putMock).toHaveBeenCalledWith('open_checks', check);
  });

  it('añade una línea nueva a una cuenta existente', async () => {
    const check = await createOpenCheck('mesa-1');
    const updated = await addLineToCheck(check, line);
    expect(updated.lines).toHaveLength(1);
    expect(updated.lines[0].productName).toBe('Coca-Cola');
    expect(updated.lines[0].quantity).toBe(1);
  });

  it('acumula la cantidad si la línea ya existe', async () => {
    const check = await createOpenCheck('mesa-1');
    const once = await addLineToCheck(check, line);
    const twice = await addLineToCheck(once, { ...line, quantity: 2 });
    expect(twice.lines).toHaveLength(1);
    expect(twice.lines[0].quantity).toBe(3);
  });

  it('lista las cuentas abiertas desde el store', async () => {
    getAllMock.mockResolvedValueOnce([{ id: 'c1', tableId: 'mesa-1' }]);
    const checks = await getOpenChecks();
    expect(checks).toHaveLength(1);
    expect(getAllMock).toHaveBeenCalledWith('open_checks');
  });

  it('lee una cuenta por id', async () => {
    getByIdMock.mockResolvedValueOnce({ id: 'c1', tableId: 'mesa-2', lines: [line] });
    const check = await getOpenCheck('c1');
    expect(check?.tableId).toBe('mesa-2');
    expect(getByIdMock).toHaveBeenCalledWith('open_checks', 'c1');
  });

  it('borra una cuenta al cobrarla o vaciarla', async () => {
    await deleteOpenCheck('c1');
    expect(removeMock).toHaveBeenCalledWith('open_checks', 'c1');
  });

  it('persiste una cuenta actualizada', async () => {
    const check = { id: 'c1', tableId: 'mesa-9', openedAt: new Date().toISOString(), lines: [] };
    await saveOpenCheck(check);
    expect(putMock).toHaveBeenCalledWith('open_checks', check);
  });
});
