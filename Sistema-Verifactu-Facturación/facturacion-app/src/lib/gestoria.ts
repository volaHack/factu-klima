'use client';

import { createClient } from '@/lib/supabase/client';

/**
 * ACCESO DE LA GESTORÍA
 *
 * Dos caras del mismo asunto:
 *  - La empresa invita a su gestoría por email y puede retirarle el
 *    acceso cuando quiera.
 *  - La gestoría acepta la invitación y, desde entonces, LEE las
 *    empresas que la han invitado. Sólo leer: las políticas de la
 *    migración 045 no le dan escritura en ninguna tabla.
 *
 * Aquí no hay ninguna comprobación de permisos: las hace la base de
 * datos. Si este archivo tuviera un fallo, lo peor que puede pasar es
 * que una consulta vuelva vacía — no que alguien vea lo que no debe.
 */

export interface Acceso {
  id: string;
  propietario_user_id: string;
  gestoria_email: string;
  gestoria_user_id: string | null;
  estado: 'invitado' | 'activo' | 'revocado';
  creado_en: string;
  aceptado_en: string | null;
}

export interface EmpresaGestionada {
  userId: string;
  nombre: string;
  nif: string;
  accesoId: string;
  desde: string | null;
}

export interface FacturaDeEmpresa {
  id: string;
  number: string;
  issue_date: string;
  client_name: string | null;
  subtotal: number;
  total_tax: number;
  total: number;
  status: string;
}

const db = () => createClient();

async function miId(): Promise<string | null> {
  const { data } = await db().auth.getUser();
  return data?.user?.id ?? null;
}

// ============================================================
// COMO EMPRESA — a quién le he dado acceso
// ============================================================

export async function misAccesos(): Promise<Acceso[]> {
  const yo = await miId();
  if (!yo) return [];
  const { data, error } = await db()
    .from('accesos_gestoria')
    .select('*')
    .eq('propietario_user_id', yo)
    .neq('estado', 'revocado')
    .order('creado_en', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Acceso[];
}

export async function invitarGestoria(email: string): Promise<void> {
  const yo = await miId();
  if (!yo) throw new Error('No hay sesión.');

  const limpio = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(limpio)) {
    throw new Error('Ese correo no tiene buena pinta. Repásalo.');
  }

  const { error } = await db()
    .from('accesos_gestoria')
    .insert({ propietario_user_id: yo, gestoria_email: limpio });

  if (error) {
    // 23505 = ya existe una invitación para ese correo.
    if (error.code === '23505') throw new Error('Ya habías invitado a ese correo.');
    throw new Error(error.message);
  }
}

/** Retirar el acceso es inmediato: la siguiente consulta de la gestoría ya no ve nada. */
export async function revocarAcceso(id: string): Promise<void> {
  const { error } = await db()
    .from('accesos_gestoria')
    .update({ estado: 'revocado', revocado_en: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// ============================================================
// COMO GESTORÍA — qué empresas llevo
// ============================================================

export async function invitacionesPendientes(): Promise<Acceso[]> {
  const { data, error } = await db()
    .from('accesos_gestoria')
    .select('*')
    .eq('estado', 'invitado')
    .order('creado_en', { ascending: false });
  if (error) throw new Error(error.message);
  // La política sólo deja ver las dirigidas a mi correo (o las mías como
  // propietaria): esas últimas se descartan aquí.
  const yo = await miId();
  return ((data ?? []) as Acceso[]).filter(a => a.propietario_user_id !== yo);
}

export async function aceptarInvitacion(id: string): Promise<void> {
  const { error } = await db().rpc('aceptar_acceso_gestoria', { p_id: id });
  if (error) throw new Error(error.message.replace(/^.*ACCESO:\s*/, ''));
}

export async function empresasQueLlevo(): Promise<EmpresaGestionada[]> {
  const yo = await miId();
  if (!yo) return [];

  interface FilaAcceso { id: string; propietario_user_id: string; aceptado_en: string | null }
  interface FilaAjustes {
    user_id: string;
    business_name: string | null;
    trade_name: string | null;
    nif: string | null;
  }

  const { data, error } = await db()
    .from('accesos_gestoria')
    .select('id, propietario_user_id, aceptado_en')
    .eq('gestoria_user_id', yo)
    .eq('estado', 'activo');
  if (error) throw new Error(error.message);

  const accesos = (data ?? []) as FilaAcceso[];
  if (!accesos.length) return [];

  const ids = accesos.map(a => a.propietario_user_id);
  const { data: filasAjustes } = await db()
    .from('company_settings')
    .select('user_id, business_name, trade_name, nif, updated_at')
    .in('user_id', ids)
    .order('updated_at', { ascending: false });

  // Puede haber más de una fila de ajustes por cuenta (guardados offline
  // antiguos): vale la más reciente, como en el resto del programa.
  const porCuenta = new Map<string, FilaAjustes>();
  for (const fila of (filasAjustes ?? []) as FilaAjustes[]) {
    if (!porCuenta.has(fila.user_id)) porCuenta.set(fila.user_id, fila);
  }

  return accesos.map((a: FilaAcceso) => {
    const datos = porCuenta.get(a.propietario_user_id);
    return {
      userId: a.propietario_user_id,
      accesoId: a.id,
      desde: a.aceptado_en,
      nombre: datos?.trade_name || datos?.business_name || 'Empresa sin nombre',
      nif: datos?.nif || '—',
    };
  }).sort((x, y) => x.nombre.localeCompare(y.nombre));
}

/** Las facturas selladas de una empresa en un año. Sólo lectura. */
export async function facturasDeEmpresa(userId: string, anio: number): Promise<FacturaDeEmpresa[]> {
  const { data, error } = await db()
    .from('invoices')
    .select('id, number, issue_date, client_name, subtotal, total_tax, total, status')
    .eq('user_id', userId)
    .not('sealed_at', 'is', null)
    .gte('issue_date', `${anio}-01-01`)
    .lte('issue_date', `${anio}-12-31`)
    .order('issue_date', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as FacturaDeEmpresa[];
}

export interface ResumenTrimestre {
  trimestre: 1 | 2 | 3 | 4;
  facturas: number;
  base: number;
  cuota: number;
  total: number;
}

/**
 * El reparto por trimestres, que es como se presentan los modelos.
 * Las anuladas no suman: siguen en los libros, pero no en el resultado.
 */
export function resumenPorTrimestre(facturas: FacturaDeEmpresa[]): ResumenTrimestre[] {
  const base: ResumenTrimestre[] = [1, 2, 3, 4].map(t => ({
    trimestre: t as 1 | 2 | 3 | 4, facturas: 0, base: 0, cuota: 0, total: 0,
  }));

  for (const f of facturas) {
    if (f.status === 'anulada') continue;
    const mes = Number(f.issue_date.slice(5, 7));
    const t = Math.min(3, Math.floor((mes - 1) / 3)) as 0 | 1 | 2 | 3;
    base[t].facturas += 1;
    base[t].base += Number(f.subtotal) || 0;
    base[t].cuota += Number(f.total_tax) || 0;
    base[t].total += Number(f.total) || 0;
  }

  return base.map(t => ({
    ...t,
    base: Math.round(t.base * 100) / 100,
    cuota: Math.round(t.cuota * 100) / 100,
    total: Math.round(t.total * 100) / 100,
  }));
}
