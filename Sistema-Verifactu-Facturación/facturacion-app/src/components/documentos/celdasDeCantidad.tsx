/**
 * Las celdas de cantidad de una línea en las fichas de factura, documento
 * y albarán: CAJ. / U/C / UDES. cuando el documento va por cajas (ver
 * lib/cajas.ts) o la cantidad de siempre si no.
 */

import { desgloseLinea } from '@/lib/cajas';

interface Linea { id: string; quantity: number; unit?: string; unitsPerPackage?: number; cajas?: number | null }

const n = (x: number) => (Number.isInteger(x) ? String(x) : x.toLocaleString('es-ES', { maximumFractionDigits: 3 }));
const vacio = <span style={{ color: 'var(--text-muted, #64748b)' }}>—</span>;

export function celdasDeCantidad(linea: Linea, porCajas: boolean) {
  if (!porCajas) {
    return <td className="linea-dato" data-label="Cant." style={{ textAlign: 'right' }}>{n(linea.quantity)} {linea.unit ?? ''}</td>;
  }
  const d = desgloseLinea(linea);
  return (
    <>
      <td className="linea-dato" data-label="CAJ." style={{ textAlign: 'right' }}>{d.cajas ? n(d.cajas) : vacio}</td>
      <td className="linea-dato" data-label="U/C" style={{ textAlign: 'right' }}>{d.udsCaja ? n(d.udsCaja) : vacio}</td>
      <td className="linea-dato" data-label="UDES." style={{ textAlign: 'right' }}><strong>{n(d.unidades)}</strong></td>
    </>
  );
}
