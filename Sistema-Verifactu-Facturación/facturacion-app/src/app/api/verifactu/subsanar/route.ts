/**
 * POST /api/verifactu/subsanar — pide reenviar como SUBSANACIÓN un registro
 * de alta que la AEAT rechazó, una vez corregido lo que fallaba (el nombre
 * o el NIF en Ajustes, el del cliente…).
 *
 * Sólo pasa un registro de «rechazado» a «subsanar»; lo envía el siguiente
 * envío (botón o automático), con Subsanacion=S. Va con la sesión del
 * usuario: RLS limita a sus registros y el trigger de la migración 078 sólo
 * le deja hacer ese cambio de estado.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'No autenticado' }, { status: 401 });

  const { id } = await request.json().catch(() => ({ id: null })) as { id?: string | null };
  if (!id) return NextResponse.json({ ok: false, error: 'Falta el registro' }, { status: 400 });

  const { data, error } = await supabase
    .from('verifactu_registros')
    .update({ estado: 'subsanar' })
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('estado', 'rechazado')
    .eq('tipo_registro', 'alta')
    .select('id');
  if (error) return NextResponse.json({ ok: false, error: 'No se ha podido marcar para subsanar.' }, { status: 500 });
  if (!data?.length) {
    return NextResponse.json({ ok: false, error: 'Sólo se puede subsanar un registro de alta rechazado por la AEAT.' }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
