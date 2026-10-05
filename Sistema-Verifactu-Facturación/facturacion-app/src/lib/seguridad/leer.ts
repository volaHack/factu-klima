import 'server-only';

/**
 * Lo que enseña /admin/seguridad. Se lee con la service role: las dos
 * tablas no tienen políticas y desde el navegador no se ven.
 */

import { supabaseServicio } from '@/lib/supabase/servicio';
import type { Gravedad } from './eventos';

export interface FilaEvento {
  id: number;
  creado_en: string;
  tipo: string;
  gravedad: Gravedad;
  ip: string | null;
  user_id: string | null;
  ruta: string | null;
  detalle: Record<string, unknown> | null;
  navegador: string | null;
}

export interface IpBloqueada {
  ip: string;
  motivo: string;
  automatico: boolean;
  creado_en: string;
  hasta: string | null;
}

export interface PanelSeguridad {
  eventos: FilaEvento[];
  bloqueadas: IpBloqueada[];
  ultimas24h: Record<Gravedad, number>;
  ipsMasActivas: { ip: string; veces: number; altas: number; ultima: string; tipos: string[] }[];
  error: string | null;
}

const DIAS = 7;
const MAXIMO = 500;

export async function panelSeguridad(): Promise<PanelSeguridad> {
  const vacio: PanelSeguridad = { eventos: [], bloqueadas: [], ultimas24h: { baja: 0, media: 0, alta: 0 }, ipsMasActivas: [], error: null };
  try {
    const db = supabaseServicio();
    const desde = new Date(Date.now() - DIAS * 86_400_000).toISOString();
    const [ev, bl] = await Promise.all([
      db.from('eventos_seguridad').select('*').gte('creado_en', desde).order('creado_en', { ascending: false }).limit(MAXIMO),
      db.from('ips_bloqueadas').select('*').order('creado_en', { ascending: false }),
    ]);
    if (ev.error) return { ...vacio, error: ev.error.message };
    if (bl.error) return { ...vacio, error: bl.error.message };
    const eventos = (ev.data ?? []) as FilaEvento[];
    const ahora = Date.now();
    const bloqueadas = ((bl.data ?? []) as IpBloqueada[]).filter(b => !b.hasta || new Date(b.hasta).getTime() > ahora);

    const ultimas24h: Record<Gravedad, number> = { baja: 0, media: 0, alta: 0 };
    const porIp = new Map<string, { ip: string; veces: number; altas: number; ultima: string; tipos: Set<string> }>();
    for (const e of eventos) {
      if (ahora - new Date(e.creado_en).getTime() < 86_400_000) ultimas24h[e.gravedad] += 1;
      if (!e.ip || e.ip === 'unknown') continue;
      const g = porIp.get(e.ip) ?? { ip: e.ip, veces: 0, altas: 0, ultima: e.creado_en, tipos: new Set<string>() };
      g.veces += 1;
      if (e.gravedad === 'alta') g.altas += 1;
      g.tipos.add(e.tipo);
      porIp.set(e.ip, g);
    }
    const ipsMasActivas = [...porIp.values()]
      .sort((a, b) => b.altas - a.altas || b.veces - a.veces)
      .slice(0, 10)
      .map(g => ({ ...g, tipos: [...g.tipos] }));
    return { eventos, bloqueadas, ultimas24h, ipsMasActivas, error: null };
  } catch (e) {
    return { ...vacio, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Para el aviso del resumen: cuántos eventos graves en las últimas 24 horas. Si no se puede leer, cero. */
export async function alertasGraves24h(): Promise<number> {
  try {
    const desde = new Date(Date.now() - 86_400_000).toISOString();
    const { count } = await supabaseServicio().from('eventos_seguridad')
      .select('id', { count: 'exact', head: true }).eq('gravedad', 'alta').gte('creado_en', desde);
    return count ?? 0;
  } catch {
    return 0;
  }
}
