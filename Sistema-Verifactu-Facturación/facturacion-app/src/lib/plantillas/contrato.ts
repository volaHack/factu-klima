/**
 * CONTRATO DE CAMPOS DE UNA PLANTILLA DE DOCUMENTO
 *
 * Única fuente de verdad sobre qué datos puede pintar una plantilla. Lo
 * consumen cuatro sitios, y por eso vive aparte:
 *
 *   1. `datos.ts`, que rellena un valor para cada clave a partir de la
 *      factura/albarán real.
 *   2. El detector (`deteccion.ts`), que al analizar un PDF subido decide a
 *      qué clave corresponde cada texto encontrado.
 *   3. El revisor de campos de la pantalla de plantillas, que muestra estas
 *      etiquetas al usuario para que corrija la detección.
 *   4. El validador (`validarPlantilla`), que rechaza una plantilla con
 *      campos inventados antes de guardarla — así el fallo se ve al crearla
 *      y no al imprimir una factura de verdad delante del cliente.
 *
 * Las claves son a la vez el `name` de cada campo en la plantilla pdfme y la
 * clave del objeto de entrada de `generate()`. Por eso son identificadores
 * planos con guion bajo y NO llevan puntos: pdfme evalúa `{clave}` como una
 * expresión JavaScript en los campos fijos (cabecera y pie que se repiten en
 * todas las páginas), y `empresa.nombre` se interpretaría como la propiedad
 * `nombre` de un objeto `empresa` que no existe.
 *
 * El test `contrato.test.ts` comprueba que `datos.ts` rellene exactamente
 * estas claves, para que las dos listas no se separen con el tiempo.
 */

export type GrupoCampo = 'empresa' | 'cliente' | 'documento' | 'totales' | 'verifactu';
export type TipoCampo = 'texto' | 'imagen' | 'tabla';

export interface CampoPlantilla {
  /** Identificador del campo. Es el `name` del elemento en la plantilla pdfme. */
  clave: string;
  /** Nombre corto para la interfaz. */
  etiqueta: string;
  /** Qué contiene, en una frase. Se muestra como ayuda. */
  descripcion: string;
  grupo: GrupoCampo;
  tipo: TipoCampo;
  /** Valor de muestra para previsualizar una plantilla sin factura real. */
  ejemplo: string;
  /** El usuario lo rellena a mano en el formulario; no tiene fuente automática. */
  manual?: boolean;
}

// ============================================================
// CAMPOS SUELTOS
// ============================================================

