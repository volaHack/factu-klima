/**
 * DE UNA FACTURA DE LA APLICACIÓN A UN REGISTRO DE FACTURACIÓN
 *
 * Los códigos que se usan aquí salen de las listas oficiales del fichero
 * «DsRegistroVeriFactu.xlsx» (Diseños de registro de facturación v1.0,
 * AEAT), hoja «6)Listas»:
 *
 *   L1  Impuesto:           01 IVA · 02 IPSI · 03 IGIC · 05 otros
 *   L8A Clave de régimen:   01 general · 02 exportación · 18 recargo…
 *   L9  Calificación:       S1 sujeta y no exenta · S2 con inversión del
 *                           sujeto pasivo · N1/N2 no sujeta
 *   L10 Exención:           E1 art. 20 · E2 art. 21 · E3 art. 22 ·
 *                           E4 arts. 23 y 24 · E5 art. 25 · E6 otros
 *
 * OJO CON UNA COSA QUE YA ESTABA MAL EN EL PROYECTO
 * La función resolverClaveRegimenIva de lib/constants devuelve «11» para
 * las operaciones intracomunitarias. En la lista oficial, el 11 es
 * «operaciones de arrendamiento de local de negocio»: no tiene nada que
 * ver. Una entrega intracomunitaria es régimen general (01) y lo que la
 * distingue es que va EXENTA por el artículo 25, o sea E5. Por eso este
 * módulo no llama a aquella función: calcula los códigos por su cuenta.
 * (La función sigue en su sitio porque el módulo de SII la usa, y eso es
 * harina de otro costal.)
 *
 * LO QUE ESTE MÓDULO NO PUEDE ADIVINAR
 * Cuando una línea va al 0 % y no es intracomunitaria, el motivo puede
 * ser el artículo 20 (sanidad, enseñanza, seguros, financieras…), el 21
 * (exportación) o algún otro. La aplicación no le pregunta eso al
 * usuario en ningún sitio, así que aquí se aplica un valor por defecto y
 * se deja dicho en voz alta: quien facture exento por otro artículo
 * tiene que decirlo en la factura, y la pantalla de Veri*Factu avisa de
 * qué se va a enviar antes de enviarlo.
 */

import { fechaAeat } from './huella';
import type { DetalleDesglose, Persona, RegistroAlta, RegistroAnulacion, SistemaInformatico } from './registroXml';

/** Lo que se guarda en verifactu_registros, tal cual sale de la base. */
export interface FilaRegistro {
  id: string;
  invoice_id: string;
  tipo_registro: 'alta' | 'anulacion';
  indice: number;
  huella: string;
  huella_anterior: string | null;
  id_emisor: string;
  num_serie: string;
  fecha_expedicion: string;
  tipo_factura: string | null;
  cuota_total: number | string | null;
  importe_total: number | string | null;
  fecha_hora_huso: string;
  estado: string;
  intentos: number;
}

/** Los datos de la factura que hacen falta para completar el registro. */
export interface FilaFactura {
  id: string;
  client_name: string | null;
  client_nif: string | null;
  client_vat_number: string | null;
  es_intracomunitaria: boolean | null;
  clave_regimen_iva: string | null;
  tipo: string;
  documento_origen_number: string | null;
  documento_origen_id: string | null;
  issue_date: string;
  notes: string | null;
  datos_extras: Record<string, unknown> | null;
}

export interface TramoImpuesto {
  rate: number;
  base_amount: number | string;
  tax_amount: number | string;
}

export interface LineaFactura {
  product_name: string | null;
}

/** Exención que se asume cuando una línea va al 0 % y no sabemos por qué. */
export const EXENCION_POR_DEFECTO = 'E1';
/** Entrega intracomunitaria: exenta por el artículo 25. */
export const EXENCION_INTRACOMUNITARIA = 'E5';

function numero(valor: number | string | null | undefined): number {
  if (valor === null || valor === undefined) return 0;
  const n = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(n) ? n : 0;
}

/**
 * El texto del campo DescripcionOperacion, que es obligatorio.
 *
 * Se arma con lo que se ha vendido, porque «Venta de bienes y servicios»
 * no le dice nada a nadie cuando llega una comprobación. Si no hay
 * líneas legibles, se cae a la frase genérica antes que dejar el campo
 * vacío, que invalidaría el registro.
 */
export function descripcionDeOperacion(lineas: LineaFactura[], respaldo?: string | null): string {
  const nombres = lineas
    .map(l => (l.product_name ?? '').trim())
    .filter(Boolean);

  const texto = nombres.length > 0
    ? nombres.slice(0, 8).join(', ') + (nombres.length > 8 ? ` y ${nombres.length - 8} más` : '')
    : (respaldo ?? '').trim() || 'Venta de bienes y servicios';

  // El esquema corta en 500 caracteres. Se recorta aquí y no allí,
  // porque allí sería un rechazo del envío entero.
  return texto.length > 500 ? `${texto.slice(0, 497)}...` : texto;
}

