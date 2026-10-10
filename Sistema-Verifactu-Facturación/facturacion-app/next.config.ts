import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // «standalone» genera un build auto-contenido (~50 MB) que puede
  // ejecutarse con `node server.js` en cualquier VPS sin necesidad de
  // Vercel. Incluye sólo las dependencias de producción que el servidor
  // usa realmente. Necesario para el despliegue en IONOS.
  output: 'standalone',
  reactCompiler: true,
  async headers() {
    return [
      {
        // Todas las rutas salvo el portal público, que se embebe a
        // propósito en flujos de pago y no debe llevar X-Frame-Options
        // DENY si en el futuro se quiere permitir incrustarlo.
        source: '/((?!aprobar).*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        ],
      },
      {
        // El APK de Android: con su tipo, el navegador del móvil lo ofrece
        // para instalar en vez de guardarlo como un fichero cualquiera.
        source: '/descargas/:archivo*.apk',
        headers: [
          { key: 'Content-Type', value: 'application/vnd.android.package-archive' },
          { key: 'Content-Disposition', value: 'attachment' },
        ],
      },
      {
        // La otra mitad del acuerdo entre la web y la app de Android.
        source: '/.well-known/assetlinks.json',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
      },
      {
        source: '/aprobar/:path*',
        headers: [
          // El portal público SÍ necesita protección anti-clickjacking:
          // nadie debería poder incrustarlo en un iframe ajeno para
          // engañar al cliente y hacerle pagar/aprobar sin darse cuenta.
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
