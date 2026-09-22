/**
 * DE DÓNDE SALE LA IA DEL PROGRAMA
 *
 * Había dos sitios llamando a Gemini con la URL y el modelo escritos a
 * fuego. Eso tenía dos consecuencias malas a la vez: sin una clave de
 * Google la ayuda contestaba «no está configurada en este servidor» y no
 * había forma de darle otra cosa; y cambiar de modelo obligaba a tocar
 * dos ficheros y acordarse de los dos.
 *
 * Aquí se decide una sola vez, y se habla el dialecto de OpenAI —
 * `/chat/completions`— porque es el que entienden Ollama, LM Studio,
 * llama.cpp, vLLM y prácticamente cualquier servidor de modelos, local o
 * de pago. Así el mismo código sirve para un modelo en el portátil y para
 * uno alojado, y cambiar de uno a otro son dos variables de entorno.
 *
 * CÓMO SE ELIGE
 * -------------
 *   1. Si hay `IA_BASE_URL` o `IA_MODELO`, se usa ese servidor. Sin nada
 *      más puesto, el destino es el servidor local de esta misma máquina.
 *   2. Si no, y hay `GEMINI_API_KEY`, se sigue usando Gemini como antes.
 *   3. Si no hay nada, se dice claramente que no está configurada, que es
 *      lo que ya hacía y está bien: mejor eso que inventarse respuestas.
 *
 * OJO CON DÓNDE CORRE CADA COSA
 * -----------------------------
 * Un modelo local sirve a quien pueda abrir esa dirección. En el portátil
 * del que desarrolla, perfecto. En la web publicada, el servidor de Vercel
 * NO puede llegar a un modelo que corre en una casa: para producción hay
 * que apuntar `IA_BASE_URL` a algo accesible desde internet, o dejar la
 * clave de Gemini.
 */

/** Dónde escucha el servidor de modelos local (llama.cpp) por defecto. */
export const IA_LOCAL_POR_DEFECTO = 'http://127.0.0.1:8080/v1';

/**
 * El modelo que se usa si no se dice otro: Qwen 3 4B Instruct.
 *
 * Pequeño a propósito: todo lo que se le pide son respuestas de tres
 * frases y clasificaciones de etiquetas, no redactar informes. Un 4B
 * actual hace eso bien, cabe en 2,4 GB —entra entero en una gráfica de 4
 * GB— y responde en un par de segundos.
 *
 * La variante «Instruct-2507» importa: el Qwen 3 original razona en voz
 * alta antes de contestar, y aquí ese discurso interno sólo es latencia y
 * respuestas cortadas a media frase porque el cupo se gastó pensando.
 */
export const MODELO_POR_DEFECTO = 'qwen3-4b-instruct';

export type Proveedor = 'local' | 'gemini';

export interface ConfiguracionIA {
  proveedor: Proveedor;
  baseUrl: string;
  modelo: string;
  clave?: string;
}

/** Por qué no se ha podido responder. Cada motivo tiene su código HTTP. */
export type MotivoFalloIA = 'sin-configurar' | 'sin-contacto' | 'rechazado' | 'vacio';

export class FalloIA extends Error {
  constructor(
    readonly motivo: MotivoFalloIA,
    /** Lo que se apunta en el registro, que puede llevar detalles internos. */
    readonly detalle?: string,
  ) {
    super(detalle ?? motivo);
    this.name = 'FalloIA';
  }
}

/** Qué servidor de modelos hay configurado, si hay alguno. */
export function configuracionIA(): ConfiguracionIA | null {
  const baseUrl = (process.env.IA_BASE_URL ?? '').trim();
  const modelo = (process.env.IA_MODELO ?? '').trim();

  if (baseUrl || modelo) {
    return {
      proveedor: 'local',
      baseUrl: (baseUrl || IA_LOCAL_POR_DEFECTO).replace(/\/+$/, ''),
      modelo: modelo || MODELO_POR_DEFECTO,
      // Un servidor local no pide clave; uno de pago sí. Vacía si no hace falta.
      clave: (process.env.IA_API_KEY ?? '').trim() || undefined,
    };
  }

  const claveGemini = (process.env.GEMINI_API_KEY ?? '').trim();
  if (claveGemini) {
    return {
      proveedor: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
      modelo: (process.env.GEMINI_MODELO ?? '').trim() || 'gemini-3.6-flash',
      clave: claveGemini,
    };
  }

  return null;
}

