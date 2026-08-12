'use client';

/**
 * REVISOR DE LA PLANTILLA DETECTADA
 *
 * Enseña la factura subida con un recuadro encima de cada dato que el
 * sistema ha reconocido, y deja corregir lo que haga falta: cambiar a qué
 * corresponde un campo, moverlo, marcarlo como texto fijo o añadir uno que
 * faltaba.
 *
 * Esta pantalla es la que hace que el resultado sea fiable con cualquier
 * factura. La detección automática acierta la mayor parte, pero ningún
 * método acierta el 100 % de los diseños posibles; en lugar de fingir que sí
 * y colar un error en las facturas de un cliente, se enseña lo que se ha
 * entendido y se deja confirmarlo en medio minuto.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Check, Crosshair, Info, MousePointerClick,
  Pencil, Plus, Table2, Trash2, Type,
} from 'lucide-react';
import {
  camposPorGrupo, COLUMNAS_LINEAS, etiquetaDeClave,
} from '@/lib/plantillas/contrato';
import type {
  AnalisisPdf, CampoDetectado, SegmentoTexto, TablaDetectada,
} from '@/lib/plantillas/tipos';

interface Props {
  analisis: AnalisisPdf;
  onCambiarCampos: (campos: CampoDetectado[]) => void;
  onCambiarTabla: (tabla: TablaDetectada) => void;
}

type Arrastre =
  | { tipo: 'mover'; id: string; xInicial: number; yInicial: number; ratonX: number; ratonY: number }
  | { tipo: 'tamano'; id: string; anchoInicial: number; altoInicial: number; ratonX: number; ratonY: number }
  | { tipo: 'dibujar'; desdeX: number; desdeY: number; hastaX: number; hastaY: number };

function claseConfianza(confianza: number): string {
  if (confianza >= 0.8) return 'campo-caja--seguro';
  if (confianza >= 0.55) return 'campo-caja--probable';
  return 'campo-caja--dudoso';
}

export default function RevisorPlantilla({ analisis, onCambiarCampos, onCambiarTabla }: Props) {
  const { pagina, tabla } = analisis;
  const lienzoRef = useRef<HTMLDivElement>(null);
  // Contador propio para los campos que se añaden a mano. Un reloj daría
  // ids repetidos si se crean dos campos en el mismo milisegundo, y además
  // React exige que el renderizado sea reproducible.
  const siguienteId = useRef(1);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [arrastre, setArrastre] = useState<Arrastre | null>(null);
  const [dibujando, setDibujando] = useState(false);
  const [verFijos, setVerFijos] = useState(false);

  const campos = analisis.campos;
  const campoActivo = campos.find(c => c.id === seleccionado) ?? null;

  /** Milímetros por píxel de pantalla, para traducir el arrastre del ratón. */
  const mmPorPx = useCallback(() => {
    const caja = lienzoRef.current?.getBoundingClientRect();
    if (!caja || caja.width === 0) return 0;
    return pagina.ancho / caja.width;
  }, [pagina.ancho]);

  const actualizar = (id: string, cambios: Partial<CampoDetectado>) => {
    onCambiarCampos(campos.map(c => (c.id === id ? { ...c, ...cambios } : c)));
  };

  const eliminar = (id: string) => {
    onCambiarCampos(campos.filter(c => c.id !== id));
    setSeleccionado(null);
  };

  // --- Arrastre ---------------------------------------------------------

  const alMoverPuntero = (evento: React.PointerEvent) => {
    if (!arrastre) return;
    const escala = mmPorPx();
    if (escala === 0) return;

    if (arrastre.tipo === 'mover') {
      const dx = (evento.clientX - arrastre.ratonX) * escala;
      const dy = (evento.clientY - arrastre.ratonY) * escala;
      const campo = campos.find(c => c.id === arrastre.id);
      if (!campo) return;
      actualizar(arrastre.id, {
        x: Math.max(0, Math.min(pagina.ancho - campo.ancho, arrastre.xInicial + dx)),
        y: Math.max(0, Math.min(pagina.alto - campo.alto, arrastre.yInicial + dy)),
      });
    } else if (arrastre.tipo === 'tamano') {
      const dx = (evento.clientX - arrastre.ratonX) * escala;
      const dy = (evento.clientY - arrastre.ratonY) * escala;
      actualizar(arrastre.id, {
        ancho: Math.max(4, arrastre.anchoInicial + dx),
        alto: Math.max(2.5, arrastre.altoInicial + dy),
      });
    } else {
      const caja = lienzoRef.current!.getBoundingClientRect();
      setArrastre({
        ...arrastre,
        hastaX: (evento.clientX - caja.left) * escala,
        hastaY: (evento.clientY - caja.top) * escala,
      });
    }
  };

  const alSoltarPuntero = () => {
    if (arrastre?.tipo === 'dibujar') {
      const x = Math.min(arrastre.desdeX, arrastre.hastaX);
      const y = Math.min(arrastre.desdeY, arrastre.hastaY);
      const ancho = Math.abs(arrastre.hastaX - arrastre.desdeX);
      const alto = Math.abs(arrastre.hastaY - arrastre.desdeY);
      // Un clic suelto no crea un campo invisible de medio milímetro.
      if (ancho >= 4 && alto >= 2.5) {
        const nuevo: CampoDetectado = {
          id: `manual-${siguienteId.current++}`,
          clave: null,
          tipo: 'texto',
          fijo: false,
          manual: true,
          valorOriginal: '',
          etiquetaCercana: '',
          x, y, ancho, alto,
          tamano: 9,
          alineacion: 'left',
          color: '#111111',
          negrita: false,
          cursiva: false,
          serif: analisis.familia === 'serif',
          interlineado: 1.15,
          confianza: 1,
          motivo: 'Añadido a mano',
        };
        onCambiarCampos([...campos, nuevo]);
        setSeleccionado(nuevo.id);
      }
      setDibujando(false);
    }
    setArrastre(null);
  };

  const empezarDibujo = (evento: React.PointerEvent) => {
    if (!dibujando) return;
    const caja = lienzoRef.current!.getBoundingClientRect();
    const escala = mmPorPx();
    const x = (evento.clientX - caja.left) * escala;
    const y = (evento.clientY - caja.top) * escala;
    setArrastre({ tipo: 'dibujar', desdeX: x, desdeY: y, hastaX: x, hastaY: y });
    (evento.target as HTMLElement).setPointerCapture?.(evento.pointerId);
  };

  // --- Textos que se quedan impresos en el fondo -------------------------

  const textosFijos = useMemo(() => {
    const dentroDeTabla = (s: SegmentoTexto) =>
      tabla !== null &&
      s.y + s.alto > tabla.y && s.y < tabla.y + tabla.altoTotal &&
      s.x + s.ancho > tabla.x && s.x < tabla.x + tabla.ancho;

    const ocupado = (s: SegmentoTexto) =>
      campos.some(c =>
        c.x < s.x + s.ancho && c.x + c.ancho > s.x &&
        c.y < s.y + s.alto && c.y + c.alto > s.y,
      );

    return pagina.lineas
      .flatMap(l => l.segmentos)
      .filter(s => !dentroDeTabla(s) && !ocupado(s));
  }, [pagina.lineas, campos, tabla]);

  const convertirEnCampo = (segmento: SegmentoTexto) => {
    const principal = segmento.items.reduce(
      (a, b) => (b.texto.length > a.texto.length ? b : a),
      segmento.items[0],
    );
    const nuevo: CampoDetectado = {
      id: `manual-${siguienteId.current++}`,
      clave: null,
      tipo: 'texto',
      fijo: false,
      manual: true,
      valorOriginal: segmento.texto,
      etiquetaCercana: '',
      x: segmento.x,
      y: segmento.y,
      ancho: segmento.ancho,
      alto: segmento.alto,
      tamano: principal?.tamano ?? 9,
      alineacion: 'left',
      color: principal?.color ?? '#111111',
      negrita: principal?.negrita ?? false,
      cursiva: principal?.cursiva ?? false,
      serif: principal?.serif ?? false,
      interlineado: 1.15,
      confianza: 1,
      motivo: 'Marcado como dato por ti',
    };
    onCambiarCampos([...campos, nuevo]);
    setSeleccionado(nuevo.id);
  };

  // --- Pintado ----------------------------------------------------------

  const porcentaje = (valor: number, total: number) => `${(valor / total) * 100}%`;

  const cajaDibujo = arrastre?.tipo === 'dibujar' ? arrastre : null;
  const asignadas = new Set(campos.map(c => c.clave).filter(Boolean) as string[]);

  return (
    <div className="plantilla-revisor">
      {/* --- Lienzo --- */}
      <div className="plantilla-lienzo-envoltorio">
        <div className="plantilla-lienzo-barra">
          <button
            type="button"
            className={`btn btn-sm ${dibujando ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setDibujando(!dibujando); setSeleccionado(null); }}
          >
            {dibujando ? <Crosshair size={14} /> : <Plus size={14} />}
            {dibujando ? 'Dibuja el recuadro sobre la factura' : 'Añadir campo'}
          </button>
          <span className="plantilla-leyenda">
            <i className="plantilla-punto plantilla-punto--seguro" /> Seguro
            <i className="plantilla-punto plantilla-punto--probable" /> Probable
            <i className="plantilla-punto plantilla-punto--dudoso" /> Por confirmar
          </span>
        </div>

        <div
          ref={lienzoRef}
          className={`plantilla-lienzo ${dibujando ? 'plantilla-lienzo--dibujando' : ''}`}
          style={{ aspectRatio: `${pagina.ancho} / ${pagina.alto}` }}
          onPointerDown={empezarDibujo}
          onPointerMove={alMoverPuntero}
          onPointerUp={alSoltarPuntero}
          onPointerCancel={alSoltarPuntero}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pagina.bitmap.dataUrl} alt="Factura subida" className="plantilla-lienzo-img" draggable={false} />

          {tabla && (
            <div
              className="plantilla-tabla-marco"
              style={{
                left: porcentaje(tabla.x, pagina.ancho),
                top: porcentaje(tabla.y, pagina.alto),
                width: porcentaje(tabla.ancho, pagina.ancho),
                height: porcentaje(tabla.altoTotal, pagina.alto),
              }}
            >
              <span className="plantilla-tabla-etiqueta"><Table2 size={11} /> Líneas de la factura</span>
            </div>
          )}

          {campos.map(campo => (
            <div
              key={campo.id}
              role="button"
              tabIndex={0}
              className={`campo-caja ${claseConfianza(campo.confianza)} ${campo.id === seleccionado ? 'campo-caja--activa' : ''} ${campo.fijo ? 'campo-caja--fija' : ''} ${!campo.clave && !campo.fijo ? 'campo-caja--sin-asignar' : ''}`}
              style={{
                left: porcentaje(campo.x, pagina.ancho),
                top: porcentaje(campo.y, pagina.alto),
                width: porcentaje(campo.ancho, pagina.ancho),
                height: porcentaje(campo.alto, pagina.alto),
              }}
              onPointerDown={(evento) => {
                if (dibujando) return;
                evento.stopPropagation();
                setSeleccionado(campo.id);
                setArrastre({
                  tipo: 'mover',
                  id: campo.id,
                  xInicial: campo.x,
                  yInicial: campo.y,
                  ratonX: evento.clientX,
                  ratonY: evento.clientY,
                });
                (evento.currentTarget as HTMLElement).setPointerCapture(evento.pointerId);
              }}
              onKeyDown={(evento) => {
                if (evento.key === 'Enter' || evento.key === ' ') setSeleccionado(campo.id);
              }}
              title={campo.clave ? etiquetaDeClave(campo.clave) : 'Sin asignar'}
            >
              <span className="campo-caja-etiqueta">
                {campo.fijo ? 'Texto fijo' : campo.clave ? etiquetaDeClave(campo.clave) : '¿Qué es esto?'}
              </span>
              {campo.id === seleccionado && (
                <span
                  className="campo-caja-tirador"
                  onPointerDown={(evento) => {
                    evento.stopPropagation();
                    setArrastre({
                      tipo: 'tamano',
                      id: campo.id,
                      anchoInicial: campo.ancho,
                      altoInicial: campo.alto,
                      ratonX: evento.clientX,
                      ratonY: evento.clientY,
                    });
                    (evento.currentTarget as HTMLElement).setPointerCapture(evento.pointerId);
                  }}
                />
              )}
            </div>
          ))}

          {cajaDibujo && (
            <div
              className="campo-caja campo-caja--nueva"
              style={{
                left: porcentaje(Math.min(cajaDibujo.desdeX, cajaDibujo.hastaX), pagina.ancho),
                top: porcentaje(Math.min(cajaDibujo.desdeY, cajaDibujo.hastaY), pagina.alto),
                width: porcentaje(Math.abs(cajaDibujo.hastaX - cajaDibujo.desdeX), pagina.ancho),
                height: porcentaje(Math.abs(cajaDibujo.hastaY - cajaDibujo.desdeY), pagina.alto),
              }}
            />
          )}
        </div>
      </div>

      {/* --- Panel lateral --- */}
      <div className="plantilla-panel">
        {campoActivo ? (
          <div className="card">
            <div className="card-header">
              <div>
                <h4 className="card-title">Campo seleccionado</h4>
                <p className="card-subtitle">
                  {campoActivo.valorOriginal ? `«${campoActivo.valorOriginal}»` : 'Campo nuevo'}
                </p>
              </div>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => eliminar(campoActivo.id)} title="Quitar campo">
                <Trash2 size={14} />
              </button>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="campo-clave">¿Qué dato va aquí?</label>
              <select
                id="campo-clave"
                className="form-select"
                value={campoActivo.fijo ? '__fijo' : (campoActivo.clave ?? '')}
                onChange={(evento) => {
                  const valor = evento.target.value;
                  if (valor === '__fijo') actualizar(campoActivo.id, { fijo: true, clave: null });
                  else actualizar(campoActivo.id, { fijo: false, clave: valor || null });
                }}
              >
                <option value="">— Sin asignar (saldrá en blanco) —</option>
                <option value="__fijo">Texto fijo: dejarlo tal cual está impreso</option>
                {camposPorGrupo().map(grupo => (
                  <optgroup key={grupo.grupo} label={grupo.titulo}>
                    {grupo.campos.map(campo => (
                      <option
                        key={campo.clave}
                        value={campo.clave}
                        disabled={asignadas.has(campo.clave) && campo.clave !== campoActivo.clave}
                      >
                        {campo.etiqueta}
                        {asignadas.has(campo.clave) && campo.clave !== campoActivo.clave ? ' (ya usado)' : ''}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {campoActivo.clave && (
              <p className="plantilla-ayuda">
                {camposPorGrupo()
                  .flatMap(g => g.campos)
                  .find(c => c.clave === campoActivo.clave)?.descripcion}
              </p>
            )}

            <div className="plantilla-motivo">
              <MousePointerClick size={13} />
              <span>{campoActivo.motivo}</span>
            </div>

            <div className="plantilla-estilo">
              <label className="form-label" htmlFor="campo-tamano">Tamaño de letra</label>
              <input
                id="campo-tamano"
                className="form-input"
                type="number"
                min={4}
                max={40}
                step={0.5}
                value={campoActivo.tamano}
                onChange={(evento) => actualizar(campoActivo.id, { tamano: Number(evento.target.value) || 9 })}
              />
              <label className="form-label" htmlFor="campo-alineacion">Alineación</label>
              <select
                id="campo-alineacion"
                className="form-select"
                value={campoActivo.alineacion}
                onChange={(evento) => actualizar(campoActivo.id, { alineacion: evento.target.value as CampoDetectado['alineacion'] })}
              >
                <option value="left">Izquierda</option>
                <option value="center">Centro</option>
                <option value="right">Derecha</option>
              </select>
            </div>
          </div>
        ) : (
          <div className="card plantilla-vacio">
            <Pencil size={18} />
            <div>
              <strong>Toca un recuadro de la factura</strong>
              <p>Cada recuadro es un dato que se rellenará solo en cada factura. Si alguno está mal, cámbialo aquí.</p>
            </div>
          </div>
        )}

        {/* Columnas de la tabla */}
        {tabla && (
          <div className="card">
            <div className="card-header">
              <div>
                <h4 className="card-title">Columnas de las líneas</h4>
                <p className="card-subtitle">Qué se imprime en cada columna de la tabla</p>
              </div>
            </div>
            <div className="plantilla-columnas">
              {tabla.columnas.map((columna, indice) => (
                <div key={indice} className="plantilla-columna">
                  <span className="plantilla-columna-cabecera">{columna.cabecera || `Columna ${indice + 1}`}</span>
                  <select
                    className="form-select"
                    aria-label={`Contenido de la columna ${columna.cabecera || indice + 1}`}
                    value={columna.clave ?? ''}
                    onChange={(evento) => {
                      const nuevas = tabla.columnas.map((c, i) =>
                        i === indice ? { ...c, clave: evento.target.value || null } : c,
                      );
                      onCambiarTabla({ ...tabla, columnas: nuevas });
                    }}
                  >
                    <option value="">— Columna vacía —</option>
                    {COLUMNAS_LINEAS.map(opcion => (
                      <option key={opcion.clave} value={opcion.clave}>{opcion.etiqueta}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Textos que se quedan impresos */}
        <div className="card">
          <button className="plantilla-desplegable" onClick={() => setVerFijos(!verFijos)} type="button">
            <span>
              <Type size={14} /> Textos que se imprimirán siempre igual
              <strong>{textosFijos.length}</strong>
            </span>
            <span className="plantilla-desplegable-pista">{verFijos ? 'Ocultar' : 'Ver'}</span>
          </button>
          {verFijos && (
            <>
              <p className="plantilla-ayuda">
                Son el diseño de tu factura: rótulos, membrete y pie. Se conservan tal cual.
                Si alguno es un dato que cambia en cada factura, márcalo.
              </p>
              <ul className="plantilla-fijos">
                {textosFijos.map((segmento, indice) => (
                  <li key={indice}>
                    <span>{segmento.texto}</span>
                    <button className="btn btn-ghost btn-sm" onClick={() => convertirEnCampo(segmento)} type="button">
                      Es un dato
                    </button>
                  </li>
                ))}
                {textosFijos.length === 0 && <li className="plantilla-fijos-vacio">No queda ningún texto suelto.</li>}
              </ul>
            </>
          )}
        </div>

        {/* Avisos */}
        {analisis.avisos.length > 0 && (
          <div className="plantilla-avisos">
            {analisis.avisos.map((aviso, indice) => (
              <div key={indice} className={`callout callout-${aviso.nivel === 'error' ? 'danger' : aviso.nivel === 'aviso' ? 'warning' : 'info'}`}>
                {aviso.nivel === 'info' ? <Info size={16} /> : aviso.nivel === 'error' ? <AlertTriangle size={16} /> : <AlertTriangle size={16} />}
                <div><p>{aviso.texto}</p></div>
              </div>
            ))}
          </div>
        )}

        <div className="plantilla-resumen">
          <Check size={14} />
          {campos.filter(c => c.clave).length} campos asignados
          {campos.some(c => !c.clave && !c.fijo) && (
            <span className="plantilla-resumen-pendiente">
              · {campos.filter(c => !c.clave && !c.fijo).length} sin asignar
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
