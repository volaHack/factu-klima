'use client';

/**
 * Botón de descarga del PDF con el diseño propio de la empresa.
 *
 * Todo lo pesado (pdfme, las tipografías, la plantilla) se carga en el
 * momento de pulsar y no al abrir la factura: quien sólo entra a consultarla
 * no paga el coste de un generador de PDF que no va a usar.
 */

import { useState } from 'react';
import Link from 'next/link';
import { Download, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { getClientById, getCompanySettings } from '@/lib/storage';
import type { Albaran, Invoice } from '@/lib/types';

type Props =
  | { tipo: 'factura'; documento: Invoice; className?: string; etiqueta?: string }
  | { tipo: 'albaran'; documento: Albaran; className?: string; etiqueta?: string };

export default function BotonDescargarPdf(props: Props) {
  const { tipo, documento, className, etiqueta } = props;
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

      const plantilla = await getPlantillaActiva(tipo);
      if (!plantilla) {
        warning(
          'Todavía no has subido tu diseño',
          'Sube una factura tuya en PDF desde Plantillas y a partir de ahí se descargará con tu aspecto.',
        );
        return;
      }

      const [ajustes, cliente] = await Promise.all([
        getCompanySettings(),
        documento.clientId ? getClientById(documento.clientId) : Promise.resolve(undefined),
      ]);

      const datos = tipo === 'factura'
        ? construirDatos({ tipo: 'factura', documento: documento as Invoice }, ajustes, { cliente })
        : construirDatos({ tipo: 'albaran', documento: documento as Albaran }, ajustes, { cliente });

      const blob = await generarPdfBlob(plantilla.plantilla, datos, {
        titulo: `${tipo === 'factura' ? 'Factura' : 'Albarán'} ${documento.number}`,
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

/** Aviso para la barra lateral cuando la empresa aún no tiene diseño propio. */
export function AvisoSinPlantilla() {
  return (
    <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 'var(--space-2)', lineHeight: 1.5 }}>
      ¿Quieres que salga con el diseño de tu empresa?{' '}
      <Link href="/plantillas" style={{ color: 'var(--accent-400)' }}>Sube tu factura en PDF</Link>.
    </p>
  );
}
