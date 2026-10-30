'use client';

import { ClipboardCheck, AlertTriangle, Send } from 'lucide-react';
import type { PuntoRevision } from '@/lib/revisionEmision';
import DialogoRapido from '@/components/documentos/DialogoRapido';

/**
 * El repaso de asesor al pulsar Emitir (ver lib/revisionEmision.ts). Sólo
 * sale si hay algo que mirar; si todo está en orden, se emite sin más.
 * «Revisar» es lo que tiene el foco: con Intro sin pensar se vuelve a la
 * factura, no se emite.
 */
export default function RevisionAntesDeEmitir({ puntos, onRevisar, onEmitir }: {
  puntos: PuntoRevision[];
  onRevisar: () => void;
  onEmitir: () => void;
}) {
  return (
    <DialogoRapido
      titulo="Antes de emitir, un repaso"
      icono={<ClipboardCheck size={18} aria-hidden />}
      onCerrar={onRevisar}
      className="revision-emitir"
      pie={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onEmitir}>
            <Send size={15} /> Emitir igualmente
          </button>
          <button type="button" className="btn btn-primary" onClick={onRevisar} data-foco-inicial>
            Revisar
          </button>
        </>
      )}
    >
      <p className="revision-emitir-intro">
        {puntos.length === 1 ? 'Hay una cosa' : `Hay ${puntos.length} cosas`} que conviene mirar. Una factura emitida ya no se puede cambiar: sólo rectificar.
      </p>
      <ul className="revision-emitir-lista">
        {puntos.map(p => (
          <li key={p.id} className="revision-emitir-punto">
            <AlertTriangle size={16} aria-hidden className="revision-emitir-icono" />
            <div>
              <strong>{p.titulo}</strong>
              <p>{p.detalle}</p>
            </div>
          </li>
        ))}
      </ul>
    </DialogoRapido>
  );
}
