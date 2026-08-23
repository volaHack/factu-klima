import './globals.css';
import type { Metadata, Viewport } from 'next';
import AuthWrapper from '@/components/AuthWrapper';
import ServiceWorkerRegistrar from '@/components/ServiceWorkerRegistrar';
import { ToastProvider } from '@/hooks/useToast';
import { GUION_ANTI_FOGONAZO } from '@/lib/tema';

export const metadata: Metadata = {
  title: {
    default: 'Klima Solutions · Verifactu',
    template: '%s · Klima Solutions',
  },
  description:
    'Sistema de facturación con encadenamiento de huella SHA-256, registro de eventos inalterable y control de integridad.',
  // El manifiesto lo genera src/app/manifest.ts y se sirve en
  // /manifest.webmanifest. Aquí apuntaba a /manifest.json, que se borró.
  manifest: '/manifest.webmanifest',
  icons: { icon: '/favicon.ico' },
  appleWebApp: {
    capable: true,
    title: 'Klima Solutions',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f2e7e0',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning por el `data-theme` de abajo, y sólo por eso.
    //
    // El guion anti-fogonazo escribe ese atributo ANTES de que React hidrate,
    // que es justo lo que hace falta para que no haya un destello blanco. Pero
    // entonces React encuentra en el <html> un atributo que él no ha puesto y
    // avisa de que el servidor y el navegador no coinciden.
    //
    // Es el único caso en el que la diferencia es a propósito. Va en el <html>
    // y no se hereda a los hijos, así que no tapa desajustes de verdad más
    // abajo.
    <html lang="es" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        {/* Antes de que se pinte nada: si no, la página nace clara y se
            pone oscura cuando React arranca, y de noche eso es un
            fogonazo blanco en toda la pantalla. */}
        <script dangerouslySetInnerHTML={{ __html: GUION_ANTI_FOGONAZO }} />
      </head>
      <body>
        <ToastProvider>
          <AuthWrapper>{children}</AuthWrapper>
        </ToastProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
