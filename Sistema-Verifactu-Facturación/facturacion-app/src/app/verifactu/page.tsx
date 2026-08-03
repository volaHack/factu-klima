'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Eye,
  EyeOff,
  Info,
  Loader2,
  Plug,
  ShieldCheck,
  Upload,
  WifiOff,
} from 'lucide-react';
import { uploadVerifactuCertificate, getActiveCertificate, type VerifactuCertificate } from '@/lib/storage';
import { validateP12Certificate } from '@/lib/verifactu/certificate';
import { useToast } from '@/hooks/useToast';
import { useVerifactuConnection } from '@/hooks/useVerifactuConnection';

/**
 * Integración con la AEAT.
 *
 * Toda la página estaba maquetada con utilidades de Tailwind
 * (`grid grid-cols-2`, `p-4 rounded-lg`, `bg-green-50 dark:bg-green-950`,
 * `border-2 border-dashed`, `text-neutral-600`…) y este proyecto no
 * tiene Tailwind: sin dependencia, sin configuración y sin directivas en
 * globals.css. El resultado era una pantalla sin ninguna caja, sin
 * columnas, con el área de carga del certificado indistinguible de un
 * párrafo y textos en grises pensados para fondo blanco sobre el fondo
 * oscuro de la aplicación. Reescrita con el sistema de diseño real
 * (.card, .callout, .status-panel, .dropzone, .def-list, .form-*).
 */

function formatEsDate(value: string | number | Date): string {
  return new Date(value).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
}

