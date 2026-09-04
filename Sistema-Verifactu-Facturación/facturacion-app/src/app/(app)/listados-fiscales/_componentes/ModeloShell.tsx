'use client';

/**
 * El armazón que comparten las pantallas de modelo.
 *
 * Cada modelo tiene su ruta y su contenido —el encargo pedía
 * explícitamente que no fuera una pantalla gigante con todo mezclado—,
 * pero la cabecera, los selectores de período, el semáforo de estado, la
 * lista de errores y la barra de acciones son iguales en los siete. Que
 * lo sean es parte del diseño: quien aprende a usar el 303 ya sabe usar
 * el 420.
 */

import Link from 'next/link';
import { ReactNode } from 'react';
import {
  ArrowLeft, AlertTriangle, ChevronRight, ShieldCheck, RefreshCw, Eye, Download, History,
} from 'lucide-react';
import type { DefinicionModelo, ResultadoValidacion, Trimestre } from '@/lib/fiscal/tipos';

export interface ModeloShellProps {
  modelo: DefinicionModelo;
  ejercicio: number;
  ejercicios: number[];
  onEjercicio: (e: number) => void;
  trimestre?: Trimestre;
  onTrimestre?: (t: Trimestre) => void;
  validacion: ResultadoValidacion | null;
  onRecalcular: () => void;
  onVistaPrevia: () => void;
  /** Sin esto, el botón de generar no aparece: el modelo no tiene fichero. */
  onGenerar?: () => void;
  etiquetaGenerar?: string;
  onHistorial?: () => void;
  children: ReactNode;
}

