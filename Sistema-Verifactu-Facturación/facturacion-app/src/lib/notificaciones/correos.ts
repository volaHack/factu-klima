/**
 * LOS CORREOS DE AVISOS Y DEL RESUMEN DEL MES
 */

import type { TareaHoy } from '../panelHoy';
import { formatCurrency } from '../utils';
import { COLOR, correoBase } from '../correo/plantilla';
import type { ResumenMes } from './resumen';

export interface Destinatario {
  /** Nombre comercial o razón social. */
  empresa: string;
  /** Nombre de la persona, si se sabe. */
  nombre: string | null;
}

export interface Enlaces {
  /** https://klimafacturas.com */
  app: string;
  /** El enlace para darse de baja (único por cuenta). */
  baja: string;
}

const saludo = (d: Destinatario) => (d.nombre?.trim() ? `Hola, ${d.nombre.trim().split(/\s+/)[0]}:` : 'Hola,');
const pie = (d: Destinatario) => `Te llega porque en KlimaFacturas, para ${d.empresa}, tienes activados estos correos (Ajustes → Notificaciones por correo).`;
const con = (base: string, ruta: string) => new URL(ruta, base).toString();

const euros = (n: number) => formatCurrency(n);
/** Para las barras: sin decimales, que encima de una barra estorban. */
const corto = (n: number) => `${Math.round(n).toLocaleString('es-ES')} €`;
const pct = (n: number) => `${n.toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`;

/** Una o dos frases que digan algo que las cifras solas no dicen. */
function lecturas(r: ResumenMes): string[] {
  const salida: string[] = [];
  const previos = r.historial.slice(0, -1).map(h => h.facturado);
  if (!r.parcial && r.facturado > 0 && previos.length && r.facturado > Math.max(...previos)) {
    salida.push(`**Tu mejor mes de los últimos seis.** Nunca habías facturado tanto en este tiempo.`);
  }
  if (r.facturado > 0) {
    const ratio = r.cobrado / r.facturado;
    if (ratio >= 0.9) salida.push('**Has cobrado casi todo lo que has facturado.** La caja va al día.');
    else if (ratio < 0.5 && !r.parcial) salida.push(`**Has cobrado ${pct(Math.round(ratio * 100))} de lo facturado.** Merece la pena mirar quién te debe.`);
  }
  if (r.gastos > 0 && r.resultado < 0) salida.push('**Este mes los gastos superan a lo facturado.** Revisa en Gastos si hay algo que no se repita.');
  return salida.slice(0, 2);
}

