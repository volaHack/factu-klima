'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, ClipboardPaste, Sparkles } from 'lucide-react';
import { leerFichaPegada, propuestaDeFicha, type CampoFicha, type FilaPropuesta } from '@/lib/fichaPegada';
import DialogoRapido from '@/components/documentos/DialogoRapido';

const EJEMPLO = 'Un saludo,\nNombre Apellido\nEmpresa Ejemplo S.L.\nCIF: B00000000\nC/ Ejemplo 1, 35500 Arrecife\nTel. 928 000 000 · correo@ejemplo.es';

/**
 * «Pegar datos»: se pega la firma de un correo o un bloque con los datos
 * y se rellena la ficha (lib/fichaPegada.ts). Antes se enseña lo que se ha
 * encontrado, casilla a casilla: lo que va a una casilla vacía va marcado;
 * lo que cambiaría algo ya escrito, sin marcar.
 */
export default function PegarDatosFicha({ actual, onAplicar, onCerrar }: {
  /** Lo que hay ahora en el formulario, con los nombres de `CampoFicha`. */
  actual: Partial<Record<CampoFicha, string>>;
  onAplicar: (datos: Partial<Record<CampoFicha, string>>) => void;
  onCerrar: () => void;
}) {
  const idTexto = useId();
  const [texto, setTexto] = useState('');
  const [filas, setFilas] = useState<FilaPropuesta[] | null>(null);

  const resumen = useRef<HTMLParagraphElement>(null);
  const caja = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (filas) resumen.current?.focus();
    else caja.current?.focus();
  }, [filas]);

  const leer = () => setFilas(propuestaDeFicha(leerFichaPegada(texto), actual));
  const marcar = (campo: CampoFicha) => setFilas(f => f?.map(x => (x.campo === campo ? { ...x, marcada: !x.marcada } : x)) ?? f);
  const marcadas = filas?.filter(f => f.marcada) ?? [];

  const aplicar = () => {
    const datos: Partial<Record<CampoFicha, string>> = {};
    for (const f of marcadas) datos[f.campo] = f.valor;
    onAplicar(datos);
  };

  const pie = filas ? (
    <>
      <button type="button" className="btn btn-ghost" onClick={() => setFilas(null)}>Volver al texto</button>
      <button type="button" className="btn btn-primary" disabled={!marcadas.length} onClick={aplicar}>
        <Check size={16} aria-hidden /> {marcadas.length === 1 ? 'Rellenar 1 casilla' : `Rellenar ${marcadas.length} casillas`}
      </button>
    </>
  ) : (
    <>
      <button type="button" className="btn btn-secondary" onClick={onCerrar}>Cancelar</button>
      <button type="button" className="btn btn-primary" disabled={!texto.trim()} onClick={leer}>
        <Sparkles size={16} aria-hidden /> Leer los datos
      </button>
    </>
  );

  return createPortal(
    <DialogoRapido titulo="Pegar datos" icono={<ClipboardPaste size={18} aria-hidden />} onCerrar={onCerrar} pie={pie} className="pegar-pedido">
      {!filas ? (
        <>
          <label className="form-label" htmlFor={idTexto}>Pega la firma del correo o el bloque con los datos</label>
          <textarea
            id={idTexto}
            ref={caja}
            className="form-input pegar-caja"
            rows={8}
            value={texto}
            onChange={e => setTexto(e.target.value)}
            placeholder={EJEMPLO}
            data-foco-inicial
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && texto.trim()) { e.preventDefault(); leer(); }
            }}
          />
          <p className="form-hint">Saca la razón social, el NIF (comprobando su letra), el correo, el teléfono, la dirección y la persona de contacto.</p>
        </>
      ) : (
        <>
          <p className="pegar-resumen" role="status" tabIndex={-1} ref={resumen}>
            {filas.length
              ? 'Esto es lo que he encontrado. Desmarca lo que no quieras poner.'
              : 'No he encontrado nada nuevo para la ficha en ese texto.'}
          </p>
          <ul className="pegar-lista">
            {filas.map(f => (
              <li key={f.campo} className={`pegar-renglon es-${f.aviso ? 'dudoso' : 'reconocido'}${f.marcada ? '' : ' esta-fuera'}`}>
                <label className="pegar-renglon-cabeza pegar-campo">
                  <input type="checkbox" checked={f.marcada} onChange={() => marcar(f.campo)} />
                  <span className="pegar-campo-etiqueta">{f.etiqueta}</span>
                  <strong className="pegar-campo-valor">{f.valor}</strong>
                </label>
                {f.actual && <p className="pegar-nota">Ahora pone «{f.actual}»: márcalo para cambiarlo.</p>}
                {f.aviso && <p className="pegar-nota pegar-nota--aviso"><AlertTriangle size={12} aria-hidden /> {f.aviso}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </DialogoRapido>,
    document.body,
  );
}
