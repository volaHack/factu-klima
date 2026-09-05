'use client';

/**
 * Botón de descarga y previsualización del PDF con el diseño propio de la empresa.
 *
 * Todo lo pesado (pdfme, las tipografías, la plantilla) se carga en el
 * momento de pulsar y no al abrir la factura: quien sólo entra a consultarla
 * no paga el coste de un generador de PDF que no va a usar.
 */

import { useState } from 'react';
import Link from 'next/link';
import { Download, Eye, Loader2, X } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { getClientById, getCompanySettings } from '@/lib/storage';
import type { Albaran, Invoice } from '@/lib/types';

type Props =
  | { tipo: 'factura'; documento: Invoice; className?: string; etiqueta?: string; settings?: any }
  | { tipo: 'albaran'; documento: Albaran; className?: string; etiqueta?: string; settings?: any }
  | { tipo: 'presupuesto'; documento: Invoice; className?: string; etiqueta?: string; settings?: any }
  | { tipo: 'pedido'; documento: Invoice; className?: string; etiqueta?: string; settings?: any }
  | { tipo: 'rectificativa'; documento: Invoice; className?: string; etiqueta?: string; settings?: any }
  | { documento: { tipo: 'factura' | 'albaran' | 'presupuesto' | 'pedido' | 'rectificativa'; documento: Invoice | Albaran }; className?: string; etiqueta?: string; settings?: any };


/**
 * Monta el PDF del documento con la plantilla activa de la empresa.
 *
 * Lo usan los dos botones —descargar y previsualizar—, que antes llevaban
 * cada uno su copia del mismo montaje. Con dos copias, lo que se arreglaba en
 * una seguía roto en la otra, y lo que se le añadía a una no aparecía en la
 * otra.
 *
 * Devuelve null cuando la empresa aún no tiene diseño propio, después de
 * avisar: no es un fallo, es que todavía no ha subido nada.
 */
async function componerPdf(
  tipo: string,
  documento: Invoice | Albaran,
  avisar: (titulo: string, texto: string) => void,
): Promise<{ blob: Blob; nombre: string } | null> {
  const [{ getPlantillaActiva }, { construirDatos }, { generarPdfBlob }] = await Promise.all([
    import('@/lib/plantillas/almacen'),
    import('@/lib/plantillas/datos'),
    import('@/lib/plantillas/generar'),
  ]);

  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const plantilla = (await getPlantillaActiva(tipo as any)) ?? (await getPlantillaActiva('factura'));
  if (!plantilla) {
    avisar(
      'Todavía no tienes un diseño propio',
      'Sube tu factura en PDF desde Plantillas, o empieza una desde cero, y el documento saldrá con tu aspecto.',
    );
    return null;
  }

  const [ajustes, cliente] = await Promise.all([
    getCompanySettings(),
    documento.clientId ? getClientById(documento.clientId) : Promise.resolve(undefined),
  ]);

  // El QR tributario que exige Veri*Factu, con los cuatro datos que la propia
  // factura ya tiene: no depende de ninguna conexión con la AEAT, así que se
  // genera siempre que hay algo firme que codificar.
  //
  // Sólo en factura o rectificativa ya emitida, no en un borrador. Un
  // borrador —y un presupuesto o un pedido, que ni siquiera son facturas—
  // puede llevar todavía un número provisional: el que usa la app mientras
  // no hay conexión y que se reasigna al sellar. Imprimir ahí un QR sería
  // imprimir un código que apunta a un número que la factura de verdad
  // puede no acabar teniendo.
  //
  // Aquí sólo se dice DE QUÉ factura es y si es de las que obligan. Dónde va,
  // cuánto mide, qué rótulo lleva y qué se comprueba antes de imprimir sale
  // todo de `qrFactura.ts`, que es el único sitio donde eso se decide.
  const esFacturaEmitida = (tipo === 'factura' || tipo === 'rectificativa')
    && !['borrador', 'anulada'].includes(String((documento as Invoice).status));

  const datos = construirDatos(
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    { tipo: tipo as any, documento: documento as any },
    ajustes,
    { cliente, datosExtras: documento.datosExtras },
  );

  const blob = await generarPdfBlob(plantilla.plantilla, datos, {
    titulo: `${tipo.toUpperCase()} ${documento.number}`,
    autor: ajustes.businessName || '',
    qr: esFacturaEmitida
      ? {
          exigido: true,
          datos: {
            nifEmisor: ajustes.nif,
            numeroFactura: documento.number,
            fechaEmision: documento.issueDate,
            importeTotal: documento.total,
          },
        }
      : undefined,
  });

  return { blob, nombre: `${documento.number.replace(/[^\w-]/g, '_')}.pdf` };
}

