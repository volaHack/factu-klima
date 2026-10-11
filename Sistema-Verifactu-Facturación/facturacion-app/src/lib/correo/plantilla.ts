/**
 * EL ASPECTO DE LOS CORREOS DE KLIMAFACTURAS
 *
 * Una sola plantilla para todos (los de la cuenta, los avisos, el resumen
 * del mes), hecha como se hacen los correos: tablas y estilos en línea,
 * porque Outlook y Gmail ignoran casi todo lo demás. Siempre con versión
 * en texto plano, que es lo que leen algunos clientes y los filtros de
 * correo no deseado miran.
 *
 * Arriba, la banda oscura de la marca con el logo (un PNG: Gmail y Outlook
 * no pintan SVG); debajo, la tarjeta blanca con el contenido. Las gráficas
 * son celdas de tabla con altura, lo único que se ve igual en todas partes.
 *
 * Todo lo que llega de fuera (nombres, conceptos) se escapa: un nombre de
 * empresa con «<» no puede meter HTML en el correo.
 */

import { urlDelSitio } from '../sitio';

export const COLOR = '#b02a5c';
const ROSA = '#e2689b';
const OSCURO = '#1a1216';
const TINTA = '#1f1f24';
const SUAVE = '#6b6b76';
const FONDO = '#f4eef1';
const BORDE = '#eadfe3';
const VERDE = '#1e8a5a';
const ROJO = '#c0392b';
const LETRA = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

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
  /** Pinta el valor en verde (a favor). */
  bien?: boolean;
}

export interface Lista {
  titulo: string;
  filas: { texto: string; valor?: string; /** 0…1: pinta una barrita debajo. */ proporcion?: number }[];
}

/** La cifra grande de arriba («1.800 € facturados», con su ▲ 50 %). */
export interface Destacado {
  etiqueta: string;
  valor: string;
  tendencia?: { texto: string; sube: boolean } | null;
  detalle?: string;
}

/** Barras verticales por mes: una o dos series. */
export interface Grafica {
  titulo: string;
  series: { nombre: string; color: string }[];
  barras: { etiqueta: string; valores: number[]; /** El mes del que trata el correo. */ resaltar?: boolean }[];
  /** Cómo escribir un valor (para la cifra encima de la barra resaltada). */
  formato: (n: number) => string;
}

export interface DatosCorreo {
  /** Lo primero que se lee. */
  titulo: string;
  /** Lo que la bandeja de entrada enseña junto al asunto. */
  preheader?: string;
  /** La línea pequeña en rosa sobre el título («Resumen del mes»). */
  ceja?: string;
  /** Una frase bajo el título, en la banda oscura. */
  entradilla?: string;
  /** «Hola, Lucía,»; si no se pone, no hay saludo. */
  saludo?: string;
  parrafos: string[];
  destacado?: Destacado;
  cifras?: Cifra[];
  grafica?: Grafica;
  listas?: Lista[];
  boton?: { texto: string; url: string };
  /** Un código de un solo uso, grande y fácil de copiar. */
  codigo?: string;
  /** Un recuadro con borde de color: consejos, «si no has sido tú…». */
  recuadro?: { titulo: string; texto: string };
  /** Letra pequeña bajo el botón (caducidad). */
  nota?: string;
  /** Pie: por qué le llega este correo y cómo dejar de recibirlo. */
  pie?: string;
  bajaUrl?: string;
}

const p = (t: string, estilo = '') =>
  `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${TINTA};${estilo}">${conNegritas(t)}</p>`;

const subtitulo = (t: string) =>
  `<p style="margin:26px 0 10px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${SUAVE};">${escaparHtml(t)}</p>`;

