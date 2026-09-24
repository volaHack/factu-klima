/**
 * TRAERSE LOS CLIENTES Y LOS PRODUCTOS DE OTRO PROGRAMA
 *
 * Lo que más frena a alguien a cambiar de programa de facturación no es
 * aprender uno nuevo: es volver a teclear doscientos clientes y quinientos
 * artículos. Holded, Contasimple, Factusol, Quipu, Sage, Anfix, Billin o
 * una hoja de cálculo propia exportan todos lo mismo —una tabla con una
 * fila por ficha—, cada uno con sus nombres de columna. Aquí se lee esa
 * tabla, se reconoce qué columna es qué y se comprueba cada fila antes de
 * crear nada.
 *
 * Todo lo de este fichero es puro: no toca la base de datos ni el
 * navegador, así que se prueba entero. La pantalla sólo lo enseña.
 *
 * LO QUE NO SE IMPORTA, A PROPÓSITO
 * ---------------------------------
 * Las facturas antiguas. Fueron emitidas —y, si era un sistema Veri*Factu,
 * registradas en Hacienda— por el otro programa. Meterlas aquí las
 * sellaría como emitidas por este, con otra huella y otra fecha de
 * registro: una segunda versión de facturas que ya existen. Se quedan en
 * el programa anterior, que es donde la ley dice que se conservan.
 */

import type { Client, Product } from '@/lib/types';
import { PaymentMethod, UnitOfMeasure } from '@/lib/types';
import { validateNIF } from '@/lib/utils';

export type TipoImportacion = 'clientes' | 'productos';
export type Tabla = string[][];

/* ------------------------------------------------------------------
   LEER EL ARCHIVO
   ------------------------------------------------------------------ */

/**
 * El texto de un CSV, en la codificación que traiga.
 *
 * Los programas de escritorio españoles (Factusol, Contasimple, los Sage
 * antiguos) exportan en Windows-1252, no en UTF-8: leído como UTF-8,
 * «Peñalver» sale «Pe�alver». Se intenta UTF-8 estricto y, si falla, se
 * lee como Windows-1252.
 */
export function decodificarTexto(bytes: Uint8Array): string {
  try {
    const texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    // Sin la marca de orden de bytes (BOM) que pone Excel al principio.
    return texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** El separador que más se repite fuera de comillas en la primera línea con datos. */
function detectarSeparador(texto: string): string {
  const primera = texto.split(/\r?\n/).find(l => l.trim()) ?? '';
  const candidatos = [';', ',', '\t', '|'];
  let mejor = ';';
  let max = -1;
  for (const c of candidatos) {
    let n = 0;
    let dentro = false;
    for (const ch of primera) {
      if (ch === '"') dentro = !dentro;
      else if (ch === c && !dentro) n++;
    }
    if (n > max) { max = n; mejor = c; }
  }
  return mejor;
}

/**
 * CSV a tabla. Comillas dobles con "" dentro, saltos de línea dentro de un
 * campo entrecomillado y separador punto y coma (el de Excel en español),
 * coma, tabulador o barra.
 */
export function leerCsv(texto: string): Tabla {
  const sep = detectarSeparador(texto);
  const filas: Tabla = [];
  let fila: string[] = [];
  let campo = '';
  let dentro = false;

  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (dentro) {
      if (ch === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; } else dentro = false;
      } else campo += ch;
      continue;
    }
    if (ch === '"') dentro = true;
    else if (ch === sep) { fila.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo); campo = '';
      filas.push(fila); fila = [];
    } else campo += ch;
  }
  if (campo !== '' || fila.length > 0) { fila.push(campo); filas.push(fila); }

  return filas
    .map(f => f.map(c => c.trim()))
    .filter(f => f.some(c => c !== ''));
}

