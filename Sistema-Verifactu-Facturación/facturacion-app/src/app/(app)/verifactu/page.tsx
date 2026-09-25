'use client';

/**
 * LA PANTALLA DEL ENVÍO A HACIENDA
 *
 * Esta pantalla decía «El envío automático a la AEAT todavía no está
 * activo» y ofrecía copiar un XML que ningún servicio habría aceptado.
 * Ahora hace lo que dice: manda los registros de facturación a la
 * Agencia Tributaria y enseña, uno a uno, qué ha pasado con cada uno.
 *
 * TRES DECISIONES DE PANTALLA
 *
 * 1. Lo primero que se ve es lo que está pendiente, no el certificado.
 *    Quien entra aquí a diario entra a mirar si queda algo por enviar;
 *    el certificado se pone una vez al año.
 *
 * 2. «Aceptado con avisos» se pinta distinto de «aceptado» y distinto de
 *    «rechazado», y no ofrece reenviar. La AEAT ya lo tiene: reenviarlo
 *    no arregla el aviso, crea un duplicado.
 *
 * 3. Nunca se dice «enviado» sin que la AEAT lo haya confirmado. Si la
 *    conexión se corta a mitad, el registro se queda pendiente y lo dice.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { avisoNifDistinto, certificadoValeParaNif } from '@/lib/verifactu/titular';
import Link from 'next/link';
import {
  AlertTriangle, ArrowLeft, CheckCircle2, Eye, EyeOff, Loader2, Plug,
  RefreshCw, Send, ShieldCheck, Upload, WifiOff, X,
} from 'lucide-react';
import {
  uploadVerifactuCertificate, getActiveCertificate, revokeVerifactuCertificate,
  checkVerifactuConnection, getCompanySettings, getConfigVerifactu,
  saveConfigVerifactu, getRegistrosVerifactu, enviarPendientesAeat,
  type VerifactuCertificate, type ConfigVerifactu, type RegistroVerifactu,
  type ResultadoEnvioAeat,
} from '@/lib/storage';
import { CompanySettings } from '@/lib/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';
import PageSkeleton from '@/components/ui/PageSkeleton';

function formatEsDate(value: string | number | Date): string {
  return new Date(value).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
}

/** Cómo se pinta cada estado y, sobre todo, qué significa en cristiano. */
const ESTADOS: Record<RegistroVerifactu['estado'], { texto: string; clase: string; explica: string }> = {
  pendiente: {
    texto: 'Pendiente', clase: 'badge-pendiente',
    explica: 'Todavía no ha salido. Se enviará en el próximo envío.',
  },
  enviando: {
    texto: 'Enviando', clase: 'badge-info',
    explica: 'Salió y estamos esperando la respuesta de la AEAT.',
  },
  aceptado: {
    texto: 'Aceptado', clase: 'badge-success',
    explica: 'Registrado en la AEAT. No hay nada más que hacer.',
  },
  aceptado_con_errores: {
    texto: 'Aceptado con avisos', clase: 'badge-warning',
    explica: 'La AEAT lo ha registrado pero avisa de algo. NO se reenvía: ya está presentado.',
  },
  rechazado: {
    texto: 'Rechazado', clase: 'badge-danger',
    explica: 'La AEAT no lo ha aceptado. Hay que corregir el motivo y volver a enviarlo.',
  },
  error_envio: {
    texto: 'Error de envío', clase: 'badge-danger',
    explica: 'No se pudo completar el envío. Se reintentará.',
  },
};

const PENDIENTES: RegistroVerifactu['estado'][] = ['pendiente', 'error_envio', 'rechazado'];

