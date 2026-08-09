'use client';

import { X, Keyboard, ScanBarcode, Check } from 'lucide-react';

interface TpvKeyboardHelpModalProps {
  onClose: () => void;
}

const SHORTCUTS = [
  { key: 'F1', description: 'Enfocar buscador / escáner de código de barras' },
  { key: 'F2 / Espacio', description: 'Abrir pantalla de cobro rápido' },
  { key: 'F3', description: 'Aparcar la venta actual' },
  { key: 'F4', description: 'Añadir artículo improvisado (Venta Libre)' },
  { key: 'F5', description: 'Dar de alta un nuevo producto en catálogo' },
  { key: 'Escanear EAN', description: 'Abre automáticamente la ventana para registrar producto no guardado' },
  { key: 'Esc', description: 'Cerrar ventanas / Limpiar búsqueda' },
  { key: '1, 2, 3', description: 'Seleccionar Efectivo, Tarjeta o Bizum en cobro' },
  { key: 'Enter', description: 'Confirmar el cobro cuando el importe es suficiente' },
];

export default function TpvKeyboardHelpModal({ onClose }: TpvKeyboardHelpModalProps) {
  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 1100, backdropFilter: 'blur(6px)' }}>
      <div
        className="modal tpv-shortcuts-modal"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: 520,
          width: '92vw',
          maxHeight: '88vh',
          overflowY: 'auto',
          padding: 0,
          borderRadius: 'var(--radius-xl)',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: 'var(--space-5) var(--space-6)',
          background: 'linear-gradient(135deg, var(--wine-500) 0%, #2a0e17 100%)',
          color: '#ffffff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <div style={{
              width: 40,
              height: 40,
              borderRadius: 'var(--radius-lg)',
              background: 'rgba(255, 255, 255, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
            }}>
              <Keyboard size={22} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#ffffff' }}>
                Atajos de Teclado TPV
              </h3>
              <p style={{ margin: 0, fontSize: 'var(--text-xs)', opacity: 0.85 }}>
                Operativa ultra-rápida de caja sin tocar el ratón
              </p>
            </div>
          </div>
          <button
            className="btn btn-ghost btn-icon"
            onClick={onClose}
            style={{ color: '#ffffff', opacity: 0.8 }}
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: 'var(--space-6)', background: 'var(--bg-card)' }}>
          {/* Scanner Tip Box */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 'var(--space-3)',
              marginBottom: 'var(--space-5)',
              padding: 'var(--space-4)',
              background: 'var(--accent-50)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--accent-500)',
            }}
          >
            <ScanBarcode size={22} style={{ color: 'var(--accent-500)', flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: 'var(--text-xs)', lineHeight: 1.5, color: 'var(--text-primary)' }}>
              <strong style={{ color: 'var(--accent-500)' }}>Escáner de mostrador siempre activo:</strong>{' '}
              Escanea cualquier código de barras EAN en todo momento. La campana de la barra parpadea al recibir la lectura. Un código nuevo abre el alta inmediata.
            </div>
          </div>

          {/* Shortcuts Grid */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-6)' }}>
            {SHORTCUTS.map((s, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: 'var(--bg-secondary)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                  gap: 'var(--space-3)',
                }}
              >
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--text-secondary)' }}>
                  {s.description}
                </span>
                <kbd
                  style={{
                    background: 'linear-gradient(180deg, #ffffff 0%, var(--bg-tertiary) 100%)',
                    border: '1px solid var(--border-strong)',
                    borderBottom: '2px solid var(--border-strong)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '3px 8px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-2xs)',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.08)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {s.key}
                </kbd>
              </div>
            ))}
          </div>

          <div style={{ textAlign: 'right' }}>
            <button className="btn btn-primary" style={{ padding: '10px 24px', fontWeight: 700 }} onClick={onClose}>
              <Check size={16} /> Entendido
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
