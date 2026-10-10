/**
 * GET /api/banco/vuelta?code&state — el banco devuelve aquí al negocio tras
 * dar (o negar) el permiso. Se crea (o renueva) la conexión, se lanza la
 * primera lectura y se vuelve a la pantalla del banco.
 */

import { after, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { borrarSesion, crearSesion } from '@/lib/banco/enableBanking';
import { CAMPOS_CONEXION, conexionesDe } from '@/lib/banco/servidor';
import { mismaConexion } from '@/lib/banco/sincronia';
import { origenPublico } from '@/lib/banco/origen';
import { sincronizarConexion, type ConexionGuardada } from '@/lib/banco/sincronizar';
import { avisar, origenDe } from '@/lib/seguridad/eventos';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const destino = (estado: string) => NextResponse.redirect(`${origenPublico(request)}/banco?banco=${estado}`);
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  if (!state) return destino('error');

  const db = supabaseServicio();
  const { data: aut } = await db.from('bancos_autorizaciones').select('user_id, banco, pais').eq('state', state).maybeSingle();
  // El `state` es de un solo uso.
  await db.from('bancos_autorizaciones').delete().eq('state', state);
  if (!aut) {
    avisar({ tipo: 'token_invalido', gravedad: 'media', ...origenDe(request), detalle: { portal: 'vuelta del banco' } });
    return destino('error');
  }
  // La vuelta tiene que llegar al navegador de la cuenta que empezó la
  // conexión. Si no, alguien podría mandar a otro su enlace de autorización
  // y quedarse con los movimientos del banco de la víctima en su cuenta.
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user || user.id !== aut.user_id) {
    avisar({ tipo: 'banco_vuelta_ajena', gravedad: 'alta', ...origenDe(request), userId: user?.id ?? null, detalle: { cuentaQueLoEmpezo: aut.user_id } });
    return destino(user ? 'otra_cuenta' : 'sin_sesion');
  }
  if (!code) return destino(url.searchParams.get('error') ? 'cancelado' : 'error');

  try {
    const s = await crearSesion(code);
    // ¿Es la renovación de una conexión que ya había (mismo banco, alguna
    // cuenta en común)? Entonces se actualiza: ni dos conexiones con las
    // mismas cuentas ni movimientos repetidos (su id no depende de la sesión).
    const existentes = await conexionesDe(db, aut.user_id);
    const previa = existentes.find(c => mismaConexion(c, { banco: aut.banco, cuentas: s.cuentas }));
    const datos = {
      session_id: s.sessionId, cuentas: s.cuentas, valido_hasta: s.validoHasta,
      estado: 'activa', ultimo_error: null,
    };
    let conexion: ConexionGuardada;
    if (previa) {
      const { data: viejaSesion } = await db.from('bancos_conectados').select('session_id').eq('id', previa.id).maybeSingle();
      const { error } = await db.from('bancos_conectados').update(datos).eq('id', previa.id).eq('user_id', aut.user_id);
      if (error) throw new Error(error.message);
      if (viejaSesion?.session_id && viejaSesion.session_id !== s.sessionId) {
        try { await borrarSesion(viejaSesion.session_id); } catch { /* ya caducada en el banco */ }
      }
      conexion = { ...previa, cuentas: s.cuentas, valido_hasta: s.validoHasta, estado: 'activa' };
    } else {
      const { data: nueva, error } = await db.from('bancos_conectados')
        .insert({ user_id: aut.user_id, banco: aut.banco, pais: aut.pais, ...datos })
        .select(CAMPOS_CONEXION).single();
      if (error || !nueva) throw new Error(error?.message ?? 'sin fila');
      conexion = nueva as ConexionGuardada;
    }
    // La primera lectura, después de contestar: el cliente vuelve a la app
    // al momento y los movimientos van apareciendo.
    after(async () => {
      try { await sincronizarConexion(db, conexion); } catch (e) { console.error('Primera sincronización fallida:', e instanceof Error ? e.message : e); }
    });
    return destino(previa ? 'renovado' : 'conectado');
  } catch (e) {
    console.error('No se ha podido cerrar la conexión con el banco:', e);
    return destino('error');
  }
}
