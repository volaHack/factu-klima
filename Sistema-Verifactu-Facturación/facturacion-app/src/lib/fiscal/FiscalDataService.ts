/**
 * FiscalDataService — la única puerta por la que los modelos leen datos.
 *
 * Los modelos (`aeat/modelo347.ts`, …) son funciones puras sobre los tipos
 * del dominio: no saben que existe Supabase ni React. Este servicio es el
 * que va a buscar los datos reales y se los pasa ya montados.
 *
 * Todo pasa por `storage.ts`, que es quien aplica el filtro por usuario
 * (RLS de Supabase + `user_id`). No se consulta la base de datos por otro
 * lado: así los datos fiscales heredan exactamente la misma autorización
 * que el resto del programa y no hay una segunda puerta que auditar.
 */

import { getInvoices, getClients, getGastos, getCompanySettings } from '../storage';
import type { Invoice, Gasto, Client, CompanySettings } from '../types';

export interface DatosFiscales {
  facturas: Invoice[];
  gastos: Gasto[];
  clientes: Client[];
  empresa: CompanySettings;
}

/**
 * Carga todo lo que puede necesitar cualquier modelo del ejercicio.
 *
 * Se filtra por ejercicio aquí y no en cada modelo para no recorrer cinco
 * veces la misma lista. El filtro es por AÑO NATURAL de la fecha de
 * emisión, que es el criterio de todos estos modelos.
 */
export async function cargarDatosFiscales(ejercicio: number): Promise<DatosFiscales> {
  const [facturas, clientes, gastos, empresa] = await Promise.all([
    getInvoices(),
    getClients(),
    getGastos(),
    getCompanySettings(),
  ]);

  return {
    facturas: facturas.filter(f => f.issueDate?.slice(0, 4) === String(ejercicio)),
    gastos: gastos.filter(g => g.fecha?.slice(0, 4) === String(ejercicio)),
    clientes,
    empresa,
  };
}

/**
 * Los ejercicios sobre los que hay algo que declarar, del más reciente al
 * más antiguo. Se saca de los datos y no de un rango inventado: si la
 * empresa empezó a facturar en 2026, no tiene sentido ofrecerle 2019.
 */
export function ejerciciosDisponibles(facturas: Invoice[], gastos: Gasto[] = []): number[] {
  const años = new Set<number>();
  for (const f of facturas) {
    const a = Number(f.issueDate?.slice(0, 4));
    if (a) años.add(a);
  }
  for (const g of gastos) {
    const a = Number(g.fecha?.slice(0, 4));
    if (a) años.add(a);
  }
  // El año en curso siempre está, aunque todavía no haya nada emitido.
  años.add(new Date().getFullYear());
  return [...años].sort((a, b) => b - a);
}

/**
 * Qué régimen de impuesto indirecto tiene la empresa.
 *
 * Es lo que decide si le tocan los modelos de la AEAT (IVA: 303) o los de
 * la Agencia Tributaria Canaria (IGIC: 420, 415, 425). El programa lo
 * guarda como un interruptor de empresa (`igicEnabled`), no por factura,
 * y eso es correcto: un negocio tributa en uno u otro, no en los dos a la
 * vez para sus entregas.
 */
export function regimenIndirecto(empresa: CompanySettings | null | undefined): 'IVA' | 'IGIC' {
  return empresa?.igicEnabled ? 'IGIC' : 'IVA';
}
