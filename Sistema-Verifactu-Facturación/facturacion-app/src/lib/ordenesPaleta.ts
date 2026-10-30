/**
 * LAS ÓRDENES DEL BUSCADOR (Ctrl+K)
 *
 * El buscador encuentra cosas; esto hace que además las haga. Se escribe
 * como se diría en voz alta y la primera fila ya es la acción:
 *
 *   · «factura bar pepe», «fra pepe», «nueva factura para bar pepe»
 *     → factura nueva con ese cliente puesto;
 *   · «presupuesto…», «albarán…», «pedido…» → lo mismo con su documento;
 *   · «cobrar F-2026-1127» → abre esa factura para cobrarla; «cobrar pepe»
 *     → sus facturas pendientes;
 *   · «cliente nuevo», «producto nuevo», «alta proveedor»;
 *   · «ir a tesorería», «vencidas», «ve a ajustes».
 *
 * Da igual con tilde o sin ella, en mayúsculas o con las abreviaturas de
 * oficina de siempre (fra, presu, ppto, alb, cli, art…). Si la frase no es
 * una orden, no devuelve nada y el buscador sigue con lo suyo.
 */

import type { Client, Invoice } from './types';
import type { ModuloId } from './modulos';
import { plano } from './buscarProductos';
import { buscarFichas, buscarPantallas, enlaceDeDocumento } from './buscadorUniversal';
import { atajoDe } from './atajos';
import { isFactura } from './documentos';

export type IconoOrden = 'factura' | 'presupuesto' | 'albaran' | 'pedido' | 'cobrar' | 'cliente' | 'proveedor' | 'producto' | 'ir' | 'vencidas';

export interface Orden {
  clave: string;
  icono: IconoOrden;
  titulo: string;
  detalle?: string;
  href: string;
  /** La tecla que hace lo mismo desde cualquier pantalla, si la hay. */
  tecla?: string;
  /** Cómo se escribe más corto en el buscador la próxima vez. */
  truco?: string;
  /** Solo si la empresa tiene este módulo encendido. */
  modulo?: ModuloId;
}

export interface ContextoOrdenes {
  clientes: readonly Client[];
  documentos: readonly Invoice[];
  /** Los módulos encendidos; sin saberlos todavía, se ofrece todo. */
  modulos?: readonly ModuloId[] | null;
  /** ¿Puede abrir esta dirección el perfil de trabajo activo? */
  puede?: (href: string) => boolean;
}

interface DocumentoQueSeCrea {
  icono: IconoOrden;
  nombre: string;
  palabras: readonly string[];
  href: (clienteId?: string) => string;
  truco: string;
  modulo?: ModuloId;
}

const deDocumentos = (tipo: string) => (id?: string) =>
  `/documentos/nuevo?tipo=${tipo}&sentido=venta${id ? `&clientId=${encodeURIComponent(id)}` : ''}`;

const DOCUMENTOS: readonly DocumentoQueSeCrea[] = [
  {
    icono: 'factura', nombre: 'factura', truco: 'fra + cliente',
    palabras: ['factura', 'facturas', 'facturar', 'facturale', 'fact', 'fra', 'fac'],
    href: id => `/facturas/nueva${id ? `?cliente=${encodeURIComponent(id)}` : ''}`,
  },
  {
    icono: 'presupuesto', nombre: 'presupuesto', truco: 'presu + cliente', modulo: 'presupuestos',
    palabras: ['presupuesto', 'presupuestos', 'presupuestar', 'presupuestale', 'presu', 'presup', 'ppto', 'pto'],
    href: deDocumentos('presupuesto'),
  },
  {
    icono: 'albaran', nombre: 'albarán', truco: 'alb + cliente', modulo: 'albaranes',
    palabras: ['albaran', 'albaranes', 'alb', 'entrega'],
    href: deDocumentos('albaran'),
  },
  {
    icono: 'pedido', nombre: 'pedido', truco: 'ped + cliente', modulo: 'pedidos',
    palabras: ['pedido', 'pedidos', 'ped'],
    href: deDocumentos('pedido'),
  },
];

