'use client';

/**
 * Los dos datos que una factura recibida necesita además de los nuestros:
 * el número que le puso el proveedor y la fecha en que la registramos (la
 * de la factura es la «Fecha de emisión» del formulario). Debajo, lo que no
 * cuadra (problemasFacturaRecibida): un número ya registrado de ese mismo
 * proveedor para el guardado; que falte el número, sólo se avisa.
 */

import { AlertTriangle } from 'lucide-react';
import type { ProblemaRecibida } from '@/lib/compras';

export default function CamposFacturaProveedor({ numero, fechaRegistro, problemas, onNumero, onFechaRegistro }: {
  numero: string;
  fechaRegistro: string;
  problemas: readonly ProblemaRecibida[];
  onNumero: (v: string) => void;
  onFechaRegistro: (v: string) => void;
}) {
  return (
    <>
      <div className="form-row">
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label" htmlFor="fp-numero">Nº factura del proveedor</label>
          <input id="fp-numero" className="form-input" value={numero} onChange={e => onNumero(e.target.value)} placeholder="El que figura en su factura" autoComplete="off" />
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label" htmlFor="fp-registro">Fecha de registro</label>
          <input id="fp-registro" type="date" className="form-input" value={fechaRegistro} onChange={e => onFechaRegistro(e.target.value)} />
        </div>
      </div>
      {problemas.length > 0 && (
        <ul className="dialogo-proveedor-avisos" style={{ marginBottom: 'var(--space-3)' }}>
          {problemas.map(p => (
            <li key={p.texto} className={`dialogo-proveedor-aviso dialogo-proveedor-aviso--${p.gravedad}`}>
              <AlertTriangle size={14} aria-hidden /> {p.texto}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
