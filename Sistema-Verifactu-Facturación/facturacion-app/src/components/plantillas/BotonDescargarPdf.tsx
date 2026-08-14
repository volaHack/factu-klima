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

export default function BotonDescargarPdf(props: Props) {
  const tipo = 'tipo' in props ? props.tipo : props.documento.tipo;
  const documento = 'tipo' in props ? props.documento : props.documento.documento;
  const { className, etiqueta } = props;
  const { error: avisarError, warning } = useToast();
  const [generando, setGenerando] = useState(false);

  const descargar = async () => {
    setGenerando(true);
    try {
      const [{ getPlantillaActiva }, { construirDatos }, { generarPdfBlob, descargarBlob }] =
        await Promise.all([
          import('@/lib/plantillas/almacen'),
          import('@/lib/plantillas/datos'),
          import('@/lib/plantillas/generar'),
        ]);

      let plantilla = await getPlantillaActiva(tipo as any);
      if (!plantilla) {
        plantilla = await getPlantillaActiva('factura');
      }
      if (!plantilla) {
        warning(
          'Todavía no has subido tu diseño',
          'Sube una plantilla en PDF desde Plantillas y a partir de ahí se descargará con tu aspecto.',
        );
        return;
      }

      const [ajustes, cliente] = await Promise.all([
        getCompanySettings(),
        documento.clientId ? getClientById(documento.clientId) : Promise.resolve(undefined),
      ]);

      const datos = construirDatos(
        { tipo: tipo as any, documento: documento as any },
        ajustes,
        { cliente, datosExtras: documento.datosExtras },
      );

      const blob = await generarPdfBlob(plantilla.plantilla, datos, {
        titulo: `${tipo.toUpperCase()} ${documento.number}`,
        autor: ajustes.businessName || '',
      });

      descargarBlob(blob, `${documento.number.replace(/[^\w-]/g, '_')}.pdf`);
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
      const [{ getPlantillaActiva }, { construirDatos }, { generarPdfBlob }] =
        await Promise.all([
          import('@/lib/plantillas/almacen'),
          import('@/lib/plantillas/datos'),
          import('@/lib/plantillas/generar'),
        ]);

      let plantilla = await getPlantillaActiva(tipo as any);
      if (!plantilla) {
        plantilla = await getPlantillaActiva('factura');
      }
      if (!plantilla) {
        warning(
          'Todavía no has subido tu diseño',
          'Sube una plantilla en PDF desde Plantillas para previsualizar con tu aspecto.',
        );
        return;
      }

      const [ajustes, cliente] = await Promise.all([
        getCompanySettings(),
        documento.clientId ? getClientById(documento.clientId) : Promise.resolve(undefined),
      ]);

      const datos = construirDatos(
        { tipo: tipo as any, documento: documento as any },
        ajustes,
        { cliente, datosExtras: documento.datosExtras },
      );

      const blob = await generarPdfBlob(plantilla.plantilla, datos, {
        titulo: `${tipo.toUpperCase()} ${documento.number}`,
        autor: ajustes.businessName || '',
      });

      if (urlPdf) URL.revokeObjectURL(urlPdf);
      setUrlPdf(URL.createObjectURL(blob));
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
          <div className="modal modal-lg plantilla-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '900px', height: '90vh' }}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">{tipo.toUpperCase()} {documento.number}</h3>
                <p className="card-subtitle">Previsualización en tiempo real con tu plantilla activa</p>
              </div>
              <button className="modal-close" onClick={cerrar} aria-label="Cerrar"><X size={18} /></button>
            </div>
            <div className="modal-body plantilla-modal-cuerpo" style={{ flex: 1, padding: 0 }}>
              <iframe src={urlPdf} title="Vista previa del documento" className="plantilla-visor" style={{ width: '100%', height: '100%', border: 'none' }} />
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
