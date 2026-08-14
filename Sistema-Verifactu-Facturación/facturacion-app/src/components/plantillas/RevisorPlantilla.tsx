'use client';

/**
 * EDITOR DE PLANTILLA ESTILO CANVA
 *
 * Permite ajustar con precisión visual todos los elementos de la factura:
 *   1. Barra de herramientas flotante con controles rápidos (fuente, negrita,
 *      color, alineación, posición en mm).
 *   2. Modo Vista Previa con datos reales de muestra en vivo.
 *   3. Controles de Zoom (Ajustar, 100%, +, -) para trabajo al milímetro.
 *   4. Control independiente de tabla: cabecera transparente o con fondo,
 *      mostrar/ocultar títulos de columna, líneas entre filas y colores.
 *   5. Control por teclado (flechas para mover por 0.5mm/2mm, Supr para borrar).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, AlignCenter, AlignLeft, AlignRight, Bold,
  Check, Eraser, Eye, EyeOff, Info, Italic, Maximize2,
  MousePointerClick, Move, Pencil, Plus,
  Table2, Trash2, Type, ZoomIn, ZoomOut,
} from 'lucide-react';
import {
  camposPorGrupo, COLUMNAS_LINEAS, datosDeEjemplo, esColumnaPersonalizada,
  etiquetaDeClave, etiquetaDeColumnaPersonalizada, siguienteColumnaPersonalizada,
} from '@/lib/plantillas/contrato';
import type {
  AnalisisPdf, CampoDetectado, SegmentoTexto,
  TablaDetectada, ZonaBorrado,
} from '@/lib/plantillas/tipos';

interface Props {
  analisis: AnalisisPdf;
  onCambiarCampos: (campos: CampoDetectado[]) => void;
  onCambiarTabla: (tabla: TablaDetectada) => void;
  onCambiarZonas: (zonas: ZonaBorrado[]) => void;
}

type Seleccion =
  | { tipo: 'campo'; id: string }
  | { tipo: 'zona'; id: string }
  | { tipo: 'tabla' }
  | null;

type Arrastre =
  | { tipo: 'mover-campo'; id: string; x0: number; y0: number; rx: number; ry: number }
  | { tipo: 'tamano-campo'; id: string; a0: number; h0: number; rx: number; ry: number }
  | { tipo: 'mover-zona'; id: string; x0: number; y0: number; rx: number; ry: number }
  | { tipo: 'tamano-zona'; id: string; a0: number; h0: number; rx: number; ry: number }
  | { tipo: 'mover-tabla'; x0: number; y0: number; rx: number; ry: number }
  | { tipo: 'tamano-tabla'; a0: number; h0: number; rx: number; ry: number }
  | { tipo: 'columna'; indice: number; anchoIzq: number; xDer0: number; anchoDer: number; rx: number }
  | { tipo: 'dibujar'; modo: 'campo' | 'zona'; desdeX: number; desdeY: number; hastaX: number; hastaY: number };

function claseConfianza(confianza: number): string {
  if (confianza >= 0.8) return 'campo-caja--seguro';
  if (confianza >= 0.55) return 'campo-caja--probable';
  return 'campo-caja--dudoso';
}

const pct = (valor: number, total: number) => `${(valor / total) * 100}%`;

export default function RevisorPlantilla({
  analisis, onCambiarCampos, onCambiarTabla, onCambiarZonas,
}: Props) {
  const { pagina, tabla } = analisis;
  const lienzoRef = useRef<HTMLDivElement>(null);
  const siguienteId = useRef(1);

  const [seleccion, setSeleccion] = useState<Seleccion>(null);
  const [arrastre, setArrastre] = useState<Arrastre | null>(null);
  const [modoDibujo, setModoDibujo] = useState<'campo' | 'zona' | null>(null);
  const [filtro, setFiltro] = useState<'todos' | 'modificables' | 'fijos' | 'sin_asignar'>('todos');
  const [verFijos, setVerFijos] = useState(true);
  const [modoVistaPrevia, setModoVistaPrevia] = useState(false);
  const [zoom, setZoom] = useState(1);

  const campos = analisis.campos;
  const zonas = analisis.zonasExtra;
  const campoActivo = seleccion?.tipo === 'campo' ? campos.find(c => c.id === seleccion.id) ?? null : null;
  const zonaActiva = seleccion?.tipo === 'zona' ? zonas.find(z => z.id === seleccion.id) ?? null : null;

  const datosEjemplo = useMemo(() => datosDeEjemplo(), []);

  /** Milímetros por píxel de pantalla */
  const mmPorPx = useCallback(() => {
    const caja = lienzoRef.current?.getBoundingClientRect();
    if (!caja || caja.width === 0) return 0;
    return pagina.ancho / (caja.width / zoom);
  }, [pagina.ancho, zoom]);

  const actualizarCampo = (id: string, cambios: Partial<CampoDetectado>) => {
    onCambiarCampos(campos.map(c => (c.id === id ? { ...c, ...cambios } : c)));
  };
  const actualizarZona = (id: string, cambios: Partial<ZonaBorrado>) => {
    onCambiarZonas(zonas.map(z => (z.id === id ? { ...z, ...cambios } : z)));
  };

  const capturar = (evento: React.PointerEvent) => {
    lienzoRef.current?.setPointerCapture(evento.pointerId);
  };

  // ============================================================
  // TECLADO (Nudge por milímetros)
  // ============================================================
  useEffect(() => {
    const alPulsarTecla = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      if (!seleccion) return;
      const paso = e.shiftKey ? 2 : 0.5;

      if (e.key === 'Escape') {
        setSeleccion(null);
        setModoDibujo(null);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (seleccion.tipo === 'campo') {
          onCambiarCampos(campos.filter(c => c.id !== seleccion.id));
          setSeleccion(null);
        } else if (seleccion.tipo === 'zona') {
          onCambiarZonas(zonas.filter(z => z.id !== seleccion.id));
          setSeleccion(null);
        }
      } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const dx = e.key === 'ArrowLeft' ? -paso : e.key === 'ArrowRight' ? paso : 0;
        const dy = e.key === 'ArrowUp' ? -paso : e.key === 'ArrowDown' ? paso : 0;

        if (seleccion.tipo === 'campo' && campoActivo) {
          actualizarCampo(campoActivo.id, {
            x: acotar(campoActivo.x + dx, 0, pagina.ancho - campoActivo.ancho),
            y: acotar(campoActivo.y + dy, 0, pagina.alto - campoActivo.alto),
          });
        } else if (seleccion.tipo === 'zona' && zonaActiva) {
          actualizarZona(zonaActiva.id, {
            x: acotar(zonaActiva.x + dx, 0, pagina.ancho - zonaActiva.ancho),
            y: acotar(zonaActiva.y + dy, 0, pagina.alto - zonaActiva.alto),
          });
        } else if (seleccion.tipo === 'tabla' && tabla) {
          const nuevaX = acotar(tabla.x + dx, 0, pagina.ancho - tabla.ancho);
          const nuevaY = acotar(tabla.y + dy, 0, pagina.alto - tabla.altoTotal);
          const desp = nuevaX - tabla.x;
          onCambiarTabla({
            ...tabla,
            x: nuevaX,
            y: nuevaY,
            columnas: tabla.columnas.map(c => ({ ...c, x: c.x + desp })),
          });
        }
      }
    };

    window.addEventListener('keydown', alPulsarTecla);
    return () => window.removeEventListener('keydown', alPulsarTecla);
  }, [seleccion, campoActivo, zonaActiva, tabla, campos, zonas, pagina, onCambiarCampos, onCambiarZonas, onCambiarTabla]);

  // ============================================================
  // ARRASTRE
  // ============================================================

  const alMover = (evento: React.PointerEvent) => {
    if (!arrastre) return;
    const escala = mmPorPx();
    if (escala === 0) return;
    const caja = lienzoRef.current!.getBoundingClientRect();

    switch (arrastre.tipo) {
      case 'mover-campo': {
        const campo = campos.find(c => c.id === arrastre.id);
        if (!campo) return;
        actualizarCampo(arrastre.id, {
          x: acotar(arrastre.x0 + (evento.clientX - arrastre.rx) * escala, 0, pagina.ancho - campo.ancho),
          y: acotar(arrastre.y0 + (evento.clientY - arrastre.ry) * escala, 0, pagina.alto - campo.alto),
        });
        break;
      }
      case 'tamano-campo':
        actualizarCampo(arrastre.id, {
          ancho: Math.max(4, arrastre.a0 + (evento.clientX - arrastre.rx) * escala),
          alto: Math.max(2.5, arrastre.h0 + (evento.clientY - arrastre.ry) * escala),
        });
        break;
      case 'mover-zona': {
        const zona = zonas.find(z => z.id === arrastre.id);
        if (!zona) return;
        actualizarZona(arrastre.id, {
          x: acotar(arrastre.x0 + (evento.clientX - arrastre.rx) * escala, 0, pagina.ancho - zona.ancho),
          y: acotar(arrastre.y0 + (evento.clientY - arrastre.ry) * escala, 0, pagina.alto - zona.alto),
        });
        break;
      }
      case 'tamano-zona':
        actualizarZona(arrastre.id, {
          ancho: Math.max(2, arrastre.a0 + (evento.clientX - arrastre.rx) * escala),
          alto: Math.max(2, arrastre.h0 + (evento.clientY - arrastre.ry) * escala),
        });
        break;
      case 'mover-tabla': {
        if (!tabla) return;
        const nuevaX = acotar(arrastre.x0 + (evento.clientX - arrastre.rx) * escala, 0, pagina.ancho - tabla.ancho);
        const nuevaY = acotar(arrastre.y0 + (evento.clientY - arrastre.ry) * escala, 0, pagina.alto - tabla.altoTotal);
        const desplazamiento = nuevaX - tabla.x;
        onCambiarTabla({
          ...tabla,
          x: nuevaX,
          y: nuevaY,
          columnas: tabla.columnas.map(c => ({ ...c, x: c.x + desplazamiento })),
        });
        break;
      }
      case 'tamano-tabla': {
        if (!tabla) return;
        const anchoNuevo = Math.max(30, arrastre.a0 + (evento.clientX - arrastre.rx) * escala);
        const proporcion = anchoNuevo / Math.max(1, tabla.ancho);
        onCambiarTabla({
          ...tabla,
          ancho: anchoNuevo,
          altoTotal: Math.max(10, arrastre.h0 + (evento.clientY - arrastre.ry) * escala),
          columnas: tabla.columnas.map(c => ({
            ...c,
            x: tabla.x + (c.x - tabla.x) * proporcion,
            ancho: c.ancho * proporcion,
          })),
        });
        break;
      }
      case 'columna': {
        if (!tabla) return;
        const delta = (evento.clientX - arrastre.rx) * escala;
        const izquierda = arrastre.anchoIzq + delta;
        const derecha = arrastre.anchoDer - delta;
        if (izquierda < 6 || derecha < 6) return;
        onCambiarTabla({
          ...tabla,
          columnas: tabla.columnas.map((c, i) => {
            if (i === arrastre.indice) return { ...c, ancho: izquierda };
            if (i === arrastre.indice + 1) return { ...c, x: arrastre.xDer0 + delta, ancho: derecha };
            return c;
          }),
        });
        break;
      }
      case 'dibujar':
        setArrastre({
          ...arrastre,
          hastaX: (evento.clientX - caja.left) * escala,
          hastaY: (evento.clientY - caja.top) * escala,
        });
        break;
    }
  };

  const alSoltar = () => {
    if (arrastre?.tipo === 'dibujar') {
      const x = Math.min(arrastre.desdeX, arrastre.hastaX);
      const y = Math.min(arrastre.desdeY, arrastre.hastaY);
      const ancho = Math.abs(arrastre.hastaX - arrastre.desdeX);
      const alto = Math.abs(arrastre.hastaY - arrastre.desdeY);

      if (ancho >= 3 && alto >= 2) {
        if (arrastre.modo === 'zona') {
          const zona: ZonaBorrado = { id: `zona-${siguienteId.current++}`, x, y, ancho, alto };
          onCambiarZonas([...zonas, zona]);
          setSeleccion({ tipo: 'zona', id: zona.id });
        } else {
          const campo = campoNuevo(`manual-${siguienteId.current++}`, { x, y, ancho, alto }, analisis.familia === 'serif');
          onCambiarCampos([...campos, campo]);
          setSeleccion({ tipo: 'campo', id: campo.id });
        }
      }
      setModoDibujo(null);
    }
    setArrastre(null);
  };

  const alPulsarLienzo = (evento: React.PointerEvent) => {
    if (!modoDibujo) {
      setSeleccion(null);
      return;
    }
    const caja = lienzoRef.current!.getBoundingClientRect();
    const escala = mmPorPx();
    const x = (evento.clientX - caja.left) * escala;
    const y = (evento.clientY - caja.top) * escala;
    setArrastre({ tipo: 'dibujar', modo: modoDibujo, desdeX: x, desdeY: y, hastaX: x, hastaY: y });
    capturar(evento);
  };

  // ============================================================
  // TEXTOS IMPRESOS
  // ============================================================

  const textosFijos = useMemo(() => {
    const tapado = (s: SegmentoTexto) => {
      const cajas = [
        ...campos.map(c => ({ x: c.x, y: c.y, ancho: c.ancho, alto: c.alto })),
        ...zonas,
        ...(tabla ? [{ x: tabla.x, y: tabla.y, ancho: tabla.ancho, alto: tabla.altoTotal }] : []),
      ];
      return cajas.some(c =>
        c.x < s.x + s.ancho && c.x + c.ancho > s.x && c.y < s.y + s.alto && c.y + c.alto > s.y,
      );
    };
    return pagina.lineas.flatMap(l => l.segmentos).filter(s => !tapado(s));
  }, [pagina.lineas, campos, zonas, tabla]);

  const convertirEnCampo = (segmento: SegmentoTexto) => {
    const principal = segmento.items.reduce(
      (a, b) => (b.texto.length > a.texto.length ? b : a),
      segmento.items[0],
    );
    const campo: CampoDetectado = {
      ...campoNuevo(`manual-${siguienteId.current++}`, segmento, principal?.serif ?? false),
      valorOriginal: segmento.texto,
      tamano: principal?.tamano ?? 9,
      color: principal?.color ?? '#111111',
      negrita: principal?.negrita ?? false,
      cursiva: principal?.cursiva ?? false,
      motivo: 'Marcado como dato por ti',
    };
    onCambiarCampos([...campos, campo]);
    setSeleccion({ tipo: 'campo', id: campo.id });
  };

  // ============================================================
  // PINTADO
  // ============================================================

  const cajaDibujo = arrastre?.tipo === 'dibujar' ? arrastre : null;
  const asignadas = new Set(campos.map(c => c.clave).filter(Boolean) as string[]);
  const tablaSeleccionada = seleccion?.tipo === 'tabla';

  return (
    <div className="plantilla-revisor">
      {/* ---------- LIENZO ---------- */}
      <div className="plantilla-lienzo-envoltorio">
        {/* BARRA DE HERRAMIENTAS CANVA PRINCIPAL */}
        <div className="plantilla-lienzo-barra">
          <div className="plantilla-herramientas">
            <button
              type="button"
              className={`btn btn-sm ${modoDibujo === 'campo' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setModoDibujo(modoDibujo === 'campo' ? null : 'campo'); setSeleccion(null); }}
            >
              <Plus size={14} /> Añadir dato
            </button>
            <button
              type="button"
              className={`btn btn-sm ${modoDibujo === 'zona' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setModoDibujo(modoDibujo === 'zona' ? null : 'zona'); setSeleccion(null); }}
              title="Tapa cualquier resto del documento de muestra"
            >
              <Eraser size={14} /> Tapar zona
            </button>
            {tabla && (
              <button
                type="button"
                className={`btn btn-sm ${tablaSeleccionada ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => { setSeleccion(tablaSeleccionada ? null : { tipo: 'tabla' }); setModoDibujo(null); }}
              >
                <Table2 size={14} /> Tabla
              </button>
            )}
          </div>

          <div className="plantilla-toolbar-grupo">
            <button
              type="button"
              className={`plantilla-btn-toggle ${modoVistaPrevia ? 'plantilla-btn-toggle--activo' : ''}`}
              onClick={() => setModoVistaPrevia(!modoVistaPrevia)}
              title="Alternar entre ver las cajas de edición o los datos de muestra reales"
            >
              {modoVistaPrevia ? <EyeOff size={14} /> : <Eye size={14} />}
              {modoVistaPrevia ? 'Modo Cajas' : 'Vista Previa'}
            </button>
          </div>

          {/* CONTROLES DE ZOOM */}
          <div className="plantilla-toolbar-grupo">
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm"
              onClick={() => setZoom(z => Math.max(0.6, z - 0.15))}
              title="Reducir zoom"
            >
              <ZoomOut size={14} />
            </button>
            <span className="plantilla-zoom-badge">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm"
              onClick={() => setZoom(z => Math.min(2.2, z + 0.15))}
              title="Aumentar zoom"
            >
              <ZoomIn size={14} />
            </button>
            {zoom !== 1 && (
              <button
                type="button"
                className="btn btn-ghost btn-icon btn-sm"
                onClick={() => setZoom(1)}
                title="Restablecer zoom al 100%"
              >
                <Maximize2 size={14} />
              </button>
            )}
          </div>

          <span className="plantilla-leyenda">
            <i className="plantilla-punto plantilla-punto--seguro" /> Seguro
            <i className="plantilla-punto plantilla-punto--probable" /> Probable
            <i className="plantilla-punto plantilla-punto--dudoso" /> Por confirmar
          </span>
        </div>

        {/* BARRA DE PROPIEDADES CANVA RÁPIDAS SI HAY SELECCIÓN */}
        {campoActivo && (
          <div className="plantilla-toolbar-canva animate-fade-in">
            <div className="plantilla-toolbar-grupo">
              <select
                className="form-select form-select-sm"
                style={{ maxWidth: '160px' }}
                value={campoActivo.fijo ? '__fijo' : (campoActivo.clave ?? '')}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '__fijo') actualizarCampo(campoActivo.id, { fijo: true, clave: null });
                  else actualizarCampo(campoActivo.id, { fijo: false, clave: val || null });
                }}
              >
                <option value="">— Sin asignar —</option>
                <option value="__fijo">Texto fijo</option>
                {camposPorGrupo().map(g => (
                  <optgroup key={g.grupo} label={g.titulo}>
                    {g.campos.map(op => (
                      <option key={op.clave} value={op.clave}>
                        {op.etiqueta}{asignadas.has(op.clave) && op.clave !== campoActivo.clave ? ' (en uso)' : ''}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div className="plantilla-toolbar-grupo">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => actualizarCampo(campoActivo.id, { tamano: Math.max(4, campoActivo.tamano - 0.5) })}
              >
                -
              </button>
              <span style={{ fontSize: '11px', minWidth: '28px', textAlign: 'center', fontWeight: 600 }}>{campoActivo.tamano}pt</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => actualizarCampo(campoActivo.id, { tamano: Math.min(40, campoActivo.tamano + 0.5) })}
              >
                +
              </button>
            </div>

            <div className="plantilla-toolbar-grupo">
              <button
                type="button"
                className={`btn btn-ghost btn-icon btn-sm ${campoActivo.negrita ? 'btn-primary' : ''}`}
                onClick={() => actualizarCampo(campoActivo.id, { negrita: !campoActivo.negrita })}
                title="Negrita"
              >
                <Bold size={13} />
              </button>
              <button
                type="button"
                className={`btn btn-ghost btn-icon btn-sm ${campoActivo.cursiva ? 'btn-primary' : ''}`}
                onClick={() => actualizarCampo(campoActivo.id, { cursiva: !campoActivo.cursiva })}
                title="Cursiva"
              >
                <Italic size={13} />
              </button>
            </div>

            <div className="plantilla-toolbar-grupo">
              <button
                type="button"
                className={`btn btn-ghost btn-icon btn-sm ${campoActivo.alineacion === 'left' ? 'btn-primary' : ''}`}
                onClick={() => actualizarCampo(campoActivo.id, { alineacion: 'left' })}
              >
                <AlignLeft size={13} />
              </button>
              <button
                type="button"
                className={`btn btn-ghost btn-icon btn-sm ${campoActivo.alineacion === 'center' ? 'btn-primary' : ''}`}
                onClick={() => actualizarCampo(campoActivo.id, { alineacion: 'center' })}
              >
                <AlignCenter size={13} />
              </button>
              <button
                type="button"
                className={`btn btn-ghost btn-icon btn-sm ${campoActivo.alineacion === 'right' ? 'btn-primary' : ''}`}
                onClick={() => actualizarCampo(campoActivo.id, { alineacion: 'right' })}
              >
                <AlignRight size={13} />
              </button>
            </div>

            <div className="plantilla-toolbar-grupo">
              <input
                type="color"
                className="plantilla-color"
                style={{ width: '26px', height: '24px', borderRadius: '4px' }}
                value={campoActivo.color || '#111111'}
                onChange={(e) => actualizarCampo(campoActivo.id, { color: e.target.value })}
                title="Color del texto"
              />
            </div>

            <div className="plantilla-toolbar-grupo" style={{ marginLeft: 'auto' }}>
              <button
                type="button"
                className="btn btn-ghost btn-icon btn-sm text-danger"
                onClick={() => { onCambiarCampos(campos.filter(c => c.id !== campoActivo.id)); setSeleccion(null); }}
                title="Eliminar campo"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        )}

        {modoDibujo && (
          <p className="plantilla-pista-modo">
            {modoDibujo === 'campo'
              ? 'Dibuja un recuadro sobre la factura para colocar un nuevo dato.'
              : 'Dibuja un recuadro sobre lo que quieras borrar del diseño original.'}
          </p>
        )}

        {/* CONTAINER DEL LIENZO CON ZOOM */}
        <div style={{ overflow: 'auto', width: '100%', maxHeight: 'calc(100vh - 180px)' }}>
          <div
            ref={lienzoRef}
            className={`plantilla-lienzo ${modoDibujo ? 'plantilla-lienzo--dibujando' : ''}`}
            style={{
              aspectRatio: `${pagina.ancho} / ${pagina.alto}`,
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
              transition: 'transform 0.15s ease-out',
              width: zoom > 1 ? `${100 * zoom}%` : '100%',
            }}
            onPointerDown={alPulsarLienzo}
            onPointerMove={alMover}
            onPointerUp={alSoltar}
            onPointerCancel={alSoltar}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pagina.bitmap.dataUrl} alt="Factura subida" className="plantilla-lienzo-img" draggable={false} />

            {/* Capa 1 · zonas tapadas */}
            {zonas.map(zona => (
              <div
                key={zona.id}
                role="button"
                tabIndex={0}
                className={`zona-caja ${seleccion?.tipo === 'zona' && seleccion.id === zona.id ? 'zona-caja--activa' : ''}`}
                style={{
                  left: pct(zona.x, pagina.ancho), top: pct(zona.y, pagina.alto),
                  width: pct(zona.ancho, pagina.ancho), height: pct(zona.alto, pagina.alto),
                }}
                onPointerDown={(evento) => {
                  if (modoDibujo) return;
                  evento.stopPropagation();
                  setSeleccion({ tipo: 'zona', id: zona.id });
                  setArrastre({ tipo: 'mover-zona', id: zona.id, x0: zona.x, y0: zona.y, rx: evento.clientX, ry: evento.clientY });
                  capturar(evento);
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') setSeleccion({ tipo: 'zona', id: zona.id }); }}
                title="Zona tapada"
              >
                <span className="campo-caja-etiqueta">Tapado</span>
                {seleccion?.tipo === 'zona' && seleccion.id === zona.id && (
                  <span
                    className="campo-caja-tirador"
                    onPointerDown={(evento) => {
                      evento.stopPropagation();
                      setArrastre({ tipo: 'tamano-zona', id: zona.id, a0: zona.ancho, h0: zona.alto, rx: evento.clientX, ry: evento.clientY });
                      capturar(evento);
                    }}
                  />
                )}
              </div>
            ))}

            {/* Capa 2 · tabla */}
            {tabla && (
              <div
                role="button"
                tabIndex={0}
                className={`plantilla-tabla-marco ${tablaSeleccionada ? 'plantilla-tabla-marco--activa' : ''}`}
                style={{
                  left: pct(tabla.x, pagina.ancho), top: pct(tabla.y, pagina.alto),
                  width: pct(tabla.ancho, pagina.ancho), height: pct(tabla.altoTotal, pagina.alto),
                  background: tabla.estilo.cabeceraFondo && tabla.estilo.cabeceraFondo !== 'transparent'
                    ? tabla.estilo.cabeceraFondo
                    : 'transparent',
                }}
                onPointerDown={(evento) => {
                  if (modoDibujo) return;
                  evento.stopPropagation();
                  setSeleccion({ tipo: 'tabla' });
                  setArrastre({ tipo: 'mover-tabla', x0: tabla.x, y0: tabla.y, rx: evento.clientX, ry: evento.clientY });
                  capturar(evento);
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') setSeleccion({ tipo: 'tabla' }); }}
              >
                <span className="plantilla-tabla-etiqueta"><Move size={11} /> Líneas de la factura</span>

                {/* Franja de cabecera solo si no es transparente */}
                {tabla.estilo.mostrarCabecera !== false && tabla.estilo.cabeceraFondo && tabla.estilo.cabeceraFondo !== 'transparent' && (
                  <div
                    className="plantilla-tabla-cabecera"
                    style={{ height: pct(tabla.altoCabecera, tabla.altoTotal), background: tabla.estilo.cabeceraFondo }}
                  />
                )}

                {/* Separadores de columna */}
                {tabla.columnas.slice(0, -1).map((columna, indice) => (
                  <span
                    key={indice}
                    className={`plantilla-divisor ${tablaSeleccionada ? 'plantilla-divisor--visible' : ''}`}
                    style={{ left: pct(columna.x + columna.ancho - tabla.x, tabla.ancho) }}
                    onPointerDown={(evento) => {
                      evento.stopPropagation();
                      setSeleccion({ tipo: 'tabla' });
                      setArrastre({
                        tipo: 'columna',
                        indice,
                        anchoIzq: columna.ancho,
                        xDer0: tabla.columnas[indice + 1].x,
                        anchoDer: tabla.columnas[indice + 1].ancho,
                        rx: evento.clientX,
                      });
                      capturar(evento);
                    }}
                    title={`Ajustar el ancho de «${columna.cabecera || indice + 1}»`}
                  />
                ))}

                {tablaSeleccionada && (
                  <span
                    className="campo-caja-tirador"
                    onPointerDown={(evento) => {
                      evento.stopPropagation();
                      setArrastre({ tipo: 'tamano-tabla', a0: tabla.ancho, h0: tabla.altoTotal, rx: evento.clientX, ry: evento.clientY });
                      capturar(evento);
                    }}
                  />
                )}
              </div>
            )}

            {/* Capa 3 · campos */}
            {campos.map(campo => {
              const valorMuestra = campo.clave ? (datosEjemplo[campo.clave] ?? campo.valorOriginal) : campo.valorOriginal;

              return (
                <div
                  key={campo.id}
                  role="button"
                  tabIndex={0}
                  className={[
                    'campo-caja',
                    claseConfianza(campo.confianza),
                    seleccion?.tipo === 'campo' && seleccion.id === campo.id ? 'campo-caja--activa' : '',
                    campo.fijo ? 'campo-caja--fija' : '',
                    !campo.clave && !campo.fijo ? 'campo-caja--sin-asignar' : '',
                  ].filter(Boolean).join(' ')}
                  style={{
                    left: pct(campo.x, pagina.ancho), top: pct(campo.y, pagina.alto),
                    width: pct(campo.ancho, pagina.ancho), height: pct(campo.alto, pagina.alto),
                  }}
                  onPointerDown={(evento) => {
                    if (modoDibujo) return;
                    evento.stopPropagation();
                    setSeleccion({ tipo: 'campo', id: campo.id });
                    setArrastre({ tipo: 'mover-campo', id: campo.id, x0: campo.x, y0: campo.y, rx: evento.clientX, ry: evento.clientY });
                    capturar(evento);
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') setSeleccion({ tipo: 'campo', id: campo.id }); }}
                  title={campo.clave ? etiquetaDeClave(campo.clave) : 'Sin asignar'}
                >
                  {/* SI EL MODO VISTA PREVIA ESTÁ ACTIVO, MUESTRA EL TEXTO REAL EN LUGAR DE LA ETIQUETA */}
                  {modoVistaPrevia ? (
                    <div
                      className="plantilla-campo-preview-texto"
                      style={{
                        fontSize: `${Math.max(6, campo.tamano * 0.9)}px`,
                        color: campo.color || '#111111',
                        fontWeight: campo.negrita ? 700 : 400,
                        fontStyle: campo.cursiva ? 'italic' : 'normal',
                        justifyContent: campo.alineacion === 'right' ? 'flex-end' : campo.alineacion === 'center' ? 'center' : 'flex-start',
                      }}
                    >
                      {valorMuestra}
                    </div>
                  ) : (
                    <span className="campo-caja-etiqueta">
                      {campo.fijo ? 'Texto fijo' : campo.clave ? etiquetaDeClave(campo.clave) : '¿Qué es esto?'}
                    </span>
                  )}

                  {seleccion?.tipo === 'campo' && seleccion.id === campo.id && (
                    <span
                      className="campo-caja-tirador"
                      onPointerDown={(evento) => {
                        evento.stopPropagation();
                        setArrastre({ tipo: 'tamano-campo', id: campo.id, a0: campo.ancho, h0: campo.alto, rx: evento.clientX, ry: evento.clientY });
                        capturar(evento);
                      }}
                    />
                  )}
                </div>
              );
            })}

            {cajaDibujo && (
              <div
                className={cajaDibujo.modo === 'zona' ? 'zona-caja zona-caja--nueva' : 'campo-caja campo-caja--nueva'}
                style={{
                  left: pct(Math.min(cajaDibujo.desdeX, cajaDibujo.hastaX), pagina.ancho),
                  top: pct(Math.min(cajaDibujo.desdeY, cajaDibujo.hastaY), pagina.alto),
                  width: pct(Math.abs(cajaDibujo.hastaX - cajaDibujo.desdeX), pagina.ancho),
                  height: pct(Math.abs(cajaDibujo.hastaY - cajaDibujo.desdeY), pagina.alto),
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* ---------- PANEL ---------- */}
      <div className="plantilla-panel">
        {campoActivo && (
          <PanelCampo
            campo={campoActivo}
            asignadas={asignadas}
            onCambiar={(cambios) => actualizarCampo(campoActivo.id, cambios)}
            onEliminar={() => { onCambiarCampos(campos.filter(c => c.id !== campoActivo.id)); setSeleccion(null); }}
          />
        )}

        {zonaActiva && (
          <div className="card">
            <div className="card-header">
              <div>
                <h4 className="card-title">Zona tapada</h4>
                <p className="card-subtitle">Se borra del diseño original con el fondo del papel.</p>
              </div>
              <button
                className="btn btn-ghost btn-icon btn-sm"
                onClick={() => { onCambiarZonas(zonas.filter(z => z.id !== zonaActiva.id)); setSeleccion(null); }}
                title="Quitar la zona"
              >
                <Trash2 size={14} />
              </button>
            </div>
            <p className="plantilla-ayuda">
              Arrastra el recuadro para moverlo y el tirador de la esquina para estirarlo. Puedes usar las flechas del teclado para ajustar con precisión.
            </p>
          </div>
        )}

        {tablaSeleccionada && tabla && (
          <PanelTabla tabla={tabla} onCambiar={onCambiarTabla} />
        )}

        {!campoActivo && !zonaActiva && !tablaSeleccionada && (
          <div className="card plantilla-vacio">
            <Pencil size={18} />
            <div>
              <strong>Editor Canva de Plantillas</strong>
              <p>
                Haz clic en cualquier recuadro para ajustarlo, o usa la barra flotante de arriba. Puedes mover elementos con las flechas del teclado (Shift para saltos mayores) o activar la <strong>Vista Previa</strong> para ver los datos reales sobre tu factura.
              </p>
            </div>
          </div>
        )}

        {/* Columnas: qué dato va en cada una */}
        {tabla && (
          <div className="card">
            <div className="card-header">
              <div>
                <h4 className="card-title">Columnas de las líneas</h4>
                <p className="card-subtitle">Arrastra los separadores en la factura para repartir el ancho</p>
              </div>
            </div>
            <div className="plantilla-columnas">
              {tabla.columnas.map((columna, indice) => (
                <div key={indice} className="plantilla-columna">
                  <input
                    className="form-input plantilla-columna-cabecera"
                    value={columna.cabecera}
                    aria-label={`Título de la columna ${indice + 1}`}
                    onChange={(evento) => {
                      onCambiarTabla({
                        ...tabla,
                        columnas: tabla.columnas.map((c, i) => (i === indice ? { ...c, cabecera: evento.target.value } : c)),
                      });
                    }}
                  />
                  <select
                    className="form-select"
                    aria-label={`Contenido de la columna ${indice + 1}`}
                    value={columna.clave ?? ''}
                    onChange={(evento) => {
                      const elegido = evento.target.value;
                      if (elegido === '__nueva_personalizada__') {
                        const clave = siguienteColumnaPersonalizada(tabla.columnas.map(c => c.clave ?? ''));
                        onCambiarTabla({
                          ...tabla,
                          columnas: tabla.columnas.map((c, i) =>
                            i === indice ? { ...c, clave } : c),
                        });
                        return;
                      }
                      onCambiarTabla({
                        ...tabla,
                        columnas: tabla.columnas.map((c, i) => (i === indice ? { ...c, clave: elegido || null } : c)),
                      });
                    }}
                  >
                    <option value="">— Vacía —</option>
                    {COLUMNAS_LINEAS.map(opcion => (
                      <option key={opcion.clave} value={opcion.clave}>{opcion.etiqueta}</option>
                    ))}
                    {columna.clave && esColumnaPersonalizada(columna.clave) && (
                      <option value={columna.clave}>
                        {etiquetaDeColumnaPersonalizada(columna.clave)}
                      </option>
                    )}
                    <option value="__nueva_personalizada__">— Columna personalizada —</option>
                  </select>
                  <select
                    className="form-select"
                    aria-label={`Alineación de la columna ${indice + 1}`}
                    value={columna.alineacion}
                    onChange={(evento) => {
                      onCambiarTabla({
                        ...tabla,
                        columnas: tabla.columnas.map((c, i) =>
                          i === indice ? { ...c, alineacion: evento.target.value as typeof c.alineacion } : c),
                      });
                    }}
                  >
                    <option value="left">Izq.</option>
                    <option value="center">Centro</option>
                    <option value="right">Der.</option>
                  </select>
                  <button
                    className="btn btn-ghost btn-icon btn-sm"
                    title="Quitar la columna"
                    onClick={() => {
                      if (tabla.columnas.length <= 1) return;
                      const fuera = tabla.columnas[indice];
                      const restantes = tabla.columnas.filter((_, i) => i !== indice);
                      const vecina = restantes[Math.min(indice, restantes.length - 1)];
                      vecina.ancho += fuera.ancho;
                      if (indice < restantes.length) vecina.x = fuera.x;
                      onCambiarTabla({ ...tabla, columnas: recolocar(restantes, tabla.x) });
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
            <button
              className="btn btn-secondary btn-sm plantilla-anadir-columna"
              onClick={() => {
                const ultima = tabla.columnas[tabla.columnas.length - 1];
                const mitad = ultima.ancho / 2;
                ultima.ancho = mitad;
                const nueva = {
                  clave: null,
                  cabecera: 'Nueva',
                  x: ultima.x + mitad,
                  ancho: mitad,
                  alineacion: 'right' as const,
                };
                onCambiarTabla({ ...tabla, columnas: recolocar([...tabla.columnas, nueva], tabla.x) });
              }}
            >
              <Plus size={13} /> Añadir columna
            </button>
          </div>
        )}

        {/* Lista completa de todos los textos del PDF con filtros */}
        <div className="card">
          <div className="card-header" style={{ paddingBottom: '8px' }}>
            <div>
              <h4 className="card-title">Textos detectados en el PDF</h4>
              <p className="card-subtitle">
                {campos.length + textosFijos.length} elementos encontrados. Haz clic para seleccionarlos o cambiar su tipo.
              </p>
            </div>
          </div>

          {/* Selector de filtros */}
          <div style={{ display: 'flex', gap: '4px', padding: '0 16px 12px', borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`btn btn-xs ${filtro === 'todos' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFiltro('todos')}
            >
              Todos ({campos.length + textosFijos.length})
            </button>
            <button
              type="button"
              className={`btn btn-xs ${filtro === 'modificables' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFiltro('modificables')}
            >
              Modificables ({campos.filter(c => !c.fijo && c.clave).length})
            </button>
            <button
              type="button"
              className={`btn btn-xs ${filtro === 'sin_asignar' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFiltro('sin_asignar')}
            >
              Sin asignar ({campos.filter(c => !c.fijo && !c.clave).length})
            </button>
            <button
              type="button"
              className={`btn btn-xs ${filtro === 'fijos' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFiltro('fijos')}
            >
              Fijos ({campos.filter(c => c.fijo).length + textosFijos.length})
            </button>
          </div>

          <ul className="plantilla-fijos" style={{ maxHeight: '300px', overflowY: 'auto', margin: 0, padding: '8px 12px' }}>
            {/* Campos activos (modificables y fijos convertidos) */}
            {campos
              .filter(c => {
                if (filtro === 'modificables') return !c.fijo && Boolean(c.clave);
                if (filtro === 'sin_asignar') return !c.fijo && !c.clave;
                if (filtro === 'fijos') return c.fijo;
                return true;
              })
              .map((c) => {
                const esActivo = seleccion?.tipo === 'campo' && seleccion.id === c.id;
                return (
                  <li
                    key={c.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      background: esActivo ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                      border: esActivo ? '1px solid var(--accent-500)' : '1px solid transparent',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                    onClick={() => setSeleccion({ tipo: 'campo', id: c.id })}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {c.valorOriginal ? `«${c.valorOriginal}»` : '(campo vacío)'}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'flex', gap: '6px', alignItems: 'center' }}>
                        {c.fijo ? (
                          <span style={{ color: 'var(--text-muted)' }}>🔒 Fijo</span>
                        ) : c.clave ? (
                          <span style={{ color: 'var(--accent-500)', fontWeight: 600 }}>✓ {etiquetaDeClave(c.clave)}</span>
                        ) : (
                          <span style={{ color: 'var(--warning-500)', fontWeight: 600 }}>⚠ Sin asignar</span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      className={`btn btn-xs ${c.fijo ? 'btn-secondary' : 'btn-ghost'}`}
                      style={{ fontSize: '11px', padding: '2px 8px' }}
                      title={c.fijo ? 'Convertir en dato de factura modificable' : 'Marcar como texto fijo del diseño'}
                      onClick={(e) => {
                        e.stopPropagation();
                        actualizarCampo(c.id, { fijo: !c.fijo, clave: c.fijo ? (c.clave || null) : null });
                      }}
                    >
                      {c.fijo ? 'Hacer modificable' : 'Hacer fijo'}
                    </button>
                  </li>
                );
              })}

            {/* Textos fijos del diseño aún no convertidos (se muestran en 'todos' y 'fijos') */}
            {(filtro === 'todos' || filtro === 'fijos') &&
              textosFijos.map((segmento, idx) => (
                <li
                  key={`seg-${idx}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    padding: '6px 8px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    opacity: 0.85,
                  }}
                  onClick={() => convertirEnCampo(segmento)}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      «{segmento.texto}»
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      🔒 Rótulo del diseño
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-xs btn-secondary"
                    style={{ fontSize: '11px', padding: '2px 8px' }}
                    title="Convertir este rótulo en un dato editable de factura"
                    onClick={(e) => {
                      e.stopPropagation();
                      convertirEnCampo(segmento);
                    }}
                  >
                    Hacer modificable
                  </button>
                </li>
              ))}

            {campos.length === 0 && textosFijos.length === 0 && (
              <li className="plantilla-fijos-vacio">No hay textos en esta categoría.</li>
            )}
          </ul>
        </div>

        {analisis.avisos.length > 0 && (
          <div className="plantilla-avisos">
            {analisis.avisos.map((aviso, indice) => (
              <div key={indice} className={`callout callout-${aviso.nivel === 'error' ? 'danger' : aviso.nivel === 'aviso' ? 'warning' : 'info'}`}>
                {aviso.nivel === 'info' ? <Info size={16} /> : <AlertTriangle size={16} />}
                <div><p>{aviso.texto}</p></div>
              </div>
            ))}
          </div>
        )}

        <div className="plantilla-resumen">
          <Check size={14} />
          {campos.filter(c => !c.fijo && c.clave).length} datos modificables asignados
          {campos.some(c => !c.clave && !c.fijo) && (
            <span className="plantilla-resumen-pendiente">
              · {campos.filter(c => !c.clave && !c.fijo).length} sin asignar
            </span>
          )}
          <span>· {campos.filter(c => c.fijo).length} fijos</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// PANELES DE PROPIEDADES DETALLADAS
// ============================================================

function PanelCampo({ campo, asignadas, onCambiar, onEliminar }: {
  campo: CampoDetectado;
  asignadas: Set<string>;
  onCambiar: (cambios: Partial<CampoDetectado>) => void;
  onEliminar: () => void;
}) {
  const descripcion = camposPorGrupo().flatMap(g => g.campos).find(c => c.clave === campo.clave)?.descripcion;

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h4 className="card-title">Elemento seleccionado</h4>
          <p className="card-subtitle">
            {campo.valorOriginal ? `«${campo.valorOriginal}»` : 'Campo personalizado'}
          </p>
        </div>
        <button className="btn btn-ghost btn-icon btn-sm text-danger" onClick={onEliminar} title="Eliminar campo">
          <Trash2 size={14} />
        </button>
      </div>

      {/* TOGGLE PRINCIPAL: MODIFICABLE VS FIJO */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '14px' }}>
        <button
          type="button"
          className={`btn btn-sm ${!campo.fijo ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => onCambiar({ fijo: false })}
          style={{ justifyContent: 'center' }}
        >
          <Check size={14} /> Dato Modificable
        </button>
        <button
          type="button"
          className={`btn btn-sm ${campo.fijo ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => onCambiar({ fijo: true, clave: null })}
          style={{ justifyContent: 'center' }}
        >
          🔒 Texto Fijo (Diseño)
        </button>
      </div>

      {campo.fijo ? (
        <div className="callout callout-info" style={{ marginBottom: '12px' }}>
          <div>
            <strong>Texto fijo del diseño</strong>
            <p style={{ fontSize: '11px', marginTop: '2px' }}>
              Se conservará exactamente como está impreso en tu PDF original y no se modificará con los datos de las facturas emitidas.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="form-group">
            <label className="form-label" htmlFor="campo-clave">¿Qué dato de factura va aquí?</label>
            <select
              id="campo-clave"
              className="form-select"
              value={campo.clave ?? ''}
              onChange={(evento) => {
                const valor = evento.target.value;
                onCambiar({ fijo: false, clave: valor || null });
              }}
            >
              <option value="">— Sin asignar (saldrá en blanco) —</option>
              {camposPorGrupo().map(grupo => (
                <optgroup key={grupo.grupo} label={grupo.titulo}>
                  {grupo.campos.map(opcion => (
                    <option
                      key={opcion.clave}
                      value={opcion.clave}
                    >
                      {opcion.etiqueta}{asignadas.has(opcion.clave) && opcion.clave !== campo.clave ? ' (en uso)' : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {descripcion && <p className="plantilla-ayuda">{descripcion}</p>}
        </>
      )}

      <div className="plantilla-motivo">
        <MousePointerClick size={13} />
        <span>{campo.motivo}</span>
      </div>

      <div className="plantilla-estilo">
        <label className="form-label" htmlFor="campo-tamano">Tamaño (pt)</label>
        <input
          id="campo-tamano" className="form-input" type="number" min={4} max={40} step={0.5}
          value={campo.tamano}
          onChange={(e) => onCambiar({ tamano: Number(e.target.value) || 9 })}
        />
        <label className="form-label" htmlFor="campo-alineacion">Alineación</label>
        <select
          id="campo-alineacion" className="form-select" value={campo.alineacion}
          onChange={(e) => onCambiar({ alineacion: e.target.value as CampoDetectado['alineacion'] })}
        >
          <option value="left">Izquierda</option>
          <option value="center">Centro</option>
          <option value="right">Derecha</option>
        </select>
        <label className="form-label" htmlFor="campo-color">Color</label>
        <input
          id="campo-color" className="form-input plantilla-color" type="color"
          value={campo.color || '#111111'}
          onChange={(e) => onCambiar({ color: e.target.value })}
        />
        <label className="form-label" htmlFor="campo-negrita">Negrita</label>
        <input
          id="campo-negrita" type="checkbox" checked={campo.negrita}
          onChange={(e) => onCambiar({ negrita: e.target.checked })}
        />
      </div>

      {/* POSICIÓN EXACTA EN MM */}
      <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
        <p className="card-subtitle" style={{ marginBottom: '8px', fontWeight: 600 }}>Posición y Tamaño (mm)</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '6px' }}>
          <div>
            <label className="form-label" style={{ fontSize: '10px' }}>X (mm)</label>
            <input
              type="number" className="form-input form-input-sm" step={0.5}
              value={Math.round(campo.x * 10) / 10}
              onChange={(e) => onCambiar({ x: Number(e.target.value) || 0 })}
            />
          </div>
          <div>
            <label className="form-label" style={{ fontSize: '10px' }}>Y (mm)</label>
            <input
              type="number" className="form-input form-input-sm" step={0.5}
              value={Math.round(campo.y * 10) / 10}
              onChange={(e) => onCambiar({ y: Number(e.target.value) || 0 })}
            />
          </div>
          <div>
            <label className="form-label" style={{ fontSize: '10px' }}>Ancho</label>
            <input
              type="number" className="form-input form-input-sm" step={0.5}
              value={Math.round(campo.ancho * 10) / 10}
              onChange={(e) => onCambiar({ ancho: Number(e.target.value) || 5 })}
            />
          </div>
          <div>
            <label className="form-label" style={{ fontSize: '10px' }}>Alto</label>
            <input
              type="number" className="form-input form-input-sm" step={0.5}
              value={Math.round(campo.alto * 10) / 10}
              onChange={(e) => onCambiar({ alto: Number(e.target.value) || 3 })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function PanelTabla({ tabla, onCambiar }: { tabla: TablaDetectada; onCambiar: (t: TablaDetectada) => void }) {
  const estilo = tabla.estilo;
  const cambiarEstilo = (cambios: Partial<typeof estilo>) => onCambiar({ ...tabla, estilo: { ...estilo, ...cambios } });

  const esFondoTransparente = !estilo.cabeceraFondo || estilo.cabeceraFondo === 'transparent' || estilo.cabeceraFondo === '#ffffff';
  const mostrarCab = estilo.mostrarCabecera !== false;

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h4 className="card-title">Tabla de líneas de factura</h4>
          <p className="card-subtitle">Arrástrala en la factura para moverla o ajusta sus colores</p>
        </div>
      </div>

      <div className="plantilla-estilo">
        {/* FONDO CABECERA TRANSPARENTE O COLOR */}
        <label className="form-label">Fondo cabecera</label>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button
            type="button"
            className={`plantilla-btn-transparente ${esFondoTransparente ? 'plantilla-btn-transparente--activo' : ''}`}
            onClick={() => cambiarEstilo({ cabeceraFondo: 'transparent' })}
          >
            Transparente
          </button>
          <input
            type="color"
            className="plantilla-color"
            style={{ width: '28px', height: '24px' }}
            value={normalizarColor(estilo.cabeceraFondo)}
            onChange={(e) => cambiarEstilo({ cabeceraFondo: e.target.value })}
            title="Seleccionar color personalizado"
          />
        </div>

        {/* MOSTRAR U OCULTAR CABECERA */}
        <label className="form-label" htmlFor="tabla-mostrar-cab">Títulos de columna</label>
        <input
          id="tabla-mostrar-cab"
          type="checkbox"
          checked={mostrarCab}
          onChange={(e) => cambiarEstilo({ mostrarCabecera: e.target.checked })}
        />

        <label className="form-label" htmlFor="tabla-texto-cab">Texto cabecera</label>
        <input
          id="tabla-texto-cab" className="form-input plantilla-color" type="color"
          value={normalizarColor(estilo.cabeceraTexto)}
          onChange={(e) => cambiarEstilo({ cabeceraTexto: e.target.value })}
        />
        <label className="form-label" htmlFor="tabla-texto-cuerpo">Texto líneas</label>
        <input
          id="tabla-texto-cuerpo" className="form-input plantilla-color" type="color"
          value={normalizarColor(estilo.cuerpoTexto)}
          onChange={(e) => cambiarEstilo({ cuerpoTexto: e.target.value })}
        />
        <label className="form-label" htmlFor="tabla-borde">Color de líneas</label>
        <input
          id="tabla-borde" className="form-input plantilla-color" type="color"
          value={normalizarColor(estilo.bordeColor)}
          onChange={(e) => cambiarEstilo({ bordeColor: e.target.value })}
        />
        <label className="form-label" htmlFor="tabla-tam-cab">Letra cabecera</label>
        <input
          id="tabla-tam-cab" className="form-input" type="number" min={5} max={20} step={0.5}
          value={estilo.tamanoCabecera}
          onChange={(e) => cambiarEstilo({ tamanoCabecera: Number(e.target.value) || 9 })}
        />
        <label className="form-label" htmlFor="tabla-tam-cuerpo">Letra líneas</label>
        <input
          id="tabla-tam-cuerpo" className="form-input" type="number" min={5} max={20} step={0.5}
          value={estilo.tamanoCuerpo}
          onChange={(e) => cambiarEstilo({ tamanoCuerpo: Number(e.target.value) || 9 })}
        />
        <label className="form-label" htmlFor="tabla-alto">Alto de fila</label>
        <input
          id="tabla-alto" className="form-input" type="number" min={0} max={8} step={0.2}
          value={estilo.relleno[0]}
          onChange={(e) => {
            const v = Number(e.target.value) || 0;
            cambiarEstilo({ relleno: [v, estilo.relleno[1], v, estilo.relleno[3]] });
          }}
        />
        <label className="form-label" htmlFor="tabla-lineas">Rayas entre filas</label>
        <input
          id="tabla-lineas" type="checkbox" checked={estilo.bordeFilas > 0}
          onChange={(e) => cambiarEstilo({ bordeFilas: e.target.checked ? 0.1 : 0 })}
        />
        <label className="form-label" htmlFor="tabla-marco">Marco exterior</label>
        <input
          id="tabla-marco" type="checkbox" checked={estilo.bordeAncho > 0}
          onChange={(e) => cambiarEstilo({ bordeAncho: e.target.checked ? 0.2 : 0 })}
        />
        <label className="form-label" htmlFor="tabla-zebra">Filas alternas</label>
        <input
          id="tabla-zebra" type="checkbox" checked={Boolean(estilo.filaAlterna) && estilo.filaAlterna !== 'transparent'}
          onChange={(e) => cambiarEstilo({ filaAlterna: e.target.checked ? '#f4f4f5' : 'transparent' })}
        />
      </div>
    </div>
  );
}

// ============================================================
// AYUDAS
// ============================================================

function acotar(valor: number, minimo: number, maximo: number): number {
  return Math.max(minimo, Math.min(maximo, valor));
}

function normalizarColor(color: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : '#ffffff';
}

function recolocar<T extends { x: number; ancho: number }>(columnas: T[], inicio: number): T[] {
  let cursor = inicio;
  return columnas.map(columna => {
    const colocada = { ...columna, x: cursor };
    cursor += columna.ancho;
    return colocada;
  });
}

function campoNuevo(
  id: string,
  caja: { x: number; y: number; ancho: number; alto: number },
  serif: boolean,
): CampoDetectado {
  return {
    id,
    clave: null,
    tipo: 'texto',
    fijo: false,
    manual: true,
    valorOriginal: '',
    etiquetaCercana: '',
    x: caja.x,
    y: caja.y,
    ancho: caja.ancho,
    alto: caja.alto,
    tamano: 9,
    alineacion: 'left',
    color: '#111111',
    negrita: false,
    cursiva: false,
    serif,
    interlineado: 1.15,
    confianza: 1,
    motivo: 'Añadido a mano',
  };
}
