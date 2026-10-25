// @ts-check
/**
 * COPIA DE SEGURIDAD DE UNA EMPRESA — EL NÚCLEO
 *
 * JavaScript puro (sin TypeScript ni alias) a propósito: lo usan el servidor
 * (la ruta /api/copia), las pruebas y el script de restauración
 * (scripts/restaurar-copia.mjs), que corre con Node a secas. Una sola
 * definición de qué lleva la copia y de cómo se comprueba que no se ha
 * tocado.
 *
 * QUÉ LLEVA
 *   · Todas las tablas de la empresa, enteras y tal como están en el
 *     SERVIDOR (no la caché de un equipo): facturas, líneas, desgloses,
 *     registros Veri*Factu con sus huellas, eventos, cobros, albaranes…
 *   · Un manifiesto: para cada tabla, cuántas filas y la SHA-256 de su
 *     contenido en forma canónica. Y una huella de la copia entera.
 *
 * QUÉ NO LLEVA (y por qué)
 *   · Credenciales: el certificado electrónico, las conexiones con el banco
 *     y con Stripe, los PIN de los perfiles. No se sacan de la base de
 *     datos en un fichero que acaba en un portátil o en un correo.
 */

/** Versión del formato. */
export const FORMATO = 2;

/**
 * Las tablas, EN EL ORDEN EN QUE SE RESTAURAN (primero de las que dependen
 * otras). `por`: cómo se filtran las de esta empresa — por `user_id`, o por
 * la columna que apunta a su tabla madre.
 * @type {Array<{ nombre: string, por: 'user_id' | { columna: string, madre: string }, quitar?: string[] }>}
 */
export const TABLAS = [
  { nombre: 'company_settings', por: 'user_id', quitar: ['stripe_customer_id', 'stripe_subscription_id'] },
  { nombre: 'verifactu_config', por: 'user_id' },
  { nombre: 'grupos_clientes', por: 'user_id' },
  { nombre: 'rutas_reparto', por: 'user_id' },
  { nombre: 'almacenes', por: 'user_id' },
  { nombre: 'vendedores', por: 'user_id' },
  { nombre: 'vehiculos', por: 'user_id' },
  { nombre: 'obras', por: 'user_id' },
  { nombre: 'perfiles_trabajo', por: 'user_id', quitar: ['pin_hash', 'pin_sal'] },
  { nombre: 'clients', por: 'user_id' },
  { nombre: 'products', por: 'user_id' },
  { nombre: 'lotes', por: 'user_id' },
  { nombre: 'numeros_serie', por: 'user_id' },
  { nombre: 'escandallos', por: 'user_id' },
  { nombre: 'ofertas', por: 'user_id' },
  { nombre: 'rappels', por: 'user_id' },
  { nombre: 'document_templates', por: 'user_id' },
  { nombre: 'pos_sessions', por: 'user_id' },
  { nombre: 'invoices', por: 'user_id' },
  { nombre: 'invoice_line_items', por: { columna: 'invoice_id', madre: 'invoices' } },
  { nombre: 'invoice_tax_breakdown', por: { columna: 'invoice_id', madre: 'invoices' } },
  { nombre: 'verifactu_registros', por: 'user_id' },
  { nombre: 'invoice_events', por: 'user_id' },
  { nombre: 'order_approvals', por: { columna: 'invoice_id', madre: 'invoices' } },
  { nombre: 'order_approval_items', por: { columna: 'approval_id', madre: 'order_approvals' } },
  { nombre: 'albaranes', por: 'user_id' },
  { nombre: 'albaran_line_items', por: { columna: 'albaran_id', madre: 'albaranes' } },
  { nombre: 'devoluciones', por: 'user_id' },
  { nombre: 'devolucion_line_items', por: { columna: 'devolucion_id', madre: 'devoluciones' } },
  { nombre: 'abonos', por: 'user_id' },
  { nombre: 'abono_aplicaciones', por: { columna: 'abono_id', madre: 'abonos' } },
  { nombre: 'cobros_pagos', por: 'user_id' },
  { nombre: 'gastos', por: 'user_id' },
  { nombre: 'ordenes_trabajo', por: 'user_id' },
  { nombre: 'traspasos', por: 'user_id' },
  { nombre: 'traspaso_line_items', por: { columna: 'traspaso_id', madre: 'traspasos' } },
  { nombre: 'regularizaciones_stock', por: 'user_id' },
  { nombre: 'movimientos_stock', por: 'user_id' },
  { nombre: 'fe_facturas', por: 'user_id' },
  { nombre: 'fe_comunicaciones', por: 'user_id' },
  { nombre: 'apuntes_contables', por: 'user_id' },
  { nombre: 'recordatorios_cobro', por: 'user_id' },
  { nombre: 'historico_documentos', por: 'user_id' },
];

/** Lo que no va en la copia, y por qué (se dice dentro de la propia copia). */
export const EXCLUIDAS = {
  verifactu_certificates: 'El certificado electrónico no sale de la base de datos: guarda tú el .p12/.pfx y vuelve a subirlo.',
  stripe_connections: 'Credenciales de Stripe: se vuelven a conectar.',
  bancos_conectados: 'Credenciales del banco: se vuelve a autorizar.',
  bancos_autorizaciones: 'Credenciales del banco: se vuelve a autorizar.',
  cobro_online_cuentas: 'Credenciales de cobro online: se vuelven a conectar.',
  'perfiles_trabajo.pin_hash/pin_sal': 'Los PIN de los perfiles no se copian: se ponen de nuevo.',
};

