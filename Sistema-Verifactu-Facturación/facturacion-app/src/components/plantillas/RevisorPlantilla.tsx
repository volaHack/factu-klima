'use client';

/**
 * EDITOR DE DISEÑO DE FACTURAS
 *
 * El usuario ve su propia factura y trabaja encima de ella. Cada recuadro es
 * un dato que se rellenará solo; todo lo demás es el diseño, que se conserva
 * calcado del PDF original.
 *
 * Las decisiones que dan forma a este editor:
 *
 *   · UNA SOLA UNIDAD. Todo se mide en milímetros de papel. La conversión a
 *     píxeles de pantalla se hace en un único sitio (`pxPorMm`), medido sobre
 *     el lienzo de verdad. Por eso el zoom no descuadra los arrastres ni los
 *     tamaños de letra: no hay dos escalas que puedan discrepar.
 *
 *   · SE PUEDE DESHACER. Un editor sin deshacer no es un editor. Cada gesto
 *     —un arrastre entero, no cada píxel— deja una entrada en el historial.
 *
 *   · LA TABLA SE VE. No es un rectángulo con rayas: se pinta con sus
 *     cabeceras, sus colores y filas de muestra, para que lo que se ve al
 *     editar sea lo que sale impreso.
 *
 *   · LOS IMANES EXPLICAN. Al mover una caja se pega a lo que hay alrededor y
 *     se dibuja la línea por la que se ha pegado, para que el usuario entienda
 *     el salto en vez de pelearse con él.
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, AlignCenter, AlignEndHorizontal, AlignHorizontalJustifyCenter,
  AlignLeft, AlignRight, AlignStartHorizontal, AlignVerticalJustifyCenter,
  Bold, Check, Copy, Eraser, Eye, EyeOff, GripVertical, Image as ImageIcon,
  Info, Italic, Layers, Lock, Maximize2, Move, Plus, Redo2, Search, Sparkles,
  Rows3,
  CalendarClock,
  QrCode,
  Table2, Tag, Trash2, Type, Undo2, Unlock, ZoomIn, ZoomOut,
} from 'lucide-react';
import {
  campoPorClave, camposPorGrupo, COLUMNAS_LINEAS, columnaDeTotal, datosDeEjemplo,
  COLUMNAS_IMPUESTOS, COLUMNAS_VENCIMIENTOS, esColumnaPersonalizada, etiquetaDeClave, etiquetaDeColumnaPersonalizada, totalDeColumna,
  siguienteColumnaPersonalizada,
} from '@/lib/plantillas/contrato';
import { describirParaIa, fusionarSugerencias } from '@/lib/plantillas/ia';
import {
  acotar, acotarCajaQr, alinear, anadirColumna, bloqueDeCampoQr, calcularImanes, campoNuevo,
  distribuir, duplicarCampo, ejemploDeColumna, escalarColumnas, esCampoQr, igualarColumnas,
  intersecan, moverColumna, ordenDeLectura, quitarColumna, recolocarColumnas,
  hacerSitio, redimensionarColumna, redimensionarColumnaRejilla, redondearMm, rejillaNueva,
  type Caja, type Guia, type ModoAlinear,
} from '@/lib/plantillas/editor';
import type {
  AnalisisPdf, CampoDetectado, ColumnaRejilla, RejillaDetectada, SegmentoTexto,
  TablaDetectada, ZonaBorrado,
} from '@/lib/plantillas/tipos';

/** Cambios que el editor puede pedir sobre el análisis. */
export type CambioAnalisis = Partial<Pick<AnalisisPdf, 'campos' | 'tabla' | 'zonasExtra' | 'rejillas'>>;

interface Props {
  analisis: AnalisisPdf;
  onCambiar: (cambios: CambioAnalisis) => void;
}

// ============================================================
// TIPOS INTERNOS
// ============================================================

/** Identificador estable de cualquier cosa que se pueda seleccionar. */
type Ref = string; // `campo:ID` | `zona:ID` | `rejilla:ID` | `tabla`

/** Las herramientas de dibujo de la barra. */
type ModoDibujo = 'campo' | 'rotulo' | 'zona' | 'rejilla' | 'pagos' | null;

type Direccion = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

type Arrastre =
  | { tipo: 'mover'; px: number; py: number; principal: Ref; origen: Map<Ref, Caja> }
  | { tipo: 'redimensionar'; px: number; py: number; dir: Direccion; ref: Ref; caja: Caja }
  | { tipo: 'columna-ancho'; px: number; indice: number; anchoIzquierda: number }
  | { tipo: 'rejilla-ancho'; px: number; rejillaId: string; indice: number; anchoIzquierda: number }
  | { tipo: 'columna-orden'; desde: number; sobre: number }
  | { tipo: 'dibujar'; modo: 'campo' | 'rotulo' | 'zona' | 'rejilla' | 'pagos' | 'seleccion'; x0: number; y0: number; x1: number; y1: number };

interface Instantanea {
  campos: CampoDetectado[];
  tabla: TablaDetectada | null;
  zonasExtra: ZonaBorrado[];
}

