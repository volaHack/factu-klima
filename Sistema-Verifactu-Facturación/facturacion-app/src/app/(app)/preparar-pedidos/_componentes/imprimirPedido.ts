/**
 * LA IMPRESORA DE CADA PEDIDO
 *
 * Saca el pedido (o el albarán) tal como es: el documento con el diseño de
 * la empresa, el mismo que se descarga desde su ficha y recibe el cliente.
 * No la hoja de preparación: ésa, y la de carga, siguen en los botones de
 * arriba de la pantalla.
 *
 * Sin diseño propio, sale con el formato estándar de documento: el mismo de
 * «Imprimir sencillo» en Impresos, con empresa, cliente, líneas y totales.
 *
 * El PDF del diseño se pasa a imágenes, una por página, y se imprime desde
 * un marco aparte: así funciona igual en el ordenador del muelle que en la
 * tablet del almacén, donde el visor de PDF del navegador no existe.
 */
import { componerPdf } from '@/lib/plantillas/componer';
import { getAlbaranById, getClientById, getCompanySettings, getInvoiceById } from '@/lib/storage';
import { CSS_IMPRESO, htmlDeDocumento } from '@/lib/informes/impresos';
import type { TipoDocumentoPlantilla } from '@/lib/plantillas/tiposDocumento';
import type { PedidoEnCola } from '@/lib/prepararPedidos';
import { imprimirHtml } from '@/app/(app)/listados/_componentes/papel';

/** Cada imagen ocupa su folio entero: los márgenes ya los trae el diseño. */
const CSS_DISENO = `
@page { size: A4 portrait; margin: 0; }
html, body { margin: 0; padding: 0; }
.pagina-diseno { display: block; width: 210mm; height: auto; break-after: page; page-break-after: always; }
.pagina-diseno:last-child { break-after: auto; page-break-after: auto; }
`;

const escapar = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** Imprime el pedido. Devuelve con qué salió, o lanza si no se encuentra. */
export async function imprimirPedido(p: PedidoEnCola): Promise<'diseno' | 'estandar'> {
  const documento = p.origen === 'albaran' ? await getAlbaranById(p.id) : await getInvoiceById(p.id);
  if (!documento) throw new Error('No se encuentra el pedido. Puede que se haya borrado o entregado.');
  const tipo: TipoDocumentoPlantilla = p.origen === 'albaran' ? 'albaran' : p.tipo;
  const titulo = `${tipo === 'albaran' ? 'Albarán' : 'Pedido'} ${documento.number}`;

  const hecho = await componerPdf(tipo, documento);
  if (hecho) {
    const { paginasComoImagen } = await import('@/lib/plantillas/paginasPdf');
    const paginas = await paginasComoImagen(hecho.blob);
    const html = paginas
      .map((src, i) => `<img class="pagina-diseno" src="${src}" alt="Página ${i + 1} de ${escapar(titulo)}">`)
      .join('');
    imprimirHtml(titulo, html, CSS_DISENO);
    return 'diseno';
  }

  const [empresa, cliente] = await Promise.all([
    getCompanySettings(),
    documento.clientId ? getClientById(documento.clientId) : Promise.resolve(undefined),
  ]);
  imprimirHtml(titulo, htmlDeDocumento(documento, empresa, cliente), CSS_IMPRESO);
  return 'estandar';
}
