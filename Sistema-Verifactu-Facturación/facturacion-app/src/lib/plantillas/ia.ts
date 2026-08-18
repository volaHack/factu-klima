/**
 * RECONOCIMIENTO DE PLANTILLAS CON IA
 *
 * Las reglas de `deteccion.ts` reconocen lo que se repite de una factura a
 * otra: etiquetas conocidas, bloques de dirección, rejillas con cabecera. Lo
 * que no pueden es entender un impreso que no se parece a ninguno —el rótulo
 * inventado de un taller, la casilla en catalán, la factura de un gremio con
 * su vocabulario propio—, y ahí es donde un modelo de lenguaje aporta lo que
 * una regla no: leer el papel como lo leería una persona.
 *
 * CÓMO ENCAJAN LAS DOS COSAS
 *
 * La IA no sustituye a las reglas: las completa. Sólo se le pregunta por lo
 * que quedó sin identificar, y su respuesta entra como SUGERENCIA. Una regla
 * que ha reconocido «Fecha:» con un 95 % de certeza sabe más que cualquier
 * modelo, y no se toca. Esto no es cautela de más:
 *
 *   - Las reglas son deterministas. La misma factura da hoy y dentro de un
 *     año la misma plantilla, y cuando se equivoca se puede arreglar la
 *     regla. Un modelo puede cambiar de opinión entre dos llamadas.
 *   - Lo que está en juego es una factura. Un campo mal asignado imprime el
 *     NIF del cliente donde va el total.
 *
 * Por eso todo lo que propone la IA queda marcado como «por confirmar» en el
 * revisor, con su motivo, para que el usuario lo vea antes de guardar.
 *
 * QUÉ SALE DEL EQUIPO
 *
 * Sólo texto y coordenadas: lo que ya está escrito en el papel. Ni el PDF ni
 * una imagen. Y sólo cuando el usuario pulsa el botón — nunca al subir el
 * archivo.
 */

import { CAMPOS, esColumnaPersonalizada } from './contrato';
import type { AnalisisPdf, CampoDetectado } from './tipos';

/** Un recuadro tal y como se le enseña al modelo. */
export interface CajaParaIa {
  id: string;
  /** Texto de la muestra que había en ese recuadro. */
  texto: string;
  /** Posición en milímetros, redondeada: al modelo no le sirve más precisión. */
  x: number;
  y: number;
  ancho: number;
  alto: number;
  /** Texto impreso más cercano por la izquierda o por arriba, si lo hay. */
  cerca?: string;
}

export interface PeticionIa {
  ancho: number;
  alto: number;
  cajas: CajaParaIa[];
  /** Textos del diseño que NO son campos: rótulos, marcos, pie legal. */
  rotulos: string[];
  clavesDisponibles: string[];
}

export interface SugerenciaIa {
  id: string;
  clave: string | null;
  motivo: string;
}

const redondear = (n: number) => Math.round(n * 10) / 10;

/**
 * Qué se le manda al modelo.
 *
 * Sólo los recuadros que las reglas no supieron identificar, más los rótulos
 * de alrededor como contexto: sin ellos, «4300000092» es un número
 * cualquiera; con «CLIENTE» impreso justo encima, es el código del cliente.
 */
