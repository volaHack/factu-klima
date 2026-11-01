'use client';

/**
 * Anular pide el motivo, y el motivo queda en el documento: dentro de un
 * año nadie recuerda por qué se anuló aquel pedido. Si de él ya salió algo,
 * se dice aquí mismo, antes de confirmar.
 */

import { useState } from 'react';
import { Ban } from 'lucide-react';
import DialogoRapido from '@/components/documentos/DialogoRapido';

export default function DialogoAnular({ nombre, aviso, ocupado, onCerrar, onAceptar }: {
  /** «pedido PEDC-2026-0003» */
  nombre: string;
  aviso: string | null;
  ocupado: boolean;
  onCerrar: () => void;
  onAceptar: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState('');
  const vacio = !motivo.trim();
  return (
    <DialogoRapido
      titulo={`Anular ${nombre}`}
      icono={<Ban size={18} aria-hidden />}
      onCerrar={onCerrar}
      pie={(
        <>
          <button type="button" className="btn btn-ghost" onClick={onCerrar}>Cancelar</button>
          <button type="button" className="btn btn-danger" disabled={ocupado || vacio} onClick={() => onAceptar(motivo.trim())}>
            Anular
          </button>
        </>
      )}
    >
      {aviso && <p className="dialogo-anular-aviso">{aviso}</p>}
      <div className="form-group" style={{ margin: 0 }}>
        <label className="form-label" htmlFor="anular-motivo">Motivo</label>
        <textarea
          id="anular-motivo" className="form-textarea" rows={3} value={motivo}
          onChange={e => setMotivo(e.target.value)} data-foco-inicial
          placeholder="Por qué se anula: queda guardado en el documento"
        />
      </div>
    </DialogoRapido>
  );
}
