/**
 * EL ASPECTO DE LOS CORREOS DE KLIMAFACTURAS
 *
 * Una sola plantilla para todos (los de la cuenta, los avisos, el resumen
 * del mes), hecha como se hacen los correos: tablas y estilos en línea,
 * porque Outlook y Gmail ignoran casi todo lo demás. Siempre con versión
 * en texto plano, que es lo que leen algunos clientes y los filtros de
 * correo no deseado miran.
 *
 * Todo lo que llega de fuera (nombres, conceptos) se escapa: un nombre de
 * empresa con «<» no puede meter HTML en el correo.
 */

export const COLOR = '#b02a5c';
const TINTA = '#1f1f24';
const SUAVE = '#6b6b76';
const FONDO = '#f6f1f3';

export function escaparHtml(t: string): string {
  return t
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** **negrita** en los párrafos (lo único que se permite dar formato). */
const conNegritas = (t: string) => escaparHtml(t).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
const sinNegritas = (t: string) => t.replace(/\*\*([^*]+)\*\*/g, '$1');

export interface Cifra {
  etiqueta: string;
  valor: string;
  detalle?: string;
  /** Pinta el valor en rojo (vencido, en contra). */
  aviso?: boolean;
}

export interface Lista {
  titulo: string;
  filas: { texto: string; valor?: string }[];
}

export interface DatosCorreo {
  /** Lo primero que se lee. */
  titulo: string;
  /** «Hola, Lucía,»; si no se pone, no hay saludo. */
  saludo?: string;
  parrafos: string[];
  cifras?: Cifra[];
  listas?: Lista[];
  boton?: { texto: string; url: string };
  /** Un código de un solo uso, grande y fácil de copiar. */
  codigo?: string;
  /** Letra pequeña bajo el botón (caducidad, «si no has sido tú…»). */
  nota?: string;
  /** Pie: por qué le llega este correo y cómo dejar de recibirlo. */
  pie?: string;
  bajaUrl?: string;
}

export function correoBase(d: DatosCorreo): { html: string; texto: string } {
  const p = (t: string, estilo = '') =>
    `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:${TINTA};${estilo}">${conNegritas(t)}</p>`;

  const cifras = d.cifras?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;border-collapse:separate;border-spacing:0 8px;">
        ${d.cifras.map(c => `<tr><td style="padding:12px 14px;border:1px solid #eadfe3;border-radius:10px;background:#fff;">
          <div style="font-size:12px;color:${SUAVE};">${escaparHtml(c.etiqueta)}</div>
          <div style="font-size:20px;font-weight:700;color:${c.aviso ? '#c0392b' : TINTA};margin-top:2px;">${escaparHtml(c.valor)}</div>
          ${c.detalle ? `<div style="font-size:12px;color:${SUAVE};margin-top:2px;">${conNegritas(c.detalle)}</div>` : ''}
        </td></tr>`).join('')}
      </table>`
    : '';

  const listas = (d.listas ?? []).filter(l => l.filas.length).map(l => `
      <p style="margin:18px 0 8px;font-size:13px;font-weight:700;letter-spacing:.02em;text-transform:uppercase;color:${SUAVE};">${escaparHtml(l.titulo)}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:8px;">
        ${l.filas.map(f => `<tr>
          <td style="padding:8px 0;border-bottom:1px solid #f0e6ea;font-size:14px;color:${TINTA};">${conNegritas(f.texto)}</td>
          <td style="padding:8px 0;border-bottom:1px solid #f0e6ea;font-size:14px;color:${TINTA};text-align:right;white-space:nowrap;font-weight:600;">${f.valor ? escaparHtml(f.valor) : ''}</td>
        </tr>`).join('')}
      </table>`).join('');

  const boton = d.boton
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 10px;"><tr><td style="border-radius:10px;background:${COLOR};">
        <a href="${escaparHtml(d.boton.url)}" style="display:inline-block;padding:13px 22px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${escaparHtml(d.boton.texto)}</a>
      </td></tr></table>
      <p style="margin:0 0 14px;font-size:12px;line-height:1.5;color:${SUAVE};">Si el botón no funciona, copia esta dirección en el navegador:<br><a href="${escaparHtml(d.boton.url)}" style="color:${COLOR};word-break:break-all;">${escaparHtml(d.boton.url)}</a></p>`
    : '';

  const codigo = d.codigo
    ? `<p style="margin:18px 0;font-size:30px;font-weight:700;letter-spacing:.3em;color:${TINTA};font-family:ui-monospace,Menlo,Consolas,monospace;">${escaparHtml(d.codigo)}</p>`
    : '';

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escaparHtml(d.titulo)}</title></head>
<body style="margin:0;padding:0;background:${FONDO};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${FONDO};padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td style="padding:0 6px 16px;font-size:16px;font-weight:800;color:${COLOR};letter-spacing:-.01em;">KlimaFacturas</td></tr>
        <tr><td style="background:#ffffff;border-radius:16px;padding:30px 28px;border:1px solid #eadfe3;">
          <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${TINTA};">${escaparHtml(d.titulo)}</h1>
          ${d.saludo ? p(d.saludo) : ''}
          ${d.parrafos.map(t => p(t)).join('')}
          ${cifras}${listas}${codigo}${boton}
          ${d.nota ? `<p style="margin:14px 0 0;font-size:13px;line-height:1.5;color:${SUAVE};">${conNegritas(d.nota)}</p>` : ''}
        </td></tr>
        <tr><td style="padding:16px 8px 0;font-size:12px;line-height:1.5;color:${SUAVE};text-align:center;">
          ${d.pie ? `${escaparHtml(d.pie)}<br>` : ''}
          ${d.bajaUrl ? `<a href="${escaparHtml(d.bajaUrl)}" style="color:${SUAVE};">Dejar de recibir estos correos</a><br>` : ''}
          KlimaFacturas · <a href="https://klimafacturas.com" style="color:${SUAVE};">klimafacturas.com</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const texto = [
    d.titulo,
    '',
    ...(d.saludo ? [d.saludo, ''] : []),
    ...d.parrafos.flatMap(t => [sinNegritas(t), '']),
    ...(d.cifras ?? []).map(c => `${c.etiqueta}: ${c.valor}${c.detalle ? ` (${sinNegritas(c.detalle)})` : ''}`),
    ...(d.cifras?.length ? [''] : []),
    ...(d.listas ?? []).filter(l => l.filas.length).flatMap(l => [l.titulo.toUpperCase(), ...l.filas.map(f => `- ${sinNegritas(f.texto)}${f.valor ? `: ${f.valor}` : ''}`), '']),
    ...(d.codigo ? [`Código: ${d.codigo}`, ''] : []),
    ...(d.boton ? [`${d.boton.texto}: ${d.boton.url}`, ''] : []),
    ...(d.nota ? [sinNegritas(d.nota), ''] : []),
    '—',
    ...(d.pie ? [d.pie] : []),
    ...(d.bajaUrl ? [`Dejar de recibir estos correos: ${d.bajaUrl}`] : []),
    'KlimaFacturas · https://klimafacturas.com',
  ].join('\n');

  return { html, texto };
}