export default function VerifactuPage() {
  const { success, warning, error: showError } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mounted, setMounted] = useState(false);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [config, setConfig] = useState<ConfigVerifactu | null>(null);
  const [productorPlataforma, setProductorPlataforma] = useState<{ nombre: string; nif: string; sistema: string; version: string } | null>(null);
  const [registros, setRegistros] = useState<RegistroVerifactu[]>([]);
  const [activeCertificate, setActiveCertificate] = useState<VerifactuCertificate | null>(null);

  const [uploading, setUploading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [ultimoEnvio, setUltimoEnvio] = useState<ResultadoEnvioAeat | null>(null);
  const [detalle, setDetalle] = useState<RegistroVerifactu | null>(null);

  const [connectionStatus, setConnectionStatus] = useState<{ connected: boolean; message: string; checkedAt: string | null }>({
    connected: false,
    message: 'Sube tu certificado y pulsa «Comprobar conexión» para saber si la AEAT lo acepta.',
    checkedAt: null,
  });

  const cargar = useCallback(async () => {
    const [ajustes, cfg, cert, regs] = await Promise.all([
      getCompanySettings(), getConfigVerifactu(), getActiveCertificate(), getRegistrosVerifactu(),
    ]);
    setCompanySettings(ajustes);
    setConfig(cfg);
    setActiveCertificate(cert);
    setRegistros(regs);
  }, []);

  useEffect(() => {
    (async () => {
      await cargar();
      try {
        const r = await fetch('/api/plataforma/productor');
        const p = await r.json();
        if (p?.configurado) setProductorPlataforma(p);
      } catch { /* sin conexión: se piden a la cuenta, como antes */ }
      setMounted(true);
    })();
  }, [cargar]);

  const pendientes = registros.filter(r => PENDIENTES.includes(r.estado));
  const aceptados = registros.filter(r => r.estado === 'aceptado' || r.estado === 'aceptado_con_errores');
  const rechazados = registros.filter(r => r.estado === 'rechazado');

  // ---------- Configuración ----------
  const cambiarConfig = (cambio: Partial<ConfigVerifactu>) => {
    setConfig(actual => (actual ? { ...actual, ...cambio } : actual));
  };

  const guardarConfig = async () => {
    if (!config) return;
    setGuardando(true);
    try {
      await saveConfigVerifactu(config);
      success('Configuración guardada');
    } catch (err) {
      showError('No se ha podido guardar', err instanceof Error ? err.message : 'Inténtalo de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  // ---------- Envío ----------
  const enviar = async () => {
    setEnviando(true);
    setUltimoEnvio(null);
    try {
      const resultado = await enviarPendientesAeat();
      setUltimoEnvio(resultado);
      await cargar();

      if (!resultado.ok) {
        showError('No se ha podido enviar', resultado.error ?? 'Revisa el detalle de abajo.');
      } else if ((resultado.enviados ?? 0) === 0) {
        success('No hay nada pendiente', resultado.mensaje ?? 'Está todo enviado.');
      } else if ((resultado.rechazados ?? 0) > 0) {
        warning('Envío con rechazos', resultado.resumen ?? '');
      } else {
        success('Enviado a la AEAT', resultado.resumen ?? '');
      }
    } finally {
      setEnviando(false);
    }
  };

  // ---------- Certificado ----------
  const inspectFile = (file: File) => {
    setSelectedFile(file);
    setPassword('');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) inspectFile(file);
  };

  const handleUploadCertificate = async () => {
    if (!selectedFile || !password) {
      showError('Falta la contraseña', 'Elige el certificado y escribe su contraseña.');
      return;
    }

    setUploading(true);
    const lector = new FileReader();
    lector.onload = async () => {
      try {
        const resultado = await uploadVerifactuCertificate(lector.result as string, password);
        if (!resultado.success) {
          showError('El certificado no se ha podido instalar', resultado.error || 'Revisa el archivo y la contraseña.');
          return;
        }

        setActiveCertificate(await getActiveCertificate());
        setSelectedFile(null);
        setPassword('');
        setConnectionStatus({
          connected: false,
          message: 'Certificado comprobado y guardado. Pulsa «Comprobar conexión» para ver si la AEAT lo acepta.',
          checkedAt: null,
        });

        const avisos = (resultado as { avisos?: string[] }).avisos ?? [];
        if (avisos.length) warning('Certificado guardado, con avisos', avisos.join(' · '));
        else success('Certificado comprobado y guardado', 'La contraseña es correcta y el certificado es válido.');
      } catch (err) {
        showError('Error de instalación', err instanceof Error ? err.message : 'No se pudo instalar el certificado.');
      } finally {
        setUploading(false);
      }
    };
    lector.onerror = () => {
      showError('No se ha podido leer el archivo', 'Vuelve a seleccionarlo.');
      setUploading(false);
    };
    lector.readAsDataURL(selectedFile);
  };

  const handleRevokeCertificate = async () => {
    if (!confirm('¿Desvincular el certificado? Dejarán de enviarse facturas hasta que subas otro.')) return;
    try {
      await revokeVerifactuCertificate();
      setActiveCertificate(null);
      setConnectionStatus({ connected: false, message: 'No hay certificado activo.', checkedAt: null });
      warning('Certificado desvinculado');
    } catch {
      showError('Error', 'No se pudo desvincular el certificado.');
    }
  };

  const handleTestConnection = async () => {
    setCheckingConnection(true);
    try {
      const r = await checkVerifactuConnection();
      setConnectionStatus({
        connected: r.isConnected,
        message: r.isConnected
          ? 'La AEAT acepta el certificado. El canal está listo para enviar.'
          : r.error || 'No se ha podido establecer la conexión.',
        checkedAt: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      });
      if (r.isConnected) success('Conexión correcta', 'La AEAT ha aceptado el certificado.');
      else warning('Sin conexión', r.error || 'Revisa el certificado.');
    } finally {
      setCheckingConnection(false);
    }
  };

  if (!mounted || !companySettings || !config) {
    return <PageSkeleton variant="list" label="Cargando el envío a la AEAT" />;
  }

  // Si la plataforma ya dice quién produce el programa, no se le pregunta a la cuenta.
  const faltaProductor = !productorPlataforma && (!config.productorNombre.trim() || !config.productorNif.trim());
  // El certificado tiene que ser del que factura: con otro NIF, la AEAT
  // rechaza el envío en la cabecera y el registro ya no tiene arreglo.
  const nifNoCoincide = !!activeCertificate
    && certificadoValeParaNif(activeCertificate.subjectName, companySettings.nif) === false;
  const listoParaEnviar = config.activo && !!activeCertificate && !faltaProductor && !nifNoCoincide;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <Link href="/dashboard" className="page-back"><ArrowLeft size={16} /> Volver al panel</Link>
          <p className="page-eyebrow"><ShieldCheck /> Veri*Factu · Orden HAC/1177/2024</p>
          <h1 className="page-title">Envío a la Agencia Tributaria</h1>
          <p className="page-subtitle">
            Cada factura que emites genera un registro encadenado con el anterior. Aquí se mandan
            a la AEAT y se ve, uno a uno, qué ha dicho de cada uno.
          </p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={handleTestConnection} disabled={checkingConnection || !activeCertificate}>
            {checkingConnection ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
            {checkingConnection ? 'Comprobando…' : 'Comprobar conexión'}
          </button>
          <button className="btn btn-primary" onClick={enviar} disabled={enviando || !listoParaEnviar || pendientes.length === 0}>
            {enviando ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
            {enviando ? 'Enviando…' : `Enviar ${pendientes.length || ''}`.trim()}
          </button>
        </div>
      </div>

      {/* ---------- Lo primero: qué falta por enviar ---------- */}
      <section className="card" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="stat-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))', gap: 'var(--space-4)' }}>
          <div>
            <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, color: pendientes.length ? 'var(--color-warning)' : 'var(--text-primary)' }}>
              {pendientes.length}
            </div>
            <div className="card-subtitle" style={{ margin: 0 }}>por enviar</div>
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, color: 'var(--color-success)' }}>{aceptados.length}</div>
            <div className="card-subtitle" style={{ margin: 0 }}>registrados en la AEAT</div>
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, color: rechazados.length ? 'var(--color-danger)' : 'var(--text-primary)' }}>
              {rechazados.length}
            </div>
            <div className="card-subtitle" style={{ margin: 0 }}>rechazados</div>
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 800 }}>{registros.length}</div>
            <div className="card-subtitle" style={{ margin: 0 }}>registros en la cadena</div>
          </div>
        </div>

        {!listoParaEnviar && (
          <div className="status-panel status-panel--warning" style={{ marginTop: 'var(--space-5)' }}>
            <span className="status-panel-icon"><AlertTriangle size={18} /></span>
            <div className="status-panel-body">
              <div className="status-panel-title">Todavía falta algo para poder enviar</div>
              <ul className="status-panel-text" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {!activeCertificate && <li>Sube tu certificado digital, aquí abajo.</li>}
                {faltaProductor && <li>Rellena quién produce el software (nombre y NIF): la AEAT lo exige en cada registro.</li>}
                {nifNoCoincide && activeCertificate && (
                  <li>
                    <strong>{avisoNifDistinto(activeCertificate.subjectName, companySettings.nif)}</strong>{' '}
                    <Link href="/ajustes">Ir a Ajustes</Link>
                  </li>
                )}
                {!config.activo && <li>Activa el envío en la configuración de abajo.</li>}
              </ul>
            </div>
          </div>
        )}

        {ultimoEnvio && (
          <div
            className={`status-panel ${ultimoEnvio.ok && !(ultimoEnvio.rechazados ?? 0) ? 'status-panel--ok' : 'status-panel--warning'}`}
            style={{ marginTop: 'var(--space-4)' }}
          >
            <span className="status-panel-icon">
              {ultimoEnvio.ok ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            </span>
            <div className="status-panel-body">
              <div className="status-panel-title">
                {ultimoEnvio.ok ? (ultimoEnvio.resumen || ultimoEnvio.mensaje || 'Envío completado') : 'El envío no ha salido'}
              </div>
              {!ultimoEnvio.ok && <p className="status-panel-text">{ultimoEnvio.error}</p>}
              {ultimoEnvio.csv && (
                <div className="status-panel-facts">
                  <span className="status-panel-fact">CSV del envío: <span className="mono">{ultimoEnvio.csv}</span></span>
                </div>
              )}
              {!!ultimoEnvio.sinRespuesta && (
                <p className="status-panel-text">
                  {ultimoEnvio.sinRespuesta} {ultimoEnvio.sinRespuesta === 1 ? 'registro se ha quedado' : 'registros se han quedado'} sin
                  respuesta de la AEAT. Se vuelven a intentar en el próximo envío.
                </p>
              )}
              {!!ultimoEnvio.problemas?.length && (
                <div style={{ marginTop: 8 }}>
                  <p className="status-panel-text" style={{ fontWeight: 600 }}>
                    Estas no han salido porque les falta algo:
                  </p>
                  <ul className="status-panel-text" style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                    {ultimoEnvio.problemas.map(p => (
                      <li key={p.numero}><b>{p.numero}</b> — {p.problemas.join(' ')}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      <div className="grid-2" style={{ marginBottom: 'var(--space-6)' }}>
        {/* ---------- Configuración ---------- */}
        <section className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Configuración del envío</h2>
              <p className="card-subtitle">{companySettings.businessName} · {companySettings.nif}</p>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
            <label className="form-label">Entorno de la AEAT</label>
            <div className="choice-grid">
              <button
                type="button"
                className={`choice-card ${config.entorno === 'pruebas' ? 'active' : ''}`}
                onClick={() => cambiarConfig({ entorno: 'pruebas' })}
                style={{ padding: 'var(--space-3)' }}
              >
                <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>Pruebas</div>
                <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
                  Lo que se envía aquí no cuenta. Empieza por aquí.
                </div>
              </button>
              <button
                type="button"
                className={`choice-card ${config.entorno === 'produccion' ? 'active' : ''}`}
                onClick={() => cambiarConfig({ entorno: 'produccion' })}
                style={{ padding: 'var(--space-3)' }}
              >
                <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--accent-500)' }}>Producción</div>
                <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
                  Registro oficial. Lo que entra aquí, entra de verdad.
                </div>
              </button>
            </div>
          </div>

          {/* Datos del productor: los pone la plataforma; si no, la cuenta. */}
          {productorPlataforma ? (
            <div className="form-group">
              <label className="form-label">Quién produce el software</label>
              <p className="form-hint" style={{ marginTop: 0 }}>
                {productorPlataforma.nombre} · NIF {productorPlataforma.nif} · {productorPlataforma.sistema} {productorPlataforma.version}.
                {' '}Lo pone el fabricante del programa y va en cada registro que se envía.
                {' '}<Link href="/legal/declaracion-responsable" target="_blank">Ver la declaración responsable</Link>.
              </p>
            </div>
          ) : (
          <div className="form-group">
            <label className="form-label required">Quién produce el software</label>
            <p className="form-hint" style={{ marginTop: 0 }}>
              La AEAT exige identificar en cada registro a quien fabrica el programa, no a quien lo usa.
              Si el programa te lo han vendido, pon los datos de quien te lo vende; si es de desarrollo
              propio, los tuyos.
            </p>
            <input
              className="form-input"
              placeholder="Nombre o razón social del productor"
              value={config.productorNombre}
              onChange={e => cambiarConfig({ productorNombre: e.target.value })}
              style={{ marginBottom: 'var(--space-2)' }}
            />
            <input
              className="form-input"
              placeholder="NIF del productor"
              value={config.productorNif}
              onChange={e => cambiarConfig({ productorNif: e.target.value.toUpperCase() })}
            />
          </div>
          )}

          <label className="switch-row" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: 'var(--space-4) 0' }}>
            <input
              type="checkbox"
              checked={config.activo}
              onChange={e => cambiarConfig({ activo: e.target.checked })}
            />
            <span>
              <b>Enviar mis facturas a la AEAT</b>
              <span style={{ display: 'block', fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
                Mientras esto esté apagado, las facturas se siguen sellando y encadenando, pero no salen.
              </span>
            </span>
          </label>

          <button className="btn btn-primary" onClick={guardarConfig} disabled={guardando} style={{ width: '100%', justifyContent: 'center' }}>
            {guardando ? <Loader2 size={16} className="spin" /> : <CheckCircle2 size={16} />}
            Guardar configuración
          </button>
        </section>

        {/* ---------- Certificado ---------- */}
        <section className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Certificado digital</h2>
              <p className="card-subtitle">Es lo que te identifica ante la AEAT. Se guarda cifrado en el servidor.</p>
            </div>
          </div>

          <div className={`status-panel ${connectionStatus.connected ? 'status-panel--ok' : 'status-panel--danger'}`} style={{ marginBottom: 'var(--space-4)' }}>
            <span className="status-panel-icon">
              {checkingConnection ? <Loader2 size={18} className="spin" /> : connectionStatus.connected ? <Plug size={18} /> : <WifiOff size={18} />}
            </span>
            <div className="status-panel-body">
              <div className="status-panel-title">
                {connectionStatus.connected ? 'La AEAT acepta el certificado' : 'Conexión sin comprobar'}
              </div>
              <p className="status-panel-text">{connectionStatus.message}</p>
              {connectionStatus.checkedAt && (
                <div className="status-panel-facts">
                  <span className="status-panel-fact">Comprobado a las {connectionStatus.checkedAt}</span>
                </div>
              )}
            </div>
          </div>

          {activeCertificate ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div className="def-list">
                <div className="def-row">
                  <span className="def-label">Titular</span>
                  <span className="def-value mono">{activeCertificate.subjectName}</span>
                </div>
                <div className="def-row">
                  <span className="def-label">Emitido por</span>
                  <span className="def-value">{activeCertificate.issuerName}</span>
                </div>
                <div className="def-row">
                  <span className="def-label">Caduca</span>
                  <span className="def-value">{formatEsDate(activeCertificate.notAfter)}</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => fileInputRef.current?.click()}>
                  <Upload size={15} /> Sustituir
                </button>
                <button className="btn btn-ghost" style={{ color: '#ef4444' }} onClick={handleRevokeCertificate}>
                  Desvincular
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div
                className={`dropzone ${dragging ? 'is-dragging' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
              >
                <Upload size={26} strokeWidth={1.5} className="dropzone-icon" />
                <span className="dropzone-title">Tu certificado en formato .p12 o .pfx</span>
                <span className="dropzone-hint">
                  Tiene que llevar la clave privada dentro. Un .cer o un .crt sueltos no sirven para conectar.
                </span>
              </div>

              {selectedFile && (
                <div style={{ marginTop: 'var(--space-4)' }}>
                  <div className="file-chip is-valid" style={{ marginBottom: 'var(--space-3)' }}>
                    <CheckCircle2 size={16} />
                    <div className="file-chip-name">{selectedFile.name}</div>
                  </div>

                  <div className="form-group">
                    <label className="form-label required">Contraseña del certificado</label>
                    <div className="field-affix">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        className="form-input"
                        placeholder="La que pusiste al exportarlo"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && password) handleUploadCertificate(); }}
                      />
                      <button type="button" className="field-affix-btn" onClick={() => setShowPassword(!showPassword)}>
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <p className="form-hint">
                      Se comprueba al momento: si la contraseña no es la buena, te lo decimos ahora y no
                      dentro de un mes con un error incomprensible.
                    </p>
                  </div>

                  <button
                    className="btn btn-primary"
                    style={{ width: '100%', justifyContent: 'center', marginTop: 'var(--space-3)' }}
                    onClick={handleUploadCertificate}
                    disabled={uploading || !password}
                  >
                    {uploading ? <Loader2 size={16} className="spin" /> : <ShieldCheck size={16} />}
                    {uploading ? 'Comprobando y guardando…' : 'Instalar certificado'}
                  </button>
                </div>
              )}
            </div>
          )}
          <input ref={fileInputRef} type="file" accept=".p12,.pfx" onChange={e => { const f = e.target.files?.[0]; if (f) inspectFile(f); }} style={{ display: 'none' }} />
        </section>
      </div>

      {/* ---------- La cadena ---------- */}
      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Registros de facturación</h2>
            <p className="card-subtitle">
              Cada uno lleva la huella del anterior: eso es lo que hace que no se pueda quitar una factura
              de en medio sin que se note. Los más recientes, arriba.
            </p>
          </div>
        </div>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>N.º</th>
                <th>Documento</th>
                <th>Fecha</th>
                <th>Tipo</th>
                <th style={{ textAlign: 'right' }}>Importe</th>
                <th>Estado</th>
                <th>Huella</th>
              </tr>
            </thead>
            <tbody>
              {registros.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--text-muted)' }}>
                    Todavía no hay ninguna factura emitida. En cuanto emitas la primera aparecerá aquí.
                  </td>
                </tr>
              ) : (
                registros.map(r => {
                  const estado = ESTADOS[r.estado];
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setDetalle(r)}
                      style={{ cursor: 'pointer' }}
                      title="Ver el detalle de este registro"
                    >
                      <td className="mono" style={{ color: 'var(--text-muted)' }}>{r.indice}</td>
                      <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                        {r.numSerie}
                        {r.tipoRegistro === 'anulacion' && (
                          <span className="badge badge-anulado" style={{ marginLeft: 6 }}>anulación</span>
                        )}
                      </td>
                      <td>{formatDate(r.fechaExpedicion)}</td>
                      <td className="mono">{r.tipoFactura ?? '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {r.tipoRegistro === 'alta' ? formatCurrency(r.importeTotal) : '—'}
                      </td>
                      <td><span className={`badge ${estado.clase}`}>{estado.texto}</span></td>
                      <td>
                        <span className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {r.huella.slice(0, 14)}…
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------- Detalle de un registro ---------- */}
      {detalle && (
        <div className="modal-overlay" onClick={() => setDetalle(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640, width: '90vw' }}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">{detalle.numSerie}</h3>
                <p className="card-subtitle" style={{ margin: 0 }}>
                  Registro {detalle.indice} de la cadena · {detalle.tipoRegistro === 'alta' ? 'alta' : 'anulación'}
                </p>
              </div>
              <button className="modal-close" onClick={() => setDetalle(null)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className={`status-panel ${detalle.estado === 'aceptado' ? 'status-panel--ok' : detalle.estado === 'rechazado' || detalle.estado === 'error_envio' ? 'status-panel--danger' : 'status-panel--warning'}`}>
                <span className="status-panel-icon">
                  {detalle.estado === 'aceptado' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                </span>
                <div className="status-panel-body">
                  <div className="status-panel-title">{ESTADOS[detalle.estado].texto}</div>
                  <p className="status-panel-text">{ESTADOS[detalle.estado].explica}</p>
                  {detalle.descripcionError && (
                    <p className="status-panel-text" style={{ marginTop: 6 }}>
                      <b>La AEAT dice:</b> {detalle.descripcionError}
                      {detalle.codigoError && <span className="mono"> (código {detalle.codigoError})</span>}
                    </p>
                  )}
                </div>
              </div>

              <div className="def-list" style={{ marginTop: 'var(--space-4)' }}>
                <div className="def-row">
                  <span className="def-label">Generado el</span>
                  <span className="def-value mono">{detalle.fechaHoraHuso}</span>
                </div>
                <div className="def-row">
                  <span className="def-label">Huella de este registro</span>
                  <span className="def-value mono" style={{ wordBreak: 'break-all' }}>{detalle.huella}</span>
                </div>
                <div className="def-row">
                  <span className="def-label">Huella del anterior</span>
                  <span className="def-value mono" style={{ wordBreak: 'break-all' }}>
                    {detalle.huellaAnterior ?? 'Ninguna: es el primero de la cadena'}
                  </span>
                </div>
                {detalle.csvAeat && (
                  <div className="def-row">
                    <span className="def-label">CSV de la AEAT</span>
                    <span className="def-value mono">{detalle.csvAeat}</span>
                  </div>
                )}
                {detalle.entorno && (
                  <div className="def-row">
                    <span className="def-label">Enviado al entorno</span>
                    <span className="def-value">{detalle.entorno === 'produccion' ? 'Producción' : 'Pruebas'}</span>
                  </div>
                )}
                {detalle.respondidoEn && (
                  <div className="def-row">
                    <span className="def-label">Respuesta recibida</span>
                    <span className="def-value">{new Date(detalle.respondidoEn).toLocaleString('es-ES')}</span>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-4)' }}>
                <button className="btn btn-primary" onClick={() => setDetalle(null)}>Cerrar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