export default function VerifactuPage() {
  const { success, error: showError } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [previewCertificate, setPreviewCertificate] = useState<{
    filename: string;
    valid: boolean;
    note?: string;
  } | null>(null);
  const [activeCertificate, setActiveCertificate] = useState<VerifactuCertificate | null>(null);

  const verifactuStatus = useVerifactuConnection();

  useEffect(() => {
    (async () => {
      setActiveCertificate(await getActiveCertificate());
    })();
  }, []);

  const inspectFile = (file: File) => {
    setSelectedFile(file);
    setPassword('');

    const filename = file.name.toLowerCase();
    const isPEM = filename.endsWith('.pem') || filename.endsWith('.crt') || filename.endsWith('.cer');
    const isP12 = filename.endsWith('.p12') || filename.endsWith('.pfx');

    if (!isPEM && !isP12) {
      setPreviewCertificate({
        filename: file.name,
        valid: false,
        note: 'Ese formato no sirve. Necesitamos un .pem, .crt, .cer, .p12 o .pfx.',
      });
      return;
    }

    setPreviewCertificate({
      filename: file.name,
      valid: true,
      note: isPEM
        ? 'Formato PEM. Se validará en el servidor.'
        : 'Formato PKCS#12. Escribe la contraseña con la que lo descargaste.',
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) inspectFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) inspectFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile || !password) {
      showError('Falta la contraseña', 'Elige el certificado y escribe su contraseña para continuar');
      return;
    }

    const name = selectedFile.name.toLowerCase();
    if (name.endsWith('.p12') || name.endsWith('.pfx')) {
      const p12Check = validateP12Certificate(selectedFile.name, password);
      if (!p12Check.valid) {
        showError('No se pudo abrir el certificado', p12Check.error);
        return;
      }
    }

    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const result = await uploadVerifactuCertificate(reader.result as string, password);

        if (!result.success) {
          showError('No se pudo guardar', result.error);
          setUploading(false);
          return;
        }

        success(
          'Certificado guardado y cifrado',
          result.warning || 'Queda pendiente la validación de autenticidad contra la FNMT.'
        );

        setActiveCertificate(await getActiveCertificate());
        setSelectedFile(null);
        setPassword('');
        setPreviewCertificate(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        setUploading(false);
      };

      reader.onerror = () => {
        showError('No se pudo leer el archivo', 'Vuelve a seleccionarlo e inténtalo otra vez');
        setUploading(false);
      };

      reader.readAsDataURL(selectedFile);
    } catch (err) {
      showError('No se pudo guardar', err instanceof Error ? err.message : 'Error desconocido');
      setUploading(false);
    }
  };

  const daysToExpiry = verifactuStatus.expiresAt
    ? Math.ceil((new Date(verifactuStatus.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  const connectionTone = verifactuStatus.isChecking
    ? 'info'
    : verifactuStatus.isConnected ? 'ok' : 'danger';

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <Link href="/dashboard" className="page-back">
            <ArrowLeft /> Volver al panel
          </Link>
          <p className="page-eyebrow"><ShieldCheck /> Verifactu</p>
          <h1 className="page-title">Conexión con la AEAT</h1>
          <p className="page-subtitle">
            Carga tu certificado digital FNMT para poder enviar las facturas telemáticamente.
          </p>
        </div>
      </div>

      {/*
        Aviso de modo demostración. NO ocultar ni condicionar a ningún
        estado: mientras el backend no valide certificados de verdad ni
        envíe facturas a la AEAT, este aviso debe verse siempre, para que
        nadie asuma que "certificado cargado" significa "ya se está
        cumpliendo con Verifactu".
      */}
      <div className="callout callout-warning measure" style={{ marginBottom: 'var(--space-6)' }}>
        <AlertTriangle size={18} />
        <div>
          <strong>Esta integración todavía no está operativa</strong>
          <p>
            El certificado que subas se guarda cifrado, pero el sistema <strong>no comprueba
            todavía que sea un certificado FNMT auténtico</strong> (no valida la cadena de
            confianza ni consulta la lista de revocación).
          </p>
          <p>
            Tampoco se envían facturas a la AEAT de forma automática. No tomes esta pantalla como
            prueba de que ya cumples con Verifactu.
          </p>
        </div>
      </div>

      <div className="grid-2">
        {/* --- Columna izquierda: estado --- */}
        <section className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Estado de la conexión</h2>
              <p className="card-subtitle">Lo que el sistema puede comprobar ahora mismo</p>
            </div>
          </div>

          <div className={`status-panel status-panel--${connectionTone}`}>
            <span className="status-panel-icon">
              {verifactuStatus.isChecking
                ? <Loader2 size={18} className="spin" />
                : verifactuStatus.isConnected ? <Plug size={18} /> : <WifiOff size={18} />}
            </span>
            <div className="status-panel-body">
              <div className="status-panel-title">
                {verifactuStatus.isChecking
                  ? 'Comprobando…'
                  : verifactuStatus.isConnected ? 'Conectado' : 'Sin conexión'}
              </div>
              <p className="status-panel-text">
                {verifactuStatus.isConnected
                  ? 'Conexión de demostración establecida. No confirma que el certificado sea auténtico ni que las facturas se estén enviando.'
                  : verifactuStatus.error || 'Carga un certificado FNMT para establecer la conexión.'}
              </p>
              <div className="status-panel-facts">
                {verifactuStatus.lastCheck && (
                  <span className="status-panel-fact">
                    Última comprobación a las{' '}
                    {new Date(verifactuStatus.lastCheck).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
                {activeCertificate && daysToExpiry !== null && (
                  <span className={`status-panel-fact ${daysToExpiry < 30 ? 'is-warning' : ''}`}>
                    <CalendarClock />
                    {daysToExpiry > 0
                      ? `Caduca el ${formatEsDate(verifactuStatus.expiresAt!)}`
                      : 'Certificado caducado'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {activeCertificate && (
            <div style={{ marginTop: 'var(--space-5)' }}>
              <h3 className="section-title" style={{ marginBottom: 'var(--space-3)' }}>
                <CheckCircle2 size={16} /> Certificado instalado
              </h3>

              {activeCertificate.validationStatus === 'unverified' && (
                <div className="callout callout-warning" style={{ marginBottom: 'var(--space-4)' }}>
                  <AlertTriangle size={16} />
                  <div>
                    <p>
                      Los datos de abajo no se han extraído del certificado real: la lectura del
                      fichero está pendiente de implementar. Trátalos como orientativos.
                    </p>
                  </div>
                </div>
              )}

              <div className="def-list">
                <div className="def-row">
                  <span className="def-label">Sujeto</span>
                  <span className="def-value mono">{activeCertificate.subjectName}</span>
                </div>
                <div className="def-row">
                  <span className="def-label">Emisor</span>
                  <span className="def-value">{activeCertificate.issuerName}</span>
                </div>
                <div className="def-grid">
                  <div className="def-row">
                    <span className="def-label">Válido desde</span>
                    <span className="def-value">{formatEsDate(activeCertificate.notBefore)}</span>
                  </div>
                  <div className="def-row">
                    <span className="def-label">Caduca</span>
                    <span className="def-value">{formatEsDate(activeCertificate.notAfter)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* --- Columna derecha: carga --- */}
        <section className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">{activeCertificate ? 'Sustituir el certificado' : 'Cargar el certificado'}</h2>
              <p className="card-subtitle">Se cifra antes de guardarse; la contraseña no se almacena</p>
            </div>
          </div>

          <div
            className={`dropzone ${dragging ? 'is-dragging' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <Upload size={26} strokeWidth={1.5} className="dropzone-icon" />
            <span className="dropzone-title">Arrastra el archivo aquí o pulsa para buscarlo</span>
            <span className="dropzone-hint">.pem · .crt · .cer · .p12 · .pfx</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pem,.crt,.cer,.p12,.pfx"
              onChange={handleFileSelect}
            />
          </div>

          {selectedFile && previewCertificate && (
            <div className={`file-chip ${previewCertificate.valid ? 'is-valid' : 'is-invalid'}`}>
              {previewCertificate.valid ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}
              <div style={{ minWidth: 0 }}>
                <div className="file-chip-name">{previewCertificate.filename}</div>
                <div className="file-chip-note">{previewCertificate.note}</div>
              </div>
            </div>
          )}

          {selectedFile && (
            <>
              <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
                <label className="form-label required" htmlFor="cert-password">Contraseña del certificado</label>
                <div className="field-affix">
                  <input
                    id="cert-password"
                    className="form-input"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="La que usaste al descargarlo"
                  />
                  <button
                    type="button"
                    className="field-affix-btn"
                    onClick={() => setShowPassword(v => !v)}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <span className="form-hint">
                  No se guarda en ningún sitio. En esta versión de demostración tampoco se usa
                  todavía para descifrar el .p12 de verdad.
                </span>
              </div>

              <button
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center', marginTop: 'var(--space-4)' }}
                onClick={handleUpload}
                disabled={uploading || !password}
              >
                {uploading
                  ? <><Loader2 size={16} className="spin" /> Guardando…</>
                  : <><Upload size={16} /> Instalar certificado</>}
              </button>
            </>
          )}

          <div className="callout callout-info" style={{ marginTop: 'var(--space-5)' }}>
            <Info size={16} />
            <div>
              <strong>¿De dónde saco el certificado?</strong>
              <p>
                Lo descargas desde la web de la FNMT (Fábrica Nacional de Moneda y Timbre) o desde
                tu banco, si te lo emitieron ellos.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
