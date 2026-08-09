'use client';

import { useState } from 'react';
import {
  Sparkles, ArrowRight, ArrowLeft, Building2, Palette, FileText,
  Rocket, Check, Upload, User
} from 'lucide-react';
import CategoryIcon from '@/components/ui/CategoryIcon';
import { CompanySettings, BusinessSector, AccentTheme } from '@/lib/types';
import { saveCompanySettings, saveUserProfile } from '@/lib/storage';
import { BUSINESS_SECTORS, ACCENT_THEMES, PAYMENT_METHODS } from '@/lib/constants';

interface OnboardingModalProps {
  settings: CompanySettings;
  onComplete: () => void;
}

const STEPS = [
  { title: 'Bienvenida', icon: Sparkles },
  { title: 'Tu Empresa', icon: Building2 },
  { title: 'Personalización', icon: Palette },
  { title: 'Facturación', icon: FileText },
  { title: '¡Listo!', icon: Rocket },
];

export default function OnboardingModal({ settings: initialSettings, onComplete }: OnboardingModalProps) {
  const [step, setStep] = useState(0);
  const [settings, setSettings] = useState<CompanySettings>({ ...initialSettings });
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);

  const updateField = (field: keyof CompanySettings, value: unknown) => {
    setSettings(prev => ({ ...prev, [field]: value }));
    if (field === 'accentTheme') {
      document.body.className = `theme-${value}`;
    }
  };

  const handleFinish = async () => {
    setSaving(true);
    await saveCompanySettings(settings);
    await saveUserProfile({
      displayName: displayName || settings.tradeName || settings.businessName,
      onboardingCompleted: true,
    });
    setSaving(false);
    onComplete();
  };

  const canAdvance = () => {
    if (step === 1) return settings.businessName.trim() && settings.nif.trim();
    if (step === 3) return settings.invoiceSeries.trim();
    return true;
  };

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-modal">
        {/* Progress */}
        <div className="onboarding-progress">
          {STEPS.map((s, i) => (
            <div
              key={i}
              className={`onboarding-step-dot ${i <= step ? 'active' : ''} ${i === step ? 'current' : ''}`}
            >
              {i < step ? <Check size={12} /> : <s.icon size={12} />}
            </div>
          ))}
          <div className="onboarding-progress-bar">
            <div
              className="onboarding-progress-fill"
              style={{ width: `${(step / (STEPS.length - 1)) * 100}%` }}
            />
          </div>
        </div>

        {/* Step Content */}
        <div className="onboarding-content">
          {/* Step 0: Welcome */}
          {step === 0 && (
            <div className="onboarding-step onboarding-welcome">
              <div className="onboarding-welcome-icon">
                <Sparkles size={40} />
              </div>
              <h2>¡Bienvenido a tu Sistema de facturación!</h2>
              <p>
                Configura tu empresa en menos de 2 minutos. Podrás cambiar todo esto
                después en Ajustes.
              </p>
              <div className="onboarding-welcome-features">
                <div className="onboarding-feature">
                  <Building2 size={20} />
                  <span>Datos de tu empresa</span>
                </div>
                <div className="onboarding-feature">
                  <Palette size={20} />
                  <span>Personaliza tu marca</span>
                </div>
                <div className="onboarding-feature">
                  <FileText size={20} />
                  <span>Configura facturación</span>
                </div>
              </div>
            </div>
          )}

          {/* Step 1: Company Data */}
          {step === 1 && (
            <div className="onboarding-step">
              <h2>Datos de tu Empresa</h2>
              <p className="onboarding-subtitle">Esta información aparecerá en tus facturas</p>

              <div className="onboarding-form">
                <div className="form-group">
                  <label className="form-label required">Razón social</label>
                  <input
                    className="form-input"
                    type="text"
                    placeholder="Distribuciones Ejemplo S.L."
                    value={settings.businessName}
                    onChange={e => updateField('businessName', e.target.value)}
                  />
                </div>
                <div className="onboarding-form-row">
                  <div className="form-group">
                    <label className="form-label required">NIF / CIF</label>
                    <input
                      className="form-input"
                      type="text"
                      placeholder="B12345678"
                      value={settings.nif}
                      onChange={e => updateField('nif', e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Nombre comercial</label>
                    <input
                      className="form-input"
                      type="text"
                      placeholder="MiMarca"
                      value={settings.tradeName}
                      onChange={e => updateField('tradeName', e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Sector de negocio</label>
                  <div className="onboarding-sector-grid">
                    {BUSINESS_SECTORS.map(s => (
                      <button
                        key={s.value}
                        type="button"
                        className={`onboarding-sector-card ${settings.sector === s.value ? 'active' : ''}`}
                        onClick={() => updateField('sector', s.value)}
                      >
                        <span className="onboarding-sector-icon"><CategoryIcon name={s.icon} size={22} /></span>
                        <span className="onboarding-sector-label">{s.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Tu nombre</label>
                  <div style={{ position: 'relative' }}>
                    <User size={16} style={{
                      position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                      color: 'var(--text-muted)',
                    }} />
                    <input
                      className="form-input"
                      type="text"
                      placeholder="Tu nombre o el del administrador"
                      value={displayName}
                      onChange={e => setDisplayName(e.target.value)}
                      style={{ paddingLeft: 38 }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Personalization */}
          {step === 2 && (
            <div className="onboarding-step">
              <h2>Personaliza tu Marca</h2>
              <p className="onboarding-subtitle">Elige los colores de tu panel y añade tu logotipo</p>

              <div className="onboarding-form">
                <div className="form-group">
                  <label className="form-label">Color del tema</label>
                  <div className="onboarding-theme-grid">
                    {ACCENT_THEMES.map(t => (
                      <button
                        key={t.value}
                        type="button"
                        className={`onboarding-theme-card ${settings.accentTheme === t.value ? 'active' : ''}`}
                        onClick={() => updateField('accentTheme', t.value)}
                      >
                        <div
                          className="onboarding-theme-swatch"
                          style={{ background: t.primaryHex, boxShadow: `0 4px 16px ${t.glow}` }}
                        />
                        <span>{t.label}</span>
                        {settings.accentTheme === t.value && (
                          <Check size={14} className="onboarding-theme-check" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="onboarding-form-row">
                  <div className="form-group">
                    <label className="form-label">Email de contacto</label>
                    <input
                      className="form-input"
                      type="email"
                      placeholder="facturacion@tuempresa.es"
                      value={settings.email}
                      onChange={e => updateField('email', e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Teléfono</label>
                    <input
                      className="form-input"
                      type="tel"
                      placeholder="+34 600 000 000"
                      value={settings.phone}
                      onChange={e => updateField('phone', e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Dirección</label>
                  <input
                    className="form-input"
                    type="text"
                    placeholder="Calle, número, nave..."
                    value={settings.address}
                    onChange={e => updateField('address', e.target.value)}
                  />
                </div>
                <div className="onboarding-form-row">
                  <div className="form-group">
                    <label className="form-label">Ciudad</label>
                    <input
                      className="form-input"
                      type="text"
                      placeholder="Madrid"
                      value={settings.city}
                      onChange={e => updateField('city', e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">C.P.</label>
                    <input
                      className="form-input"
                      type="text"
                      placeholder="28001"
                      value={settings.postalCode}
                      onChange={e => updateField('postalCode', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Invoicing */}
          {step === 3 && (
            <div className="onboarding-step">
              <h2>Configuración de facturación</h2>
              <p className="onboarding-subtitle">Define cómo se generarán tus facturas</p>

              <div className="onboarding-form">
                <div className="onboarding-form-row">
                  <div className="form-group">
                    <label className="form-label required">Serie de facturación</label>
                    <input
                      className="form-input"
                      type="text"
                      placeholder="FAC"
                      value={settings.invoiceSeries}
                      onChange={e => updateField('invoiceSeries', e.target.value.toUpperCase())}
                    />
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Ejemplo: {settings.invoiceSeries}-2026-0001
                    </span>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Días de pago</label>
                    <input
                      className="form-input"
                      type="number"
                      value={settings.defaultPaymentDays}
                      onChange={e => updateField('defaultPaymentDays', parseInt(e.target.value) || 30)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Forma de pago por defecto</label>
                  <select
                    className="form-select"
                    value={settings.defaultPaymentMethod}
                    onChange={e => updateField('defaultPaymentMethod', e.target.value)}
                  >
                    {PAYMENT_METHODS.map(pm => (
                      <option key={pm.value} value={pm.value}>{pm.label}</option>
                    ))}
                  </select>
                </div>

                <div className="onboarding-form-row">
                  <div className="form-group">
                    <label className="form-label">IBAN</label>
                    <input
                      className="form-input"
                      type="text"
                      placeholder="ES00 0000 0000 00 0000000000"
                      value={settings.iban}
                      onChange={e => updateField('iban', e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Banco</label>
                    <input
                      className="form-input"
                      type="text"
                      placeholder="CaixaBank, BBVA..."
                      value={settings.bankName}
                      onChange={e => updateField('bankName', e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Pie de factura</label>
                  <textarea
                    className="form-textarea"
                    placeholder="Texto que aparecerá al final de cada factura..."
                    value={settings.invoiceFooterText}
                    onChange={e => updateField('invoiceFooterText', e.target.value)}
                    rows={2}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Done */}
          {step === 4 && (
            <div className="onboarding-step onboarding-done">
              <div className="onboarding-done-icon">
                <Rocket size={44} />
              </div>
              <h2>¡Todo listo!</h2>
              <p>Tu sistema de facturación está configurado y listo para empezar.</p>

              <div className="onboarding-summary">
                <div className="onboarding-summary-item">
                  <span className="onboarding-summary-label">Empresa</span>
                  <span className="onboarding-summary-value">{settings.tradeName || settings.businessName}</span>
                </div>
                <div className="onboarding-summary-item">
                  <span className="onboarding-summary-label">NIF</span>
                  <span className="onboarding-summary-value">{settings.nif}</span>
                </div>
                <div className="onboarding-summary-item">
                  <span className="onboarding-summary-label">Serie</span>
                  <span className="onboarding-summary-value">{settings.invoiceSeries}</span>
                </div>
                <div className="onboarding-summary-item">
                  <span className="onboarding-summary-label">Sector</span>
                  <span className="onboarding-summary-value" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <CategoryIcon name={BUSINESS_SECTORS.find(s => s.value === settings.sector)?.icon || 'Package'} size={14} />
                    {BUSINESS_SECTORS.find(s => s.value === settings.sector)?.label}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="onboarding-nav">
          {step > 0 && (
            <button
              className="btn btn-secondary"
              onClick={() => setStep(s => s - 1)}
            >
              <ArrowLeft size={16} />
              Anterior
            </button>
          )}
          <div style={{ flex: 1 }} />
          {step < STEPS.length - 1 ? (
            <button
              className="btn btn-primary btn-lg"
              onClick={() => setStep(s => s + 1)}
              disabled={!canAdvance()}
            >
              {step === 0 ? 'Empezar' : 'Siguiente'}
              <ArrowRight size={16} />
            </button>
          ) : (
            <button
              className="btn btn-primary btn-lg"
              onClick={handleFinish}
              disabled={saving}
            >
              {saving ? 'Guardando...' : <><Rocket size={16} /> Empezar a Facturar</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
