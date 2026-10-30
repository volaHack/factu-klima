/**
 * EL BUSCADOR UNIVERSAL (Ctrl+K)
 *
 * Una caja para encontrarlo todo sin saber dónde está:
 *
 *   · pantallas y acciones: «albaran compra» lleva a la lista y ofrece
 *     crear uno; «inventario» encuentra las regularizaciones aunque no se
 *     llamen así (sinónimos);
 *   · documentos de cualquier tipo: por número, cliente, NIF, importe,
 *     fecha o un artículo de sus líneas;
 *   · clientes y proveedores: por nombre, NIF, teléfono, correo, ciudad o
 *     persona de contacto;
 *   · artículos: por referencia, nombre, referencia del proveedor o código
 *     de barras (lib/buscarProductos).
 *
 * Sin tildes ni mayúsculas, con varias palabras en cualquier orden.
 */

import type { Client, Invoice, Product } from './types';
import { buscarProductos, plano } from './buscarProductos';
import { MENU, ACCESOS, type Hoja } from '@/components/layout/MenuPrincipal';
import type { FichaRecordada, TipoFicha } from './memoriaFichas';

export type GrupoResultado = 'accion' | 'pantalla' | 'documento' | 'ficha' | 'articulo' | 'historico';

export interface Resultado {
  clave: string;
  grupo: GrupoResultado;
  titulo: string;
  detalle?: string;
  /** A la derecha: importe, stock… */
  extra?: string;
  href: string;
}

/** Palabras con que la gente busca una pantalla que se llama de otra forma. */
const SINONIMOS: Record<string, string> = {
  '/facturas': 'emitir facturar factura venta verifactu ticket',
  '/clientes?tipo=clientes': 'cliente comprador ficha nif',
  '/clientes?tipo=proveedores': 'proveedor acreedor suministrador',
  '/productos': 'articulo producto catalogo referencia stock precio tarifa familia',
  '/almacenes?tab=regularizaciones': 'inventario recuento ajuste stock cuadrar existencias',
  '/almacenes?tab=traspasos': 'mover stock pasar almacen',
  '/almacenes?tab=existencias': 'stock inventario existencias cantidades',
  '/tesoreria?tab=cobros': 'cobrar cobro cliente pago recibido ingreso',
  '/tesoreria?tab=pagos': 'pagar pago proveedor',
  '/tesoreria?tab=vencimientos': 'vencimiento deuda pendiente cobro impagado',
  '/recordatorios': 'reclamar impagado moroso aviso',
  '/informes': 'estadistica grafica resumen ventas beneficio',
  '/listados?tab=listados': 'listado informe excel clientes proveedores articulos precios rentabilidad estadisticas inventario libro ventas compras impuestos caja',
  '/listados?tab=impresos': 'imprimir impresora pdf tanda varios documentos lote',
  '/listados?tab=relaciones': 'relacion lista documentos totales entradas salidas almacen entregas cuenta',
  '/listados-fiscales': 'modelo 303 347 420 390 hacienda impuestos trimestre',
  '/ajustes': 'configuracion empresa nif logo series numeracion iva igic',
  '/plantillas': 'diseño formato documento logo impresion',
  '/importar': 'excel csv cargar subir datos',
  '/tpv': 'caja mostrador ticket cobrar',
  '/devoluciones': 'devolver abono reembolso',
  '/gastos': 'gasto compra ticket recibo',
  '/historico': 'isecan anterior antiguo historial',
  '/asistencia': 'ia ayuda preguntar asistente',
};

function casaTodas(texto: string, palabras: readonly string[]): boolean {
  return palabras.every(w => texto.includes(w));
}

export function palabrasDe(texto: string): string[] {
  return plano(texto).split(/\s+/).filter(Boolean);
}

/** Pantallas y, delante, la acción de crear cuando la búsqueda la pide («nuevo», «crear»…). */
/** ¿Pide crear algo? («nuevo albarán», «crear cliente», «dar de alta»…) */
export function quiereCrear(texto: string): boolean {
  return /\b(nuev[oa]s?|crear|hacer|alta|añadir|anadir)\b/.test(plano(texto));
}

export function buscarPantallas(texto: string, visible: (h: Hoja) => boolean = () => true): Resultado[] {
  const palabras = palabrasDe(texto).filter(w => !['nuevo', 'nueva', 'crear', 'hacer', 'alta', 'añadir', 'anadir', 'de', 'el', 'la', 'un', 'una'].includes(w));
  const crear = quiereCrear(texto);
  if (!palabras.length && !crear) return [];
  const hojas = [...ACCESOS.map(h => ({ h, rama: '' })), ...MENU.flatMap(r => r.hojas.map(h => ({ h, rama: r.label })))].filter(x => visible(x.h));
  const salida: Resultado[] = [];
  for (const { h, rama } of hojas) {
    const pajar = plano(`${h.label} ${rama} ${SINONIMOS[h.lista] ?? ''}`);
    if (palabras.length && !casaTodas(pajar, palabras)) continue;
    if (!palabras.length) continue;
    if (h.nuevo) {
      salida.push({ clave: `nuevo:${h.nuevo}`, grupo: 'accion', titulo: `Crear nuevo · ${h.label}`, detalle: rama, href: h.nuevo });
    }
    salida.push({ clave: `pantalla:${h.lista}`, grupo: 'pantalla', titulo: h.label, detalle: rama, href: h.lista });
  }
  // Pidiendo crear, las acciones primero; si no, las pantallas.
  return salida.sort((a, b) => (crear ? Number(b.grupo === 'accion') - Number(a.grupo === 'accion') : Number(b.grupo === 'pantalla') - Number(a.grupo === 'pantalla')));
}

