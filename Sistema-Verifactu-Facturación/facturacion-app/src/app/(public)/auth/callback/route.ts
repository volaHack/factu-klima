import { type NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { isSafeRedirectPath } from '@/lib/security';

/**
 * Guarda el code de autorización crudo en desktop_login para que la app de
 * escritorio (Electron) lo recoja por polling y lo intercambie en su propio
 * contexto. El servidor NO puede intercambiar el code por la sesión: con
 * createBrowserClient (flowType=pkce) el code_verifier vive solo en las
 * cookies de Electron, y la petición de este callback llega desde el
 * navegador del sistema, donde ese verifier no existe. Por eso aquí solo se
 * deja el code listo, y es la app quien llama a exchangeCodeForSession.
 * Usa la service role key para saltarse la RLS (la tabla está cerrada para
 * anon/authenticated).
 */
async function storeDesktopCode(state: string, code: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('No se puede completar el login de escritorio: falta SUPABASE_SERVICE_ROLE_KEY.');
    return false;
  }
  const admin = createAdminClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await admin
    .from('desktop_login')
    .upsert(
      {
        state,
        code,
      },
      { onConflict: 'state' }
    );
  if (error) {
    console.error('Error guardando el código de autorización de escritorio:', error);
    return false;
  }
  return true;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const rawNext = searchParams.get('next');
  const next = isSafeRedirectPath(rawNext) ? rawNext : '/dashboard';
  // Login con Google desde la app de escritorio (Electron): el clic en
  // "Continuar con Google" tiene que salir forzosamente al navegador del
  // sistema (Google no permite iniciar sesión dentro de una ventana
  // embebida). Este flag, puesto por LoginContent.tsx cuando detecta que
  // corre dentro de Electron, le dice a este callback que en vez de
  // redirigir a `next` como una página web normal, tiene que dejar la
  // sesión guardada para que la app la recoja por polling — sin depender
  // de ningún protocolo del sistema operativo.
  const isDesktop = searchParams.get('platform') === 'desktop';
  const state = searchParams.get('state');

  if (isDesktop && state && code) {
    const stored = await storeDesktopCode(state, code);
    return new NextResponse(
      `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Klima</title></head>
<body style="font-family:system-ui,-apple-system,sans-serif;text-align:center;padding-top:15vh;background:#f2e7e0;color:#1a1216;">
  <p>Sesión iniciada${stored ? '' : ' en el navegador'}.</p>
  <p><strong>Ya puedes cerrar esta ventana: la aplicación Klima entrará sola.</strong></p>
</body></html>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const forwardedHost = request.headers.get('x-forwarded-host');
      const isLocalEnv = process.env.NODE_ENV === 'development';
      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      } else {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  // If error, redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_error`);
}