/** Palabras que sobran delante de lo que se pide: «nueva factura PARA…». */
const DE_RELLENO = new Set(['nuevo', 'nueva', 'nuevos', 'nuevas', 'crear', 'crea', 'hacer', 'haz', 'emitir', 'emite', 'otra', 'otro', 'una', 'un']);
const ENLACES = new Set(['a', 'al', 'para', 'de', 'del', 'la', 'el', 'los', 'las', 'con']);
const COBRAR = new Set(['cobrar', 'cobra', 'cobrale', 'cobro', 'cob']);
const IR = new Set(['ir', 've', 'vete', 'abre', 'abrir', 'ver', 'mostrar', 'muestra', 'llevame', 'lleva', 'pantalla']);
const ALTA = new Set(['nuevo', 'nueva', 'crear', 'crea', 'alta', 'anadir', 'anade', 'dar']);

interface FichaQueSeCrea { icono: IconoOrden; titulo: string; palabras: readonly string[]; href: string; truco: string }

const FICHAS: readonly FichaQueSeCrea[] = [
  { icono: 'cliente', titulo: 'Dar de alta un cliente', palabras: ['cliente', 'clientes', 'cli', 'clienta'], href: '/clientes?tipo=clientes&nuevo=1', truco: 'cliente nuevo' },
  { icono: 'proveedor', titulo: 'Dar de alta un proveedor', palabras: ['proveedor', 'proveedores', 'prov', 'proveedora'], href: '/clientes?tipo=proveedores&nuevo=1', truco: 'proveedor nuevo' },
  { icono: 'producto', titulo: 'Dar de alta un producto', palabras: ['producto', 'productos', 'prod', 'articulo', 'articulos', 'art', 'referencia'], href: '/productos?nuevo=1', truco: 'producto nuevo' },
];

interface Destino { icono: IconoOrden; titulo: string; palabras: readonly string[]; href: string; tecla?: string; modulo?: ModuloId }

/**
 * A dónde se va por su nombre corto. Están las pantallas que la gente nombra
 * de una forma y el menú de otra («tesorería» no sale en ningún rótulo).
 */
const DESTINOS: readonly Destino[] = [
  { icono: 'vencidas', titulo: 'Facturas vencidas y vencimientos', palabras: ['vencidas', 'vencida', 'vencimientos', 'vencimiento', 'venc', 'impagadas', 'impagados', 'morosos', 'deudas'], href: '/tesoreria?tab=vencimientos' },
  { icono: 'ir', titulo: 'Tesorería', palabras: ['tesoreria', 'tesoreria y bancos', 'tes'], href: '/tesoreria' },
  { icono: 'cobrar', titulo: 'Cobros', palabras: ['cobros'], href: '/tesoreria?tab=cobros' },
  { icono: 'ir', titulo: 'Pagos', palabras: ['pagos'], href: '/tesoreria?tab=pagos' },
  { icono: 'ir', titulo: 'Panel', palabras: ['panel', 'inicio', 'escritorio', 'dashboard', 'resumen'], href: '/dashboard', tecla: 'D' },
  { icono: 'factura', titulo: 'Facturas de venta', palabras: ['facturas', 'ventas', 'fras'], href: '/facturas', tecla: 'F' },
  { icono: 'cliente', titulo: 'Clientes', palabras: ['clientes', 'cli'], href: '/clientes?tipo=clientes' },
  { icono: 'proveedor', titulo: 'Proveedores', palabras: ['proveedores', 'prov'], href: '/clientes?tipo=proveedores' },
  { icono: 'producto', titulo: 'Productos', palabras: ['productos', 'articulos', 'catalogo', 'prod', 'art', 'stock'], href: '/productos' },
  { icono: 'presupuesto', titulo: 'Presupuestos', palabras: ['presupuestos', 'pptos'], href: '/documentos?tipo=presupuesto&sentido=venta', modulo: 'presupuestos' },
  { icono: 'albaran', titulo: 'Albaranes de venta', palabras: ['albaranes', 'albs'], href: '/documentos?tipo=albaran&sentido=venta', modulo: 'albaranes' },
  { icono: 'pedido', titulo: 'Pedidos de venta', palabras: ['pedidos'], href: '/documentos?tipo=pedido&sentido=venta', modulo: 'pedidos' },
  { icono: 'ir', titulo: 'Ajustes', palabras: ['ajustes', 'configuracion', 'config', 'opciones'], href: '/ajustes' },
  { icono: 'ir', titulo: 'Informes y estadísticas', palabras: ['informes', 'estadisticas', 'graficas'], href: '/informes' },
  { icono: 'ir', titulo: 'Gastos', palabras: ['gastos'], href: '/gastos', modulo: 'gastos' },
];