export function correoResumen(r: ResumenMes, d: Destinatario, u: Enlaces) {
  const periodo = r.parcial ? `${r.nombreMes.split(' ')[0]} (hasta el día ${r.hastaDia})` : r.nombreMes;
  const comparado = r.parcial ? 'los mismos días del mes anterior' : 'el mes anterior';
  const tendencia = r.variacion == null ? null : { texto: pct(Math.abs(r.variacion)), sube: r.variacion >= 0 };

  const parrafos = [`Así ${r.parcial ? 'va' : 'ha ido'} ${periodo} en **${d.empresa}**.`, ...lecturas(r)];
  if (r.vencido > 0) {
    parrafos.push(`Tienes **${euros(r.vencido)}** en facturas vencidas. Desde Recordatorios de cobro puedes reclamarlas con un clic.`);
  }

  const max = r.mejoresClientes[0]?.total ?? 0;
  const conDatos = r.historial.some(h => h.facturado > 0 || h.cobrado > 0);
  const { html, texto } = correoBase({
    ceja: r.parcial ? 'Tu mes hasta hoy' : 'Resumen del mes',
    titulo: r.parcial ? `Tu ${r.nombreMes.split(' ')[0]}, hasta hoy` : `Tu ${r.nombreMes}`,
    entradilla: `${d.empresa} · ${r.facturas} ${r.facturas === 1 ? 'factura emitida' : 'facturas emitidas'}`,
    preheader: `${euros(r.facturado)} facturados${tendencia ? ` (${tendencia.sube ? '+' : '−'}${tendencia.texto})` : ''} · ${euros(r.cobrado)} cobrados · ${euros(r.gastos)} en gastos`,
    saludo: saludo(d),
    parrafos,
    destacado: {
      etiqueta: 'Facturado',
      valor: euros(r.facturado),
      tendencia,
      detalle: r.variacion == null
        ? (r.facturado > 0 ? 'Es el primer mes que podemos comparar.' : 'Este mes todavía no hay facturas emitidas.')
        : `Frente a ${euros(r.anterior)} en ${comparado}.`,
    },
    cifras: [
      { etiqueta: 'Cobrado', valor: euros(r.cobrado), bien: r.cobrado > 0 },
      { etiqueta: 'Gastos', valor: euros(r.gastos) },
      { etiqueta: 'Resultado', valor: euros(r.resultado), detalle: 'facturado menos gastos', aviso: r.resultado < 0, bien: r.resultado > 0 },
      { etiqueta: 'Factura media', valor: euros(r.ticketMedio) },
      { etiqueta: 'Pendiente de cobro hoy', valor: euros(r.pendiente), detalle: r.vencido > 0 ? `de ello, **${euros(r.vencido)} vencido**` : 'nada vencido', aviso: r.vencido > 0 },
      { etiqueta: 'Facturas del mes', valor: String(r.facturas) },
    ],
    grafica: conDatos ? {
      titulo: 'Los últimos seis meses',
      series: [{ nombre: 'Facturado', color: COLOR }, { nombre: 'Cobrado', color: '#e9a3bf' }],
      barras: r.historial.map(h => ({ etiqueta: h.etiqueta, valores: [h.facturado, h.cobrado], resaltar: h.mes === r.mes })),
      formato: corto,
    } : undefined,
    listas: [
      { titulo: 'Tus mejores clientes del mes', filas: r.mejoresClientes.map(c => ({ texto: c.nombre, valor: euros(c.total), proporcion: max ? c.total / max : 0 })) },
      { titulo: 'Las vencidas más antiguas', filas: r.vencidas.map(v => ({ texto: `${v.numero} · ${v.cliente} · hace ${v.dias} ${v.dias === 1 ? 'día' : 'días'}`, valor: euros(v.total) })) },
    ],
    boton: { texto: 'Ver el panel completo', url: con(u.app, '/dashboard') },
    pie: pie(d),
    bajaUrl: u.baja,
  });
  const asunto = r.parcial
    ? `Tu ${r.nombreMes.split(' ')[0]} hasta hoy en KlimaFacturas: ${euros(r.facturado)} facturados`
    : `Tu ${r.nombreMes} en KlimaFacturas: ${euros(r.facturado)} facturados`;
  return { asunto, html, texto };
}

export function correoAvisos(tareas: TareaHoy[], d: Destinatario, u: Enlaces) {
  const asunto = tareas.length === 1
    ? `KlimaFacturas: ${tareas[0].titulo}`
    : `KlimaFacturas: ${tareas.length} cosas que mirar hoy`;
  const { html, texto } = correoBase({
    ceja: 'Avisos de tu panel',
    titulo: tareas.length === 1 ? tareas[0].titulo : 'Lo que te toca hoy',
    entradilla: d.empresa,
    preheader: tareas.map(t => t.titulo).join(' · '),
    saludo: saludo(d),
    parrafos: [`Esto es lo que pide tu atención en **${d.empresa}**:`],
    listas: [{
      titulo: 'Para hoy',
      filas: tareas.map(t => ({
        texto: `**${t.titulo}**${t.detalle ? ` — ${t.detalle}` : ''} · ${t.accion}: ${con(u.app, t.href)}`,
        valor: t.importe != null ? formatCurrency(t.importe) : undefined,
      })),
    }],
    boton: { texto: tareas.length === 1 ? tareas[0].accion : 'Abrir el panel', url: con(u.app, tareas.length === 1 ? tareas[0].href : '/dashboard') },
    nota: 'Te volveremos a avisar sólo si cambia algo, o dentro de una semana si sigue pendiente.',
    pie: pie(d),
    bajaUrl: u.baja,
  });
  return { asunto, html, texto };
}
