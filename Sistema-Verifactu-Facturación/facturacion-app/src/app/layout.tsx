import './globals.css';
import type { Metadata, Viewport } from 'next';
import AuthWrapper from '@/components/AuthWrapper';
import ServiceWorkerRegistrar from '@/components/ServiceWorkerRegistrar';
import { ToastProvider } from '@/hooks/useToast';

export const metadata: Metadata = {
  title: {
    default: 'Klima Solutions · Verifactu',
    template: '%s · Klima Solutions',
  },
  description:
    'Sistema de facturación con encadenamiento de huella SHA-256, registro de eventos inalterable y control de integridad.',
  manifest: '/manifest.json',
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
      <body>
        <ToastProvider>
          <AuthWrapper>{children}</AuthWrapper>
        </ToastProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
