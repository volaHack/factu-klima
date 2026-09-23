'use client';

/**
 * PANTALLA DE DISEÑO DE DOCUMENTOS
 *
 * El usuario sube un documento suyo en PDF —una factura, un albarán, un
 * presupuesto—, el sistema lo analiza, le enseña lo que ha entendido para
 * que lo confirme y guarda una plantilla con la que a partir de ahí se
 * imprimen todos los suyos con ese mismo diseño.
 *
 * NO TODO DOCUMENTO ES UNA FACTURA
 * --------------------------------
 * Esta pantalla trataba todo lo que pasaba por ella como si lo fuera: se
 * previsualizaba con datos de factura, con el título «FACTURA» y con el QR
 * tributario estampado encima, aunque se estuviera diseñando un albarán.
 * De ahí salía un código QR que el usuario no había colocado. Quién es
 * cada tipo —y si lleva QR— está en `lib/plantillas/tiposDocumento.ts`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, Copy, Download, Eye, FileUp, LayoutTemplate, Loader2, Pencil,
  Save, Sparkles, Star, Trash2, X,
} from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import RevisorPlantilla, { type CambioAnalisis } from '@/components/plantillas/RevisorPlantilla';
import { useToast } from '@/hooks/useToast';
import { getCompanySettings, getInvoices } from '@/lib/storage';
import {
  abrirPlantillaGuardada, analizarPdf, compilar, ErrorArchivo, ErrorPdf,
  origenDeSesion, PlantillaNoEditable, sesionDesdeCero, type SesionAnalisis,
} from '@/lib/plantillas/analisis';
import {
  borrarPlantilla, getPlantillas, guardarPlantilla, marcarPredeterminada,
  PlantillaInvalida,
} from '@/lib/plantillas/almacen';
import { construirDatos, facturaDeMuestra } from '@/lib/plantillas/datos';
import { generarPdfBlob } from '@/lib/plantillas/generar';
import { calcoDePlantilla } from '@/lib/plantillas/plantilla';
import { facturaDesdeCero, OFICIOS, oficioPorId, oficioParaSector } from '@/lib/plantillas/desdeCero';
import type { PlantillaDocumento } from '@/lib/plantillas/tipos';
import {
  algunoLlevaQr, personalidadDe, reconocerTipo, TIPOS_PLANTILLA, tipoDominante,
  type TipoDocumentoPlantilla,
} from '@/lib/plantillas/tiposDocumento';
import type { BusinessSector, CompanySettings, Invoice } from '@/lib/types';

export default function PlantillasPage() {
  const { success, error: avisarError, info } = useToast();
  const entradaArchivo = useRef<HTMLInputElement>(null);

  const [montado, setMontado] = useState(false);
  const [plantillas, setPlantillas] = useState<PlantillaDocumento[]>([]);
  const [ajustes, setAjustes] = useState<CompanySettings | null>(null);
  const [ultimaFactura, setUltimaFactura] = useState<Invoice | null>(null);

  const [sesion, setSesion] = useState<SesionAnalisis | null>(null);
  const [eligiendoOficio, setEligiendoOficio] = useState(false);

  const [nombre, setNombre] = useState('');
  const [aplicaA, setAplicaA] = useState<TipoDocumentoPlantilla[]>(['factura']);
  /** Qué tipo se reconoció en el PDF subido, para poder explicarlo. */
  const [tipoReconocido, setTipoReconocido] = useState<{ palabra: string; seguro: boolean } | null>(null);
  const [analizando, setAnalizando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null);
  const [generandoVista, setGenerandoVista] = useState(false);
  /** Plantilla que se está reeditando, o null si es una subida nueva. */
  const [editando, setEditando] = useState<PlantillaDocumento | null>(null);

  const cargar = useCallback(async () => {
    const [lista, config, facturas] = await Promise.all([
      getPlantillas(),
      getCompanySettings(),
      getInvoices(),
    ]);
    setPlantillas(lista);
    setAjustes(config);
    setUltimaFactura(facturas[0] ?? null);
  }, []);

  /**
   * Empezar sin PDF: se monta una factura española completa sobre papel en
   * blanco y se abre en el editor, igual que si se hubiera subido un impreso.
   *
   * Hace falta porque hasta ahora la única puerta era subir una factura que ya
   * existiera. Quien acaba de darse de alta no tiene ninguna, y se quedaba
   * fuera del sistema entero.
   */
  const empezarDesdeCero = useCallback(async (oficioId: string) => {
    setEligiendoOficio(false);
    try {
      // Por `sesionDesdeCero` y no montando la sesión a mano: el papel en
      // blanco tiene que pasar por el lienzo igual que el calco de un PDF,
      // porque compilar lee sus píxeles. Sin eso, la vista previa fallaba con
      // «Cannot read properties of undefined (reading 'width')».
      const nueva = await sesionDesdeCero(facturaDesdeCero(oficioId, ajustes), oficioId);
      setEditando(null);
      setAplicaA(['factura']);
      setTipoReconocido(null);
      setSesion(nueva);
      setNombre(`Mi factura · ${oficioPorId(oficioId).nombre}`);
      info('Factura nueva', 'Ya está todo lo obligatorio puesto. Mueve lo que quieras y guárdala.');
    } catch {
      avisarError('No se ha podido crear la factura', 'Vuelve a intentarlo en un momento.');
    }
  }, [ajustes, info, avisarError]);

  useEffect(() => {
    (async () => {
      await cargar();
      setMontado(true);
    })();
  }, [cargar]);

  // La vista previa vive en una URL de objeto: hay que soltarla al cerrarla
  // o el PDF se queda ocupando memoria durante toda la sesión.
  useEffect(() => {
    return () => { if (vistaPrevia) URL.revokeObjectURL(vistaPrevia); };
  }, [vistaPrevia]);

  // ============================================================
  // SUBIDA Y ANÁLISIS
  // ============================================================

  const alElegirArchivo = async (evento: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = evento.target.files?.[0];
    evento.target.value = '';
    if (!archivo) return;

    if (!archivo.name.toLowerCase().endsWith('.pdf') && archivo.type !== 'application/pdf') {
      avisarError('Eso no es un PDF', 'Sube el documento en PDF, tal cual se lo envías a tus clientes.');
      return;
    }

    setAnalizando(true);
    try {
      const nueva = await analizarPdf(archivo, ajustes);
      setEditando(null);

      // QUÉ CLASE DE DOCUMENTO ES, ANTES DE NADA
      //
      // Se daba por hecho que toda subida era una factura, y de ahí salía
      // todo lo demás torcido: el título impreso, los datos de muestra y
      // un QR tributario en un albarán. Un impreso español dice lo que es
      // en su titular, así que se lee de ahí.
      const detectado = reconocerTipo(
        nueva.analisis.pagina.items.map(i => ({ texto: i.texto, tamano: i.tamano, y: i.y })),
        nueva.analisis.pagina.alto,
      );
      const tipo = detectado?.tipo ?? 'factura';
      const seguro = (detectado?.confianza ?? 0) >= 0.5;
      setAplicaA([tipo]);
      setTipoReconocido(detectado ? { palabra: detectado.palabra, seguro } : null);

      setSesion(nueva);
      const personalidad = personalidadDe(tipo);
      setNombre(
        archivo.name.replace(/\.pdf$/i, '').slice(0, 60) || `Mi ${personalidad.etiqueta.toLowerCase()}`,
      );
      const reconocidos = nueva.analisis.campos.filter(c => c.clave).length;
      info(
        detectado && seguro ? `${personalidad.etiqueta} analizada` : 'Documento analizado',
        `${detectado && seguro ? `Parece ${personalidad.etiqueta.toLowerCase()}. ` : ''}`
        + `Se han reconocido ${reconocidos} datos y ${nueva.analisis.tabla ? 'la tabla de líneas' : 'ninguna tabla'}. `
        + 'Revísalo antes de guardar.',
      );
    } catch (err) {
      const mensaje = err instanceof ErrorPdf || err instanceof ErrorArchivo
        ? err.message
        : 'No se ha podido analizar el PDF. Prueba con otro archivo.';
      avisarError('No se ha podido leer el documento', mensaje);
    } finally {
      setAnalizando(false);
    }
  };

  /** El editor manda los cambios ya resueltos; aquí sólo se posan encima. */
  const cambiarAnalisis = useCallback((cambios: CambioAnalisis) => {
    setSesion(actual => (actual ? { ...actual, analisis: { ...actual.analisis, ...cambios } } : actual));
  }, []);

  /**
   * Reabre una plantilla guardada en el editor. Se puede porque al guardarla
   * se conservó el análisis completo, mapa de bits original incluido.
   */
  const editarPlantilla = async (plantilla: PlantillaDocumento, comoCopia = false) => {
    setAnalizando(true);
    try {
      const recuperada = await abrirPlantillaGuardada(plantilla);
      setSesion(recuperada);
      setEditando(comoCopia ? null : plantilla);
      setNombre(comoCopia ? `${plantilla.nombre} (copia)`.slice(0, 60) : plantilla.nombre);
      setAplicaA(plantilla.aplicaA);
      setTipoReconocido(null);
    } catch (err) {
      const mensaje = err instanceof PlantillaNoEditable
        ? err.message
        : 'No se ha podido abrir la plantilla para editarla.';
      avisarError('No se puede editar', mensaje);
    } finally {
      setAnalizando(false);
    }
  };

  // ============================================================
  // VISTA PREVIA Y GUARDADO
  // ============================================================

  /**
   * Datos con los que se previsualiza.
   *
   * EL QR SÓLO SALE SI EL DOCUMENTO LO LLEVA
   *
   * Antes se montaba siempre como factura y se le pasaba siempre el QR
   * tributario. Como `generarPdf` estampa el código en una esquina cuando
   * la plantilla no le reserva sitio, diseñar un albarán terminaba con un
   * QR que el usuario no había puesto en ninguna parte —y que, peor, le
   * decía al cliente que ese papel estaba declarado a Hacienda.
   *
   * Ahora manda el tipo marcado en «¿Para qué documentos?». Si vale para
   * varios se previsualiza con el más comprometido: enseñar sin QR una
   * plantilla que también sirve de factura escondería justo el problema
   * de que al diseño le falte sitio para el código.
   *
   * `exigido: false` porque esto es una prueba: si a la empresa todavía
   * le falta el NIF, la vista previa sale sin QR en vez de negarse a salir.
   */
  const datosDePrueba = async (tipos: TipoDocumentoPlantilla[]) => {
    const documento = ultimaFactura ?? facturaDeMuestra();
    const configuracion = ajustes ?? ({} as CompanySettings);
    const tipo = tipoDominante(tipos);
    const datos = construirDatos({ tipo, documento } as Parameters<typeof construirDatos>[0], configuracion);
    if (!algunoLlevaQr(tipos)) return { datos, qr: undefined };
    return {
      datos,
      qr: {
        exigido: false,
        datos: {
          nifEmisor: configuracion.nif || '',
          numeroFactura: documento.number,
          fechaEmision: documento.issueDate,
          importeTotal: documento.total,
        },
      },
    };
  };

  const verComoQueda = async () => {
    if (!sesion) return;
    setGenerandoVista(true);
    try {
      const { plantilla } = compilar(sesion);
      const { datos, qr } = await datosDePrueba(aplicaA);
      const blob = await generarPdfBlob(plantilla, datos, { titulo: 'Vista previa', qr });
      if (vistaPrevia) URL.revokeObjectURL(vistaPrevia);
      setVistaPrevia(URL.createObjectURL(blob));
    } catch (err) {
      avisarError('No se ha podido componer la vista previa', err instanceof Error ? err.message : '');
    } finally {
      setGenerandoVista(false);
    }
  };

  const probarPlantillaGuardada = async (plantilla: PlantillaDocumento) => {
    setGenerandoVista(true);
    try {
      const { datos, qr } = await datosDePrueba(plantilla.aplicaA);
      const blob = await generarPdfBlob(plantilla.plantilla, datos, { titulo: plantilla.nombre, qr });
      if (vistaPrevia) URL.revokeObjectURL(vistaPrevia);
      setVistaPrevia(URL.createObjectURL(blob));
    } catch (err) {
      avisarError('No se ha podido componer la vista previa', err instanceof Error ? err.message : '');
    } finally {
      setGenerandoVista(false);
    }
  };

  const guardar = async () => {
    if (!sesion) return;
    if (!nombre.trim()) {
      avisarError('Ponle un nombre', 'Así la distinguirás si más adelante tienes varias.');
      return;
    }

    setGuardando(true);
    try {
      const { plantilla, diagnostico } = compilar(sesion);
      const ahora = new Date().toISOString();
      await guardarPlantilla({
        id: editando?.id ?? crypto.randomUUID(),
        nombre: nombre.trim(),
        aplicaA,
        plantilla,
        diagnostico,
        // El análisis viaja con la plantilla: es lo que permite volver a
        // abrirla en el editor sin tener que buscar otra vez el PDF original.
        origen: origenDeSesion(sesion),
        // La primera plantilla pasa a usarse por defecto: si alguien se toma
        // el trabajo de subir su diseño es porque quiere imprimir con él.
        predeterminada: editando?.predeterminada ?? plantillas.length === 0,
        createdAt: editando?.createdAt ?? ahora,
        updatedAt: ahora,
      });
      await cargar();
      setSesion(null);
      setEditando(null);
      success(
        editando ? 'Cambios guardados' : 'Plantilla guardada',
        'Tus documentos ya se descargan con este diseño.',
      );
    } catch (err) {
      const mensaje = err instanceof PlantillaInvalida
        ? err.message
        : err instanceof Error ? err.message : 'Error desconocido.';
      avisarError('No se ha podido guardar', mensaje);
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (plantilla: PlantillaDocumento) => {
    if (!confirm(`¿Eliminar la plantilla «${plantilla.nombre}»? Esos documentos volverán a imprimirse con el diseño estándar.`)) return;
    try {
      await borrarPlantilla(plantilla.id);
      await cargar();
      success('Plantilla eliminada');
    } catch (err) {
      avisarError('No se ha podido eliminar', err instanceof Error ? err.message : '');
    }
  };

  const hacerPredeterminada = async (plantilla: PlantillaDocumento) => {
    try {
      await marcarPredeterminada(plantilla.id);
      await cargar();
      success('Plantilla predeterminada', `Se imprimirán con «${plantilla.nombre}».`);
    } catch (err) {
      avisarError('No se ha podido cambiar', err instanceof Error ? err.message : '');
    }
  };

  if (!montado) {
    return <PageSkeleton variant="report" label="Cargando tus plantillas" />;
  }

  // ============================================================
  // REVISIÓN DE UNA FACTURA RECIÉN SUBIDA
  // ============================================================

  if (sesion) {
    const sinAsignar = sesion.analisis.campos.filter(c => !c.clave && !c.fijo).length;

    return (
      <div className="animate-fade-in">
        <div className="page-header">
          <div className="page-header-left">
            {/* El tipo, en la cejilla y en cuanto se entra: es lo que
                decide el título impreso, la advertencia legal y el QR, y
                antes no se veía por ninguna parte hasta bajar al pie. */}
            <p className="page-eyebrow">
              <LayoutTemplate /> Diseño de {personalidadDe(tipoDominante(aplicaA)).plural.toLowerCase()}
            </p>
            <h1 className="page-title">
              {editando ? `Editando «${editando.nombre}»` : 'Revisa lo que se ha detectado'}
            </h1>
            <p className="page-subtitle">
              Cada recuadro es un dato que se rellenará solo en cada documento. Todo lo demás —
              tu logotipo, los colores, los rótulos y el pie — se conserva exactamente como está.
              Mueve, estira y reordena lo que quieras: el diseño se adapta a lo que pida cada cliente.
            </p>
          </div>
          <div className="page-header-actions">
            <button className="btn btn-secondary" onClick={() => { setSesion(null); setEditando(null); }} disabled={guardando}>
              <ArrowLeft size={16} /> {editando ? 'Salir sin guardar' : 'Descartar'}
            </button>
            <button className="btn btn-secondary" onClick={verComoQueda} disabled={generandoVista || guardando}>
              {generandoVista ? <Loader2 size={16} className="spin" /> : <Eye size={16} />} Ver cómo queda
            </button>
            <button className="btn btn-primary" onClick={guardar} disabled={guardando}>
              {guardando ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
              {editando ? 'Guardar cambios' : 'Guardar plantilla'}
            </button>
          </div>
        </div>

        <div className="card plantilla-datos-guardado">
          <div className="form-group">
            <label className="form-label" htmlFor="nombre-plantilla">Nombre de la plantilla</label>
            <input
              id="nombre-plantilla"
              className="form-input"
              value={nombre}
              onChange={(evento) => setNombre(evento.target.value)}
              placeholder="El diseño de la empresa"
              maxLength={60}
            />
          </div>
          <div className="form-group">
            <span className="form-label">¿Para qué documentos?</span>
            {tipoReconocido && (
              <p className="field-message">
                {tipoReconocido.seguro
                  ? <>Leído del documento: pone <strong>«{tipoReconocido.palabra}»</strong>. Cámbialo si no es eso.</>
                  : <>No está claro qué documento es. Dice <strong>«{tipoReconocido.palabra}»</strong>, pero en letra pequeña: confírmalo tú.</>}
              </p>
            )}
            <div className="plantilla-tipos">
              {TIPOS_PLANTILLA.map(tipo => {
                const personalidad = personalidadDe(tipo);
                return (
                  <label key={tipo} className="plantilla-tipo" title={personalidad.paraQue}>
                    <input
                      type="checkbox"
                      checked={aplicaA.includes(tipo)}
                      onChange={(evento) => {
                        setAplicaA(actual =>
                          evento.target.checked
                            ? [...actual, tipo]
                            : actual.filter(t => t !== tipo),
                        );
                      }}
                    />
                    {personalidad.plural}
                  </label>
                );
              })}
            </div>
            {/* El QR no es decoración: decirlo aquí evita la sorpresa de
                verlo aparecer —o no— en la vista previa. */}
            <p className="field-message">{personalidadDe(tipoDominante(aplicaA)).notaQr}</p>
          </div>
          {sinAsignar > 0 && (
            <div className="callout callout-warning plantilla-callout-compacto">
              <div>
                <strong>{sinAsignar} {sinAsignar === 1 ? 'recuadro sin asignar' : 'recuadros sin asignar'}</strong>
                <p>Se imprimirán en blanco. Asígnalos o quítalos si no hacen falta.</p>
              </div>
            </div>
          )}
        </div>

        <RevisorPlantilla analisis={sesion.analisis} onCambiar={cambiarAnalisis} />

        {vistaPrevia && (
          <VistaPreviaPdf url={vistaPrevia} onCerrar={() => { URL.revokeObjectURL(vistaPrevia); setVistaPrevia(null); }} />
        )}
      </div>
    );
  }

  // ============================================================
  // LISTADO
  // ============================================================

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <p className="page-eyebrow"><LayoutTemplate /> Diseño de documentos</p>
          <h1 className="page-title">El diseño de tus documentos</h1>
          <p className="page-subtitle">
            Sube en PDF un documento tuyo —una factura, un albarán, un presupuesto— y el
            sistema copia su diseño: logotipo, colores, tipografía y disposición. A partir
            de ahí, los tuyos se descargan con ese mismo aspecto y los datos rellenados
            solos. Cada tipo sale como debe: el albarán con su advertencia de que no tiene
            valor fiscal, la factura con el QR de la AEAT.
          </p>
        </div>
        <div className="page-header-actions">
          <input
            ref={entradaArchivo}
            type="file"
            accept="application/pdf,.pdf"
            onChange={alElegirArchivo}
            style={{ display: 'none' }}
          />
          <button
            className="btn btn-primary"
            onClick={() => entradaArchivo.current?.click()}
            disabled={analizando}
          >
            {analizando ? <Loader2 size={16} className="spin" /> : <FileUp size={16} />}
            {analizando ? 'Analizando el documento…' : 'Subir documento en PDF'}
          </button>
          <button className="btn btn-secondary" onClick={() => setEligiendoOficio(true)} disabled={analizando}>
            <Sparkles size={16} /> Empezar desde cero
          </button>
        </div>
      </div>

      {plantillas.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon"><LayoutTemplate /></div>
            <div className="empty-state-title">Todavía no tienes ninguna factura</div>
            <p className="empty-state-description">
              Si ya emites facturas, sube una en PDF —da igual con qué programa o diseñador se
              hiciera—: el sistema reconoce dónde va cada dato y a partir de ahí imprime las
              tuyas igual. Y si empiezas de cero, dinos a qué te dedicas y te la montamos.
            </p>
            <div className="empty-state-actions">
              <button className="btn btn-primary" onClick={() => entradaArchivo.current?.click()} disabled={analizando}>
                <FileUp size={16} /> Subir factura en PDF
              </button>
              <button className="btn btn-secondary" onClick={() => setEligiendoOficio(true)} disabled={analizando}>
                <Sparkles size={16} /> Empezar desde cero
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="plantilla-rejilla">
          {plantillas.map(plantilla => {
            const calco = calcoDePlantilla(plantilla.plantilla);
            return (
              <div key={plantilla.id} className={`card plantilla-tarjeta ${plantilla.predeterminada ? 'plantilla-tarjeta--activa' : ''}`}>
                <div className="plantilla-miniatura">
                  {calco
                    /* eslint-disable-next-line @next/next/no-img-element */
                    ? <img src={calco} alt={`Diseño de ${plantilla.nombre}`} />
                    : <LayoutTemplate size={28} />}
                </div>
                <div className="plantilla-tarjeta-cuerpo">
                  <div className="plantilla-tarjeta-titulo">
                    {plantilla.nombre}
                    {plantilla.predeterminada && <span className="badge badge-activo"><i className="badge-dot" /> En uso</span>}
                  </div>
                  <p className="plantilla-tarjeta-detalle">
                    {plantilla.aplicaA.map(t => personalidadDe(t).plural).join(' y ')}
                    {plantilla.diagnostico.archivoOrigen ? ` · de ${plantilla.diagnostico.archivoOrigen}` : ''}
                  </p>
                  <div className="plantilla-tarjeta-acciones">
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => editarPlantilla(plantilla)}
                      disabled={analizando || !plantilla.origen}
                      title={plantilla.origen
                        ? 'Abrir el editor de diseño'
                        : 'Esta plantilla se guardó antes del editor: vuelve a subir el PDF para poder ajustarla'}
                    >
                      {analizando ? <Loader2 size={14} className="spin" /> : <Pencil size={14} />} Editar diseño
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => probarPlantillaGuardada(plantilla)} disabled={generandoVista}>
                      {generandoVista ? <Loader2 size={14} className="spin" /> : <Eye size={14} />} Ver
                    </button>
                    {plantilla.origen && (
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        onClick={() => editarPlantilla(plantilla, true)}
                        disabled={analizando}
                        title="Duplicar para hacer una variante sin tocar la original"
                      >
                        <Copy size={14} />
                      </button>
                    )}
                    {!plantilla.predeterminada && (
                      <button className="btn btn-secondary btn-sm" onClick={() => hacerPredeterminada(plantilla)}>
                        <Star size={14} /> Usar esta
                      </button>
                    )}
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => eliminar(plantilla)} title="Eliminar plantilla">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="callout callout-info plantilla-nota">
        <div>
          <strong>Cómo funciona</strong>
          <p>
            Del PDF que subes se conserva el diseño tal cual —incluido el logotipo, aunque sea
            vectorial— y se borran los datos de esa factura concreta. En su lugar quedan campos
            que se rellenan con los datos reales de cada factura. Si el documento ocupa más de una
            página, la cabecera y el pie se repiten en todas.
          </p>
        </div>
      </div>

      {eligiendoOficio && (
        <ElegirOficio sector={ajustes?.sector} onElegir={empezarDesdeCero} onCerrar={() => setEligiendoOficio(false)} />
      )}

      {vistaPrevia && (
        <VistaPreviaPdf url={vistaPrevia} onCerrar={() => { URL.revokeObjectURL(vistaPrevia); setVistaPrevia(null); }} />
      )}
    </div>
  );
}

/**
 * A qué se dedica quien va a facturar.
 *
 * No es una encuesta: de la respuesta salen las columnas de la tabla y los
 * rótulos del pie. Un taller necesita la matrícula y la referencia del
 * recambio; un fisioterapeuta, el número de colegiado y el aviso de que su
 * servicio está exento de IVA. Puestos a mano son diez minutos de editor por
 * cada uno, y elegidos de una lista son un clic.
 *
 * Nada de lo que ponga queda cerrado: todo se cambia después en el editor, y
 * quien no se vea en la lista tiene «Genérico».
 */
function ElegirOficio({ sector, onElegir, onCerrar }: {
  sector?: BusinessSector;
  onElegir: (oficioId: string) => void | Promise<void>;
  onCerrar: () => void;
}) {
  // El oficio que le toca al sector de la empresa, primero y marcado.
  //
  // Antes eran treinta y tres botones en fila y daba igual a qué se
  // dedicara quien miraba. Con la lista así, un psicólogo podía acabar
  // eligiendo la factura de un distribuidor —o quedarse con el primero de
  // la lista— y terminaba con una columna de cajas pidiéndole el formato
  // de cada sesión de terapia.
  const suyo = oficioParaSector(sector);
  const ordenados = [suyo, ...OFICIOS.filter(o => o.id !== suyo.id)];

  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div className="modal plantilla-modal-oficios" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2><Sparkles size={18} /> ¿A qué te dedicas?</h2>
          <button className="btn-icon" onClick={onCerrar} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="modal-body">
          <p className="plantilla-modal-nota">
            Montamos una factura completa con lo que lleva tu oficio. Después la ajustas a tu
            gusto y la guardas.
          </p>
          <div className="plantilla-oficios">
            {ordenados.map(oficio => {
              const esElSuyo = sector !== undefined && oficio.id === suyo.id;
              return (
                <button
                  key={oficio.id}
                  type="button"
                  className={`plantilla-oficio ${esElSuyo ? 'plantilla-oficio--tuyo' : ''}`}
                  onClick={() => { void onElegir(oficio.id); }}
                >
                  <strong>
                    {oficio.nombre}
                    {esElSuyo && <em className="plantilla-oficio-tuyo">El de tu sector</em>}
                  </strong>
                  <span>
                    {[
                      oficio.concepto,
                      oficio.unidad,
                      ...(oficio.columnasFijas ?? []).map(c => c.cabecera),
                      ...(oficio.columnas ?? []),
                    ].join(' · ')}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================

function VistaPreviaPdf({ url, onCerrar }: { url: string; onCerrar: () => void }) {
  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div className="modal modal-lg plantilla-modal" onClick={(evento) => evento.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3 className="modal-title">Así queda tu factura</h3>
            <p className="card-subtitle">Con los datos de una factura real, no con los del PDF que subiste.</p>
          </div>
          <button className="modal-close" onClick={onCerrar} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="modal-body plantilla-modal-cuerpo">
          <iframe src={url} title="Vista previa de la factura" className="plantilla-visor" />
        </div>
        <div className="modal-footer">
          <a className="btn btn-secondary" href={url} download="vista-previa.pdf">
            <Download size={16} /> Descargar esta prueba
          </a>
          <button className="btn btn-primary" onClick={onCerrar}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
