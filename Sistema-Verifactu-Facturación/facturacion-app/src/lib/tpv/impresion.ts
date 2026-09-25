'use client';

/**
 * IMPRIMIR EL TICKET EN SU PAPEL
 *
 * El ticket se imprimía con `window.print()` sobre la página entera del TPV,
 * y la hoja de estilos del programa trae `@page { size: A4 }` para las
 * facturas. `@page` no se puede acotar a un trozo de la página: el
 * navegador mandaba a la impresora de tickets una hoja A4 con 18 mm de
 * margen, y el ticket salía encogido o cortado.
 *
 * Ahora se imprime en un documento aparte (un iframe invisible) que sólo
 * contiene el ticket y su propio `@page` con el ancho del rollo y sin
 * márgenes. Así da igual lo que diga el resto de la hoja de estilos.
 *
 * El papel es del EQUIPO, no de la cuenta: la caja del mostrador puede
 * tener una térmica de 80 mm y el portátil de la oficina una láser A4. Por
 * eso se guarda en este navegador.
 */

export type Papel = '80' | '58' | 'a4';

export interface AjustesImpresion {
  papel: Papel;
  /** Imprimir solo al cobrar, sin pulsar el botón. */
  alCobrar: boolean;
}

const CLAVE = 'klima-tpv-impresion';
const POR_DEFECTO: AjustesImpresion = { papel: '80', alCobrar: false };

export function leerAjustesImpresion(): AjustesImpresion {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE) || 'null');
    return {
      papel: v?.papel === '58' || v?.papel === 'a4' ? v.papel : '80',
      alCobrar: v?.alCobrar === true,
    };
  } catch {
    return { ...POR_DEFECTO };
  }
}

export function guardarAjustesImpresion(a: AjustesImpresion): void {
  try { localStorage.setItem(CLAVE, JSON.stringify(a)); } catch { /* sin almacenamiento: vale para esta sesión */ }
}

/**
 * La hoja de estilos del ticket impreso, completa y en negro sobre blanco.
 * Las térmicas no imprimen grises: lo que en pantalla es gris aquí es negro.
 */
export function estilosTicket(papel: Papel): string {
  // Ancho útil: los cabezales de 80 mm imprimen unos 72 mm; los de 58, unos 48.
  const ancho = papel === '58' ? '48mm' : '72mm';
  const pagina = papel === 'a4' ? 'size: A4 portrait; margin: 12mm;' : `size: ${papel}mm auto; margin: 0;`;
  const letra = papel === '58' ? '10.5px' : '12px';
  return `
    @page { ${pagina} }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #000; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .tpv-ticket {
      width: ${ancho}; margin: 0 ${papel === 'a4' ? '0' : 'auto'}; padding: 2mm 0 6mm;
      font-family: ui-monospace, 'SFMono-Regular', Menlo, Consolas, 'Courier New', monospace;
      font-size: ${letra}; line-height: 1.35; color: #000;
    }
    .tpv-ticket-qr { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 1mm; padding: ${papel === '58' ? '3mm' : '6mm'} 0; margin-bottom: 2mm; }
    .tpv-ticket-qr img { width: 35mm; height: 35mm; display: block; image-rendering: pixelated; }
    .tpv-ticket-qr-rotulo, .tpv-ticket-qr-leyenda { font-size: 8.5pt; line-height: 1.2; max-width: 47mm; }
    .tpv-ticket-header { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 1px; margin-bottom: 3mm; }
    .tpv-ticket-header strong { font-size: 1.15em; }
    .tpv-ticket-meta { display: flex; justify-content: space-between; gap: 2mm; font-size: 0.92em; }
    .tpv-ticket-divider { border-top: 1px dashed #000; margin: 2.5mm 0; }
    .tpv-ticket-lines { width: 100%; border-collapse: collapse; font: inherit; }
    .tpv-ticket-lines td { padding: 0.6mm 0; vertical-align: top; }
    .tpv-ticket-lines td:last-child { text-align: right; white-space: nowrap; padding-left: 2mm; }
    .tpv-ticket-totals > div { display: flex; justify-content: space-between; padding: 0.4mm 0; }
    .tpv-ticket-total-final { font-weight: 800; font-size: 1.2em; border-top: 1px dashed #000; margin-top: 1mm; padding-top: 1.5mm !important; }
    .tpv-ticket-footer { text-align: center; font-size: 0.85em; line-height: 1.4; margin: 0; }
  `;
}

/** Espera a que carguen las imágenes (el QR): imprimir antes deja el hueco en blanco. */
function imagenesListas(doc: Document): Promise<void> {
  const pendientes = [...doc.images].filter(i => !i.complete);
  if (!pendientes.length) return Promise.resolve();
  return Promise.race([
    Promise.all(pendientes.map(i => new Promise<void>(ok => { i.onload = () => ok(); i.onerror = () => ok(); }))).then(() => {}),
    new Promise<void>(ok => setTimeout(ok, 3000)),
  ]);
}

/** Imprime el ticket (el nodo `.tpv-ticket`) en el papel de este equipo. */
export async function imprimirTicket(ticket: HTMLElement, papel: Papel = leerAjustesImpresion().papel): Promise<void> {
  const marco = document.createElement('iframe');
  marco.setAttribute('aria-hidden', 'true');
  marco.tabIndex = -1;
  // Fuera de la vista pero con tamaño: algunos navegadores no imprimen un iframe de 0×0.
  Object.assign(marco.style, { position: 'fixed', right: '0', bottom: '0', width: '1px', height: '1px', border: '0', opacity: '0', pointerEvents: 'none' });
  document.body.appendChild(marco);

  const doc = marco.contentDocument;
  const win = marco.contentWindow;
  if (!doc || !win) { marco.remove(); window.print(); return; }

  doc.open();
  doc.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Ticket</title><style>${estilosTicket(papel)}</style></head><body>${ticket.outerHTML}</body></html>`);
  doc.close();
  await imagenesListas(doc);

  const quitar = () => setTimeout(() => marco.remove(), 500);
  win.addEventListener('afterprint', quitar, { once: true });
  // Por si el navegador no avisa al terminar (Safari en iOS, por ejemplo).
  setTimeout(() => { if (marco.isConnected) marco.remove(); }, 60_000);
  win.focus();
  win.print();
}
