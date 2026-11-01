'use client';

/**
 * Antes de registrar la factura de un proveedor se piden los datos de SU
 * papel: el número que puso él (el libro de facturas recibidas lo pide) y
 * su fecha, y la fecha en que la registramos, que decide el trimestre en
 * que se deduce el impuesto. Lo que no cuadra (número repetido, registro
 * anterior a la factura) se ve mientras se escribe (problemasFacturaRecibida).
 */

import { useMemo, useState } from 'react';
import { FileSignature, AlertTriangle } from 'lucide-react';
import DialogoRapido from '@/components/documentos/DialogoRapido';
import { conDatosDelProveedor, problemasFacturaRecibida } from '@/lib/compras';
import type { DatosFacturaProveedor } from '@/lib/flujoVentaAcciones';
import { InvoiceStatus, type Invoice } from '@/lib/types';
import { getToday } from '@/lib/utils';

export default function DialogoFacturaProveedor({ origen, documentos, ocupado, onCerrar, onAceptar }: {
  origen: Invoice;
  documentos: readonly Invoice[];
  ocupado: boolean;
  onCerrar: () => void;
  onAceptar: (datos: DatosFacturaProveedor) => void;
}) {
  const hoy = getToday();
  const [numero, setNumero] = useState('');
  const [fechaExpedicion, setFechaExpedicion] = useState(hoy);
  const [fechaRegistro, setFechaRegistro] = useState(hoy);

  // Se prueba sobre una factura de mentira con estos datos: los mismos
  // avisos que dará al guardarla.
  const problemas = useMemo(() => {
    const prueba: Invoice = { ...origen, id: '__nueva', tipo: 'factura', status: InvoiceStatus.BORRADOR };
    return problemasFacturaRecibida(conDatosDelProveedor(prueba, { numero, fechaExpedicion, fechaRegistro }), documentos);
  }, [origen, documentos, numero, fechaExpedicion, fechaRegistro]);
  const hayError = problemas.some(p => p.gravedad === 'error');

  return (
    <DialogoRapido
      titulo="Factura del proveedor"
      icono={<FileSignature size={18} aria-hidden />}
      onCerrar={onCerrar}
      pie={(
        <>
          <button type="button" className="btn btn-ghost" onClick={onCerrar}>Cancelar</button>
          <button type="button" className="btn btn-primary" disabled={ocupado || hayError} onClick={() => onAceptar({ numero, fechaExpedicion, fechaRegistro })}>
            Registrar factura
          </button>
        </>
      )}
    >
      <p className="dialogo-proveedor-intro">
        De {origen.clientName}, por {origen.tipo === 'albaran' ? `el albarán ${origen.number}` : `lo pendiente del pedido ${origen.number}`}.
        Queda en borrador para repasarla contra el papel.
      </p>
      <div className="form-group">
        <label className="form-label" htmlFor="fp-numero">Nº factura del proveedor</label>
        <input id="fp-numero" className="form-input" value={numero} onChange={e => setNumero(e.target.value)} placeholder="El que figura en su factura" data-foco-inicial autoComplete="off" />
      </div>
      <div className="form-row">
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label" htmlFor="fp-fecha">Fecha de la factura</label>
          <input id="fp-fecha" type="date" className="form-input" value={fechaExpedicion} onChange={e => setFechaExpedicion(e.target.value)} />
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label" htmlFor="fp-registro">Fecha de registro</label>
          <input id="fp-registro" type="date" className="form-input" value={fechaRegistro} onChange={e => setFechaRegistro(e.target.value)} />
        </div>
      </div>
      {problemas.length > 0 && (
        <ul className="dialogo-proveedor-avisos">
          {problemas.map(p => (
            <li key={p.texto} className={`dialogo-proveedor-aviso dialogo-proveedor-aviso--${p.gravedad}`}>
              <AlertTriangle size={14} aria-hidden /> {p.texto}
            </li>
          ))}
        </ul>
      )}
    </DialogoRapido>
  );
}
