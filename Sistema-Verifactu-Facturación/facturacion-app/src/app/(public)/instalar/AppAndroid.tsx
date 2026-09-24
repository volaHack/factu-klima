'use client';

/**
 * LA APP DE ANDROID
 *
 * Lo primero que viene a buscar quien llega a /instalar desde el móvil:
 * el botón de descarga, qué hacer cuando Android pregunta por «orígenes
 * desconocidos» (que es donde la gente se queda) y la promesa que la
 * distingue, contada con un móvil que la enseña: vende sin cobertura y
 * se sincroniza sola en cuanto vuelve.
 */

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Check, CloudUpload, Database, Download, QrCode, RefreshCw, ShieldCheck, WifiOff,
} from 'lucide-react';

import { APP_ANDROID } from '@/lib/descargas';

const VENTAJAS = [
  { icono: Database, titulo: 'Tus datos en el teléfono', texto: 'Clientes, productos, ventas y facturas se guardan en el propio móvil. Sin cobertura, todo sigue funcionando.' },
  { icono: CloudUpload, titulo: 'Se sincroniza sola', texto: 'En cuanto vuelve la red, lo hecho sin conexión sube a tu cuenta en segundos, en orden y sin duplicados.' },
  { icono: QrCode, titulo: 'Tickets válidos sin línea', texto: 'Cada caja numera en su propia serie: el QR del ticket es el que quedará registrado en Hacienda.' },
  { icono: RefreshCw, titulo: 'Siempre al día', texto: 'La app se actualiza sola cada vez que la abres con conexión. No hay que reinstalar nada.' },
];

export default function AppAndroid() {
  const [qr, setQr] = useState('');

  useEffect(() => {
    // El QR lleva al APK: desde el ordenador, se escanea con el móvil y
    // la descarga empieza en el teléfono, que es donde hace falta.
    QRCode.toDataURL(`${window.location.origin}${APP_ANDROID.ruta}`, {
      width: 240, margin: 0, errorCorrectionLevel: 'M',
      color: { dark: '#3a1420', light: '#00000000' },
    }).then(setQr).catch(() => {});
  }, []);

  return (
    <section id="android" className="apk" aria-labelledby="apk-titulo">
      <div className="apk-inner">
        {/* ── El móvil ── */}
        <div className="apk-escena" aria-hidden="true">
          <div className="apk-halo" />
          <div className="apk-movil">
            <div className="apk-camara" />
            <div className="apk-pantalla">
              <div className="apk-barra">
                <span>9:41</span>
                <span className="apk-barra-red"><WifiOff size={11} /></span>
              </div>
              <div className="apk-app-cabeza">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icon-192.png" alt="" width={28} height={28} />
                <div>
                  <strong>Caja · TPV</strong>
                  <span>Hoy · 14 ventas</span>
                </div>
              </div>
              <div className="apk-estado">
                <span className="apk-estado-off"><WifiOff size={12} /> Sin conexión · 3 ventas guardadas</span>
                <span className="apk-estado-sube"><RefreshCw size={12} /> Subiendo 3 ventas…</span>
                <span className="apk-estado-ok"><Check size={12} /> Todo sincronizado</span>
              </div>
              {[['TPVK3F9-0014', 'Venta al público', '12,40'], ['TPVK3F9-0013', 'Bar Pepe', '86,15'], ['TPVK3F9-0012', 'Venta al público', '4,90']].map(([n, c, t], i) => (
                <div key={n} className="apk-venta" style={{ animationDelay: `${i * 120}ms` }}>
                  <div><strong>{c}</strong><span>{n}</span></div>
                  <b>{t} €</b>
                  <i className="apk-venta-marca" />
                </div>
              ))}
              <div className="apk-cobrar">Cobrar</div>
            </div>
          </div>
          <div className="apk-chip apk-chip--a"><Database size={13} /> Guardado en el móvil</div>
          <div className="apk-chip apk-chip--b"><CloudUpload size={13} /> Supabase al día</div>
        </div>

        {/* ── El texto y la descarga ── */}
        <div className="apk-copy">
          <p className="instalar-kicker">App para Android · v{APP_ANDROID.version}</p>
          <h2 id="apk-titulo" className="apk-titulo">
            Vende con o sin <em className="accent-serif">cobertura</em>
          </h2>
          <p className="apk-lead">
            La app de Klima para móviles y tablets Android. Guarda todo en el teléfono,
            sigue cobrando si se va la línea y lo sube a tu cuenta en cuanto vuelve.
          </p>

          <div className="apk-descarga">
            <a className="btn-primary btn-lg apk-boton" href={APP_ANDROID.ruta} download>
              <Download size={18} /> Descargar para Android
              <small>{APP_ANDROID.tamanoMb.toLocaleString('es-ES')} MB</small>
            </a>
            {qr && (
              <div className="apk-qr">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt="Código QR para descargar la app en el móvil" width={96} height={96} />
                <span>¿Estás en el ordenador? Escanéalo con el móvil.</span>
              </div>
            )}
          </div>

          <ol className="apk-pasos">
            <li><b>Descárgala</b> desde el móvil, con el botón de arriba.</li>
            <li>
              <b>Ábrela.</b> Android preguntará si permites instalar apps de Chrome:
              toca <em>Ajustes</em> → activa <em>Permitir</em> → vuelve e instala.
            </li>
            <li><b>Entra con tu cuenta</b> una vez con conexión. A partir de ahí, funciona también sin ella.</li>
          </ol>

          <ul className="apk-ventajas">
            {VENTAJAS.map(v => (
              <li key={v.titulo}>
                <span className="apk-ventaja-icono"><v.icono size={16} /></span>
                <div><strong>{v.titulo}</strong><p>{v.texto}</p></div>
              </li>
            ))}
          </ul>

          <p className="apk-letra">
            <ShieldCheck size={13} /> Android {APP_ANDROID.androidMinimo} o superior, con Chrome (viene de serie).
            Firmada por Klima Solutions · SHA-256 <code title={APP_ANDROID.sha256}>{APP_ANDROID.sha256.slice(0, 16)}…</code>
          </p>
        </div>
      </div>
    </section>
  );
}