/**
 * El desglose por tipo impositivo.
 *
 * Se parte del desglose agregado de la factura y no de las líneas: dos
 * líneas al 21 % son un solo tramo del 21 %, y mandarlas por separado
 * duplica el tipo. Además el esquema admite 12 tramos como mucho, y las
 * líneas pueden ser cientos.
 */
export function desgloseDeFactura(
  tramos: TramoImpuesto[],
  opciones: {
    igic?: boolean;
    intracomunitaria?: boolean;
    claveRegimen?: string | null;
    exencionPorDefecto?: string;
    calificacionSinCuota?: 'N1' | 'N2';
  } = {},
): DetalleDesglose[] {
  const impuesto = opciones.igic ? '03' : '01';
  const claveRegimen = opciones.claveRegimen?.trim() || '01';
  const exencion = opciones.intracomunitaria
    ? EXENCION_INTRACOMUNITARIA
    : (opciones.exencionPorDefecto || EXENCION_POR_DEFECTO);

  return tramos.map(t => {
    const tipo = numero(t.rate);
    const base = numero(t.base_amount);
    const cuota = numero(t.tax_amount);

    if (tipo === 0) {
      // No sujeta (N1/N2) no es lo mismo que exenta (E1…E6): la
      // plataforma factura a la península sin IGIC por localización.
      if (opciones.calificacionSinCuota) {
        return { impuesto, claveRegimen, calificacionOperacion: opciones.calificacionSinCuota, baseImponible: base };
      }
      // Exenta: ni TipoImpositivo ni CuotaRepercutida. Mandar un 0,00 en
      // esos campos no es lo mismo que no mandarlos, y el esquema los
      // tiene por opcionales justo para este caso.
      return { impuesto, claveRegimen, operacionExenta: exencion, baseImponible: base };
    }

    return {
      impuesto,
      claveRegimen,
      calificacionOperacion: 'S1',
      tipoImpositivo: tipo,
      baseImponible: base,
      cuotaRepercutida: cuota,
    };
  });
}

/** El destinatario, con NIF español o con identificación extranjera. */
export function destinatarioDeFactura(factura: FilaFactura): Persona | null {
  const nombre = (factura.client_name ?? '').trim();
  if (!nombre) return null;

  const nif = (factura.client_nif ?? '').trim();
  if (nif) return { nombreRazon: nombre, nif };

  const vat = (factura.client_vat_number ?? '').trim().toUpperCase();
  if (vat.length > 2) {
    // IDType 02 = NIF-IVA (lista L7).
    return {
      nombreRazon: nombre,
      idOtro: { codigoPais: vat.slice(0, 2), idType: '02', id: vat.slice(2) },
    };
  }

  return null;
}

export interface ContextoAlta {
  registro: FilaRegistro;
  factura: FilaFactura;
  tramos: TramoImpuesto[];
  lineas: LineaFactura[];
  nombreRazonEmisor: string;
  igic?: boolean;
  /** Datos del registro anterior de la cadena, para el encadenamiento. */
  anterior?: { idEmisor: string; numSerie: string; fecha: string } | null;
  exencionPorDefecto?: string;
}

/**
 * Construye el registro de alta que se va a enviar.
 *
 * Los siete campos que entran en la huella (emisor, número, fecha, tipo
 * de factura, cuota, importe y marca de tiempo) se copian del registro
 * guardado, no de la factura. Es lo que se firmó al sellar, y si aquí se
 * recalcularan, cualquier cambio posterior de criterio dejaría la huella
 * sin cuadrar y la AEAT devolvería «aceptado con errores» sin explicar
 * por qué.
 */
export function registroAltaDesdeFila(ctx: ContextoAlta): RegistroAlta {
  const { registro, factura } = ctx;
  const destinatario = destinatarioDeFactura(factura);
  const esRectificativa = (registro.tipo_factura ?? '').startsWith('R');

  return {
    idEmisorFactura: registro.id_emisor,
    numSerieFactura: registro.num_serie,
    fechaExpedicionFactura: registro.fecha_expedicion,
    nombreRazonEmisor: ctx.nombreRazonEmisor,
    tipoFactura: registro.tipo_factura ?? 'F1',
    // «I» (por diferencias) es lo que emite esta aplicación: la
    // rectificativa lleva el importe de la corrección, no el total
    // corregido. Mandar «S» significaría otra cosa.
    tipoRectificativa: esRectificativa ? 'I' : null,
    facturasRectificadas: esRectificativa && factura.documento_origen_number
      ? [{
          idEmisor: registro.id_emisor,
          numSerie: factura.documento_origen_number,
          fecha: factura.issue_date,
        }]
      : undefined,
    descripcionOperacion: descripcionDeOperacion(ctx.lineas, factura.notes),
    // Una simplificada sin destinatario tiene que decirlo. Con
    // destinatario conocido, se manda.
    facturaSinIdentifDestinatarioArt61d:
      registro.tipo_factura === 'F2' && !destinatario ? true : undefined,
    destinatarios: destinatario ? [destinatario] : undefined,
    desglose: desgloseDeFactura(ctx.tramos, {
      igic: ctx.igic,
      intracomunitaria: factura.es_intracomunitaria ?? false,
      claveRegimen: factura.clave_regimen_iva,
      exencionPorDefecto: ctx.exencionPorDefecto,
      calificacionSinCuota: (factura.datos_extras?.calificacionSinCuota ?? factura.datos_extras?.calificacion) as 'N1' | 'N2' | undefined,
    }),
    cuotaTotal: numero(registro.cuota_total),
    importeTotal: numero(registro.importe_total),
    huellaAnterior: registro.huella_anterior,
    idEmisorAnterior: ctx.anterior?.idEmisor ?? null,
    numSerieAnterior: ctx.anterior?.numSerie ?? null,
    fechaExpedicionAnterior: ctx.anterior?.fecha ?? null,
    fechaHoraHusoGenRegistro: registro.fecha_hora_huso,
    huella: registro.huella,
  };
}

