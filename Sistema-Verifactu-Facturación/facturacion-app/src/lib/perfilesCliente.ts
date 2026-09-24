'use client';

/**
 * PERFILES DE TRABAJO — LO QUE VIVE EN EL NAVEGADOR
 *
 * Tres cosas:
 *  1. La lista de perfiles de la cuenta, leída de Supabase y guardada
 *     también aquí, para que el TPV pueda elegir cajero sin conexión.
 *  2. Quién está trabajando en ESTE equipo ahora mismo. Es por equipo a
 *     propósito: en la oficina puede estar la titular y en el mostrador,
 *     a la vez, el cajero, con la misma cuenta.
 *  3. La actividad (quién emitió, quién abrió la caja). Se apunta «de
 *     buena fe»: si no hay conexión espera en una bandeja y se envía al
 *     volver; si nunca se puede apuntar, NUNCA frena lo que se estaba
 *     haciendo. Emitir una factura no puede fallar por no poder decir
 *     quién la emitió.
 *
 * DÓNDE SE GUARDAN
 *
 * Lo normal es la tabla `perfiles_trabajo` (migración 050). Pero esa
 * migración hay que aplicarla a mano en Supabase, y mientras tanto la
 * función se quedaba apagada con un aviso. Ahora, si la tabla no existe,
 * los perfiles se guardan en la propia cuenta (los metadatos del usuario
 * de Supabase Auth, que existen siempre y sólo puede tocar su dueño):
 * funcionan ya, en todos los equipos. Lo que no cabe ahí es el historial
 * de actividad, que en ese modo se queda en cada equipo.
 *
 * El día que se aplique la 050, al cargar se ve la tabla vacía y los
 * perfiles de la cuenta se pasan a ella solos, con el historial que haya
 * en el equipo; después se quitan de la cuenta.
 */

import { useSyncExternalStore } from 'react';
import { createClient } from './supabase/client';
import {
  hashPin, nuevaSal, ordenarPerfiles, type AccionPerfil, type Perfil, type RolPerfil,
} from './perfiles';

const CLAVE_CACHE = 'klima-perfiles';
const CLAVE_ACTIVO = 'klima-perfil-activo';
const CLAVE_BANDEJA = 'klima-actividad-pendiente';
const CLAVE_BLOQUEO = 'klima-perfil-bloqueo-min';
const CLAVE_HISTORIAL = 'klima-actividad-local';
const MAX_BANDEJA = 300;
const MAX_HISTORIAL = 200;
/** Nombre del campo en los metadatos de la cuenta. */
const CAMPO_CUENTA = 'klima_perfiles';
/** Los metadatos viajan en el token de sesión: se ponen límites. */
export const MAX_PERFILES_EN_CUENTA = 20;

/** `tabla`: migración 050 aplicada. `cuenta`: metadatos de Supabase Auth. */
export type Almacen = 'tabla' | 'cuenta';

export interface EstadoPerfiles {
  cargado: boolean;
  /** ¿Se pueden usar perfiles? (hay sesión y se han podido leer). */
  disponible: boolean;
  almacen: Almacen;
  cuenta: string | null;
  perfiles: Perfil[];
  /** El perfil que está usando este equipo, si lo hay. */
  activoId: string | null;
}

let estado: EstadoPerfiles = { cargado: false, disponible: false, almacen: 'tabla', cuenta: null, perfiles: [], activoId: null };
const oyentes = new Set<() => void>();
const avisar = () => { for (const o of oyentes) o(); };
const fijar = (parcial: Partial<EstadoPerfiles>) => { estado = { ...estado, ...parcial }; avisar(); };

const leer = <T,>(clave: string): T | null => {
  try { const v = localStorage.getItem(clave); return v ? JSON.parse(v) as T : null; } catch { return null; }
};
const escribir = (clave: string, valor: unknown) => {
  try { localStorage.setItem(clave, JSON.stringify(valor)); } catch { /* sin almacenamiento */ }
};