/** Una celda de Excel (texto, número, fecha, booleano) como texto. */
export function celdaATexto(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

/* ------------------------------------------------------------------
   RECONOCER LAS COLUMNAS
   ------------------------------------------------------------------ */

/** «Código Postal», «codigo_postal» y «CP.» son lo mismo. */
export function normalizar(t: string): string {
  // Se separa cada letra de su tilde (NFD) y se quitan las tildes, que son
  // los caracteres combinables U+0300–U+036F.
  const sinTildes = Array.from(t.toLowerCase().normalize('NFD'))
    .filter(c => c.charCodeAt(0) < 0x300 || c.charCodeAt(0) > 0x36f)
    .join('');
  return sinTildes.replace(/[^a-z0-9]+/g, ' ').trim();
}

export type CampoCliente =
  | 'businessName' | 'tradeName' | 'nif' | 'email' | 'phone' | 'contactPerson'
  | 'address' | 'postalCode' | 'city' | 'province' | 'country' | 'paymentDays' | 'notes';

export type CampoProducto =
  | 'name' | 'ref' | 'description' | 'category' | 'unitPrice' | 'unitPriceConImpuesto'
  | 'defaultTaxRate' | 'stockQuantity' | 'costPrice' | 'barcode';

type Campo = CampoCliente | CampoProducto;

/**
 * Cómo llama cada programa a cada dato. El orden importa: el primero que
 * encaja gana, así que los más específicos van antes («nombre comercial»
 * antes que «nombre»).
 */
const SINONIMOS: Record<TipoImportacion, [Campo, string[]][]> = {
  clientes: [
    ['tradeName', ['nombre comercial', 'nom comercial', 'trade name', 'alias']],
    ['businessName', ['razon social', 'nombre fiscal', 'denominacion', 'nombre completo', 'business name', 'empresa', 'cliente', 'nombre', 'name']],
    ['nif', ['nif', 'cif', 'dni', 'nie', 'nif cif', 'cif nif', 'n i f', 'vat', 'vat number', 'nif iva', 'id fiscal', 'identificacion fiscal', 'documento', 'tax id']],
    ['email', ['email', 'e mail', 'correo', 'correo electronico', 'mail']],
    ['phone', ['telefono', 'tel', 'telf', 'movil', 'phone', 'telefono 1', 'celular']],
    ['contactPerson', ['contacto', 'persona de contacto', 'persona contacto', 'contact']],
    ['address', ['direccion', 'domicilio', 'direccion fiscal', 'calle', 'address', 'direccion 1']],
    ['postalCode', ['codigo postal', 'cp', 'c p', 'cod postal', 'postal code', 'zip']],
    ['city', ['poblacion', 'localidad', 'ciudad', 'municipio', 'city']],
    ['province', ['provincia', 'province', 'region', 'estado']],
    ['country', ['pais', 'country']],
    ['paymentDays', ['dias de pago', 'dias pago', 'vencimiento dias', 'plazo de pago', 'payment days']],
    ['notes', ['notas', 'observaciones', 'comentarios', 'notes']],
  ],
  productos: [
    ['ref', ['referencia', 'ref', 'codigo', 'cod', 'sku', 'codigo articulo', 'cod articulo', 'reference']],
    ['barcode', ['codigo de barras', 'cod barras', 'ean', 'ean13', 'barcode', 'gtin']],
    ['name', ['nombre', 'articulo', 'producto', 'descripcion corta', 'concepto', 'name', 'titulo', 'descripcion']],
    ['description', ['descripcion larga', 'descripcion detallada', 'detalle', 'long description']],
    ['category', ['categoria', 'familia', 'grupo', 'category', 'seccion']],
    ['unitPriceConImpuesto', ['pvp con iva', 'precio con iva', 'pvp iva incluido', 'precio iva incluido', 'pvp con igic', 'precio con igic', 'total con iva']],
    ['unitPrice', ['precio', 'pvp', 'precio venta', 'precio de venta', 'precio unitario', 'precio sin iva', 'base', 'importe', 'price', 'tarifa']],
    ['defaultTaxRate', ['iva', 'igic', 'tipo iva', 'iva %', 'impuesto', 'tipo impositivo', 'tax', 'vat rate', 'tipo igic']],
    ['stockQuantity', ['stock', 'existencias', 'cantidad', 'unidades', 'stock actual', 'quantity']],
    ['costPrice', ['coste', 'precio coste', 'precio de compra', 'precio compra', 'cost']],
  ],
};

export const ETIQUETAS: Record<Campo, string> = {
  businessName: 'Razón social', tradeName: 'Nombre comercial', nif: 'NIF / CIF', email: 'Email',
  phone: 'Teléfono', contactPerson: 'Persona de contacto', address: 'Dirección', postalCode: 'Código postal',
  city: 'Población', province: 'Provincia', country: 'País', paymentDays: 'Días de pago', notes: 'Notas',
  name: 'Nombre', ref: 'Referencia', description: 'Descripción', category: 'Categoría',
  unitPrice: 'Precio (sin impuesto)', unitPriceConImpuesto: 'Precio con impuesto', defaultTaxRate: '% IVA / IGIC',
  stockQuantity: 'Stock', costPrice: 'Coste', barcode: 'Código de barras',
};

/** Los campos en el orden en que se enseñan: lo imprescindible primero. */
export function camposDe(tipo: TipoImportacion): Campo[] {
  const primero: Campo = tipo === 'clientes' ? 'businessName' : 'name';
  const resto = SINONIMOS[tipo].map(([c]) => c).filter(c => c !== primero);
  return [primero, ...resto];
}

export type Mapeo = Partial<Record<Campo, number>>;

/** Qué columna es cada dato, mirando los nombres de la cabecera. */
export function detectarColumnas(cabecera: string[], tipo: TipoImportacion): Mapeo {
  const cab = cabecera.map(normalizar);
  const usadas = new Set<number>();
  const mapeo: Mapeo = {};
  // Dos pasadas: primero coincidencias exactas, luego «contiene». Así
  // «Nombre» no le quita la columna a «Nombre comercial».
  for (const exacta of [true, false]) {
    for (const [campo, nombres] of SINONIMOS[tipo]) {
      if (mapeo[campo] !== undefined) continue;
      for (const n of nombres) {
        const i = cab.findIndex((h, idx) => !usadas.has(idx) && h !== '' &&
          (exacta ? h === n : (h.startsWith(n + ' ') || h.endsWith(' ' + n) || h.includes(' ' + n + ' '))));
        if (i >= 0) { mapeo[campo] = i; usadas.add(i); break; }
      }
    }
  }
  return mapeo;
}

/**
 * Dónde está la cabecera. Muchos exportadores ponen antes un título
 * («Listado de clientes a 12/03/2026») o una fila en blanco: se toma la
 * primera de las diez primeras filas en la que se reconocen al menos dos
 * columnas.
 */
export function filaDeCabecera(tabla: Tabla, tipo: TipoImportacion): number {
  let mejor = 0;
  let max = -1;
  for (let i = 0; i < Math.min(10, tabla.length); i++) {
    const n = Object.keys(detectarColumnas(tabla[i], tipo)).length;
    if (n > max) { max = n; mejor = i; }
    if (n >= 3) return i;
  }
  return mejor;
}

/** ¿Es un listado de clientes o de productos? */
export function detectarTipo(tabla: Tabla): TipoImportacion {
  const puntos = (t: TipoImportacion) => {
    const fila = tabla[filaDeCabecera(tabla, t)] ?? [];
    const m = detectarColumnas(fila, t);
    // Lo que sólo tiene uno de los dos pesa doble.
    const claves = t === 'clientes' ? ['nif', 'email', 'postalCode', 'city', 'phone'] : ['unitPrice', 'unitPriceConImpuesto', 'defaultTaxRate', 'stockQuantity', 'ref'];
    return Object.keys(m).length + claves.filter(k => m[k as Campo] !== undefined).length;
  };
  return puntos('productos') > puntos('clientes') ? 'productos' : 'clientes';
}

/* ------------------------------------------------------------------
   VALORES
   ------------------------------------------------------------------ */

/**
 * Un número escrito como lo escriba quien sea: «1.234,56 €», «1234.56»,
 * «21 %», «-3,5». Vacío o ilegible, `null`.
 */
export function numeroEs(v: string): number | null {
  let t = (v ?? '').replace(/[€$%\s]|EUR/gi, '');
  if (!t) return null;
  const coma = t.lastIndexOf(',');
  const punto = t.lastIndexOf('.');
  if (coma > -1 && punto > -1) {
    // El que va el último es el decimal.
    t = coma > punto ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (coma > -1) {
    // Sólo comas: decimal si hay una y le siguen 1-2 cifras; si no, miles.
    t = /^-?\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3}){2,}$/.test(t)) {
    // «1.234.567»: puntos de miles.
    t = t.replace(/\./g, '');
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** «21», «21%», «IVA 21 %», «0,21» → 21. */
export function tipoImpositivo(v: string): number | null {
  const n = numeroEs((v ?? '').replace(/[a-z]/gi, ''));
  if (n === null) return null;
  const pct = n > 0 && n < 1 ? n * 100 : n;
  return Math.round(pct * 100) / 100;
}

export function limpiarNif(v: string): string {
  return (v ?? '').toUpperCase().replace(/[\s.\-/]/g, '');
}

/** NIF-IVA de otro país de la UE: dos letras de país y el número. */
function esNifIvaExtranjero(nif: string): boolean {
  return /^(AT|BE|BG|CY|CZ|DE|DK|EE|EL|FI|FR|HR|HU|IE|IT|LT|LU|LV|MT|NL|PL|PT|RO|SE|SI|SK|XI)[A-Z0-9]{5,14}$/.test(nif);
}

/* ------------------------------------------------------------------
   DE FILA A FICHA
   ------------------------------------------------------------------ */

export type EstadoFila = 'nuevo' | 'existe' | 'repetido' | 'error';

export interface FilaRevisada<T> {
  /** Número de fila en el archivo, como lo vería quien lo abre (1 = primera). */
  fila: number;
  estado: EstadoFila;
  ficha: T | null;
  /** Por qué no se puede importar. */
  errores: string[];
  /** Se importa, pero conviene saberlo. */
  avisos: string[];
  /** Nombre para enseñar en la tabla. */
  titulo: string;
}

const dato = (fila: string[], mapeo: Mapeo, campo: Campo) =>
  mapeo[campo] === undefined ? '' : (fila[mapeo[campo]!] ?? '').trim();

export function claveCliente(nif: string, nombre: string): string {
  const n = limpiarNif(nif);
  return n ? `nif:${n}` : `nombre:${normalizar(nombre)}`;
}

export function claveProducto(ref: string, barcode: string, nombre: string): string {
  if (ref.trim()) return `ref:${ref.trim().toUpperCase()}`;
  if (barcode.trim()) return `ean:${barcode.trim()}`;
  return `nombre:${normalizar(nombre)}`;
}

interface Contexto {
  ahora: string;
  nuevoId: () => string;
}

export function revisarClientes(
  tabla: Tabla,
  inicioDatos: number,
  mapeo: Mapeo,
  existentes: readonly Client[],
  ctx: Contexto,
): FilaRevisada<Client>[] {
  const yaEstan = new Set(existentes.flatMap(c => [claveCliente(c.nif, ''), claveCliente('', c.businessName)].filter(k => k !== 'nif:' && k !== 'nombre:')));
  const vistas = new Set<string>();

  return tabla.slice(inicioDatos).map((fila, i) => {
    const errores: string[] = [];
    const avisos: string[] = [];
    let businessName = dato(fila, mapeo, 'businessName');
    const tradeName = dato(fila, mapeo, 'tradeName');
    if (!businessName && tradeName) businessName = tradeName;
    const nifCrudo = limpiarNif(dato(fila, mapeo, 'nif'));

    let nif = '';
    let vatNumber: string | undefined;
    if (nifCrudo) {
      if (validateNIF(nifCrudo)) nif = nifCrudo;
      else if (esNifIvaExtranjero(nifCrudo)) { vatNumber = nifCrudo; avisos.push('NIF-IVA de otro país de la UE: sus facturas saldrán como intracomunitarias'); }
      else if (nifCrudo.startsWith('ES') && validateNIF(nifCrudo.slice(2))) nif = nifCrudo.slice(2);
      else { nif = nifCrudo; avisos.push(`El NIF «${nifCrudo}» no parece válido: revísalo antes de hacerle una factura`); }
    } else {
      avisos.push('Sin NIF: sólo se le podrán hacer facturas simplificadas de hasta 400 €');
    }

    if (!businessName) errores.push('Falta el nombre o la razón social');

    const email = dato(fila, mapeo, 'email');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) avisos.push(`El email «${email}» no parece válido`);

    const clave = claveCliente(nif || vatNumber || '', businessName);
    let estado: EstadoFila = errores.length ? 'error' : 'nuevo';
    if (estado === 'nuevo') {
      const claveNombre = claveCliente('', businessName);
      if (yaEstan.has(clave) || (!nif && !vatNumber && yaEstan.has(claveNombre))) estado = 'existe';
      else if (vistas.has(clave)) estado = 'repetido';
      vistas.add(clave);
    }

    const dias = numeroEs(dato(fila, mapeo, 'paymentDays'));
    const ficha: Client | null = errores.length ? null : {
      id: ctx.nuevoId(),
      nif,
      vatNumber,
      businessName,
      tradeName,
      email,
      phone: dato(fila, mapeo, 'phone'),
      contactPerson: dato(fila, mapeo, 'contactPerson'),
      address: dato(fila, mapeo, 'address'),
      city: dato(fila, mapeo, 'city'),
      postalCode: dato(fila, mapeo, 'postalCode'),
      province: dato(fila, mapeo, 'province'),
      country: dato(fila, mapeo, 'country') || 'España',
      paymentDays: dias !== null && dias >= 0 && dias <= 365 ? Math.round(dias) : 30,
      defaultPaymentMethod: PaymentMethod.TRANSFERENCIA,
      notes: dato(fila, mapeo, 'notes'),
      active: true,
      createdAt: ctx.ahora,
      updatedAt: ctx.ahora,
    };

    return { fila: inicioDatos + i + 1, estado, ficha, errores, avisos, titulo: businessName || '(sin nombre)' };
  });
}

export function revisarProductos(
  tabla: Tabla,
  inicioDatos: number,
  mapeo: Mapeo,
  existentes: readonly Product[],
  ctx: Contexto & { impuestoPorDefecto: number },
): FilaRevisada<Product>[] {
  const yaEstan = new Set(existentes.map(p => claveProducto(p.ref, p.barcode ?? '', p.name)));
  const vistas = new Set<string>();

  return tabla.slice(inicioDatos).map((fila, i) => {
    const errores: string[] = [];
    const avisos: string[] = [];
    const name = dato(fila, mapeo, 'name') || dato(fila, mapeo, 'description');
    if (!name) errores.push('Falta el nombre del producto');

    let tipo = tipoImpositivo(dato(fila, mapeo, 'defaultTaxRate'));
    if (tipo === null) {
      tipo = ctx.impuestoPorDefecto;
      if (mapeo.defaultTaxRate !== undefined) avisos.push(`Sin % de impuesto: se pone el ${ctx.impuestoPorDefecto} %`);
    } else if (tipo < 0 || tipo > 30) {
      errores.push(`El impuesto «${dato(fila, mapeo, 'defaultTaxRate')}» no es un porcentaje válido`);
    }

    // El precio se guarda SIN impuesto. Si el archivo sólo trae el precio
    // con impuesto (el PVP de mostrador), se le quita.
    let precio = numeroEs(dato(fila, mapeo, 'unitPrice'));
    const conImpuesto = numeroEs(dato(fila, mapeo, 'unitPriceConImpuesto'));
    if (precio === null && conImpuesto !== null && tipo !== null) {
      precio = Math.round((conImpuesto / (1 + tipo / 100)) * 10000) / 10000;
      avisos.push(`Precio calculado sin impuesto a partir del PVP ${conImpuesto.toFixed(2)} €`);
    }
    if (precio === null) {
      precio = 0;
      avisos.push('Sin precio: se crea a 0 €');
    } else if (precio < 0) {
      errores.push('El precio es negativo');
    }

    const ref = dato(fila, mapeo, 'ref');
    const barcode = dato(fila, mapeo, 'barcode');
    const clave = claveProducto(ref, barcode, name);
    let estado: EstadoFila = errores.length ? 'error' : 'nuevo';
    if (estado === 'nuevo') {
      if (yaEstan.has(clave)) estado = 'existe';
      else if (vistas.has(clave)) estado = 'repetido';
      vistas.add(clave);
    }

    const stock = numeroEs(dato(fila, mapeo, 'stockQuantity'));
    const coste = numeroEs(dato(fila, mapeo, 'costPrice'));
    const ficha: Product | null = errores.length ? null : {
      id: ctx.nuevoId(),
      ref,
      name,
      description: dato(fila, mapeo, 'description') === name ? '' : dato(fila, mapeo, 'description'),
      category: dato(fila, mapeo, 'category'),
      unitPrice: precio,
      defaultTaxRate: tipo ?? ctx.impuestoPorDefecto,
      unit: UnitOfMeasure.UNIDAD,
      active: true,
      barcode: barcode || undefined,
      stockQuantity: stock ?? undefined,
      costeUltimaCompra: coste ?? undefined,
      createdAt: ctx.ahora,
      updatedAt: ctx.ahora,
    };

    return { fila: inicioDatos + i + 1, estado, ficha, errores, avisos, titulo: name || '(sin nombre)' };
  });
}

/** Cuántas filas hay de cada tipo. */
export function resumen<T>(filas: readonly FilaRevisada<T>[]): Record<EstadoFila, number> {
  const r: Record<EstadoFila, number> = { nuevo: 0, existe: 0, repetido: 0, error: 0 };
  for (const f of filas) r[f.estado]++;
  return r;
}
