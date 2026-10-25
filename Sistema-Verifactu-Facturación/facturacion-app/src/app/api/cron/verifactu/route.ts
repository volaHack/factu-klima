import { NextResponse } from 'next/server';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { cronAutorizado } from '@/lib/seguridad/secretos';
import { enviarPendientes } from '@/lib/verifactu/enviarPendientes';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Hasta aquí se empiezan cuentas nuevas; lo que falte, en la siguiente pasada. */
const PRESUPUESTO_MS = 80_000;

/**
 * ENVÍO AUTOMÁTICO A LA AEAT DE TODAS LAS CUENTAS QUE LO TIENEN PUESTO
 *
 * Antes sólo enviaba los registros de la cuenta de la plataforma, una vez
 * al día: los de los clientes sólo salían si alguien pulsaba «Enviar».
 * Ahora recorre las cuentas que han activado el envío (`activo`, que exige
 * certificado) y tienen el envío automático encendido, de la que más
 * tiempo lleva esperando a la que menos. `enviarPendientes` se ocupa de que
 * no haya dos envíos a la vez por cuenta y de respetar el tiempo de espera
 * que pida la AEAT (una cuenta en espera se salta sin enviar nada).
 *
 * El envío no depende de que la suscripción esté al día: los registros de
 * facturas ya emitidas hay que remitirlos igual.
 *
 * El crontab la llama cada pocos minutos (deploy/activar.sh).
 */
export async function GET(request: Request) {
  if (!cronAutorizado(request)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const inicio = Date.now();
  const db = supabaseServicio();
  const { data: cuentas, error } = await db
    .from('verifactu_config')
    .select('user_id, siguiente_envio_en')
    .eq('activo', true)
    .eq('envio_automatico', true)
    .order('siguiente_envio_en', { ascending: true, nullsFirst: true });
  if (error) return NextResponse.json({ ok: false, error: 'No se han podido leer las cuentas' }, { status: 500 });

  const resumen = { cuentas: cuentas?.length ?? 0, procesadas: 0, enEspera: 0, conError: 0, aceptados: 0, rechazados: 0, pendientesParaLaSiguiente: 0 };
  for (const c of cuentas ?? []) {
    if (Date.now() - inicio > PRESUPUESTO_MS) {
      resumen.pendientesParaLaSiguiente++;
      continue;
    }
    try {
      const r = await enviarPendientes(db, c.user_id as string);
      resumen.procesadas++;
      if (r.estado === 429 || r.estado === 409) resumen.enEspera++;
      else if (r.estado >= 400) resumen.conError++;
      resumen.aceptados += Number(r.cuerpo.aceptados ?? 0) + Number(r.cuerpo.conAvisos ?? 0);
      resumen.rechazados += Number(r.cuerpo.rechazados ?? 0);
    } catch {
      // Una cuenta que falla no para a las demás.
      resumen.conError++;
    }
  }
  return NextResponse.json({ ok: true, ...resumen });
}
