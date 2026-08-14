'use client';

import { UserRoundX } from 'lucide-react';
import type { ClienteManual } from '@/lib/plantillas/datos';

interface PropsClienteOcasional {
  activo: boolean;
  onActivo: (activo: boolean) => void;
  cliente: ClienteManual;
  onChange: (cliente: ClienteManual) => void;
}

const CAMPOS: { clave: keyof ClienteManual; etiqueta: string; placeholder: string; required?: boolean }[] = [
  { clave: 'nombre', etiqueta: 'Nombre / Razón social', placeholder: 'Nombre completo o empresa', required: true },
  { clave: 'nif', etiqueta: 'NIF', placeholder: '12345678Z' },
  { clave: 'direccion', etiqueta: 'Dirección', placeholder: 'Calle, número...' },
  { clave: 'cp', etiqueta: 'CP', placeholder: '28001' },
  { clave: 'ciudad', etiqueta: 'Ciudad', placeholder: 'Madrid' },
  { clave: 'provincia', etiqueta: 'Provincia', placeholder: 'Madrid' },
  { clave: 'email', etiqueta: 'Email', placeholder: 'cliente@ejemplo.es' },
  { clave: 'telefono', etiqueta: 'Teléfono', placeholder: '910 000 000' },
];

/**
 * Alternativa a la ficha de cliente para ventas puntuales: en vez de crear un
 * cliente en el registro, se escriben aquí sus datos y quedan guardados en la
 * propia factura (datosExtras.__cliente). Es independiente del cliente
 * genérico "Venta al público" del TPV.
 */
export function ClienteOcasionalCard({ activo, onActivo, cliente, onChange }: PropsClienteOcasional) {
  const cambiar = (clave: keyof ClienteManual, valor: string) => {
    onChange({ ...cliente, [clave]: valor });
  };

  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
      <label className="field-check" style={{ alignItems: 'flex-start' }}>
        <input
          type="checkbox"
          checked={activo}
          onChange={e => onActivo(e.target.checked)}
          style={{ marginTop: 2 }}
        />
        <span>
          <strong style={{ display: 'block' }}>Cliente ocasional (sin ficha)</strong>
          <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
            Para ventas puntuales sin crear un cliente en el registro. Sus datos se guardan en esta
            factura.
          </span>
        </span>
      </label>

      {activo && (
        <div className="form-row" style={{ flexWrap: 'wrap', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
          {CAMPOS.map(campo => (
            <div className="form-group" key={campo.clave} style={{ flex: '1 1 220px' }}>
              <label className={`form-label${campo.required ? ' required' : ''}`}>
                {campo.etiqueta}
              </label>
              <input
                className="form-input"
                value={cliente[campo.clave]}
                onChange={e => cambiar(campo.clave, e.target.value)}
                placeholder={campo.placeholder}
              />
            </div>
          ))}
          <div className="field-message" style={{ flex: '1 1 100%' }}>
            <UserRoundX size={14} />
            El nombre es obligatorio; el resto puede quedar en blanco.
          </div>
        </div>
      )}
    </div>
  );
}
