import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';

// Caché local de ajustes, en memoria.
const cache: Record<string, unknown> = {};
vi.mock('@/lib/offlineDb', () => ({
  getAll: vi.fn(async () => []),
  getById: vi.fn(async (_s: string, k: string) => cache[k] ?? null),
  put: vi.fn(async (_s: string, v: { key: string }) => { cache[v.key] = v; }),
  putMany: vi.fn(async () => {}),
  remove: vi.fn(async () => {}),
  clearStore: vi.fn(async () => {}),
  enqueueSyncAction: vi.fn(async () => {}),
  isOfflineDbAvailable: vi.fn(async () => true),
  getMeta: vi.fn(async () => null),
  setMeta: vi.fn(async () => {}),
}));
vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }));

import { createClient } from '@/lib/supabase/client';
import { saveCompanySettings, deleteCategories } from './storage';
import { escribirQuitandoColumnasQueFaltan } from './columnasQueFaltan';
import { DEFAULT_COMPANY_SETTINGS } from './constants';
import type { CompanySettings } from './types';

/** Supabase falso que guarda lo que se le escribe en company_settings. */
function supabaseFalso(fila: Record<string, unknown>, columnasQueNoExisten: string[] = []) {
  const escrituras: Record<string, unknown>[] = [];
  const cadena = () => {
    const obj = {
      select: () => obj, order: () => obj, eq: () => obj,
      limit: async () => ({ data: [fila], error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
      update: (payload: Record<string, unknown>) => {
        const falta = Object.keys(payload).find(k => columnasQueNoExisten.includes(k));
        return {
          eq: async () => {
            if (falta) return { error: { code: 'PGRST204', message: `Could not find the '${falta}' column of 'company_settings' in the schema cache` } };
            escrituras.push(payload);
            Object.assign(fila, payload);
            return { error: null };
          },
        };
      },
      insert: async () => ({ error: null }),
    };
    return obj;
  };
  return {
    escrituras,
    cliente: {
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }), getSession: async () => ({ data: { session: null }, error: null }) },
      from: () => cadena(),
      rpc: async () => ({ data: false, error: null }),
    },
  };
}

const AJUSTES = { ...DEFAULT_COMPANY_SETTINGS, businessName: 'Ejemplo S.L.', nif: 'B12345674', sector: 'alimentacion' } as CompanySettings;

describe('las categorías no resucitan', () => {
  beforeEach(() => { vi.stubGlobal('navigator', { onLine: true }); for (const k of Object.keys(cache)) delete cache[k]; });
  afterEach(() => vi.unstubAllGlobals());

  it('un guardado con ajustes viejos (TPV, nueva factura…) no toca las categorías', async () => {
    const fila = { id: 's1', custom_categories: [{ id: 'frutas', name: 'Frutas', icon: 'Apple', hidden: true }] };
    cache.company = { key: 'company', ...fila };
    const sb = supabaseFalso(fila);
    (createClient as Mock).mockReturnValue(sb.cliente);

    // El TPV abierto desde antes del borrado guarda su contador con la lista vieja.
    await saveCompanySettings({ ...AJUSTES, customCategories: [], nextTpvNumber: 99 });

    expect(sb.escrituras[0]).not.toHaveProperty('custom_categories');
    expect(fila.custom_categories).toHaveLength(1);
    expect((cache.company as { custom_categories: unknown[] }).custom_categories).toHaveLength(1);
  });

  it('borrar categorías sí las escribe', async () => {
    const fila: Record<string, unknown> = { id: 's1', custom_categories: [] };
    cache.company = { key: 'company', ...fila, sector: 'alimentacion', business_name: 'Ejemplo S.L.', nif: 'B12345674' };
    const sb = supabaseFalso(fila);
    (createClient as Mock).mockReturnValue(sb.cliente);

    await deleteCategories(['frutas']);

    const escrita = sb.escrituras.at(-1)!.custom_categories as { id: string; hidden?: boolean }[];
    expect(escrita.find(c => c.id === 'frutas')?.hidden).toBe(true);
  });

  it('si falta una columna de otra cosa, las categorías se guardan igual', async () => {
    const fila: Record<string, unknown> = { id: 's1', custom_categories: [] };
    cache.company = { key: 'company', ...fila, sector: 'alimentacion' };
    const sb = supabaseFalso(fila, ['almacenes']);
    (createClient as Mock).mockReturnValue(sb.cliente);

    await deleteCategories(['frutas']);

    const ultima = sb.escrituras.at(-1)!;
    expect(ultima).not.toHaveProperty('almacenes');
    expect((ultima.custom_categories as unknown[]).length).toBe(1);
  });
});

describe('escribirQuitandoColumnasQueFaltan', () => {
  it('quita sólo las columnas que la base de datos no tiene', async () => {
    const vistos: string[][] = [];
    const r = await escribirQuitandoColumnasQueFaltan(async p => {
      vistos.push(Object.keys(p));
      if ('almacenes' in p) return { error: { message: "Could not find the 'almacenes' column of 'company_settings' in the schema cache" } };
      if ('tarifas' in p) return { error: { message: 'column "tarifas" of relation "company_settings" does not exist' } };
      return { error: null };
    }, { nif: 'x', almacenes: [], tarifas: [], custom_categories: [] });
    expect(r.error).toBeNull();
    expect(r.quitadas).toEqual(['almacenes', 'tarifas']);
    expect(vistos.at(-1)).toEqual(['nif', 'custom_categories']);
  });

  it('un error que no es de columna se devuelve tal cual', async () => {
    const r = await escribirQuitandoColumnasQueFaltan(async () => ({ error: { code: '42501', message: 'permission denied' } }), { a: 1 });
    expect(r.error?.code).toBe('42501');
    expect(r.quitadas).toEqual([]);
  });
});