export default function ModeloShell({
  modelo, ejercicio, ejercicios, onEjercicio, trimestre, onTrimestre,
  validacion, onRecalcular, onVistaPrevia, onGenerar, etiquetaGenerar, onHistorial,
  children,
}: ModeloShellProps) {
  const criticos = validacion?.errores ?? [];
  const avisos = validacion?.avisos ?? [];
  const puede = criticos.length === 0;

  return (
    <div className="page">
      <Link href="/listados-fiscales" className="lf-volver">
        <ArrowLeft size={16} /> Listados fiscales
      </Link>

      <header className="page-header">
        <div>
          <h1 className="page-title">{modelo.nombre}</h1>
          <p className="page-subtitle">{modelo.descripcion}</p>
        </div>
        <div className="lf-periodo">
          <label className="lf-ejercicio">
            Ejercicio
            <select value={ejercicio} onChange={e => onEjercicio(Number(e.target.value))}>
              {ejercicios.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          {modelo.periodicidad === 'trimestral' && onTrimestre && (
            <label className="lf-ejercicio">
              Periodo
              <select value={trimestre ?? 1} onChange={e => onTrimestre(Number(e.target.value) as Trimestre)}>
                {[1, 2, 3, 4].map(t => <option key={t} value={t}>{t}T</option>)}
              </select>
            </label>
          )}
        </div>
      </header>

      <div className="lf-estado">
        <span className="lf-estado-ok"><ShieldCheck size={15} /> Datos calculados</span>
        {puede ? (
          <span className="lf-estado-ok"><ShieldCheck size={15} /> Validación correcta</span>
        ) : (
          <span className="lf-estado-mal">
            <AlertTriangle size={15} /> {criticos.length} {criticos.length === 1 ? 'error' : 'errores'}
          </span>
        )}
        {avisos.length > 0 && (
          <span className="lf-estado-aviso">
            <AlertTriangle size={15} /> {avisos.length} {avisos.length === 1 ? 'aviso' : 'avisos'}
          </span>
        )}
        <div className="lf-acciones">
          <button className="btn" onClick={onRecalcular}>
            <RefreshCw size={15} /> Recalcular
          </button>
          <button className="btn" onClick={onVistaPrevia}>
            <Eye size={15} /> Vista previa
          </button>
          {onHistorial && (
            <button className="btn" onClick={onHistorial}>
              <History size={15} /> Historial
            </button>
          )}
          {onGenerar && (
            <button
              className="btn btn-primary"
              onClick={onGenerar}
              disabled={!puede}
              title={puede ? undefined : 'Corrige los errores antes de generar'}
            >
              <Download size={15} /> {etiquetaGenerar || 'Generar'}
            </button>
          )}
        </div>
      </div>

      {/* Los modelos sin diseño de registro público lo dicen aquí, para
          que nadie busque un botón de generar que no existe. */}
      {modelo.via === 'sede_o_programa' && (
        <div className="lf-aviso">
          <AlertTriangle size={16} />
          <p>
            Este modelo <strong>no tiene fichero de presentación público</strong>: se presenta en la
            Sede de {modelo.organismo === 'AEAT' ? 'la Agencia Tributaria' : 'la Agencia Tributaria Canaria'}
            {' '}o con su programa de ayuda. Aquí se calcula, se valida y se exportan los datos para
            que copies las casillas. <a href={modelo.fuenteOficial} target="_blank" rel="noopener noreferrer">
              Ver el trámite oficial
            </a>.
          </p>
        </div>
      )}

      {(criticos.length > 0 || avisos.length > 0) && (
        <div className="lf-errores">
          {criticos.map((e, i) => (
            <p key={`c${i}`} className="lf-error lf-error--critico">
              <AlertTriangle size={14} />
              <span>{e.mensaje}</span>
              {e.referencia?.tipo === 'empresa' && (
                <Link href="/ajustes">Ir a Ajustes <ChevronRight size={13} /></Link>
              )}
              {e.referencia?.tipo === 'cliente' && (
                <Link href={`/clientes?buscar=${encodeURIComponent(e.referencia.id)}`}>
                  Ver ficha <ChevronRight size={13} />
                </Link>
              )}
              {e.referencia?.tipo === 'gasto' && (
                <Link href="/gastos">Ver gastos <ChevronRight size={13} /></Link>
              )}
            </p>
          ))}
          {avisos.map((a, i) => (
            <p key={`a${i}`} className="lf-error lf-error--aviso">
              <AlertTriangle size={14} /><span>{a.mensaje}</span>
            </p>
          ))}
        </div>
      )}

      {children}
    </div>
  );
}

/** Rejilla de cifras del resumen, igual en todos los modelos. */
export function Resumen({ datos }: { datos: { etiqueta: string; valor: ReactNode }[] }) {
  return (
    <div className="lf-resumen">
      {datos.map(d => (
        <div key={d.etiqueta}>
          <span>{d.etiqueta}</span>
          <strong>{d.valor}</strong>
        </div>
      ))}
    </div>
  );
}

/** Tabla de casillas para los modelos que se copian a mano en la Sede. */
export function TablaCasillas({
  filas,
}: {
  filas: { casilla: string; concepto: string; importe: number | null }[];
}) {
  return (
    <div className="table-container">
      <table className="table">
        <thead>
          <tr><th>Casilla</th><th>Concepto</th><th className="num">Importe</th></tr>
        </thead>
        <tbody>
          {filas.map(f => (
            <tr key={f.casilla}>
              <td className="mono">[{f.casilla}]</td>
              <td>{f.concepto}</td>
              <td className="num">
                {f.importe === null
                  ? <em>pendiente</em>
                  : f.importe.toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' €'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Descarga un texto como fichero, con la codificación que pida el modelo. */
export function descargarTexto(contenido: string, nombre: string, latin1 = false) {
  let blob: Blob;
  if (latin1) {
    // Los diseños de la AEAT exigen ISO-8859-1: se escribe byte a byte
    // para que el navegador no lo codifique en UTF-8 por su cuenta.
    const bytes = new Uint8Array(contenido.length);
    for (let i = 0; i < contenido.length; i++) bytes[i] = contenido.charCodeAt(i) & 0xff;
    blob = new Blob([bytes], { type: 'text/plain;charset=iso-8859-1' });
  } else {
    // El CSV lleva BOM para que Excel en español no destroce los acentos.
    blob = new Blob(['﻿' + contenido], { type: 'text/csv;charset=utf-8' });
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}