export function registroAnulacionDesdeFila(
  registro: FilaRegistro,
  anterior?: { idEmisor: string; numSerie: string; fecha: string } | null,
): RegistroAnulacion {
  return {
    idEmisorFacturaAnulada: registro.id_emisor,
    numSerieFacturaAnulada: registro.num_serie,
    fechaExpedicionFacturaAnulada: registro.fecha_expedicion,
    huellaAnterior: registro.huella_anterior,
    idEmisorAnterior: anterior?.idEmisor ?? null,
    numSerieAnterior: anterior?.numSerie ?? null,
    fechaExpedicionAnterior: anterior?.fecha ?? null,
    fechaHoraHusoGenRegistro: registro.fecha_hora_huso,
    huella: registro.huella,
  };
}

/**
 * Lo que hay que tener puesto para poder enviar.
 *
 * Se comprueba ANTES de abrir la conexión, por una razón práctica: la
 * AEAT rechaza el envío entero si una sola línea está mal, así que una
 * factura sin NIF del cliente tumbaría también a las noventa y nueve que
 * iban bien.
 */
export function problemasDelRegistro(
  registro: FilaRegistro,
  factura: FilaFactura | null,
): string[] {
  const problemas: string[] = [];

  if (!registro.id_emisor?.trim()) {
    problemas.push('La factura no tiene NIF del emisor. Rellena el NIF de tu empresa en Ajustes.');
  }
  if (!/^[0-9A-F]{64}$/.test(registro.huella ?? '')) {
    problemas.push('La huella del registro no tiene el formato oficial.');
  }
  if (registro.tipo_registro === 'alta') {
    if (!factura) {
      problemas.push('No se encuentra la factura de este registro.');
    } else if (registro.tipo_factura !== 'F2' && !destinatarioDeFactura(factura)) {
      problemas.push(
        `La factura ${registro.num_serie} es completa (${registro.tipo_factura}) y no tiene identificado al cliente. Ponle NIF, o emítela como simplificada.`,
      );
    }
  }

  try {
    fechaAeat(registro.fecha_expedicion);
  } catch {
    problemas.push(`La fecha de expedición de ${registro.num_serie} no es válida.`);
  }

  return problemas;
}

/** Identifica el programa ante la AEAT. */
export interface ConfigSistema {
  productor_nombre: string | null;
  productor_nif: string | null;
  nombre_sistema: string;
  id_sistema: string;
  version_sistema: string;
  numero_instalacion: string | null;
}

/**
 * El bloque SistemaInformatico.
 *
 * Identifica a QUIEN PRODUCE el software, no a quien lo usa. Es la
 * confusión más habitual y tiene consecuencias: ese NIF es el de la
 * empresa que responde del programa ante la Agencia. Si el programa es
 * de desarrollo propio, coincide con el del obligado; si es un programa
 * comprado, es el del fabricante. Por eso no se rellena solo con el NIF
 * del usuario: hay que preguntarlo, y mientras no esté, esto lanza en
 * vez de inventarse un NIF.
 */
export function sistemaInformaticoDe(
  config: ConfigSistema,
  userId: string,
): SistemaInformatico {
  const nombre = config.productor_nombre?.trim();
  const nif = config.productor_nif?.trim();

  if (!nombre || !nif) {
    throw new Error(
      'Falta identificar al productor del software (nombre y NIF) en los ajustes de Veri*Factu. La AEAT lo exige en cada registro y no es un dato que se pueda deducir: si el programa es tuyo, pon tus datos; si lo has contratado, los de quien te lo vende.',
    );
  }

  return {
    nombreRazon: nombre,
    nif,
    nombreSistemaInformatico: (config.nombre_sistema || 'Klima').slice(0, 30),
    idSistemaInformatico: (config.id_sistema || '01').slice(0, 2),
    version: (config.version_sistema || '1.0').slice(0, 50),
    numeroInstalacion: (config.numero_instalacion || userId).slice(0, 100),
    // Este sistema sólo sabe funcionar remitiendo a la AEAT: no
    // implementa el modo con firma y conservación local.
    tipoUsoPosibleSoloVerifactu: 'S',
    // Es un programa multiempresa y una misma instalación atiende a
    // varios obligados tributarios.
    tipoUsoPosibleMultiOT: 'S',
    indicadorMultiplesOT: 'S',
  };
}
