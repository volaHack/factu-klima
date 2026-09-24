'use client';

import { useState } from 'react';
import { AlertTriangle, BadgeCheck, Loader2, ShieldQuestion, XCircle } from 'lucide-react';
import { comprobarNifYNombre, esClienteEspanol, normalizarNif, type ProblemaIdentidad } from '@/lib/validation/identidad';
import { isValidNif } from '@/lib/validation/nif';
import { comprobarEnAeat, explicarEstado, impideEmitir, type RespuestaCenso } from '@/lib/validation/censoCliente';

/**
 * Debajo del NIF en la ficha: lo que se sabe sin preguntar a nadie (formato,
 * control, que cuadre con el nombre) y un botón para preguntar al censo de
 * la AEAT. Se enseña mientras se escribe, para que el problema se vea al
 * dar de alta al cliente y no el día que toca emitirle una factura.
 */
export function problemasDeFicha(nif: string, nombre: string, pais: string, quien = 'el cliente'): ProblemaIdentidad[] {
  if (!esClienteEspanol(pais)) return [];
  if (!nif.trim() && !nombre.trim()) return [];
  // Mientras se está escribiendo el NIF no se da la lata con el formato.
  const n = normalizarNif(nif);
  if (n.length > 0 && n.length < 9) return [];
  return comprobarNifYNombre(nif, nombre, quien);
}

export default function ComprobacionIdentidad({
  nif, nombre, pais, onUsarNombre, quien = 'el cliente',
}: {
  /** Para los textos: «el cliente», «tu empresa». */
  quien?: string;
  nif: string;
  nombre: string;
  pais: string;
  /** La AEAT tiene otra razón social: ponerla en la ficha. */
  onUsarNombre: (nombre: string) => void;
}) {
  const [censo, setCenso] = useState<{ para: string; r: RespuestaCenso } | null>(null);
  const [preguntando, setPreguntando] = useState(false);

  const problemas = problemasDeFicha(nif, nombre, pais, quien);
  const clave = `${normalizarNif(nif)}|${nombre.trim()}`;
  // Lo que contestó la AEAT deja de valer en cuanto se cambia el NIF o el nombre.
  const respuesta = censo && censo.para === clave ? censo.r : null;
  const preguntable = esClienteEspanol(pais) && isValidNif(normalizarNif(nif)) && nombre.trim().length > 0
    && !problemas.some(p => p.gravedad === 'error');

  const preguntar = async () => {
    setPreguntando(true);
    const r = await comprobarEnAeat(nif, nombre);
    setCenso({ para: clave, r });
    setPreguntando(false);
  };

  if (!esClienteEspanol(pais)) {
    return <p className="identidad-nota">Cliente de fuera de España: se usa su identificador fiscal o su NIF-IVA, no se comprueba como NIF español.</p>;
  }
  if (problemas.length === 0 && !preguntable) return null;

  return (
    <div className="identidad" aria-live="polite">
      {problemas.map((p, i) => (
        <p key={i} className={`identidad-linea identidad-linea--${p.gravedad}`}>
          {p.gravedad === 'error' ? <XCircle size={14} /> : <AlertTriangle size={14} />}
          <span>{p.mensaje}</span>
        </p>
      ))}

      {preguntable && (
        <div className="identidad-censo">
          {respuesta?.tipo === 'resultado' ? (
            <p className={`identidad-linea identidad-linea--${respuesta.resultado.estado === 'identificado' ? 'ok' : impideEmitir(respuesta.resultado.estado) ? 'error' : 'aviso'}`}>
              {respuesta.resultado.estado === 'identificado' ? <BadgeCheck size={14} /> : <AlertTriangle size={14} />}
              <span>
                {explicarEstado(respuesta.resultado.estado, normalizarNif(nif), respuesta.resultado.nombreCenso)}
                {respuesta.resultado.nombreCenso
                  && respuesta.resultado.nombreCenso.trim().toUpperCase() !== nombre.trim().toUpperCase()
                  && /^[A-W]/.test(normalizarNif(nif)) && (
                  <>
                    {' '}En Hacienda consta como «{respuesta.resultado.nombreCenso}».{' '}
                    <button type="button" className="btn-enlace" onClick={() => onUsarNombre(respuesta.resultado.nombreCenso)}>
                      Usar ese nombre
                    </button>
                  </>
                )}
              </span>
            </p>
          ) : respuesta ? (
            <p className="identidad-linea identidad-linea--nota"><ShieldQuestion size={14} /><span>{respuesta.motivo}</span></p>
          ) : null}
          <button type="button" className="btn btn-secondary btn-sm" onClick={preguntar} disabled={preguntando}>
            {preguntando ? <Loader2 size={14} className="spin" /> : <BadgeCheck size={14} />}
            {preguntando ? 'Preguntando a la AEAT…' : 'Comprobar en la AEAT'}
          </button>
        </div>
      )}
    </div>
  );
}