function htmlDestacado(d: Destacado): string {
  const t = d.tendencia;
  const pastilla = t
    ? `<span style="display:inline-block;margin-left:10px;padding:4px 10px;border-radius:999px;font-size:13px;font-weight:700;vertical-align:middle;background:${t.sube ? '#e3f4ec' : '#fbe7e4'};color:${t.sube ? VERDE : ROJO};">${t.sube ? '▲' : '▼'} ${escaparHtml(t.texto)}</span>`
    : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 18px;border-collapse:separate;">
    <tr><td style="padding:20px 22px;border-radius:14px;background:#fbf4f7;border:1px solid ${BORDE};">
      <div style="font-size:13px;color:${SUAVE};">${escaparHtml(d.etiqueta)}</div>
      <div style="margin-top:4px;font-size:34px;line-height:1.15;font-weight:800;letter-spacing:-.02em;color:${TINTA};">${escaparHtml(d.valor)}${pastilla}</div>
      ${d.detalle ? `<div style="margin-top:6px;font-size:13px;line-height:1.5;color:${SUAVE};">${conNegritas(d.detalle)}</div>` : ''}
    </td></tr>
  </table>`;
}

/** Las cifras de dos en dos (en el móvil siguen cabiendo: son cortas). */
function htmlCifras(cifras: Cifra[]): string {
  const celda = (c?: Cifra) => (c
    ? `<td width="50%" valign="top" style="padding:14px 16px;border:1px solid ${BORDE};border-radius:12px;background:#ffffff;">
        <div style="font-size:12px;color:${SUAVE};">${escaparHtml(c.etiqueta)}</div>
        <div style="font-size:20px;font-weight:800;letter-spacing:-.01em;color:${c.aviso ? ROJO : c.bien ? VERDE : TINTA};margin-top:3px;">${escaparHtml(c.valor)}</div>
        ${c.detalle ? `<div style="font-size:12px;line-height:1.45;color:${SUAVE};margin-top:3px;">${conNegritas(c.detalle)}</div>` : ''}
      </td>`
    : '<td width="50%"></td>');
  const filas: string[] = [];
  for (let i = 0; i < cifras.length; i += 2) {
    filas.push(`<tr>${celda(cifras[i])}<td width="10" style="width:10px;"></td>${celda(cifras[i + 1])}</tr><tr><td colspan="3" height="10" style="height:10px;line-height:10px;font-size:0;">&nbsp;</td></tr>`);
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 8px;border-collapse:separate;">${filas.join('')}</table>`;
}

const ALTO = 120;

function htmlGrafica(g: Grafica): string {
  const max = Math.max(1, ...g.barras.flatMap(b => b.valores));
  const alto = (v: number) => (v > 0 ? Math.max(3, Math.round((v / max) * ALTO)) : 0);
  const barra = (v: number, color: string, apagada: boolean) => {
    const h = alto(v);
    return `<td valign="bottom" style="padding:0 1px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="12" style="width:12px;border-collapse:collapse;"><tr>
        <td height="${h || 1}" style="height:${h || 1}px;line-height:0;font-size:0;background:${h ? color : BORDE};border-radius:4px 4px 0 0;${apagada ? 'opacity:.45;' : ''}">&nbsp;</td>
      </tr></table>
    </td>`;
  };
  const columnas = g.barras.map(b => `<td valign="bottom" align="center" style="padding:0 4px;">
      ${b.resaltar ? `<div style="font-size:11px;font-weight:700;color:${TINTA};white-space:nowrap;padding-bottom:4px;">${escaparHtml(g.formato(b.valores[0] ?? 0))}</div>` : ''}
      <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>
        ${b.valores.map((v, i) => barra(v, g.series[i]?.color ?? COLOR, !b.resaltar)).join('')}
      </tr></table>
    </td>`).join('');
  const meses = g.barras.map(b =>
    `<td align="center" style="padding:6px 4px 0;font-size:11px;color:${b.resaltar ? TINTA : SUAVE};font-weight:${b.resaltar ? 700 : 400};">${escaparHtml(b.etiqueta)}</td>`).join('');
  const leyenda = g.series.map(s =>
    `<span style="display:inline-block;margin-right:14px;font-size:12px;color:${SUAVE};"><span style="display:inline-block;width:9px;height:9px;border-radius:3px;background:${s.color};vertical-align:middle;margin-right:5px;"></span>${escaparHtml(s.nombre)}</span>`).join('');

  return `${subtitulo(g.titulo)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border:1px solid ${BORDE};border-radius:14px;background:#ffffff;">
      <tr><td style="padding:18px 14px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <tr style="height:${ALTO + 20}px;">${columnas}</tr>
          <tr><td colspan="${g.barras.length}" style="border-top:1px solid ${BORDE};line-height:0;font-size:0;height:1px;">&nbsp;</td></tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>${meses}</tr></table>
        <div style="padding-top:12px;">${leyenda}</div>
      </td></tr>
    </table>`;
}