export const CAMPOS: CampoPlantilla[] = [
  // --- Emisor ---
  { clave: 'empresa_nombre', etiqueta: 'Nombre de tu empresa', descripcion: 'Nombre comercial (o razón social si no hay comercial)', grupo: 'empresa', tipo: 'texto', ejemplo: 'Distribuciones Ejemplo' },
  { clave: 'empresa_razon_social', etiqueta: 'Razón social', descripcion: 'Razón social completa del emisor', grupo: 'empresa', tipo: 'texto', ejemplo: 'Distribuciones Ejemplo S.L.' },
  { clave: 'empresa_nif', etiqueta: 'NIF de tu empresa', descripcion: 'NIF/CIF del emisor', grupo: 'empresa', tipo: 'texto', ejemplo: 'B12345678' },
  { clave: 'empresa_direccion', etiqueta: 'Dirección', descripcion: 'Calle y número del emisor', grupo: 'empresa', tipo: 'texto', ejemplo: 'Calle Mayor 1' },
  { clave: 'empresa_cp', etiqueta: 'Código postal', descripcion: 'Código postal del emisor', grupo: 'empresa', tipo: 'texto', ejemplo: '28001' },
  { clave: 'empresa_ciudad', etiqueta: 'Ciudad', descripcion: 'Ciudad del emisor', grupo: 'empresa', tipo: 'texto', ejemplo: 'Madrid' },
  { clave: 'empresa_provincia', etiqueta: 'Provincia', descripcion: 'Provincia del emisor', grupo: 'empresa', tipo: 'texto', ejemplo: 'Madrid' },
  { clave: 'empresa_poblacion', etiqueta: 'Población completa', descripcion: 'CP, ciudad y provincia en una sola línea', grupo: 'empresa', tipo: 'texto', ejemplo: '28001 Madrid (Madrid)' },
  { clave: 'empresa_email', etiqueta: 'Email', descripcion: 'Correo electrónico del emisor', grupo: 'empresa', tipo: 'texto', ejemplo: 'hola@ejemplo.es' },
  { clave: 'empresa_telefono', etiqueta: 'Teléfono', descripcion: 'Teléfono del emisor', grupo: 'empresa', tipo: 'texto', ejemplo: '910 000 000' },
  { clave: 'empresa_web', etiqueta: 'Web', descripcion: 'Página web del emisor', grupo: 'empresa', tipo: 'texto', ejemplo: 'www.ejemplo.es' },
  { clave: 'empresa_iban', etiqueta: 'IBAN', descripcion: 'Cuenta bancaria de cobro', grupo: 'empresa', tipo: 'texto', ejemplo: 'ES12 1234 1234 1212 3456 7890' },
  { clave: 'empresa_banco', etiqueta: 'Banco', descripcion: 'Nombre del banco', grupo: 'empresa', tipo: 'texto', ejemplo: 'Banco Ejemplo' },
  { clave: 'empresa_pie', etiqueta: 'Texto de pie', descripcion: 'Texto libre de pie de factura configurado en Ajustes', grupo: 'empresa', tipo: 'texto', ejemplo: 'Gracias por su confianza.' },
  { clave: 'empresa_logo', etiqueta: 'Logo', descripcion: 'Logotipo de la empresa', grupo: 'empresa', tipo: 'imagen', ejemplo: '' },

  // --- Receptor ---
  { clave: 'cliente_nombre', etiqueta: 'Nombre del cliente', descripcion: 'Nombre o razón social del cliente', grupo: 'cliente', tipo: 'texto', ejemplo: 'Supermercados del Norte S.A.' },
  { clave: 'cliente_nif', etiqueta: 'NIF del cliente', descripcion: 'NIF/CIF del cliente', grupo: 'cliente', tipo: 'texto', ejemplo: 'A87654321' },
  { clave: 'cliente_direccion', etiqueta: 'Dirección del cliente', descripcion: 'Calle y número del cliente', grupo: 'cliente', tipo: 'texto', ejemplo: 'Avenida del Puerto 45' },
  { clave: 'cliente_cp', etiqueta: 'CP del cliente', descripcion: 'Código postal del cliente', grupo: 'cliente', tipo: 'texto', ejemplo: '46023' },
  { clave: 'cliente_ciudad', etiqueta: 'Ciudad del cliente', descripcion: 'Ciudad del cliente', grupo: 'cliente', tipo: 'texto', ejemplo: 'Valencia' },
  { clave: 'cliente_provincia', etiqueta: 'Provincia del cliente', descripcion: 'Provincia del cliente', grupo: 'cliente', tipo: 'texto', ejemplo: 'Valencia' },
  { clave: 'cliente_poblacion', etiqueta: 'Población del cliente', descripcion: 'CP, ciudad y provincia del cliente en una línea', grupo: 'cliente', tipo: 'texto', ejemplo: '46023 Valencia (Valencia)' },
  { clave: 'cliente_email', etiqueta: 'Email del cliente', descripcion: 'Correo electrónico del cliente', grupo: 'cliente', tipo: 'texto', ejemplo: 'compras@ejemplo.es' },
  { clave: 'cliente_telefono', etiqueta: 'Teléfono del cliente', descripcion: 'Teléfono del cliente', grupo: 'cliente', tipo: 'texto', ejemplo: '960 000 000' },
  { clave: 'cliente_direccion_completa', etiqueta: 'Dirección completa del cliente', descripcion: 'Dirección, CP, ciudad y provincia del cliente en un bloque de varias líneas', grupo: 'cliente', tipo: 'texto', ejemplo: 'Avenida del Puerto 45\n46023 Valencia (Valencia)' },

  // --- Documento ---
  { clave: 'doc_tipo', etiqueta: 'Tipo de documento', descripcion: 'FACTURA o ALBARÁN, en mayúsculas', grupo: 'documento', tipo: 'texto', ejemplo: 'FACTURA' },
  { clave: 'doc_titulo', etiqueta: 'Título del documento', descripcion: 'Encabezado largo, p. ej. «FACTURA nº FAC-2026-0001»', grupo: 'documento', tipo: 'texto', ejemplo: 'FACTURA nº FAC-2026-0001' },
  { clave: 'doc_numero', etiqueta: 'Número', descripcion: 'Número del documento', grupo: 'documento', tipo: 'texto', ejemplo: 'FAC-2026-0001' },
  { clave: 'doc_serie', etiqueta: 'Serie', descripcion: 'Serie del documento', grupo: 'documento', tipo: 'texto', ejemplo: 'FAC' },
  { clave: 'doc_fecha', etiqueta: 'Fecha', descripcion: 'Fecha de emisión (dd/mm/aaaa)', grupo: 'documento', tipo: 'texto', ejemplo: '12/01/2026' },
  { clave: 'doc_vencimiento', etiqueta: 'Vencimiento', descripcion: 'Fecha de vencimiento (vacío en albaranes)', grupo: 'documento', tipo: 'texto', ejemplo: '11/02/2026' },
  { clave: 'doc_fecha_pago', etiqueta: 'Fecha de cobro', descripcion: 'Fecha de cobro si ya está pagada', grupo: 'documento', tipo: 'texto', ejemplo: '' },
  { clave: 'doc_estado', etiqueta: 'Estado', descripcion: 'Estado legible: Pagada, Pendiente, Expedido…', grupo: 'documento', tipo: 'texto', ejemplo: 'Pendiente' },
  { clave: 'doc_forma_pago', etiqueta: 'Forma de pago', descripcion: 'Forma de pago legible', grupo: 'documento', tipo: 'texto', ejemplo: 'Transferencia' },
  { clave: 'doc_notas', etiqueta: 'Observaciones', descripcion: 'Observaciones escritas en el documento', grupo: 'documento', tipo: 'texto', ejemplo: 'Entregar en horario de mañana.' },
  { clave: 'doc_aviso_legal', etiqueta: 'Aviso legal', descripcion: 'Aviso del tipo de documento (los albaranes no tienen valor fiscal)', grupo: 'documento', tipo: 'texto', ejemplo: '' },
  { clave: 'doc_pagina', etiqueta: 'Número de página', descripcion: 'Página actual y total, p. ej. «Página 1 de 2»', grupo: 'documento', tipo: 'texto', ejemplo: 'Página 1 de 1' },
  { clave: 'custom_1', etiqueta: 'Dato libre 1 (Pedido / Ref)', descripcion: 'Campo personalizado libre a rellenar manualmente', grupo: 'documento', tipo: 'texto', ejemplo: 'PED-2026-99', manual: true },
  { clave: 'custom_2', etiqueta: 'Dato libre 2 (Matrícula / Obra)', descripcion: 'Campo personalizado libre a rellenar manualmente', grupo: 'documento', tipo: 'texto', ejemplo: 'SE-1234-AB', manual: true },
  { clave: 'custom_3', etiqueta: 'Dato libre 3 (Proyecto / Ref. Ext.)', descripcion: 'Campo personalizado libre a rellenar manualmente', grupo: 'documento', tipo: 'texto', ejemplo: 'PROY-45', manual: true },
  { clave: 'custom_4', etiqueta: 'Dato libre 4', descripcion: 'Campo personalizado libre a rellenar manualmente', grupo: 'documento', tipo: 'texto', ejemplo: 'Dato libre 4', manual: true },
  { clave: 'custom_5', etiqueta: 'Dato libre 5', descripcion: 'Campo personalizado libre a rellenar manualmente', grupo: 'documento', tipo: 'texto', ejemplo: 'Dato libre 5', manual: true },

  // --- Importes (ya formateados con € y coma decimal) ---
  { clave: 'total_base', etiqueta: 'Base imponible', descripcion: 'Suma de las líneas sin impuestos', grupo: 'totales', tipo: 'texto', ejemplo: '1.250,00 €' },
  { clave: 'total_descuento', etiqueta: 'Descuento', descripcion: 'Descuento total aplicado', grupo: 'totales', tipo: 'texto', ejemplo: '0,00 €' },
  { clave: 'total_impuestos', etiqueta: 'Total impuestos', descripcion: 'Cuota total de IVA/IGIC', grupo: 'totales', tipo: 'texto', ejemplo: '262,50 €' },
  { clave: 'total_general', etiqueta: 'Total', descripcion: 'Total del documento', grupo: 'totales', tipo: 'texto', ejemplo: '1.512,50 €' },
  { clave: 'total_impuesto_nombre', etiqueta: 'Nombre del impuesto', descripcion: 'IVA o IGIC, según el régimen configurado', grupo: 'totales', tipo: 'texto', ejemplo: 'IVA' },
  { clave: 'total_desglose', etiqueta: 'Desglose de impuestos', descripcion: 'Una línea por tipo impositivo, p. ej. «IVA 21% sobre 1.250,00 € — 262,50 €»', grupo: 'totales', tipo: 'texto', ejemplo: 'IVA 21% sobre 1.250,00 € — 262,50 €' },

  // --- Sello Veri*Factu ---
  { clave: 'verifactu_huella', etiqueta: 'Huella Veri*Factu', descripcion: 'Huella SHA-256 encadenada completa', grupo: 'verifactu', tipo: 'texto', ejemplo: '' },
  { clave: 'verifactu_huella_corta', etiqueta: 'Huella abreviada', descripcion: 'Primeros 16 caracteres de la huella', grupo: 'verifactu', tipo: 'texto', ejemplo: '' },
  { clave: 'verifactu_fecha', etiqueta: 'Fecha del sellado', descripcion: 'Momento en que se selló el documento', grupo: 'verifactu', tipo: 'texto', ejemplo: '' },
  { clave: 'verifactu_leyenda', etiqueta: 'Leyenda Veri*Factu', descripcion: 'Texto legal de cotejo que acompaña al QR', grupo: 'verifactu', tipo: 'texto', ejemplo: '' },
  { clave: 'verifactu_qr', etiqueta: 'QR de cotejo', descripcion: 'Código QR para verificar la factura en la sede de la AEAT', grupo: 'verifactu', tipo: 'imagen', ejemplo: '' },
];

