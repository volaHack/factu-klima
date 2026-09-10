/**
 * LO QUE CONTESTA LA AGENCIA TRIBUTARIA
 *
 * Fuente: RespuestaSuministro.xsd, del WSDL oficial del servicio.
 *
 * La respuesta tiene dos niveles y confundirlos es el error caro:
 *
 *   - EstadoEnvio, para el lote entero: «Correcto»,
 *     «ParcialmenteCorrecto» o «Incorrecto».
 *   - EstadoRegistro, para cada factura: «Correcto», «AceptadoConErrores»
 *     o «Incorrecto».
 *
 * Un envío «ParcialmenteCorrecto» significa que unas facturas entraron y
 * otras no. Marcarlas todas igual —en cualquiera de los dos sentidos—
 * deja al usuario o bien tranquilo con facturas sin presentar, o bien
 * reenviando facturas que la AEAT ya tiene, que es como se generan los
 * duplicados. Por eso aquí cada línea se lee por separado.
 *
 * Y una distinción que la aplicación tiene que respetar: «Aceptado con
 * errores» NO es un fallo que se reintente. La AEAT lo ha registrado y
 * avisa de algo (típicamente, que la huella que mandamos no cuadra con
 * la que ella calcula). Reenviarlo sólo produce un duplicado.
 *
 * Se lee con expresiones regulares y no con un analizador XML porque el
 * esquema es pequeño, fijo y conocido, y meter una dependencia nueva en
 * el servidor para leer seis etiquetas no compensa. Lo que sí se hace es
 * ignorar el prefijo de espacio de nombres: la AEAT no promete cuál usa,
 * y dar por hecho que será «sfR:» es la clase de suposición que funciona
 * en pruebas y falla en producción.
 */

export type EstadoEnvio = 'Correcto' | 'ParcialmenteCorrecto' | 'Incorrecto';
export type EstadoRegistro = 'Correcto' | 'AceptadoConErrores' | 'Incorrecto';

export interface LineaRespuesta {
  idEmisorFactura: string;
  numSerieFactura: string;
  fechaExpedicionFactura: string;
  /** «Alta» o «Anulacion», según lo que se mandó. */
  operacion: string;
  estado: EstadoRegistro;
  codigoError: string | null;
  descripcionError: string | null;
}

export interface RespuestaAeat {
  /** Código Seguro de Verificación del envío. Sólo si no hubo rechazo. */
  csv: string | null;
  estadoEnvio: EstadoEnvio | null;
  nifPresentador: string | null;
  timestampPresentacion: string | null;
  /** Segundos que pide esperar antes del siguiente envío. */
  tiempoEsperaEnvio: number | null;
  lineas: LineaRespuesta[];
  /** Si la AEAT devolvió un soap:Fault en vez de una respuesta. */
  fallo: { codigo: string; mensaje: string } | null;
}

/**
 * Busca un elemento por su nombre local, sea cual sea el prefijo.
 *
 * `(?:\w+:)?` cubre tanto «<CSV>» como «<sfR:CSV>» o «<ns2:CSV>».
 */
function extraer(xml: string, nombre: string): string | null {
  const re = new RegExp(`<(?:[\\w.-]+:)?${nombre}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${nombre}>`);
  const m = re.exec(xml);
  return m ? desescapar(m[1].trim()) : null;
}

function extraerTodos(xml: string, nombre: string): string[] {
  const re = new RegExp(`<(?:[\\w.-]+:)?${nombre}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${nombre}>`, 'g');
  const salida: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) salida.push(m[1]);
  return salida;
}

function desescapar(texto: string): string {
  return texto
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');
}

const ESTADOS_ENVIO: EstadoEnvio[] = ['Correcto', 'ParcialmenteCorrecto', 'Incorrecto'];
const ESTADOS_REGISTRO: EstadoRegistro[] = ['Correcto', 'AceptadoConErrores', 'Incorrecto'];

