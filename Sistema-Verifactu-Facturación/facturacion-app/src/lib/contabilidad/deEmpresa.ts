'use client';

/**
 * La contabilidad de una empresa cliente, vista desde su gestoría.
 *
 * La base de datos deja a la gestoría LEER las facturas, clientes, gastos y
 * ajustes de las empresas que lleva (migración 045). Aquí se leen filtrando
 * por la cuenta de la empresa y se pasan por el mismo motor que usa ella.
 *
 * Los cobros y pagos de tesorería no están entre lo que la gestoría puede
 * leer: las facturas marcadas como pagadas se contabilizan con su cobro
 * igual que en la cuenta de la empresa, pero los cobros parciales no.
 */

import { createClient } from '@/lib/supabase/client';
import { mapClientFromDb, mapGastoFromDb, mapInvoiceFromDb, mapSettingsFromDb } from '../storage';
import { DEFAULT_COMPANY_SETTINGS } from '../constants';
import { montarContabilidad, type Contabilidad } from './cargar';
import { apunteDeFila } from './apuntesAlmacen';

const TROZO = 150;

export async function cargarContabilidadDeEmpresa(userId: string): Promise<Contabilidad> {
  const db = createClient();
  const [fac, cli, gas, aj] = await Promise.all([
    db.from('invoices').select('*').eq('user_id', userId).order('issue_date', { ascending: true }),
    db.from('clients').select('*').eq('user_id', userId),
    db.from('gastos').select('*').eq('user_id', userId),
    db.from('company_settings').select('*').eq('user_id', userId).order('updated_at', { ascending: false }).limit(1),
  ]);
  const fallo = fac.error ?? cli.error ?? gas.error;
  if (fallo) throw new Error('No se han podido leer los datos de la empresa: ' + fallo.message);

  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const filas = (fac.data ?? []) as any[];
  // El desglose por tipos, en trozos para no pasarse de largo en la URL.
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const desglose = new Map<string, any[]>();
  for (let i = 0; i < filas.length; i += TROZO) {
    const ids = filas.slice(i, i + TROZO).map(f => f.id);
    const { data } = await db.from('invoice_tax_breakdown').select('*').in('invoice_id', ids);
    for (const t of data ?? []) {
      const lista = desglose.get(t.invoice_id) ?? [];
      lista.push(t);
      desglose.set(t.invoice_id, lista);
    }
  }

  // Los apuntes a mano, si la empresa tiene la migración 052 (si no, no hay).
  const ap = await db.from('apuntes_contables').select('*').eq('user_id', userId);

  const ajustes = aj.data?.[0];
  return montarContabilidad({
    facturas: filas.map(f => mapInvoiceFromDb(f, [], desglose.get(f.id) ?? [])),
    clientes: (cli.data ?? []).map(mapClientFromDb),
    gastos: (gas.data ?? []).map(mapGastoFromDb),
    cobrosPagos: [],
    apuntes: ap.error ? [] : (ap.data ?? []).map(apunteDeFila),
    empresa: ajustes ? mapSettingsFromDb(ajustes) : { ...DEFAULT_COMPANY_SETTINGS },
  });
}
