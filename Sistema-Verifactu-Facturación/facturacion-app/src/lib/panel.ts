/**
 * EL PANEL QUE CADA EMPRESA SE MONTA
 *
 * Lo primero que se ve al entrar debería ser lo que a ESA empresa le quita el
 * sueño, y no lo mismo para todos. Al de la distribuidora le importa lo que
 * está por cobrar y lo que se va a quedar sin existencias; al fisioterapeuta,
 * los bonos que se le acaban a los pacientes y las facturas del mes. Un panel
 * fijo obliga a los dos a mirar la mitad de la pantalla que no les sirve.
 *
 * Así que el panel es una lista de fichas que se eligen, se ordenan y se
 * apagan. Se guarda con los ajustes de la empresa, no en el navegador: quien
 * entra desde el móvil por la tarde espera ver lo mismo que dejó puesto en el
 * ordenador por la mañana.
 *
 * CADA FICHA SABE LO QUE NECESITA
 *
 * Una ficha de existencias no pinta nada en una asesoría, que no tiene
 * almacén. En vez de dejar que el usuario la coloque y se encuentre un cero,
 * cada ficha declara de qué módulo depende y sólo se ofrece si ese módulo
 * está encendido.
 */

import type { ModuloId } from './modulos';

export type FichaId =
  | 'facturado_mes' | 'pendiente_cobro' | 'vencido' | 'cobrado_mes'
  | 'proximos_vencimientos' | 'ultimas_facturas' | 'borradores'
  | 'clientes_top' | 'productos_top' | 'margen_mes'
  | 'stock_bajo' | 'sin_movimiento'
  | 'albaranes_sin_facturar' | 'presupuestos_abiertos' | 'pedidos_pendientes'
  | 'compras_pendientes'
  | 'evolucion_ventas' | 'reparto_estado' | 'reparto_impuestos' | 'analisis_negocio'
  | 'facturado_cobrado' | 'formas_pago'
  | 'estado_verifactu'
  | 'gastos_mes'
  | 'obras_abiertas'
  | 'ordenes_atrasadas'
  | 'lotes_caducando';

export type TamanoFicha = 'pequena' | 'mediana' | 'grande';

export interface Ficha {
  id: FichaId;
  nombre: string;
  /** Qué contesta, en una frase. Es lo que se lee al elegirla. */
  explica: string;
  tamano: TamanoFicha;
  /** Sin este módulo la ficha no tiene datos que enseñar. */
  requiere?: ModuloId;
}

