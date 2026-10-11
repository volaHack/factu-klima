/**
 * LO QUE SE HACE CON LA RESPUESTA DEL ASISTENTE ANTES DE PINTARLA
 *
 * Puro, para el navegador y para las pruebas:
 *
 *   · `separarSiguientes`: el modelo cierra cada respuesta con una línea
 *     «SIGUIENTES: ¿…? | ¿…?» con las preguntas que tendría sentido hacer
 *     después. Se quita del texto y se enseñan como botones.
 *   · `textoVisible`: mientras la respuesta llega a trozos, lo que se puede
 *     enseñar ya (sin la línea de seguimiento a medias ni un <think>).
 *   · `pantallasMencionadas`: las pantallas del programa que nombra la
 *     respuesta, para poner un botón que lleve a cada una.
 */

import { AYUDA_PAGINAS } from '@/lib/ayuda/paginas';

const MARCA = /\n?[ \t]*SIGUIENTES[ \t]*:([\s\S]*)$/i;
const MAX_SIGUIENTES = 3;

const limpiarPregunta = (p: string) => p
  .trim()
  .replace(/^[-–•*\d.)\s]+/, '')
  .replace(/^[«"“']+|[»"”']+$/g, '')
  .trim();

export function separarSiguientes(texto: string): { cuerpo: string; siguientes: string[] } {
  const m = MARCA.exec(texto);
  if (!m) return { cuerpo: texto.trim(), siguientes: [] };
  const siguientes = m[1]
    .split(/\s*\|\s*|\n/)
    .map(limpiarPregunta)
    .filter(p => p.length >= 3 && p.length <= 110);
  return {
    cuerpo: texto.slice(0, m.index).trim(),
    siguientes: [...new Set(siguientes)].slice(0, MAX_SIGUIENTES),
  };
}

/** Lo que se puede enseñar de una respuesta que aún está llegando. */
export function textoVisible(parcial: string): string {
  let t = parcial
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/i, '');
  // La línea de seguimiento, entera o a medio escribir («\nSIGUI»).
  const m = /\n[ \t]*S(?:I(?:G(?:U(?:I(?:E(?:N(?:T(?:E(?:S(?:[ \t]*:[\s\S]*)?)?)?)?)?)?)?)?)?)?$/i.exec(t);
  if (m) t = t.slice(0, m.index);
  t = t.replace(MARCA, '');
  return t.trim();
}

export interface PantallaMencionada {
  titulo: string;
  ruta: string;
}

/** Las pantallas a las que tiene sentido llevar: ni administración ni la propia Asistencia. */
const PANTALLAS = AYUDA_PAGINAS
  .filter(p => !p.ruta.includes('[') && !p.ruta.startsWith('/admin') && p.ruta !== '/asistencia')
  .map(p => ({ titulo: p.titulo, ruta: p.ruta }))
  // Las de nombre más largo primero: «Facturas recurrentes» antes que «Facturas».
  .sort((a, b) => b.titulo.length - a.titulo.length);

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const LETRA = 'A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9';

export function pantallasMencionadas(texto: string, maximo = 3): PantallaMencionada[] {
  // Se marcan los trozos ya reconocidos para que un nombre corto no se
  // encuentre dentro de uno largo.
  let resto = texto;
  const encontradas: { p: PantallaMencionada; pos: number }[] = [];
  for (const p of PANTALLAS) {
    // Con su mayúscula: es el nombre de la pantalla, no la palabra corriente.
    const re = new RegExp(`(^|[^${LETRA}])${escapar(p.titulo)}(?![${LETRA}])`);
    const m = re.exec(resto);
    if (!m) continue;
    const pos = m.index + m[1].length;
    encontradas.push({ p, pos });
    resto = resto.slice(0, pos) + ' '.repeat(p.titulo.length) + resto.slice(pos + p.titulo.length);
  }
  const vistas = new Set<string>();
  return encontradas
    .sort((a, b) => a.pos - b.pos)
    .map(e => e.p)
    .filter(p => (vistas.has(p.ruta) ? false : (vistas.add(p.ruta), true)))
    .slice(0, maximo);
}
