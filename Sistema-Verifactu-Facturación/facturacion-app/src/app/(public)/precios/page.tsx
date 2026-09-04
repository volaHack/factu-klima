import { Suspense } from 'react';
import type { Metadata } from 'next';
import { PLANS } from '@/lib/plans';
import PricingContent from './PricingContent';

/**
 * La única página comercial del sitio no tenía metadatos propios: salía
 * con el título por defecto del layout raíz («Klima Solutions ·
 * Verifactu») y con la descripción genérica del producto. Quien buscaba
 * «precio facturación verifactu» encontraba un resultado que no hablaba
 * de precios.
 *
 * Aquí sí se puede exportar `metadata` porque page.tsx es un componente
 * de servidor. En `(public)/layout.tsx` no: lleva 'use client' para
 * forzar el tema claro, y el objeto `metadata` sólo lo admiten los
 * componentes de servidor.
 *
 * El `title` sale como «Precios · Klima Solutions» por la plantilla
 * `%s · Klima Solutions` del layout raíz.
 */
export const metadata: Metadata = {
  title: 'Precios',
  description:
    'Planes de facturación con sellado SHA-256 y QR de cotejo, desde ' +
    `${PLANS[0].priceMonthly} €/mes. Sin permanencia, dos meses gratis al año y ` +
    'el mismo programa completo en todos los planes: se paga por volumen de facturas y por soporte.',
  alternates: { canonical: '/precios' },
  openGraph: {
    title: 'Precios · Klima Solutions',
    description:
      'Planes de facturación conforme al RD 1007/2023, sin permanencia. ' +
      'Se paga por volumen de facturas y por soporte, no por funciones recortadas.',
    url: '/precios',
    type: 'website',
  },
};

/**
 * Datos estructurados de los planes. Salen de `PLANS`, la misma fuente
 * que las tarjetas y la tabla, para que Google no pueda leer un precio
 * distinto del que se ve en pantalla — que es exactamente el tipo de
 * descuadre que Search Console marca como precio engañoso.
 */
function datosEstructurados() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'Klima Solutions · Facturación Veri*Factu',
    description:
      'Programa de facturación con registro inalterable: huella SHA-256 encadenada ' +
      'y QR de cotejo en cada factura, conforme al RD 1007/2023.',
    brand: { '@type': 'Brand', name: 'Klima Solutions' },
    offers: PLANS.map(plan => ({
      '@type': 'Offer',
      name: plan.name,
      price: plan.priceMonthly,
      priceCurrency: 'EUR',
      // Los precios de la página son sin IVA, y así se dice al pie.
      valueAddedTaxIncluded: false,
      availability: 'https://schema.org/InStock',
      url: 'https://klimasolutions.es/precios',
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: plan.priceMonthly,
        priceCurrency: 'EUR',
        billingIncrement: 1,
        unitCode: 'MON', // mes
      },
    })),
  };
}

/**
 * Esto estaba en PricingContent.tsx, que lleva 'use client' y por tanto
 * NO es donde Next lee la configuración de segmento: sólo la lee en el
 * archivo de ruta (page/layout/route). Allí no hacía nada, y quitarlo de
 * allí sin ponerlo aquí dejaba la ruta en prerender estático — que con
 * `useSearchParams` deja el contenido del <Suspense> sin resolver en el
 * HTML servido: la página llegaba en blanco hasta que hidrataba el
 * cliente. En la única página que tiene que posicionar en Google, eso es
 * servir una página vacía al rastreador.
 *
 * Sigue siendo válido en Next 16 porque este proyecto no tiene
 * `cacheComponents` activado (ver next.config.ts); es con Cache
 * Components cuando `dynamic` desaparece.
 */
export const dynamic = 'force-dynamic';

export default function PreciosPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(datosEstructurados()) }}
      />
      <Suspense>
        <PricingContent />
      </Suspense>
    </>
  );
}
