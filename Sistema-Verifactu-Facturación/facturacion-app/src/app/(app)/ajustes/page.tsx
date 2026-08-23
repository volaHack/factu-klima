'use client';

import { useState, useEffect } from 'react';
import { Save, Building2, CreditCard, FileText, RotateCcw, Palette, ShieldCheck, Check, AlertTriangle, Loader2, Store, Crown, Zap, Plus, Trash2, Users, UserCheck, Tag, Upload, Image as ImageIcon, SlidersHorizontal, LayoutDashboard } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import CategoryIcon from '@/components/ui/CategoryIcon';
import { getCompanySettings, saveCompanySettings, resetAllData, getVendedores, saveVendedor, deleteVendedor, getAlmacenes } from '@/lib/storage';
import { CompanySettings, BusinessSector, AccentTheme, Vendedor, Tarifa, Almacen } from '@/lib/types';
import { PAYMENT_METHODS, PROVINCES, BUSINESS_SECTORS, ACCENT_THEMES, isTpvEnabled, TPV_MODES, defaultTpvModeForSector, DEFAULT_IVA_RATES, DEFAULT_IGIC_RATES } from '@/lib/constants';
import { processLogoFile } from '@/lib/utils';
import SelectorSector from '@/components/ajustes/SelectorSector';
import SelectorModulos from '@/components/ajustes/SelectorModulos';
import EditorPanel from '@/components/ajustes/EditorPanel';
import { useToast } from '@/hooks/useToast';

/* Editor de porcentajes de IVA/IGIC: la empresa elige sus propios tipos
   sin que el informático tenga que tocar el código. Se guarda en
   company_settings (ivaRates / igicRates). El commit limpia vacíos,
   duplicados y valores fuera de rango, y persiste en cuanto el campo se
   desenfoca o se añade/elimina un tipo. */
