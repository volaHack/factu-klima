/**
 * QUÉ ES CADA TIPO DE DOCUMENTO, EN UN SOLO SITIO
 *
 * El diseñador sólo conocía dos tipos, «factura» y «albarán», y trataba
 * todo lo que pasara por él como si fuera una factura: se previsualizaba
 * con datos de factura, con el título «FACTURA» y con el QR tributario
 * estampado encima, aunque lo que se estuviera diseñando fuera un
 * albarán. De ahí salía un código QR que nadie había colocado.
 *
 * Aquí está la personalidad de cada uno: cómo se llama, cómo se titula el
 * impreso, si lleva QR de la AEAT y por qué, qué advertencia legal le
 * corresponde y por qué palabras se le reconoce cuando alguien sube un
 * PDF. Todo lo demás —los rótulos de la pantalla, la vista previa, la
 * detección al subir— sale de esta tabla, así que añadir un tipo nuevo se
 * hace aquí y aparece solo en todas partes.
 *
 * EL QR NO ES DECORACIÓN
 * ----------------------
 * Sólo lo llevan la factura y la rectificativa, y lo llevan por
 * obligación: el Real Decreto 1007/2023 exige que una factura Veri*Factu
 * salga con su código de cotejo. Ponerlo en un presupuesto o en un
 * albarán no es un extra bonito: es decirle al cliente que ese papel está
 * declarado a Hacienda cuando no lo está.
 */

/** Los tipos que el programa sabe emitir, de menos a más compromiso. */
export const TIPOS_PLANTILLA = [
  'presupuesto',
  'pedido',
  'albaran',
  'factura',
  'rectificativa',
] as const;

export type TipoDocumentoPlantilla = (typeof TIPOS_PLANTILLA)[number];

export interface PersonalidadDocumento {
  id: TipoDocumentoPlantilla;
  /** Como se nombra en singular: «Albarán». */
  etiqueta: string;
  /** Como se nombra en plural, para listas y casillas: «Albaranes». */
  plural: string;
  /** Cómo se titula el impreso, en mayúsculas: «ALBARÁN DE ENTREGA». */
  tituloImpreso: string;
  /** Una línea explicando para qué sirve, en la pantalla de diseño. */
  paraQue: string;
  /**
   * Si lleva el código QR de cotejo de la AEAT.
   *
   * Sólo los documentos que son una factura a efectos fiscales. Poner el
   * QR en los demás sería afirmar que están declarados.
   */
  llevaQr: boolean;
  /** Qué se le dice al usuario sobre el QR, esté o no. */
  notaQr: string;
  /**
   * La advertencia que va impresa en el propio documento, si le
   * corresponde alguna. Lo que evita que un albarán pase por factura.
   */
  avisoLegal: string;
  /**
   * Las palabras que delatan este tipo en un PDF subido. Se comparan sin
   * acentos ni mayúsculas. Las más específicas van primero.
   */
  palabras: string[];
}

export const PERSONALIDADES: Record<TipoDocumentoPlantilla, PersonalidadDocumento> = {
  presupuesto: {
    id: 'presupuesto',
    etiqueta: 'Presupuesto',
    plural: 'Presupuestos',
    tituloImpreso: 'PRESUPUESTO',
    paraQue: 'Lo que le pasas al cliente ANTES de trabajar, para que lo acepte.',
    llevaQr: false,
    notaQr: 'Sin QR: un presupuesto no es una factura y no se declara.',
    avisoLegal: 'Este presupuesto tiene una validez de 30 días.',
    palabras: ['presupuesto', 'proforma', 'factura proforma', 'oferta', 'cotizacion'],
  },
  pedido: {
    id: 'pedido',
    etiqueta: 'Pedido',
    plural: 'Pedidos',
    tituloImpreso: 'PEDIDO',
    paraQue: 'El encargo ya aceptado, antes de entregarlo.',
    llevaQr: false,
    notaQr: 'Sin QR: un pedido no es una factura y no se declara.',
    avisoLegal: 'Este pedido no es una factura: no sirve para deducir el gasto.',
    palabras: ['pedido', 'nota de pedido', 'orden de compra', 'orden de pedido'],
  },
  albaran: {
    id: 'albaran',
    etiqueta: 'Albarán',
    plural: 'Albaranes',
    tituloImpreso: 'ALBARÁN',
    paraQue: 'Acompaña la mercancía y acredita la entrega. No tiene valor fiscal.',
    llevaQr: false,
    notaQr: 'Sin QR: el albarán acredita una entrega, no un cobro declarado.',
    avisoLegal: 'Este albarán acredita la entrega de la mercancía y no tiene valor fiscal como factura.',
    palabras: ['albaran', 'nota de entrega', 'nota de reparto', 'entrega'],
  },
  factura: {
    id: 'factura',
    etiqueta: 'Factura',
    plural: 'Facturas',
    tituloImpreso: 'FACTURA',
    paraQue: 'El documento que se cobra y se declara a Hacienda.',
    llevaQr: true,
    notaQr:
      'Lleva el QR de cotejo de la AEAT, obligatorio en Veri*Factu. Su recuadro '
      + 'está en el diseño: arrástralo donde quieras si tapa algo.',
    avisoLegal: '',
    palabras: ['factura simplificada', 'factura', 'ticket', 'recibo'],
  },
  rectificativa: {
    id: 'rectificativa',
    etiqueta: 'Factura rectificativa',
    plural: 'Rectificativas',
    tituloImpreso: 'FACTURA RECTIFICATIVA',
    paraQue: 'Corrige una factura ya emitida. Se declara igual que ella.',
    llevaQr: true,
    notaQr: 'Lleva el QR de cotejo de la AEAT, igual que la factura que corrige. Su recuadro se puede mover.',
    avisoLegal: '',
    palabras: ['factura rectificativa', 'rectificativa', 'abono', 'nota de credito'],
  },
};