const DIRECCIONES: Direccion[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** Distancia a la que un imán agarra, en píxeles de pantalla. */
const IMAN_PX = 7;

/** Cuántos pasos atrás guarda el historial. */
const PROFUNDIDAD_HISTORIAL = 80;

const pct = (valor: number, total: number) => `${(valor / total) * 100}%`;

function claseConfianza(confianza: number): string {
  if (confianza >= 0.8) return 'campo-caja--seguro';
  if (confianza >= 0.55) return 'campo-caja--probable';
  return 'campo-caja--dudoso';
}

function clonar<T>(valor: T): T {
  return JSON.parse(JSON.stringify(valor)) as T;
}

// ============================================================
// COMPONENTE
// ============================================================

export default function RevisorPlantilla({ analisis, onCambiar }: Props) {
  const { pagina } = analisis;
  const campos = analisis.campos;
  const zonas = analisis.zonasExtra;
  const tabla = analisis.tabla;
  const rejillas = analisis.rejillas;

  /**
   * El nombre de un campo tal y como se le enseña al usuario.
   *
   * Los recuentos de columnas propias del impreso no tienen nombre fijo: se lo
   * da la cabecera de su columna. Sin esto la casilla de las cajas de un
   * albarán de reparto salía como «total_col_1» —el nombre interno— justo al
   * lado de «Total de unidades», y no había forma de saber cuál era cuál.
   */
  const nombreDe = useCallback((clave: string): string => {
    const columna = columnaDeTotal(clave);
    const cabecera = columna
      ? tabla?.columnas.find(c => c.clave === columna)?.cabecera
      : undefined;
    return etiquetaDeClave(clave, cabecera);
  }, [tabla]);

  const lienzoRef = useRef<HTMLDivElement>(null);
  const siguienteId = useRef(1);
  const portapapeles = useRef<CampoDetectado[]>([]);

  const [seleccion, setSeleccion] = useState<Ref[]>([]);
  const [arrastre, setArrastre] = useState<Arrastre | null>(null);
  const [guias, setGuias] = useState<Guia[]>([]);
  const [modoDibujo, setModoDibujo] = useState<ModoDibujo>(null);
  const [zoom, setZoom] = useState(1);
  const [pxPorMm, setPxPorMm] = useState(0);
  const [vistaPrevia, setVistaPrevia] = useState(false);
  const [estadoIa, setEstadoIa] = useState<{ cargando: boolean; aviso: string | null }>({ cargando: false, aviso: null });
  const [verEtiquetas, setVerEtiquetas] = useState(true);
  const [filtro, setFiltro] = useState<'todos' | 'modificables' | 'fijos' | 'sin_asignar'>('todos');
  const [busqueda, setBusqueda] = useState('');

  const datosEjemplo = useMemo(() => datosDeEjemplo(), []);

  // ------------------------------------------------------------
  // HISTORIAL
  // ------------------------------------------------------------

  const [historial, setHistorial] = useState<{ pasado: Instantanea[]; futuro: Instantanea[] }>(
    { pasado: [], futuro: [] },
  );

  /** Foto del estado actual. Los manejadores la toman del cierre del render. */
  const instantanea = useCallback(
    (): Instantanea => clonar({ campos, tabla, zonasExtra: zonas }),
    [campos, tabla, zonas],
  );

  /**
   * Deja constancia del estado ANTES de un cambio. Se llama una vez por gesto
   * —al empezar un arrastre, no en cada píxel—, que es lo que hace que
   * deshacer devuelva el elemento donde estaba y no un milímetro atrás.
   */
  const marcar = useCallback(() => {
    const foto = instantanea();
    setHistorial(h => ({
      pasado: [...h.pasado, foto].slice(-PROFUNDIDAD_HISTORIAL),
      futuro: [],
    }));
  }, [instantanea]);

  /**
   * Le pregunta a la IA por los recuadros que las reglas no han sabido
   * identificar. Es un gesto más del editor: entra en el historial, así que
   * se deshace con Ctrl+Z como cualquier otro cambio.
   *
   * Si el servicio no está configurado o falla, se dice y ya está: la
   * plantilla se sigue montando a mano, que es como se montaba antes.
   */
  const reconocerConIa = useCallback(async () => {
    setEstadoIa({ cargando: true, aviso: null });
    try {
      const peticion = describirParaIa({ pagina, campos, tabla, rejillas, avisos: [], zonasExtra: zonas, familia: 'sans' });
      if (peticion.cajas.length === 0) {
        setEstadoIa({ cargando: false, aviso: 'No queda ningún recuadro sin identificar.' });
        return;
      }
      const respuesta = await fetch('/api/plantillas/reconocer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(peticion),
      });
      const cuerpo = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok) {
        setEstadoIa({ cargando: false, aviso: cuerpo?.error ?? 'No se ha podido usar la IA.' });
        return;
      }
      const { campos: fusionados, aplicadas } = fusionarSugerencias(
        campos, cuerpo.sugerencias ?? [], peticion.clavesDisponibles,
      );
      if (aplicadas === 0) {
        setEstadoIa({ cargando: false, aviso: 'La IA no ha sabido identificar ninguno con seguridad.' });
        return;
      }
      marcar();
      onCambiar({ campos: fusionados, tabla, zonasExtra: zonas });
      setEstadoIa({
        cargando: false,
        aviso: `${aplicadas} ${aplicadas === 1 ? 'recuadro identificado' : 'recuadros identificados'}. Revísalos: salen marcados «por confirmar».`,
      });
    } catch {
      setEstadoIa({ cargando: false, aviso: 'No se ha podido usar la IA. La plantilla sigue funcionando sin ella.' });
    }
  }, [pagina, campos, tabla, rejillas, zonas, marcar, onCambiar]);

  const deshacer = useCallback(() => {
    if (historial.pasado.length === 0) return;
    const anterior = historial.pasado[historial.pasado.length - 1];
    setHistorial({
      pasado: historial.pasado.slice(0, -1),
      futuro: [...historial.futuro, instantanea()],
    });
    onCambiar(anterior);
    setSeleccion([]);
  }, [historial, instantanea, onCambiar]);

  const rehacer = useCallback(() => {
    if (historial.futuro.length === 0) return;
    const siguiente = historial.futuro[historial.futuro.length - 1];
    setHistorial({
      pasado: [...historial.pasado, instantanea()],
      futuro: historial.futuro.slice(0, -1),
    });
    onCambiar(siguiente);
    setSeleccion([]);
  }, [historial, instantanea, onCambiar]);

  // ------------------------------------------------------------
  // ACCESO A LOS ELEMENTOS POR REFERENCIA
  // ------------------------------------------------------------

  const cajaDe = useCallback((ref: Ref): Caja | null => {
    if (ref === 'tabla') {
      return tabla ? { x: tabla.x, y: tabla.y, ancho: tabla.ancho, alto: tabla.altoTotal } : null;
    }
    const [clase, id] = ref.split(':');
    const lista: { id: string; x: number; y: number; ancho: number; alto: number }[] =
      clase === 'campo' ? campos : clase === 'rejilla' ? rejillas : zonas;
    const encontrado = lista.find(e => e.id === id);
    return encontrado ? { x: encontrado.x, y: encontrado.y, ancho: encontrado.ancho, alto: encontrado.alto } : null;
  }, [campos, zonas, rejillas, tabla]);

  /** Aplica de golpe las cajas nuevas de varios elementos. Un solo `onCambiar`. */
  const aplicarCajas = useCallback((nuevas: Map<Ref, Caja>) => {
    const cambios: CambioAnalisis = {};

    const camposTocados = [...nuevas.keys()].some(r => r.startsWith('campo:'));
    if (camposTocados) {
      cambios.campos = campos.map(c => {
        const caja = nuevas.get(`campo:${c.id}`);
        if (!caja) return c;
        // El hueco del QR tributario pasa por su acotador: cuadrado, entre 30
        // y 40 mm y con el bloque entero dentro del papel. Es lo que impide
        // que un arrastre lo saque de la zona imprimible o que un tirón de
        // esquina lo deje en 12 mm, que es un QR que ya no cumple.
        return { ...c, ...(esCampoQr(c) ? acotarCajaQr(caja, pagina) : caja) };
      });
    }

    const zonasTocadas = [...nuevas.keys()].some(r => r.startsWith('zona:'));
    if (zonasTocadas) {
      cambios.zonasExtra = zonas.map(z => {
        const caja = nuevas.get(`zona:${z.id}`);
        return caja ? { ...z, ...caja } : z;
      });
    }

    // Al mover o estirar una rejilla, sus columnas y sus renglones van con
    // ella: son bandas dentro del recuadro, no elementos sueltos. Si no se
    // reescalaran, arrastrar el cuadro dejaría las cifras donde estaban.
    const rejillasTocadas = [...nuevas.keys()].some(r => r.startsWith('rejilla:'));
    if (rejillasTocadas) {
      cambios.rejillas = rejillas.map(r => {
        const caja = nuevas.get(`rejilla:${r.id}`);
        if (!caja) return r;
        const escalaX = r.ancho > 0 ? caja.ancho / r.ancho : 1;
        const escalaY = r.alto > 0 ? caja.alto / r.alto : 1;
        return {
          ...r,
          ...caja,
          yPrimerRenglon: caja.y + (r.yPrimerRenglon - r.y) * escalaY,
          altoRenglon: Math.max(1, r.altoRenglon * escalaY),
          columnas: r.columnas.map(c => ({
            ...c,
            x: caja.x + (c.x - r.x) * escalaX,
            ancho: Math.max(1, c.ancho * escalaX),
          })),
        };
      });
    }

    const cajaTabla = nuevas.get('tabla');
    if (cajaTabla && tabla) {
      const columnas = cajaTabla.ancho !== tabla.ancho
        ? escalarColumnas(tabla.columnas, tabla.ancho, cajaTabla.ancho, cajaTabla.x)
        : recolocarColumnas(tabla.columnas, cajaTabla.x);
      cambios.tabla = {
        ...tabla,
        x: cajaTabla.x,
        y: cajaTabla.y,
        ancho: cajaTabla.ancho,
        altoTotal: cajaTabla.alto,
        columnas,
      };
    }

    onCambiar(cambios);
  }, [campos, zonas, rejillas, tabla, pagina, onCambiar]);

  const actualizarCampo = useCallback((id: string, cambios: Partial<CampoDetectado>) => {
    onCambiar({ campos: campos.map(c => (c.id === id ? { ...c, ...cambios } : c)) });
  }, [campos, onCambiar]);

  const actualizarSeleccionados = useCallback((cambios: Partial<CampoDetectado>) => {
    const ids = new Set(seleccion.filter(r => r.startsWith('campo:')).map(r => r.slice(6)));
    if (ids.size === 0) return;
    marcar();
    onCambiar({ campos: campos.map(c => (ids.has(c.id) ? { ...c, ...cambios } : c)) });
  }, [seleccion, campos, onCambiar, marcar]);

  const cambiarTabla = useCallback((nueva: TablaDetectada) => {
    onCambiar({ tabla: nueva });
  }, [onCambiar]);

  // ------------------------------------------------------------
  // SELECCIÓN
  // ------------------------------------------------------------

  const seleccionados = useMemo(() => new Set(seleccion), [seleccion]);
  const camposSeleccionados = useMemo(
    () => campos.filter(c => seleccionados.has(`campo:${c.id}`)),
    [campos, seleccionados],
  );
  const campoActivo = camposSeleccionados.length === 1 && seleccion.length === 1 ? camposSeleccionados[0] : null;
  const zonaActiva = seleccion.length === 1 && seleccion[0].startsWith('zona:')
    ? zonas.find(z => z.id === seleccion[0].slice(5)) ?? null
    : null;
  const tablaSeleccionada = seleccionados.has('tabla');

  const seleccionar = useCallback((ref: Ref, aditiva: boolean) => {
    setSeleccion(actualSel => {
      if (!aditiva) return actualSel.includes(ref) && actualSel.length === 1 ? actualSel : [ref];
      return actualSel.includes(ref) ? actualSel.filter(r => r !== ref) : [...actualSel, ref];
    });
  }, []);

  // ------------------------------------------------------------
  // ESCALA REAL DEL LIENZO
  // ------------------------------------------------------------

  useEffect(() => {
    const nodo = lienzoRef.current;
    if (!nodo) return;
    const medir = () => {
      const caja = nodo.getBoundingClientRect();
      if (caja.width > 0) setPxPorMm(caja.width / pagina.ancho);
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(nodo);
    return () => observador.disconnect();
  }, [pagina.ancho, zoom]);

  /** Milímetros que recorre un píxel de pantalla. Única conversión del editor. */
  const mmPorPx = useCallback(() => (pxPorMm > 0 ? 1 / pxPorMm : 0), [pxPorMm]);

  const puntoEnMm = useCallback((evento: { clientX: number; clientY: number }) => {
    const caja = lienzoRef.current?.getBoundingClientRect();
    if (!caja || caja.width === 0) return { x: 0, y: 0 };
    return {
      x: ((evento.clientX - caja.left) / caja.width) * pagina.ancho,
      y: ((evento.clientY - caja.top) / caja.height) * pagina.alto,
    };
  }, [pagina.ancho, pagina.alto]);

  // ------------------------------------------------------------
  // ACCIONES
  // ------------------------------------------------------------

  const borrarSeleccion = useCallback(() => {
    if (seleccion.length === 0) return;
    const idsCampo = new Set(seleccion.filter(r => r.startsWith('campo:')).map(r => r.slice(6)));
    const idsZona = new Set(seleccion.filter(r => r.startsWith('zona:')).map(r => r.slice(5)));
    if (idsCampo.size === 0 && idsZona.size === 0) return;
    marcar();
    const cambios: CambioAnalisis = {};
    if (idsCampo.size > 0) cambios.campos = campos.filter(c => !idsCampo.has(c.id));
    if (idsZona.size > 0) cambios.zonasExtra = zonas.filter(z => !idsZona.has(z.id));
    onCambiar(cambios);
    setSeleccion([]);
  }, [seleccion, campos, zonas, onCambiar, marcar]);

  const duplicarSeleccion = useCallback(() => {
    if (camposSeleccionados.length === 0) return;
    marcar();
    const copias = camposSeleccionados.map(c => duplicarCampo(c, `manual-${siguienteId.current++}`, pagina));
    onCambiar({ campos: [...campos, ...copias] });
    setSeleccion(copias.map(c => `campo:${c.id}`));
  }, [camposSeleccionados, campos, pagina, onCambiar, marcar]);

  const copiar = useCallback(() => {
    if (camposSeleccionados.length > 0) portapapeles.current = clonar(camposSeleccionados);
  }, [camposSeleccionados]);

  const pegar = useCallback(() => {
    if (portapapeles.current.length === 0) return;
    marcar();
    const copias = portapapeles.current.map(c => duplicarCampo(c, `manual-${siguienteId.current++}`, pagina));
    onCambiar({ campos: [...campos, ...copias] });
    setSeleccion(copias.map(c => `campo:${c.id}`));
  }, [campos, pagina, onCambiar, marcar]);

  const alinearSeleccion = useCallback((modo: ModoAlinear) => {
    if (camposSeleccionados.length < 2) return;
    marcar();
    const alineados = alinear(camposSeleccionados, modo);
    const porId = new Map(alineados.map(c => [c.id, c]));
    onCambiar({ campos: campos.map(c => porId.get(c.id) ?? c) });
  }, [camposSeleccionados, campos, onCambiar, marcar]);

  const distribuirSeleccion = useCallback((eje: 'horizontal' | 'vertical') => {
    if (camposSeleccionados.length < 3) return;
    marcar();
    const repartidos = distribuir(camposSeleccionados, eje);
    const porId = new Map(repartidos.map(c => [c.id, c]));
    onCambiar({ campos: campos.map(c => porId.get(c.id) ?? c) });
  }, [camposSeleccionados, campos, onCambiar, marcar]);

  /**
   * Asignar una clave decide también el tipo: el logotipo y el QR son
   * imágenes, y pintarlos como texto imprimiría la URL del logo en mitad de
   * la factura.
   */
  const asignarClave = useCallback((id: string, clave: string | null) => {
    marcar();
    const definicion = clave ? campoPorClave(clave) : undefined;
    actualizarCampo(id, {
      clave,
      fijo: false,
      tipo: definicion?.tipo === 'imagen' ? 'imagen' : 'texto',
    });
  }, [actualizarCampo, marcar]);

  // ------------------------------------------------------------
  // TECLADO
  // ------------------------------------------------------------

  useEffect(() => {
    const escribiendo = (destino: EventTarget | null) => {
      const nodo = destino as HTMLElement | null;
      return Boolean(nodo && (
        nodo.tagName === 'INPUT' || nodo.tagName === 'SELECT' ||
        nodo.tagName === 'TEXTAREA' || nodo.isContentEditable
      ));
    };

    const alPulsar = (e: KeyboardEvent) => {
      if (escribiendo(e.target)) return;
      const meta = e.ctrlKey || e.metaKey;

      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) rehacer(); else deshacer();
        return;
      }
      if (meta && e.key.toLowerCase() === 'y') { e.preventDefault(); rehacer(); return; }
      if (meta && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicarSeleccion(); return; }
      if (meta && e.key.toLowerCase() === 'c') { copiar(); return; }
      if (meta && e.key.toLowerCase() === 'v') { e.preventDefault(); pegar(); return; }
      if (meta && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSeleccion(campos.map(c => `campo:${c.id}`));
        return;
      }

      if (e.key === 'Escape') { setSeleccion([]); setModoDibujo(null); return; }
      if (seleccion.length === 0) return;

      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); borrarSeleccion(); return; }

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const paso = e.shiftKey ? 2 : 0.5;
        const dx = e.key === 'ArrowLeft' ? -paso : e.key === 'ArrowRight' ? paso : 0;
        const dy = e.key === 'ArrowUp' ? -paso : e.key === 'ArrowDown' ? paso : 0;
        marcar();
        const nuevas = new Map<Ref, Caja>();
        for (const ref of seleccion) {
          const caja = cajaDe(ref);
          if (!caja) continue;
          nuevas.set(ref, {
            ...caja,
            x: acotar(caja.x + dx, 0, pagina.ancho - caja.ancho),
            y: acotar(caja.y + dy, 0, pagina.alto - caja.alto),
          });
        }
        aplicarCajas(nuevas);
      }
    };

    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [
    seleccion, campos, pagina, cajaDe, aplicarCajas, borrarSeleccion,
    duplicarSeleccion, copiar, pegar, deshacer, rehacer, marcar,
  ]);

  // ------------------------------------------------------------
  // ARRASTRE
  // ------------------------------------------------------------

  const capturar = (evento: React.PointerEvent) => {
    lienzoRef.current?.setPointerCapture(evento.pointerId);
  };

  const empezarMover = (evento: React.PointerEvent, ref: Ref) => {
    if (modoDibujo) return;
    evento.stopPropagation();

    const aditiva = evento.shiftKey || evento.ctrlKey || evento.metaKey;
    const yaSeleccionado = seleccionados.has(ref);
    let refs: Ref[];
    if (aditiva) {
      refs = yaSeleccionado ? seleccion.filter(r => r !== ref) : [...seleccion, ref];
      setSeleccion(refs);
      if (yaSeleccionado) return;
    } else {
      refs = yaSeleccionado ? seleccion : [ref];
      setSeleccion(refs);
    }

    const origen = new Map<Ref, Caja>();
    for (const r of refs) {
      const caja = cajaDe(r);
      if (caja) origen.set(r, caja);
    }
    if (origen.size === 0) return;

    marcar();
    setArrastre({ tipo: 'mover', px: evento.clientX, py: evento.clientY, principal: ref, origen });
    capturar(evento);
  };

  const empezarRedimensionar = (evento: React.PointerEvent, ref: Ref, dir: Direccion) => {
    evento.stopPropagation();
    const caja = cajaDe(ref);
    if (!caja) return;
    marcar();
    setArrastre({ tipo: 'redimensionar', px: evento.clientX, py: evento.clientY, dir, ref, caja });
    capturar(evento);
  };

  const alMover = (evento: React.PointerEvent) => {
    if (!arrastre) return;
    const escala = mmPorPx();
    if (escala === 0) return;

    switch (arrastre.tipo) {
      case 'mover': {
        const dx = (evento.clientX - arrastre.px) * escala;
        const dy = (evento.clientY - arrastre.py) * escala;
        const cajaPrincipal = arrastre.origen.get(arrastre.principal)!;

        let movidaX = cajaPrincipal.x + dx;
        let movidaY = cajaPrincipal.y + dy;
        let guiasNuevas: Guia[] = [];

        // Los imanes se desactivan con Alt, que es la convención de toda la
        // vida para «colócalo exactamente donde te digo».
        if (!evento.altKey) {
          const otras: Caja[] = [
            ...campos.filter(c => !arrastre.origen.has(`campo:${c.id}`)),
            ...zonas.filter(z => !arrastre.origen.has(`zona:${z.id}`)),
            ...(tabla && !arrastre.origen.has('tabla')
              ? [{ x: tabla.x, y: tabla.y, ancho: tabla.ancho, alto: tabla.altoTotal }]
              : []),
          ].map(c => ({ x: c.x, y: c.y, ancho: c.ancho, alto: c.alto }));

          const iman = calcularImanes(
            { ...cajaPrincipal, x: movidaX, y: movidaY },
            otras,
            pagina,
            IMAN_PX * escala,
          );
          movidaX = iman.x;
          movidaY = iman.y;
          guiasNuevas = iman.guias;
        }

        const ajusteX = movidaX - cajaPrincipal.x;
        const ajusteY = movidaY - cajaPrincipal.y;

        const nuevas = new Map<Ref, Caja>();
        for (const [ref, caja] of arrastre.origen) {
          nuevas.set(ref, {
            ...caja,
            x: acotar(caja.x + ajusteX, 0, Math.max(0, pagina.ancho - caja.ancho)),
            y: acotar(caja.y + ajusteY, 0, Math.max(0, pagina.alto - caja.alto)),
          });
        }
        setGuias(guiasNuevas);
        aplicarCajas(nuevas);
        break;
      }

      case 'redimensionar': {
        const dx = (evento.clientX - arrastre.px) * escala;
        const dy = (evento.clientY - arrastre.py) * escala;
        const { caja, dir } = arrastre;
        const MINIMO = arrastre.ref === 'tabla' ? 12 : 3;

        let { x, y, ancho, alto } = caja;
        if (dir.includes('e')) ancho = Math.max(MINIMO, caja.ancho + dx);
        if (dir.includes('s')) alto = Math.max(MINIMO, caja.alto + dy);
        if (dir.includes('w')) {
          const nuevoAncho = Math.max(MINIMO, caja.ancho - dx);
          x = caja.x + caja.ancho - nuevoAncho;
          ancho = nuevoAncho;
        }
        if (dir.includes('n')) {
          const nuevoAlto = Math.max(MINIMO, caja.alto - dy);
          y = caja.y + caja.alto - nuevoAlto;
          alto = nuevoAlto;
        }

        aplicarCajas(new Map([[arrastre.ref, {
          x: acotar(x, 0, pagina.ancho),
          y: acotar(y, 0, pagina.alto),
          ancho: Math.min(ancho, pagina.ancho - x),
          alto: Math.min(alto, pagina.alto - y),
        }]]));
        break;
      }

      case 'rejilla-ancho': {
        const rejilla = rejillas.find(r => r.id === arrastre.rejillaId);
        if (!rejilla) break;
        const delta = (evento.clientX - arrastre.px) / pxPorMm;
        onCambiar({
          rejillas: rejillas.map(r => (r.id === arrastre.rejillaId
            ? { ...r, columnas: redimensionarColumnaRejilla(r.columnas, arrastre.indice, arrastre.anchoIzquierda + delta) }
            : r)),
        });
        break;
      }
      case 'columna-ancho': {
        if (!tabla) return;
        const delta = (evento.clientX - arrastre.px) * escala;
        cambiarTabla({
          ...tabla,
          columnas: redimensionarColumna(tabla.columnas, arrastre.indice, arrastre.anchoIzquierda + delta, tabla.x),
        });
        break;
      }

      case 'columna-orden': {
        if (!tabla) return;
        const { x } = puntoEnMm(evento);
        const sobre = tabla.columnas.findIndex(c => x >= c.x && x < c.x + c.ancho);
        if (sobre !== -1 && sobre !== arrastre.sobre) setArrastre({ ...arrastre, sobre });
        break;
      }

      case 'dibujar': {
        const punto = puntoEnMm(evento);
        setArrastre({ ...arrastre, x1: punto.x, y1: punto.y });
        break;
      }
    }
  };

  const alSoltar = () => {
    if (arrastre?.tipo === 'dibujar') {
      const x = Math.min(arrastre.x0, arrastre.x1);
      const y = Math.min(arrastre.y0, arrastre.y1);
      const ancho = Math.abs(arrastre.x1 - arrastre.x0);
      const alto = Math.abs(arrastre.y1 - arrastre.y0);

      if (arrastre.modo === 'seleccion') {
        const marco: Caja = { x, y, ancho, alto };
        if (ancho >= 1 && alto >= 1) {
          const dentro: Ref[] = [
            ...campos.filter(c => intersecan(marco, c)).map(c => `campo:${c.id}`),
            ...zonas.filter(z => intersecan(marco, z)).map(z => `zona:${z.id}`),
          ];
          setSeleccion(dentro);
        }
      } else if (ancho >= 3 && alto >= 2) {
        marcar();
        if (arrastre.modo === 'rejilla' || arrastre.modo === 'pagos') {
          const rejilla = rejillaNueva(
            `rejilla-${siguienteId.current++}`, { x, y, ancho, alto }, analisis.familia,
            arrastre.modo === 'pagos' ? 'vencimientos' : 'impuestos',
          );
          onCambiar({ rejillas: [...rejillas, rejilla] });
          setSeleccion([`rejilla:${rejilla.id}`]);
        } else if (arrastre.modo === 'zona') {
          const zona: ZonaBorrado = { id: `zona-${siguienteId.current++}`, x, y, ancho, alto };
          onCambiar({ zonasExtra: [...zonas, zona] });
          setSeleccion([`zona:${zona.id}`]);
        } else {
          const campo = campoNuevo(`manual-${siguienteId.current++}`, { x, y, ancho, alto }, {
            serif: analisis.familia === 'serif',
            fijo: arrastre.modo === 'rotulo',
          });
          onCambiar({ campos: [...campos, campo] });
          setSeleccion([`campo:${campo.id}`]);
        }
        setModoDibujo(null);
      } else {
        setModoDibujo(null);
      }
    }

    if (arrastre?.tipo === 'columna-orden' && tabla && arrastre.sobre !== arrastre.desde) {
      marcar();
      cambiarTabla({ ...tabla, columnas: moverColumna(tabla.columnas, arrastre.desde, arrastre.sobre, tabla.x) });
    }

    setArrastre(null);
    setGuias([]);
  };

  const alPulsarLienzo = (evento: React.PointerEvent) => {
    const punto = puntoEnMm(evento);
    if (modoDibujo) {
      setArrastre({ tipo: 'dibujar', modo: modoDibujo, x0: punto.x, y0: punto.y, x1: punto.x, y1: punto.y });
      capturar(evento);
      return;
    }
    // Sin herramienta activa, arrastrar sobre el papel dibuja una marquesina
    // de selección. Un clic seco deselecciona.
    if (!evento.shiftKey) setSeleccion([]);
    setArrastre({ tipo: 'dibujar', modo: 'seleccion', x0: punto.x, y0: punto.y, x1: punto.x, y1: punto.y });
    capturar(evento);
  };

  // ------------------------------------------------------------
  // TEXTOS DEL DISEÑO QUE NO SON CAMPOS
  // ------------------------------------------------------------

  const textosFijos = useMemo(() => {
    const cubierto = (s: SegmentoTexto) => {
      const cajas: Caja[] = [
        ...campos.map(c => ({ x: c.x, y: c.y, ancho: c.ancho, alto: c.alto })),
        ...zonas,
        ...(tabla ? [{ x: tabla.x, y: tabla.y, ancho: tabla.ancho, alto: tabla.altoTotal }] : []),
      ];
      return cajas.some(c => intersecan(c, { x: s.x, y: s.y, ancho: s.ancho, alto: s.alto }));
    };
    return pagina.lineas.flatMap(l => l.segmentos).filter(s => !cubierto(s));
  }, [pagina.lineas, campos, zonas, tabla]);

  const convertirEnCampo = useCallback((segmento: SegmentoTexto) => {
    const principal = segmento.items.reduce(
      (a, b) => (b.texto.length > a.texto.length ? b : a),
      segmento.items[0],
    );
    marcar();
    const campo: CampoDetectado = {
      ...campoNuevo(`manual-${siguienteId.current++}`, segmento, { serif: principal?.serif ?? false }),
      valorOriginal: segmento.texto,
      tamano: principal?.tamano ?? 9,
      color: principal?.color ?? '#111111',
      negrita: principal?.negrita ?? false,
      cursiva: principal?.cursiva ?? false,
      interlineado: 1.15,
      motivo: 'Marcado como dato por ti',
    };
    onCambiar({ campos: [...campos, campo] });
    setSeleccion([`campo:${campo.id}`]);
  }, [campos, onCambiar, marcar]);

  // ------------------------------------------------------------
  // PINTADO
  // ------------------------------------------------------------

  const cajaDibujo = arrastre?.tipo === 'dibujar' ? arrastre : null;
  const asignadas = new Set(campos.map(c => c.clave).filter(Boolean) as string[]);
  // Un recuento por cada columna propia de la tabla: la casilla «CAJAS» del
  // pie es la suma de la columna «CAJ.» de las líneas.
  const recuentosDeColumna = (tabla?.columnas ?? [])
    .filter(c => c.clave && esColumnaPersonalizada(c.clave))
    .map(c => ({ clave: totalDeColumna(c.clave!)!, cabecera: c.cabecera || c.clave! }));
  const sinAsignar = campos.filter(c => !c.clave && !c.fijo).length;
  const rejillaActiva = seleccion.length === 1 && seleccion[0].startsWith('rejilla:')
    ? rejillas.find(r => r.id === seleccion[0].slice(8)) ?? null
    : null;

  /** Tamaño en píxeles de pantalla de un texto medido en puntos tipográficos. */
  const puntosAPx = (puntos: number) => Math.max(4, puntos * 0.3528 * pxPorMm);

  return (
    <div className="plantilla-revisor">
      {/* ============ LIENZO ============ */}
      <div className="plantilla-lienzo-envoltorio">
        <BarraHerramientas
          modoDibujo={modoDibujo}
          onModoDibujo={setModoDibujo}
          hayTabla={Boolean(tabla)}
          tablaSeleccionada={tablaSeleccionada}
          onSeleccionarTabla={() => {
            setModoDibujo(null);
            setSeleccion(tablaSeleccionada ? [] : ['tabla']);
          }}
          vistaPrevia={vistaPrevia}
          onVistaPrevia={() => setVistaPrevia(v => !v)}
          verEtiquetas={verEtiquetas}
          onVerEtiquetas={() => setVerEtiquetas(v => !v)}
          zoom={zoom}
          onZoom={setZoom}
          puedeDeshacer={historial.pasado.length > 0}
          puedeRehacer={historial.futuro.length > 0}
          onDeshacer={deshacer}
          onRehacer={rehacer}
          cargandoIa={estadoIa.cargando}
          onReconocerConIa={reconocerConIa}
          sinIdentificar={campos.filter(c => !c.fijo && !c.clave).length}
        />

        {estadoIa.aviso && (
          <div className="callout callout-info plantilla-callout-compacto animate-fade-in">
            <Sparkles size={15} />
            <div><p>{estadoIa.aviso}</p></div>
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => setEstadoIa(e => ({ ...e, aviso: null }))}>
              Entendido
            </button>
          </div>
        )}

        {camposSeleccionados.length === 1 && (
          <BarraCampo
            campo={camposSeleccionados[0]}
            asignadas={asignadas}
            recuentosDeColumna={recuentosDeColumna}
            onAsignar={(clave) => asignarClave(camposSeleccionados[0].id, clave)}
            onFijar={() => { marcar(); actualizarCampo(camposSeleccionados[0].id, { fijo: true, clave: null }); }}
            onCambiar={(cambios) => { marcar(); actualizarCampo(camposSeleccionados[0].id, cambios); }}
            onDuplicar={duplicarSeleccion}
            onEliminar={borrarSeleccion}
          />
        )}

        {camposSeleccionados.length > 1 && (
          <BarraGrupo
            cuantos={camposSeleccionados.length}
            onAlinear={alinearSeleccion}
            onDistribuir={distribuirSeleccion}
            onCambiar={actualizarSeleccionados}
            onDuplicar={duplicarSeleccion}
            onEliminar={borrarSeleccion}
          />
        )}

        {modoDibujo && (
          <p className="plantilla-pista-modo">
            {modoDibujo === 'campo' && 'Dibuja un recuadro sobre la factura para colocar un dato que se rellenará solo.'}
            {modoDibujo === 'rotulo' && 'Dibuja un recuadro y escribe el texto fijo que quieres añadir al diseño.'}
            {modoDibujo === 'zona' && 'Dibuja un recuadro sobre lo que quieras borrar del diseño original.'}
            {modoDibujo === 'rejilla' && 'Rodea el cuadro de desglose del pie, cabecera incluida. Se rellenará con un renglón por cada tipo impositivo de la factura.'}
            {modoDibujo === 'pagos' && 'Rodea el cuadro de vencimientos del pie. Se rellenará con la fecha de pago, el plazo, el importe y la forma de pago de cada factura.'}
          </p>
        )}

        <div className="plantilla-lienzo-scroll">
          <div
            ref={lienzoRef}
            className={[
              'plantilla-lienzo',
              modoDibujo ? 'plantilla-lienzo--dibujando' : '',
              vistaPrevia ? 'plantilla-lienzo--previa' : '',
            ].filter(Boolean).join(' ')}
            style={{ width: `${zoom * 100}%`, aspectRatio: `${pagina.ancho} / ${pagina.alto}` }}
            onPointerDown={alPulsarLienzo}
            onPointerMove={alMover}
            onPointerUp={alSoltar}
            onPointerCancel={alSoltar}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pagina.bitmap.dataUrl} alt="Factura subida" className="plantilla-lienzo-img" draggable={false} />

            {/* --- Rejillas: el cuadro de desglose del pie --- */}
            {rejillas.map(rejilla => {
              const activa = seleccionados.has(`rejilla:${rejilla.id}`);
              // Cuántos renglones caben, para enseñar dónde van a caer. Es lo
              // que el usuario necesita ver para saber si su cuadro se queda
              // corto ANTES de emitir la primera factura.
              const caben = Math.max(1, Math.floor(
                (rejilla.y + rejilla.alto - rejilla.yPrimerRenglon) / rejilla.altoRenglon,
              ));
              return (
                <div
                  key={rejilla.id}
                  role="button"
                  tabIndex={0}
                  className={`rejilla-caja ${activa ? 'rejilla-caja--activa' : ''}`}
                  style={{
                    left: pct(rejilla.x, pagina.ancho), top: pct(rejilla.y, pagina.alto),
                    width: pct(rejilla.ancho, pagina.ancho), height: pct(rejilla.alto, pagina.alto),
                  }}
                  onPointerDown={(e) => empezarMover(e, `rejilla:${rejilla.id}`)}
                  onKeyDown={(e) => { if (e.key === 'Enter') seleccionar(`rejilla:${rejilla.id}`, false); }}
                  title="Cuadro de desglose: un renglón por tipo impositivo"
                >
                  {/* Las rayas de los renglones, donde va a escribir */}
                  {Array.from({ length: caben }, (_, i) => (
                    <div
                      key={i}
                      className="rejilla-renglon"
                      style={{
                        top: pct(rejilla.yPrimerRenglon - rejilla.y + i * rejilla.altoRenglon, rejilla.alto),
                        height: pct(rejilla.altoRenglon, rejilla.alto),
                      }}
                    />
                  ))}
                  {/* Las columnas, con la que no lleva dato marcada aparte */}
                  {rejilla.columnas.map((columna, i) => (
                    <div
                      key={i}
                      className={`rejilla-columna ${columna.clave ? '' : 'rejilla-columna--libre'}`}
                      style={{
                        left: pct(columna.x - rejilla.x, rejilla.ancho),
                        width: pct(columna.ancho, rejilla.ancho),
                      }}
                    />
                  ))}
                  {/* Un tirador por cada raya entre columnas: hay cifras que no
                      caben en su casilla mientras la de al lado va sobrada, y
                      sin poder moverlas el cuadro no se puede calzar sobre un
                      impreso que reparte el ancho de otra manera. */}
                  {activa && rejilla.columnas.slice(0, -1).map((columna, i) => (
                    <div
                      key={`div-${i}`}
                      className="plantilla-divisor"
                      style={{ left: pct(columna.x + columna.ancho - rejilla.x, rejilla.ancho) }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        marcar();
                        setArrastre({
                          tipo: 'rejilla-ancho',
                          px: e.clientX,
                          rejillaId: rejilla.id,
                          indice: i,
                          anchoIzquierda: columna.ancho,
                        });
                        capturar(e);
                      }}
                      title="Arrastra para repartir el ancho entre las dos columnas"
                    />
                  ))}
                  {verEtiquetas && (
                    <span className="campo-caja-etiqueta">
                      {rejilla.fuente === 'vencimientos' ? 'Pagos' : 'Desglose'} · {caben} renglones
                    </span>
                  )}
                  {activa && seleccion.length === 1 && (
                    <Tiradores onEmpezar={(e, dir) => empezarRedimensionar(e, `rejilla:${rejilla.id}`, dir)} />
                  )}
                </div>
              );
            })}

            {/* --- Zonas tapadas --- */}
            {zonas.map(zona => {
              const activa = seleccionados.has(`zona:${zona.id}`);
              return (
                <div
                  key={zona.id}
                  role="button"
                  tabIndex={0}
                  className={`zona-caja ${activa ? 'zona-caja--activa' : ''}`}
                  style={{
                    left: pct(zona.x, pagina.ancho), top: pct(zona.y, pagina.alto),
                    width: pct(zona.ancho, pagina.ancho), height: pct(zona.alto, pagina.alto),
                  }}
                  onPointerDown={(e) => empezarMover(e, `zona:${zona.id}`)}
                  onKeyDown={(e) => { if (e.key === 'Enter') seleccionar(`zona:${zona.id}`, false); }}
                  title="Zona tapada del diseño original"
                >
                  {verEtiquetas && <span className="campo-caja-etiqueta">Tapado</span>}
                  {activa && seleccion.length === 1 && (
                    <Tiradores onEmpezar={(e, dir) => empezarRedimensionar(e, `zona:${zona.id}`, dir)} />
                  )}
                </div>
              );
            })}

            {/* --- Tabla de líneas --- */}
            {tabla && (
              <TablaEnLienzo
                tabla={tabla}
                pagina={pagina}
                pxPorMm={pxPorMm}
                seleccionada={tablaSeleccionada}
                soloUna={seleccion.length === 1}
                arrastreColumna={arrastre?.tipo === 'columna-orden' ? arrastre : null}
                verEtiquetas={verEtiquetas}
                onPointerDownMarco={(e) => empezarMover(e, 'tabla')}
                onEmpezarTirador={(e, dir) => empezarRedimensionar(e, 'tabla', dir)}
                onEmpezarAncho={(e, indice) => {
                  e.stopPropagation();
                  setSeleccion(['tabla']);
                  marcar();
                  setArrastre({
                    tipo: 'columna-ancho',
                    px: e.clientX,
                    indice,
                    anchoIzquierda: tabla.columnas[indice].ancho,
                  });
                  capturar(e);
                }}
                onEmpezarOrden={(e, indice) => {
                  e.stopPropagation();
                  setSeleccion(['tabla']);
                  setArrastre({ tipo: 'columna-orden', desde: indice, sobre: indice });
                  capturar(e);
                }}
              />
            )}

            {/* --- EL BLOQUE DEL QR TRIBUTARIO, A ESCALA REAL ---
                 Lo que se pinta aquí no es adorno: es exactamente lo que va a
                 salir impreso —el rótulo «QR tributario:» encima, el código
                 con su lado en milímetros y la leyenda debajo—, calculado con
                 la misma función que lo estampa en el PDF. El recuadro a
                 rayas es la zona de reserva: lo que se meta ahí dentro saldrá
                 tapado por el blanco del código. --- */}
            {campos.filter(esCampoQr).map(campo => {
              const bloque = bloqueDeCampoQr(campo, pagina);
              const caja = (c: { x: number; y: number; ancho: number; alto: number }) => ({
                left: pct(c.x, pagina.ancho), top: pct(c.y, pagina.alto),
                width: pct(c.ancho, pagina.ancho), height: pct(c.alto, pagina.alto),
              });
              return (
                <Fragment key={`qr-${campo.id}`}>
                  <div className="plantilla-qr-reserva" style={caja(bloque.reserva)} />
                  <div
                    className="plantilla-qr-texto"
                    style={{ ...caja(bloque.rotulo), fontSize: `${puntosAPx(bloque.rotulo.tamano)}px` }}
                  >
                    {bloque.rotulo.texto}
                  </div>
                  {bloque.leyenda && (
                    <div
                      className="plantilla-qr-texto"
                      style={{ ...caja(bloque.leyenda), fontSize: `${puntosAPx(bloque.leyenda.tamano)}px` }}
                    >
                      {bloque.leyenda.texto}
                    </div>
                  )}
                </Fragment>
              );
            })}

            {/* --- Campos --- */}
            {campos.map(campo => {
              const activo = seleccionados.has(`campo:${campo.id}`);
              const valorMuestra = campo.fijo
                ? (campo.texto ?? campo.valorOriginal)
                : campo.clave ? (datosEjemplo[campo.clave] || campo.valorOriginal) : campo.valorOriginal;

              return (
                <div
                  key={campo.id}
                  role="button"
                  tabIndex={0}
                  className={[
                    'campo-caja',
                    claseConfianza(campo.confianza),
                    activo ? 'campo-caja--activa' : '',
                    campo.fijo ? 'campo-caja--fija' : '',
                    !campo.clave && !campo.fijo ? 'campo-caja--sin-asignar' : '',
                    campo.tipo === 'imagen' ? 'campo-caja--imagen' : '',
                  ].filter(Boolean).join(' ')}
                  style={{
                    left: pct(campo.x, pagina.ancho), top: pct(campo.y, pagina.alto),
                    width: pct(campo.ancho, pagina.ancho), height: pct(campo.alto, pagina.alto),
                  }}
                  onPointerDown={(e) => empezarMover(e, `campo:${campo.id}`)}
                  onKeyDown={(e) => { if (e.key === 'Enter') seleccionar(`campo:${campo.id}`, false); }}
                  title={campo.fijo ? 'Texto fijo' : campo.clave ? nombreDe(campo.clave) : 'Sin asignar'}
                >
                  {vistaPrevia && campo.tipo !== 'imagen' && (
                    <div
                      className="plantilla-campo-preview-texto"
                      style={{
                        fontSize: `${puntosAPx(campo.tamano)}px`,
                        lineHeight: campo.interlineado,
                        color: campo.color || '#111111',
                        fontWeight: campo.negrita ? 700 : 400,
                        fontStyle: campo.cursiva ? 'italic' : 'normal',
                        fontFamily: campo.serif ? 'Georgia, serif' : 'Inter, Arial, sans-serif',
                        justifyContent: campo.alineacion === 'right' ? 'flex-end'
                          : campo.alineacion === 'center' ? 'center' : 'flex-start',
                      }}
                    >
                      {valorMuestra}
                    </div>
                  )}

                  {campo.tipo === 'imagen' && (
                    esCampoQr(campo) ? (
                      <span className="plantilla-marca-qr">
                        <QrCode size={Math.max(12, Math.min(48, campo.alto * pxPorMm * 0.45))} />
                        <b>QR VERI*FACTU</b>
                        <i>{Math.round(campo.ancho)} × {Math.round(campo.alto)} mm</i>
                      </span>
                    ) : (
                      <span className="plantilla-marca-imagen"><ImageIcon size={Math.max(10, Math.min(20, campo.alto * pxPorMm * 0.5))} /></span>
                    )
                  )}

                  {verEtiquetas && !vistaPrevia && (
                    <span className="campo-caja-etiqueta">
                      {campo.fijo ? 'Texto fijo' : campo.clave ? nombreDe(campo.clave) : '¿Qué dato es?'}
                    </span>
                  )}

                  {activo && seleccion.length === 1 && (
                    <Tiradores onEmpezar={(e, dir) => empezarRedimensionar(e, `campo:${campo.id}`, dir)} />
                  )}
                </div>
              );
            })}

            {/* --- Guías de los imanes --- */}
            {guias.map((guia, i) => (
              <span
                key={`${guia.eje}-${i}`}
                className={`plantilla-guia plantilla-guia--${guia.eje}`}
                style={guia.eje === 'x'
                  ? { left: pct(guia.valor, pagina.ancho) }
                  : { top: pct(guia.valor, pagina.alto) }}
              />
            ))}

            {/* --- Recuadro que se está dibujando --- */}
            {cajaDibujo && (
              <div
                className={
                  cajaDibujo.modo === 'zona' ? 'zona-caja zona-caja--nueva'
                    : cajaDibujo.modo === 'seleccion' ? 'plantilla-marquesina'
                      : 'campo-caja campo-caja--nueva'
                }
                style={{
                  left: pct(Math.min(cajaDibujo.x0, cajaDibujo.x1), pagina.ancho),
                  top: pct(Math.min(cajaDibujo.y0, cajaDibujo.y1), pagina.alto),
                  width: pct(Math.abs(cajaDibujo.x1 - cajaDibujo.x0), pagina.ancho),
                  height: pct(Math.abs(cajaDibujo.y1 - cajaDibujo.y0), pagina.alto),
                }}
              />
            )}
          </div>
        </div>

        <p className="plantilla-atajos">
          <strong>Atajos:</strong> arrastra sobre el papel para seleccionar varios · flechas para mover (Mayús = 2 mm)
          · <kbd>Alt</kbd> mientras arrastras desactiva los imanes · <kbd>Ctrl</kbd>+<kbd>Z</kbd> deshacer
          · <kbd>Ctrl</kbd>+<kbd>D</kbd> duplicar · <kbd>Supr</kbd> eliminar
        </p>
      </div>

      {/* ============ PANEL ============ */}
      <div className="plantilla-panel">
        {campoActivo && (
          <PanelCampo
            recuentosDeColumna={recuentosDeColumna}
            campo={campoActivo}
            asignadas={asignadas}
            onAsignar={(clave) => asignarClave(campoActivo.id, clave)}
            onCambiar={(cambios) => { marcar(); actualizarCampo(campoActivo.id, cambios); }}
            onEliminar={borrarSeleccion}
            onDuplicar={duplicarSeleccion}
          />
        )}

        {camposSeleccionados.length > 1 && (
          <div className="card plantilla-panel-grupo">
            <div className="card-header">
              <div>
                <h4 className="card-title">{camposSeleccionados.length} elementos seleccionados</h4>
                <p className="card-subtitle">Se mueven, se alinean y se cambian de estilo a la vez.</p>
              </div>
            </div>
            <ul className="plantilla-grupo-lista">
              {camposSeleccionados.map(c => (
                <li key={c.id}>
                  <span className="plantilla-grupo-etiqueta">
                    {c.fijo ? 'Texto fijo' : c.clave ? nombreDe(c.clave) : 'Sin asignar'}
                  </span>
                  <span className="plantilla-grupo-valor">{c.valorOriginal || c.texto || '—'}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {zonaActiva && (
          <div className="card">
            <div className="card-header">
              <div>
                <h4 className="card-title">Zona tapada</h4>
                <p className="card-subtitle">Se borra del diseño original con el color del papel que la rodea.</p>
              </div>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={borrarSeleccion} title="Quitar la zona">
                <Trash2 size={14} />
              </button>
            </div>
            <CajaNumerica
              caja={zonaActiva}
              onCambiar={(cambios) => {
                marcar();
                onCambiar({ zonasExtra: zonas.map(z => (z.id === zonaActiva.id ? { ...z, ...cambios } : z)) });
              }}
            />
          </div>
        )}

        {rejillaActiva && (
          <PanelRejilla
            rejilla={rejillaActiva}
            onCambiar={(nueva) => {
              marcar();
              onCambiar({ rejillas: rejillas.map(r => (r.id === nueva.id ? nueva : r)) });
            }}
            onEliminar={() => {
              marcar();
              onCambiar({ rejillas: rejillas.filter(r => r.id !== rejillaActiva.id) });
              setSeleccion([]);
            }}
          />
        )}

        {tablaSeleccionada && tabla && (
          <PanelTabla
            tabla={tabla}
            onCambiar={(nueva) => { marcar(); cambiarTabla(nueva); }}
            onHacerSitio={(mm) => {
              const hecho = hacerSitio(mm, tabla, campos, rejillas, pagina.alto);
              if (!hecho) {
                setEstadoIa({ cargando: false, aviso: 'No queda sitio en la hoja para bajar más lo de abajo.' });
                return;
              }
              marcar();
              onCambiar(hecho);
            }}
          />
        )}

        {seleccion.length === 0 && (
          <div className="card plantilla-vacio">
            <Sparkles size={18} />
            <div>
              <strong>Nada seleccionado</strong>
              <p>
                Haz clic en un recuadro para ajustarlo, arrastra sobre el papel para seleccionar
                varios a la vez, o usa <strong>Añadir dato</strong> para colocar uno nuevo donde
                haga falta. Con <strong>Vista previa</strong> ves los datos reales sobre tu diseño.
              </p>
            </div>
          </div>
        )}

        {tabla && (
          <PanelColumnas
            tabla={tabla}
            onCambiar={(nueva) => { marcar(); cambiarTabla(nueva); }}
            onSeleccionarTabla={() => setSeleccion(['tabla'])}
          />
        )}

        <ListaElementos
          nombreDe={nombreDe}
          campos={campos}
          textosFijos={textosFijos}
          filtro={filtro}
          onFiltro={setFiltro}
          busqueda={busqueda}
          onBusqueda={setBusqueda}
          seleccionados={seleccionados}
          onSeleccionar={(id, aditiva) => seleccionar(`campo:${id}`, aditiva)}
          onAlternarFijo={(campo) => {
            marcar();
            actualizarCampo(campo.id, {
              fijo: !campo.fijo,
              clave: campo.fijo ? campo.clave : null,
              texto: !campo.fijo ? (campo.texto ?? campo.valorOriginal) : campo.texto,
            });
          }}
          onConvertir={convertirEnCampo}
        />

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
          {campos.filter(c => !c.fijo && c.clave).length} datos modificables
          {sinAsignar > 0 && (
            <span className="plantilla-resumen-pendiente">· {sinAsignar} sin asignar</span>
          )}
          <span>· {campos.filter(c => c.fijo).length} fijos · {tabla ? `${tabla.columnas.length} columnas` : 'sin tabla'}</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// TIRADORES DE REDIMENSIÓN
// ============================================================

function Tiradores({ onEmpezar }: { onEmpezar: (e: React.PointerEvent, dir: Direccion) => void }) {
  return (
    <>
      {DIRECCIONES.map(dir => (
        <span
          key={dir}
          className={`campo-caja-tirador campo-caja-tirador--${dir}`}
          onPointerDown={(e) => onEmpezar(e, dir)}
        />
      ))}
    </>
  );
}

// ============================================================
// BARRA DE HERRAMIENTAS
// ============================================================

interface PropsBarra {
  modoDibujo: ModoDibujo;
  onModoDibujo: (modo: ModoDibujo) => void;
  hayTabla: boolean;
  tablaSeleccionada: boolean;
  onSeleccionarTabla: () => void;
  vistaPrevia: boolean;
  onVistaPrevia: () => void;
  verEtiquetas: boolean;
  onVerEtiquetas: () => void;
  zoom: number;
  onZoom: (z: number) => void;
  puedeDeshacer: boolean;
  puedeRehacer: boolean;
  onDeshacer: () => void;
  onRehacer: () => void;
  cargandoIa: boolean;
  onReconocerConIa: () => void;
  /** Cuántos recuadros quedan sin saber qué dato llevan. */
  sinIdentificar: number;
}

function BarraHerramientas(p: PropsBarra) {
  const alternar = (modo: NonNullable<ModoDibujo>) =>
    p.onModoDibujo(p.modoDibujo === modo ? null : modo);

  return (
    <div className="plantilla-lienzo-barra">
      <div className="plantilla-toolbar-grupo">
        <button
          type="button"
          className={`btn btn-sm ${p.modoDibujo === 'campo' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => alternar('campo')}
          title="Coloca un recuadro que se rellenará con un dato de cada factura"
        >
          <Plus size={14} /> Añadir dato
        </button>
        <button
          type="button"
          className={`btn btn-sm ${p.modoDibujo === 'rotulo' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => alternar('rotulo')}
          title="Escribe un texto fijo nuevo que el PDF original no traía"
        >
          <Type size={14} /> Rótulo
        </button>
        <button
          type="button"
          className={`btn btn-sm ${p.modoDibujo === 'zona' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => alternar('zona')}
          title="Tapa cualquier resto del documento de muestra"
        >
          <Eraser size={14} /> Tapar
        </button>
        <button
          type="button"
          className={`btn btn-sm ${p.modoDibujo === 'rejilla' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => alternar('rejilla')}
          title="Marca el cuadro de desglose del pie: se rellena con un renglón por tipo impositivo"
        >
          <Rows3 size={14} /> Desglose
        </button>
        <button
          type="button"
          className={`btn btn-sm ${p.modoDibujo === 'pagos' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => alternar('pagos')}
          title="Marca el cuadro de vencimientos: se rellena con cuándo, cuánto y cómo se paga"
        >
          <CalendarClock size={14} /> Pagos
        </button>
        {p.hayTabla && (
          <button
            type="button"
            className={`btn btn-sm ${p.tablaSeleccionada ? 'btn-primary' : 'btn-secondary'}`}
            onClick={p.onSeleccionarTabla}
          >
            <Table2 size={14} /> Tabla
          </button>
        )}
      </div>

      <div className="plantilla-toolbar-grupo">
        {/* Sólo tiene sentido si queda algo por identificar. */}
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          onClick={p.onReconocerConIa}
          disabled={p.cargandoIa || p.sinIdentificar === 0}
          title={p.sinIdentificar === 0
            ? 'Todos los recuadros tienen ya un dato asignado'
            : `Pregunta a la IA qué dato va en los ${p.sinIdentificar} recuadros sin identificar`}
        >
          <Sparkles size={14} />
          {p.cargandoIa ? 'Analizando…' : `Identificar con IA (${p.sinIdentificar})`}
        </button>
      </div>

      <div className="plantilla-toolbar-grupo">
        <button
          type="button"
          className="btn btn-ghost btn-icon btn-sm"
          onClick={p.onDeshacer}
          disabled={!p.puedeDeshacer}
          title="Deshacer (Ctrl+Z)"
        >
          <Undo2 size={14} />
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-icon btn-sm"
          onClick={p.onRehacer}
          disabled={!p.puedeRehacer}
          title="Rehacer (Ctrl+Mayús+Z)"
        >
          <Redo2 size={14} />
        </button>
      </div>

      <div className="plantilla-toolbar-grupo">
        <button
          type="button"
          className={`plantilla-btn-toggle ${p.vistaPrevia ? 'plantilla-btn-toggle--activo' : ''}`}
          onClick={p.onVistaPrevia}
          title="Ver los datos de muestra colocados sobre tu diseño"
        >
          {p.vistaPrevia ? <EyeOff size={14} /> : <Eye size={14} />}
          {p.vistaPrevia ? 'Ver cajas' : 'Vista previa'}
        </button>
        <button
          type="button"
          className={`plantilla-btn-toggle ${p.verEtiquetas ? 'plantilla-btn-toggle--activo' : ''}`}
          onClick={p.onVerEtiquetas}
          title="Mostrar u ocultar los rótulos de cada recuadro"
        >
          <Tag size={14} /> Etiquetas
        </button>
      </div>

      <div className="plantilla-toolbar-grupo">
        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => p.onZoom(Math.max(0.5, p.zoom - 0.25))} title="Reducir">
          <ZoomOut size={14} />
        </button>
        <span className="plantilla-zoom-badge">{Math.round(p.zoom * 100)}%</span>
        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => p.onZoom(Math.min(4, p.zoom + 0.25))} title="Aumentar">
          <ZoomIn size={14} />
        </button>
        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => p.onZoom(1)} title="Ajustar a la ventana">
          <Maximize2 size={14} />
        </button>
      </div>

      <span className="plantilla-leyenda">
        <i className="plantilla-punto plantilla-punto--seguro" /> Seguro
        <i className="plantilla-punto plantilla-punto--probable" /> Probable
        <i className="plantilla-punto plantilla-punto--dudoso" /> Por confirmar
      </span>
    </div>
  );
}

// ============================================================
// BARRA FLOTANTE DE UN CAMPO
// ============================================================

function SelectorDeClave({ campo, asignadas, recuentosDeColumna, onAsignar, onFijar, ancho }: {
  campo: CampoDetectado;
  asignadas: Set<string>;
  /** `total_col_N` por cada columna propia de la tabla, con su cabecera. */
  recuentosDeColumna: { clave: string; cabecera: string }[];
  onAsignar: (clave: string | null) => void;
  onFijar: () => void;
  ancho?: string;
}) {
  return (
    <select
      className="form-select form-select-sm"
      style={ancho ? { maxWidth: ancho } : undefined}
      aria-label="Dato que se imprime en este recuadro"
      value={campo.fijo ? '__fijo' : (campo.clave ?? '')}
      onChange={(e) => {
        const valor = e.target.value;
        if (valor === '__fijo') onFijar();
        else onAsignar(valor || null);
      }}
    >
      <option value="">— Sin asignar —</option>
      <option value="__fijo">Texto fijo del diseño</option>
      {camposPorGrupo().map(grupo => (
        <optgroup key={grupo.grupo} label={grupo.titulo}>
          {grupo.campos.map(opcion => (
            <option key={opcion.clave} value={opcion.clave}>
              {opcion.etiqueta}
              {opcion.tipo === 'imagen' ? ' (imagen)' : ''}
              {asignadas.has(opcion.clave) && opcion.clave !== campo.clave ? ' · en uso' : ''}
            </option>
          ))}
        </optgroup>
      ))}
      {/* Recuentos de las columnas propias de esta plantilla. Es lo que hace
          que la casilla «CAJAS» de un impreso de reparto salga sola: suma la
          columna «CAJ.» de las líneas. Sirve igual para bultos, palés, kilos
          u horas, según lo que tenga la tabla de cada negocio. */}
      {recuentosDeColumna.length > 0 && (
        <optgroup label="Recuentos de la tabla">
          {recuentosDeColumna.map(opcion => (
            <option key={opcion.clave} value={opcion.clave}>
              Total de «{opcion.cabecera}»
              {asignadas.has(opcion.clave) && opcion.clave !== campo.clave ? ' · en uso' : ''}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

function BarraCampo({ campo, asignadas, recuentosDeColumna, onAsignar, onFijar, onCambiar, onDuplicar, onEliminar }: {
  campo: CampoDetectado;
  asignadas: Set<string>;
  recuentosDeColumna: { clave: string; cabecera: string }[];
  onAsignar: (clave: string | null) => void;
  onFijar: () => void;
  onCambiar: (cambios: Partial<CampoDetectado>) => void;
  onDuplicar: () => void;
  onEliminar: () => void;
}) {
  return (
    <div className="plantilla-toolbar-canva animate-fade-in">
      <div className="plantilla-toolbar-grupo">
        <SelectorDeClave campo={campo} asignadas={asignadas} recuentosDeColumna={recuentosDeColumna} onAsignar={onAsignar} onFijar={onFijar} ancho="180px" />
      </div>

      <div className="plantilla-toolbar-grupo">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onCambiar({ tamano: Math.max(4, campo.tamano - 0.5) })} title="Reducir la letra">−</button>
        <span className="plantilla-medida">{campo.tamano}pt</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onCambiar({ tamano: Math.min(48, campo.tamano + 0.5) })} title="Aumentar la letra">+</button>
      </div>

      <div className="plantilla-toolbar-grupo">
        <button type="button" className={`btn btn-ghost btn-icon btn-sm ${campo.negrita ? 'btn-primary' : ''}`} onClick={() => onCambiar({ negrita: !campo.negrita })} title="Negrita"><Bold size={13} /></button>
        <button type="button" className={`btn btn-ghost btn-icon btn-sm ${campo.cursiva ? 'btn-primary' : ''}`} onClick={() => onCambiar({ cursiva: !campo.cursiva })} title="Cursiva"><Italic size={13} /></button>
        <button type="button" className={`btn btn-ghost btn-icon btn-sm ${campo.serif ? 'btn-primary' : ''}`} onClick={() => onCambiar({ serif: !campo.serif })} title="Tipografía con remates (serif)"><Type size={13} /></button>
      </div>

      <div className="plantilla-toolbar-grupo">
        {(['left', 'center', 'right'] as const).map(modo => (
          <button
            key={modo}
            type="button"
            className={`btn btn-ghost btn-icon btn-sm ${campo.alineacion === modo ? 'btn-primary' : ''}`}
            onClick={() => onCambiar({ alineacion: modo })}
            title={modo === 'left' ? 'Alinear a la izquierda' : modo === 'center' ? 'Centrar' : 'Alinear a la derecha'}
          >
            {modo === 'left' ? <AlignLeft size={13} /> : modo === 'center' ? <AlignCenter size={13} /> : <AlignRight size={13} />}
          </button>
        ))}
      </div>

      <div className="plantilla-toolbar-grupo">
        <input
          type="color"
          className="plantilla-color plantilla-color--mini"
          value={/^#[0-9a-f]{6}$/i.test(campo.color) ? campo.color : '#111111'}
          onChange={(e) => onCambiar({ color: e.target.value })}
          title="Color del texto"
          aria-label="Color del texto"
        />
      </div>

      <div className="plantilla-toolbar-grupo plantilla-toolbar-grupo--final">
        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={onDuplicar} title="Duplicar (Ctrl+D)"><Copy size={13} /></button>
        <button type="button" className="btn btn-ghost btn-icon btn-sm text-danger" onClick={onEliminar} title="Eliminar (Supr)"><Trash2 size={13} /></button>
      </div>
    </div>
  );
}

function BarraGrupo({ cuantos, onAlinear, onDistribuir, onCambiar, onDuplicar, onEliminar }: {
  cuantos: number;
  onAlinear: (modo: ModoAlinear) => void;
  onDistribuir: (eje: 'horizontal' | 'vertical') => void;
  onCambiar: (cambios: Partial<CampoDetectado>) => void;
  onDuplicar: () => void;
  onEliminar: () => void;
}) {
  const alineaciones: { modo: ModoAlinear; icono: React.ReactNode; titulo: string }[] = [
    { modo: 'izquierda', icono: <AlignLeft size={13} />, titulo: 'Alinear a la izquierda' },
    { modo: 'centro-h', icono: <AlignHorizontalJustifyCenter size={13} />, titulo: 'Centrar en horizontal' },
    { modo: 'derecha', icono: <AlignRight size={13} />, titulo: 'Alinear a la derecha' },
    { modo: 'arriba', icono: <AlignStartHorizontal size={13} />, titulo: 'Alinear arriba' },
    { modo: 'centro-v', icono: <AlignVerticalJustifyCenter size={13} />, titulo: 'Centrar en vertical' },
    { modo: 'abajo', icono: <AlignEndHorizontal size={13} />, titulo: 'Alinear abajo' },
  ];

  return (
    <div className="plantilla-toolbar-canva animate-fade-in">
      <span className="plantilla-medida plantilla-medida--ancha">{cuantos} elementos</span>

      <div className="plantilla-toolbar-grupo">
        {alineaciones.map(a => (
          <button key={a.modo} type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => onAlinear(a.modo)} title={a.titulo}>
            {a.icono}
          </button>
        ))}
      </div>

      <div className="plantilla-toolbar-grupo">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDistribuir('horizontal')} title="Repartir el hueco en horizontal">↔ Repartir</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDistribuir('vertical')} title="Repartir el hueco en vertical">↕ Repartir</button>
      </div>

      <div className="plantilla-toolbar-grupo">
        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => onCambiar({ negrita: true })} title="Poner en negrita todos"><Bold size={13} /></button>
        {(['left', 'center', 'right'] as const).map(modo => (
          <button key={modo} type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => onCambiar({ alineacion: modo })} title="Alinear el texto de todos">
            {modo === 'left' ? <AlignLeft size={13} /> : modo === 'center' ? <AlignCenter size={13} /> : <AlignRight size={13} />}
          </button>
        ))}
      </div>

      <div className="plantilla-toolbar-grupo plantilla-toolbar-grupo--final">
        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={onDuplicar} title="Duplicar (Ctrl+D)"><Copy size={13} /></button>
        <button type="button" className="btn btn-ghost btn-icon btn-sm text-danger" onClick={onEliminar} title="Eliminar (Supr)"><Trash2 size={13} /></button>
      </div>
    </div>
  );
}

// ============================================================
// TABLA DIBUJADA SOBRE EL LIENZO
// ============================================================

function TablaEnLienzo({
  tabla, pagina, pxPorMm, seleccionada, soloUna, arrastreColumna, verEtiquetas,
  onPointerDownMarco, onEmpezarTirador, onEmpezarAncho, onEmpezarOrden,
}: {
  tabla: TablaDetectada;
  pagina: { ancho: number; alto: number };
  pxPorMm: number;
  seleccionada: boolean;
  soloUna: boolean;
  arrastreColumna: { desde: number; sobre: number } | null;
  verEtiquetas: boolean;
  onPointerDownMarco: (e: React.PointerEvent) => void;
  onEmpezarTirador: (e: React.PointerEvent, dir: Direccion) => void;
  onEmpezarAncho: (e: React.PointerEvent, indice: number) => void;
  onEmpezarOrden: (e: React.PointerEvent, indice: number) => void;
}) {
  const estilo = tabla.estilo;
  const mostrarCabecera = estilo.mostrarCabecera !== false;
  const puntosAPx = (puntos: number) => Math.max(4, puntos * 0.3528 * pxPorMm);

  // Se pintan tantas filas como caben en el hueco reservado, con un mínimo de
  // tres: es lo que hace falta para ver de un vistazo si el reparto de
  // columnas funciona con descripciones largas y con importes.
  const altoCuerpo = Math.max(0, tabla.altoTotal - (mostrarCabecera ? tabla.altoCabecera : 0));
  const cuantasFilas = Math.max(1, Math.min(12, Math.floor(altoCuerpo / Math.max(1, tabla.altoFila))));

  const fondoCabecera = estilo.cabeceraFondo && estilo.cabeceraFondo !== 'transparent'
    ? estilo.cabeceraFondo
    : 'transparent';

  return (
    <div
      role="button"
      tabIndex={0}
      className={`plantilla-tabla-marco ${seleccionada ? 'plantilla-tabla-marco--activa' : ''}`}
      style={{
        left: pct(tabla.x, pagina.ancho), top: pct(tabla.y, pagina.alto),
        width: pct(tabla.ancho, pagina.ancho), height: pct(tabla.altoTotal, pagina.alto),
        outline: estilo.bordeAncho > 0 ? `1px solid ${estilo.bordeColor}` : undefined,
      }}
      onPointerDown={onPointerDownMarco}
      onKeyDown={() => { /* la selección se hace con el ratón */ }}
    >
      {verEtiquetas && (
        <span className="plantilla-tabla-etiqueta"><Move size={11} /> Líneas de la factura</span>
      )}

      {/* Papel de la tabla: tapa el diseño original igual que lo tapará el
          calco al imprimir, para que lo que se ve editando sea lo que sale. */}
      <div
        className="plantilla-tabla-papel"
        style={{ background: estilo.cuerpoFondo && estilo.cuerpoFondo !== 'transparent' ? estilo.cuerpoFondo : '#ffffff' }}
      />

      {/* --- Cabecera --- */}
      {mostrarCabecera && (
        <div
          className="plantilla-tabla-cabecera"
          style={{ height: pct(tabla.altoCabecera, tabla.altoTotal), background: fondoCabecera }}
        >
          {tabla.columnas.map((columna, indice) => (
            <span
              key={indice}
              className={[
                'plantilla-tabla-celda',
                'plantilla-tabla-celda--cabecera',
                arrastreColumna?.desde === indice ? 'plantilla-tabla-celda--moviendo' : '',
                arrastreColumna && arrastreColumna.sobre === indice && arrastreColumna.desde !== indice
                  ? 'plantilla-tabla-celda--destino' : '',
              ].filter(Boolean).join(' ')}
              style={{
                left: pct(columna.x - tabla.x, tabla.ancho),
                width: pct(columna.ancho, tabla.ancho),
                justifyContent: columna.alineacion === 'right' ? 'flex-end' : columna.alineacion === 'center' ? 'center' : 'flex-start',
                color: estilo.cabeceraTexto,
                fontSize: `${puntosAPx(estilo.tamanoCabecera)}px`,
                fontWeight: estilo.cabeceraNegrita ? 700 : 500,
                paddingLeft: `${estilo.relleno[3] * pxPorMm}px`,
                paddingRight: `${estilo.relleno[1] * pxPorMm}px`,
              }}
              onPointerDown={(e) => onEmpezarOrden(e, indice)}
              title={`«${columna.cabecera}» · arrástrala para cambiarla de sitio`}
            >
              {seleccionada && <GripVertical size={Math.max(8, puntosAPx(estilo.tamanoCabecera) * 0.9)} className="plantilla-tabla-asa" />}
              <span className="plantilla-tabla-texto">{columna.cabecera}</span>
            </span>
          ))}
        </div>
      )}

      {/* --- Filas de muestra --- */}
      {Array.from({ length: cuantasFilas }).map((_, fila) => (
        <div
          key={fila}
          className="plantilla-tabla-fila"
          style={{
            top: `${((mostrarCabecera ? tabla.altoCabecera : 0) + fila * tabla.altoFila) / tabla.altoTotal * 100}%`,
            height: pct(tabla.altoFila, tabla.altoTotal),
            background: fila % 2 === 1 && estilo.filaAlterna && estilo.filaAlterna !== 'transparent'
              ? estilo.filaAlterna
              : 'transparent',
            borderBottom: estilo.bordeFilas > 0 ? `1px solid ${estilo.bordeColor}` : 'none',
          }}
        >
          {tabla.columnas.map((columna, indice) => (
            <span
              key={indice}
              className="plantilla-tabla-celda"
              style={{
                left: pct(columna.x - tabla.x, tabla.ancho),
                width: pct(columna.ancho, tabla.ancho),
                justifyContent: columna.alineacion === 'right' ? 'flex-end' : columna.alineacion === 'center' ? 'center' : 'flex-start',
                color: estilo.cuerpoTexto,
                fontSize: `${puntosAPx(estilo.tamanoCuerpo)}px`,
                paddingLeft: `${estilo.relleno[3] * pxPorMm}px`,
                paddingRight: `${estilo.relleno[1] * pxPorMm}px`,
              }}
            >
              <span className="plantilla-tabla-texto">{ejemploDeColumna(columna.clave, fila)}</span>
            </span>
          ))}
        </div>
      ))}

      {/* --- Separadores arrastrables --- */}
      {tabla.columnas.slice(0, -1).map((columna, indice) => (
        <span
          key={`div-${indice}`}
          className={`plantilla-divisor ${seleccionada ? 'plantilla-divisor--visible' : ''}`}
          style={{ left: pct(columna.x + columna.ancho - tabla.x, tabla.ancho) }}
          onPointerDown={(e) => onEmpezarAncho(e, indice)}
          title={`Ajustar el ancho de «${columna.cabecera || indice + 1}»`}
        />
      ))}

      {seleccionada && soloUna && <Tiradores onEmpezar={onEmpezarTirador} />}
    </div>
  );
}

// ============================================================
// PANELES
// ============================================================

function CajaNumerica({ caja, onCambiar }: {
  caja: Caja;
  onCambiar: (cambios: Partial<Caja>) => void;
}) {
  const campos: { clave: keyof Caja; etiqueta: string }[] = [
    { clave: 'x', etiqueta: 'X' },
    { clave: 'y', etiqueta: 'Y' },
    { clave: 'ancho', etiqueta: 'Ancho' },
    { clave: 'alto', etiqueta: 'Alto' },
  ];

  return (
    <div className="plantilla-caja-numerica">
      {campos.map(({ clave, etiqueta }) => (
        <label key={clave}>
          <span>{etiqueta}</span>
          <input
            type="number"
            className="form-input form-input-sm"
            step={0.5}
            value={redondearMm(caja[clave])}
            onChange={(e) => onCambiar({ [clave]: Number(e.target.value) || 0 } as Partial<Caja>)}
          />
        </label>
      ))}
      <span className="plantilla-caja-unidad">milímetros sobre el papel</span>
    </div>
  );
}

function PanelCampo({ campo, asignadas, recuentosDeColumna, onAsignar, onCambiar, onEliminar, onDuplicar }: {
  campo: CampoDetectado;
  asignadas: Set<string>;
  recuentosDeColumna: { clave: string; cabecera: string }[];
  onAsignar: (clave: string | null) => void;
  onCambiar: (cambios: Partial<CampoDetectado>) => void;
  onEliminar: () => void;
  onDuplicar: () => void;
}) {
  const definicion = campo.clave ? campoPorClave(campo.clave) : undefined;

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h4 className="card-title">Elemento seleccionado</h4>
          <p className="card-subtitle">
            {campo.valorOriginal ? `«${campo.valorOriginal}»` : campo.texto ? `«${campo.texto}»` : 'Recuadro nuevo'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onDuplicar} title="Duplicar"><Copy size={14} /></button>
          <button className="btn btn-ghost btn-icon btn-sm text-danger" onClick={onEliminar} title="Eliminar"><Trash2 size={14} /></button>
        </div>
      </div>

      <div className="plantilla-interruptor">
        <button
          type="button"
          className={`btn btn-sm ${!campo.fijo ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => onCambiar({ fijo: false })}
        >
          <Unlock size={14} /> Dato modificable
        </button>
        <button
          type="button"
          className={`btn btn-sm ${campo.fijo ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => onCambiar({ fijo: true, clave: null, texto: campo.texto ?? campo.valorOriginal })}
        >
          <Lock size={14} /> Texto fijo
        </button>
      </div>

      {campo.fijo ? (
        <div className="form-group">
          <label className="form-label" htmlFor="campo-texto-fijo">Texto que se imprime siempre</label>
          <textarea
            id="campo-texto-fijo"
            className="form-input"
            rows={2}
            value={campo.texto ?? ''}
            placeholder={campo.valorOriginal || 'Escribe el rótulo'}
            onChange={(e) => onCambiar({ texto: e.target.value })}
          />
          <p className="plantilla-ayuda">
            {campo.manual
              ? 'Este rótulo lo añades tú: se imprime en todas las páginas, encima del diseño calcado.'
              : 'Déjalo vacío para conservar exactamente lo que ya venía impreso en tu PDF.'}
          </p>
        </div>
      ) : (
        <>
          <div className="form-group">
            <label className="form-label" htmlFor="campo-clave">¿Qué dato de la factura va aquí?</label>
            <SelectorDeClave
              campo={campo}
              asignadas={asignadas}
              recuentosDeColumna={recuentosDeColumna}
              onAsignar={onAsignar}
              onFijar={() => onCambiar({ fijo: true, clave: null, texto: campo.texto ?? campo.valorOriginal })}
            />
          </div>
          {definicion && <p className="plantilla-ayuda">{definicion.descripcion}</p>}
          {definicion?.tipo === 'imagen' && (
            <div className="callout callout-info plantilla-callout-compacto">
              <div>
                <strong>Se imprime como imagen</strong>
                <p>Ajusta el recuadro al tamaño que quieras: la imagen se centra dentro sin deformarse.</p>
              </div>
            </div>
          )}
          {!campo.clave && (
            <div className="callout callout-warning plantilla-callout-compacto">
              <div><p>Sin asignar saldrá en blanco en todas las facturas.</p></div>
            </div>
          )}
        </>
      )}

      <div className="plantilla-motivo">
        <Info size={13} />
        <span>{campo.motivo}</span>
      </div>

      {campo.tipo !== 'imagen' && (
        <div className="plantilla-estilo">
          <label className="form-label" htmlFor="campo-tamano">Tamaño (pt)</label>
          <input id="campo-tamano" className="form-input" type="number" min={4} max={48} step={0.5}
            value={campo.tamano}
            onChange={(e) => onCambiar({ tamano: Number(e.target.value) || 9 })} />

          <label className="form-label" htmlFor="campo-interlineado">Interlineado</label>
          <input id="campo-interlineado" className="form-input" type="number" min={1} max={3} step={0.05}
            value={redondearMm(campo.interlineado)}
            onChange={(e) => onCambiar({ interlineado: Number(e.target.value) || 1.15 })} />

          <label className="form-label" htmlFor="campo-alineacion">Alineación</label>
          <select id="campo-alineacion" className="form-select" value={campo.alineacion}
            onChange={(e) => onCambiar({ alineacion: e.target.value as CampoDetectado['alineacion'] })}>
            <option value="left">Izquierda</option>
            <option value="center">Centro</option>
            <option value="right">Derecha</option>
          </select>

          <label className="form-label" htmlFor="campo-color">Color</label>
          <input id="campo-color" className="form-input plantilla-color" type="color"
            value={/^#[0-9a-f]{6}$/i.test(campo.color) ? campo.color : '#111111'}
            onChange={(e) => onCambiar({ color: e.target.value })} />

          <label className="form-label" htmlFor="campo-negrita">Negrita</label>
          <input id="campo-negrita" type="checkbox" checked={campo.negrita}
            onChange={(e) => onCambiar({ negrita: e.target.checked })} />

          <label className="form-label" htmlFor="campo-cursiva">Cursiva</label>
          <input id="campo-cursiva" type="checkbox" checked={campo.cursiva}
            onChange={(e) => onCambiar({ cursiva: e.target.checked })} />
        </div>
      )}

      <div className="plantilla-separador" />
      <CajaNumerica caja={campo} onCambiar={(cambios) => onCambiar(cambios)} />
    </div>
  );
}

function PanelTabla({ tabla, onCambiar, onHacerSitio }: {
  tabla: TablaDetectada;
  onCambiar: (t: TablaDetectada) => void;
  onHacerSitio: (milimetros: number) => void;
}) {
  const estilo = tabla.estilo;
  const cambiarEstilo = (cambios: Partial<typeof estilo>) => onCambiar({ ...tabla, estilo: { ...estilo, ...cambios } });
  const esFondoTransparente = !estilo.cabeceraFondo || estilo.cabeceraFondo === 'transparent' || estilo.cabeceraFondo === '#ffffff';

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h4 className="card-title">Tabla de líneas</h4>
          <p className="card-subtitle">Arrástrala en la factura para moverla, o estírala por sus tiradores.</p>
        </div>
      </div>

      <div className="plantilla-estilo">
        <label className="form-label">Fondo de cabecera</label>
        <div className="plantilla-fila-color">
          <button
            type="button"
            className={`plantilla-btn-transparente ${esFondoTransparente ? 'plantilla-btn-transparente--activo' : ''}`}
            onClick={() => cambiarEstilo({ cabeceraFondo: 'transparent' })}
          >
            Sin fondo
          </button>
          <input type="color" className="plantilla-color plantilla-color--mini"
            value={normalizarColor(estilo.cabeceraFondo)}
            onChange={(e) => cambiarEstilo({ cabeceraFondo: e.target.value })}
            aria-label="Color de fondo de la cabecera" />
        </div>

        <label className="form-label" htmlFor="tabla-mostrar-cab">Mostrar títulos</label>
        <input id="tabla-mostrar-cab" type="checkbox" checked={estilo.mostrarCabecera !== false}
          onChange={(e) => cambiarEstilo({ mostrarCabecera: e.target.checked })} />

        <label className="form-label" htmlFor="tabla-texto-cab">Texto cabecera</label>
        <input id="tabla-texto-cab" className="form-input plantilla-color" type="color"
          value={normalizarColor(estilo.cabeceraTexto)}
          onChange={(e) => cambiarEstilo({ cabeceraTexto: e.target.value })} />

        <label className="form-label" htmlFor="tabla-texto-cuerpo">Texto líneas</label>
        <input id="tabla-texto-cuerpo" className="form-input plantilla-color" type="color"
          value={normalizarColor(estilo.cuerpoTexto)}
          onChange={(e) => cambiarEstilo({ cuerpoTexto: e.target.value })} />

        <label className="form-label" htmlFor="tabla-borde">Color de líneas</label>
        <input id="tabla-borde" className="form-input plantilla-color" type="color"
          value={normalizarColor(estilo.bordeColor)}
          onChange={(e) => cambiarEstilo({ bordeColor: e.target.value })} />

        <label className="form-label" htmlFor="tabla-tam-cab">Letra cabecera</label>
        <input id="tabla-tam-cab" className="form-input" type="number" min={5} max={20} step={0.5}
          value={estilo.tamanoCabecera}
          onChange={(e) => cambiarEstilo({ tamanoCabecera: Number(e.target.value) || 9 })} />

        <label className="form-label" htmlFor="tabla-tam-cuerpo">Letra líneas</label>
        <input id="tabla-tam-cuerpo" className="form-input" type="number" min={5} max={20} step={0.5}
          value={estilo.tamanoCuerpo}
          onChange={(e) => cambiarEstilo({ tamanoCuerpo: Number(e.target.value) || 9 })} />

        <label className="form-label">Caben ahora</label>
        <span className="plantilla-panel-pista">
          {Math.max(0, Math.floor((tabla.altoTotal - tabla.altoCabecera) / Math.max(1, tabla.altoFila)))} líneas
        </span>
      </div>

      <div className="plantilla-panel-fila plantilla-hacer-sitio">
        <span className="form-label">Hacer sitio</span>
        <div className="plantilla-hacer-sitio-botones">
          {[10, 25].map(mm => (
            <button key={mm} type="button" className="btn btn-sm btn-secondary" onClick={() => onHacerSitio(mm)}>
              +{mm} mm
            </button>
          ))}
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => onHacerSitio(-15)}>
            −15 mm
          </button>
        </div>
      </div>
      <p className="plantilla-panel-pista">
        Agranda el hueco de la tabla y baja lo que tenga debajo —totales, desglose y pie— para
        que no se le eche encima. Lo que no quepa seguirá pasando a la hoja siguiente.
      </p>

      <div className="plantilla-panel-fila">
        <label className="form-label" htmlFor="tabla-alto-fila">Alto de fila (mm)</label>
        <input id="tabla-alto-fila" className="form-input" type="number" min={2} max={30} step={0.2}
          value={redondearMm(tabla.altoFila)}
          onChange={(e) => onCambiar({ ...tabla, altoFila: Number(e.target.value) || 5 })} />

        <label className="form-label" htmlFor="tabla-relleno">Margen interior (mm)</label>
        <input id="tabla-relleno" className="form-input" type="number" min={0} max={8} step={0.2}
          value={estilo.relleno[0]}
          onChange={(e) => {
            const v = Number(e.target.value) || 0;
            cambiarEstilo({ relleno: [v, estilo.relleno[1], v, estilo.relleno[3]] });
          }} />

        <label className="form-label" htmlFor="tabla-lineas">Rayas entre filas</label>
        <input id="tabla-lineas" type="checkbox" checked={estilo.bordeFilas > 0}
          onChange={(e) => cambiarEstilo({ bordeFilas: e.target.checked ? 0.1 : 0 })} />

        <label className="form-label" htmlFor="tabla-marco">Marco exterior</label>
        <input id="tabla-marco" type="checkbox" checked={estilo.bordeAncho > 0}
          onChange={(e) => cambiarEstilo({ bordeAncho: e.target.checked ? 0.2 : 0 })} />

        <label className="form-label" htmlFor="tabla-zebra">Filas alternas</label>
        <input id="tabla-zebra" type="checkbox" checked={Boolean(estilo.filaAlterna) && estilo.filaAlterna !== 'transparent'}
          onChange={(e) => cambiarEstilo({ filaAlterna: e.target.checked ? '#f4f4f5' : 'transparent' })} />
      </div>

      <div className="plantilla-separador" />
      <CajaNumerica
        caja={{ x: tabla.x, y: tabla.y, ancho: tabla.ancho, alto: tabla.altoTotal }}
        onCambiar={(cambios) => {
          const ancho = cambios.ancho ?? tabla.ancho;
          const x = cambios.x ?? tabla.x;
          onCambiar({
            ...tabla,
            x,
            y: cambios.y ?? tabla.y,
            ancho,
            altoTotal: cambios.alto ?? tabla.altoTotal,
            columnas: ancho !== tabla.ancho
              ? escalarColumnas(tabla.columnas, tabla.ancho, ancho, x)
              : recolocarColumnas(tabla.columnas, x),
          });
        }}
      />
    </div>
  );
}

// ============================================================
// COLUMNAS
// ============================================================

function PanelColumnas({ tabla, onCambiar, onSeleccionarTabla }: {
  tabla: TablaDetectada;
  onCambiar: (t: TablaDetectada) => void;
  onSeleccionarTabla: () => void;
}) {
  const [arrastrando, setArrastrando] = useState<number | null>(null);
  const [destino, setDestino] = useState<number | null>(null);

  const soltar = () => {
    if (arrastrando !== null && destino !== null && arrastrando !== destino) {
      onCambiar({ ...tabla, columnas: moverColumna(tabla.columnas, arrastrando, destino, tabla.x) });
    }
    setArrastrando(null);
    setDestino(null);
  };

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h4 className="card-title">Columnas de las líneas</h4>
          <p className="card-subtitle">
            Arrastra por el asa para cambiar el orden. Los separadores de la factura reparten el ancho.
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => onCambiar({ ...tabla, columnas: igualarColumnas(tabla) })} title="Repartir el ancho a partes iguales">
          Igualar
        </button>
      </div>

      <ul className="plantilla-columnas">
        {tabla.columnas.map((columna, indice) => (
          <li
            key={indice}
            className={[
              'plantilla-columna',
              arrastrando === indice ? 'plantilla-columna--moviendo' : '',
              destino === indice && arrastrando !== null && arrastrando !== indice ? 'plantilla-columna--destino' : '',
            ].filter(Boolean).join(' ')}
            draggable
            onDragStart={() => setArrastrando(indice)}
            onDragOver={(e) => { e.preventDefault(); setDestino(indice); }}
            onDragEnd={soltar}
            onDrop={(e) => { e.preventDefault(); soltar(); }}
          >
            <span className="plantilla-columna-asa" title="Arrastra para cambiar el orden"><GripVertical size={13} /></span>

            <input
              className="form-input plantilla-columna-cabecera"
              value={columna.cabecera}
              aria-label={`Título de la columna ${indice + 1}`}
              onChange={(e) => onCambiar({
                ...tabla,
                columnas: tabla.columnas.map((c, i) => (i === indice ? { ...c, cabecera: e.target.value } : c)),
              })}
            />

            <select
              className="form-select"
              aria-label={`Contenido de la columna ${indice + 1}`}
              value={columna.clave ?? ''}
              onChange={(e) => {
                const elegido = e.target.value;
                const clave = elegido === '__nueva_personalizada__'
                  ? siguienteColumnaPersonalizada(tabla.columnas.map(c => c.clave ?? ''))
                  : (elegido || null);
                onCambiar({
                  ...tabla,
                  columnas: tabla.columnas.map((c, i) => (i === indice ? { ...c, clave } : c)),
                });
              }}
            >
              <option value="">— Vacía —</option>
              {COLUMNAS_LINEAS.map(opcion => (
                <option key={opcion.clave} value={opcion.clave}>{opcion.etiqueta}</option>
              ))}
              {columna.clave && esColumnaPersonalizada(columna.clave) && (
                <option value={columna.clave}>{etiquetaDeColumnaPersonalizada(columna.clave)}</option>
              )}
              <option value="__nueva_personalizada__">— Dato propio de esta plantilla —</option>
            </select>

            <select
              className="form-select"
              aria-label={`Alineación de la columna ${indice + 1}`}
              value={columna.alineacion}
              onChange={(e) => onCambiar({
                ...tabla,
                columnas: tabla.columnas.map((c, i) => (i === indice ? { ...c, alineacion: e.target.value as typeof c.alineacion } : c)),
              })}
            >
              <option value="left">Izq.</option>
              <option value="center">Centro</option>
              <option value="right">Der.</option>
            </select>

            <input
              className="form-input plantilla-columna-ancho"
              type="number"
              min={6}
              step={0.5}
              value={redondearMm(columna.ancho)}
              aria-label={`Ancho en milímetros de la columna ${indice + 1}`}
              title="Ancho en milímetros"
              onChange={(e) => {
                const ancho = Number(e.target.value) || 6;
                onCambiar({
                  ...tabla,
                  columnas: recolocarColumnas(
                    tabla.columnas.map((c, i) => (i === indice ? { ...c, ancho } : c)),
                    tabla.x,
                  ),
                });
              }}
            />

            <button
              className="btn btn-ghost btn-icon btn-sm"
              title="Quitar la columna"
              disabled={tabla.columnas.length <= 1}
              onClick={() => onCambiar({ ...tabla, columnas: quitarColumna(tabla.columnas, indice, tabla.x) })}
            >
              <Trash2 size={13} />
            </button>
          </li>
        ))}
      </ul>

      <div className="plantilla-columnas-acciones">
        <button className="btn btn-secondary btn-sm" onClick={() => onCambiar({ ...tabla, columnas: anadirColumna(tabla.columnas, tabla.x) })}>
          <Plus size={13} /> Añadir columna
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onSeleccionarTabla}>
          <Table2 size={13} /> Ver la tabla en el papel
        </button>
      </div>

      {tabla.columnas.some(c => c.clave && esColumnaPersonalizada(c.clave)) && (
        <div className="callout callout-info plantilla-callout-compacto">
          <div>
            <strong>Datos propios en las líneas</strong>
            <p>
              Las columnas marcadas como dato propio se piden línea a línea al crear la factura,
              así que puedes usarlas para lo que tu diseño necesite (lote, obra, bulto…).
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// LISTA DE ELEMENTOS
// ============================================================

function ListaElementos({
  campos, textosFijos, filtro, onFiltro, busqueda, onBusqueda,
  seleccionados, onSeleccionar, onAlternarFijo, onConvertir, nombreDe,
}: {
  campos: CampoDetectado[];
  textosFijos: SegmentoTexto[];
  filtro: 'todos' | 'modificables' | 'fijos' | 'sin_asignar';
  onFiltro: (f: 'todos' | 'modificables' | 'fijos' | 'sin_asignar') => void;
  busqueda: string;
  onBusqueda: (b: string) => void;
  seleccionados: Set<string>;
  onSeleccionar: (id: string, aditiva: boolean) => void;
  onAlternarFijo: (campo: CampoDetectado) => void;
  onConvertir: (segmento: SegmentoTexto) => void;
  /** Cómo se llama un campo de cara al usuario (ver `nombreDe` del revisor). */
  nombreDe: (clave: string) => string;
}) {
  const texto = busqueda.trim().toLowerCase();
  const coincide = (valor: string) => !texto || valor.toLowerCase().includes(texto);

  const camposVisibles = useMemo(() => {
    const filtrados = campos.filter(c => {
      if (filtro === 'modificables') return !c.fijo && Boolean(c.clave);
      if (filtro === 'sin_asignar') return !c.fijo && !c.clave;
      if (filtro === 'fijos') return c.fijo;
      return true;
    });
    return filtrados
      .filter(c => coincide(`${c.valorOriginal} ${c.texto ?? ''} ${c.clave ? nombreDe(c.clave) : ''}`))
      .sort(ordenDeLectura);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campos, filtro, texto, nombreDe]);

  const segmentosVisibles = useMemo(
    () => (filtro === 'todos' || filtro === 'fijos' ? textosFijos.filter(s => coincide(s.texto)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [textosFijos, filtro, texto],
  );

  const filtros = [
    { clave: 'todos' as const, etiqueta: 'Todos', cuenta: campos.length + textosFijos.length },
    { clave: 'modificables' as const, etiqueta: 'Modificables', cuenta: campos.filter(c => !c.fijo && c.clave).length },
    { clave: 'sin_asignar' as const, etiqueta: 'Sin asignar', cuenta: campos.filter(c => !c.fijo && !c.clave).length },
    { clave: 'fijos' as const, etiqueta: 'Fijos', cuenta: campos.filter(c => c.fijo).length + textosFijos.length },
  ];

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h4 className="card-title"><Layers size={14} /> Todo el texto de la factura</h4>
          <p className="card-subtitle">
            Cada línea del PDF, marcada como dato modificable o como parte fija del diseño.
          </p>
        </div>
      </div>

      <div className="plantilla-buscador">
        <Search size={13} />
        <input
          className="form-input form-input-sm"
          placeholder="Buscar un texto…"
          value={busqueda}
          onChange={(e) => onBusqueda(e.target.value)}
          aria-label="Buscar entre los textos de la factura"
        />
      </div>

      <div className="plantilla-filtros">
        {filtros.map(f => (
          <button
            key={f.clave}
            type="button"
            className={`btn btn-xs ${filtro === f.clave ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => onFiltro(f.clave)}
          >
            {f.etiqueta} ({f.cuenta})
          </button>
        ))}
      </div>

      <ul className="plantilla-fijos">
        {camposVisibles.map(c => {
          const activo = seleccionados.has(`campo:${c.id}`);
          return (
            <li
              key={c.id}
              className={`plantilla-elemento ${activo ? 'plantilla-elemento--activo' : ''}`}
              onClick={(e) => onSeleccionar(c.id, e.shiftKey || e.ctrlKey || e.metaKey)}
            >
              <div className="plantilla-elemento-cuerpo">
                <div className="plantilla-elemento-texto">
                  {c.valorOriginal || c.texto || '(recuadro vacío)'}
                </div>
                <div className="plantilla-elemento-estado">
                  {c.fijo ? (
                    <span className="plantilla-marca plantilla-marca--fijo"><Lock size={10} /> Fijo</span>
                  ) : c.clave ? (
                    <span className="plantilla-marca plantilla-marca--dato">
                      {c.tipo === 'imagen' ? <ImageIcon size={10} /> : <Check size={10} />} {nombreDe(c.clave)}
                    </span>
                  ) : (
                    <span className="plantilla-marca plantilla-marca--pendiente"><AlertTriangle size={10} /> Sin asignar</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                className={`btn btn-xs ${c.fijo ? 'btn-secondary' : 'btn-ghost'}`}
                title={c.fijo ? 'Convertir en dato de factura' : 'Marcar como texto fijo del diseño'}
                onClick={(e) => { e.stopPropagation(); onAlternarFijo(c); }}
              >
                {c.fijo ? 'Hacer modificable' : 'Hacer fijo'}
              </button>
            </li>
          );
        })}

        {segmentosVisibles.map((segmento, idx) => (
          <li
            key={`seg-${idx}`}
            className="plantilla-elemento plantilla-elemento--diseno"
            onClick={() => onConvertir(segmento)}
          >
            <div className="plantilla-elemento-cuerpo">
              <div className="plantilla-elemento-texto">{segmento.texto}</div>
              <div className="plantilla-elemento-estado">
                <span className="plantilla-marca plantilla-marca--fijo"><Lock size={10} /> Rótulo del diseño</span>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-xs btn-secondary"
              title="Convertir este rótulo en un dato que se rellena solo"
              onClick={(e) => { e.stopPropagation(); onConvertir(segmento); }}
            >
              Hacer modificable
            </button>
          </li>
        ))}

        {camposVisibles.length === 0 && segmentosVisibles.length === 0 && (
          <li className="plantilla-fijos-vacio">No hay textos en esta categoría.</li>
        )}
      </ul>
    </div>
  );
}

// ============================================================
// AYUDAS
// ============================================================

function normalizarColor(color: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : '#ffffff';
}


/**
 * Ajustes del cuadro de desglose.
 *
 * Lo que hay que poder decir aquí es qué dato lleva cada columna, porque eso
 * cambia de un impreso a otro: unos ponen el nombre del impuesto y otros no,
 * unos separan base y cuota y otros traen además el total, y algunos llevan
 * columnas —las retenciones— que no son parte del desglose. Sin poder
 * asignarlas a mano, un impreso que no siga el patrón español de siempre no
 * habría manera de montarlo.
 */
function PanelRejilla({ rejilla, onCambiar, onEliminar }: {
  rejilla: RejillaDetectada;
  onCambiar: (r: RejillaDetectada) => void;
  onEliminar: () => void;
}) {
  const caben = Math.max(1, Math.floor(
    (rejilla.y + rejilla.alto - rejilla.yPrimerRenglon) / rejilla.altoRenglon,
  ));
  const asignadas = new Set(rejilla.columnas.map(c => c.clave).filter(Boolean) as string[]);

  const cambiarColumna = (indice: number, cambios: Partial<ColumnaRejilla>) =>
    onCambiar({
      ...rejilla,
      columnas: rejilla.columnas.map((c, i) => (i === indice ? { ...c, ...cambios } : c)),
    });

  return (
    <div className="card plantilla-panel">
      <div className="plantilla-panel-cabecera">
        <h3><Rows3 size={15} /> Cuadro de desglose</h3>
        <button type="button" className="btn btn-sm btn-secondary" onClick={onEliminar}>
          <Trash2 size={13} /> Quitar
        </button>
      </div>

      <p className="plantilla-panel-nota">
        Se rellena solo, con un renglón por cada tipo impositivo de la factura.
        Aquí caben <strong>{caben}</strong>; si alguna factura trae más, los
        renglones se aprietan para que quepan dentro del recuadro.
      </p>

      <div className="plantilla-panel-campo">
        <label htmlFor="rejilla-alto">Alto de renglón</label>
        <input
          id="rejilla-alto"
          type="number"
          step="0.1"
          min="1.5"
          value={Math.round(rejilla.altoRenglon * 10) / 10}
          onChange={(e) => {
            const alto = Number(e.target.value);
            if (alto >= 1.5) onCambiar({ ...rejilla, altoRenglon: alto });
          }}
        />
      </div>

      <div className="plantilla-panel-campo">
        <label htmlFor="rejilla-primer">Primer renglón (mm desde arriba)</label>
        <input
          id="rejilla-primer"
          type="number"
          step="0.5"
          value={Math.round(rejilla.yPrimerRenglon * 10) / 10}
          onChange={(e) => onCambiar({ ...rejilla, yPrimerRenglon: Number(e.target.value) })}
        />
      </div>

      <div className="plantilla-panel-fila">
        <label className="form-label" htmlFor="rejilla-cabecera">Poner los títulos</label>
        <input
          id="rejilla-cabecera"
          type="checkbox"
          checked={rejilla.cabecera}
          onChange={(e) => onCambiar({ ...rejilla, cabecera: e.target.checked })}
        />
      </div>
      <p className="plantilla-panel-pista">
        Imprime el nombre de cada columna encima de las cifras. Déjalo apagado si tu impreso ya
        los trae pintados, o los verás por duplicado.
      </p>

      <h4 className="plantilla-panel-subtitulo">Rayas del cuadro</h4>
      <p className="plantilla-panel-pista">
        Cada una por su lado, porque los impresos vienen de todas las maneras: unos traen el
        marco pintado y no separan los renglones, otros rayan las columnas y dejan el marco
        abierto. Enciende sólo lo que le falte al tuyo.
      </p>
      {([
        ['marco', 'Marco exterior'],
        ['renglones', 'Rayas entre renglones'],
        ['columnas', 'Rayas entre columnas'],
      ] as const).map(([clave, etiqueta]) => (
        <div className="plantilla-panel-fila" key={clave}>
          <label className="form-label" htmlFor={`rejilla-${clave}`}>{etiqueta}</label>
          <input
            id={`rejilla-${clave}`}
            type="checkbox"
            checked={rejilla.contorno[clave]}
            onChange={(e) => onCambiar({
              ...rejilla,
              contorno: { ...rejilla.contorno, [clave]: e.target.checked },
            })}
          />
        </div>
      ))}
      <div className="plantilla-panel-campo">
        <label htmlFor="rejilla-grosor">Grosor de las rayas (mm)</label>
        <input
          id="rejilla-grosor"
          type="number"
          step="0.05"
          min="0.05"
          max="1"
          value={rejilla.contorno.grosor}
          onChange={(e) => onCambiar({
            ...rejilla,
            contorno: { ...rejilla.contorno, grosor: Math.max(0.05, Number(e.target.value) || 0.2) },
          })}
        />
      </div>

      <h4 className="plantilla-panel-subtitulo">Qué lleva cada columna</h4>
      {rejilla.columnas.map((columna, i) => (
        <div key={i} className="rejilla-panel-columna">
          <select
            value={columna.clave ?? ''}
            onChange={(e) => cambiarColumna(i, { clave: e.target.value || null })}
            aria-label={`Dato de la columna ${columna.cabecera || i + 1}`}
          >
            <option value="">— sin dato, se deja en blanco —</option>
            {/* Las de su cuadro, no las del otro: en el de pagos no hay
                ninguna base imponible que asignar. */}
            {(rejilla.fuente === 'vencimientos' ? COLUMNAS_VENCIMIENTOS : COLUMNAS_IMPUESTOS).map(opcion => (
              <option
                key={opcion.clave}
                value={opcion.clave}
                disabled={asignadas.has(opcion.clave) && opcion.clave !== columna.clave}
              >
                {opcion.etiqueta}
              </option>
            ))}
          </select>
          <span className="plantilla-panel-pista">{columna.cabecera || '—'}</span>
        </div>
      ))}
    </div>
  );
}
