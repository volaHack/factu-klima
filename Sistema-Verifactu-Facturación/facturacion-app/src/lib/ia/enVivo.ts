/**
 * LA RESPUESTA DE LA IA A MEDIDA QUE SE ESCRIBE
 *
 * Con la respuesta entera de golpe, quien pregunta mira un «pensando…»
 * los segundos que tarde el modelo en escribirla toda. Pidiéndola por
 * trozos (SSE, como la API de OpenAI) la primera palabra sale en cuanto
 * el modelo la escribe, y el resto va apareciendo.
 *
 * NUNCA PEOR QUE ANTES
 * Si la petición por trozos falla antes de que llegue nada (el servidor
 * no lo admite, está saturado, se corta), se hace la de siempre con
 * `generarTexto`, que ya sabe reintentar y pasar al modelo de reserva.
 * Gemini no habla SSE de OpenAI: va directamente por la de siempre y la
 * respuesta llega de una vez.
 */

import { configuracionIA, cuerpoOpenAI, FalloIA, generarTexto, limpiarRespuesta, type PeticionIA } from './cliente';

/**
 * Los trozos de texto de un búfer SSE de OpenAI. Devuelve lo que queda a
 * medias para juntarlo con lo siguiente que llegue.
 */
export function trozosSSE(bufer: string): { trozos: string[]; resto: string; fin: boolean } {
  const normal = bufer.replace(/\r\n/g, '\n');
  const eventos = normal.split('\n\n');
  const resto = eventos.pop() ?? '';
  const trozos: string[] = [];
  let fin = false;
  for (const evento of eventos) {
    for (const linea of evento.split('\n')) {
      if (!linea.startsWith('data:')) continue;
      const datos = linea.slice(5).trim();
      if (datos === '[DONE]') { fin = true; continue; }
      try {
        const j = JSON.parse(datos) as { choices?: { delta?: { content?: unknown } }[] };
        const t = j.choices?.[0]?.delta?.content;
        if (typeof t === 'string' && t) trozos.push(t);
      } catch { /* evento que no es JSON: se ignora */ }
    }
  }
  return { trozos, resto, fin };
}

/**
 * Pide la respuesta y va llamando a `alTrozo` con cada trozo de texto.
 * Devuelve el texto entero, limpio (sin <think>).
 */
export async function generarTextoEnVivo(p: PeticionIA, alTrozo: (trozo: string) => void): Promise<string> {
  const config = configuracionIA();
  if (!config) throw new FalloIA('sin-configurar');

  const deUnaVez = async () => {
    const texto = await generarTexto(p);
    alTrozo(texto);
    return texto;
  };
  if (config.proveedor === 'gemini' || p.imagenes?.length || p.json) return deUnaVez();

  let respuesta: Response;
  try {
    respuesta = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(config.clave ? { Authorization: `Bearer ${config.clave}` } : {}),
      },
      body: JSON.stringify({ ...cuerpoOpenAI(config, p), stream: true }),
      signal: AbortSignal.timeout(Math.max(p.tiempoLimiteMs ?? 20_000, 60_000)),
    });
  } catch {
    return deUnaVez();
  }
  const tipo = respuesta.headers.get('content-type') ?? '';
  if (!respuesta.ok || !respuesta.body || !tipo.includes('event-stream')) {
    // El servidor no ha querido hablar por trozos: la de siempre.
    await respuesta.body?.cancel().catch(() => {});
    return deUnaVez();
  }

  const lector = respuesta.body.getReader();
  const decodificador = new TextDecoder();
  let bufer = '';
  let entero = '';
  try {
    for (;;) {
      const { value, done } = await lector.read();
      if (done) break;
      bufer += decodificador.decode(value, { stream: true });
      const { trozos, resto, fin } = trozosSSE(bufer);
      bufer = resto;
      for (const t of trozos) { entero += t; alTrozo(t); }
      if (fin) break;
    }
  } catch (err) {
    // Cortado a la mitad: si ya se ha enseñado algo, no se puede empezar
    // de nuevo sin repetirlo; se avisa del fallo con lo que haya.
    if (!entero) return deUnaVez();
    throw new FalloIA('sin-contacto', err instanceof Error ? err.message : String(err));
  } finally {
    lector.releaseLock();
  }
  if (!entero.trim()) return deUnaVez();
  return limpiarRespuesta(entero);
}