/** La tabla no existe: la migración 050 no se ha aplicado todavía. */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
function faltaLaTabla(error: any): boolean {
  const code: string = error?.code ?? '';
  const msg: string = error?.message ?? '';
  return code === 'PGRST205' || code === '42P01' || /does not exist|could not find the table/i.test(msg);
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
function desdeBd(f: any): Perfil {
  return {
    id: f.id, nombre: f.nombre, rol: f.rol as RolPerfil, color: f.color,
    pinHash: f.pin_hash ?? null, pinSal: f.pin_sal ?? null, activo: f.activo !== false, creadoEn: f.creado_en,
  };
}

// ------------------------------------------------------------
// Perfiles guardados en la cuenta (sin migración)
// ------------------------------------------------------------

/** Forma corta: los metadatos van dentro del token, cada byte cuenta. */
interface PerfilCompacto { i: string; n: string; r: RolPerfil; c: string; h?: string | null; s?: string | null; a: boolean; t?: string }

const aCompacto = (p: Perfil): PerfilCompacto => ({
  i: p.id, n: p.nombre, r: p.rol, c: p.color, h: p.pinHash ?? null, s: p.pinSal ?? null, a: p.activo, t: p.creadoEn,
});
const deCompacto = (c: PerfilCompacto): Perfil => ({
  id: c.i, nombre: c.n, rol: c.r, color: c.c, pinHash: c.h ?? null, pinSal: c.s ?? null, activo: c.a !== false, creadoEn: c.t,
});

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
function perfilesDeMetadatos(meta: any): Perfil[] {
  const lista = meta?.[CAMPO_CUENTA];
  if (!Array.isArray(lista)) return [];
  return lista
    .filter((c): c is PerfilCompacto => !!c && typeof c.i === 'string' && typeof c.n === 'string')
    .map(deCompacto);
}

async function leerDeLaCuenta(): Promise<Perfil[]> {
  const { data, error } = await createClient().auth.getUser();
  if (error) throw error;
  return perfilesDeMetadatos(data.user?.user_metadata);
}

async function escribirEnLaCuenta(perfiles: Perfil[] | null): Promise<void> {
  const { error } = await createClient().auth.updateUser({
    data: { [CAMPO_CUENTA]: perfiles ? perfiles.map(aCompacto) : null },
  });
  if (error) throw new Error(error.message);
}

/** Con la tabla ya creada: se pasan a ella los perfiles que vivían en la cuenta. */
async function pasarALaTabla(cuenta: string, perfiles: Perfil[]): Promise<boolean> {
  const { error } = await createClient().from('perfiles_trabajo').upsert(perfiles.map(p => ({
    id: p.id, user_id: cuenta, nombre: p.nombre, rol: p.rol, color: p.color,
    pin_hash: p.pinHash ?? null, pin_sal: p.pinSal ?? null, activo: p.activo,
    ...(p.creadoEn ? { creado_en: p.creadoEn } : {}),
  })));
  if (error) return false;
  // El historial que se apuntó en este equipo sube con el resto.
  const historial = leer<Apunte[]>(CLAVE_HISTORIAL) ?? [];
  if (historial.length) {
    const bandeja = leer<Apunte[]>(CLAVE_BANDEJA) ?? [];
    escribir(CLAVE_BANDEJA, [...historial.slice().reverse(), ...bandeja].slice(-MAX_BANDEJA));
    try { localStorage.removeItem(CLAVE_HISTORIAL); } catch { /* */ }
  }
  try { await escribirEnLaCuenta(null); } catch { /* se reintenta en la próxima carga; la tabla ya manda */ }
  return true;
}

async function cuentaActual(): Promise<string | null> {
  try {
    const { data } = await createClient().auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

function activoGuardado(cuenta: string | null): string | null {
  const a = leer<{ cuenta: string; id: string }>(CLAVE_ACTIVO);
  return a && a.cuenta === cuenta ? a.id : null;
}

let cargando: Promise<void> | null = null;

/** Lee los perfiles (de Supabase, o de la copia local sin conexión). */
export function cargarPerfiles(forzar = false): Promise<void> {
  if (cargando && !forzar) return cargando;
  cargando = (async () => {
    const cuenta = await cuentaActual();
    const cache = leer<{ cuenta: string; disponible: boolean; almacen?: Almacen; perfiles: Perfil[] }>(CLAVE_CACHE);
    const cacheValida = cache && cache.cuenta === cuenta ? cache : null;
    // Lo guardado primero: el selector sale al instante y sin conexión.
    if (cacheValida && !estado.cargado) {
      fijar({
        cargado: true, cuenta, disponible: cacheValida.disponible, almacen: cacheValida.almacen ?? 'tabla',
        perfiles: cacheValida.perfiles, activoId: activoGuardado(cuenta),
      });
    }
    if (!cuenta) { fijar({ cargado: true, cuenta: null, disponible: false, perfiles: [], activoId: null }); return; }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      if (!cacheValida) fijar({ cargado: true, cuenta, disponible: false, perfiles: [], activoId: null });
      return;
    }

    let almacen: Almacen = 'tabla';
    let perfiles: Perfil[];
    const { data, error } = await createClient()
      .from('perfiles_trabajo').select('*').order('creado_en', { ascending: true });
    if (error && !faltaLaTabla(error)) {
      // Fallo pasajero: se queda lo que hubiera.
      if (!cacheValida) fijar({ cargado: true, cuenta, disponible: false, perfiles: [], activoId: null });
      return;
    }
    if (error) {
      // Sin migración 050: los perfiles viven en la cuenta.
      almacen = 'cuenta';
      sinTabla = true;
      try {
        perfiles = await leerDeLaCuenta();
      } catch {
        if (!cacheValida) fijar({ cargado: true, cuenta, disponible: false, perfiles: [], activoId: null });
        return;
      }
    } else {
      sinTabla = false;
      perfiles = (data ?? []).map(desdeBd);
      if (perfiles.length === 0) {
        // Recién aplicada la 050: lo que hubiera en la cuenta pasa a la tabla.
        const enCuenta = await leerDeLaCuenta().catch(() => [] as Perfil[]);
        if (enCuenta.length && await pasarALaTabla(cuenta, enCuenta)) perfiles = enCuenta;
      }
    }

    perfiles = ordenarPerfiles<Perfil>(perfiles);
    escribir(CLAVE_CACHE, { cuenta, disponible: true, almacen, perfiles });
    let activoId = activoGuardado(cuenta);
    // El perfil activo se borró o se desactivó en otro equipo: fuera.
    if (activoId && !perfiles.some(p => p.id === activoId && p.activo)) activoId = null;
    fijar({ cargado: true, cuenta, disponible: true, almacen, perfiles, activoId });
    if (almacen === 'tabla') void vaciarBandeja();
  })().finally(() => { cargando = null; });
  return cargando;
}

// ------------------------------------------------------------
// Suscripción para React
// ------------------------------------------------------------

function suscribirse(alCambiar: () => void): () => void {
  oyentes.add(alCambiar);
  // Otra pestaña del mismo equipo cambió de perfil.
  const alAlmacen = (e: StorageEvent) => {
    if (e.key === CLAVE_ACTIVO) fijar({ activoId: activoGuardado(estado.cuenta) });
  };
  window.addEventListener('storage', alAlmacen);
  const alVolverLaRed = () => { void vaciarBandeja(); };
  window.addEventListener('online', alVolverLaRed);
  if (!estado.cargado && !cargando) void cargarPerfiles();
  return () => {
    oyentes.delete(alCambiar);
    window.removeEventListener('storage', alAlmacen);
    window.removeEventListener('online', alVolverLaRed);
  };
}

const ESTADO_SERVIDOR: EstadoPerfiles = { cargado: false, disponible: false, almacen: 'tabla', cuenta: null, perfiles: [], activoId: null };

export function usePerfiles(): EstadoPerfiles & { activo: Perfil | null; enUso: boolean } {
  const e = useSyncExternalStore(suscribirse, () => estado, () => ESTADO_SERVIDOR);
  const activo = e.perfiles.find(p => p.id === e.activoId && p.activo) ?? null;
  // «En uso»: la cuenta tiene perfiles y hay que saber quién trabaja.
  const enUso = e.disponible && e.perfiles.some(p => p.activo);
  return { ...e, activo, enUso };
}

export function perfilActivo(): Perfil | null {
  return estado.perfiles.find(p => p.id === estado.activoId && p.activo) ?? null;
}

// ------------------------------------------------------------
// Quién trabaja en este equipo
// ------------------------------------------------------------

export function entrarComo(perfil: Perfil): void {
  const anterior = perfilActivo();
  // La salida un milisegundo antes: en el historial, «cerró» va antes que
  // «empezó» aunque las dos ocurran en el mismo instante.
  if (anterior && anterior.id !== perfil.id) registrarActividad('salida', { en: new Date(Date.now() - 1) }, anterior);
  escribir(CLAVE_ACTIVO, { cuenta: estado.cuenta, id: perfil.id, desde: new Date().toISOString() });
  fijar({ activoId: perfil.id });
  registrarActividad('entrada', {}, perfil);
}

/** Deja el equipo sin perfil: la siguiente persona tiene que elegir el suyo. */
export function cerrarPerfil(): void {
  const anterior = perfilActivo();
  if (anterior) registrarActividad('salida', {}, anterior);
  try { localStorage.removeItem(CLAVE_ACTIVO); } catch { /* */ }
  fijar({ activoId: null });
}

/** Minutos sin tocar nada tras los que se pide el perfil otra vez (0 = nunca). Por equipo. */
export function minutosDeBloqueo(): number {
  const v = leer<number>(CLAVE_BLOQUEO);
  return typeof v === 'number' && v > 0 ? v : 0;
}
export function fijarMinutosDeBloqueo(min: number): void {
  escribir(CLAVE_BLOQUEO, min);
  avisar();
}

// ------------------------------------------------------------
// Gestión del equipo (sólo con conexión)
// ------------------------------------------------------------

/**
 * Guarda un perfil. `pin`: undefined = no tocarlo, '' = quitarlo,
 * cifras = ponerlo nuevo.
 */
export async function guardarPerfil(perfil: Perfil, pin?: string, { activar = false }: { activar?: boolean } = {}): Promise<void> {
  const cuenta = estado.cuenta ?? await cuentaActual();
  if (!cuenta) throw new Error('No hay sesión.');
  let pinHash = perfil.pinHash ?? null;
  let pinSal = perfil.pinSal ?? null;
  if (pin === '') { pinHash = null; pinSal = null; }
  else if (pin) { pinSal = nuevaSal(); pinHash = await hashPin(pin, pinSal); }
  if (estado.almacen === 'cuenta') {
    // Se relee de la cuenta justo antes: otro equipo pudo cambiar algo.
    const lista = await leerDeLaCuenta();
    const nuevo: Perfil = {
      ...perfil, nombre: perfil.nombre.trim(), pinHash, pinSal,
      creadoEn: perfil.creadoEn ?? lista.find(p => p.id === perfil.id)?.creadoEn ?? new Date().toISOString(),
    };
    const i = lista.findIndex(p => p.id === perfil.id);
    if (i === -1 && lista.length >= MAX_PERFILES_EN_CUENTA) {
      throw new Error(`Caben ${MAX_PERFILES_EN_CUENTA} perfiles. Borra alguno que ya no se use.`);
    }
    if (i === -1) lista.push(nuevo); else lista[i] = nuevo;
    await escribirEnLaCuenta(lista);
  } else {
    const fila = {
      id: perfil.id, user_id: cuenta, nombre: perfil.nombre.trim(), rol: perfil.rol, color: perfil.color,
      pin_hash: pinHash, pin_sal: pinSal, activo: perfil.activo, actualizado_en: new Date().toISOString(),
    };
    const { error } = await createClient().from('perfiles_trabajo').upsert(fila);
    if (error) throw new Error(error.message);
  }
  // Activarlo ANTES de recargar la lista: si no, en medio hay un instante
  // con perfiles y sin nadie elegido, y el selector asoma.
  if (activar) escribir(CLAVE_ACTIVO, { cuenta, id: perfil.id, desde: new Date().toISOString() });
  await cargarPerfiles(true);
  if (activar) registrarActividad('entrada', {});
}

export async function borrarPerfil(id: string): Promise<void> {
  if (estado.almacen === 'cuenta') {
    const lista = await leerDeLaCuenta();
    await escribirEnLaCuenta(lista.filter(p => p.id !== id));
  } else {
    const { error } = await createClient().from('perfiles_trabajo').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }
  if (estado.activoId === id) cerrarPerfil();
  await cargarPerfiles(true);
}

// ------------------------------------------------------------
// Actividad
// ------------------------------------------------------------

interface Apunte {
  perfil_id: string;
  perfil_nombre: string;
  accion: AccionPerfil;
  documento_id: string | null;
  detalle: string | null;
  en: string;
}

let sinTabla = false;

/**
 * Apunta lo que ha hecho el perfil activo (o el indicado). No espera ni
 * lanza: quien lo llama sigue con lo suyo pase lo que pase aquí.
 */
export function registrarActividad(
  accion: AccionPerfil,
  { documentoId, detalle, en }: { documentoId?: string; detalle?: string; en?: Date },
  quien: Perfil | null = perfilActivo(),
): void {
  if (!quien || !estado.disponible || typeof window === 'undefined') return;
  const apunte: Apunte = {
    perfil_id: quien.id, perfil_nombre: quien.nombre, accion,
    documento_id: documentoId ?? null, detalle: detalle ?? null, en: (en ?? new Date()).toISOString(),
  };
  if (estado.almacen === 'cuenta') {
    // Sin tabla de actividad: se queda en este equipo, lo más nuevo delante.
    const historial = leer<Apunte[]>(CLAVE_HISTORIAL) ?? [];
    escribir(CLAVE_HISTORIAL, [apunte, ...historial].slice(0, MAX_HISTORIAL));
    return;
  }
  const bandeja = leer<Apunte[]>(CLAVE_BANDEJA) ?? [];
  bandeja.push(apunte);
  escribir(CLAVE_BANDEJA, bandeja.slice(-MAX_BANDEJA));
  void vaciarBandeja();
}

let vaciando = false;
async function vaciarBandeja(): Promise<void> {
  if (vaciando || sinTabla || !navigator.onLine) return;
  const bandeja = leer<Apunte[]>(CLAVE_BANDEJA) ?? [];
  if (bandeja.length === 0) return;
  const cuenta = estado.cuenta ?? await cuentaActual();
  if (!cuenta) return;
  vaciando = true;
  try {
    const { error } = await createClient()
      .from('actividad_perfiles')
      .insert(bandeja.map(a => ({ ...a, user_id: cuenta })));
    if (!error) {
      // Sólo se quitan los que se enviaron: pudieron entrar más mientras tanto.
      const ahora = leer<Apunte[]>(CLAVE_BANDEJA) ?? [];
      escribir(CLAVE_BANDEJA, ahora.slice(bandeja.length));
    } else if (faltaLaTabla(error)) {
      sinTabla = true;
    }
  } catch {
    /* sin red: se reintenta al volver la conexión */
  } finally {
    vaciando = false;
  }
}

export interface ApunteLeido {
  id: string;
  perfilId: string | null;
  perfilNombre: string;
  accion: AccionPerfil;
  documentoId: string | null;
  detalle: string | null;
  en: string;
}

/** La actividad de la cuenta, más reciente primero. */
export async function leerActividad({ limite = 30, documentoId }: { limite?: number; documentoId?: string } = {}): Promise<ApunteLeido[]> {
  if (!estado.disponible) return [];
  if (estado.almacen === 'cuenta' || sinTabla) {
    const historial = (leer<Apunte[]>(CLAVE_HISTORIAL) ?? [])
      .filter(a => !documentoId || a.documento_id === documentoId)
      .slice(0, limite);
    return historial.map((a, i) => ({
      id: `local-${a.en}-${i}`, perfilId: a.perfil_id, perfilNombre: a.perfil_nombre, accion: a.accion,
      documentoId: a.documento_id, detalle: a.detalle, en: a.en,
    }));
  }
  let q = createClient().from('actividad_perfiles').select('*').order('en', { ascending: false }).limit(limite);
  if (documentoId) q = q.eq('documento_id', documentoId);
  const { data, error } = await q;
  if (error || !data) return [];
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  return data.map((a: any) => ({
    id: a.id, perfilId: a.perfil_id, perfilNombre: a.perfil_nombre, accion: a.accion,
    documentoId: a.documento_id, detalle: a.detalle, en: a.en,
  }));
}

/** Pide abrir el selector de perfil (desde la cabecera, el TPV, el menú…). */
export const EVENTO_CAMBIAR_PERFIL = 'klima:cambiar-perfil';
export function pedirCambioDePerfil(): void {
  window.dispatchEvent(new CustomEvent(EVENTO_CAMBIAR_PERFIL));
}
