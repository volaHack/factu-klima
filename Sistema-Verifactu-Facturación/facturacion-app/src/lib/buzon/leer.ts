'use client';

/**
 * LEER UNA FACTURA DE PROVEEDOR (en el navegador)
 *
 * El lector de tickets de la IA entiende imágenes. Un PDF se convierte aquí
 * en una imagen de su primera página (pdf.js, el mismo que usa Diseño de
 * documentos) y se manda igual que una foto: funciona con cualquier
 * servidor de IA, entienda PDF o no.
 */

import { fotoParaLeer } from '@/lib/utils';
import { cargarPdfJs } from '@/lib/plantillas/extraccion';
import type { DatosTicket } from '@/lib/ia/ticket';

const ANCHO = 1600;

async function pdfAImagen(datos: ArrayBuffer): Promise<string> {
  const pdfjs = await cargarPdfJs();
  let documento;
  try {
    documento = await pdfjs.getDocument({ data: new Uint8Array(datos), useSystemFonts: true, isEvalSupported: false }).promise;
  } catch (e) {
    throw new Error(/password/i.test(e instanceof Error ? e.message : '') ? 'El PDF tiene contraseña.' : 'No se ha podido abrir el PDF.');
  }
  const pagina = await documento.getPage(1);
  const base = pagina.getViewport({ scale: 1 });
  const vista = pagina.getViewport({ scale: Math.min(3, ANCHO / base.width) });
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(vista.width);
  lienzo.height = Math.round(vista.height);
  const ctx = lienzo.getContext('2d');
  if (!ctx) throw new Error('Este navegador no puede dibujar el PDF.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  await pagina.render({ canvasContext: ctx, viewport: vista }).promise;
  // Se suelta la memoria del PDF (el nombre del método cambia entre versiones de pdf.js).
  void (documento.destroy ?? documento.cleanup)?.call(documento);
  return lienzo.toDataURL('image/jpeg', 0.85);
}

/** La imagen que se le manda a la IA, sea el fichero un PDF o una foto. */
export async function imagenParaLeer(fichero: Blob, nombre = ''): Promise<string> {
  const esPdf = fichero.type === 'application/pdf' || /\.pdf$/i.test(nombre);
  if (esPdf) return pdfAImagen(await fichero.arrayBuffer());
  return fotoParaLeer(fichero as File);
}

export async function leerFactura(imagen: string, igic: boolean): Promise<DatosTicket> {
  const r = await fetch('/api/gastos/ticket', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imagen, igic }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error || `Error ${r.status}`);
  return d as DatosTicket;
}

/** Del base64 guardado en la bandeja a un Blob con su tipo. */
export function blobDesdeBase64(base64: string, mime: string): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