export function describirParaIa(analisis: AnalisisPdf): PeticionIa {
  const sinIdentificar = analisis.campos.filter(c => !c.fijo && !c.clave);
  const segmentos = analisis.pagina.lineas.flatMap(l => l.segmentos);

  const cajas: CajaParaIa[] = sinIdentificar.map(campo => {
    // El rótulo de una casilla está impreso encima o a su izquierda.
    const cerca = segmentos
      .filter(s => {
        const esSuyo = analisis.campos.some(c => c.clave && solapan(c, s));
        if (esSuyo || !s.texto.trim()) return false;
        const encima = s.y < campo.y && campo.y - (s.y + s.alto) < campo.alto * 1.8
          && s.x < campo.x + campo.ancho && s.x + s.ancho > campo.x;
        const alLado = Math.abs(s.y - campo.y) < campo.alto * 0.8
          && s.x + s.ancho <= campo.x + 1 && campo.x - (s.x + s.ancho) < 40;
        return encima || alLado;
      })
      .sort((a, b) => (campo.x - a.x) - (campo.x - b.x))[0];

    return {
      id: campo.id,
      texto: campo.valorOriginal,
      x: redondear(campo.x),
      y: redondear(campo.y),
      ancho: redondear(campo.ancho),
      alto: redondear(campo.alto),
      ...(cerca ? { cerca: cerca.texto.trim().slice(0, 60) } : {}),
    };
  });

  // Los rótulos del diseño, para que el modelo sepa de qué impreso se trata.
  const rotulos = segmentos
    .filter(s => !analisis.campos.some(c => solapan(c, s)))
    .map(s => s.texto.trim())
    .filter(t => t.length > 0 && t.length < 40)
    .slice(0, 60);

  return {
    ancho: redondear(analisis.pagina.ancho),
    alto: redondear(analisis.pagina.alto),
    cajas,
    rotulos,
    clavesDisponibles: clavesAsignablesPorIa(analisis),
  };
}

/**
 * Las claves que la IA puede proponer.
 *
 * Se le quitan las que ya están ocupadas —un dato sólo se imprime una vez— y
 * las de imagen, que no se deducen de un texto. Se le añaden los recuentos de
 * las columnas propias de esta plantilla (`total_col_N`), que dependen de la
 * tabla que tenga cada impreso.
 */
export function clavesAsignablesPorIa(analisis: AnalisisPdf): string[] {
  const ocupadas = new Set(analisis.campos.map(c => c.clave).filter(Boolean) as string[]);
  const claves = CAMPOS
    .filter(c => c.tipo === 'texto' && !ocupadas.has(c.clave))
    .map(c => c.clave);

  for (const columna of analisis.tabla?.columnas ?? []) {
    if (!columna.clave || !esColumnaPersonalizada(columna.clave)) continue;
    const total = columna.clave.replace('custom_col_', 'total_col_');
    if (!ocupadas.has(total)) claves.push(total);
  }
  return claves;
}

/**
 * Mete las sugerencias del modelo en el análisis.
 *
 * Reglas, y todas por el mismo motivo —que una plantilla mal asignada imprime
 * el dato de un cliente en el sitio de otro—:
 *
 *   - No toca un campo que las reglas ya identificaron.
 *   - No repite una clave que ya está en uso.
 *   - No acepta una clave que no exista en el contrato.
 *   - Lo que acepta queda con confianza baja, para que salga «por confirmar»
 *     en el revisor y el usuario lo mire antes de guardar.
 */
export function fusionarSugerencias(
  campos: CampoDetectado[],
  sugerencias: SugerenciaIa[],
  clavesPermitidas: Iterable<string>,
): { campos: CampoDetectado[]; aplicadas: number } {
  const permitidas = new Set(clavesPermitidas);
  const ocupadas = new Set(campos.map(c => c.clave).filter(Boolean) as string[]);
  const porId = new Map(sugerencias.map(s => [s.id, s]));
  let aplicadas = 0;

  const resultado = campos.map(campo => {
    const sugerencia = porId.get(campo.id);
    if (!sugerencia?.clave) return campo;
    if (campo.fijo || campo.clave) return campo;
    if (!permitidas.has(sugerencia.clave) || ocupadas.has(sugerencia.clave)) return campo;

    ocupadas.add(sugerencia.clave);
    aplicadas++;
    return {
      ...campo,
      clave: sugerencia.clave,
      confianza: 0.4,
      motivo: sugerencia.motivo?.trim()
        ? `Propuesto por la IA: ${sugerencia.motivo.trim()}`
        : 'Propuesto por la IA',
    };
  });

  return { campos: resultado, aplicadas };
}

function solapan(
  a: { x: number; y: number; ancho: number; alto: number },
  b: { x: number; y: number; ancho: number; alto: number },
): boolean {
  return a.x < b.x + b.ancho && a.x + a.ancho > b.x && a.y < b.y + b.alto && a.y + a.alto > b.y;
}
