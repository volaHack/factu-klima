/**
 * SACAR TUS DATOS DE AQUÍ
 *
 * Quien factura con este programa está obligado a conservar sus registros
 * cuatro años, y hasta ahora no tenía manera de sacarlos: dependía entera y
 * exclusivamente de que nuestro servidor siguiera ahí. Eso no es un hueco
 * técnico, es un hueco de confianza — cualquier gestoría lo pregunta en la
 * primera reunión, y la respuesta «no se puede» termina la conversación.
 *
 * Lo que sale de aquí tiene que servir para dos cosas distintas, y por eso
 * hay dos formatos:
 *
 *   · UN JSON con todo, para poder volver a montar la empresa entera en
 *     otro sitio. Es la copia de seguridad de verdad.
 *   · UNOS CSV con los libros de registro, para abrirlos en una hoja de
 *     cálculo y mandárselos al asesor. Es lo que se pide en una inspección
 *     y lo que nadie quiere leer en JSON.
 *
 * TODO OCURRE EN EL NAVEGADOR
 * ---------------------------
 * Se lee de lo que ya está cargado y se arma el fichero en memoria. Sin
 * ruta de servidor y sin que los datos den una vuelta de más: una copia de
 * seguridad que pasa por un servidor ajeno para volver al mismo ordenador
 * es una copia con un intermediario que nadie ha pedido.
 */

import type {
  Abono, Albaran, Client, CompanySettings, Devolucion, Gasto, Invoice, Lote,
  Oferta, Product,
} from './types';

// ============================================================
// CSV
// ============================================================

/**
 * Escapa un valor para CSV.
 *
 * Las comillas se duplican y todo lo que lleve coma, comilla o salto de
 * línea va entrecomillado. Es la regla del RFC 4180 y es la que entienden
 * Excel y LibreOffice sin preguntar.
 */
