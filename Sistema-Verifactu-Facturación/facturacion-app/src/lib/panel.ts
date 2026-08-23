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
  | 'evolucion_ventas' | 'reparto_impuestos'
  | 'estado_verifactu'
  | 'gastos_mes'
  | 'comisiones_mes';

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
    explica: 'Lo facturado menos lo que costó, con los costes reconstruidos en orden de fecha.' },

  // --- Lo que hay que atender ---
  { id: 'proximos_vencimientos', nombre: 'Vencimientos próximos', tamano: 'mediana',
    explica: 'Lo que vence en los próximos días, para llamar antes y no después.' },
  { id: 'ultimas_facturas', nombre: 'Últimas facturas', tamano: 'mediana',
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
  { id: 'evolucion_ventas', nombre: 'Evolución de ventas', tamano: 'grande',
    explica: 'Los últimos doce meses, para ver la tendencia y no un mes suelto.' },
  { id: 'clientes_top', nombre: 'Mejores clientes', tamano: 'mediana',
    explica: 'Quién factura más, y cuánto pesa cada uno sobre el total.' },
  { id: 'productos_top', nombre: 'Más vendidos', tamano: 'mediana',
    explica: 'Los artículos que más salen, por importe o por unidades.' },
  { id: 'reparto_impuestos', nombre: 'Desglose de impuestos', tamano: 'mediana',
    explica: 'Bases y cuotas por tipo, para el trimestre.' },

  { id: 'gastos_mes', nombre: 'Gastos del mes', tamano: 'pequena', requiere: 'gastos',
    explica: 'Lo que se ha pagado este mes en alquiler, suministros y demás, sin contar la mercancía.' },
  { id: 'comisiones_mes', nombre: 'Comisiones del mes', tamano: 'pequena', requiere: 'comisiones',
    explica: 'Lo que se llevan los comerciales este mes, sumado entre todos.' },

  // --- Cumplimiento ---
  { id: 'estado_verifactu', nombre: 'Estado Veri*Factu', tamano: 'pequena',
    explica: 'Si la cadena de huellas está intacta y qué queda por enviar.' },
];

/**
 * El panel de salida.
 *
 * Cinco fichas, no dieciocho. Un panel que arranca lleno no se lee: se
 * ignora. Es mejor empezar con lo que le importa a cualquiera que factura
 * —cuánto he hecho, cuánto me deben, qué está vencido— y que cada uno añada
 * lo suyo.
 */
export const PANEL_POR_DEFECTO: FichaId[] = [
  'facturado_mes',
  'pendiente_cobro',
  'vencido',
  'evolucion_ventas',
  'ultimas_facturas',
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

/** Pone o quita una ficha del panel. Al ponerla, va al final. */
export function alternarFicha(panel: FichaId[], id: FichaId): FichaId[] {
  return panel.includes(id) ? panel.filter(f => f !== id) : [...panel, id];
}