// ============================================================
// TABLAS
// ============================================================

export interface ColumnaTabla {
  clave: string;
  etiqueta: string;
  /** Cabecera que suele llevar esta columna en una factura impresa. */
  cabeceraSugerida: string;
  /** Las columnas de importes se alinean a la derecha por defecto. */
  numerica: boolean;
  ejemplo: string;
}

/** Columnas disponibles para la tabla de líneas (`lineas`). */
export const COLUMNAS_LINEAS: ColumnaTabla[] = [
  { clave: 'indice', etiqueta: 'Nº de orden', cabeceraSugerida: 'Nº', numerica: true, ejemplo: '1' },
  { clave: 'ref', etiqueta: 'Referencia', cabeceraSugerida: 'Ref.', numerica: false, ejemplo: 'REF-001' },
  { clave: 'descripcion', etiqueta: 'Descripción', cabeceraSugerida: 'Descripción', numerica: false, ejemplo: 'Producto de ejemplo' },
  { clave: 'cantidad', etiqueta: 'Cantidad', cabeceraSugerida: 'Cant.', numerica: true, ejemplo: '10' },
  { clave: 'unidad', etiqueta: 'Unidad', cabeceraSugerida: 'Ud.', numerica: false, ejemplo: 'ud' },
  { clave: 'cantidad_unidad', etiqueta: 'Cantidad + unidad', cabeceraSugerida: 'Cantidad', numerica: true, ejemplo: '10 ud' },
  { clave: 'precio', etiqueta: 'Precio unitario', cabeceraSugerida: 'Precio', numerica: true, ejemplo: '12,50 €' },
  { clave: 'descuento_pct', etiqueta: '% Descuento', cabeceraSugerida: 'Dto.', numerica: true, ejemplo: '—' },
  { clave: 'impuesto_pct', etiqueta: '% Impuesto', cabeceraSugerida: 'IVA', numerica: true, ejemplo: '21%' },
  { clave: 'importe', etiqueta: 'Importe sin impuestos', cabeceraSugerida: 'Importe', numerica: true, ejemplo: '125,00 €' },
  { clave: 'importe_impuesto', etiqueta: 'Cuota de impuesto', cabeceraSugerida: 'Cuota', numerica: true, ejemplo: '26,25 €' },
  { clave: 'importe_total', etiqueta: 'Importe con impuestos', cabeceraSugerida: 'Total', numerica: true, ejemplo: '151,25 €' },
];

