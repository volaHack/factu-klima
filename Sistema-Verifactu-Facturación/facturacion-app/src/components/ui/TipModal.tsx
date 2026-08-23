'use client';

import { useState, useEffect } from 'react';
import { Heart, Sparkles, Coffee, Pizza, Rocket, Star, Check, Loader2, X, ExternalLink } from 'lucide-react';

interface TipModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PRESET_AMOUNTS = [
  { amount: 3, label: '3 €', icon: Coffee, title: 'Un café', desc: 'Un empujoncito de energía' },
  { amount: 5, label: '5 €', icon: Pizza, title: 'Una porción de pizza', desc: 'Para el equipo' },
  { amount: 15, label: '15 €', icon: Rocket, title: 'Un cohete', desc: 'Impulso al desarrollo' },
  { amount: 30, label: '30 €', icon: Star, title: 'Super Fan', desc: 'Apoyo premium al proyecto' },
];

export default function TipModal({ isOpen, onClose }: TipModalProps) {
  const [selectedAmount, setSelectedAmount] = useState<number>(5);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [isCustom, setIsCustom] = useState<boolean>(false);
  const [note, setNote] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentAmount = isCustom ? (parseFloat(customAmount) || 0) : selectedAmount;

  const handlePay = async () => {
    if (currentAmount < 1) {
      setError('El importe mínimo para la propina es 1 €.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/stripe/tip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: currentAmount,
          note: note.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.url) {
        throw new Error(data.error || 'No se pudo conectar con Stripe.');
      }

      // Redirigir a la pasarela segura de Stripe
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado al conectar con Stripe.');
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
      <div
        className="modal modal-md"
        onClick={e => e.stopPropagation()}
        style={{
          borderRadius: 'var(--radius-xl)',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        }}
      >
        {/* Cabecera con degradado */}
        <div
          style={{
            background: 'linear-gradient(135deg, #c9407a 0%, #7c1a3e 100%)',
            padding: 'var(--space-6) var(--space-6) var(--space-4)',
            color: '#ffffff',
            position: 'relative',
          }}
        >
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              borderRadius: '50%',
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              cursor: 'pointer',
            }}
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255, 255, 255, 0.18)', padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, marginBottom: 12 }}>
            <Heart size={14} fill="#ffffff" /> Apoyo y Propinas
          </div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '0 0 6px', color: '#ffffff' }}>
            ¿Te gusta FactuKlima? ☕
          </h2>
          <p style={{ fontSize: '0.9rem', opacity: 0.9, margin: 0, lineHeight: 1.4 }}>
            Tu apoyo directo nos permite mantener el software actualizado, rápido y cumpliendo con todas las normativas de Hacienda sin costes ocultos.
          </p>
        </div>

        {/* Cuerpo */}
        <div style={{ padding: 'var(--space-6)' }}>
          <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: 'var(--space-3)' }}>
            Elige una aportación voluntaria
          </label>

          {/* Grid de cantidades */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
            {PRESET_AMOUNTS.map(preset => {
              const Icon = preset.icon;
              const isSelected = !isCustom && selectedAmount === preset.amount;

              return (
                <button
                  key={preset.amount}
                  type="button"
                  onClick={() => {
                    setSelectedAmount(preset.amount);
                    setIsCustom(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-lg)',
                    border: isSelected ? '2px solid var(--color-primary)' : '1px solid var(--border-color)',
                    background: isSelected ? 'var(--accent-50, rgba(201, 64, 122, 0.08))' : 'var(--bg-secondary)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      background: isSelected ? 'var(--color-primary)' : 'var(--bg-tertiary)',
                      color: isSelected ? '#ffffff' : 'var(--text-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={18} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '1rem', color: isSelected ? 'var(--color-primary)' : 'var(--text-primary)' }}>
                      {preset.label}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {preset.title}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Opción cantidad personalizada */}
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer', marginBottom: 6 }}>
              <input
                type="checkbox"
                checked={isCustom}
                onChange={e => setIsCustom(e.target.checked)}
              />
              <span>Otra cantidad personalizada (€)</span>
            </label>

            {isCustom && (
              <div style={{ position: 'relative', marginTop: 6 }}>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  step="1"
                  className="form-input"
                  placeholder="Ej: 20"
                  value={customAmount}
                  onChange={e => setCustomAmount(e.target.value)}
                  autoFocus
                  style={{ paddingLeft: 36, fontSize: '1rem', fontWeight: 700 }}
                />
                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  €
                </span>
              </div>
            )}
          </div>

          {/* Mensaje opcional */}
          <div style={{ marginBottom: 'var(--space-5)' }}>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
              Mensaje o dedicatoria (opcional)
            </label>
            <input
              type="text"
              className="form-input"
              placeholder="¡Gran trabajo con el programa! / Gracias por el soporte"
              value={note}
              onChange={e => setNote(e.target.value)}
              maxLength={200}
            />
          </div>

          {error && (
            <div style={{ padding: '8px 12px', background: 'var(--color-danger-bg, #fee2e2)', color: 'var(--color-danger, #b91c1c)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-4)' }}>
              {error}
            </div>
          )}

          {/* Botón de pago Stripe */}
          <button
            type="button"
            className="btn btn-primary"
            onClick={handlePay}
            disabled={loading || currentAmount < 1}
            style={{
              width: '100%',
              padding: '14px',
              fontSize: '1rem',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              borderRadius: 'var(--radius-lg)',
              background: 'linear-gradient(135deg, #c9407a 0%, #9c2856 100%)',
              boxShadow: '0 4px 14px rgba(201, 64, 122, 0.4)',
            }}
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" /> Conectando con Stripe...
              </>
            ) : (
              <>
                <Heart size={18} fill="#ffffff" /> Invitar {currentAmount > 0 ? `${currentAmount} €` : ''} vía Stripe
              </>
            )}
          </button>

          <p style={{ textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: '12px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <span>🔒 Pago seguro cifrado SSL mediante pasarela oficial de Stripe</span>
          </p>
        </div>
      </div>
    </div>
  );
}