export interface PeticionIA {
  /** Todo el enunciado: papel, reglas y pregunta. */
  instrucciones: string;
  /** 0 = siempre la misma respuesta. Por defecto, casi nada de invención. */
  temperatura?: number;
  maximoTokens?: number;
  /** Exigir que la respuesta sea un objeto JSON. */
  json?: boolean;
  /**
   * Esquema de la respuesta, para los proveedores que sepan imponerlo.
   *
   * Gemini lo cumple palabra por palabra. Los servidores locales no
   * siempre, así que quien lo use debe describir el formato TAMBIÉN en el
   * enunciado y seguir filtrando lo que llegue: un esquema que el
   * proveedor ignora en silencio es peor que no tenerlo, porque invita a
   * fiarse de la forma de la respuesta.
   */
  esquemaJson?: unknown;
  tiempoLimiteMs?: number;
}

/**
 * QUITAR EL RUIDO QUE AÑADEN LOS MODELOS PEQUEÑOS
 *
 * Dos vicios muy repetidos, y los dos rompen a quien espera JSON:
 *
 *  - Los modelos de razonamiento escupen su discurso interno entre
 *    `<think>` y `</think>` antes de contestar.
 *  - Casi todos envuelven el JSON en un bloque de código markdown,
 *    incluso cuando se les ha pedido JSON a secas.
 *
 * Se limpia aquí y no en cada sitio que llama, porque olvidarse en uno
 * sólo se nota el día que alguien cambia de modelo.
 */
