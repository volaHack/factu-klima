'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import {
  Smartphone, Tablet, Monitor, Download, Printer, WifiOff, ArrowRight,
} from 'lucide-react';

import SiteNav from '@/components/public/SiteNav';
import SiteFooter from '@/components/public/SiteFooter';
import Reveal from '@/components/public/Reveal';

/* ------------------------------------------------------------------ *
 * /instalar
 *
 * El billete troquelado ya era la mejor idea de la marca, así que no se
 * toca: se asciende a protagonista. Lo que se añade es lo que le
 * faltaba para ser útil de verdad en un mostrador —el cartel se puede
 * imprimir y pegar al lado de la caja (hoja de estilos de impresión, no
 * una imagen)— y el motivo, contado sin rodeos, de por qué esto no está
 * en Google Play ni en la App Store.
 * ------------------------------------------------------------------ */

function resolveAppUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

type Platform = 'android' | 'ios' | 'windows';

/** Detecta la plataforma real del visitante para abrir directamente en su pestaña. */
function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'android';
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'windows';
}

const PLATFORMS: { id: Platform; label: string; icon: typeof Smartphone }[] = [
  { id: 'android', label: 'Android', icon: Smartphone },
  { id: 'ios', label: 'iPhone / iPad', icon: Tablet },
  { id: 'windows', label: 'Windows', icon: Monitor },
];