function TaxRateEditor({ label, rates, onChange, onCommit, onReset }: {
  label: string;
  rates: (number | null)[];
  onChange: (next: (number | null)[]) => void;
  onCommit: (next: number[]) => void;
  onReset: () => void;
}) {
  const commit = (draft: (number | null)[]) => {
    const cleaned = [...new Set(draft.filter((r): r is number => r !== null && r >= 0 && r <= 100))];
    onCommit(cleaned);
  };

  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div className="tax-rate-editor">
        {rates.map((r, i) => (
          <div className="tax-rate-editor-item" key={`${i}-${r === null ? 'nuevo' : r}`}>
            <input
              className="form-input"
              type="number"
              min={0}
              max={100}
              placeholder="%"
              value={r === null ? '' : r}
              onChange={e => {
                const val = e.target.value;
                const next = rates.map((x, j) => j === i ? (val === '' ? null : Math.min(100, Math.max(0, Number(val)))) : x);
                onChange(next);
              }}
              onBlur={() => commit(rates)}
              onKeyDown={e => { if (e.key === 'Enter') commit(rates); }}
            />
            <button
              type="button"
              className="btn btn-icon btn-ghost"
              aria-label={`Quitar el tipo ${r === null ? 'nuevo' : r + '%'}`}
              onClick={() => commit(rates.filter((_, j) => j !== i))}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <div className="tax-rate-editor-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange([...rates, null])}>
            <Plus size={14} /> Añadir tipo
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onReset}>
            <RotateCcw size={14} /> Restablecer
          </button>
        </div>
      </div>
      <span className="form-hint">Estos porcentajes aparecen al facturar, en el TPV y en los informes. Incluye el 0% si haces ventas exentas.</span>
    </div>
  );
}

export default function AjustesPage() {
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [stripeKeys, setStripeKeys] = useState<{
    hasSecretKey: boolean;
    hasWebhookSecret: boolean;
    publishableKey: string;
    webhookUrl: string;
  } | null>(null);
  const [stripeForm, setStripeForm] = useState({ secretKey: '', webhookSecret: '', publishableKey: '' });
  const [savingStripe, setSavingStripe] = useState(false);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [nuevoVendedorNombre, setNuevoVendedorNombre] = useState('');
  const [nuevoVendedorSerie, setNuevoVendedorSerie] = useState('');
  const [nuevaTarifaNombre, setNuevaTarifaNombre] = useState('');
  const [nuevaTarifaPorcentaje, setNuevaTarifaPorcentaje] = useState('');
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);
  const { success, warning, error: toastError } = useToast();

  // Borradores locales de los porcentajes de impuesto: se editan sin
  // guardar por tecla y se persisten al desenfocar o añadir/quitar tipo.
  const [ivaRatesDraft, setIvaRatesDraft] = useState<(number | null)[]>(DEFAULT_IVA_RATES.map(r => r));
  const [igicRatesDraft, setIgicRatesDraft] = useState<(number | null)[]>(DEFAULT_IGIC_RATES.map(r => r));

  const recargarVendedores = async () => {
    try {
      const list = await getVendedores();
      setVendedores(list);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    (async () => {
      const [data, vendList, almList] = await Promise.all([
        getCompanySettings(),
        getVendedores(),
        getAlmacenes(),
      ]);
      setSettings(data);
      setVendedores(vendList);
      setAlmacenes(almList);
      // Borradores iniciales de los porcentajes de impuesto
      setIvaRatesDraft((data.ivaRates?.length ? data.ivaRates : DEFAULT_IVA_RATES).map(r => r));
      setIgicRatesDraft((data.igicRates?.length ? data.igicRates : DEFAULT_IGIC_RATES).map(r => r));
      
      try {
        const res = await fetch('/api/stripe/tenant-keys');
        if (res.ok) {
          const keys = await res.json();
          setStripeKeys(keys);
          setStripeForm({ secretKey: '', webhookSecret: '', publishableKey: keys.publishableKey });
        }
      } catch (err) {
        console.error('No se pudieron cargar las claves de Stripe', err);
      }
      
      setMounted(true);
    })();
  }, []);

  // Dynamic live theme switch: sincroniza la clase del <body> con el estado
  // React en un efecto en vez de mutar el DOM directamente en el handler.
  useEffect(() => {
    if (settings?.accentTheme) {
      document.body.className = `theme-${settings.accentTheme}`;
    }
  }, [settings?.accentTheme]);

  const commitRates = (field: 'ivaRates' | 'igicRates', next: number[]) => {
    updateField(field, next);
  };

  const resetRates = (field: 'ivaRates' | 'igicRates') => {
    const next = field === 'ivaRates' ? [...DEFAULT_IVA_RATES] : [...DEFAULT_IGIC_RATES];
    if (field === 'ivaRates') setIvaRatesDraft(next); else setIgicRatesDraft(next);
    updateField(field, next);
  };

  const elegirLogo = async (archivo?: File) => {
    if (!archivo) return;
    try {
      updateField('logoUrl', await processLogoFile(archivo));
    } catch (err) {
      toastError(
        'No se pudo cargar el logotipo',
        err instanceof Error ? err.message : 'Prueba con un PNG o un JPG.',
      );
    }
  };

  const updateField = (field: keyof CompanySettings, value: unknown) => {
    if (!settings) return;
    const next = { ...settings, [field]: value };
    setSettings(next);
    saveCompanySettings(next).then(() => {
      window.dispatchEvent(new CustomEvent('klima-settings-updated', { detail: next }));
    });
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await saveCompanySettings(settings);
      // Igual que updateField: sin este aviso, el menú lateral y el resto
      // de la app se quedan con los ajustes de antes de guardar hasta que
      // alguien recargue la página a mano.
      window.dispatchEvent(new CustomEvent('klima-settings-updated', { detail: settings }));
      success('Configuración guardada', 'Los cambios y personalización se han aplicado correctamente');
    } catch (err) {
      toastError('No se pudo guardar', err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveStripe = async () => {
    setSavingStripe(true);
    try {
      const res = await fetch('/api/stripe/tenant-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stripeForm),
      });
      if (!res.ok) throw new Error('Error al guardar credenciales de Stripe');
      
      success('Stripe actualizado', 'Las credenciales de cobro se han guardado con seguridad');
      
      // Actualizar vista
      const keysRes = await fetch('/api/stripe/tenant-keys');
      if (keysRes.ok) {
        const keys = await keysRes.json();
        setStripeKeys(keys);
        setStripeForm({ secretKey: '', webhookSecret: '', publishableKey: keys.publishableKey });
      }
    } catch (err) {
      toastError('No se pudo actualizar Stripe', err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSavingStripe(false);
    }
  };

  const handleReset = async () => {
    const ok = confirm(
      '¿Borrar clientes, productos y borradores?\n\n' +
      'Las facturas ya emitidas NO se borran: son registros fiscales protegidos.'
    );
    if (!ok) return;

    try {
      const { keptInvoices } = await resetAllData();
      warning(
        'Datos de trabajo reiniciados',
        keptInvoices > 0
          ? `Se conservan ${keptInvoices} facturas emitidas por obligación legal. Recargando...`
          : 'Recargando sistema...'
      );
      setTimeout(() => window.location.reload(), 1600);
    } catch (err) {
      toastError('No se pudo reiniciar', err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  if (!mounted || !settings) return <PageSkeleton variant="form" label="Cargando los ajustes" />;

  return (
    <div className="animate-fade-in" style={{ maxWidth: 880 }}>
      <div className="page-header">
        <div className="page-header-left">
          <p className="page-eyebrow"><Building2 /> Configuración</p>
          <h1 className="page-title">Ajustes</h1>
          <p className="page-subtitle">
            Quién eres en las facturas, cómo se numeran y por dónde cobras.
          </p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />} {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>

      {/* Business Sector & Theme Customizer */}
      <div className="settings-section">
        <div className="section-title" style={{ marginBottom: 'var(--space-1)' }}>
          <Palette size={18} />
          <h2 className="settings-section-title">Identidad y apariencia</h2>
        </div>
        <p className="settings-section-subtitle">Adapta el sistema a tu tipo de negocio y elige la paleta de colores</p>

        {/* Sector Selector */}
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <label className="form-label" style={{ marginBottom: 'var(--space-3)', display: 'block' }}>Sector de actividad</label>
          <SelectorSector
            valor={settings.sector}
            onElegir={sector => updateField('sector', sector)}
          />
        </div>

        {/* Color Theme Selector */}
        <div>
          <label className="form-label" style={{ marginBottom: 'var(--space-3)', display: 'block' }}>Color de acento</label>
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            {ACCENT_THEMES.map(th => (
              <button
                key={th.value}
                onClick={() => updateField('accentTheme', th.value)}
                className="btn btn-secondary"
                style={{
                  borderColor: settings.accentTheme === th.value ? th.primaryHex : 'var(--border-color)',
                  background: settings.accentTheme === th.value ? 'var(--bg-card-hover)' : 'var(--bg-tertiary)',
                }}
              >
                <span style={{ width: 14, height: 14, borderRadius: '50%', background: th.primaryHex, display: 'inline-block' }} />
                {th.label}
                {settings.accentTheme === th.value && <Check size={14} style={{ color: th.primaryHex }} />}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Company Data */}
      <div className="settings-section">
        <div className="section-title" style={{ marginBottom: 'var(--space-1)' }}>
          <Building2 size={18} />
          <h2 className="settings-section-title">Datos de la empresa</h2>
        </div>
        <p className="settings-section-subtitle">Información fiscal que aparecerá en tus facturas e impresos</p>

        {/* El logotipo. Va aquí, con la razón social y el NIF, porque es parte
            de lo mismo: quién eres en el papel que le llega al cliente. */}
        <div className="ajustes-logo">
          <div className="ajustes-logo-muestra">
            {settings.logoUrl
              ? <img src={settings.logoUrl} alt="Logotipo de la empresa" />
              : <span className="ajustes-logo-vacio"><ImageIcon size={22} /></span>}
          </div>
          <div className="ajustes-logo-acciones">
            <label className="form-label">Logotipo</label>
            <p className="settings-section-subtitle" style={{ margin: '0 0 var(--space-2)' }}>
              Sale en las facturas que se generan con diseño automático. Un PNG con el fondo
              transparente queda mejor sobre membretes de color.
            </p>
            <div className="ajustes-logo-botones">
              <label className="btn btn-secondary btn-sm">
                <Upload size={14} /> {settings.logoUrl ? 'Cambiar' : 'Subir logotipo'}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={e => { void elegirLogo(e.target.files?.[0]); e.target.value = ''; }}
                />
              </label>
              {settings.logoUrl && (
                <button className="btn btn-ghost btn-sm" onClick={() => updateField('logoUrl', '')}>
                  <Trash2 size={14} /> Quitar
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="form-row" style={{ marginTop: 'var(--space-5)' }}>
          <div className="form-group">
            <label className="form-label required">Razón social</label>
            <input className="form-input" value={settings.businessName} onChange={e => updateField('businessName', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Nombre comercial</label>
            <input className="form-input" value={settings.tradeName} onChange={e => updateField('tradeName', e.target.value)} />
          </div>
        </div>
        <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
          <div className="form-group">
            <label className="form-label required">NIF / CIF</label>
            <input className="form-input" value={settings.nif} onChange={e => updateField('nif', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Email de facturación</label>
            <input className="form-input" type="email" value={settings.email} onChange={e => updateField('email', e.target.value)} />
          </div>
        </div>
        <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
          <div className="form-group">
            <label className="form-label">Teléfono</label>
            <input className="form-input" value={settings.phone} onChange={e => updateField('phone', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Sitio web</label>
            <input className="form-input" value={settings.website} onChange={e => updateField('website', e.target.value)} />
          </div>
        </div>
        <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
          <label className="form-label">Dirección fiscal</label>
          <input className="form-input" value={settings.address} onChange={e => updateField('address', e.target.value)} />
        </div>
        <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
          <div className="form-group">
            <label className="form-label">Código postal</label>
            <input className="form-input" value={settings.postalCode} onChange={e => updateField('postalCode', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Ciudad</label>
            <input className="form-input" value={settings.city} onChange={e => updateField('city', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Provincia</label>
            <select className="form-select" value={settings.province} onChange={e => updateField('province', e.target.value)}>
              <option value="">Seleccionar...</option>
              {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Subscription & Membership Tier Section */}
      <div className="settings-section">
        <div className="section-title" style={{ marginBottom: 'var(--space-1)' }}>
          <Crown size={18} style={{ color: 'var(--accent-500)' }} />
          <h2 className="settings-section-title">Plan de Suscripción y Membresía</h2>
        </div>
        <p className="settings-section-subtitle">Nivel de plan activo, límites de facturación y estado de cuenta</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
          {[
            { id: 'basico', name: 'Básico', price: 49, limit: '15 facturas/mes' },
            { id: 'pro', name: 'Pro (Recomendado)', price: 79, limit: '100 facturas/mes' },
            { id: 'sin_limite', name: 'Sin Límite', price: 119, limit: 'Ilimitado' },
          ].map(p => {
            const isSelected = (settings.planId || 'pro') === p.id;
            return (
              <button
                key={p.id}
                type="button"
                className={`choice-card ${isSelected ? 'active' : ''}`}
                onClick={() => {
                  updateField('planId', p.id);
                  updateField('subscriptionStatus', 'active');
                }}
                style={{
                  padding: 'var(--space-4)',
                  textAlign: 'left',
                  borderRadius: 'var(--radius-lg)',
                  border: isSelected ? '2px solid var(--accent-500)' : '1px solid var(--border-color)',
                  background: isSelected ? 'var(--accent-50)' : 'var(--bg-tertiary)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: isSelected ? 'var(--accent-500)' : 'var(--text-primary)' }}>
                    {p.name}
                  </span>
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 800 }}>{p.price} €/m</span>
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                  {p.limit}
                </div>
              </button>
            );
          })}
        </div>

        <div className="status-panel" style={{ marginTop: 'var(--space-4)', alignItems: 'center' }}>
          <span className="status-panel-icon" style={{ background: 'var(--accent-50)', color: 'var(--accent-500)' }}>
            <Zap size={19} />
          </span>
          <div className="status-panel-body">
            <div className="status-panel-title">Estado de la suscripción</div>
            <p className="status-panel-text">
              Si desactivas la suscripción, se bloqueará la emisión de facturas y cobros en TPV hasta reactivar tu plan.
            </p>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={(settings.subscriptionStatus || 'active') === 'active'}
              onChange={e => updateField('subscriptionStatus', e.target.checked ? 'active' : 'inactive')}
            />
            <span className="toggle-slider" />
          </label>
        </div>
      </div>

      {/* Invoice & Verifactu Settings */}
      <div className="settings-section">
        <div className="section-title" style={{ marginBottom: 'var(--space-1)' }}>
          <FileText size={18} />
          <h2 className="settings-section-title">Facturación y sellado fiscal</h2>
        </div>
        <p className="settings-section-subtitle">Numeración, vencimientos y cumplimiento normativo</p>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Serie de facturación</label>
            <input className="form-input" value={settings.invoiceSeries} onChange={e => updateField('invoiceSeries', e.target.value)} placeholder="FAC" />
          </div>
          <div className="form-group">
            <label className="form-label">Próximo número correlativo</label>
            <input className="form-input" type="number" min={1} value={settings.nextInvoiceNumber} onChange={e => updateField('nextInvoiceNumber', parseInt(e.target.value) || 1)} />
          </div>
        </div>

        <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
          <div className="form-group">
            <label className="form-label">Días de vencimiento predeterminados</label>
            <input className="form-input" type="number" min={0} value={settings.defaultPaymentDays} onChange={e => updateField('defaultPaymentDays', parseInt(e.target.value) || 0)} />
          </div>
          <div className="form-group">
            <label className="form-label">Forma de pago por defecto</label>
            <select className="form-select" value={settings.defaultPaymentMethod} onChange={e => updateField('defaultPaymentMethod', e.target.value)}>
              {PAYMENT_METHODS.map(pm => <option key={pm.value} value={pm.value}>{pm.label}</option>)}
            </select>
          </div>
        </div>

        {/* Verifactu Switch */}
        <div className="status-panel" style={{ marginTop: 'var(--space-4)', background: 'var(--verifactu-bg)', borderColor: 'rgba(251, 191, 36, 0.3)', alignItems: 'center' }}>
          <span className="status-panel-icon" style={{ background: 'rgba(251, 191, 36, 0.16)', color: 'var(--verifactu-gold)' }}>
            <ShieldCheck size={19} />
          </span>
          <div className="status-panel-body">
            <div className="status-panel-title">Sellado Verifactu</div>
            <p className="status-panel-text">Cada factura emitida guarda una huella SHA-256 que incluye la de la anterior. Si alguien altera un importe, la cadena deja de cuadrar y se nota.</p>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={settings.verifactuEnabled}
              onChange={e => updateField('verifactuEnabled', e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
        </div>

        {/* IGIC / Canarias Switch */}
        <div className="status-panel" style={{ marginTop: 'var(--space-4)', background: 'rgba(59, 130, 246, 0.06)', borderColor: 'rgba(59, 130, 246, 0.25)', alignItems: 'center' }}>
          <span className="status-panel-icon" style={{ background: 'rgba(59, 130, 246, 0.16)', color: '#3b82f6' }}>
            <Building2 size={19} />
          </span>
          <div className="status-panel-body">
            <div className="status-panel-title">Régimen Fiscal IGIC (Islas Canarias)</div>
            <p className="status-panel-text">Activa esta casilla para facturar con el régimen canario. Los porcentajes (por defecto IGIC 7%, 3%, 13% y 0% exento) los eliges tú justo debajo.</p>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={!!settings.igicEnabled}
              onChange={e => updateField('igicEnabled', e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
        </div>

        {/* Porcentajes de IVA / IGIC configurables */}
        <div style={{ marginTop: 'var(--space-5)' }}>
          <div className="section-title" style={{ marginBottom: 'var(--space-1)' }}>
            <FileText size={16} />
            <h3 className="settings-section-title">Porcentajes de impuesto</h3>
          </div>
          <p className="settings-section-subtitle">
            Elige los tipos de IVA e IGIC que podrás aplicar al facturar. Los del régimen
            activo aparecen en facturas, TPV, albaranes e informes; los del otro régimen
            quedan listos para cuando cambies el interruptor de Canarias.
          </p>
          <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
            <TaxRateEditor
              label="Tipos de IVA (%)"
              rates={ivaRatesDraft}
              onChange={setIvaRatesDraft}
              onCommit={next => commitRates('ivaRates', next)}
              onReset={() => resetRates('ivaRates')}
            />
            <TaxRateEditor
              label="Tipos de IGIC (%) — Canarias"
              rates={igicRatesDraft}
              onChange={setIgicRatesDraft}
              onCommit={next => commitRates('igicRates', next)}
              onReset={() => resetRates('igicRates')}
            />
          </div>
        </div>

        <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
          <label className="form-label">Texto legal de pie de factura</label>
          <textarea className="form-textarea" value={settings.invoiceFooterText} onChange={e => updateField('invoiceFooterText', e.target.value)} rows={2} />
        </div>
      </div>

      {/* TPV / Terminal Punto de Venta */}
      <div className="settings-section">
        <div className="section-title" style={{ marginBottom: 'var(--space-1)' }}>
          <Store size={18} />
          <h2 className="settings-section-title">Terminal Punto de Venta (TPV / Caja)</h2>
        </div>
        <p className="settings-section-subtitle">Venta rápida en mostrador para supermercados, comercios, panaderías y hostelería</p>

        <div className="status-panel" style={{ marginTop: 'var(--space-4)', background: 'rgba(16, 185, 129, 0.06)', borderColor: 'rgba(16, 185, 129, 0.25)', alignItems: 'center' }}>
          <span className="status-panel-icon" style={{ background: 'rgba(16, 185, 129, 0.16)', color: 'var(--accent-500)' }}>
            <Store size={19} />
          </span>
          <div className="status-panel-body">
            <div className="status-panel-title">Módulo TPV y Control de Caja</div>
            <p className="status-panel-text">Al activarlo, aparecerá la pestaña "TPV (Caja)" en el menú lateral con pantalla táctil, tickets simplificados, cobro en efectivo/tarjeta y arqueos de caja.</p>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={isTpvEnabled(settings)}
              onChange={e => updateField('tpvEnabled', e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
        </div>

        {isTpvEnabled(settings) && (
          <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
            <div className="form-group">
              <label className="form-label">Modo de TPV</label>
              <select
                className="form-input"
                value={settings.tpvMode ?? defaultTpvModeForSector(settings.sector)}
                onChange={e => updateField('tpvMode', e.target.value)}
              >
                {TPV_MODES.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <p className="form-hint">
                {TPV_MODES.find(m => m.value === (settings.tpvMode ?? defaultTpvModeForSector(settings.sector)))?.description}
                {' '}
                · Por defecto según sector: {TPV_MODES.find(m => m.value === defaultTpvModeForSector(settings.sector))?.label}
              </p>
            </div>
            <div className="form-group">
              <label className="form-label">Serie de tickets TPV</label>
              <input className="form-input" value={settings.tpvSeries || 'TPV'} onChange={e => updateField('tpvSeries', e.target.value)} placeholder="TPV" />
            </div>
            <div className="form-group">
              <label className="form-label">Próximo número de ticket</label>
              <input className="form-input" type="number" min={1} value={settings.nextTpvNumber || 1} onChange={e => updateField('nextTpvNumber', parseInt(e.target.value) || 1)} />
            </div>
          </div>
        )}
      </div>

      {/* Banking */}
      <div className="settings-section">
        <div className="section-title" style={{ marginBottom: 'var(--space-1)' }}>
          <CreditCard size={18} />
          <h2 className="settings-section-title">Datos bancarios</h2>
        </div>
        <p className="settings-section-subtitle">Para transferencias e instrucciones de pago en la factura</p>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">IBAN</label>
            <input className="form-input" value={settings.iban} onChange={e => updateField('iban', e.target.value)} placeholder="ES00 0000 0000 0000 0000 0000" />
          </div>
          <div className="form-group">
            <label className="form-label">Entidad bancaria</label>
            <input className="form-input" value={settings.bankName} onChange={e => updateField('bankName', e.target.value)} />
          </div>
        </div>
      </div>

      {/* Stripe Online Payments */}
      <div className="settings-section">
        <div className="section-title" style={{ marginBottom: 'var(--space-1)' }}>
          <CreditCard size={18} />
          <h2 className="settings-section-title">Cobros con Stripe</h2>
        </div>
        <p className="settings-section-subtitle">Genera un enlace de pago para que el cliente abone la factura con tarjeta</p>

        <div className="status-panel status-panel--info" style={{ alignItems: 'center', marginBottom: 'var(--space-4)' }}>
          <span className="status-panel-icon"><CreditCard size={19} /></span>
          <div className="status-panel-body">
            <div className="status-panel-title" style={{ color: 'var(--text-primary)' }}>Aceptar pagos con tarjeta</div>
            <p className="status-panel-text">Añade un botón de cobro en la ficha de cada factura y la marca como pagada en cuanto Stripe confirma el cargo.</p>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={settings.stripeEnabled ?? false}
              onChange={e => updateField('stripeEnabled', e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
        </div>

        <div className="form-group">
          <label className="form-label">Stripe Publishable Key</label>
          <input
            className="form-input"
            type="text"
            placeholder={stripeKeys?.hasSecretKey && !stripeForm.publishableKey ? '••••••••••••••••••••••••' : 'pk_live_...'}
            value={stripeForm.publishableKey}
            onChange={e => setStripeForm({ ...stripeForm, publishableKey: e.target.value })}
          />
        </div>

        <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
          <label className="form-label">Stripe Secret Key</label>
          <input
            className="form-input"
            type="password"
            placeholder={stripeKeys?.hasSecretKey ? '•••••••••••••••••••••••• (Guardada)' : 'sk_live_...'}
            value={stripeForm.secretKey}
            onChange={e => setStripeForm({ ...stripeForm, secretKey: e.target.value })}
          />
          <span className="form-hint">Se cifra de forma segura en la base de datos (AES-256).</span>
        </div>

        {stripeKeys?.webhookUrl && (
          <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
            <label className="form-label">URL del Webhook (Copia esto en Stripe)</label>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <input
                className="form-input"
                type="text"
                readOnly
                value={stripeKeys.webhookUrl}
                style={{ background: 'var(--bg-tertiary)', cursor: 'copy' }}
                onClick={(e) => {
                  (e.target as HTMLInputElement).select();
                  navigator.clipboard.writeText(stripeKeys.webhookUrl);
                  success('Copiado', 'URL de webhook copiada al portapapeles');
                }}
              />
            </div>
            <span className="form-hint">En el panel de Stripe: Developers &gt; Webhooks &gt; Add endpoint. Pega esta URL y selecciona el evento <code>checkout.session.completed</code>.</span>
          </div>
        )}

        <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
          <label className="form-label">Stripe Webhook Secret</label>
          <input
            className="form-input"
            type="password"
            placeholder={stripeKeys?.hasWebhookSecret ? '•••••••••••••••••••••••• (Guardado)' : 'whsec_...'}
            value={stripeForm.webhookSecret}
            onChange={e => setStripeForm({ ...stripeForm, webhookSecret: e.target.value })}
          />
          <span className="form-hint">Lo obtienes después de añadir el Webhook en Stripe. Necesario para confirmar los pagos automáticamente.</span>
        </div>

        <div style={{ marginTop: 'var(--space-4)' }}>
          <button className="btn btn-secondary" onClick={handleSaveStripe} disabled={savingStripe}>
            {savingStripe ? <Loader2 size={16} className="spin" /> : <Save size={16} />} {savingStripe ? 'Guardando...' : 'Guardar claves Stripe'}
          </button>
        </div>
      </div>

      {/* Módulos y panel de inicio */}
      <div className="card settings-section">
        <div className="settings-section-header">
          <SlidersHorizontal size={18} />
          <h2 className="settings-section-title">Qué usa tu empresa</h2>
        </div>
        <p className="settings-section-subtitle">
          Enciende sólo lo que necesitas. Lo apagado desaparece de los menús, y siempre
          se puede volver a encender.
        </p>
        <SelectorModulos
          activos={settings.modulos}
          sector={settings.sector}
          onCambiar={modulos => updateField('modulos', modulos)}
        />
      </div>

      <div className="card settings-section">
        <div className="settings-section-header">
          <LayoutDashboard size={18} />
          <h2 className="settings-section-title">Tu panel de inicio</h2>
        </div>
        <p className="settings-section-subtitle">
          Lo primero que ves al entrar. Elige las fichas y ponlas en el orden que quieras.
        </p>
        <EditorPanel
          panel={settings.panel}
          modulos={settings.modulos}
          sector={settings.sector}
          onCambiar={panel => updateField('panel', panel)}
        />
      </div>

      {/* Vendedores y Series Comerciales */}
      <div className="settings-section">
        <div className="section-title" style={{ marginBottom: 'var(--space-1)' }}>
          <UserCheck size={18} />
          <h2 className="settings-section-title">Vendedores y Series Comerciales</h2>
        </div>
        <p className="settings-section-subtitle">Define vendedores comerciales con series de facturación propias</p>

        <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)', flexWrap: 'wrap' }}>
          <input
            className="form-input"
            style={{ flex: '1 1 200px' }}
            placeholder="Nombre del vendedor (ej: Juan Pérez)"
            value={nuevoVendedorNombre}
            onChange={e => setNuevoVendedorNombre(e.target.value)}
          />
          <input
            className="form-input"
            style={{ width: '140px' }}
            placeholder="Serie (ej: V1)"
            value={nuevoVendedorSerie}
            onChange={e => setNuevoVendedorSerie(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              if (!nuevoVendedorNombre.trim()) return;
              try {
                const nuevo: Vendedor = {
                  id: crypto.randomUUID(),
                  nombre: nuevoVendedorNombre.trim(),
                  activo: true,
                  series: nuevoVendedorSerie.trim() ? {
                    factura_venta: nuevoVendedorSerie.trim().toUpperCase(),
                    presupuesto_venta: `PRE_${nuevoVendedorSerie.trim().toUpperCase()}`,
                    pedido_venta: `PED_${nuevoVendedorSerie.trim().toUpperCase()}`,
                    albaran_venta: `ALB_${nuevoVendedorSerie.trim().toUpperCase()}`,
                  } : {},
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                };
                await saveVendedor(nuevo);
                setNuevoVendedorNombre('');
                setNuevoVendedorSerie('');
                await recargarVendedores();
                success('Vendedor creado', nuevo.nombre);
              } catch (e) {
                toastError('Error al crear vendedor', e instanceof Error ? e.message : 'Error desconocido');
              }
            }}
          >
            <Plus size={16} /> Añadir vendedor
          </button>
        </div>

        {vendedores.length > 0 && (
          <div className="table-responsive" style={{ marginTop: 'var(--space-4)' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Vendedor</th>
                  <th>Serie Factura</th>
                  <th>Serie Albarán</th>
                  <th>Almacén</th>
                  <th>Comisión</th>
                  <th>Estado</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {vendedores.map(v => (
                  <tr key={v.id}>
                    <td style={{ fontWeight: 600 }}>{v.nombre}</td>
                    <td><span className="badge badge-outline">{v.series?.factura_venta || 'Por defecto'}</span></td>
                    {/* Faltaba esta celda: la cabecera ya traía «Serie
                        Albarán» pero el cuerpo saltaba directo al almacén, así
                        que cada columna de cada fila caía bajo la cabecera de
                        al lado —el almacén bajo «Serie Albarán», el estado bajo
                        «Almacén»— para todos los vendedores. */}
                    <td><span className="badge badge-outline">{v.series?.albaran_venta || 'Por defecto'}</span></td>
                    {/* De qué almacén saca género. El comercial de ruta suele
                        tener el suyo, que es la furgoneta; el de oficina tira
                        del de la empresa. Se aplica solo al hacer un documento
                        para un cliente que tenga a este vendedor asignado. */}
                    <td>
                      <select
                        className="form-select form-select-sm"
                        value={v.almacenId || ''}
                        aria-label={`Almacén de ${v.nombre}`}
                        onChange={async e => {
                          try {
                            await saveVendedor({ ...v, almacenId: e.target.value || undefined });
                            await recargarVendedores();
                          } catch (err) {
                            toastError('No se pudo cambiar el almacén', err instanceof Error ? err.message : 'Error');
                          }
                        }}
                      >
                        <option value="">El de la empresa</option>
                        {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                      </select>
                    </td>
                    {/* Lo que se lleva sobre lo que venda. Vacío = sin
                        comisión, y ese vendedor no aparece en el informe: un
                        0% explícito y un campo vacío significan lo mismo, así
                        que no hace falta distinguirlos aquí. */}
                    <td>
                      <input
                        type="number" min={0} max={100} step={0.5}
                        className="form-input form-select-sm"
                        style={{ width: 80 }}
                        placeholder="—"
                        value={v.comisionPct ?? ''}
                        aria-label={`Comisión de ${v.nombre}`}
                        onChange={async e => {
                          const val = e.target.value === '' ? undefined : parseFloat(e.target.value);
                          try {
                            await saveVendedor({ ...v, comisionPct: val });
                            await recargarVendedores();
                          } catch (err) {
                            toastError('No se pudo cambiar la comisión', err instanceof Error ? err.message : 'Error');
                          }
                        }}
                      />
                    </td>
                    <td>
                      <span className={`badge ${v.activo ? 'badge-activo' : 'badge-inactivo'}`}>
                        {v.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        style={{ color: 'var(--color-danger)' }}
                        onClick={async () => {
                          if (confirm(`¿Eliminar vendedor ${v.nombre}?`)) {
                            try {
                              await deleteVendedor(v.id);
                              await recargarVendedores();
                              success('Vendedor eliminado');
                            } catch (e) {
                              toastError('Error al eliminar', e instanceof Error ? e.message : 'Error');
                            }
                          }
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Tarifas de Precios */}
      <div className="settings-section">
        <div className="section-title" style={{ marginBottom: 'var(--space-1)' }}>
          <Tag size={18} />
          <h2 className="settings-section-title">Tarifas de Precios</h2>
        </div>
        <p className="settings-section-subtitle">Define tarifas para clientes (Mayorista, Distribuidor, Especial...) con precios o márgenes dedicados</p>

        <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)', flexWrap: 'wrap' }}>
          <input
            className="form-input"
            style={{ flex: '1 1 200px' }}
            placeholder="Nombre de la tarifa (ej: Mayorista)"
            value={nuevaTarifaNombre}
            onChange={e => setNuevaTarifaNombre(e.target.value)}
          />
          <input
            className="form-input"
            type="number"
            style={{ width: '170px' }}
            placeholder="Margen / Dto % (opcional)"
            value={nuevaTarifaPorcentaje}
            onChange={e => setNuevaTarifaPorcentaje(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              if (!nuevaTarifaNombre.trim() || !settings) return;
              try {
                const nueva: Tarifa = {
                  id: crypto.randomUUID(),
                  nombre: nuevaTarifaNombre.trim(),
                  activa: true,
                  porcentajeDefecto: nuevaTarifaPorcentaje ? parseFloat(nuevaTarifaPorcentaje) : undefined,
                };
                const updatedTarifas = [...(settings.tarifas || []), nueva];
                await saveCompanySettings({ ...settings, tarifas: updatedTarifas });
                setSettings(prev => prev ? ({ ...prev, tarifas: updatedTarifas }) : null);
                setNuevaTarifaNombre('');
                setNuevaTarifaPorcentaje('');
                success('Tarifa creada', nueva.nombre);
              } catch (e) {
                toastError('Error al crear tarifa', e instanceof Error ? e.message : 'Error');
              }
            }}
          >
            <Plus size={16} /> Añadir tarifa
          </button>
        </div>

        {settings?.tarifas && settings.tarifas.length > 0 && (
          <div className="table-responsive" style={{ marginTop: 'var(--space-4)' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Nombre de tarifa</th>
                  <th>Margen / Dto. por defecto</th>
                  <th>Estado</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {settings.tarifas.map(t => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 600 }}>{t.nombre}</td>
                    <td>
                      {t.porcentajeDefecto !== undefined ? (
                        <span className="badge badge-outline">
                          {t.porcentajeDefecto > 0 ? `+${t.porcentajeDefecto}%` : `${t.porcentajeDefecto}%`}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-text-muted)' }}>Precio manual por producto</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${t.activa ? 'badge-activo' : 'badge-inactivo'}`}>
                        {t.activa ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        style={{ color: 'var(--color-danger)' }}
                        onClick={async () => {
                          if (confirm(`¿Eliminar la tarifa "${t.nombre}"?`)) {
                            try {
                              const updatedTarifas = (settings.tarifas || []).filter(item => item.id !== t.id);
                              await saveCompanySettings({ ...settings, tarifas: updatedTarifas });
                              setSettings(prev => prev ? ({ ...prev, tarifas: updatedTarifas }) : null);
                              success('Tarifa eliminada');
                            } catch (e) {
                              toastError('Error al eliminar', e instanceof Error ? e.message : 'Error');
                            }
                          }
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reset */}
      <div className="settings-section" style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}>
        <h2 className="settings-section-title" style={{ color: 'var(--color-danger)' }}>Zona de mantenimiento</h2>
        <p className="settings-section-subtitle">Elimina clientes, productos y borradores. Las facturas emitidas se conservan.</p>
        <button className="btn btn-danger" onClick={handleReset}>
          <RotateCcw size={16} /> Borrar datos de trabajo
        </button>
      </div>
    </div>
  );
}
