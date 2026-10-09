'use client';

/**
 * LOS AJUSTES FINOS DE UN ELEMENTO
 *
 * Tres piezas que el panel del elemento seleccionado monta según lo que sea:
 *
 *   · `FormatoDelDato`: cómo se escribe el dato (fecha larga, importe sin
 *     «€», mayúsculas, prefijo…). Lo que en Crystal Reports es «Dar formato
 *     al campo».
 *   · `AjusteDelTexto`: qué hace el texto dentro de su caja (encoger o
 *     partirse, arriba o abajo, espacio entre letras).
 *   · `InsertarDato`: mete un `{dato}` en un rótulo escrito a mano.
 *
 * Todo enseña al lado cómo va a salir, con un dato de ejemplo, para que no
 * haya que imprimir para saberlo.
 */

import { useMemo } from 'react';
import { camposPorGrupo, datosDeEjemplo } from '@/lib/plantillas/contrato';
import {
  claseDe, FORMATOS_FECHA, limpiarPresentacion, presentar,
  type FormatoFecha, type Letras, type Presentacion, type Simbolo,
} from '@/lib/plantillas/presentacion';
import { MARCADORES_PAGINA, marcadoresDesconocidos, textoDeMuestra } from '@/lib/plantillas/textoConDatos';
import type { CampoDetectado } from '@/lib/plantillas/tipos';

// ------------------------------------------------------------------
// Formato del dato
// ------------------------------------------------------------------

export interface FormatoDelDatoProps {
  readonly clave: string;
  readonly presentacion: Presentacion | undefined;
  readonly onCambiar: (presentacion: Presentacion | undefined) => void;
}

export function FormatoDelDato({ clave, presentacion, onCambiar }: FormatoDelDatoProps) {
  const ejemplo = useMemo(() => datosDeEjemplo()[clave] ?? '', [clave]);
  const clase = claseDe(ejemplo);
  const p = presentacion ?? {};
  const cambiar = (cambios: Partial<Presentacion>) => onCambiar(limpiarPresentacion({ ...p, ...cambios }));
  const resultado = presentar(ejemplo, p);

  return (
    <div className="plantilla-formato">
      <div className="plantilla-formato-cabecera">
        <span className="form-label">Formato del dato</span>
        {presentacion && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onCambiar(undefined)}>Quitar formato</button>
        )}
      </div>

      <div className="plantilla-estilo plantilla-estilo--sin-borde">
        {clase === 'fecha' && (
          <>
            <label className="form-label" htmlFor="fmt-fecha">Fecha</label>
            <select id="fmt-fecha" className="form-select form-select-sm" value={p.fecha ?? ''}
              onChange={(e) => cambiar({ fecha: (e.target.value || undefined) as FormatoFecha | undefined })}>
              <option value="">Como viene (05/10/2026)</option>
              {FORMATOS_FECHA.map(f => <option key={f.valor} value={f.valor}>{f.ejemplo}</option>)}
            </select>
          </>
        )}

        {(clase === 'importe' || clase === 'numero') && (
          <>
            <label className="form-label" htmlFor="fmt-decimales">Decimales</label>
            <select id="fmt-decimales" className="form-select form-select-sm" value={p.decimales ?? ''}
              onChange={(e) => cambiar({ decimales: e.target.value === '' ? undefined : Number(e.target.value) })}>
              <option value="">Como viene</option>
              {[0, 1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
            </select>

            {clase === 'importe' && (
              <>
                <label className="form-label" htmlFor="fmt-simbolo">Moneda</label>
                <select id="fmt-simbolo" className="form-select form-select-sm" value={p.simbolo ?? 'tal'}
                  onChange={(e) => cambiar({ simbolo: e.target.value as Simbolo })}>
                  <option value="tal">1.234,56 €</option>
                  <option value="eur">1.234,56 EUR</option>
                  <option value="sin">1.234,56 (sin símbolo)</option>
                </select>
              </>
            )}

            <label className="form-label" htmlFor="fmt-miles">Punto de miles</label>
            <input id="fmt-miles" type="checkbox" checked={p.miles ?? true}
              onChange={(e) => cambiar({ miles: e.target.checked ? undefined : false })} />

            <label className="form-label" htmlFor="fmt-parentesis">Negativos entre paréntesis</label>
            <input id="fmt-parentesis" type="checkbox" checked={Boolean(p.negativoParentesis)}
              onChange={(e) => cambiar({ negativoParentesis: e.target.checked || undefined })} />

            <label className="form-label" htmlFor="fmt-cero">No imprimir si es cero</label>
            <input id="fmt-cero" type="checkbox" checked={Boolean(p.ocultarSiCero)}
              onChange={(e) => cambiar({ ocultarSiCero: e.target.checked || undefined })} />
          </>
        )}

        <label className="form-label" htmlFor="fmt-letras">Letras</label>
        <select id="fmt-letras" className="form-select form-select-sm" value={p.letras ?? 'tal'}
          onChange={(e) => cambiar({ letras: e.target.value as Letras })}>
          <option value="tal">Como vienen</option>
          <option value="mayusculas">MAYÚSCULAS</option>
          <option value="minusculas">minúsculas</option>
          <option value="titulo">Cada Palabra Con Mayúscula</option>
        </select>

        <label className="form-label" htmlFor="fmt-prefijo">Delante</label>
        <input id="fmt-prefijo" className="form-input form-input-sm" value={p.prefijo ?? ''} placeholder="p. ej. Tel. "
          onChange={(e) => cambiar({ prefijo: e.target.value })} />

        <label className="form-label" htmlFor="fmt-sufijo">Detrás</label>
        <input id="fmt-sufijo" className="form-input form-input-sm" value={p.sufijo ?? ''}
          onChange={(e) => cambiar({ sufijo: e.target.value })} />

        <label className="form-label" htmlFor="fmt-vacio">Si está vacío</label>
        <input id="fmt-vacio" className="form-input form-input-sm" value={p.siVacio ?? ''} placeholder="No imprimir nada"
          onChange={(e) => cambiar({ siVacio: e.target.value })} />
      </div>

      <p className="plantilla-formato-muestra">
        <span>Así saldrá:</span>
        <strong>{resultado || <em>(nada)</em>}</strong>
      </p>
      <p className="plantilla-ayuda">«Delante» y «Detrás» sólo se imprimen cuando hay dato.</p>
    </div>
  );
}

