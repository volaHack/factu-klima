/**
 * LAS PÁGINAS DE UN PDF COMO IMÁGENES
 *
 * Se pintan con pdf.js y no con el visor del navegador: en el móvil y en
 * la tablet ese visor no existe (el <iframe> sale vacío o descarga), y un
 * PDF no se puede mandar a imprimir desde la página en todos los
 * navegadores. Una imagen por página sí se ve e imprime en todos.
 *
 * Lo usan la ficha del documento (VistaDocumento) y la impresora de cada
 * pedido en Preparar pedidos.
 */

/** Resolución de cada página: unos 180 ppp, nítida en pantalla y al imprimir. */
const ESCALA = 2.5;

export async function paginasComoImagen(blob: Blob): Promise<string[]> {
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