const sinSignos = (t: string) => plano(t).replace(/[^a-z0-9]/g, '');

/** «Factura de compra F-1», «Albarán ALB-7»: cómo se llama un documento en una fila. */
function nombreDocumento(d: Invoice): string {
  const tipo = d.tipo ?? 'factura';
  const nombre = tipo === 'albaran' ? 'Albarán' : tipo === 'presupuesto' ? 'Presupuesto' : tipo === 'pedido' ? 'Pedido' : tipo === 'rectificativa' ? 'Rectificativa' : 'Factura';
  return `${nombre} ${d.number}`;
}

const euros = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0);

/** ¿Está por cobrar? Emitida y sin pagar del todo (ni borrador ni anulada). */
function porCobrar(d: Invoice): boolean {
  return ['emitida', 'pendiente', 'parcial', 'vencida'].includes(d.status);
}

/**
 * Los documentos cuyo número es lo escrito, entero o por el final: «1127»
 * encuentra F-2026-1127. Sin guiones ni espacios, que cada cual los pone
 * a su manera. El número exacto va primero.
 */
export function documentosPorNumero(docs: readonly Invoice[], escrito: string, max = 4): Invoice[] {
  const q = sinSignos(escrito);
  if (q.length < 3 || !/\d/.test(q)) return [];
  return docs
    .map(d => {
      const n = sinSignos(d.number ?? '');
      return { d, puntos: n === q ? 2 : n.endsWith(q) ? 1 : 0 };
    })
    .filter(x => x.puntos > 0)
    .sort((a, b) => b.puntos - a.puntos || (b.d.issueDate ?? '').localeCompare(a.d.issueDate ?? ''))
    .slice(0, max)
    .map(x => x.d);
}

/** Los clientes (no proveedores, de alta) que casan con lo escrito. */
function clientesQueCasan(clientes: readonly Client[], escrito: string, max = 3): Client[] {
  const deVenta = clientes.filter(c => !c.esProveedor && c.active !== false);
  return buscarFichas(deVenta, escrito, max)
    .map(r => deVenta.find(c => `ficha:${c.id}` === r.clave))
    .filter((c): c is Client => Boolean(c));
}

const nombreDe = (c: Client) => c.tradeName || c.businessName;

/** Quita por delante las palabras que no dicen nada («para», «a la»…). */
function sinEnlaces(palabras: string[]): string[] {
  let i = 0;
  while (i < palabras.length && ENLACES.has(palabras[i])) i++;
  return palabras.slice(i);
}

