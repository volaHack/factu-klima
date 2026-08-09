'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { Smartphone, Tablet, Monitor, ArrowLeft, ShieldCheck } from 'lucide-react';

function resolveAppUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

export default function InstalarContent() {
  const [appUrl, setAppUrl] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const isPlaceholder = !appUrl || /localhost|127\.0\.0\.1/.test(appUrl);

  useEffect(() => {
    let cancelled = false;
    const url = resolveAppUrl();
    if (!url) return;

    QRCode.toDataURL(url, {
      width: 260,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#1a1216', light: '#ffffff' },
    })
      .then((dataUrl) => {
        if (cancelled) return;
        setAppUrl(url);
        setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setAppUrl(url);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="login-page">
      <div className="login-bg-glow login-bg-glow--1" />
      <div className="login-bg-glow login-bg-glow--2" />
      <div className="login-bg-grid" />

      <div className="login-card instalar-card">
        <div className="login-header">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/klima-mark.svg" alt="Klima Solutions" className="login-logo" width={56} height={56} />
          <h1 className="login-title">
            Instala <em className="accent-serif">Klima</em>
          </h1>
          <p className="login-subtitle">
            Sin Google Play ni App Store: la app se instala desde tu navegador y funciona incluso sin conexión.
          </p>
        </div>

        <div className="instalar-qr-wrap">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt={`Código QR de ${appUrl}`} className="instalar-qr" width={260} height={260} />
          ) : (
            <div className="instalar-qr instalar-qr--empty">Generando código…</div>
          )}
          <p className="instalar-qr-url">{appUrl || 'URL de la app'}</p>
          {isPlaceholder && (
            <p className="instalar-hint">
              Este código apunta a la URL actual. En cuanto publiques la app con su dominio, escanéalo desde tu móvil.
            </p>
          )}
        </div>

        <div className="instalar-steps">
          <div className="instalar-step">
            <span className="instalar-step-icon"><Smartphone size={18} /></span>
            <div>
              <strong>Android</strong>
              <p>Abre esta página en Chrome, toca ⋮ y elige «Instalar app» (o «Añadir a pantalla de inicio»).</p>
            </div>
          </div>
          <div className="instalar-step">
            <span className="instalar-step-icon"><Tablet size={18} /></span>
            <div>
              <strong>iPhone / iPad</strong>
              <p>Abre en Safari, toca Compartir ⎋ y elige «Añadir a pantalla de inicio».</p>
            </div>
          </div>
          <div className="instalar-step">
            <span className="instalar-step-icon"><Monitor size={18} /></span>
            <div>
              <strong>Ordenador (Windows)</strong>
              <p>Descarga e instala directamente — no hace falta pasar por ninguna tienda de apps.</p>
              <div className="instalar-downloads">
                <a className="btn btn-primary btn-sm" href="/descargas/Klima-Facturacion-Setup-1.0.0.exe" download>
                  Descargar Klima Facturación (.exe)
                </a>
                <a className="btn btn-secondary btn-sm" href="/descargas/Klima-TPV-Setup-1.0.0.exe" download>
                  Descargar Klima TPV (.exe)
                </a>
              </div>
              <p className="instalar-hint">
                ¿Prefieres no instalar nada? En Edge o Chrome también puedes pulsar el icono de instalar de la barra de direcciones.
              </p>
            </div>
          </div>
        </div>

        <div className="login-footer instalar-footer">
          <span className="verifactu-badge">
            <ShieldCheck size={12} /> Registros sellados · SHA-256
          </span>
          <Link href="/login" className="instalar-back">
            <ArrowLeft size={14} /> Ir al inicio de sesión
          </Link>
        </div>
      </div>
    </div>
  );
}
