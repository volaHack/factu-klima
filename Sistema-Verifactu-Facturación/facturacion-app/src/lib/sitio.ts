/**
 * La dirección pública del sitio, en un solo sitio.
 *
 * La usan `robots.ts`, `sitemap.ts` y los metadatos canónicos. Sale de
 * `NEXT_PUBLIC_APP_URL` si está puesta; si no, de la variable que Vercel
 * rellena sola en cada despliegue; y como último recurso, del dominio
 * actual. Sin barra final, para poder concatenar rutas sin duplicarla.
 */
export function urlDelSitio(): string {
  const declarada = process.env.NEXT_PUBLIC_APP_URL;
  if (declarada) return declarada.replace(/\/+$/, '');

  const vercel = process.env.NEXT_PUBLIC_VERCEL_URL || process.env.VERCEL_URL;
  if (vercel) return `https://${vercel.replace(/\/+$/, '')}`;

  return 'https://facturacion-app-mocha.vercel.app';
}