export function limpiarRespuesta(texto: string): string {
  return texto
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    // Un `<think>` sin cerrar significa que se acabó el cupo pensando:
    // lo que venga detrás no es respuesta, es discurso a medias.
    .replace(/<think>[\s\S]*$/i, '')
    .replace(/^\s*```(?:json|javascript|js)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
}

/** El cuerpo que espera un servidor que hable como OpenAI. */
function cuerpoOpenAI(config: ConfiguracionIA, p: PeticionIA) {
  return {
    model: config.modelo,
    messages: [{ role: 'user', content: p.instrucciones }],
    temperature: p.temperatura ?? 0.2,
    max_tokens: p.maximoTokens ?? 1024,
    stream: false,
    ...(p.json ? { response_format: { type: 'json_object' } } : {}),
  };
}

function cuerpoGemini(p: PeticionIA) {
  return {
    contents: [{ parts: [{ text: p.instrucciones }] }],
    generationConfig: {
      temperature: p.temperatura ?? 0.2,
      // El presupuesto de Gemini incluye lo que el modelo piensa, no sólo
      // lo que escribe: con el tope justo la respuesta sale cortada a
      // media frase. Se le da holgura, que se paga por lo gastado.
      maxOutputTokens: Math.max(p.maximoTokens ?? 1024, 2048),
      ...(p.json ? { responseMimeType: 'application/json' } : {}),
      ...(p.esquemaJson ? { responseSchema: p.esquemaJson } : {}),
    },
  };
}

/**
 * «Vuelve a intentarlo», dicho con un número.
 *
 * Son los estados en los que el proveedor está diciendo que el problema
 * es suyo y pasajero: va saturado (429, 503) o se le ha caído algo por
 * dentro (500, 502, 504). Reintentar tiene sentido.
 *
 * Un 400 o un 401 NO están aquí a propósito: significan que la petición
 * está mal o que la clave no vale, y repetirla da exactamente el mismo
 * error, dos veces más lento.
 */
const ESTADOS_QUE_MERECEN_OTRO_INTENTO = new Set([429, 500, 502, 503, 504]);

export function mereceOtroIntento(estado: number): boolean {
  return ESTADOS_QUE_MERECEN_OTRO_INTENTO.has(estado);
}

/** Lo que se espera antes de repetir. Corto: hay alguien esperando. */
export const ESPERA_ENTRE_INTENTOS_MS = 1_200;

/** El texto que venga, del proveedor que sea, ya limpio. */
export async function generarTexto(p: PeticionIA): Promise<string> {
  const config = configuracionIA();
  if (!config) throw new FalloIA('sin-configurar');

  const esGemini = config.proveedor === 'gemini';
  const url = esGemini
    ? `${config.baseUrl}/${config.modelo}:generateContent?key=${config.clave}`
    : `${config.baseUrl}/chat/completions`;

  // DOS INTENTOS, NO UNO
  //
  // Probando el reconocedor de plantillas contra Gemini salió un 503
  // «This model is currently experiencing high demand», y al usuario le
  // llegó como «el servicio no ha podido responder». Al repetir la misma
  // petición, acertó los cinco recuadros. Un fallo pasajero del proveedor
  // no debería gastarle el intento a quien está subiendo una plantilla.
  //
  // Dos y no más: si el proveedor sigue saturado, insistir sólo alarga la
  // espera de alguien que tiene un cliente delante.
  let ultimoFallo: FalloIA | null = null;

  for (let intento = 1; intento <= 2; intento++) {
    if (intento > 1) {
      await new Promise(listo => setTimeout(listo, ESPERA_ENTRE_INTENTOS_MS));
    }

    let respuesta: Response;
    try {
      respuesta = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.clave && !esGemini ? { Authorization: `Bearer ${config.clave}` } : {}),
        },
        body: JSON.stringify(esGemini ? cuerpoGemini(p) : cuerpoOpenAI(config, p)),
        signal: AbortSignal.timeout(p.tiempoLimiteMs ?? 20_000),
      });
    } catch (err) {
      // No se reintenta: si el servidor no está escuchando, no va a estar
      // escuchando un segundo después, y la espera ya ha sido larga.
      throw new FalloIA('sin-contacto', err instanceof Error ? err.message : String(err));
    }

    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => '');
      ultimoFallo = new FalloIA('rechazado', `${respuesta.status} ${detalle.slice(0, 500)}`);
      if (intento === 1 && mereceOtroIntento(respuesta.status)) continue;
      throw ultimoFallo;
    }

    let datos: unknown;
    try {
      datos = await respuesta.json();
    } catch {
      throw new FalloIA('vacio', 'la respuesta no era JSON');
    }

    const texto = limpiarRespuesta(extraerTexto(datos, config.proveedor));
    if (!texto) throw new FalloIA('vacio');
    return texto;
  }

  throw ultimoFallo ?? new FalloIA('vacio');
}

/** La forma de la respuesta de cada proveedor, sólo en lo que nos interesa. */
interface RespuestaProveedor {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  choices?: { message?: { content?: unknown } }[];
}

/** Cada proveedor esconde el texto en un sitio distinto. */
export function extraerTexto(datos: unknown, proveedor: Proveedor): string {
  const d = (datos ?? {}) as RespuestaProveedor;
  if (proveedor === 'gemini') {
    return (d.candidates?.[0]?.content?.parts ?? [])
      .map(parte => parte?.text ?? '')
      .join('');
  }
  const mensaje = d.choices?.[0]?.message;
  // Algunos servidores devuelven el razonamiento aparte y dejan `content`
  // vacío; en ese caso no hay respuesta que dar, y decirlo es mejor que
  // entregar el razonamiento como si fuera la respuesta.
  return typeof mensaje?.content === 'string' ? mensaje.content : '';
}

/** El código HTTP y el aviso que le toca a cada fallo. */
export function respuestaDeFallo(fallo: FalloIA, contexto: string): {
  estado: number;
  error: string;
} {
  switch (fallo.motivo) {
    case 'sin-configurar':
      return {
        estado: 501,
        error: 'La ayuda con IA no está configurada en este servidor.',
      };
    case 'sin-contacto':
      return {
        estado: 502,
        error: `No se ha podido contactar con el servicio de IA. ${contexto}`,
      };
    default:
      return {
        estado: 502,
        error: `El servicio de IA no ha podido responder. ${contexto}`,
      };
  }
}