function ordenesDeCrear(doc: DocumentoQueSeCrea, resto: string[], ctx: ContextoOrdenes): Orden[] {
  const tecla = doc.icono === 'factura' ? atajoDe('nueva-factura').tecla : undefined;
  const nuevo = doc.icono === 'factura' ? 'Nueva' : 'Nuevo';
  const base = { icono: doc.icono, modulo: doc.modulo, truco: doc.truco };
  const escrito = resto.join(' ');
  if (!escrito) {
    return [{ ...base, clave: `orden:crear:${doc.icono}`, titulo: `${nuevo} ${doc.nombre}`, detalle: 'Eliges el cliente dentro', href: doc.href(), tecla }];
  }

  // «factura F-2026-0012»: ese número ya existe, se quiere abrir, no crear.
  const salida: Orden[] = [];
  if (doc.icono === 'factura') {
    for (const d of documentosPorNumero(ctx.documentos, escrito, 2)) {
      salida.push({ clave: `orden:abrir:${d.id}`, icono: 'factura', titulo: `Abrir ${nombreDocumento(d)}`, detalle: `${d.clientName} · ${d.issueDate}`, href: enlaceDeDocumento(d) });
    }
  }

  const clientes = clientesQueCasan(ctx.clientes, escrito);
  for (const c of clientes) {
    salida.push({
      ...base,
      clave: `orden:crear:${doc.icono}:${c.id}`,
      titulo: `${nuevo} ${doc.nombre} para ${nombreDe(c)}`,
      detalle: [c.nif, c.city].filter(Boolean).join(' · ') || undefined,
      href: doc.href(c.id),
    });
  }
  if (clientes.length === 0 && salida.length === 0) {
    salida.push({
      ...base,
      clave: `orden:crear:${doc.icono}`,
      titulo: `${nuevo} ${doc.nombre} sin cliente`,
      detalle: `No hay ningún cliente que se llame «${escrito}»: lo eliges dentro o lo das de alta`,
      href: doc.href(),
      tecla,
    });
  }
  return salida;
}

function ordenesDeCobrar(resto: string[], ctx: ContextoOrdenes): Orden[] {
  const escrito = resto.join(' ');
  const cobros: Orden = { clave: 'orden:cobros', icono: 'cobrar', titulo: 'Cobros', detalle: 'Apuntar un cobro', href: '/tesoreria?tab=cobros&nuevo=cobro', truco: 'cobrar + número o cliente' };
  if (!escrito) return [cobros];

  const facturas = ctx.documentos.filter(d => isFactura(d) && d.status !== 'anulada');
  const porNumero = documentosPorNumero(facturas, escrito);
  if (porNumero.length) {
    return porNumero.map(d => ({
      clave: `orden:cobrar:${d.id}`,
      icono: 'cobrar' as const,
      titulo: `Cobrar ${nombreDocumento(d)}`,
      detalle: `${d.clientName} · ${porCobrar(d) ? `pendiente, ${euros(d.total)}` : d.status === 'pagada' ? 'ya está cobrada' : d.status}`,
      href: enlaceDeDocumento(d),
      truco: 'cobrar + número',
    }));
  }

  // «cobrar pepe»: lo que tiene pendiente ese cliente, lo más antiguo antes.
  const clientes = clientesQueCasan(ctx.clientes, escrito, 2);
  const ids = new Set(clientes.map(c => c.id));
  const pendientes = facturas
    .filter(d => ids.has(d.clientId) && porCobrar(d))
    .sort((a, b) => (a.dueDate || a.issueDate || '').localeCompare(b.dueDate || b.issueDate || ''))
    .slice(0, 4);
  if (pendientes.length) {
    return pendientes.map(d => ({
      clave: `orden:cobrar:${d.id}`,
      icono: 'cobrar' as const,
      titulo: `Cobrar ${nombreDocumento(d)}`,
      detalle: `${d.clientName} · vence ${d.dueDate || d.issueDate}`,
      href: enlaceDeDocumento(d),
      truco: 'cobrar + cliente',
    }));
  }
  return [{ ...cobros, detalle: clientes.length ? `${nombreDe(clientes[0])} no tiene nada pendiente` : `Nada pendiente con «${escrito}»` }];
}

