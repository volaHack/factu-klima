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
 *   2. Si no hay nada, se dice claramente que no está configurada. Mejor
 *      eso que inventarse respuestas.
 *
 * Aquí había además una rama para Gemini, con su URL, su formato de
 * petición, su formato de respuesta y su esquema. Se ha quitado por
 * decisión de la titular: el modelo es Qwen. Quitarla no cierra ninguna
 * puerta —cualquier servicio que hable el dialecto de OpenAI entra por
 * `IA_BASE_URL` sin tocar código— y quita de en medio el único proveedor
 * que necesitaba un camino propio.
 *
 * OJO CON DÓNDE CORRE CADA COSA
 * -----------------------------
 * Un modelo local sirve a quien pueda abrir esa dirección. En el portátil
 * del que desarrolla, perfecto. En la web publicada, el servidor de Vercel
 * NO puede llegar a un modelo que corre en una casa: para producción hay
 * que apuntar `IA_BASE_URL` a un servidor accesible desde internet que
 * sirva el mismo Qwen. Mientras no lo haya, la ayuda con IA dirá que no
 * está configurada, que es la verdad.
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

export interface ConfiguracionIA {
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

  if (!baseUrl && !modelo) return null;

  return {
    baseUrl: (baseUrl || IA_LOCAL_POR_DEFECTO).replace(/\/+$/, ''),
    modelo: modelo || MODELO_POR_DEFECTO,
    // Un servidor local no pide clave; uno alojado sí. Vacía si no hace falta.
    clave: (process.env.IA_API_KEY ?? '').trim() || undefined,
  };
}

export interface PeticionIA {
  /** Todo el enunciado: papel, reglas y pregunta. */
  instrucciones: string;
  /** 0 = siempre la misma respuesta. Por defecto, casi nada de invención. */
  temperatura?: number;
  maximoTokens?: number;
  /** Exigir que la respuesta sea un objeto JSON. */
  json?: boolean;
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

/** El texto que conteste el modelo, ya limpio. */
export async function generarTexto(p: PeticionIA): Promise<string> {
  const config = configuracionIA();
  if (!config) throw new FalloIA('sin-configurar');

  let respuesta: Response;
  try {
    respuesta = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.clave ? { Authorization: `Bearer ${config.clave}` } : {}),
      },
      body: JSON.stringify(cuerpoOpenAI(config, p)),
      signal: AbortSignal.timeout(p.tiempoLimiteMs ?? 20_000),
    });
  } catch (err) {
    throw new FalloIA('sin-contacto', err instanceof Error ? err.message : String(err));
  }

  if (!respuesta.ok) {
    const detalle = await respuesta.text().catch(() => '');
    throw new FalloIA('rechazado', `${respuesta.status} ${detalle.slice(0, 500)}`);
  }

  let datos: unknown;
  try {
    datos = await respuesta.json();
  } catch {
    throw new FalloIA('vacio', 'la respuesta no era JSON');
  }

  const texto = limpiarRespuesta(extraerTexto(datos));
  if (!texto) throw new FalloIA('vacio');
  return texto;
}

/** La forma de la respuesta, sólo en lo que nos interesa. */
interface RespuestaModelo {
  choices?: { message?: { content?: unknown } }[];
}

/** Dónde viene el texto en una respuesta con el formato de OpenAI. */
export function extraerTexto(datos: unknown): string {
  const d = (datos ?? {}) as RespuestaModelo;
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
