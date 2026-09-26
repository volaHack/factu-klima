import 'server-only';

/**
 * VARIAS EMPRESAS — EN EL SERVIDOR
 *
 * Cada empresa es una cuenta con sus datos aparte; aquí sólo se agrupan y
 * se pasa de una a otra. El paso se hace con un enlace de acceso de un solo
 * uso que genera el servidor para la cuenta de destino, y sólo si las dos
 * están en el mismo grupo. El navegador nunca guarda credenciales de las
 * otras empresas.
 */

import crypto from 'node:crypto';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { MAX_EMPRESAS, MINUTOS_CODIGO, codigoDesdeBytes, correoParaEmpresaNueva, normalizarCodigo, planDeUnion } from './grupo';

export interface Empresa {
  id: string;
  nombre: string;
  nif: string | null;
  /** Con este correo se entra en ella si algún día se separa del grupo. */
  correo: string | null;
  actual: boolean;
  /** Aún no ha rellenado los datos de la empresa. */
  sinConfigurar: boolean;
}

type Db = ReturnType<typeof supabaseServicio>;

async function grupoDe(db: Db, userId: string): Promise<string | null> {
  const { data } = await db.from('grupos_empresas').select('grupo_id').eq('user_id', userId).maybeSingle();
  return (data?.grupo_id as string | undefined) ?? null;
}

async function miembros(db: Db, grupo: string): Promise<string[]> {
  const { data } = await db.from('grupos_empresas').select('user_id').eq('grupo_id', grupo);
  return (data ?? []).map(f => f.user_id as string);
}

/** Las empresas del grupo de `userId` (ella misma incluida, primero). */
export async function empresasDe(userId: string): Promise<Empresa[]> {
  const db = supabaseServicio();
  const grupo = await grupoDe(db, userId);
  const ids = grupo ? await miembros(db, grupo) : [userId];
  if (!ids.includes(userId)) ids.unshift(userId);

  const { data: ajustes } = await db.from('company_settings')
    .select('user_id, business_name, trade_name, nif, updated_at').in('user_id', ids)
    .order('updated_at', { ascending: false });
  const nombres = new Map<string, { nombre: string; nif: string | null }>();
  for (const a of ajustes ?? []) {
    if (nombres.has(a.user_id as string)) continue;
    const nombre = String(a.trade_name || a.business_name || '').trim();
    if (nombre) nombres.set(a.user_id as string, { nombre, nif: (a.nif as string) || null });
  }

  const empresas = await Promise.all(ids.map(async (id): Promise<Empresa> => {
    const { data } = await db.auth.admin.getUserById(id);
    const correo = data?.user?.email ?? null;
    const conocida = nombres.get(id);
    if (conocida) return { id, ...conocida, correo, actual: id === userId, sinConfigurar: false };
    // Sin datos de empresa todavía: el nombre que se le puso al crearla.
    const meta = data?.user?.user_metadata as { full_name?: string } | undefined;
    return { id, nombre: meta?.full_name?.trim() || correo || 'Empresa sin nombre', nif: null, correo, actual: id === userId, sinConfigurar: true };
  }));
  return empresas.sort((a, b) => Number(b.actual) - Number(a.actual) || a.nombre.localeCompare(b.nombre, 'es'));
}

/** El enlace de un solo uso para entrar en `destino`, si es del grupo de `userId`. */
export async function accesoA(userId: string, destino: string): Promise<string> {
  const db = supabaseServicio();
  const grupo = await grupoDe(db, userId);
  if (!grupo || destino === userId || (await grupoDe(db, destino)) !== grupo) {
    throw new ErrorEmpresas('Esa empresa no está unida a esta cuenta.', 403);
  }
  return enlaceDeEntrada(db, destino);
}

async function enlaceDeEntrada(db: Db, destino: string): Promise<string> {
  const { data: u } = await db.auth.admin.getUserById(destino);
  const correo = u?.user?.email;
  if (!correo) throw new ErrorEmpresas('No se encuentra la cuenta de esa empresa.', 404);
  const { data, error } = await db.auth.admin.generateLink({ type: 'magiclink', email: correo });
  const hash = data?.properties?.hashed_token;
  if (error || !hash) throw new ErrorEmpresas('No se ha podido preparar el cambio de empresa. Prueba otra vez.', 502);
  return hash;
}

async function unir(db: Db, a: string, b: string): Promise<void> {
  const [ga, gb] = await Promise.all([grupoDe(db, a), grupoDe(db, b)]);
  const plan = planDeUnion({ id: a, grupo: ga }, { id: b, grupo: gb }, crypto.randomUUID());
  if (plan.tipo === 'nada') return;

  const cuantos = async (g: string | null) => (g ? (await miembros(db, g)).length : 1);
  if ((await cuantos(ga)) + (await cuantos(gb)) > MAX_EMPRESAS) {
    throw new ErrorEmpresas(`Como mucho ${MAX_EMPRESAS} empresas juntas.`, 400);
  }

  if (plan.tipo === 'fundir') {
    const { error } = await db.from('grupos_empresas').update({ grupo_id: plan.grupo }).eq('grupo_id', plan.desde);
    if (error) throw new ErrorEmpresas('No se han podido unir las empresas.', 500);
    return;
  }
  const { error } = await db.from('grupos_empresas').upsert(plan.entran.map(user_id => ({ user_id, grupo_id: plan.grupo })));
  if (error) throw new ErrorEmpresas('No se han podido unir las empresas.', 500);
}

