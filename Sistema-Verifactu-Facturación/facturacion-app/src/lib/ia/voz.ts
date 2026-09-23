/**
 * PASAR UNA NOTA DE VOZ A TEXTO EN EL SERVIDOR
 *
 * El dictado del navegador (`lib/asistencia/dictado.ts`) es lo primero
 * que se usa: es instantáneo y gratis. Pero no está en todas partes.
 * Firefox no lo trae, y Brave, Opera y las aplicaciones de escritorio
 * hechas con Chromium SÍ tienen el objeto pero fallan con «network» al
 * primer intento, porque el reconocimiento de Chrome lo hacen los
 * servidores de Google y sólo Chrome y Edge tienen permiso para usarlos.
 * En todos esos casos el micrófono «no hacía nada».
 *
 * Así que la pantalla graba SIEMPRE el audio, y si el navegador no ha
 * sabido transcribirlo, lo manda aquí. Se usa un modelo que entiende
 * audio a través de la misma API de chat (`input_audio`), en WAV porque
 * es el formato que aceptan todos: el WebM que graba Chrome no está en la
 * lista de OpenRouter.
 *
 * DE DÓNDE SALE EL MODELO
 * -----------------------
 *   1. `IA_VOZ_MODELO` (+ `IA_VOZ_BASE_URL` y `IA_VOZ_API_KEY` si es otro
 *      servidor): lo que se diga.
 *   2. Si la IA principal es OpenRouter, el mismo servidor y la misma
 *      clave con los modelos de MODELOS_VOZ_OPENROUTER (el Qwen 3.8 de
 *      texto no oye).
 *   3. Si hay `GEMINI_API_KEY`, Gemini por su puerta compatible con
 *      OpenAI.
 *   4. Nada: se dice que no está disponible y la pantalla pide escribir.
 *
 * El Qwen local no oye, y un segundo modelo local sólo para esto serían
 * gigas de descarga y otro proceso más arrancado: en local el dictado lo
 * hace el navegador (Chrome o Edge), que funciona sin nada de esto.
 */

import {
  ESPERAS_ENTRE_INTENTOS_MS, FalloIA, esCuotaAgotada, limpiarRespuesta, mereceOtroIntento,
} from './cliente';

export interface ConfiguracionVoz {
  baseUrl: string;
  /** El primero que se prueba. */
  modelo: string;
  /** Todos, en orden: si uno falla, se pasa al siguiente. */
  modelos?: string[];
  clave?: string;
  esOpenRouter: boolean;
}

/**
 * LOS MODELOS QUE TRANSCRIBEN EN OPENROUTER, EN ORDEN
 *
 * Empezó con Qwen 3.8 Omni y en producción no transcribió ni una nota. En
 * la ficha pública de OpenRouter ese modelo acepta audio pero no tiene
 * precio de audio, y los Qwen-Omni de su proveedor (Alibaba) sólo
 * contestan en modo streaming: una petición normal falla. Tampoco la
 * rescataba la reserva de OpenRouter (`models`), que no salta con un
 * error de petición inválida.
 *
 * Así que van dos modelos cuya ficha SÍ cobra el audio —es decir, que lo
 * transcriben de verdad por esta vía—, y el paso de uno a otro lo hace
 * este código, no OpenRouter:
 *   1. Gemini 3.5 Flash Lite: barato (0,30 $ por millón de tokens de
 *      audio; una nota de 15 s son unos 500) y bueno en castellano.
 *   2. GPT Audio Mini, de OpenAI: otro proveedor distinto, por si Google
 *      falla.
 */
export const MODELOS_VOZ_OPENROUTER = ['google/gemini-3.5-flash-lite', 'openai/gpt-audio-mini'];

/** Unos 90 s de WAV a 16 kHz en base64. Más que eso no es una pregunta. */
export const MAXIMO_AUDIO_BASE64 = 4_000_000;

export function configuracionVoz(): ConfiguracionVoz | null {
  const limpio = (v?: string) => (v ?? '').trim();
  const sinBarra = (u: string) => u.replace(/\/+$/, '');

  const modeloVoz = limpio(process.env.IA_VOZ_MODELO);
  const baseVoz = limpio(process.env.IA_VOZ_BASE_URL);
  const basePrincipal = limpio(process.env.IA_BASE_URL);
  const clavePrincipal = limpio(process.env.IA_API_KEY);

  if (modeloVoz) {
    const baseUrl = sinBarra(baseVoz || basePrincipal);
    if (!baseUrl) return null;
    return {
      baseUrl,
      modelo: modeloVoz,
      modelos: /openrouter\.ai/.test(baseUrl) ? [...new Set([modeloVoz, ...MODELOS_VOZ_OPENROUTER])] : [modeloVoz],
      clave: limpio(process.env.IA_VOZ_API_KEY) || clavePrincipal || undefined,
      esOpenRouter: /openrouter\.ai/.test(baseUrl),
    };
  }

  if (/openrouter\.ai/.test(basePrincipal) && clavePrincipal) {
    return {
      baseUrl: sinBarra(basePrincipal),
      modelo: MODELOS_VOZ_OPENROUTER[0],
      modelos: MODELOS_VOZ_OPENROUTER,
      clave: clavePrincipal,
      esOpenRouter: true,
    };
  }

  const claveGemini = limpio(process.env.GEMINI_API_KEY);
  if (claveGemini) {
    return {
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      modelo: limpio(process.env.GEMINI_MODELO) || 'gemini-3.6-flash',
      clave: claveGemini,
      esOpenRouter: false,
    };
  }

  return null;
}

