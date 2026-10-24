/**
 * EL PAPEL DE LOS LISTADOS, IMPRESOS Y RELACIONES
 *
 * Lo que se imprime se copia a un iframe con su propio CSS: con
 * window.print() iría al papel la aplicación entera (barras fijas,
 * superposiciones, el tema oscuro), y basta con que una de esas cosas falle
 * para que el folio salga en blanco.
 */

/**
 * El CSS del papel, escrito aparte y a mano.
 *
 * Va sin variables y con los colores puestos: esta hoja se imprime en un
 * documento propio que no carga el CSS de la aplicación, así que no hay
 * tokens que resolver ni tema claro/oscuro que valga. Los nombres de
 * clase son los mismos que en pantalla para que el marcado sirva igual.
 */
export const CSS_PAPEL = `
@page { size: A4 portrait; margin: 14mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; }
body {
  font-family: 'IBM Plex Sans', system-ui, 'Segoe UI', Arial, sans-serif;
  color: #1a1216; font-size: 10px; line-height: 1.45;
}
.listado-hoja { border: 0; padding: 0; background: #fff; }
.listado-hoja-cabeza {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 16px; padding-bottom: 10px; margin-bottom: 10px;
  border-bottom: 2px solid #1a1216;
}
.listado-hoja-cabeza h2 { margin: 0; font-size: 15px; font-weight: 700; letter-spacing: -0.02em; }
.listado-hoja-cabeza p { margin: 2px 0 0; font-size: 9px; color: #6f5d63; }
.listado-hoja-acotado { display: grid; gap: 2px; margin: 0; font-size: 8px; text-align: right; }
.listado-hoja-acotado > div { display: flex; gap: 8px; justify-content: flex-end; }
.listado-hoja-acotado dt { color: #6f5d63; }
.listado-hoja-acotado dd { margin: 0; font-weight: 600; }
.listado-tabla { width: 100%; border-collapse: collapse; font-size: 9.5px; }
.listado-tabla th {
  text-align: left; padding: 5px 6px; font-size: 8px; font-weight: 700;
  letter-spacing: 0.04em; text-transform: uppercase; color: #4a3a40;
  border-bottom: 1px solid rgba(26, 18, 22, 0.35);
}
.listado-tabla td { padding: 5px 6px; border-bottom: 1px solid rgba(26, 18, 22, 0.15); }
.listado-tabla .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.listado-tabla .fuerte { font-weight: 700; }
.listado-tabla .mono { font-family: 'IBM Plex Mono', ui-monospace, Consolas, monospace; }
.listado-tabla .listado-doc { color: #6f5d63; }
.listado-tabla tfoot td {
  padding-top: 8px; border-top: 2px solid #1a1216; border-bottom: none; font-weight: 700;
}
/* La cabecera se repite en cada hoja y ninguna fila se parte por la mitad. */
thead { display: table-header-group; }
tr { break-inside: avoid; }
`;

/** Imprime este HTML en su propio documento, con el CSS del papel y el que se añada. */
export function imprimirHtml(titulo: string, html: string, cssExtra = '', apaisado = false): void {
  const marco = document.createElement('iframe');
  marco.setAttribute('aria-hidden', 'true');
  // Fuera de la vista, pero con tamaño real: un iframe en display:none
  // o de 0x0 no llega a imprimirse en algunos navegadores.
  marco.style.cssText =
    'position:fixed;right:0;bottom:0;width:210mm;height:297mm;border:0;opacity:0;pointer-events:none;';
  document.body.appendChild(marco);

  const doc = marco.contentDocument;
  const ventana = marco.contentWindow;
  if (!doc || !ventana) { marco.remove(); return; }

  // El título es el nombre del fichero que propone «Guardar como PDF».
  doc.open();
  doc.write(
    '<!doctype html><html lang="es"><head><meta charset="utf-8">' +
    `<title>${titulo.replace(/[<>&]/g, ' ')}</title>` +
    `<style>${CSS_PAPEL}${apaisado ? '@page { size: A4 landscape; margin: 12mm; }' : ''}${cssExtra}</style></head><body>${html}</body></html>`,
  );
  doc.close();

  const lanzar = () => {
    ventana.focus();
    ventana.print();
  };
  // El marco no se puede quitar antes de que el diálogo termine, o se
  // cancela la impresión. onafterprint avisa al cerrarse; el temporizador
  // es la red de seguridad por si el navegador no lo dispara.
  ventana.onafterprint = () => marco.remove();
  window.setTimeout(() => marco.remove(), 60000);

  if (doc.readyState === 'complete') lanzar();
  else marco.onload = lanzar;
}

/** Bajar un CSV (para Excel). */
export function descargarCsv(nombre: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}
