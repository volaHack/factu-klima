// REGRESIÓN DE LA AUDITORÍA: el envío automático era sólo para la cuenta de
// la plataforma. Ahora recorre todas las que lo tienen activado.
import { describe, expect, it, vi } from 'vitest';

const cuentas = [{ user_id: 'cliente-a' }, { user_id: 'cliente-b' }, { user_id: 'plataforma' }];
const filtros: string[] = [];
vi.mock('@/lib/supabase/servicio', () => ({
  supabaseServicio: () => {
    const q = {
      select: () => q,
      eq: (k: string, v: unknown) => { filtros.push(`${k}=${v}`); return q; },
      order: async () => ({ data: cuentas, error: null }),
    };
    return { from: () => q };
  },
}));
vi.mock('@/lib/seguridad/secretos', () => ({ cronAutorizado: () => true }));
const enviar = vi.fn(async (_db: unknown, id: string) => (id === 'cliente-b'
  ? { estado: 429, cuerpo: { ok: false } }
  : { estado: 200, cuerpo: { ok: true, aceptados: 2, conAvisos: 1, rechazados: 0 } }));
vi.mock('@/lib/verifactu/enviarPendientes', () => ({ enviarPendientes: (db: unknown, id: string) => enviar(db, id) }));

import { GET } from './route';

describe('cron Veri*Factu', () => {
  it('envía lo de TODAS las cuentas con el envío activado y automático', async () => {
    const r = await GET(new Request('http://x/api/cron/verifactu'));
    const cuerpo = await r.json();
    expect(enviar.mock.calls.map(c => c[1])).toEqual(['cliente-a', 'cliente-b', 'plataforma']);
    expect(filtros).toEqual(['activo=true', 'envio_automatico=true']);
    expect(cuerpo).toMatchObject({ ok: true, cuentas: 3, procesadas: 3, enEspera: 1, aceptados: 6 });
  });
});