export const FICHAS: Ficha[] = [
  // --- Los cuatro números de cabecera ---
  { id: 'facturado_mes', nombre: 'Facturado este mes', tamano: 'pequena',
    explica: 'Lo emitido en el mes en curso, comparado con el mismo mes del año pasado.' },
  { id: 'pendiente_cobro', nombre: 'Pendiente de cobro', tamano: 'pequena',
    explica: 'Lo que está facturado y todavía no ha entrado.' },
  { id: 'vencido', nombre: 'Vencido sin cobrar', tamano: 'pequena',
    explica: 'Lo que ya pasó su fecha de pago. Es el número que hay que mirar todos los días.' },
  { id: 'cobrado_mes', nombre: 'Cobrado este mes', tamano: 'pequena',
    explica: 'Lo que ha entrado de verdad en el mes, que no es lo mismo que lo facturado.' },
  { id: 'margen_mes', nombre: 'Margen del mes', tamano: 'pequena',
    explica: 'Lo vendido este mes sin impuestos menos lo que costó, con el coste de compra de cada artículo.' },

  // --- Lo que hay que atender ---
  { id: 'proximos_vencimientos', nombre: 'Vencimientos próximos', tamano: 'mediana',
    explica: 'Lo que vence en los próximos días, para llamar antes y no después.' },
  // Tabla de seis columnas: a media anchura los nombres se partían en cuatro renglones.
  { id: 'ultimas_facturas', nombre: 'Últimas facturas', tamano: 'grande',
    explica: 'Lo último emitido, con su estado de cobro.' },
  { id: 'borradores', nombre: 'Borradores sin emitir', tamano: 'pequena',
    explica: 'Documentos empezados y no terminados. Se olvidan y no se cobran.' },
  { id: 'albaranes_sin_facturar', nombre: 'Albaranes sin facturar', tamano: 'mediana', requiere: 'albaranes',
    explica: 'Género entregado que todavía no se ha facturado. Dinero servido y no pedido.' },
  { id: 'presupuestos_abiertos', nombre: 'Presupuestos abiertos', tamano: 'mediana', requiere: 'presupuestos',
    explica: 'Ofertas enviadas esperando respuesta, con los días que llevan sin contestar.' },
  { id: 'pedidos_pendientes', nombre: 'Pedidos por servir', tamano: 'mediana', requiere: 'pedidos',
    explica: 'Lo comprometido con el cliente y aún no entregado.' },
  { id: 'compras_pendientes', nombre: 'Pendiente de recibir', tamano: 'mediana', requiere: 'compras',
    explica: 'Lo pedido al proveedor que todavía no ha llegado.' },

  // --- Almacén ---
  { id: 'stock_bajo', nombre: 'Bajo mínimos', tamano: 'mediana',
    explica: 'Artículos por debajo de su mínimo. Se ve antes de quedarse sin ellos, no después.' },
  { id: 'sin_movimiento', nombre: 'Parado en almacén', tamano: 'mediana', requiere: 'almacenes',
    explica: 'Lo que lleva meses sin venderse y tiene dinero inmovilizado encima.' },

  // --- Análisis ---
  { id: 'evolucion_ventas', nombre: 'Evolución de ventas', tamano: 'mediana',
    explica: 'Los últimos doce meses, para ver la tendencia y no un mes suelto.' },
  { id: 'reparto_estado', nombre: 'Reparto por estado', tamano: 'mediana',
    explica: 'Cuántas facturas hay pagadas, pendientes, vencidas o en borrador.' },
  { id: 'clientes_top', nombre: 'Mejores clientes', tamano: 'mediana',
    explica: 'Quién factura más, y cuánto pesa cada uno sobre el total.' },
  { id: 'productos_top', nombre: 'Más vendidos', tamano: 'mediana',
    explica: 'Los artículos que más salen, por importe o por unidades.' },
  { id: 'reparto_impuestos', nombre: 'Desglose de impuestos', tamano: 'mediana',
    explica: 'Bases y cuotas por tipo, para el trimestre.' },
  { id: 'facturado_cobrado', nombre: 'Facturado y cobrado', tamano: 'mediana',
    explica: 'Lo emitido cada mes frente a lo que entró ese mes, para ver si la caja se queda atrás.' },
  { id: 'formas_pago', nombre: 'Cómo te pagan', tamano: 'mediana',
    explica: 'Cuánto se factura por transferencia, tarjeta, Bizum, efectivo… en los últimos doce meses.' },
  { id: 'analisis_negocio', nombre: 'Análisis del negocio', tamano: 'grande',
    explica: 'Ritmo del mes, días y semanas que más venden, estado y antigüedad del cobro, quién tarda en pagar, cómo se mueven los mejores clientes y de qué categorías sale la facturación.' },

  { id: 'gastos_mes', nombre: 'Gastos del mes', tamano: 'pequena', requiere: 'gastos',
    explica: 'Lo que se ha pagado este mes en alquiler, suministros y demás, sin contar la mercancía.' },
  { id: 'obras_abiertas', nombre: 'Obras abiertas', tamano: 'mediana', requiere: 'obras',
    explica: 'Los proyectos en marcha, con lo que llevan facturado, gastado y de margen hasta ahora.' },
  { id: 'ordenes_atrasadas', nombre: 'Órdenes atrasadas', tamano: 'mediana', requiere: 'ordenes_trabajo',
    explica: 'Avisos que llevan más de una semana abiertos sin cerrarse.' },
  { id: 'lotes_caducando', nombre: 'Lotes por caducar', tamano: 'mediana', requiere: 'lotes',
    explica: 'Lo que caduca en los próximos siete días y todavía queda en el almacén.' },

  // --- Cumplimiento ---
  // La barra de Veri*Factu ocupa todo el ancho: va como «grande».
  { id: 'estado_verifactu', nombre: 'Estado Veri*Factu', tamano: 'grande',
    explica: 'Si la cadena de huellas está intacta y qué queda por enviar.' },
];
// Comisiones, rappels, SII e intracomunitarias salieron del catálogo: cada
// una tiene su pantalla con su cálculo, y aquí se ofrecían sin que el panel
// supiera pintarlas. Un panel guardado que las tenga, sencillamente no las
// enseña (ver `fichasVisibles`).

