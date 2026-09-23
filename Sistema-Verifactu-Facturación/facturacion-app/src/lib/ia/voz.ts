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
 *      clave con Qwen 3.8 Omni Flash: el Qwen 3.8 de texto no oye, su
 *      hermano «omni» sí, y cuesta céntimos por cientos de notas.
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
  modelo: string;
  clave?: string;
  esOpenRouter: boolean;
}

/** El modelo con oído que se usa en OpenRouter si no se dice otro. */
export const MODELO_VOZ_OPENROUTER = 'qwen/qwen3.8-omni-flash';

/**
 * Si el primero falla o está saturado, OpenRouter prueba éste por su
 * cuenta (`models`, en la misma petición): una nota de voz que no se
 * transcribe es una pregunta perdida, y otro proveedor que oye cuesta lo
 * mismo.
 */
export const MODELO_VOZ_RESERVA = 'google/gemini-3.5-flash-lite';

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
      clave: limpio(process.env.IA_VOZ_API_KEY) || clavePrincipal || undefined,
      esOpenRouter: /openrouter\.ai/.test(baseUrl),
    };
  }

  if (/openrouter\.ai/.test(basePrincipal) && clavePrincipal) {
    return { baseUrl: sinBarra(basePrincipal), modelo: MODELO_VOZ_OPENROUTER, clave: clavePrincipal, esOpenRouter: true };
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
    // Sólo OpenRouter entiende estos campos; Gemini rechaza lo que no conoce.
    ...(config.esOpenRouter ? {
      reasoning: { enabled: false },
      models: [...new Set([config.modelo, MODELO_VOZ_RESERVA])],
    } : {}),
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
        signal: AbortSignal.timeout(45_000),
      });
    } catch (err) {
      if (intento < ESPERAS_ENTRE_INTENTOS_MS.length && err instanceof Error && err.name === 'TimeoutError') continue;
      throw new FalloIA('sin-contacto', err instanceof Error ? err.message : String(err));
    }
    if (respuesta.ok) break;
    const detalle = await respuesta.text().catch(() => '');
    if (respuesta.status === 429 && esCuotaAgotada(detalle)) throw new FalloIA('sin-cuota', `429 ${detalle.slice(0, 500)}`);
    if (intento < ESPERAS_ENTRE_INTENTOS_MS.length && mereceOtroIntento(respuesta.status)) continue;
    throw new FalloIA('rechazado', `${respuesta.status} ${detalle.slice(0, 500)}`);
  }
  if (!respuesta?.ok) throw new FalloIA('rechazado');

  const datos = await respuesta.json().catch(() => null) as
    { choices?: { message?: { content?: unknown } }[] } | null;
  const contenido = datos?.choices?.[0]?.message?.content;
  return limpiarTranscripcion(typeof contenido === 'string' ? contenido : '');
}
