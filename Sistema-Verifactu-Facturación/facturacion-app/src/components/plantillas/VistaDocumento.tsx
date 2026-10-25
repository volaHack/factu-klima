'use client';

/**
 * EL DOCUMENTO TAL CUAL SALE
 *
 * La ficha de una factura enseñaba una réplica en HTML que se escribía aparte
 * del PDF. Dos dibujos del mismo documento acaban diciendo cosas distintas:
 * el PDF ponía «IGIC 7 %» y la pantalla, «IVA 7 %». Ahora, si la empresa
 * tiene su diseño, la pantalla enseña el PDF de verdad —el mismo que se
 * descarga, se imprime y recibe el cliente—, página a página.
 *
 * Sin diseño propio no hay PDF que enseñar: entonces se ve la vista de
 * siempre (`children`), que en ese caso es también lo que se imprime. Si el
 * PDF no se puede montar, lo mismo: la ficha no se queda en blanco.
 *
 * Las páginas se pintan con pdf.js y no con un <iframe>: el visor de PDF del
 * navegador no existe en el móvil y allí el iframe sale vacío o descarga.
 */

import { useEffect, useState, type ReactNode } from 'react';
import type { Albaran, Invoice } from '@/lib/types';
import type { TipoDocumentoPlantilla } from '@/lib/plantillas/tiposDocumento';

type Estado =
  | { clave: string; modo: 'pdf'; paginas: string[] }
  | { clave: string; modo: 'html' };

/** Resolución de cada página: unos 180 ppp, nítida en pantalla y al imprimir. */
const ESCALA = 2.5;

async function pintarPaginas(blob: Blob): Promise<string[]> {
  const { cargarPdfJs } = await import('@/lib/plantillas/extraccion');
  const pdfjs = await cargarPdfJs();
  const carga = pdfjs.getDocument({
    data: new Uint8Array(await blob.arrayBuffer()),
    useSystemFonts: true,
    isEvalSupported: false,
  });
  const pdf = await carga.promise;
  const paginas: string[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const pagina = await pdf.getPage(n);
    const vista = pagina.getViewport({ scale: ESCALA });
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(vista.width);
    lienzo.height = Math.round(vista.height);
    const ctx = lienzo.getContext('2d');
    if (!ctx) throw new Error('Sin canvas');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    await pagina.render({ canvasContext: ctx, viewport: vista, intent: 'print' }).promise;
    paginas.push(lienzo.toDataURL('image/png'));
  }
  // Suelta el documento y su hilo de trabajo: las páginas ya son imágenes.
  await carga.destroy();
  return paginas;
}

export default function VistaDocumento({ tipo, documento, children }: {
  tipo: TipoDocumentoPlantilla;
  documento: Invoice | Albaran;
  /** La vista HTML de siempre, para cuando no hay diseño propio. */
  children: ReactNode;
}) {
  // Se vuelve a montar si cambia lo que se imprime, no a cada repintado.
  const clave = [documento.id, documento.number, documento.status, documento.total, documento.updatedAt ?? ''].join('|');
  const [estado, setEstado] = useState<Estado | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const { componerPdf } = await import('@/lib/plantillas/componer');
        // Sin aviso: no tener diseño propio no es un error en la ficha.
        const hecho = await componerPdf(tipo, documento);
        if (!vivo) return;
        if (!hecho) { setEstado({ clave, modo: 'html' }); return; }
        const paginas = await pintarPaginas(hecho.blob);
        if (vivo) setEstado({ clave, modo: 'pdf', paginas });
      } catch (error) {
        // Se sigue con la vista de siempre, pero queda constancia del porqué.
        console.warn('No se ha podido pintar el PDF en la ficha; se enseña la vista HTML.', error);
        if (vivo) setEstado({ clave, modo: 'html' });
      }
    })();
    return () => { vivo = false; };
    // `documento` entra por la clave: sus campos impresos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, tipo]);

  const actual = estado?.clave === clave ? estado : null;

  if (!actual) {
    return (
      <div className="vista-doc vista-doc--cargando" aria-busy="true" aria-label="Preparando el documento">
        <div className="vista-doc-hoja skeleton" />
      </div>
    );
  }
  if (actual.modo === 'html') return <>{children}</>;

  return (
    <div className="vista-doc">
      <p className="vista-doc-nota">Así sale en PDF, con tu diseño.</p>
      {actual.paginas.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element -- imagen generada en el navegador, no un recurso
        <img
          key={i}
          src={src}
          className="vista-doc-hoja"
          alt={`Página ${i + 1} de ${actual.paginas.length} de ${documento.number}`}
        />
      ))}
    </div>
  );
}