/**
 * Con lo que arranca un panel que nadie ha tocado.
 *
 * Es exactamente lo que el panel enseñaba antes de que esta lista mandara
 * de verdad: quien ya estaba usando el programa no se encuentra el panel
 * medio vacío el día que esto se despliega, y quien entra nuevo ve lo
 * mismo que veía todo el mundo.
 */
export const PANEL_POR_DEFECTO: FichaId[] = [
  'facturado_mes',
  'pendiente_cobro',
  'vencido',
  'estado_verifactu',
  'evolucion_ventas',
  'reparto_estado',
  'ultimas_facturas',
  'clientes_top',
  'productos_top',
  'proximos_vencimientos',
  'facturado_cobrado',
  'formas_pago',
  'analisis_negocio',
];

/**
 * Las fichas que esta empresa puede usar, según los módulos que tenga.
 *
 * Una ficha huérfana —cuyo módulo se apagó después de colocarla— desaparece
 * del panel sin borrarse de los ajustes: si el módulo se vuelve a encender,
 * la ficha vuelve donde estaba en vez de haber que recolocarla.
 */
export function fichasDisponibles(modulos: ModuloId[] | undefined): Ficha[] {
  const activos = new Set(modulos ?? []);
  return FICHAS.filter(f => !f.requiere || activos.has(f.requiere));
}

/** Las fichas de un panel guardado que hoy se pueden pintar, en su orden. */
export function fichasVisibles(panel: FichaId[] | undefined, modulos: ModuloId[] | undefined): Ficha[] {
  const puede = new Set(fichasDisponibles(modulos).map(f => f.id));
  return (panel ?? PANEL_POR_DEFECTO)
    .filter(id => puede.has(id))
    .map(id => FICHAS.find(f => f.id === id))
    .filter((f): f is Ficha => f !== undefined);
}

/** Mueve una ficha una posición arriba o abajo. */
export function mover(panel: FichaId[], id: FichaId, direccion: -1 | 1): FichaId[] {
  const i = panel.indexOf(id);
  const j = i + direccion;
  if (i < 0 || j < 0 || j >= panel.length) return panel;
  const salida = [...panel];
  [salida[i], salida[j]] = [salida[j], salida[i]];
  return salida;
}

/**
 * CÓMO SE COLOCAN EN PANTALLA
 *
 * Las cifras sueltas («pequeñas») van juntas en la fila de arriba, en el
 * orden elegido. Las tarjetas grandes ocupan todo el ancho y cortan donde
 * estén. Las medianas, entre corte y corte, se reparten en dos columnas por
 * turnos: la 1.ª a la izquierda, la 2.ª a la derecha, la 3.ª a la izquierda…
 * Así se lee en el orden elegido, de izquierda a derecha y de arriba abajo,
 * sin huecos entre tarjetas de distinto alto.
 */
export type Bloque = { tipo: 'grande'; id: FichaId } | { tipo: 'pareja'; izquierda: FichaId[]; derecha: FichaId[] };

export function colocar(fichas: Ficha[]): { cifras: FichaId[]; bloques: Bloque[] } {
  const cifras = fichas.filter(f => f.tamano === 'pequena').map(f => f.id);
  const bloques: Bloque[] = [];
  let actual: { tipo: 'pareja'; izquierda: FichaId[]; derecha: FichaId[] } | null = null;
  let n = 0;
  for (const f of fichas) {
    if (f.tamano === 'pequena') continue;
    if (f.tamano === 'grande') {
      actual = null;
      bloques.push({ tipo: 'grande', id: f.id });
      continue;
    }
    if (!actual) { actual = { tipo: 'pareja', izquierda: [], derecha: [] }; bloques.push(actual); n = 0; }
    (n++ % 2 === 0 ? actual.izquierda : actual.derecha).push(f.id);
  }
  return { cifras, bloques };
}

/** Pone o quita una ficha del panel. Al ponerla, va al final. */
export function alternarFicha(panel: FichaId[], id: FichaId): FichaId[] {
  return panel.includes(id) ? panel.filter(f => f !== id) : [...panel, id];
}
