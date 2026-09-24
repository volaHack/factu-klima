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
export type MotivoFalloIA = 'sin-configurar' | 'sin-contacto' | 'rechazado' | 'vacio' | 'sin-cuota';

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
  /**
   * Imágenes que acompañan al enunciado (una foto de un ticket, por
   * ejemplo). Hace falta un modelo que vea: con Gemini vale el de siempre;
   * con un servidor compatible con OpenAI, el de `IA_MODELO_VISION`.
   */
  imagenes?: { mime: string; base64: string }[];
  /** Otro modelo del mismo proveedor para esta petición. */
  modelo?: string;
}

/**
 * El modelo para peticiones con imagen. Gemini ve con el modelo normal;
 * los modelos de texto de un servidor local no, así que ahí se usa
 * `IA_MODELO_VISION` si está puesto.
 */
export function modeloVision(config: ConfiguracionIA): string {
  const vision = (process.env.IA_MODELO_VISION ?? '').trim();
  return vision || config.modelo;
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
export function cuerpoOpenAI(config: ConfiguracionIA, p: PeticionIA) {
  const contenido = p.imagenes?.length
    ? [
      { type: 'text', text: p.instrucciones },
      ...p.imagenes.map(i => ({ type: 'image_url', image_url: { url: `data:${i.mime};base64,${i.base64}` } })),
    ]
    : p.instrucciones;
  return {
    model: p.modelo ?? config.modelo,
    messages: [{ role: 'user', content: contenido }],
    temperature: p.temperatura ?? 0.2,
    max_tokens: p.maximoTokens ?? 1024,
    stream: false,
    // SIN RAZONAR EN VOZ ALTA
    //
    // Los Qwen actuales piensan antes de contestar si no se les dice lo
    // contrario, y ese pensamiento sale del mismo cupo que la respuesta.
    // Medido con qwen/qwen3.8-27b en OpenRouter y una pregunta de la
    // Asistencia: 81 s, los 2.000 tokens gastados en pensar y la respuesta
    // VACÍA, que el usuario habría visto como «no ha podido responder» en
    // todas las preguntas. Con esto apagado: 3,7 s, la respuesta buena y
    // quince veces más barata.
    //
    // Todo lo que se le pide aquí son tres frases con datos que ya van en
    // el enunciado: no hay nada que razonar. Los servidores que no conocen
    // el campo lo ignoran —comprobado con llama.cpp—, así que va siempre.
    reasoning: { enabled: false },
    // RESERVA EN OPENROUTER
    //
    // Si el modelo elegido está caído o saturado, OpenRouter pasa solo al
    // siguiente de la lista dentro de la MISMA petición, sin reintentos
    // nuestros ni segundos de espera para quien pregunta.
    ...(/openrouter\.ai/.test(config.baseUrl)
      ? { models: [...new Set([p.modelo ?? config.modelo, MODELO_RESERVA_OPENROUTER])] }
      : {}),
    ...(p.json ? { response_format: { type: 'json_object' } } : {}),
  };
}

/** A quién se pasa OpenRouter si el modelo principal no responde. */
export const MODELO_RESERVA_OPENROUTER = 'google/gemini-3.5-flash-lite';

function cuerpoGemini(p: PeticionIA) {
  return {
    contents: [{
      parts: [
        { text: p.instrucciones },
        ...(p.imagenes ?? []).map(i => ({ inline_data: { mime_type: i.mime, data: i.base64 } })),
      ],
    }],
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

/**
 * ¿ESTE 429 ES «VAS DEPRISA» O ES «SE TE ACABÓ EL CUPO»?
 *
 * No es lo mismo y no se arreglan igual. Una ráfaga se despeja sola en
 * un segundo y repetir la resuelve. Un cupo agotado no: repetir sólo
 * gasta más deprisa lo que queda, y el usuario se come la espera de tres
 * intentos para acabar en el mismo error.
 *
 * Los proveedores lo dicen en el cuerpo, y además suelen decir cuánto
 * hay que esperar. Si lo que piden es más de lo que estamos dispuestos a
 * esperar, se deja de insistir y se dice la verdad: no es que falle, es
 * que se ha agotado el cupo.
 */
export function esCuotaAgotada(detalle: string): boolean {
  const texto = detalle.toLowerCase();
  if (/resource_exhausted|quota|insufficient_quota|billing/.test(texto)) return true;
  // «Please retry in 28.6s»: si hay que esperar más que nuestras esperas
  // juntas, insistir es tirar el tiempo del usuario.
  const espera = /retry in (\d+(?:\.\d+)?)s/.exec(texto);
  if (espera) {
    const totalQueEsperamos = ESPERAS_ENTRE_INTENTOS_MS.reduce((a, b) => a + b, 0) / 1000;
    return Number(espera[1]) > totalQueEsperamos;
  }
  return false;
}

/**
 * Lo que se espera antes de cada reintento, en milisegundos.
 *
 * Creciente y corta: un 503 de «high demand» rara vez se despeja en un
 * segundo, pero tampoco se puede tener a alguien esperando medio minuto
 * por si acaso. Con estas dos esperas, el peor caso añade 4,2 s.
 */
export const ESPERAS_ENTRE_INTENTOS_MS = [1_200, 3_000];

/** El texto que venga, del proveedor que sea, ya limpio. */
export async function generarTexto(p: PeticionIA): Promise<string> {
  const config = configuracionIA();
  if (!config) throw new FalloIA('sin-configurar');

  const esGemini = config.proveedor === 'gemini';
  const url = esGemini
    ? `${config.baseUrl}/${p.modelo ?? config.modelo}:generateContent?key=${config.clave}`
    : `${config.baseUrl}/chat/completions`;

  // VARIOS INTENTOS, NO UNO
  //
  // Probando el reconocedor de plantillas contra Gemini salió un 503
  // «This model is currently experiencing high demand», y al usuario le
  // llegó como «el servicio no ha podido responder». Al repetir la misma
  // petición, acertó los cinco recuadros. Un fallo pasajero del proveedor
  // no debería gastarle el intento a quien está subiendo una plantilla.
  //
  // Tres y no más: si el proveedor sigue saturado al tercer intento,
  // insistir sólo alarga la espera de alguien que ya lleva demasiado.
  let ultimoFallo: FalloIA | null = null;
  const intentos = ESPERAS_ENTRE_INTENTOS_MS.length + 1;

  for (let intento = 1; intento <= intentos; intento++) {
    if (intento > 1) {
      await new Promise(listo => setTimeout(listo, ESPERAS_ENTRE_INTENTOS_MS[intento - 2]));
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
      // SE ACABÓ EL TIEMPO NO ES LO MISMO QUE NO HAY NADIE
      //
      // Esto no reintentaba ningún fallo de conexión, con el argumento de
      // que si el servidor no está escuchando no va a estarlo un segundo
      // después. Vale para una conexión rechazada; no vale para un tiempo
      // agotado. Un servicio alojado que va cargado acepta la conexión y
      // se queda pensando: medido contra Gemini, la MISMA llamada tardó
      // 4,6 s una vez y 28 s la siguiente. Ahí repetir sí sirve, y no
      // hacerlo le enseñaba al usuario «no se ha podido contactar» cuando
      // lo único que pasaba es que el otro lado iba lento.
      const seAcaboElTiempo = err instanceof Error
        && (err.name === 'TimeoutError' || err.name === 'AbortError');
      const fallo = new FalloIA('sin-contacto', err instanceof Error ? err.message : String(err));
      if (seAcaboElTiempo && intento < intentos) {
        ultimoFallo = fallo;
        continue;
      }
      throw fallo;
    }

    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => '');
      if (respuesta.status === 429 && esCuotaAgotada(detalle)) {
        throw new FalloIA('sin-cuota', `429 ${detalle.slice(0, 500)}`);
      }
      ultimoFallo = new FalloIA('rechazado', `${respuesta.status} ${detalle.slice(0, 500)}`);
      if (intento < intentos && mereceOtroIntento(respuesta.status)) continue;
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
    case 'sin-cuota':
      // Ni 502 ni 501: no falla nada y no falta configurarlo. Se ha
      // gastado el cupo, y quien lo lea tiene que entender que esperar
      // —o ampliar el plan— es la salida, no volver a pulsar.
      return {
        estado: 429,
        error: `El servicio de IA ha agotado su cupo de uso. Vuelve a intentarlo dentro de un rato. ${contexto}`,
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
