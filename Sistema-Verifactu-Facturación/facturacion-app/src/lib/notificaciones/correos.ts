/**
 * LOS CORREOS DE AVISOS Y DEL RESUMEN DEL MES
 */

import type { TareaHoy } from '../panelHoy';
import { formatCurrency } from '../utils';
import { correoBase } from '../correo/plantilla';
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

export function correoResumen(r: ResumenMes, d: Destinatario, u: Enlaces) {
  const tendencia = r.variacion == null
    ? (r.facturado > 0 ? 'Es el primer mes con facturas que podemos comparar.' : 'Este mes no ha habido facturas emitidas.')
    : r.variacion >= 0
      ? `Has facturado **un ${r.variacion.toLocaleString('es-ES')} % más** que el mes anterior (${formatCurrency(r.anterior)}).`
      : `Has facturado **un ${Math.abs(r.variacion).toLocaleString('es-ES')} % menos** que el mes anterior (${formatCurrency(r.anterior)}).`;

  const parrafos = [
    `Así ha ido ${r.nombreMes} en **${d.empresa}**.`,
    tendencia,
  ];
  if (r.vencido > 0) {
    parrafos.push(`Tienes **${formatCurrency(r.vencido)}** en facturas vencidas. Desde Recordatorios de cobro puedes reclamarlas con un clic.`);
  }

  const { html, texto } = correoBase({
    titulo: `Tu ${r.nombreMes}`,
    saludo: saludo(d),
    parrafos,
    cifras: [
      { etiqueta: 'Facturado', valor: formatCurrency(r.facturado), detalle: `${r.facturas} ${r.facturas === 1 ? 'factura' : 'facturas'}` },
      { etiqueta: 'Cobrado', valor: formatCurrency(r.cobrado) },
      { etiqueta: 'Gastos', valor: formatCurrency(r.gastos) },
      { etiqueta: 'Pendiente de cobro hoy', valor: formatCurrency(r.pendiente), detalle: r.vencido > 0 ? `de ello, **${formatCurrency(r.vencido)} vencido**` : undefined, aviso: r.vencido > 0 },
    ],
    listas: [
      { titulo: 'Tus mejores clientes del mes', filas: r.mejoresClientes.map(c => ({ texto: c.nombre, valor: formatCurrency(c.total) })) },
      { titulo: 'Las vencidas más antiguas', filas: r.vencidas.map(v => ({ texto: `${v.numero} · ${v.cliente} · hace ${v.dias} ${v.dias === 1 ? 'día' : 'días'}`, valor: formatCurrency(v.total) })) },
    ],
    boton: { texto: 'Ver el panel', url: con(u.app, '/dashboard') },
    pie: pie(d),
    bajaUrl: u.baja,
  });
  return { asunto: `Tu ${r.nombreMes} en KlimaFacturas: ${formatCurrency(r.facturado)} facturados`, html, texto };
}

export function correoAvisos(tareas: TareaHoy[], d: Destinatario, u: Enlaces) {
  const asunto = tareas.length === 1
    ? `KlimaFacturas: ${tareas[0].titulo}`
    : `KlimaFacturas: ${tareas.length} cosas que mirar hoy`;
  const { html, texto } = correoBase({
    titulo: tareas.length === 1 ? tareas[0].titulo : 'Lo que te toca hoy',
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