/** Columnas disponibles para la tabla de desglose de impuestos (`impuestos`). */
export const COLUMNAS_IMPUESTOS: ColumnaTabla[] = [
  { clave: 'tipo', etiqueta: 'Tipo', cabeceraSugerida: 'Tipo', numerica: true, ejemplo: '21%' },
  { clave: 'nombre', etiqueta: 'Nombre del tipo', cabeceraSugerida: 'Impuesto', numerica: false, ejemplo: 'IVA 21%' },
  { clave: 'base', etiqueta: 'Base', cabeceraSugerida: 'Base', numerica: true, ejemplo: '1.250,00 €' },
  { clave: 'cuota', etiqueta: 'Cuota', cabeceraSugerida: 'Cuota', numerica: true, ejemplo: '262,50 €' },
  { clave: 'total', etiqueta: 'Base + cuota', cabeceraSugerida: 'Total', numerica: true, ejemplo: '1.512,50 €' },
];

/** Nombre reservado de la tabla de líneas dentro de una plantilla. */
export const TABLA_LINEAS = 'lineas';
/** Nombre reservado de la tabla de desglose de impuestos. */
export const TABLA_IMPUESTOS = 'impuestos';

// ============================================================
// CONSULTAS
// ============================================================

const CAMPOS_POR_CLAVE = new Map(CAMPOS.map(c => [c.clave, c]));

