/**
 * RÓTULOS CON DATOS DENTRO
 *
 * En Crystal Reports es un «objeto de texto» con campos incrustados. Aquí,
 * un rótulo escrito a mano en el editor puede llevar marcadores entre
 * llaves que se sustituyen al imprimir:
 *
 *   «Atendido por {vendedor_nombre}»
 *   «{cliente_cp} {cliente_ciudad} ({cliente_provincia})»
 *   «Página {pagina} de {paginas}»
 *
 * Quien lo resuelve es pdfme, que evalúa cada `{…}` del contenido de un
 * elemento fijo. Por eso, antes de dárselo, se traduce lo nuestro a lo suyo
 * (`{pagina}` → `{currentPage}`) y se quita cualquier marcador que no
 * exista: pdfme imprimiría el error o el marcador tal cual en mitad de la
 * factura del cliente.
 */

import { CAMPOS, datosDeEjemplo } from './contrato';

/** Marcadores propios de la paginación, con su nombre en pdfme. */
export const MARCADORES_PAGINA: Record<string, { pdfme: string; etiqueta: string; ejemplo: string }> = {
  pagina: { pdfme: 'currentPage', etiqueta: 'Página actual', ejemplo: '1' },
  paginas: { pdfme: 'totalPages', etiqueta: 'Total de páginas', ejemplo: '2' },
};

const RE_MARCADOR = /\{\s*([a-zA-Z0-9_]+)\s*\}/g;

/** Las claves que se pueden escribir entre llaves en un rótulo. */
export function marcadoresValidos(): Set<string> {
  return new Set([
    ...CAMPOS.filter(c => c.tipo === 'texto').map(c => c.clave),
    ...Object.keys(MARCADORES_PAGINA),
  ]);
}

/** Los marcadores que lleva un texto, en orden y sin repetir. */
export function marcadoresDe(texto: string): string[] {
  const vistos: string[] = [];
  for (const m of texto.matchAll(RE_MARCADOR)) if (!vistos.includes(m[1])) vistos.push(m[1]);
  return vistos;
}

export function tieneMarcadores(texto: string | undefined | null): boolean {
  return marcadoresDe(texto ?? '').length > 0;
}

/** Los marcadores que no existen, para avisar en el editor. */
export function marcadoresDesconocidos(texto: string, validos = marcadoresValidos()): string[] {
  return marcadoresDe(texto).filter(m => !validos.has(m));
}

/**
 * El contenido listo para pdfme: los marcadores de página traducidos, los
 * desconocidos fuera y las llaves sueltas neutralizadas (pdfme intentaría
 * evaluar «{precio especial}» como código).
 */
export function contenidoParaPdfme(texto: string, validos = marcadoresValidos()): string {
  // Primero se protegen los marcadores buenos; luego, cualquier llave que
  // quede no forma parte de ninguno y se cambia por un paréntesis angular.
  const marcas: string[] = [];
  const protegido = texto.replace(RE_MARCADOR, (entero, clave: string) => {
    if (!validos.has(clave)) return '';
    const destino = MARCADORES_PAGINA[clave]?.pdfme ?? clave;
    marcas.push(`{${destino}}`);
    return `\u0000${marcas.length - 1}\u0000`;
  });
  const sinLlaves = protegido.replace(/\{/g, '(').replace(/\}/g, ')');
  return sinLlaves.replace(/\u0000(\d+)\u0000/g, (_, i: string) => marcas[Number(i)]);
}

/** Cómo se ve el rótulo con datos de ejemplo (para el editor). */
export function textoDeMuestra(texto: string, valores: Record<string, string> = datosDeEjemplo()): string {
  return texto.replace(RE_MARCADOR, (entero, clave: string) => {
    if (MARCADORES_PAGINA[clave]) return MARCADORES_PAGINA[clave].ejemplo;
    const valor = valores[clave];
    if (valor === undefined) return entero;
    // `doc_pagina` trae dentro sus propios marcadores de pdfme.
    return valor.replace('{currentPage}', '1').replace('{totalPages}', '2');
  });
}