export function personalidadDe(tipo: TipoDocumentoPlantilla): PersonalidadDocumento {
  return PERSONALIDADES[tipo];
}

/** ¿Alguno de estos tipos exige el QR tributario? */
export function algunoLlevaQr(tipos: readonly TipoDocumentoPlantilla[]): boolean {
  return tipos.some(t => PERSONALIDADES[t].llevaQr);
}

/**
 * El tipo que manda cuando una plantilla sirve para varios.
 *
 * Se previsualiza con el más comprometido de los que tenga marcados: si
 * una plantilla vale para albarán Y factura, hay que verla con el QR
 * puesto, porque es el caso en que el diseño puede quedarse sin sitio.
 * Al revés —enseñarla sin QR— escondería justo el problema.
 */
export function tipoDominante(
  tipos: readonly TipoDocumentoPlantilla[],
): TipoDocumentoPlantilla {
  const porOrden = [...TIPOS_PLANTILLA].reverse();
  return porOrden.find(t => tipos.includes(t)) ?? 'factura';
}

// ============================================================
// RECONOCER EL TIPO EN UN PDF SUBIDO
// ============================================================

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface TextoDelDocumento {
  texto: string;
  /** Tamaño de letra en puntos: el título suele ser el más grande. */
  tamano: number;
  /** mm desde el borde superior. */
  y: number;
}

export interface TipoReconocido {
  tipo: TipoDocumentoPlantilla;
  /** La palabra que lo delató, tal cual estaba escrita. */
  palabra: string;
  /**
   * De 0 a 1. Alto cuando la palabra sale en un titular grande y arriba;
   * bajo cuando aparece perdida en la letra pequeña, donde lo mismo es
   * una condición de pago que menciona la factura.
   */
  confianza: number;
}

/**
 * Qué clase de documento es el PDF que acaban de subir.
 *
 * Un impreso español dice lo que es en su titular, así que se busca ahí
 * primero: la palabra en la letra más grande del tercio superior manda
 * sobre la misma palabra escondida en el pie. Sin esto, cualquier albarán
 * que llevara «pendiente de factura» en las condiciones se habría tomado
 * por una factura.
 *
 * Devuelve `null` cuando no hay nada reconocible. Eso no es un fallo: es
 * la respuesta honesta, y quien sube el PDF elige el tipo a mano.
 *
 * `altoPagina` es el alto de la hoja en mm. Se puede omitir —entonces se
 * supone un A4— pero pasarlo afina el peso de «está arriba» en tickets y
 * en apaisado.
 */
export function reconocerTipo(
  textos: readonly TextoDelDocumento[],
  altoPagina?: number,
): TipoReconocido | null {
  if (textos.length === 0) return null;

  const tamanoMaximo = Math.max(...textos.map(t => t.tamano || 0), 1);
  // Si no se pasa el alto de la hoja se usa un A4, no el texto más bajo:
  // con un solo texto, medirlo contra sí mismo lo dejaba siempre «al pie»
  // de un documento de una línea, y hundía su confianza sin motivo.
  const altoDelDocumento = Math.max(altoPagina ?? 0, ...textos.map(t => t.y || 0), 297);

  let mejor: TipoReconocido | null = null;

  for (const item of textos) {
    const limpio = normalizar(item.texto);
    if (!limpio) continue;

    for (const tipo of TIPOS_PLANTILLA) {
      for (const palabra of PERSONALIDADES[tipo].palabras) {
        if (!limpio.includes(palabra)) continue;

        // Un titular grande pesa mucho más que la letra pequeña, y lo de
        // arriba más que lo de abajo. Y entre dos palabras que encajan,
        // gana la más larga: «factura rectificativa» describe mejor el
        // documento que «factura», que también está dentro.
        const porTamano = (item.tamano || 0) / tamanoMaximo;
        const porAltura = 1 - Math.min((item.y || 0) / altoDelDocumento, 1);
        const porPrecision = Math.min(palabra.length / 20, 1);
        const confianza = Math.min(
          0.55 * porTamano + 0.3 * porAltura + 0.15 * porPrecision,
          1,
        );

        if (!mejor || confianza > mejor.confianza) {
          mejor = { tipo, palabra, confianza: Number(confianza.toFixed(2)) };
        }
      }
    }
  }

  return mejor;
}