export function campoPorClave(clave: string): CampoPlantilla | undefined {
  return CAMPOS_POR_CLAVE.get(clave);
}

export function etiquetaDeClave(clave: string): string {
  if (clave === TABLA_LINEAS) return 'Tabla de líneas';
  if (clave === TABLA_IMPUESTOS) return 'Tabla de impuestos';
  return CAMPOS_POR_CLAVE.get(clave)?.etiqueta ?? clave;
}

/** Todas las claves que una plantilla puede usar como nombre de campo. */
export function clavesValidas(): Set<string> {
  return new Set([...CAMPOS.map(c => c.clave), TABLA_LINEAS, TABLA_IMPUESTOS]);
}

export function columnaDeLineas(clave: string): ColumnaTabla | undefined {
  return COLUMNAS_LINEAS.find(c => c.clave === clave);
}

export function columnaDeImpuestos(clave: string): ColumnaTabla | undefined {
  return COLUMNAS_IMPUESTOS.find(c => c.clave === clave);
}

/** Campos agrupados, para pintar el selector del revisor de campos. */
export function camposPorGrupo(): { grupo: GrupoCampo; titulo: string; campos: CampoPlantilla[] }[] {
  const titulos: Record<GrupoCampo, string> = {
    empresa: 'Tu empresa',
    cliente: 'Cliente',
    documento: 'Documento',
    totales: 'Importes',
    verifactu: 'Veri*Factu',
  };
  return (Object.keys(titulos) as GrupoCampo[]).map(grupo => ({
    grupo,
    titulo: titulos[grupo],
    campos: CAMPOS.filter(c => c.grupo === grupo),
  }));
}

/** Datos de muestra para previsualizar una plantilla sin factura real. */
export function datosDeEjemplo(): Record<string, string> {
  const campos: Record<string, string> = {};
  for (const campo of CAMPOS) campos[campo.clave] = campo.ejemplo;
  return campos;
}
