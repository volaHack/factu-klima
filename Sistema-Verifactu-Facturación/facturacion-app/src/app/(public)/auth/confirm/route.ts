import { type EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSafeRedirectPath } from '@/lib/security';

/**
 * El enlace de los correos de la cuenta (confirmar el registro, recuperar
 * la contraseña…): canjea el token, deja la sesión abierta y lleva a
 * `next`, que sólo puede ser una ruta de esta misma web.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const pedido = searchParams.get('next');
  const next = isSafeRedirectPath(pedido) ? pedido : '/dashboard';

  const redirectTo = request.nextUrl.clone();
  const destino = new URL(next, request.nextUrl.origin);
  redirectTo.pathname = destino.pathname;
  redirectTo.search = destino.search;
  redirectTo.searchParams.delete('token_hash');
  redirectTo.searchParams.delete('type');

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      redirectTo.searchParams.delete('next');
      return NextResponse.redirect(redirectTo);
    }
  }

  // Enlace caducado o ya usado: al acceso, que lo explica.
  redirectTo.pathname = type === 'recovery' ? '/auth/recuperar' : '/login';
  redirectTo.search = type === 'recovery' ? '?caducado=1' : '?error_code=otp_expired';
  return NextResponse.redirect(redirectTo);
}
