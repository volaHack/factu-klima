import 'server-only';

/**
 * EVENTOS DE SEGURIDAD — SOLO SERVIDOR
 *
 * Apunta lo raro (migración 061) para que el administrador lo vea en
 * /admin/seguridad. Nunca lanza ni hace esperar a quien lo llama: si no
 * se puede apuntar, la petición sigue igual. Es una alarma, no una puerta.
 *
 * Bloqueo automático: una IP pública que en 10 minutos acumula
 * UMBRAL_BLOQUEO ataques claros (escaneos, inyecciones o eventos de
 * gravedad alta) queda bloqueada 24 horas. Sólo cuentan esos: un cliente
 * que se equivoca de contraseña o pulsa mucho un botón no llega nunca.
 */

import { after } from 'next/server';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { esIpPrivada } from './firmas';

export type Gravedad = 'baja' | 'media' | 'alta';

export interface EventoSeguridad {
  tipo: string;
  gravedad: Gravedad;
  ip?: string | null;
  userId?: string | null;
  ruta?: string | null;
  detalle?: Record<string, unknown>;
  navegador?: string | null;
}

export const UMBRAL_BLOQUEO = 15;
const VENTANA_MS = 10 * 60_000;
const HORAS_BLOQUEO = 24;
const TIPOS_DE_ATAQUE = ['escaneo', 'traversal', 'log4shell', 'ssrf', 'sqli', 'xss', 'comando', 'plantilla', 'byte_nulo'];

const corta = (t: string | null | undefined, n: number) => (t ? String(t).slice(0, n) : null);

/** La IP de quien hace la petición (la primera de x-forwarded-for, que en Vercel pone el propio Vercel). */
export function ipDe(cabeceras: Headers): string {
  return (cabeceras.get('x-forwarded-for')?.split(',')[0]?.trim() || cabeceras.get('x-real-ip') || 'unknown').slice(0, 64);
}

/** Los datos comunes de una petición, para no repetirlos en cada sitio que avisa. */
export function origenDe(request: Request): Pick<EventoSeguridad, 'ip' | 'ruta' | 'navegador'> {
  let ruta: string | null = null;
  try { ruta = new URL(request.url).pathname; } catch { /* sin URL */ }
  return { ip: ipDe(request.headers), ruta, navegador: request.headers.get('user-agent') };
}

export async function registrarEvento(e: EventoSeguridad): Promise<void> {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
    const db = supabaseServicio();
    await db.from('eventos_seguridad').insert({
      tipo: corta(e.tipo, 60), gravedad: e.gravedad, ip: corta(e.ip, 64), user_id: e.userId ?? null,
      ruta: corta(e.ruta, 500), detalle: e.detalle ?? null, navegador: corta(e.navegador, 300),
    });
    if (e.ip && !esIpPrivada(e.ip) && (e.gravedad === 'alta' || TIPOS_DE_ATAQUE.includes(e.tipo))) {
      await quizaBloquear(db, e.ip);
    }
    // De vez en cuando, fuera lo de hace más de 90 días.
    if (Math.random() < 0.005) {
      await db.from('eventos_seguridad').delete().lt('creado_en', new Date(Date.now() - 90 * 86_400_000).toISOString());
    }
  } catch (err) {
    console.warn('No se ha podido apuntar un evento de seguridad:', err instanceof Error ? err.message : err);
  }
}

/**
 * Apunta el evento DESPUÉS de contestar, para no retrasar la respuesta.
 * Fuera de una petición (pruebas, tareas) se apunta en el momento.
 */
export function avisar(e: EventoSeguridad): void {
  try {
    after(() => registrarEvento(e));
  } catch {
    void registrarEvento(e);
  }
}

async function quizaBloquear(db: ReturnType<typeof supabaseServicio>, ip: string): Promise<void> {
  const desde = new Date(Date.now() - VENTANA_MS).toISOString();
  const { count } = await db.from('eventos_seguridad').select('id', { count: 'exact', head: true })
    .eq('ip', ip).gte('creado_en', desde).or(`gravedad.eq.alta,tipo.in.(${TIPOS_DE_ATAQUE.join(',')})`);
  if ((count ?? 0) < UMBRAL_BLOQUEO) return;
  const { data: ya } = await db.from('ips_bloqueadas').select('ip').eq('ip', ip).maybeSingle();
  if (ya) return;
  const hasta = new Date(Date.now() + HORAS_BLOQUEO * 3_600_000).toISOString();
  const { error } = await db.from('ips_bloqueadas').insert({
    ip, motivo: `${count} ataques en 10 minutos`, automatico: true, hasta,
  });
  if (!error) {
    await db.from('eventos_seguridad').insert({
      tipo: 'ip_bloqueada', gravedad: 'alta', ip, detalle: { automatico: true, ataques: count, horas: HORAS_BLOQUEO },
    });
  }
}

// ------------------------------------------------------------ lista de IPs bloqueadas (con caché)

let cache: { ips: Set<string>; leido: number } | null = null;
let leyendo: Promise<Set<string>> | null = null;
const REFRESCO_MS = 60_000;

/** Las IPs bloqueadas ahora mismo. Se lee de la base de datos como mucho una vez por minuto y por servidor. */
export async function ipsBloqueadas(): Promise<Set<string>> {
  if (cache && Date.now() - cache.leido < REFRESCO_MS) return cache.ips;
  if (leyendo) return leyendo;
  leyendo = (async () => {
    try {
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return new Set<string>();
      const { data } = await supabaseServicio().from('ips_bloqueadas').select('ip, hasta');
      const ahora = Date.now();
      const ips = new Set((data ?? []).filter(f => !f.hasta || new Date(f.hasta as string).getTime() > ahora).map(f => f.ip as string));
      cache = { ips, leido: Date.now() };
      return ips;
    } catch {
      // Si la lista no se puede leer, no se bloquea a nadie (y se reintenta al minuto).
      cache = { ips: cache?.ips ?? new Set(), leido: Date.now() };
      return cache.ips;
    } finally {
      leyendo = null;
    }
  })();
  return leyendo;
}

/** Tras bloquear o desbloquear a mano: que el cambio se note ya en este servidor. */
export function olvidarIpsBloqueadas(): void {
  cache = null;
}
