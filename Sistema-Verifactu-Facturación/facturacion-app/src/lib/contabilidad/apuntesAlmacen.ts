'use client';

/**
 * Dónde viven los apuntes a mano: la tabla `apuntes_contables` (migración
 * 052) o, mientras no exista, los metadatos de la cuenta con un tope. Al
 * aparecer la tabla, lo que había en la cuenta se pasa a ella.
 */

import { createClient } from '../supabase/client';
import { guardarEnCuenta, leerDeCuenta } from '../cuentaMetadatos';
import type { ApunteContable, LineaApunte, Periodicidad, Plantilla, Prestamo } from './apuntes';

export type AlmacenApuntes = 'tabla' | 'cuenta';

const CAMPO = 'klima_apuntes';
/** En la cuenta van dentro del token de sesión: pocos. */
export const MAX_EN_CUENTA = 25;

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
function faltaLaTabla(error: any): boolean {
  const code: string = error?.code ?? '';
  return code === 'PGRST205' || code === '42P01' || /does not exist|could not find the table/i.test(error?.message ?? '');
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export function apunteDeFila(f: any): ApunteContable {
  return {
    id: f.id, concepto: f.concepto, plantilla: f.plantilla as Plantilla, periodicidad: f.periodicidad as Periodicidad,
    fecha: String(f.fecha).slice(0, 10), hasta: f.hasta ? String(f.hasta).slice(0, 10) : undefined,
    lineas: (Array.isArray(f.lineas) ? f.lineas : []).map((l: LineaApunte) => ({ cuenta: String(l.cuenta), debe: Number(l.debe) || 0, haber: Number(l.haber) || 0 })),
    prestamo: f.prestamo ?? undefined,
  };
}

const aFila = (a: ApunteContable, userId: string) => ({
  id: a.id, user_id: userId, concepto: a.concepto, plantilla: a.plantilla, periodicidad: a.periodicidad,
  fecha: a.fecha, hasta: a.hasta ?? null, lineas: a.lineas, prestamo: a.prestamo ?? null, actualizado_en: new Date().toISOString(),
});

// Forma corta para los metadatos.
interface Compacto { i: string; c: string; t: Plantilla; p: Periodicidad; f: string; h?: string; l: [string, number, number][]; pr?: Prestamo }
const aCompacto = (a: ApunteContable): Compacto => ({
  i: a.id, c: a.concepto.slice(0, 80), t: a.plantilla, p: a.periodicidad, f: a.fecha, ...(a.hasta ? { h: a.hasta } : {}),
  l: a.lineas.map(x => [x.cuenta, x.debe, x.haber]), ...(a.prestamo ? { pr: a.prestamo } : {}),
});
const deCompacto = (x: Compacto): ApunteContable => ({
  id: x.i, concepto: x.c, plantilla: x.t, periodicidad: x.p, fecha: x.f, hasta: x.h,
  lineas: (x.l ?? []).map(([cuenta, debe, haber]) => ({ cuenta, debe, haber })), prestamo: x.pr,
});

async function uid(): Promise<string> {
  const { data } = await createClient().auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error('Sesión no válida. Vuelve a entrar.');
  return id;
}

export async function getApuntes(): Promise<{ apuntes: ApunteContable[]; almacen: AlmacenApuntes }> {
  const db = createClient();
  const yo = await uid();
  const { data, error } = await db.from('apuntes_contables').select('*').eq('user_id', yo).order('fecha', { ascending: true });
  const enCuenta = (await leerDeCuenta<Compacto>(CAMPO).catch(() => [] as Compacto[])).map(deCompacto);
  if (error) {
    if (faltaLaTabla(error)) return { apuntes: enCuenta, almacen: 'cuenta' };
    throw new Error(error.message);
  }
  // La tabla ya existe: lo que quedara en la cuenta se pasa a ella.
  if (enCuenta.length) {
    const { error: e2 } = await db.from('apuntes_contables').upsert(enCuenta.map(a => aFila(a, yo)));
    if (!e2) {
      await guardarEnCuenta(CAMPO, [], MAX_EN_CUENTA).catch(() => {});
      const ids = new Set((data ?? []).map((f: { id: string }) => f.id));
      return { apuntes: [...(data ?? []).map(apunteDeFila), ...enCuenta.filter(a => !ids.has(a.id))], almacen: 'tabla' };
    }
  }
  return { apuntes: (data ?? []).map(apunteDeFila), almacen: 'tabla' };
}

export async function guardarApunte(a: ApunteContable): Promise<void> {
  const { apuntes, almacen } = await getApuntes();
  if (almacen === 'tabla') {
    const { error } = await createClient().from('apuntes_contables').upsert(aFila(a, await uid()));
    if (error) throw new Error(error.message);
    return;
  }
  const lista = apuntes.some(x => x.id === a.id) ? apuntes.map(x => (x.id === a.id ? a : x)) : [...apuntes, a];
  if (lista.length > MAX_EN_CUENTA) {
    throw new Error(`Sin la migración 052 caben ${MAX_EN_CUENTA} apuntes. Aplícala en la base de datos para guardar todos los que quieras.`);
  }
  await guardarEnCuenta(CAMPO, lista.map(aCompacto), MAX_EN_CUENTA);
}

export async function borrarApunte(id: string): Promise<void> {
  const { apuntes, almacen } = await getApuntes();
  if (almacen === 'tabla') {
    const { error } = await createClient().from('apuntes_contables').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return;
  }
  await guardarEnCuenta(CAMPO, apuntes.filter(x => x.id !== id).map(aCompacto), MAX_EN_CUENTA);
}