const INSTRUCCION = [
  'Transcribe literalmente, en castellano, lo que dice esta nota de voz.',
  'Es una pregunta de alguien que usa un programa de facturación: puede',
  'nombrar facturas (FAC-2026-0001), albaranes, clientes, importes y NIF.',
  'Escribe los números y códigos como se escriben, no con letras.',
  'Devuelve SOLO el texto dicho, sin comillas ni comentarios.',
  'Si no se oye a nadie hablar, devuelve exactamente: [silencio]',
].join(' ');

export function cuerpoTranscripcion(config: ConfiguracionVoz, wavBase64: string) {
  return {
    model: config.modelo,
    temperature: 0,
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: INSTRUCCION },
        { type: 'input_audio', input_audio: { data: wavBase64, format: 'wav' } },
      ],
    }],
    // Sólo en OpenRouter y sólo a los modelos que razonan: Gemini directo
    // rechaza los campos que no conoce, y GPT Audio no razona.
    ...(config.esOpenRouter && /^(google|qwen)\//.test(config.modelo) ? { reasoning: { enabled: false } } : {}),
  };
}

/** Lo que devuelve el modelo, sin la marca de silencio ni comillas. */
export function limpiarTranscripcion(texto: string): string {
  const limpio = limpiarRespuesta(texto).trim().replace(/^["«“]+|["»”]+$/g, '').trim();
  if (/^\[?silencio\]?\.?$/i.test(limpio)) return '';
  return limpio;
}

export async function transcribir(wavBase64: string): Promise<string> {
  const config = configuracionVoz();
  if (!config) throw new FalloIA('sin-configurar');

  // Un modelo tras otro. Sin saldo o sin cuota no se sigue probando: el
  // siguiente va con la misma cuenta y fallaría igual.
  let ultimo: FalloIA | null = null;
  for (const modelo of config.modelos ?? [config.modelo]) {
    try {
      return await transcribirCon({ ...config, modelo }, wavBase64);
    } catch (err) {
      const fallo = err instanceof FalloIA ? err : new FalloIA('rechazado', String(err));
      console.error('[ayuda/voz]', modelo, fallo.motivo, fallo.detalle?.slice(0, 300));
      if (fallo.motivo === 'sin-cuota' || fallo.motivo === 'sin-configurar') throw fallo;
      ultimo = fallo;
    }
  }
  throw ultimo ?? new FalloIA('vacio');
}

async function transcribirCon(config: ConfiguracionVoz, wavBase64: string): Promise<string> {
  // Los mismos reintentos que la IA principal: un 503 «mucha demanda» de
  // Gemini salió en la primera prueba de esto y al repetir, pasó.
  let respuesta: Response | null = null;
  for (let intento = 0; intento <= ESPERAS_ENTRE_INTENTOS_MS.length; intento++) {
    if (intento > 0) await new Promise(r => setTimeout(r, ESPERAS_ENTRE_INTENTOS_MS[intento - 1]));
    try {
      respuesta = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.clave ? { Authorization: `Bearer ${config.clave}` } : {}),
        },
        body: JSON.stringify(cuerpoTranscripcion(config, wavBase64)),
        signal: AbortSignal.timeout(40_000),
      });
    } catch (err) {
      if (intento < ESPERAS_ENTRE_INTENTOS_MS.length && err instanceof Error && err.name === 'TimeoutError') continue;
      throw new FalloIA('sin-contacto', err instanceof Error ? err.message : String(err));
    }
    if (respuesta.ok) break;
    const detalle = await respuesta.text().catch(() => '');
    // 402 es «sin saldo» en OpenRouter: tan definitivo como un cupo agotado.
    if (respuesta.status === 402 || (respuesta.status === 429 && esCuotaAgotada(detalle))) {
      throw new FalloIA('sin-cuota', `${respuesta.status} ${detalle.slice(0, 500)}`);
    }
    if (intento < ESPERAS_ENTRE_INTENTOS_MS.length && mereceOtroIntento(respuesta.status)) continue;
    throw new FalloIA('rechazado', `${respuesta.status} ${detalle.slice(0, 500)}`);
  }
  if (!respuesta?.ok) throw new FalloIA('rechazado');

  // OpenRouter a veces contesta 200 con el error DENTRO del cuerpo.
  const datos = await respuesta.json().catch(() => null) as
    { choices?: { message?: { content?: unknown } }[]; error?: { code?: number; message?: string } } | null;
  if (datos?.error) {
    throw new FalloIA('rechazado', `${datos.error.code ?? 200} ${String(datos.error.message ?? '').slice(0, 500)}`);
  }
  const contenido = datos?.choices?.[0]?.message?.content;
  if (typeof contenido !== 'string') throw new FalloIA('vacio', 'sin texto en la respuesta');
  return limpiarTranscripcion(contenido);
}
