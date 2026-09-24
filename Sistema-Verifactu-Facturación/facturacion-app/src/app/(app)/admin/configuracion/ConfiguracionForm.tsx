'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sliders,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  Save,
  Receipt,
  Landmark,
  Building2,
  Sparkles,
  Lock,
} from 'lucide-react';

interface PlataformaConfig {
  id: boolean;
  serie_suscripciones: string;
  serie_propinas: string;
  regimen_igic: 'general' | 'pequeno_empresario';
  cobrar_impuesto: boolean;
  stripe_tax_rate_igic: string | null;
  cobros_abiertos?: boolean;
  actividad_desde?: string | null;
  updated_at?: string;
}

interface Props {
  initialConfig: PlataformaConfig;
}

export default function ConfiguracionForm({ initialConfig }: Props) {
  const router = useRouter();
  const [form, setForm] = useState({
    serie_suscripciones: initialConfig.serie_suscripciones || 'SUB-2026',
    serie_propinas: initialConfig.serie_propinas || 'PROP-2026',
    regimen_igic: initialConfig.regimen_igic || 'pequeno_empresario',
    cobrar_impuesto: initialConfig.cobrar_impuesto ?? false,
    stripe_tax_rate_igic: initialConfig.stripe_tax_rate_igic || '',
    cobros_abiertos: initialConfig.cobros_abiertos ?? false,
    actividad_desde: initialConfig.actividad_desde || '',
    motivo: '',
  });

  const [guardando, setGuardando] = useState(false);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.motivo.trim()) {
      setError('Debes indicar un motivo de auditoría para aplicar los cambios.');
      return;
    }

    setGuardando(true);
    setError(null);
    setMensajeExito(null);

    try {
      const res = await fetch('/api/admin/configuracion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serie_suscripciones: form.serie_suscripciones,
          serie_propinas: form.serie_propinas,
          regimen_igic: form.regimen_igic,
          cobrar_impuesto: form.cobrar_impuesto,
          stripe_tax_rate_igic: form.stripe_tax_rate_igic.trim() || null,
          cobros_abiertos: form.cobros_abiertos,
          actividad_desde: form.actividad_desde || null,
          motivo: form.motivo.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al guardar la configuración');
      }

      setMensajeExito('Configuración de la plataforma actualizada y registrada en auditoría con éxito.');
      setForm(prev => ({ ...prev, motivo: '' }));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {mensajeExito && (
        <div
          className="apple-card"
          style={{
            background: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '1rem 1.25rem',
          }}
        >
          <CheckCircle2 size={20} className="text-emerald-600" />
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#047857' }}>
            {mensajeExito}
          </span>
        </div>
      )}

      {error && (
        <div
          className="apple-card"
          style={{
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '1rem 1.25rem',
          }}
        >
          <AlertCircle size={20} className="text-rose-600" />
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#b91c1c' }}>
            {error}
          </span>
        </div>
      )}

      {/* Tarjeta 0: Actividad y cobros — lo que decide si la plataforma cobra y factura */}
      <div className="apple-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1rem' }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(176, 42, 92, 0.12)', color: 'var(--accent-500)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Landmark size={18} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 650 }}>Actividad y cobros</h3>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Mientras no estés de alta en Hacienda, la plataforma no cobra ni emite facturas a tu nombre.
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gap: '1rem' }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.cobros_abiertos}
              onChange={e => setForm({ ...form, cobros_abiertos: e.target.checked })}
              style={{ width: 18, height: 18, marginTop: 2, accentColor: 'var(--accent-500)' }}
            />
            <span>
              <strong style={{ display: 'block', fontSize: '0.9rem' }}>Cobros abiertos</strong>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Apagado = fase piloto: /precios ofrece «Probar gratis», no hay propinas y las rutas de pago rechazan cualquier cobro.
                Da acceso a los negocios del piloto con una cortesía desde Cuentas.
              </span>
            </span>
          </label>

          <div>
            <label className="form-label" htmlFor="actividad_desde" style={{ fontWeight: 600 }}>Actividad dada de alta desde</label>
            <input
              id="actividad_desde"
              type="date"
              className="form-input"
              value={form.actividad_desde}
              onChange={e => setForm({ ...form, actividad_desde: e.target.value })}
              style={{ maxWidth: 220 }}
            />
            <p style={{ margin: '0.35rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              La fecha del alta en Hacienda (036/037). Vacía = nada se factura: cada cobro queda apuntado en el libro de ingresos
              como «pendiente de alta». Con fecha, lo cobrado desde ese día se factura solo.
            </p>
          </div>

          {form.cobros_abiertos && !form.actividad_desde && (
            <div style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem 1rem', borderRadius: 12, background: 'rgba(245, 158, 11, 0.1)', color: '#92400e', fontSize: '0.8rem', fontWeight: 600 }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} /> Vas a abrir los cobros sin fecha de alta: se cobrará sin emitir facturas. Pon la fecha antes de abrir.
            </div>
          )}
        </div>
      </div>

      {/* Tarjeta 1: Series de Facturación */}
      <div className="apple-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1.25rem' }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(59, 130, 246, 0.12)', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Receipt size={18} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.0625rem', fontWeight: 600, margin: 0 }}>
              Series de Facturación de la Plataforma
            </h2>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              Identificadores de serie legal para facturas emitidas por suscripciones y donaciones.
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: '1.25rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-primary)' }}>
              Serie para Suscripciones de Software
            </label>
            <input
              type="text"
              value={form.serie_suscripciones}
              onChange={e => setForm({ ...form, serie_suscripciones: e.target.value.toUpperCase() })}
              placeholder="Ej: SUB-2026"
              style={{
                width: '100%',
                padding: '0.625rem 0.875rem',
                borderRadius: '0.75rem',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-input, #ffffff)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono, monospace)',
                fontWeight: 600,
                fontSize: '0.9375rem',
              }}
              required
            />
            <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
              Se aplicará a facturas generadas tras el cobro de planes Básico, Pro y Sin Límite.
            </p>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-primary)' }}>
              Serie para Propinas y Donaciones
            </label>
            <input
              type="text"
              value={form.serie_propinas}
              onChange={e => setForm({ ...form, serie_propinas: e.target.value.toUpperCase() })}
              placeholder="Ej: PROP-2026"
              style={{
                width: '100%',
                padding: '0.625rem 0.875rem',
                borderRadius: '0.75rem',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-input, #ffffff)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono, monospace)',
                fontWeight: 600,
                fontSize: '0.9375rem',
              }}
              required
            />
            <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
              Para justificar legalmente propinas voluntarias recibidas de usuarios.
            </p>
          </div>
        </div>
      </div>

      {/* Tarjeta 2: Régimen Tributario Canario (IGIC) */}
      <div className="apple-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1.25rem' }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(139, 92, 246, 0.12)', color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Landmark size={18} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.0625rem', fontWeight: 600, margin: 0 }}>
              Régimen Fiscal de la Plataforma (IGIC)
            </h2>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              Define cómo la sociedad o autónomo titular tributa en Canarias (ATC).
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
          {/* Opción 1: Pequeño Empresario REPE */}
          <div
            onClick={() => setForm({ ...form, regimen_igic: 'pequeno_empresario', cobrar_impuesto: false })}
            style={{
              padding: '1.125rem',
              borderRadius: '0.875rem',
              border: form.regimen_igic === 'pequeno_empresario' ? '2px solid var(--accent-500)' : '1px solid var(--border-color)',
              background: form.regimen_igic === 'pequeno_empresario' ? 'var(--bg-card-hover)' : 'rgba(0,0,0,0.01)',
              cursor: 'pointer',
              transition: 'all 0.18s ease',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--text-primary)' }}>
                Régimen Pequeño Empresario (REPE)
              </span>
              {form.regimen_igic === 'pequeno_empresario' && (
                <span className="apple-pill" style={{ background: 'var(--accent-gradient)', color: '#fff', fontWeight: 600 }}>
                  Activo
                </span>
              )}
            </div>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
              Exento de repercutir IGIC (tipo 0%) para facturación menor a 30.000 €/año en Canarias. No se cobra impuesto en suscripciones ni se presenta Modelo 420 trimestral repercutido.
            </p>
          </div>

          {/* Opción 2: Régimen General */}
          <div
            onClick={() => setForm({ ...form, regimen_igic: 'general', cobrar_impuesto: true })}
            style={{
              padding: '1.125rem',
              borderRadius: '0.875rem',
              border: form.regimen_igic === 'general' ? '2px solid var(--accent-500)' : '1px solid var(--border-color)',
              background: form.regimen_igic === 'general' ? 'var(--bg-card-hover)' : 'rgba(0,0,0,0.01)',
              cursor: 'pointer',
              transition: 'all 0.18s ease',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--text-primary)' }}>
                Régimen General (7% IGIC)
              </span>
              {form.regimen_igic === 'general' && (
                <span className="apple-pill" style={{ background: 'var(--accent-gradient)', color: '#fff', fontWeight: 600 }}>
                  Activo
                </span>
              )}
            </div>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
              Repercute el 7% de IGIC a clientes en Canarias. Para clientes peninsulares con NIF, aplica regla de localización de servicios electrónicos (inversión sujeto pasivo). Se liquida con el Modelo 420.
            </p>
          </div>
        </div>

        {/* Toggle Cobro de Impuestos & Stripe Tax */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', borderRadius: '0.75rem', background: 'rgba(0,0,0,0.02)' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>Repercutir Impuesto en Stripe Checkout</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Añade la tasa de impuesto automáticamente</div>
            </div>
            <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 26, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.cobrar_impuesto}
                onChange={e => setForm({ ...form, cobrar_impuesto: e.target.checked })}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span
                style={{
                  position: 'absolute',
                  cursor: 'pointer',
                  top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: form.cobrar_impuesto ? 'var(--accent-500)' : '#cbd5e1',
                  borderRadius: 34,
                  transition: '0.2s',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    content: '""',
                    height: 20,
                    width: 20,
                    left: form.cobrar_impuesto ? 21 : 3,
                    bottom: 3,
                    backgroundColor: 'white',
                    borderRadius: '50%',
                    transition: '0.2s',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                  }}
                />
              </span>
            </label>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-primary)' }}>
              Stripe Tax Rate ID (Opcional)
            </label>
            <input
              type="text"
              value={form.stripe_tax_rate_igic}
              onChange={e => setForm({ ...form, stripe_tax_rate_igic: e.target.value })}
              placeholder="txr_xxxxxxxxxxxxxxxx"
              style={{
                width: '100%',
                padding: '0.625rem 0.875rem',
                borderRadius: '0.75rem',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-input, #ffffff)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: '0.875rem',
              }}
            />
          </div>
        </div>
      </div>

      {/* Tarjeta 3: Motivo Obligatorio y Guardar */}
      <div className="apple-card" style={{ borderLeft: '4px solid var(--accent-500)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.75rem' }}>
          <ShieldAlert size={20} style={{ color: 'var(--accent-500)' }} />
          <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>
            Motivo Obligatorio de Auditoría
          </h3>
        </div>
        <p style={{ margin: '0 0 0.875rem 0', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
          Por seguridad y cumplimiento normativo, cualquier cambio en las series o régimen fiscal queda registrado de forma inalterable en el historial de administración con fecha, hora y tu usuario.
        </p>

        <textarea
          rows={3}
          value={form.motivo}
          onChange={e => setForm({ ...form, motivo: e.target.value })}
          placeholder="Ej: Cambio a régimen general por superación del límite anual de 30.000 € / Actualización de serie 2026..."
          style={{
            width: '100%',
            padding: '0.75rem',
            borderRadius: '0.75rem',
            border: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-input, #ffffff)',
            color: 'var(--text-primary)',
            fontSize: '0.875rem',
            fontFamily: 'inherit',
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
          required
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
          <button
            type="submit"
            disabled={guardando}
            className="apple-btn-primary"
            style={{
              padding: '0.75rem 1.75rem',
              borderRadius: '9999px',
              border: 'none',
              background: 'var(--accent-gradient, var(--accent-500))',
              color: '#ffffff',
              fontSize: '0.9375rem',
              fontWeight: 600,
              cursor: guardando ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: '0 4px 14px var(--accent-glow)',
              opacity: guardando ? 0.7 : 1,
              transition: 'all 0.15s ease',
            }}
          >
            <Save size={18} />
            <span>{guardando ? 'Guardando...' : 'Aplicar Configuración'}</span>
          </button>
        </div>
      </div>
    </form>
  );
}
