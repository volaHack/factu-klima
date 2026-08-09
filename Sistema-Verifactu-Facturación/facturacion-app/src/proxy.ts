import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isPublicRoute } from '@/lib/publicRoutes';

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

  // Páginas públicas por diseño — la lista está en src/lib/publicRoutes.ts
  // porque AuthWrapper necesita exactamente la misma y se desincronizaron.
  //
  // /aprobar/* es el portal del cliente: le llega por un enlace con token
  // impredecible y, por definición, NO tiene sesión — es el destinatario
  // de la factura, no el usuario de la aplicación. Faltaba aquí, así que
  // todo cliente que pulsaba el enlace acababa en un login que no podía
  // pasar. AuthWrapper ya la trataba como pública en cliente; el
  // middleware redirigía antes de que eso llegara a ejecutarse. Lo mismo
  // pasaba con la landing, /precios e /instalar.
  const isPublicPage = isPublicRoute(pathname);

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
    // Quedan fuera los assets de build y los ficheros servidos tal cual desde
    // /public. Faltaban sw.js y el manifiesto, y eso rompía la PWA: sin sesión
    // el proxy respondía 307 a /login en vez del script, y el navegador se
    // niega a registrar un service worker cuya descarga redirige. Con sesión
    // sí se registraba, pero su precache pedía /manifest.json — que ya no
    // existe — y se quedaba vacío.
    // /descargas son los instaladores de escritorio que ofrece /instalar, una
    // página pública: pasando por aquí devolvían un 307 a /login y los
    // botones de descarga no bajaban nada.
    '/((?!_next/static|_next/image|favicon\\.ico|sw\\.js|manifest\\.webmanifest|descargas/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|js|css|json|txt|woff|woff2|ttf|eot|exe|dmg|zip|apk)$).*)',
  ],
};
