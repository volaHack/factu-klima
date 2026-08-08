import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
