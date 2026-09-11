import 'server-only';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { combinarCuentas, type FilaSuscripcionCompleta } from './cuentas';

/** Sólo metadatos de las cuentas: ni facturas, ni clientes, ni productos. */
export async function listarCuentas() {
  const db = supabaseServicio();
  const [usuarios, ajustes, suscripciones, facturasMes, admins] = await Promise.all([
    db.auth.admin.listUsers({ perPage: 1000 }),
    db.from('company_settings').select('user_id, business_name, nif, updated_at'),
    db.from('suscripciones').select('*'),
    db.rpc('admin_facturas_mes'),
    db.from('administradores').select('user_id'),
  ]);
  for (const r of [ajustes, suscripciones, facturasMes, admins]) if (r.error) throw new Error(r.error.message);
  if (usuarios.error) throw new Error(usuarios.error.message);

  return combinarCuentas({
    usuarios: usuarios.data.users,
    ajustes: ajustes.data ?? [],
    suscripciones: (suscripciones.data ?? []) as FilaSuscripcionCompleta[],
    facturasMes: facturasMes.data ?? [],
    admins: (admins.data ?? []).map(a => a.user_id),
    hoy: new Date(),
  });
}

export async function registroDeAdmin(cuentaId?: string) {
  let q = supabaseServicio().from('admin_registro').select('*').order('creado_en', { ascending: false }).limit(200);
  if (cuentaId) q = q.eq('cuenta_id', cuentaId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Eventos de Stripe que necesitan a una persona: fallidos o marcados REVISAR. */
export async function eventosPendientes() {
  const { data, error } = await supabaseServicio().from('stripe_eventos')
    .select('*').not('error', 'is', null).order('recibido_en', { ascending: false }).limit(100);
  if (error) throw new Error(error.message);
  return data ?? [];
}
