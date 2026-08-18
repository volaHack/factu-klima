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
    <html lang="es" data-scroll-behavior="smooth">
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