/**
 * JSON canónico: claves ordenadas a todos los niveles y sin espacios. Dos
 * copias con el mismo contenido dan la misma cadena, y por tanto la misma
 * huella, vengan de donde vengan.
 * @param {unknown} v
 * @returns {string}
 */
export function canonico(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonico).join(',')}]`;
  const o = /** @type {Record<string, unknown>} */ (v);
  return `{${Object.keys(o).filter(k => o[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${canonico(o[k])}`).join(',')}}`;
}

/**
 * Las filas en un orden fijo (por id, y si no hay id por su forma canónica).
 * @param {Array<Record<string, unknown>>} filas
 */
export function ordenarFilas(filas) {
  const clave = (/** @type {Record<string, unknown>} */ f) => (f.id != null ? String(f.id) : canonico(f));
  return [...filas].sort((a, b) => (clave(a) < clave(b) ? -1 : clave(a) > clave(b) ? 1 : 0));
}

/**
 * SHA-256 en hexadecimal (WebCrypto: Node 20+ y navegadores).
 * @param {string} texto
 */
export async function sha256Hex(texto) {
  const resumen = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(resumen)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Arma la copia leyendo del servidor.
 * @param {(tabla: string, filtro: { columna: string, valores: string[] }) => Promise<Array<Record<string, unknown>>>} leer
 *   Devuelve TODAS las filas de `tabla` cuya `columna` está en `valores`.
 * @param {string} cuenta  El user_id de la empresa.
 * @param {Date} [ahora]
 */
export async function construirCopia(leer, cuenta, ahora = new Date()) {
  /** @type {Record<string, Array<Record<string, unknown>>>} */
  const tablas = {};
  for (const t of TABLAS) {
    let filas;
    if (t.por === 'user_id') {
      filas = await leer(t.nombre, { columna: 'user_id', valores: [cuenta] });
    } else {
      const ids = (tablas[t.por.madre] ?? []).map(f => String(f.id));
      filas = ids.length ? await leer(t.nombre, { columna: t.por.columna, valores: ids }) : [];
    }
    if (t.quitar) filas = filas.map(f => Object.fromEntries(Object.entries(f).filter(([k]) => !t.quitar?.includes(k))));
    tablas[t.nombre] = ordenarFilas(filas);
  }
  const manifiesto = await manifiestoDe(tablas);
  return {
    formato: FORMATO,
    generadoEn: ahora.toISOString(),
    generadoPor: 'Klima · Sistema de facturación',
    origen: 'servidor',
    cuenta,
    aviso: 'Copia de los datos de la empresa leídos del servidor. Las facturas emitidas y sus registros Veri*Factu son registros fiscales: consérvalos el plazo legal.',
    excluido: EXCLUIDAS,
    manifiesto,
    huellaCopia: await sha256Hex(canonico(manifiesto)),
    tablas,
  };
}

/** @param {Record<string, Array<Record<string, unknown>>>} tablas */
export async function manifiestoDe(tablas) {
  /** @type {Record<string, { filas: number, sha256: string }>} */
  const m = {};
  for (const t of TABLAS) {
    const filas = ordenarFilas(tablas[t.nombre] ?? []);
    m[t.nombre] = { filas: filas.length, sha256: await sha256Hex(canonico(filas)) };
  }
  return m;
}

/**
 * ¿La copia está entera y sin tocar? Recalcula el manifiesto y lo compara.
 * @param {{ formato?: number, manifiesto?: Record<string, { filas: number, sha256: string }>, huellaCopia?: string, tablas?: Record<string, Array<Record<string, unknown>>> }} copia
 * @returns {Promise<string[]>} Los problemas (vacío si está bien).
 */
export async function comprobarManifiesto(copia) {
  const problemas = [];
  if (copia.formato !== FORMATO) problemas.push(`Formato ${copia.formato} desconocido (se espera ${FORMATO}).`);
  if (!copia.manifiesto || !copia.tablas) return [...problemas, 'Falta el manifiesto o las tablas.'];
  if (copia.huellaCopia !== await sha256Hex(canonico(copia.manifiesto))) problemas.push('La huella de la copia no cuadra con su manifiesto: el manifiesto se ha modificado.');
  const real = await manifiestoDe(copia.tablas);
  for (const t of TABLAS) {
    const esperado = copia.manifiesto[t.nombre];
    if (!esperado) { problemas.push(`El manifiesto no recoge la tabla ${t.nombre}.`); continue; }
    if (esperado.filas !== real[t.nombre].filas) problemas.push(`${t.nombre}: ${real[t.nombre].filas} filas, el manifiesto dice ${esperado.filas}.`);
    else if (esperado.sha256 !== real[t.nombre].sha256) problemas.push(`${t.nombre}: el contenido no cuadra con el manifiesto (modificado o dañado).`);
  }
  return problemas;
}
