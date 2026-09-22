import type { MetadataRoute } from 'next';

import { urlDelSitio } from '@/lib/sitio';

/**
 * Las páginas públicas, para los buscadores.
 *
 * Sólo las que alguien sin sesión puede abrir y tiene sentido encontrar
 * en Google. La aplicación vive detrás del login y no entra aquí.
 *
 * Si se añade una página pública nueva, va en esta lista Y en
 * `src/lib/publicRoutes.ts`.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = urlDelSitio();
  const hoy = new Date();

  return [
    { url: `${base}/`, lastModified: hoy, changeFrequency: 'monthly', priority: 1 },
    { url: `${base}/precios`, lastModified: hoy, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${base}/instalar`, lastModified: hoy, changeFrequency: 'yearly', priority: 0.6 },
    { url: `${base}/legal/privacidad`, lastModified: hoy, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/legal/terminos`, lastModified: hoy, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/legal/aviso-legal`, lastModified: hoy, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/legal/cookies`, lastModified: hoy, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
