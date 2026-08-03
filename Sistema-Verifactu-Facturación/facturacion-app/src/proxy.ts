import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
          Object.entries(headers).forEach(([key, value]) =>
            response.headers.set(key, value)
          );
        },
      },
    }
  );

  const { data: claimsData } = await supabase.auth.getClaims();
  const isAuthenticated = !!claimsData?.claims?.sub;

  const pathname = request.nextUrl.pathname;

  // Páginas públicas por diseño.
  //
  // /aprobar/* es el portal del cliente: le llega por un enlace con token
  // impredecible y, por definición, NO tiene sesión — es el destinatario
  // de la factura, no el usuario de la aplicación. Faltaba aquí, así que
  // todo cliente que pulsaba el enlace acababa en un login que no podía
  // pasar. AuthWrapper ya la trataba como pública en cliente; el
  // middleware redirigía antes de que eso llegara a ejecutarse.
  const isPublicPage =
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/aprobar');

  // Las rutas bajo /api comprueban su propia autorización y responden con
  // 401/403 en JSON. Redirigirlas a /login les devolvía un 307 con HTML,
  // que ningún cliente de API sabe interpretar. Rompía dos cosas reales:
  // el webhook de Stripe (que Stripe invoca servidor a servidor, sin
  // cookies, y que se valida por firma criptográfica) y el checkout del
  // cliente anónimo (autorizado por su token de aprobación). Con el
  // webhook bloqueado, ningún pago llegaba a marcarse como cobrado.
  const isApiRoute = pathname.startsWith('/api');

  // Server-side redirect for unauthenticated users accessing protected pages
  if (!isAuthenticated && !isPublicPage && !isApiRoute) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Server-side redirect for authenticated users accessing login
  if (isAuthenticated && pathname === '/login') {
    const dashboardUrl = new URL('/dashboard', request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
