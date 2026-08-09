import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Klima Solutions - Sistema de Facturación',
    short_name: 'Klima',
    description:
      'Sistema de facturación profesional multitarea para empresas de distribución y comercio con Verifactu Ready',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#f2e7e0',
    theme_color: '#b02a5c',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
