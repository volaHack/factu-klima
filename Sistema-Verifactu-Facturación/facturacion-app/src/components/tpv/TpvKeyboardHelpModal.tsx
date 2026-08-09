'use client';

import { X, Keyboard, ScanBarcode } from 'lucide-react';

interface TpvKeyboardHelpModalProps {
  onClose: () => void;
}

const SHORTCUTS = [
  { key: 'F1', description: 'Enfocar buscador / escáner de código de barras' },
  { key: 'F2 / Espacio', description: 'Abrir pantalla de cobro rápido' },
  { key: 'F3', description: 'Aparcar la venta actual' },
  { key: 'F4', description: 'Añadir artículo improvisado (Venta Libre)' },
  { key: 'F5', description: 'Dar de alta un nuevo producto en catálogo' },
  { key: 'Escanear desconocido', description: 'Abre automáticamente la ventana para registrar el producto' },
  { key: 'Esc', description: 'Cerrar ventanas / Limpiar búsqueda' },
  { key: '1, 2, 3', description: 'Seleccionar Efectivo, Tarjeta o Bizum en pantalla de cobro' },
  { key: 'Enter', description: 'Confirmar el cobro cuando el importe es suficiente' },
];

export default function TpvKeyboardHelpModal({ onClose }: TpvKeyboardHelpModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal tpv-shortcuts-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="tpv-checkout-header">
          <h3><Keyboard size={20} className="text-accent" /> Atajos de teclado para cajeros</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
            marginTop: 'var(--space-4)', padding: 'var(--space-3) var(--space-4)',
            background: 'var(--accent-glow)', borderRadius: 'var(--radius-md)',
            border: '1px solid rgba(59, 130, 246, 0.2)',
          }}
        >
          <ScanBarcode size={18} style={{ color: 'var(--accent-400)', flexShrink: 0 }} />
          <div style={{ fontSize: 'var(--text-xs)', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Escáner de mostrador:</strong>{' '}
            <span style={{ color: 'var(--text-secondary)' }}>
              escanea un código en cualquier momento, esté donde esté el foco. La campana «Escáner» de
              la barra superior parpadea al recibirlo. Un código no registrado abre automáticamente el alta del producto.
            </span>
          </div>
        </div>

        <div className="tpv-shortcuts-list" style={{ marginTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {SHORTCUTS.map((s, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 'var(--space-3) var(--space-4)',
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{s.description}</span>
              <kbd
                style={{
                  background: 'var(--bg-card-hover)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-xs)',
                  padding: '2px 8px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                {s.key}
              </kbd>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 'var(--space-6)', textAlign: 'right' }}>
          <button className="btn btn-primary" onClick={onClose}>
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