export default function InstalarContent() {
  const [appUrl, setAppUrl] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [qrPrintUrl, setQrPrintUrl] = useState('');
  const [platform, setPlatform] = useState<Platform>('android');
  const isPlaceholder = !appUrl || /localhost|127\.0\.0\.1/.test(appUrl);

  useEffect(() => {
    // Se lee tras montar, no en el useState inicial: navigator no existe
    // en el servidor, y leerlo en el inicializador produciría un valor
    // distinto entre servidor y cliente en el primer render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlatform(detectPlatform());
  }, []);

  useEffect(() => {
    let cancelled = false;
    const url = resolveAppUrl();
    if (!url) return;

    // Dos versiones del mismo código: la de pantalla en tinta de la
    // marca sobre papel transparente, y la de imprimir en negro puro
    // sobre blanco — una impresora térmica o una láser barata pierden
    // módulos si el negro no es negro.
    Promise.all([
      QRCode.toDataURL(url, {
        width: 320, margin: 0, errorCorrectionLevel: 'M',
        color: { dark: '#3a1420', light: '#00000000' },
      }),
      QRCode.toDataURL(url, {
        width: 640, margin: 1, errorCorrectionLevel: 'Q',
        color: { dark: '#000000', light: '#ffffff' },
      }),
    ])
      .then(([pantalla, impresion]) => {
        if (cancelled) return;
        setAppUrl(url);
        setQrDataUrl(pantalla);
        setQrPrintUrl(impresion);
      })
      .catch(() => {
        if (!cancelled) setAppUrl(url);
      });

    return () => { cancelled = true; };
  }, []);

  const urlLimpia = useMemo(() => (appUrl || 'klima.app').replace(/^https?:\/\//, ''), [appUrl]);

  return (
    <div className="site-page instalar-page">
      <SiteNav />

      {/* ───────────────────────── Héroe ───────────────────────── */}
      <header className="instalar-hero">
        <div className="instalar-hero-copy">
          <p className="instalar-kicker">Instalación</p>
          <h1 className="instalar-title">
            Tu acceso a Klima, listo<br />para <em className="accent-serif">imprimir</em>
          </h1>
          <p className="instalar-lead">
            Sin Google Play ni App Store: se instala directamente desde el navegador,
            ocupa lo que ocupa una página web y sigue emitiendo tickets aunque te
            quedes sin conexión.
          </p>

          <div className="instalar-hero-actions">
            <button type="button" className="btn-primary btn-lg" onClick={() => window.print()}>
              <Printer size={17} /> Imprimir el cartel del QR
            </button>
            <a href="#pasos" className="btn-ghost btn-lg">Ver los pasos de mi dispositivo</a>
          </div>
        </div>

        {/* El billete de acceso — no es una tarjeta más: es el mismo objeto
            que imprime el TPV, con su troquel y su línea de picado,
            prestado para la instalación en vez de para una venta. */}
        <div className="instalar-ticket-wrap">
          <div className="instalar-ticket">
            <div className="instalar-ticket-main">
              <div className="instalar-ticket-qr-frame">
                {qrDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={qrDataUrl}
                    alt={`Código QR que abre ${appUrl}`}
                    className="instalar-ticket-qr"
                    width={200}
                    height={200}
                  />
                ) : (
                  <div className="instalar-ticket-qr instalar-ticket-qr--empty" aria-hidden="true" />
                )}
              </div>
              <div className="instalar-ticket-copy">
                <span className="instalar-ticket-kicker">Escanea con el móvil</span>
                <span className="instalar-ticket-url">{urlLimpia}</span>
                {isPlaceholder && (
                  <span className="instalar-ticket-hint">
                    Apunta a esta misma dirección. Cuando publiques el dominio definitivo,
                    vuelve y escanea de nuevo.
                  </span>
                )}
              </div>
            </div>

            <div className="instalar-ticket-perforation" aria-hidden="true">
              <span />
            </div>

            <div className="instalar-ticket-stub">
              <span className="instalar-ticket-stub-text">ACCESO · SIN TIENDA</span>
            </div>
          </div>
        </div>
      </header>

      {/* ─────────────── Pasos por plataforma ─────────────── */}
      <section id="pasos" className="instalar-platforms" aria-labelledby="pasos-title">
        <h2 id="pasos-title" className="instalar-h2 instalar-pasos-title">Tres toques y ya está</h2>
        <div className="instalar-switcher" role="tablist" aria-label="Elige tu dispositivo">
          {PLATFORMS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={platform === p.id}
              className={`instalar-switcher-tab ${platform === p.id ? 'is-active' : ''}`}
              onClick={() => setPlatform(p.id)}
            >
              <p.icon size={15} />
              <span>{p.label}</span>
            </button>
          ))}
        </div>

        <div className="instalar-panel" role="tabpanel">
          {platform === 'android' && (
            <ol className="instalar-panel-steps">
              <li>Abre esta página en <b>Chrome</b>.</li>
              <li>Toca el menú <b>⋮</b> de la esquina superior derecha.</li>
              <li>Elige <b>«Instalar app»</b> (o «Añadir a pantalla de inicio»).</li>
            </ol>
          )}
          {platform === 'ios' && (
            <ol className="instalar-panel-steps">
              <li>Abre esta página en <b>Safari</b> — no funciona desde Chrome en iOS.</li>
              <li>Toca <b>Compartir</b> ⎋ en la barra inferior.</li>
              <li>Elige <b>«Añadir a pantalla de inicio»</b>.</li>
            </ol>
          )}
          {platform === 'windows' && (
            <div className="instalar-panel-windows">
              <p className="instalar-panel-note">
                Descarga el instalador y ejecútalo. No hace falta pasar por ninguna tienda,
                y si prefieres no instalar nada, Edge y Chrome también dejan anclar la web
                como aplicación desde el icono de la barra de direcciones.
              </p>
              <div className="instalar-downloads">
                <a className="instalar-download" href="/descargas/Klima-Facturacion-Setup-1.0.0.exe" download>
                  <Download size={16} />
                  <span className="instalar-download-copy">
                    <strong>Klima Facturación</strong>
                    <small>Instalador · .exe</small>
                  </span>
                </a>
                <a className="instalar-download instalar-download--ghost" href="/descargas/Klima-TPV-Setup-1.0.0.exe" download>
                  <Download size={16} />
                  <span className="instalar-download-copy">
                    <strong>Klima TPV</strong>
                    <small>Instalador · .exe</small>
                  </span>
                </a>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ─────────────── Por qué no hay tienda ─────────────── */}
      <Reveal className="instalar-porque">
        <h2 className="instalar-h2">¿Por qué no está en Google Play?</h2>
        <div className="instalar-porque-grid">
          <div>
            <h3>Porque no hace falta</h3>
            <p>
              Klima es una aplicación web instalable. El navegador la guarda en el
              dispositivo con su icono, su pantalla completa y su base de datos local:
              lo mismo que haría una tienda, sin la tienda por medio.
            </p>
          </div>
          <div>
            <h3>Porque las actualizaciones son inmediatas</h3>
            <p>
              Cuando cambia la normativa no hay que esperar a que nadie revise una versión.
              Publicamos y, la próxima vez que abras la caja, ya estás al día.
            </p>
          </div>
          <div>
            <h3>Porque el enlace es uno solo</h3>
            <p>
              El mismo QR sirve para el móvil del repartidor, la tablet del mostrador y el
              portátil de la oficina. No hay tres descargas distintas que mantener.
            </p>
          </div>
        </div>
      </Reveal>

      {/* ─────────────── Offline ─────────────── */}
      <Reveal className="instalar-offline">
        <div className="instalar-offline-media">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {/* La foto es cuadrada (1024×1024). Estaba declarada 1200×800:
              el navegador reservaba un hueco 3:2, llegaba la imagen y
              empujaba todo lo de abajo. Y las dos «variantes» eran el
              MISMO archivo, un JPEG de 735 KB con la extensión cambiada a
              .webp, servido tal cual al móvil en la página que existe
              justo para instalarla en el móvil. Ahora son WebP de verdad:
              48 KB en teléfono, 90 KB en pantalla grande. */}
          <img
            src="/img/movil-1024.webp"
            srcSet="/img/movil-640.webp 640w, /img/movil-1024.webp 1024w"
            sizes="(max-width: 900px) 100vw, 46vw"
            alt="Unas manos sostienen un móvil sobre un mostrador rojo gastado, junto a un rollo de papel térmico y un ticket recién arrancado."
            width={1024}
            height={1024}
            loading="lazy"
            decoding="async"
          />
        </div>
        <div className="instalar-offline-copy">
          <span className="instalar-offline-icon"><WifiOff size={18} /></span>
          <h2 className="instalar-h2">Instalada, funciona sin línea</h2>
          <p>
            Una vez instalada, la aplicación no depende de la cobertura para abrir. Las
            ventas y las facturas se guardan en el dispositivo y se encolan; cuando vuelve
            la conexión suben solas, en orden y sin duplicarse.
          </p>
          <Link href="/precios" className="home-inline-link">
            Ver planes y precios <ArrowRight size={15} />
          </Link>
        </div>
      </Reveal>

      <SiteFooter />

      {/* ─────────────── Hoja imprimible ───────────────
          Invisible en pantalla; al imprimir es lo único que sale, en A4
          y con el QR en negro puro para que un lector barato lo lea. */}
      <div className="instalar-print-sheet" aria-hidden="true">
        {qrPrintUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrPrintUrl} alt="" className="instalar-print-qr" width={320} height={320} />
        )}
        <p className="instalar-print-title">Klima Solutions</p>
        <p className="instalar-print-claim">Escanea para abrir la caja</p>
        <p className="instalar-print-url">{urlLimpia}</p>
        <p className="instalar-print-steps">
          Android: menú ⋮ → «Instalar app» · iPhone: Compartir → «Añadir a pantalla de inicio»
        </p>
      </div>
    </div>
  );
}