function htmlListas(listas: Lista[]): string {
  return listas.filter(l => l.filas.length).map(l => `
      ${subtitulo(l.titulo)}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:6px;">
        ${l.filas.map(f => `<tr>
          <td style="padding:10px 0 ${f.proporcion != null ? '4px' : '10px'};${f.proporcion != null ? '' : `border-bottom:1px solid #f0e6ea;`}font-size:14px;line-height:1.45;color:${TINTA};">${conNegritas(f.texto)}</td>
          <td style="padding:10px 0 ${f.proporcion != null ? '4px' : '10px'} 12px;${f.proporcion != null ? '' : `border-bottom:1px solid #f0e6ea;`}font-size:14px;color:${TINTA};text-align:right;white-space:nowrap;font-weight:700;">${f.valor ? escaparHtml(f.valor) : ''}</td>
        </tr>${f.proporcion != null ? `<tr><td colspan="2" style="padding:0 0 10px;border-bottom:1px solid #f0e6ea;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f4ebef;border-radius:999px;"><tr>
            <td width="${Math.max(2, Math.round(Math.min(1, f.proporcion) * 100))}%" height="6" style="height:6px;line-height:0;font-size:0;background:${COLOR};border-radius:999px;">&nbsp;</td><td style="line-height:0;font-size:0;">&nbsp;</td>
          </tr></table>
        </td></tr>` : ''}`).join('')}
      </table>`).join('');
}

function htmlBoton(b: { texto: string; url: string }): string {
  const url = escaparHtml(b.url);
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 12px;"><tr><td style="border-radius:12px;background:${COLOR};box-shadow:0 6px 16px rgba(176,42,92,.28);">
      <a href="${url}" style="display:inline-block;padding:15px 26px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">${escaparHtml(b.texto)} &rarr;</a>
    </td></tr></table>
    <p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:${SUAVE};">Si el botón no funciona, copia esta dirección en el navegador:<br><a href="${url}" style="color:${COLOR};word-break:break-all;">${url}</a></p>`;
}

