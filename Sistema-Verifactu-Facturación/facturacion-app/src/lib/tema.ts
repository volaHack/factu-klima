/**
 * EL ESQUEMA DE COLOR: CLARO, OSCURO O EL QUE DIGA EL SISTEMA
 *
 * Tres estados de verdad, no dos. «Automático» no es lo mismo que «claro»
 * aunque ahora mismo se vean igual: quien lo deja en automático quiere que
 * su portátil cambie solo al anochecer, y quien elige claro quiere claro
 * aunque su portátil se ponga oscuro.
 *
 * En el papel (el atributo `data-theme` del <html>) sólo se escribe el
 * valor YA RESUELTO —'dark' o 'light'—, nunca 'auto'. Así la hoja de
 * estilos define la paleta oscura UNA vez, en un solo selector, en vez de
 * repetirla en una consulta de medios y arriesgarse a que las dos copias
 * acaben diciendo cosas distintas.
 */

export type Tema = 'claro' | 'oscuro' | 'auto';

export const CLAVE_TEMA = 'klima-tema';

/** Lo que el sistema operativo tiene puesto ahora mismo. */
export function temaDelSistema(): 'claro' | 'oscuro' {
  if (typeof window === 'undefined' || !window.matchMedia) return 'claro';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro';
}

/** Lo que la persona eligió, o 'auto' si no ha elegido nada. */
export function temaGuardado(): Tema {
  if (typeof window === 'undefined') return 'auto';
  const guardado = window.localStorage.getItem(CLAVE_TEMA);
  return guardado === 'claro' || guardado === 'oscuro' ? guardado : 'auto';
}

/** El que toca pintar: el elegido, o el del sistema si está en automático. */
export function temaEfectivo(tema: Tema = temaGuardado()): 'claro' | 'oscuro' {
  return tema === 'auto' ? temaDelSistema() : tema;
}

/**
 * Estampa el esquema en el documento.
 *
 * También ajusta `theme-color`, que es el color con el que el móvil pinta
 * la barra del sistema: sin esto, en oscuro queda una franja rosa claro
 * encima de una aplicación negra.
 */
export function aplicarTema(tema: Tema): void {
  const efectivo = temaEfectivo(tema);
  document.documentElement.dataset.theme = efectivo === 'oscuro' ? 'dark' : 'light';

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', efectivo === 'oscuro' ? '#191013' : '#f2e7e0');
}

/** Guarda la elección y la aplica. */
export function guardarTema(tema: Tema): void {
  if (tema === 'auto') window.localStorage.removeItem(CLAVE_TEMA);
  else window.localStorage.setItem(CLAVE_TEMA, tema);
  aplicarTema(tema);
  for (const avisar of oyentes) avisar();
}

/**
 * El guion que corre ANTES de que se pinte nada.
 *
 * Sin esto la página nace clara y se pone oscura cuando React arranca: un
 * fogonazo blanco en toda la pantalla, que de noche es exactamente lo que
 * quien puso el modo oscuro quería evitar.
 *
 * Va como texto porque se inyecta en el <head> con dangerouslySetInnerHTML
 * y tiene que ejecutarse de forma síncrona, antes del primer pintado.
 */
export const GUION_ANTI_FOGONAZO = `(function(){try{
var g=localStorage.getItem('${CLAVE_TEMA}');
var o=g==='oscuro'||(g!=='claro'&&matchMedia('(prefers-color-scheme: dark)').matches);
document.documentElement.dataset.theme=o?'dark':'light';
}catch(e){document.documentElement.dataset.theme='light';}})();`;

/**
 * Suscripción al tema para `useSyncExternalStore`.
 *
 * El tema vive fuera de React —en localStorage y en la preferencia del
 * sistema— y lo cambian tres cosas distintas: este botón, el mismo botón en
 * otra pestaña, y el propio sistema operativo al anochecer. Eso es
 * exactamente un almacén externo, y leerlo con un efecto que llama a
 * `setState` provoca un renderizado en cascada además de un parpadeo.
 */
const oyentes = new Set<() => void>();

export function suscribirseAlTema(alCambiar: () => void): () => void {
  oyentes.add(alCambiar);
  const medio = window.matchMedia?.('(prefers-color-scheme: dark)');
  const alSistema = () => { if (temaGuardado() === 'auto') { aplicarTema('auto'); alCambiar(); } };
  const alOtraPestana = (e: StorageEvent) => { if (e.key === CLAVE_TEMA) { aplicarTema(temaGuardado()); alCambiar(); } };
  medio?.addEventListener('change', alSistema);
  window.addEventListener('storage', alOtraPestana);
  return () => {
    oyentes.delete(alCambiar);
    medio?.removeEventListener('change', alSistema);
    window.removeEventListener('storage', alOtraPestana);
  };
}

/** El valor que lee `useSyncExternalStore` en el navegador. */
export function leerTemaEfectivo(): 'claro' | 'oscuro' {
  return temaEfectivo();
}

/**
 * Y el que lee en el servidor, donde no hay ni localStorage ni sistema.
 *
 * Tiene que ser 'claro' fijo: si aquí se adivinara, el HTML del servidor
 * diría una cosa y el del navegador otra, y React se quejaría de que no
 * cuadran. El guion anti-fogonazo ya ha puesto el esquema de verdad en el
 * <html> antes de esto, así que lo único que se ve mal un instante es el
 * icono del botón, no la página.
 */
export function leerTemaEnServidor(): 'claro' | 'oscuro' {
  return 'claro';
}