export function campoCsv(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  const texto = String(valor);
  if (!/[",\n\r;]/.test(texto)) return texto;
  return `"${texto.replace(/"/g, '""')}"`;
}

/**
 * Arma un CSV a partir de cabeceras y filas.
 *
 * Separador de PUNTO Y COMA, no de coma: es lo que espera un Excel en
 * español, donde la coma es el separador decimal. Con comas, abrir el
 * fichero mete «1.234,56 €» en dos columnas y la hoja sale inservible.
 *
 * Y con BOM al principio: sin él, Excel abre el fichero en la codificación
 * del sistema y los acentos salen como jeroglíficos.
 */
export function construirCsv(cabeceras: string[], filas: unknown[][]): string {
  const lineas = [
    cabeceras.map(campoCsv).join(';'),
    ...filas.map(f => f.map(campoCsv).join(';')),
  ];
  return `﻿${lineas.join('\r\n')}\r\n`;
}

/** Los importes, como los escribe una hoja de cálculo española. */
export function importeCsv(valor: number | undefined | null): string {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return '';
  return valor.toFixed(2).replace('.', ',');
}

// ============================================================
// LOS LIBROS
// ============================================================

const CABECERAS_FACTURAS = [
  'Número', 'Fecha', 'Vencimiento', 'Cliente', 'NIF', 'Base imponible',
  'IVA', 'Total', 'Estado', 'Forma de pago', 'Serie', 'Tipo', 'Huella Veri*Factu',
];

/**
 * El libro de facturas emitidas.
 *
 * Se incluyen las anuladas, marcadas como tales: un libro de registro con
 * huecos en la numeración es exactamente lo que hace saltar una inspección.
 * Los borradores no, porque todavía no son nada.
 */
export function libroDeFacturas(facturas: Invoice[]): string {
  const emitidas = facturas
    .filter(f => (f.sentido ?? 'venta') === 'venta')
    .filter(f => f.status !== 'borrador')
    .filter(f => (f.tipo ?? 'factura') === 'factura' || f.tipo === 'rectificativa')
    .slice()
    .sort((a, b) => a.issueDate.localeCompare(b.issueDate) || a.number.localeCompare(b.number));

  return construirCsv(CABECERAS_FACTURAS, emitidas.map(f => [
    f.number,
    f.issueDate,
    f.dueDate ?? '',
    f.clientName,
    f.clientNif ?? '',
    importeCsv(f.subtotal),
    importeCsv(f.totalTax),
    importeCsv(f.total),
    f.status,
    f.paymentMethod ?? '',
    f.series ?? '',
    f.tipo ?? 'factura',
    f.verifactu?.chainedHash ?? '',
  ]));
}

/** El detalle línea a línea, que es lo que pide el asesor para cuadrar el IVA. */
export function libroDeLineas(facturas: Invoice[]): string {
  const filas: unknown[][] = [];
  for (const f of facturas) {
    if (f.status === 'borrador') continue;
    for (const l of f.lineItems ?? []) {
      filas.push([
        f.number, f.issueDate, f.clientName,
        l.productRef ?? '', l.productName,
        l.quantity, importeCsv(l.unitPrice),
        l.discountPercent ?? 0, l.discountPercent2 ?? 0,
        l.taxRate, importeCsv(l.subtotal), importeCsv(l.total),
        l.loteCodigo ?? '', l.numeroSerie ?? '',
      ]);
    }
  }
  return construirCsv([
    'Factura', 'Fecha', 'Cliente', 'Referencia', 'Concepto', 'Cantidad',
    'Precio', 'Dto. %', 'Dto. oferta %', 'IVA %', 'Base', 'Total', 'Lote', 'Nº serie',
  ], filas);
}

/** El libro de gastos: lo que alimenta el IVA soportado del 303. */
export function libroDeGastos(gastos: Gasto[]): string {
  return construirCsv(
    ['Fecha', 'Proveedor', 'Concepto', 'Categoría', 'Base', 'IVA', 'Total'],
    gastos
      .slice()
      .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
      .map(g => [
        g.fecha,
        g.proveedorNombre ?? '',
        g.concepto ?? '',
        g.categoria ?? '',
        importeCsv(g.baseImponible),
        importeCsv(g.taxAmount),
        importeCsv(g.total),
      ]),
  );
}

/** El catálogo, para no tener que volver a teclearlo en ningún sitio. */
export function libroDeProductos(productos: Product[]): string {
  return construirCsv(
    ['Referencia', 'Nombre', 'Categoría', 'Precio', 'Coste medio', 'Último coste', 'IVA %', 'Unidad', 'Stock', 'Código de barras', 'Activo'],
    productos.map(p => [
      p.ref ?? '', p.name, p.category ?? '',
      importeCsv(p.unitPrice), importeCsv(p.costePmp), importeCsv(p.costeUltimaCompra),
      p.defaultTaxRate, p.unit, p.stockQuantity ?? '',
      p.barcode ?? '', p.active === false ? 'no' : 'sí',
    ]),
  );
}

/** Los clientes, con lo que hace falta para volver a facturarles. */
export function libroDeClientes(clientes: Client[]): string {
  return construirCsv(
    ['Razón social', 'Nombre comercial', 'NIF', 'Dirección', 'CP', 'Ciudad', 'Provincia', 'Email', 'Teléfono'],
    clientes.map(c => [
      c.businessName, c.tradeName ?? '', c.nif ?? '', c.address ?? '', c.postalCode ?? '',
      c.city ?? '', c.province ?? '', c.email ?? '', c.phone ?? '',
    ]),
  );
}

// ============================================================
// EL PAQUETE ENTERO
// ============================================================

export interface DatosEmpresa {
  ajustes: CompanySettings;
  facturas: Invoice[];
  clientes: Client[];
  productos: Product[];
  albaranes: Albaran[];
  devoluciones: Devolucion[];
  abonos: Abono[];
  gastos: Gasto[];
  lotes: Lote[];
  ofertas: Oferta[];
}

export interface FicheroExportado {
  nombre: string;
  contenido: string;
  tipo: string;
}

/**
 * Todo lo que se lleva el usuario.
 *
 * El JSON incluye la versión del formato y la fecha: dentro de tres años,
 * quien abra esto tiene que poder saber de cuándo es y con qué se hizo, sin
 * depender de que el nombre del fichero se haya conservado.
 */
export function prepararExportacion(datos: DatosEmpresa, ahora = new Date()): FicheroExportado[] {
  const fecha = ahora.toISOString().slice(0, 10);
  const empresa = (datos.ajustes.businessName || 'empresa')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

  const copia = {
    formato: 1,
    exportadoEn: ahora.toISOString(),
    generadoPor: 'Klima · Sistema de facturación',
    aviso: 'Copia de los datos de la empresa. Las facturas emitidas son registros fiscales: consérvalos cuatro años.',
    ...datos,
  };

  return [
    {
      nombre: `${empresa}-${fecha}-copia-completa.json`,
      contenido: JSON.stringify(copia, null, 2),
      tipo: 'application/json',
    },
    {
      nombre: `${empresa}-${fecha}-libro-facturas.csv`,
      contenido: libroDeFacturas(datos.facturas),
      tipo: 'text/csv',
    },
    {
      nombre: `${empresa}-${fecha}-libro-lineas.csv`,
      contenido: libroDeLineas(datos.facturas),
      tipo: 'text/csv',
    },
    {
      nombre: `${empresa}-${fecha}-libro-gastos.csv`,
      contenido: libroDeGastos(datos.gastos),
      tipo: 'text/csv',
    },
    {
      nombre: `${empresa}-${fecha}-catalogo.csv`,
      contenido: libroDeProductos(datos.productos),
      tipo: 'text/csv',
    },
    {
      nombre: `${empresa}-${fecha}-clientes.csv`,
      contenido: libroDeClientes(datos.clientes),
      tipo: 'text/csv',
    },
  ];
}

/** Cuenta lo que lleva la copia, para poder decírselo al usuario. */
export function resumirExportacion(datos: DatosEmpresa): { que: string; cuantos: number }[] {
  return [
    { que: 'Facturas', cuantos: datos.facturas.filter(f => f.status !== 'borrador').length },
    { que: 'Clientes', cuantos: datos.clientes.length },
    { que: 'Productos', cuantos: datos.productos.length },
    { que: 'Albaranes', cuantos: datos.albaranes.length },
    { que: 'Gastos', cuantos: datos.gastos.length },
    { que: 'Lotes', cuantos: datos.lotes.length },
  ].filter(x => x.cuantos > 0);
}

/** Lanza la descarga de un fichero ya preparado. */
export function descargar(fichero: FicheroExportado): void {
  const blob = new Blob([fichero.contenido], { type: `${fichero.tipo};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = fichero.nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  // Con retraso: algunos navegadores siguen leyendo la URL cuando termina
  // el clic, igual que en la descarga de PDF.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
