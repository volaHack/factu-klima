/**
 * LÓGICA DEL EDITOR DE PLANTILLAS
 *
 * Todo lo que el editor hace con geometría y con listas de columnas vive
 * aquí y no dentro del componente de React: son funciones puras, se pueden
 * probar sin montar nada y el componente se queda con lo suyo, que es
 * escuchar el ratón y pintar.
 *
 * La unidad es siempre el milímetro desde la esquina superior izquierda del
 * papel, igual que en el resto del módulo de plantillas.
 */

import { COLUMNAS_IMPUESTOS, COLUMNAS_LINEAS, columnaDeLineas, esColumnaPersonalizada } from './contrato';
import type { Alineacion, CampoDetectado, ColumnaDetectada, RejillaDetectada, TablaDetectada } from './tipos';

export interface Caja {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

export function acotar(valor: number, minimo: number, maximo: number): number {
  return Math.max(minimo, Math.min(maximo, valor));
}

export function intersecan(a: Caja, b: Caja): boolean {
  return a.x < b.x + b.ancho && a.x + a.ancho > b.x && a.y < b.y + b.alto && a.y + a.alto > b.y;
}

/** Redondeo a décimas de milímetro: lo que se puede ver y medir en papel. */
export function redondearMm(valor: number): number {
  return Math.round(valor * 10) / 10;
}

// ============================================================
// IMANES Y GUÍAS
// ============================================================

export interface Guia {
  eje: 'x' | 'y';
  /** Posición de la guía en mm. */
  valor: number;
}

export interface ResultadoImanes {
  x: number;
  y: number;
  guias: Guia[];
}

/**
 * Ajusta la posición de una caja para que se alinee con lo que ya hay.
 *
 * Sin esto, colocar el NIF justo debajo del nombre del cliente es cuestión de
 * pulso y de mirar la coordenada en un campo numérico. Con esto, la caja se
 * pega sola al borde de la que tiene al lado —y se enseña la línea por la que
 * se ha pegado, para que el usuario vea POR QUÉ se ha movido ahí.
 *
 * Se comparan los tres anclajes de cada eje (principio, centro y final), que
 * son los que de verdad se usan al maquetar: alinear por la izquierda, por el
 * centro o por la derecha.
 */
export function calcularImanes(
  movida: Caja,
  otras: Caja[],
  pagina: { ancho: number; alto: number },
  tolerancia: number,
): ResultadoImanes {
  const anclasX = (c: Caja) => [c.x, c.x + c.ancho / 2, c.x + c.ancho];
  const anclasY = (c: Caja) => [c.y, c.y + c.alto / 2, c.y + c.alto];

  const referenciasX = [0, pagina.ancho / 2, pagina.ancho, ...otras.flatMap(anclasX)];
  const referenciasY = [0, pagina.alto / 2, pagina.alto, ...otras.flatMap(anclasY)];

  const mejorEn = (propias: number[], referencias: number[]) => {
    let mejor: { ajuste: number; guia: number } | null = null;
    for (const propia of propias) {
      for (const referencia of referencias) {
        const distancia = Math.abs(propia - referencia);
        if (distancia > tolerancia) continue;
        if (!mejor || distancia < Math.abs(mejor.ajuste)) {
          mejor = { ajuste: referencia - propia, guia: referencia };
        }
      }
    }
    return mejor;
  };

  const enX = mejorEn(anclasX(movida), referenciasX);
  const enY = mejorEn(anclasY(movida), referenciasY);

  const guias: Guia[] = [];
  if (enX) guias.push({ eje: 'x', valor: enX.guia });
  if (enY) guias.push({ eje: 'y', valor: enY.guia });

  return {
    x: movida.x + (enX?.ajuste ?? 0),
    y: movida.y + (enY?.ajuste ?? 0),
    guias,
  };
}

// ============================================================
// ALINEAR Y DISTRIBUIR
// ============================================================

export type ModoAlinear =
  | 'izquierda' | 'centro-h' | 'derecha'
  | 'arriba' | 'centro-v' | 'abajo';

/**
 * Alinea un grupo de cajas entre sí tomando como referencia el rectángulo
 * que las envuelve a todas, que es lo que espera cualquiera que haya usado
 * un editor de diagramas.
 */
export function alinear<T extends Caja>(cajas: T[], modo: ModoAlinear): T[] {
  if (cajas.length < 2) return cajas;

  const izquierda = Math.min(...cajas.map(c => c.x));
  const derecha = Math.max(...cajas.map(c => c.x + c.ancho));
  const arriba = Math.min(...cajas.map(c => c.y));
  const abajo = Math.max(...cajas.map(c => c.y + c.alto));

  return cajas.map(caja => {
    switch (modo) {
      case 'izquierda': return { ...caja, x: izquierda };
      case 'derecha': return { ...caja, x: derecha - caja.ancho };
      case 'centro-h': return { ...caja, x: (izquierda + derecha) / 2 - caja.ancho / 2 };
      case 'arriba': return { ...caja, y: arriba };
      case 'abajo': return { ...caja, y: abajo - caja.alto };
      case 'centro-v': return { ...caja, y: (arriba + abajo) / 2 - caja.alto / 2 };
    }
  });
}

/**
 * Reparte las cajas dejando el mismo hueco entre unas y otras. Las de los
 * extremos no se mueven: son las que fijan el espacio a repartir.
 */
export function distribuir<T extends Caja>(cajas: T[], eje: 'horizontal' | 'vertical'): T[] {
  if (cajas.length < 3) return cajas;

  const enOrden = [...cajas].sort((a, b) => (eje === 'horizontal' ? a.x - b.x : a.y - b.y));
  const tamano = (c: Caja) => (eje === 'horizontal' ? c.ancho : c.alto);
  const inicio = (c: Caja) => (eje === 'horizontal' ? c.x : c.y);

  const primera = enOrden[0];
  const ultima = enOrden[enOrden.length - 1];
  const total = inicio(ultima) + tamano(ultima) - inicio(primera);
  const ocupado = enOrden.reduce((suma, c) => suma + tamano(c), 0);
  const hueco = (total - ocupado) / (enOrden.length - 1);

  let cursor = inicio(primera);
  const colocadas = new Map<T, T>();
  for (const caja of enOrden) {
    colocadas.set(caja, eje === 'horizontal' ? { ...caja, x: cursor } : { ...caja, y: cursor });
    cursor += tamano(caja) + hueco;
  }

  // Se devuelve en el orden de entrada para no descolocar la selección.
  return cajas.map(c => colocadas.get(c) ?? c);
}

// ============================================================
// COLUMNAS DE LA TABLA
// ============================================================

/** Recoloca las columnas una detrás de otra a partir de una `x` de inicio. */
export function recolocarColumnas<T extends { x: number; ancho: number }>(
  columnas: T[],
  inicio: number,
): T[] {
  let cursor = inicio;
  return columnas.map(columna => {
    const colocada = { ...columna, x: cursor };
    cursor += columna.ancho;
    return colocada;
  });
}

/**
 * Cambia una columna de sitio conservando su ancho.
 *
 * Es la operación que hace que una plantilla se pueda adaptar a cualquier
 * cliente: unos quieren la referencia delante de la descripción y otros
 * detrás, y eso no puede obligar a rehacer la plantilla entera.
 */
export function moverColumna(
  columnas: ColumnaDetectada[],
  desde: number,
  hasta: number,
  xTabla: number,
): ColumnaDetectada[] {
  if (desde === hasta || desde < 0 || hasta < 0) return columnas;
  if (desde >= columnas.length || hasta >= columnas.length) return columnas;

  const reordenadas = [...columnas];
  const [movida] = reordenadas.splice(desde, 1);
  reordenadas.splice(hasta, 0, movida);
  return recolocarColumnas(reordenadas, xTabla);
}

/**
 * Reparte el ancho entre dos columnas contiguas al arrastrar su separador.
 * Ninguna baja de un mínimo legible: una columna de 2 mm no muestra nada y
 * además deja el reparto de porcentajes de pdfme en un estado absurdo.
 */
export const ANCHO_MINIMO_COLUMNA = 6;

export function redimensionarColumna(
  columnas: ColumnaDetectada[],
  indice: number,
  anchoIzquierda: number,
  xTabla: number,
): ColumnaDetectada[] {
  const izquierda = columnas[indice];
  const derecha = columnas[indice + 1];
  if (!izquierda || !derecha) return columnas;

  const disponible = izquierda.ancho + derecha.ancho;
  const nuevoIzquierda = acotar(
    anchoIzquierda,
    ANCHO_MINIMO_COLUMNA,
    disponible - ANCHO_MINIMO_COLUMNA,
  );

  return recolocarColumnas(
    columnas.map((columna, i) => {
      if (i === indice) return { ...columna, ancho: nuevoIzquierda };
      if (i === indice + 1) return { ...columna, ancho: disponible - nuevoIzquierda };
      return columna;
    }),
    xTabla,
  );
}

/** Quita una columna y le regala su ancho a la vecina. */
export function quitarColumna(
  columnas: ColumnaDetectada[],
  indice: number,
  xTabla: number,
): ColumnaDetectada[] {
  if (columnas.length <= 1) return columnas;
  const fuera = columnas[indice];
  const restantes = columnas.filter((_, i) => i !== indice);
  const vecina = Math.min(indice, restantes.length - 1);
  return recolocarColumnas(
    restantes.map((columna, i) => (i === vecina ? { ...columna, ancho: columna.ancho + fuera.ancho } : columna)),
    xTabla,
  );
}

/** Añade una columna partiendo por la mitad el ancho de la última. */
export function anadirColumna(
  columnas: ColumnaDetectada[],
  xTabla: number,
  clave: string | null = null,
): ColumnaDetectada[] {
  const ultima = columnas[columnas.length - 1];
  const definicion = clave ? columnaDeLineas(clave) : undefined;
  const nueva: ColumnaDetectada = {
    clave,
    cabecera: definicion?.cabeceraSugerida ?? 'Nueva',
    x: 0,
    ancho: ultima ? ultima.ancho / 2 : 20,
    alineacion: definicion?.numerica ? 'right' : 'left',
  };

  const previas = ultima
    ? columnas.map((c, i) => (i === columnas.length - 1 ? { ...c, ancho: c.ancho / 2 } : c))
    : columnas;

  return recolocarColumnas([...previas, nueva], xTabla);
}

/** Reparte el ancho de la tabla a partes iguales entre todas las columnas. */
export function igualarColumnas(tabla: TablaDetectada): ColumnaDetectada[] {
  const ancho = tabla.ancho / Math.max(1, tabla.columnas.length);
  return recolocarColumnas(tabla.columnas.map(c => ({ ...c, ancho })), tabla.x);
}

/**
 * Ajusta el conjunto de columnas al ancho de la tabla manteniendo las
 * proporciones. Hace falta cada vez que la tabla se estira: sin esto las
 * columnas se quedan con el ancho antiguo y la última se sale del marco.
 */
export function escalarColumnas(
  columnas: ColumnaDetectada[],
  anchoAnterior: number,
  anchoNuevo: number,
  xTabla: number,
): ColumnaDetectada[] {
  const proporcion = anchoNuevo / Math.max(1e-6, anchoAnterior);
  return recolocarColumnas(columnas.map(c => ({ ...c, ancho: c.ancho * proporcion })), xTabla);
}

/**
 * Valor de muestra de una columna, para pintar la tabla del editor con algo
 * que se parezca a una factura de verdad y no con celdas vacías.
 */
export function ejemploDeColumna(clave: string | null, fila: number): string {
  if (!clave) return '';
  if (esColumnaPersonalizada(clave)) return ['—', '—', '—'][fila % 3];

  const columna = COLUMNAS_LINEAS.find(c => c.clave === clave);
  if (!columna) return '';

  const variantes: Record<string, string[]> = {
    indice: ['1', '2', '3'],
    ref: ['REF-001', 'REF-002', 'REF-003'],
    descripcion: ['Caja de tomate rama primera', 'Saco de patata nueva 10 kg', 'Malla de cebolla dulce 2 kg'],
    cantidad: ['12', '8', '24'],
    unidad: ['ud', 'ud', 'ud'],
    cantidad_unidad: ['12 ud', '8 ud', '24 ud'],
    precio: ['14,90 €', '9,50 €', '3,20 €'],
    descuento_pct: ['—', '5%', '—'],
    impuesto_pct: ['21%', '10%', '21%'],
    importe: ['178,80 €', '76,00 €', '76,80 €'],
    importe_impuesto: ['37,55 €', '7,60 €', '16,13 €'],
    importe_total: ['216,35 €', '83,60 €', '92,93 €'],
  };

  return variantes[clave]?.[fila % 3] ?? columna.ejemplo;
}

// ============================================================
// CAMPOS
// ============================================================

/** Alineación por defecto de una columna según lo que vaya a contener. */
export function alineacionSugerida(clave: string | null): Alineacion {
  if (!clave) return 'left';
  return columnaDeLineas(clave)?.numerica ? 'right' : 'left';
}

export function campoNuevo(
  id: string,
  caja: Caja,
  opciones: { serif?: boolean; fijo?: boolean } = {},
): CampoDetectado {
  return {
    id,
    clave: null,
    tipo: 'texto',
    fijo: opciones.fijo ?? false,
    manual: true,
    texto: opciones.fijo ? 'Texto nuevo' : undefined,
    valorOriginal: '',
    etiquetaCercana: '',
    x: caja.x,
    y: caja.y,
    ancho: caja.ancho,
    alto: caja.alto,
    tamano: 9,
    alineacion: 'left',
    color: '#111111',
    negrita: false,
    cursiva: false,
    serif: opciones.serif ?? false,
    interlineado: 1.15,
    confianza: 1,
    motivo: opciones.fijo ? 'Rótulo escrito por ti' : 'Añadido a mano',
  };
}

/**
 * Copia un campo desplazado un poco, para que el duplicado se vea y no quede
 * exactamente encima del original.
 */
export function duplicarCampo(campo: CampoDetectado, id: string, pagina: { ancho: number; alto: number }): CampoDetectado {
  return {
    ...campo,
    id,
    manual: true,
    x: acotar(campo.x + 2, 0, Math.max(0, pagina.ancho - campo.ancho)),
    y: acotar(campo.y + 2, 0, Math.max(0, pagina.alto - campo.alto)),
    motivo: 'Copia de otro campo',
  };
}

/** Orden de lectura: de arriba abajo y, a la misma altura, de izquierda a derecha. */
export function ordenDeLectura(a: Caja, b: Caja): number {
  const filaA = Math.round(a.y * 2);
  const filaB = Math.round(b.y * 2);
  return filaA - filaB || a.x - b.x;
}

/**
 * Una rejilla dibujada a mano sobre un impreso que el detector no reconoció.
 *
 * Es lo que permite montar el cuadro de desglose de un impreso cualquiera sin
 * depender de que nuestras reglas entiendan cómo lo titula ese negocio. Nace
 * con las cuatro columnas del desglose español —concepto, base, tipo y
 * cuota—, repartidas por igual, y desde ahí se ajusta a mano.
 */
export function rejillaNueva(
  id: string,
  caja: { x: number; y: number; ancho: number; alto: number },
  familia: 'sans' | 'serif',
): RejillaDetectada {
  // Se reserva la primera banda para la cabecera que el impreso ya trae
  // pintada: los renglones empiezan por debajo de ella.
  const altoRenglon = Math.max(3.5, caja.alto / 5);
  const claves = ['nombre', 'base', 'tipo', 'cuota'];
  const ancho = caja.ancho / claves.length;

  return {
    id,
    fuente: 'impuestos',
    ...caja,
    yPrimerRenglon: caja.y + altoRenglon,
    altoRenglon,
    columnas: claves.map((clave, i) => ({
      clave,
      cabecera: etiquetaDeColumnaDeImpuestos(clave),
      x: caja.x + i * ancho,
      ancho,
      alineacion: clave === 'nombre' ? 'left' : 'right',
    })),
    // Sobre el papel no había nada escrito, así que no hay nada que tapar; y
    // como tampoco hay recuadro impreso debajo, se pinta el suyo.
    celdasMuestra: [],
    contorno: true,
    tamano: 9,
    negrita: false,
    cursiva: false,
    serif: familia === 'serif',
    color: '#000000',
  };
}

const etiquetaDeColumnaDeImpuestos = (clave: string) =>
  COLUMNAS_IMPUESTOS.find(c => c.clave === clave)?.cabeceraSugerida ?? clave;
