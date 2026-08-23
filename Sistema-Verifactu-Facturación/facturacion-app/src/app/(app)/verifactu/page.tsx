'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, CheckCircle2, Code2, Eye, EyeOff, FileCode, Loader2, Plug,
  RefreshCw, ShieldCheck, Upload, WifiOff, X,
} from 'lucide-react';
import {
  uploadVerifactuCertificate, getActiveCertificate, getInvoices,
  getCompanySettings, revokeVerifactuCertificate, checkVerifactuConnection,
  type VerifactuCertificate,
} from '@/lib/storage';
import { generateVerifactuSoapXml } from '@/lib/verifactu/aeatXmlGenerator';
import { Invoice, CompanySettings, InvoiceStatus } from '@/lib/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';
import PageSkeleton from '@/components/ui/PageSkeleton';

function formatEsDate(value: string | number | Date): string {
  return new Date(value).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
}

export default function VerifactuPage() {
  const { success, warning, error: showError } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mounted, setMounted] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  
  // Settings & Cert state
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [activeCertificate, setActiveCertificate] = useState<VerifactuCertificate | null>(null);
  const [aeatEnvironment, setAeatEnvironment] = useState<'test' | 'production'>('test');
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{ connected: boolean; message: string; checkedAt: string | null }>({
    connected: false,
    message: 'Habilita o carga un certificado digital FNMT para iniciar la comunicación con AEAT.',
    checkedAt: null,
  });

  // Invoices
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [viewXmlInvoice, setViewXmlInvoice] = useState<Invoice | null>(null);

  /**
   * Traduce el resultado real de `checkVerifactuConnection` al estado que
   * pinta la pantalla. Ni aquí ni en el backend se inventa una conexión: hoy
   * esto es, como mucho, un aviso de cortesía sin TLS mutuo (ver
   * `/api/verifactu/health`), y si la integración no está activada dice
   * exactamente eso en vez de fingir un 200 OK.
   */
  const aplicarEstadoConexion = (resultado: { isConnected: boolean; statusCode: string | null; error: string | null }) => {
    setConnectionStatus({
      connected: resultado.isConnected,
      message: resultado.isConnected
        ? `AEAT ha respondido correctamente (estado ${resultado.statusCode}).`
        : resultado.error || 'No se ha podido verificar la conexión con la AEAT.',
      checkedAt: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    });
    return resultado;
  };

  const loadAllData = async () => {
    const [settings, cert, invs] = await Promise.all([
      getCompanySettings(),
      getActiveCertificate(),
      getInvoices(),
    ]);
    setCompanySettings(settings);
    setActiveCertificate(cert);
    setInvoices(invs.filter(i => i.status === InvoiceStatus.EMITIDA || i.status === InvoiceStatus.PAGADA));

    if (cert) await aplicarEstadoConexion(await checkVerifactuConnection());
  };

  useEffect(() => {
    (async () => {
      await loadAllData();
      setMounted(true);
    })();
  }, []);

  const inspectFile = (file: File) => {
    setSelectedFile(file);
    setPassword('');
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

  const handleUploadCertificate = async () => {
    if (!selectedFile || !password) {
      showError('Falta la contraseña', 'Elige el certificado y escribe la contraseña para guardarlo.');
      return;
    }

    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const fileContent = reader.result as string;
          const resultado = await uploadVerifactuCertificate(fileContent, password);

          if (!resultado.success) {
            showError('Error de instalación', resultado.error || 'No se pudo instalar el certificado.');
            return;
          }

          // El servidor es quien decide qué se guarda de verdad (hoy, sin
          // parsear el X.509 real — ver la advertencia en el propio
          // endpoint): se relee el certificado activo en vez de inventarnos
          // aquí un "CN=..., AC FNMT Usuarios" que nadie ha comprobado.
          setActiveCertificate(await getActiveCertificate());
          setSelectedFile(null);
          setPassword('');

          setConnectionStatus({
            connected: false,
            message: resultado.warning || 'Certificado guardado. Todavía no se ha comprobado contra la AEAT.',
            checkedAt: null,
          });

          success('Certificado guardado', resultado.warning || 'Certificado cifrado y guardado correctamente.');
        } catch (err) {
          showError('Error de instalación', err instanceof Error ? err.message : 'No se pudo instalar el certificado.');
        } finally {
          setUploading(false);
        }
      };
      reader.readAsDataURL(selectedFile);
    } catch (err) {
      showError('Error de instalación', err instanceof Error ? err.message : 'No se pudo instalar el certificado.');
      setUploading(false);
    }
  };

  const handleRevokeCertificate = async () => {
    if (!confirm('¿Deseas desvincular el certificado digital activo de esta empresa?')) return;
    try {
      await revokeVerifactuCertificate();
      setActiveCertificate(null);
      setConnectionStatus({
        connected: false,
        message: 'No hay certificado digital activo configurado.',
        checkedAt: null,
      });
      warning('Certificado desvinculado', 'Se ha eliminado el certificado activo.');
    } catch {
      showError('Error', 'No se pudo revocar el certificado.');
    }
  };

  const handleTestConnection = async () => {
    setCheckingConnection(true);
    try {
      const resultado = await aplicarEstadoConexion(await checkVerifactuConnection());
      if (resultado.isConnected) {
        success('Conexión AEAT', `AEAT ha respondido correctamente (estado ${resultado.statusCode}).`);
      } else {
        warning('Sin conexión verificada', resultado.error || 'No se ha podido verificar la conexión con la AEAT.');
      }
    } finally {
      setCheckingConnection(false);
    }
  };

  if (!mounted || !companySettings) {
    return <PageSkeleton variant="list" label="Cargando modulo Verifactu AEAT" />;
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <Link href="/dashboard" className="page-back">
            <ArrowLeft size={16} /> Volver al panel
          </Link>
          <p className="page-eyebrow"><ShieldCheck /> Reglamento Verifactu · RD 1007/2023</p>
          <h1 className="page-title">Conexión e Integración AEAT</h1>
          <p className="page-subtitle">
            Gestión del certificado digital FNMT, entorno de transmisión y registro telemático oficial de facturas con Hacienda.
          </p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={handleTestConnection} disabled={checkingConnection}>
            {checkingConnection ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
            {checkingConnection ? 'Probando TLS AEAT…' : 'Comprobar Conexión AEAT'}
          </button>
        </div>
      </div>

      {/* Main Grid: Connection Status & Certificate Management */}
      <div className="grid-2" style={{ marginBottom: 'var(--space-6)' }}>
        {/* Left Column: Connection Status & Environment Switch */}
        <section className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Configuración de Entorno AEAT</h2>
              <p className="card-subtitle">Empresa: {companySettings.businessName} ({companySettings.nif})</p>
            </div>
          </div>

          <div className={`status-panel ${connectionStatus.connected ? 'status-panel--ok' : 'status-panel--danger'}`} style={{ marginBottom: 'var(--space-5)' }}>
            <span className="status-panel-icon">
              {checkingConnection ? <Loader2 size={18} className="spin" /> : connectionStatus.connected ? <Plug size={18} /> : <WifiOff size={18} />}
            </span>
            <div className="status-panel-body">
              <div className="status-panel-title">
                {connectionStatus.connected ? 'Conexión AEAT Comprobada' : 'Sin Conexión AEAT'}
              </div>
              <p className="status-panel-text">{connectionStatus.message}</p>
              {connectionStatus.checkedAt && (
                <div className="status-panel-facts">
                  <span className="status-panel-fact">Última comprobación: {connectionStatus.checkedAt}</span>
                </div>
              )}
            </div>
          </div>

          {/* Environment selector */}
          <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
            <label className="form-label">Servidor / Entorno de la AEAT</label>
            <div className="choice-grid">
              <button
                type="button"
                className={`choice-card ${aeatEnvironment === 'test' ? 'active' : ''}`}
                onClick={() => setAeatEnvironment('test')}
                style={{ padding: 'var(--space-3)' }}
              >
                <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>Entorno de Pruebas (PRE)</div>
                <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>prewww1.aeat.es (Sandbox de ensayo)</div>
              </button>
              <button
                type="button"
                className={`choice-card ${aeatEnvironment === 'production' ? 'active' : ''}`}
                onClick={() => setAeatEnvironment('production')}
                style={{ padding: 'var(--space-3)' }}
              >
                <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--accent-500)' }}>Entorno Producción Real</div>
                <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>www1.aeat.es (Registro oficial)</div>
              </button>
            </div>
          </div>

          {/* Estado real del envío telemático */}
          <div className="status-panel status-panel--warning" style={{ alignItems: 'center' }}>
            <span className="status-panel-icon"><WifiOff size={18} /></span>
            <div className="status-panel-body">
              <div className="status-panel-title">El envío automático a la AEAT todavía no está activo</div>
              <p className="status-panel-text">
                Cada factura ya genera y sella su huella SHA-256 encadenada en el momento de emitirse, y su código QR de
                cotejo sale impreso en el PDF. Lo que falta por conectar es la transmisión telemática (SOAP firmado) al
                registro de la AEAT: mientras tanto, puedes preparar y copiar el XML de cada factura desde la tabla de
                abajo y enviarlo tú mismo si lo necesitas.
              </p>
            </div>
          </div>
        </section>

        {/* Right Column: Certificate Management */}
        <section className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Certificado Digital FNMT / Representante</h2>
              <p className="card-subtitle">Cifrado AES-256 en reposo para firma telemática</p>
            </div>
          </div>

          {activeCertificate ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div className="status-panel status-panel--ok">
                <span className="status-panel-icon"><CheckCircle2 size={18} /></span>
                <div className="status-panel-body">
                  <div className="status-panel-title">Certificado Activo e Instalado</div>
                  <p className="status-panel-text">Válido hasta el {formatEsDate(activeCertificate.notAfter)}</p>
                </div>
              </div>

              <div className="def-list">
                <div className="def-row">
                  <span className="def-label">Titular / Sujeto</span>
                  <span className="def-value mono">{activeCertificate.subjectName}</span>
                </div>
                <div className="def-row">
                  <span className="def-label">Autoridad Emisora</span>
                  <span className="def-value">{activeCertificate.issuerName}</span>
                </div>
                <div className="def-row">
                  <span className="def-label">N.º Serie Certificado</span>
                  <span className="def-value mono">{activeCertificate.serialNumber}</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => fileInputRef.current?.click()}>
                  <Upload size={15} /> Sustituir Certificado
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
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
              >
                <Upload size={26} strokeWidth={1.5} className="dropzone-icon" />
                <span className="dropzone-title">Selecciona tu certificado FNMT (.p12, .pfx, .pem)</span>
                <span className="dropzone-hint">Formatos soportados: PKCS#12 (.p12 / .pfx) y X.509 (.pem / .crt)</span>
              </div>

              {selectedFile && (
                <div style={{ marginTop: 'var(--space-4)' }}>
                  <div className="file-chip is-valid" style={{ marginBottom: 'var(--space-3)' }}>
                    <CheckCircle2 size={16} />
                    <div className="file-chip-name">{selectedFile.name}</div>
                  </div>

                  <div className="form-group">
                    <label className="form-label required">Contraseña del Certificado</label>
                    <div className="field-affix">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        className="form-input"
                        placeholder="Introduce la clave del archivo .p12"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                      />
                      <button type="button" className="field-affix-btn" onClick={() => setShowPassword(!showPassword)}>
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <button
                    className="btn btn-primary"
                    style={{ width: '100%', justifyContent: 'center', marginTop: 'var(--space-3)' }}
                    onClick={handleUploadCertificate}
                    disabled={uploading || !password}
                  >
                    {uploading ? <Loader2 size={16} className="spin" /> : <ShieldCheck size={16} />}
                    {uploading ? 'Instalando y Cifrando…' : 'Instalar Certificado para AEAT'}
                  </button>
                </div>
              )}
            </div>
          )}
          <input ref={fileInputRef} type="file" accept=".p12,.pfx,.pem,.crt,.cer" onChange={handleFileSelect} style={{ display: 'none' }} />
        </section>
      </div>

      {/* Section: facturas selladas y su XML Verifactu */}
      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Facturas Selladas (Verifactu)</h2>
            <p className="card-subtitle">
              Huella SHA-256 encadenada de cada factura emitida ({invoices.length} facturas en registro). El envío
              telemático a la AEAT no está activo todavía: usa «Inspeccionar SOAP XML» para prepararlo y copiarlo tú mismo.
            </p>
          </div>
        </div>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Factura N.º</th>
                <th>Fecha Emisión</th>
                <th>Cliente / Destinatario</th>
                <th style={{ textAlign: 'right' }}>Importe Total</th>
                <th>Huella SHA-256</th>
                <th style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--text-muted)' }}>
                    No hay facturas emitidas registradas todavía.
                  </td>
                </tr>
              ) : (
                invoices.map(inv => (
                  <tr key={inv.id}>
                    <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{inv.number}</td>
                    <td>{formatDate(inv.issueDate)}</td>
                    <td>{inv.clientName}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>{formatCurrency(inv.total)}</td>
                    <td>
                      <span className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {inv.verifactu?.chainedHash ? `${inv.verifactu.chainedHash.slice(0, 14)}…` : 'HASH-PENDING'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setViewXmlInvoice(inv)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        <Code2 size={14} /> Inspeccionar SOAP XML
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* XML Inspection Modal */}
      {viewXmlInvoice && (
        <div className="modal-overlay" onClick={() => setViewXmlInvoice(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 740, width: '90vw' }}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Sobre SOAP XML Verifactu AEAT</h3>
                <p className="card-subtitle" style={{ margin: 0 }}>Factura N.º {viewXmlInvoice.number} · Cumplimiento RD 1007/2023</p>
              </div>
              <button className="modal-close" onClick={() => setViewXmlInvoice(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div style={{ background: '#1e1e2e', color: '#a6adc8', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-mono)', fontSize: '12px', overflowX: 'auto', maxHeight: 380 }}>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                  {generateVerifactuSoapXml(viewXmlInvoice, companySettings, aeatEnvironment)}
                </pre>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    const xml = generateVerifactuSoapXml(viewXmlInvoice, companySettings, aeatEnvironment);
                    navigator.clipboard.writeText(xml);
                    success('Copiado al portapapeles', 'Payload SOAP XML copiado correctamente.');
                  }}
                >
                  <FileCode size={15} /> Copiar SOAP XML
                </button>
                <button className="btn btn-primary" onClick={() => setViewXmlInvoice(null)}>
                  Entendido
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
