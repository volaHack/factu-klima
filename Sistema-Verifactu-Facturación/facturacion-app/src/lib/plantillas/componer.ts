/**
 * EL PDF DE UN DOCUMENTO CON EL DISEÑO DE LA EMPRESA
 *
 * Lo usan el botón «Descargar PDF» de cada documento y los Impresos (muchos
 * documentos de una vez, en un solo PDF): una sola manera de montarlo, para
 * que lo que se arregla en un sitio quede arreglado en el otro.
 */

import { getClientById, getCobrosPagos, getCompanySettings } from '@/lib/storage';
import type { Albaran, Invoice } from '@/lib/types';
import { personalidadDe, type TipoDocumentoPlantilla } from '@/lib/plantillas/tiposDocumento';

/**
 * Los pagos apuntados en Cobros y pagos para este documento, con lo que se
 * aplicó a él: llenan la «Relación de pagos» del diseño. Si no se pueden
 * leer, el PDF sale igual con lo cobrado que guarda la factura.
 */
async function pagosDelDocumento(tipo: TipoDocumentoPlantilla, documento: Invoice | Albaran) {
  if (tipo === 'albaran' || tipo === 'presupuesto') return undefined;
  try {
    const movimientos = await getCobrosPagos(documento.clientId ? { contraparteId: documento.clientId } : undefined);
    return movimientos.flatMap(m => m.desglose
      .filter(d => d.invoiceId === documento.id && d.importeAplicado > 0)
      .map(d => ({ fecha: m.fecha, importe: d.importeAplicado, forma: m.paymentMethod })));
  } catch {
    return undefined;
  }
}

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
export async function componerPdf(
  tipo: TipoDocumentoPlantilla,
  documento: Invoice | Albaran,
  avisar: (titulo: string, texto: string) => void = () => {},
): Promise<{ blob: Blob; nombre: string } | null> {
  const [{ getPlantillaActiva }, { construirDatos }, { generarPdfBlob }] = await Promise.all([
    import('@/lib/plantillas/almacen'),
    import('@/lib/plantillas/datos'),
    import('@/lib/plantillas/generar'),
  ]);

  const plantilla = (await getPlantillaActiva(tipo)) ?? (await getPlantillaActiva('factura'));
  if (!plantilla) {
    avisar(
      'Todavía no tienes un diseño propio',
      'Sube un documento tuyo en PDF desde Diseño de documentos, o empieza uno desde cero, y saldrá con tu aspecto.',
    );
    return null;
  }

  const [ajustes, cliente, pagos] = await Promise.all([
    getCompanySettings(),
    documento.clientId ? getClientById(documento.clientId) : Promise.resolve(undefined),
    pagosDelDocumento(tipo, documento),
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
  // Qué tipos llevan QR lo dice `tiposDocumento.ts`, no una lista escrita
  // aquí otra vez: esa duplicación es la que deja un albarán con código el
  // día que alguien añade un tipo nuevo.
  const esFacturaEmitida = personalidadDe(tipo).llevaQr
    && !['borrador', 'anulada'].includes(String((documento as Invoice).status));

  const datos = construirDatos(
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    { tipo: tipo as any, documento: documento as any },
    ajustes,
    { cliente, datosExtras: documento.datosExtras, pagos },
  );

  const blob = await generarPdfBlob(plantilla.plantilla, datos, {
    titulo: `${personalidadDe(tipo).tituloImpreso} ${documento.number}`,
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


/**
 * Muchos documentos en un solo PDF, uno detrás de otro, para imprimirlos de
 * una vez. Devuelve null si la empresa aún no tiene diseño propio.
 */
export async function componerTanda(
  documentos: { tipo: TipoDocumentoPlantilla; documento: Invoice | Albaran }[],
  alAvanzar: (hechos: number) => void = () => {},
): Promise<Blob | null> {
  const { PDFDocument } = await import('@pdfme/pdf-lib');
  const junto = await PDFDocument.create();
  let hechos = 0;
  for (const { tipo, documento } of documentos) {
    const uno = await componerPdf(tipo, documento);
    if (!uno) return null;
    const pdf = await PDFDocument.load(await uno.blob.arrayBuffer());
    const paginas = await junto.copyPages(pdf, pdf.getPageIndices());
    paginas.forEach(p => junto.addPage(p));
    alAvanzar(++hechos);
  }
  const bytes = await junto.save();
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}