export default function BotonDescargarPdf(props: Props) {
  const tipo = 'tipo' in props ? props.tipo : props.documento.tipo;
  const documento = 'tipo' in props ? props.documento : props.documento.documento;
  const { className, etiqueta } = props;
  const { error: avisarError, warning } = useToast();
  const [generando, setGenerando] = useState(false);

  const descargar = async () => {
    setGenerando(true);
    try {
      const { descargarBlob } = await import('@/lib/plantillas/generar');
      const hecho = await componerPdf(tipo, documento, warning);
      if (hecho) descargarBlob(hecho.blob, hecho.nombre);
    } catch (err) {
      avisarError(
        'No se ha podido generar el PDF',
        err instanceof Error ? err.message : 'Vuelve a intentarlo en un momento.',
      );
    } finally {
      setGenerando(false);
    }
  };

  return (
    <button
      className={className ?? 'btn btn-secondary'}
      onClick={descargar}
      disabled={generando}
      title="Descargar el PDF con el diseño de tu empresa"
    >
      {generando ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
      {etiqueta ?? 'Descargar PDF'}
    </button>
  );
}

/** Botón para ver el PDF en vivo con la plantilla activa en un modal */
export function BotonVistaPreviaPdf(props: Props) {
  const tipo = 'tipo' in props ? props.tipo : props.documento.tipo;
  const documento = 'tipo' in props ? props.documento : props.documento.documento;
  const { className, etiqueta } = props;
  const { error: avisarError, warning } = useToast();
  const [generando, setGenerando] = useState(false);
  const [urlPdf, setUrlPdf] = useState<string | null>(null);

  const previsualizar = async () => {
    setGenerando(true);
    try {
      const hecho = await componerPdf(tipo, documento, warning);
      if (!hecho) return;
      if (urlPdf) URL.revokeObjectURL(urlPdf);
      setUrlPdf(URL.createObjectURL(hecho.blob));
    } catch (err) {
      avisarError(
        'No se ha podido generar la vista previa',
        err instanceof Error ? err.message : 'Vuelve a intentarlo en un momento.',
      );
    } finally {
      setGenerando(false);
    }
  };

  const cerrar = () => {
    if (urlPdf) URL.revokeObjectURL(urlPdf);
    setUrlPdf(null);
  };

  return (
    <>
      <button
        className={className ?? 'btn btn-secondary'}
        onClick={previsualizar}
        disabled={generando}
        title="Ver cómo queda el documento con tu plantilla"
      >
        {generando ? <Loader2 size={14} className="spin" /> : <Eye size={14} />}
        {etiqueta ?? 'Ver con plantilla'}
      </button>

      {urlPdf && (
        <div className="modal-overlay" onClick={cerrar}>
          <div className="modal modal--visor" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">{tipo.toUpperCase()} {documento.number}</h3>
                <p className="card-subtitle">Previsualización en tiempo real con tu plantilla activa</p>
              </div>
              <button className="modal-close" onClick={cerrar} aria-label="Cerrar"><X size={18} /></button>
            </div>
            <div className="modal-body">
              <iframe src={urlPdf} title="Vista previa del documento" className="plantilla-visor" />
            </div>
            <div className="modal-footer">
              <a className="btn btn-primary" href={urlPdf} download={`${documento.number.replace(/[^\w-]/g, '_')}.pdf`}>
                <Download size={16} /> Descargar PDF
              </a>
              <button className="btn btn-secondary" onClick={cerrar}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Aviso para la barra lateral cuando la empresa aún no tiene diseño propio. */
export function AvisoSinPlantilla() {
  return (
    <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 'var(--space-2)', lineHeight: 1.5 }}>
      ¿Quieres que salga con el diseño de tu empresa?{' '}
      <Link href="/plantillas" style={{ color: 'var(--accent-400)' }}>Sube tu factura en PDF</Link>.
    </p>
  );
}