/**
 * Da de alta una empresa nueva unida a la del titular y devuelve el enlace
 * para entrar ya en ella. Al entrar le sale el asistente de primeros pasos
 * para poner sus datos, como a cualquier cuenta nueva.
 */
export async function crearEmpresa(titular: { id: string; email?: string | null }, nombre: string): Promise<string> {
  const db = supabaseServicio();
  const limpio = nombre.trim().replace(/\s+/g, ' ').slice(0, 120);
  if (limpio.length < 2) throw new ErrorEmpresas('Pon el nombre de la empresa.', 400);
  if (!titular.email) throw new ErrorEmpresas('Tu cuenta no tiene correo: no se puede crear otra empresa desde ella.', 400);

  const grupo = await grupoDe(db, titular.id);
  if (grupo && (await miembros(db, grupo)).length >= MAX_EMPRESAS) {
    throw new ErrorEmpresas(`Como mucho ${MAX_EMPRESAS} empresas juntas.`, 400);
  }

  let nuevo: string | null = null;
  for (let intento = 0; intento < 3 && !nuevo; intento++) {
    const correo = correoParaEmpresaNueva(titular.email, limpio, crypto.randomBytes(3).toString('hex'));
    const { data, error } = await db.auth.admin.createUser({
      email: correo,
      email_confirm: true,
      // Nadie entra con contraseña en esta cuenta: se entra desde el grupo.
      password: crypto.randomBytes(32).toString('base64url'),
      user_metadata: { full_name: limpio, empresa_creada_desde: titular.id },
    });
    if (data?.user) nuevo = data.user.id;
    else if (error && !/already|registered|exists/i.test(error.message)) {
      console.error('Empresas: no se ha podido crear la cuenta', error.message);
      throw new ErrorEmpresas('No se ha podido crear la empresa. Prueba otra vez.', 502);
    }
  }
  if (!nuevo) throw new ErrorEmpresas('No se ha podido crear la empresa. Prueba otra vez.', 502);

  await unir(db, titular.id, nuevo);
  return enlaceDeEntrada(db, nuevo);
}

/** Un código de un solo uso para unir, desde otra cuenta, esta. */
export async function nuevoCodigo(userId: string): Promise<{ codigo: string; caduca: string }> {
  const db = supabaseServicio();
  await db.from('codigos_vinculo').delete().eq('user_id', userId);
  const caduca = new Date(Date.now() + MINUTOS_CODIGO * 60_000).toISOString();
  for (let intento = 0; intento < 5; intento++) {
    const codigo = codigoDesdeBytes(crypto.randomBytes(8));
    const { error } = await db.from('codigos_vinculo').insert({ codigo, user_id: userId, caduca_en: caduca });
    if (!error) return { codigo, caduca };
  }
  throw new ErrorEmpresas('No se ha podido generar el código. Prueba otra vez.', 500);
}

/** Canjea el código de otra cuenta y une las dos. */
export async function canjearCodigo(userId: string, entrada: string): Promise<void> {
  const codigo = normalizarCodigo(entrada);
  if (!codigo) throw new ErrorEmpresas('El código tiene 8 letras y números, como K7PM-3QXA.', 400);
  const db = supabaseServicio();
  const { data: fila } = await db.from('codigos_vinculo').select('user_id, caduca_en').eq('codigo', codigo).maybeSingle();
  if (!fila || new Date(fila.caduca_en as string).getTime() < Date.now()) {
    throw new ErrorEmpresas('Ese código no vale o ha caducado. Saca uno nuevo en la otra cuenta.', 400);
  }
  if (fila.user_id === userId) throw new ErrorEmpresas('Ese código es de esta misma cuenta: escríbelo en la otra.', 400);
  // Un solo uso: se borra antes de unir.
  await db.from('codigos_vinculo').delete().eq('codigo', codigo);
  await unir(db, fila.user_id as string, userId);
}

/** Saca `objetivo` del grupo (sus datos no se tocan: sigue siendo su cuenta). */
export async function separar(userId: string, objetivo: string): Promise<void> {
  const db = supabaseServicio();
  const grupo = await grupoDe(db, userId);
  if (!grupo || (await grupoDe(db, objetivo)) !== grupo) {
    throw new ErrorEmpresas('Esa empresa no está unida a esta cuenta.', 403);
  }
  await db.from('grupos_empresas').delete().eq('user_id', objetivo);
  // Un grupo de una sola empresa no es un grupo.
  const quedan = await miembros(db, grupo);
  if (quedan.length < 2) await db.from('grupos_empresas').delete().eq('grupo_id', grupo);
}

export class ErrorEmpresas extends Error {
  constructor(mensaje: string, readonly estado: number) { super(mensaje); }
}
