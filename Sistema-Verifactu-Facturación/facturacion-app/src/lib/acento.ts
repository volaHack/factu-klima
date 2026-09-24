/**
 * EL COLOR DE ACENTO DE LA EMPRESA
 *
 * Cada empresa elige su acento (rosa, vino, terracota o ciruela) y se
 * aplica con una clase `theme-*` en <body>. Esa clase se ponía cuando
 * llegaban los ajustes de la empresa —una petición asíncrona—, con dos
 * efectos:
 *
 *  · Destello: cada carga pintaba la app en rosa y, medio segundo
 *    después, saltaba al acento elegido.
 *  · Carrera: lo que leía el color al montarse (las gráficas, las
 *    leyendas) se quedaba con el rosa aunque la empresa usara otro.
 *
 * Ahora el acento se recuerda en el navegador y se aplica con un guion
 * síncrono al principio de <body>, antes del primer pintado —el mismo
 * recurso que ya evita el fogonazo del modo oscuro—. Cuando llegan los
 * ajustes se confirma o se corrige, y quien pinta con él se entera por
 * `suscribirseAlAcento`.
 */

export type Acento = 'rose' | 'wine' | 'terracotta' | 'plum';

export const ACENTOS: readonly Acento[] = ['rose', 'wine', 'terracotta', 'plum'];
export const CLAVE_ACENTO = 'klima-acento';

export function esAcento(valor: unknown): valor is Acento {
  return typeof valor === 'string' && (ACENTOS as readonly string[]).includes(valor);
}

/**
 * Pone el acento en <body> y lo recuerda para la próxima carga.
 *
 * Sólo toca las clases `theme-*`: antes se hacía `body.className = …`,
 * que borraba cualquier otra clase que tuviera el body.
 */
export function aplicarAcento(acento: string | null | undefined): void {
  if (typeof document === 'undefined') return;
  const valor: Acento = esAcento(acento) ? acento : 'rose';
  const body = document.body;
  for (const a of ACENTOS) if (a !== valor) body.classList.remove(`theme-${a}`);
  body.classList.add(`theme-${valor}`);
  try { localStorage.setItem(CLAVE_ACENTO, valor); } catch { /* sin almacenamiento: se aplica igual */ }
}

/**
 * El guion que corre al principio de <body>, antes de pintar nada: pone el
 * acento recordado. Va como texto porque se inyecta con
 * dangerouslySetInnerHTML y tiene que ser síncrono.
 */
export const GUION_ACENTO = `(function(){try{
var a=localStorage.getItem('${CLAVE_ACENTO}');
if(${JSON.stringify(ACENTOS)}.indexOf(a)>-1){document.body.classList.add('theme-'+a);}
}catch(e){}})();`;

/** Para `useSyncExternalStore`: avisa cuando cambia la clase de <body>. */
export function suscribirseAlAcento(alCambiar: () => void): () => void {
  if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return () => {};
  const obs = new MutationObserver(alCambiar);
  obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  return () => obs.disconnect();
}

/** El acento que hay puesto ahora mismo en <body>. */
export function acentoActual(): Acento {
  if (typeof document === 'undefined') return 'rose';
  const m = /\btheme-(rose|wine|terracotta|plum)\b/.exec(document.body.className);
  return (m?.[1] as Acento) ?? 'rose';
}