/** «tesorería», «vencidas», «ajustes»: el destino por su nombre corto o por el principio. */
function destinosPara(escrito: string, exacto: boolean): Destino[] {
  const t = escrito.trim();
  if (!t) return [];
  return DESTINOS.filter(d => d.palabras.some(p => p === t || (!exacto && t.length >= 3 && p.startsWith(t))));
}

function ordenDeDestino(d: Destino): Orden {
  return { clave: `orden:ir:${d.href}`, icono: d.icono, titulo: `Ir a ${d.titulo}`, href: d.href, tecla: d.tecla, modulo: d.modulo, truco: d.tecla ? undefined : d.palabras[0] };
}

function ordenesDeIr(resto: string[]): Orden[] {
  const escrito = resto.join(' ');
  if (!escrito) return [];
  const propios = destinosPara(escrito, false).map(ordenDeDestino);
  if (propios.length) return propios;
  // Lo que no está en la lista corta, en el menú entero (con sus sinónimos).
  return buscarPantallas(escrito)
    .filter(r => r.grupo === 'pantalla')
    .slice(0, 3)
    .map(r => ({ clave: `orden:ir:${r.href}`, icono: 'ir' as const, titulo: `Ir a ${r.titulo}`, detalle: r.detalle, href: r.href }));
}

function ordenesDeAlta(palabras: string[]): Orden[] {
  // «cliente nuevo», «nuevo cliente», «alta de cliente», «dar de alta un producto»
  const cuales = palabras.filter(w => !ALTA.has(w) && !ENLACES.has(w) && w !== 'un' && w !== 'una');
  const pide = palabras.some(w => ALTA.has(w));
  if (!pide || cuales.length !== 1) return [];
  const ficha = FICHAS.find(f => f.palabras.includes(cuales[0]));
  return ficha ? [{ clave: `orden:alta:${ficha.icono}`, icono: ficha.icono, titulo: ficha.titulo, href: ficha.href, truco: ficha.truco }] : [];
}

/**
 * Lo que pide la frase, como filas listas para abrir. Vacío si no es una
 * orden: entonces el buscador enseña solo lo que encuentra.
 */
export function interpretarOrden(texto: string, ctx: ContextoOrdenes): Orden[] {
  const palabras = plano(texto).replace(/[¿?¡!.,;:]+/g, ' ').split(/\s+/).filter(Boolean);
  if (!palabras.length) return [];

  const ordenes = calcular(palabras, ctx);
  const vistas = new Set<string>();
  return ordenes.filter(o => {
    if (vistas.has(o.clave)) return false;
    vistas.add(o.clave);
    if (o.modulo && ctx.modulos && !ctx.modulos.includes(o.modulo)) return false;
    return !ctx.puede || ctx.puede(o.href);
  });
}

function calcular(palabras: string[], ctx: ContextoOrdenes): Orden[] {
  const alta = ordenesDeAlta(palabras);
  if (alta.length) return alta;

  // Lo de relleno del principio fuera: «nueva factura» es «factura».
  let i = 0;
  while (i < palabras.length - 1 && DE_RELLENO.has(palabras[i])) i++;
  const [primera, ...resto] = palabras.slice(i);

  if (COBRAR.has(primera)) return ordenesDeCobrar(sinEnlaces(resto), ctx);
  if (IR.has(primera)) return ordenesDeIr(sinEnlaces(resto));

  const doc = DOCUMENTOS.find(d => d.palabras.includes(primera));
  // «facturas» a secas es la lista, no una factura nueva; con algo detrás, sí.
  const esLista = DESTINOS.some(d => d.palabras.includes(primera) && d.href !== '/dashboard');
  if (doc && !(esLista && resto.length === 0 && primera !== doc.palabras[0])) {
    return ordenesDeCrear(doc, sinEnlaces(resto), ctx);
  }

  // Una palabra sola que es un destino: «vencidas», «tesorería».
  if (palabras.length <= 2) return destinosPara(palabras.join(' '), true).map(ordenDeDestino);
  return [];
}