const NOMBRE_TIPO: Record<string, string> = {
  factura: 'Factura', albaran: 'Albarán', pedido: 'Pedido', presupuesto: 'Presupuesto', rectificativa: 'Rectificativa',
};

/** Dónde se abre un documento: las facturas de venta en su pantalla, lo demás en Documentos. */
export function enlaceDeDocumento(d: Pick<Invoice, 'id' | 'tipo' | 'sentido'>): string {
  return (d.tipo ?? 'factura') === 'factura' && (d.sentido ?? 'venta') === 'venta' ? `/facturas/${d.id}` : `/documentos/${d.id}`;
}

function importeTexto(n: number): string {
  // «1234,5», «1.234,50» y «1234.50»: como lo escriba quien busca.
  const fijo = (Math.round(n * 100) / 100).toFixed(2);
  return `${fijo} ${fijo.replace('.', ',')} ${new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2 }).format(n)}`;
}

export function buscarDocumentos(docs: readonly Invoice[], texto: string, max = 8): Resultado[] {
  const palabras = palabrasDe(texto);
  if (!palabras.length) return [];
  const t = plano(texto.trim());
  return docs
    .map(d => {
      const numero = plano(d.number ?? '');
      const tipo = NOMBRE_TIPO[d.tipo ?? 'factura'] ?? d.tipo ?? '';
      const pajar = plano([
        d.number, d.clientName, d.clientNif, tipo, d.sentido === 'compra' ? 'compra proveedor' : 'venta cliente',
        importeTexto(d.total || 0), d.issueDate, d.notes ?? '',
        ...d.lineItems.map(l => `${l.productName} ${l.productRef}`),
      ].join(' '));
      if (!casaTodas(pajar, palabras)) return null;
      const n = numero === t ? 100 : numero.endsWith(t) || numero.startsWith(t) ? 80 : plano(d.clientName ?? '').includes(t) ? 60 : 40;
      return { d, n };
    })
    .filter((x): x is { d: Invoice; n: number } => x !== null)
    .sort((a, b) => b.n - a.n || (b.d.issueDate ?? '').localeCompare(a.d.issueDate ?? ''))
    .slice(0, max)
    .map(({ d }) => ({
      clave: `doc:${d.id}`,
      grupo: 'documento' as const,
      titulo: `${NOMBRE_TIPO[d.tipo ?? 'factura'] ?? d.tipo}${d.sentido === 'compra' ? ' de compra' : ''} ${d.number}`,
      detalle: `${d.clientName} · ${d.issueDate}`,
      extra: new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(d.total || 0),
      href: enlaceDeDocumento(d),
    }));
}

export function buscarFichas(fichas: readonly Client[], texto: string, max = 6): Resultado[] {
  const palabras = palabrasDe(texto);
  if (!palabras.length) return [];
  const t = plano(texto.trim());
  return fichas
    .map(c => {
      const pajar = plano([c.businessName, c.tradeName, c.nif, c.phone, c.email, c.city, c.contactPerson, c.esProveedor ? 'proveedor' : 'cliente'].join(' '));
      if (!casaTodas(pajar, palabras)) return null;
      const nombre = plano(c.tradeName || c.businessName);
      const n = plano(c.nif) === t ? 100 : nombre.startsWith(t) ? 80 : 50;
      return { c, n };
    })
    .filter((x): x is { c: Client; n: number } => x !== null)
    .sort((a, b) => Number(b.c.active) - Number(a.c.active) || b.n - a.n || (a.c.tradeName || a.c.businessName).localeCompare(b.c.tradeName || b.c.businessName, 'es'))
    .slice(0, max)
    .map(({ c }) => ({
      clave: `ficha:${c.id}`,
      grupo: 'ficha' as const,
      titulo: c.tradeName || c.businessName,
      detalle: [c.esProveedor ? 'Proveedor' : 'Cliente', c.nif, c.city, c.phone].filter(Boolean).join(' · '),
      href: `/clientes/${c.id}`,
    }));
}

export function buscarArticulos(productos: readonly Product[], texto: string, max = 6): Resultado[] {
  return buscarProductos(productos, texto, max).map(p => ({
    clave: `art:${p.id}`,
    grupo: 'articulo' as const,
    titulo: p.ref ? `[${p.ref}] ${p.name}` : p.name,
    detalle: [p.category, `stock ${p.stockQuantity ?? 0} ${p.unit}`, p.active === false ? 'de baja' : ''].filter(Boolean).join(' · '),
    extra: new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(p.unitPrice),
    href: `/productos?editar=${p.id}`,
  }));
}

// ---- Lo que se abre desde aquí se recuerda (lib/memoriaFichas) ----

/**
 * La ficha que se recuerda de un resultado: documentos, clientes, artículos
 * y pantallas. Crear algo nuevo no se recuerda: no hay nada a lo que volver.
 */
export function fichaDeResultado(r: Resultado): Omit<FichaRecordada, 'cuando'> | null {
  const tipo: TipoFicha | null =
    r.grupo === 'documento' ? (r.href.startsWith('/facturas/') ? 'factura' : 'documento')
      : r.grupo === 'historico' ? 'documento'
        : r.grupo === 'ficha' ? 'cliente'
          : r.grupo === 'articulo' ? 'producto'
            : r.grupo === 'pantalla' ? 'pantalla'
              : null;
  if (!tipo) return null;
  // Las mismas claves que pone el menú lateral al abrir la ficha por su dirección.
  const id = r.clave.slice(r.clave.indexOf(':') + 1);
  const clave = tipo === 'pantalla' ? `pantalla:${r.href}` : `${tipo}:${id}`;
  return { clave, tipo, titulo: r.titulo, detalle: r.detalle, href: r.href };
}