export function correoBase(d: DatosCorreo): { html: string; texto: string } {
  const sitio = urlDelSitio();
  const logo = `${sitio}/correo/logo.png`;

  const codigo = d.codigo
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0;"><tr><td style="padding:16px 22px;border-radius:12px;background:#fbf4f7;border:1px dashed ${ROSA};font-size:30px;font-weight:800;letter-spacing:.32em;color:${TINTA};font-family:ui-monospace,Menlo,Consolas,monospace;">${escaparHtml(d.codigo)}</td></tr></table>`
    : '';

  const recuadro = d.recuadro
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 4px;border-collapse:separate;"><tr><td style="padding:14px 16px;border-left:4px solid ${ROSA};background:#fbf4f7;border-radius:0 10px 10px 0;">
        <div style="font-size:13px;font-weight:700;color:${TINTA};margin-bottom:3px;">${escaparHtml(d.recuadro.titulo)}</div>
        <div style="font-size:13px;line-height:1.55;color:${SUAVE};">${conNegritas(d.recuadro.texto)}</div>
      </td></tr></table>`
    : '';

  const preheader = d.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${escaparHtml(d.preheader)}${'&#8204;&nbsp;'.repeat(40)}</div>`
    : '';

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${escaparHtml(d.titulo)}</title></head>
<body style="margin:0;padding:0;background:${FONDO};font-family:${LETRA};-webkit-font-smoothing:antialiased;">
  ${preheader}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${FONDO};padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">
        <tr><td style="background:${OSCURO};border-radius:20px 20px 0 0;padding:22px 28px 30px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td valign="middle" width="44" style="width:44px;"><a href="${escaparHtml(sitio)}" style="text-decoration:none;"><img src="${escaparHtml(logo)}" width="40" height="40" alt="KlimaFacturas" style="display:block;border:0;border-radius:11px;"></a></td>
            <td valign="middle" style="padding-left:10px;font-size:17px;font-weight:800;letter-spacing:-.01em;color:#fbf6f2;">Klima<span style="color:${ROSA};">Facturas</span></td>
          </tr></table>
          ${d.ceja ? `<p style="margin:26px 0 6px;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${ROSA};">${escaparHtml(d.ceja)}</p>` : '<div style="height:22px;line-height:22px;font-size:0;">&nbsp;</div>'}
          <h1 style="margin:0;font-size:26px;line-height:1.25;font-weight:800;letter-spacing:-.02em;color:#ffffff;">${escaparHtml(d.titulo)}</h1>
          ${d.entradilla ? `<p style="margin:10px 0 0;font-size:15px;line-height:1.55;color:#cfc3c8;">${conNegritas(d.entradilla)}</p>` : ''}
        </td></tr>
        <tr><td style="height:4px;line-height:4px;font-size:0;background:${COLOR};">&nbsp;</td></tr>
        <tr><td style="background:#ffffff;border-radius:0 0 20px 20px;padding:30px 28px 28px;border:1px solid ${BORDE};border-top:0;">
          ${d.saludo ? p(d.saludo) : ''}
          ${d.parrafos.map(t => p(t)).join('')}
          ${d.destacado ? htmlDestacado(d.destacado) : ''}
          ${d.cifras?.length ? htmlCifras(d.cifras) : ''}
          ${d.grafica ? htmlGrafica(d.grafica) : ''}
          ${htmlListas(d.listas ?? [])}
          ${codigo}
          ${d.boton ? htmlBoton(d.boton) : ''}
          ${d.nota ? `<p style="margin:12px 0 0;font-size:13px;line-height:1.5;color:${SUAVE};">${conNegritas(d.nota)}</p>` : ''}
          ${recuadro}
          <p style="margin:26px 0 0;font-size:14px;line-height:1.5;color:${TINTA};">Un saludo,<br><strong>El equipo de KlimaFacturas</strong></p>
        </td></tr>
        <tr><td style="padding:20px 12px 0;font-size:12px;line-height:1.6;color:${SUAVE};text-align:center;">
          ${d.pie ? `${escaparHtml(d.pie)}<br>` : ''}
          ${d.bajaUrl ? `<a href="${escaparHtml(d.bajaUrl)}" style="color:${SUAVE};">Dejar de recibir estos correos</a><br>` : ''}
          <a href="${escaparHtml(sitio)}" style="color:${COLOR};text-decoration:none;font-weight:700;">KlimaFacturas</a> · Facturación con Veri*Factu · <a href="mailto:administrador@klimafacturas.com" style="color:${SUAVE};">administrador@klimafacturas.com</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const g = d.grafica;
  const texto = [
    ...(d.ceja ? [d.ceja.toUpperCase()] : []),
    d.titulo,
    ...(d.entradilla ? [sinNegritas(d.entradilla)] : []),
    '',
    ...(d.saludo ? [d.saludo, ''] : []),
    ...d.parrafos.flatMap(t => [sinNegritas(t), '']),
    ...(d.destacado ? [`${d.destacado.etiqueta}: ${d.destacado.valor}${d.destacado.tendencia ? ` (${d.destacado.tendencia.sube ? '+' : '−'}${d.destacado.tendencia.texto})` : ''}`, ...(d.destacado.detalle ? [sinNegritas(d.destacado.detalle)] : []), ''] : []),
    ...(d.cifras ?? []).map(c => `${c.etiqueta}: ${c.valor}${c.detalle ? ` (${sinNegritas(c.detalle)})` : ''}`),
    ...(d.cifras?.length ? [''] : []),
    ...(g ? [g.titulo.toUpperCase(), ...g.barras.map(b => `- ${b.etiqueta}: ${b.valores.map((v, i) => `${g.formato(v)} ${g.series[i]?.nombre.toLowerCase() ?? ''}`.trim()).join(' · ')}`), ''] : []),
    ...(d.listas ?? []).filter(l => l.filas.length).flatMap(l => [l.titulo.toUpperCase(), ...l.filas.map(f => `- ${sinNegritas(f.texto)}${f.valor ? `: ${f.valor}` : ''}`), '']),
    ...(d.codigo ? [`Código: ${d.codigo}`, ''] : []),
    ...(d.boton ? [`${d.boton.texto}: ${d.boton.url}`, ''] : []),
    ...(d.nota ? [sinNegritas(d.nota), ''] : []),
    ...(d.recuadro ? [`${d.recuadro.titulo} ${sinNegritas(d.recuadro.texto)}`, ''] : []),
    'Un saludo,',
    'El equipo de KlimaFacturas',
    '',
    '—',
    ...(d.pie ? [d.pie] : []),
    ...(d.bajaUrl ? [`Dejar de recibir estos correos: ${d.bajaUrl}`] : []),
    `KlimaFacturas · ${sitio}`,
  ].join('\n');

  return { html, texto };
}