export function parsearRespuestaAeat(xml: string): RespuestaAeat {
  // Un soap:Fault llega con estructura distinta y NO trae ningún estado.
  // Tratarlo como respuesta vacía dejaría los registros «sin resultado»
  // en silencio; leerlo aquí permite enseñar el motivo real.
  const cuerpoFallo = extraerTodos(xml, 'Fault')[0];
  if (cuerpoFallo !== undefined) {
    return {
      csv: null, estadoEnvio: null, nifPresentador: null,
      timestampPresentacion: null, tiempoEsperaEnvio: null, lineas: [],
      fallo: {
        codigo: extraer(cuerpoFallo, 'faultcode') ?? extraer(cuerpoFallo, 'Code') ?? 'SOAP-Fault',
        mensaje: extraer(cuerpoFallo, 'faultstring') ?? extraer(cuerpoFallo, 'Reason')
          ?? 'La AEAT ha devuelto un error SOAP sin descripción.',
      },
    };
  }

  const estadoBruto = extraer(xml, 'EstadoEnvio');
  const espera = extraer(xml, 'TiempoEsperaEnvio');

  const lineas: LineaRespuesta[] = extraerTodos(xml, 'RespuestaLinea').map(bloque => {
    const estadoLinea = extraer(bloque, 'EstadoRegistro');
    return {
      idEmisorFactura: extraer(bloque, 'IDEmisorFactura') ?? '',
      numSerieFactura: extraer(bloque, 'NumSerieFactura') ?? '',
      fechaExpedicionFactura: extraer(bloque, 'FechaExpedicionFactura') ?? '',
      operacion: extraer(bloque, 'TipoOperacion') ?? extraer(bloque, 'Operacion') ?? '',
      // Un estado que no esté en el esquema se trata como incorrecto: es
      // preferible que el usuario reintente algo que ya entró (y reciba
      // un aviso de duplicado) a darlo por presentado sin saberlo.
      estado: ESTADOS_REGISTRO.includes(estadoLinea as EstadoRegistro)
        ? (estadoLinea as EstadoRegistro)
        : 'Incorrecto',
      codigoError: extraer(bloque, 'CodigoErrorRegistro'),
      descripcionError: extraer(bloque, 'DescripcionErrorRegistro'),
    };
  });

  return {
    csv: extraer(xml, 'CSV'),
    estadoEnvio: ESTADOS_ENVIO.includes(estadoBruto as EstadoEnvio)
      ? (estadoBruto as EstadoEnvio)
      : null,
    nifPresentador: extraer(xml, 'NIFPresentador'),
    timestampPresentacion: extraer(xml, 'TimestampPresentacion'),
    tiempoEsperaEnvio: espera !== null && espera !== '' && Number.isFinite(Number(espera))
      ? Number(espera)
      : null,
    lineas,
    fallo: null,
  };
}

/** El estado con el que se guarda un registro tras conocer la respuesta. */
export type EstadoLocal =
  | 'aceptado' | 'aceptado_con_errores' | 'rechazado' | 'error_envio';

/**
 * Traduce el estado de la AEAT al estado que guardamos.
 *
 * «Correcto» y «AceptadoConErrores» son ambos definitivos: la factura
 * está presentada y volver a mandarla sería un duplicado. Sólo
 * «Incorrecto» vuelve a la cola.
 */
export function estadoLocalDe(estado: EstadoRegistro): EstadoLocal {
  switch (estado) {
    case 'Correcto': return 'aceptado';
    case 'AceptadoConErrores': return 'aceptado_con_errores';
    default: return 'rechazado';
  }
}

/** Un resumen en castellano para enseñárselo al usuario. */
export function resumirRespuesta(r: RespuestaAeat): string {
  if (r.fallo) return `La AEAT ha devuelto un error: ${r.fallo.mensaje}`;

  const aceptadas = r.lineas.filter(l => l.estado === 'Correcto').length;
  const conErrores = r.lineas.filter(l => l.estado === 'AceptadoConErrores').length;
  const rechazadas = r.lineas.filter(l => l.estado === 'Incorrecto').length;

  const partes: string[] = [];
  if (aceptadas) partes.push(`${aceptadas} ${aceptadas === 1 ? 'aceptada' : 'aceptadas'}`);
  if (conErrores) partes.push(`${conErrores} ${conErrores === 1 ? 'aceptada con avisos' : 'aceptadas con avisos'}`);
  if (rechazadas) partes.push(`${rechazadas} ${rechazadas === 1 ? 'rechazada' : 'rechazadas'}`);

  if (partes.length === 0) return 'La AEAT no ha devuelto ninguna línea de respuesta.';
  return partes.join(', ');
}
