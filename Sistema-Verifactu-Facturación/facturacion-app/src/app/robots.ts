import type { MetadataRoute } from 'next';

import { urlDelSitio } from '@/lib/sitio';

/**
 * Lo que puede indexar un buscador.
 *
 * Público: la portada, los precios y la página de instalación. Todo lo
 * demás es aplicación con sesión —y aunque el proxy ya redirige a
 * /login, decirlo aquí evita que esas rutas aparezcan en los resultados
 * como páginas de error.
 *
 * `/aprobar/` queda fuera a propósito: son enlaces con token que se
 * mandan a un cliente concreto. No deben acabar en un índice público.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/aprobar/',
        '/dashboard',
        '/facturas',
        '/documentos',
        '/clientes',
        '/productos',
        '/ajustes',
        '/admin',
        '/tpv',
        '/informes',
        '/listados-fiscales',
        '/verifactu',
        '/integridad',
      ],
    },
    sitemap: `${urlDelSitio()}/sitemap.xml`,
  };
}