// ------------------------------------------------------------------
// Ajuste del texto en su caja
// ------------------------------------------------------------------

export interface AjusteDelTextoProps {
  readonly campo: Pick<CampoDetectado, 'ajuste' | 'alineacionVertical' | 'interletraje'>;
  readonly onCambiar: (cambios: Partial<CampoDetectado>) => void;
}

export function AjusteDelTexto({ campo, onCambiar }: AjusteDelTextoProps) {
  return (
    <div className="plantilla-estilo">
      <label className="form-label" htmlFor="campo-ajuste">Si no cabe</label>
      <select id="campo-ajuste" className="form-select form-select-sm" value={campo.ajuste ?? 'auto'}
        onChange={(e) => onCambiar({ ajuste: e.target.value === 'auto' ? undefined : e.target.value as CampoDetectado['ajuste'] })}>
        <option value="auto">Automático</option>
        <option value="reducir">Reducir la letra</option>
        <option value="varias">Varias líneas</option>
      </select>

      <label className="form-label" htmlFor="campo-vertical">Vertical</label>
      <select id="campo-vertical" className="form-select form-select-sm" value={campo.alineacionVertical ?? 'top'}
        onChange={(e) => onCambiar({ alineacionVertical: e.target.value === 'top' ? undefined : e.target.value as CampoDetectado['alineacionVertical'] })}>
        <option value="top">Arriba</option>
        <option value="middle">Centro</option>
        <option value="bottom">Abajo</option>
      </select>

      <label className="form-label" htmlFor="campo-interletraje">Entre letras (pt)</label>
      <input id="campo-interletraje" className="form-input form-input-sm" type="number" min={-1} max={10} step={0.1}
        value={campo.interletraje ?? 0}
        onChange={(e) => {
          const n = Number(e.target.value);
          onCambiar({ interletraje: Number.isFinite(n) && n !== 0 ? Math.round(n * 10) / 10 : undefined });
        }} />
    </div>
  );
}

// ------------------------------------------------------------------
// Datos dentro de un rótulo
// ------------------------------------------------------------------

export interface InsertarDatoProps {
  readonly texto: string;
  readonly onInsertar: (marcador: string) => void;
}

export function InsertarDato({ texto, onInsertar }: InsertarDatoProps) {
  const desconocidos = marcadoresDesconocidos(texto);
  const muestra = textoDeMuestra(texto);

  return (
    <div className="plantilla-insertar-dato">
      <select
        className="form-select form-select-sm"
        aria-label="Insertar un dato en el rótulo"
        value=""
        onChange={(e) => { if (e.target.value) onInsertar(`{${e.target.value}}`); }}
      >
        <option value="">+ Insertar un dato…</option>
        <optgroup label="Paginación">
          {Object.entries(MARCADORES_PAGINA).map(([clave, m]) => <option key={clave} value={clave}>{m.etiqueta}</option>)}
        </optgroup>
        {camposPorGrupo().map(grupo => (
          <optgroup key={grupo.grupo} label={grupo.titulo}>
            {grupo.campos.filter(c => c.tipo === 'texto').map(c => <option key={c.clave} value={c.clave}>{c.etiqueta}</option>)}
          </optgroup>
        ))}
      </select>
      {texto.includes('{') && (
        <p className="plantilla-formato-muestra">
          <span>Así saldrá:</span>
          <strong>{muestra}</strong>
        </p>
      )}
      {desconocidos.length > 0 && (
        <p className="plantilla-ayuda text-danger">
          {desconocidos.map(d => `{${d}}`).join(', ')} no es ningún dato y no se imprimirá. Usa «Insertar un dato».
        </p>
      )}
    </div>
  );
}
