'use client';

/**
 * Avisar al servidor de un fallo visto en el navegador.
 *
 * Con filtros, porque el navegador está lleno de ruido que no es del
 * programa: extensiones, el «ResizeObserver loop» inofensivo, «Script
 * error.» de otros dominios, o peticiones cortadas por estar sin conexión.
 * Y con tope: una pantalla rota que repite el mismo error en bucle no
 * puede mandar cien avisos.
 */

const RUIDO = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /chrome-extension:|moz-extension:|safari-extension:/i,
  /AbortError|The user aborted a request|signal is aborted/i,
  /Loading chunk \d+ failed|ChunkLoadError/i, // tras un despliegue: se arregla recargando
];

const vistos = new Set<string>();
let enviados = 0;
const MAX_POR_PAGINA = 10;

export function esRuido(mensaje: string, pila?: string): boolean {
  if (!mensaje) return true;
  return RUIDO.some(r => r.test(mensaje) || (pila ? r.test(pila) : false));
}

export function avisarError(error: unknown, origenExtra?: string): void {
  try {
    if (typeof window === 'undefined') return;
    const e = error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error ?? 'Error'));
    const mensaje = `${origenExtra ? `${origenExtra}: ` : ''}${e.message || String(error)}`;
    if (esRuido(e.message, e.stack)) return;
    // Sin conexión, los «Failed to fetch» son la conexión, no el programa.
    if (!navigator.onLine && /fetch|network|red/i.test(mensaje)) return;
    const clave = mensaje.slice(0, 200);
    if (vistos.has(clave) || enviados >= MAX_POR_PAGINA) return;
    vistos.add(clave);
    enviados++;
    const cuerpo = JSON.stringify({ mensaje, pila: e.stack?.slice(0, 6000), ruta: location.pathname });
    // sendBeacon sobrevive a que la página se cierre justo después del fallo.
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/errores', new Blob([cuerpo], { type: 'application/json' }));
    } else {
      void fetch('/api/errores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: cuerpo, keepalive: true });
    }
  } catch { /* avisar nunca puede romper nada */ }
}
