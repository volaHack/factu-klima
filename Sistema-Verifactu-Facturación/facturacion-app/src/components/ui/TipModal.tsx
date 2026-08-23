'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Heart, Coffee, Pizza, Rocket, Star, Loader2, X, ShieldCheck, Sparkles } from 'lucide-react';

interface TipModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PRESET_AMOUNTS = [
  { amount: 3, label: '3 €', icon: Coffee, title: 'Un café', emoji: '☕', color: '#f59e0b' },
  { amount: 5, label: '5 €', icon: Pizza, title: 'Una pizza', emoji: '🍕', color: '#ef4444' },
  { amount: 15, label: '15 €', icon: Rocket, title: 'Un cohete', emoji: '🚀', color: '#8b5cf6' },
  { amount: 30, label: '30 €', icon: Star, title: 'Super Fan', emoji: '🌟', color: '#ec4899' },
];

export default function TipModal({ isOpen, onClose }: TipModalProps) {
  const [mounted, setMounted] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState<number>(5);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [isCustom, setIsCustom] = useState<boolean>(false);
  const [note, setNote] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      // Prevenir scroll en el fondo mientras el modal está abierto
      document.body.style.overflow = 'hidden';

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleKeyDown);
      };
    } else {
      document.body.style.overflow = '';
    }
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) return null;

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

      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al conectar con la pasarela de pago.');
      setLoading(false);
    }
  };

  const modalContent = (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 999999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        boxSizing: 'border-box',
        backgroundColor: 'rgba(5, 5, 8, 0.78)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        animation: 'fadeIn 0.2s ease-out',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '460px',
          maxHeight: 'min(92vh, 620px)',
          margin: 'auto',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--bg-secondary, #1a161f)',
          border: '1px solid rgba(255, 255, 255, 0.14)',
          borderRadius: '24px',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7), 0 0 50px rgba(201, 64, 122, 0.22)',
          overflow: 'hidden',
          animation: 'modalPop 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          position: 'relative',
          boxSizing: 'border-box',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Cabecera visual con gradiente elegante */}
        <div
          style={{
            position: 'relative',
            padding: '24px 24px 20px',
            background: 'linear-gradient(135deg, #b02a5c 0%, #7c1a3e 50%, #4a1024 100%)',
            color: '#ffffff',
            flexShrink: 0,
          }}
        >
          {/* Botón Cerrar */}
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: 'rgba(0, 0, 0, 0.28)',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            aria-label="Cerrar ventana"
          >
            <X size={16} />
          </button>

          {/* Badge superior */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              borderRadius: '20px',
              backgroundColor: 'rgba(255, 255, 255, 0.22)',
              backdropFilter: 'blur(4px)',
              fontSize: '11px',
              fontWeight: 800,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              marginBottom: '10px',
            }}
          >
            <Sparkles size={13} fill="#ffd700" color="#ffd700" />
            <span>Apoyo a FactuKlima</span>
          </div>

          <h2
            style={{
              fontSize: '1.35rem',
              fontWeight: 800,
              margin: '0 0 6px',
              letterSpacing: '-0.02em',
              lineHeight: 1.25,
            }}
          >
            ¡Invítanos a un café! ☕💖
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: '0.86rem',
              opacity: 0.92,
              lineHeight: 1.45,
            }}
          >
            Tu donación voluntaria nos ayuda a mantener el software siempre actualizado con Hacienda y sin límites molestos.
          </p>
        </div>

        {/* Cuerpo con scroll interior */}
        <div
          style={{
            padding: '20px 24px 24px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            boxSizing: 'border-box',
          }}
        >
          {/* Selector de cantidad */}
          <div>
            <span
              style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--text-secondary, #9ca3af)',
                marginBottom: '10px',
              }}
            >
              Selecciona una aportación
            </span>

            {/* Grid 2x2 de Presets */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '10px',
              }}
            >
              {PRESET_AMOUNTS.map(preset => {
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
                      gap: '10px',
                      padding: '10px 14px',
                      borderRadius: '14px',
                      backgroundColor: isSelected
                        ? 'var(--accent-50, rgba(201, 64, 122, 0.16))'
                        : 'var(--bg-tertiary, rgba(255, 255, 255, 0.05))',
                      border: isSelected
                        ? '2px solid var(--color-primary, #b02a5c)'
                        : '1px solid rgba(255, 255, 255, 0.1)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s ease',
                      boxShadow: isSelected ? '0 0 16px rgba(201, 64, 122, 0.28)' : 'none',
                    }}
                  >
                    <span style={{ fontSize: '1.4rem' }}>{preset.emoji}</span>
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 800,
                          fontSize: '1.05rem',
                          color: isSelected ? 'var(--color-primary, #e11d48)' : 'var(--text-primary, #f3f4f6)',
                          lineHeight: 1.1,
                        }}
                      >
                        {preset.label}
                      </div>
                      <div
                        style={{
                          fontSize: '0.72rem',
                          color: 'var(--text-secondary, #9ca3af)',
                          marginTop: '2px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {preset.title}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Toggle para importe personalizado */}
          <div>
            <button
              type="button"
              onClick={() => setIsCustom(!isCustom)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-primary, #e11d48)',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
                padding: '2px 0',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>{isCustom ? '← Volver a cantidades fijas' : '+ Elegir otra cantidad personalizada'}</span>
            </button>

            {isCustom && (
              <div style={{ position: 'relative', marginTop: '8px' }}>
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
                  style={{
                    paddingLeft: '36px',
                    fontSize: '1.1rem',
                    fontWeight: 800,
                    borderRadius: '12px',
                    backgroundColor: 'var(--bg-tertiary, rgba(255, 255, 255, 0.05))',
                  }}
                />
                <span
                  style={{
                    position: 'absolute',
                    left: '14px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontWeight: 800,
                    color: 'var(--text-secondary, #9ca3af)',
                    fontSize: '1.1rem',
                  }}
                >
                  €
                </span>
              </div>
            )}
          </div>

          {/* Mensaje opcional */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--text-secondary, #9ca3af)',
                marginBottom: '6px',
              }}
            >
              Dedicatoria / Mensaje (opcional)
            </label>
            <input
              type="text"
              className="form-input"
              placeholder="¡Gracias por las actualizaciones! / Excelente trabajo"
              value={note}
              onChange={e => setNote(e.target.value)}
              maxLength={150}
              style={{
                fontSize: '0.85rem',
                borderRadius: '10px',
              }}
            />
          </div>

          {error && (
            <div
              style={{
                padding: '8px 12px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#f87171',
                borderRadius: '10px',
                fontSize: '0.82rem',
                fontWeight: 600,
              }}
            >
              {error}
            </div>
          )}

          {/* Botón CTA Stripe */}
          <button
            type="button"
            className="btn btn-primary"
            onClick={handlePay}
            disabled={loading || currentAmount < 1}
            style={{
              width: '100%',
              padding: '13px 20px',
              fontSize: '0.98rem',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, #b02a5c 0%, #851e44 100%)',
              boxShadow: '0 8px 20px -4px rgba(176, 42, 92, 0.5)',
              border: 'none',
              cursor: loading || currentAmount < 1 ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" /> Conectando con Stripe...
              </>
            ) : (
              <>
                <Heart size={17} fill="#ffffff" />
                <span>Invitar {currentAmount > 0 ? `${currentAmount} €` : ''} vía Stripe</span>
              </>
            )}
          </button>

          {/* Garantía y seguridad */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              fontSize: '11px',
              color: 'var(--text-muted, #6b7280)',
              marginTop: '-4px',
            }}
          >
            <ShieldCheck size={14} color="#10b981" />
            <span>Pasarela oficial Stripe · Pago único seguro cifrado SSL</span>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
