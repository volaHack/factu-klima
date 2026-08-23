/**
 * QUÉ PARTES DEL PROGRAMA VE CADA EMPRESA
 *
 * Un programa de gestión que lo enseña todo a todo el mundo es un programa
 * que no sirve a nadie. Al fontanero le sobra la trazabilidad por lotes, al
 * distribuidor de alimentación le sobra el número de colegiado, y a los dos
 * les sobra el menú del otro estorbando cada día.
 *
 * Los programas de gestión que llevan treinta años funcionando resuelven esto
 * igual: una lista de interruptores por instalación. Se enciende lo que esa
 * empresa usa y el resto no existe. No es una preferencia estética —es lo que
 * separa un programa que se aprende en una tarde de uno que necesita un curso.
 *
 * CÓMO SE DECIDE LO QUE SALE ENCENDIDO
 *
 * Por el sector, que ya se pregunta al empezar. Un taller mecánico arranca
 * con órdenes de trabajo y sin lotes; una distribuidora de alimentación al
 * revés, porque la trazabilidad alimentaria es obligatoria por ley y no
 * opcional. Nadie tiene que configurar nada para empezar a trabajar, y quien
 * quiera algo más lo enciende.
 *
 * LO QUE NO SE APAGA
 *
 * Facturar, cobrar y los clientes. Sin eso no hay programa, así que no son
 * módulos: son el suelo. Y Veri*Factu tampoco, porque no es una opción.
 */

import type { BusinessSector } from './types';

export type ModuloId =
  // --- Documentos ---
  | 'presupuestos' | 'pedidos' | 'albaranes' | 'rectificativas' | 'compras'
  // --- Almacén ---
  | 'almacenes' | 'lotes' | 'numeros_serie' | 'produccion'
  // --- Comercial ---
  | 'tarifas' | 'vendedores' | 'comisiones' | 'rappels' | 'rutas' | 'grupos_clientes'
  // --- Trabajo por proyecto ---
  | 'obras' | 'ordenes_trabajo'
  // --- Dinero ---
  | 'cartera' | 'gastos' | 'vehiculos'
  // --- Punto de venta ---
  | 'tpv'
  // --- Fiscal ---
  | 'retenciones' | 'sii' | 'intracomunitarias';

export type GrupoModulo = 'documentos' | 'almacen' | 'comercial' | 'proyecto' | 'dinero' | 'tpv' | 'fiscal';

export interface Modulo {
  id: ModuloId;
  nombre: string;
  grupo: GrupoModulo;
  /** Qué gana quien lo enciende, en una frase y sin jerga. */
  descripcion: string;
  /**
   * Módulos que tienen que estar encendidos para que éste sirva de algo.
   *
   * Las comisiones se calculan sobre lo que vende cada comercial: sin
   * vendedores no hay a quién comisionar, y el módulo sería una pantalla
   * vacía. Encender uno enciende lo que necesita.
   */
  requiere?: ModuloId[];
  /** true si ya está construido; false si está anunciado pero aún no existe. */
  disponible: boolean;
}

export const GRUPOS_MODULO: { id: GrupoModulo; nombre: string }[] = [
  { id: 'documentos', nombre: 'Documentos' },
  { id: 'almacen', nombre: 'Almacén y existencias' },
  { id: 'comercial', nombre: 'Fuerza de ventas' },
  { id: 'proyecto', nombre: 'Trabajo por proyecto' },
  { id: 'dinero', nombre: 'Cobros, pagos y gastos' },
  { id: 'tpv', nombre: 'Punto de venta' },
  { id: 'fiscal', nombre: 'Obligaciones fiscales' },
];

export const MODULOS: Modulo[] = [
  // --- Documentos ---
  { id: 'presupuestos', nombre: 'Presupuestos', grupo: 'documentos', disponible: true,
    descripcion: 'Ofertas que el cliente acepta o rechaza, y que se convierten en pedido o albarán sin volver a teclear nada.' },
  { id: 'pedidos', nombre: 'Pedidos', grupo: 'documentos', disponible: true,
    descripcion: 'Lo comprometido antes de servirlo. No mueve existencias hasta que sale el género.' },
  { id: 'albaranes', nombre: 'Albaranes', grupo: 'documentos', disponible: true,
    descripcion: 'La entrega, que es lo que mueve el almacén. Varios albaranes se agrupan luego en una factura.' },
  { id: 'rectificativas', nombre: 'Facturas rectificativas', grupo: 'documentos', disponible: true,
    descripcion: 'Para corregir una factura ya emitida, que es la única manera legal de hacerlo.' },
  { id: 'compras', nombre: 'Compras a proveedor', grupo: 'documentos', disponible: true,
    descripcion: 'Pedidos, albaranes y facturas de compra. Son los que alimentan el precio medio y el coste real.' },

  // --- Almacén ---
  { id: 'almacenes', nombre: 'Varios almacenes', grupo: 'almacen', disponible: true,
    descripcion: 'Existencias separadas por local, furgoneta u obra, con traspasos entre ellos.' },
  { id: 'lotes', nombre: 'Lotes y trazabilidad', grupo: 'almacen', disponible: true,
    descripcion: 'Qué lote se vendió a quién y con qué caducidad. Obligatorio por ley en alimentación: sin esto no se puede responder a una alerta sanitaria.' },
  { id: 'numeros_serie', nombre: 'Números de serie', grupo: 'almacen', disponible: true,
    descripcion: 'Seguir una unidad concreta desde que entra hasta la garantía. Para aparatos, maquinaria y electrónica.' },
  { id: 'produccion', nombre: 'Fabricación', grupo: 'almacen', disponible: false,
    descripcion: 'Escandallos: qué componentes consume cada artículo fabricado y cuánto cuesta producirlo.' },

  // --- Comercial ---
  { id: 'tarifas', nombre: 'Tarifas y precios especiales', grupo: 'comercial', disponible: true,
    descripcion: 'Varios precios por artículo y el suyo para cada cliente, sin descuentos a mano en cada línea.' },
  { id: 'vendedores', nombre: 'Vendedores', grupo: 'comercial', disponible: true,
    descripcion: 'Cada comercial con su serie de numeración, su almacén y sus clientes.' },
  { id: 'comisiones', nombre: 'Comisiones', grupo: 'comercial', requiere: ['vendedores'], disponible: true,
    descripcion: 'Lo que se lleva cada comercial, sobre lo facturado o sobre lo cobrado, y por artículo o por cliente.' },
  { id: 'rappels', nombre: 'Rappels por volumen', grupo: 'comercial', disponible: true,
    descripcion: 'Descuentos que se ganan al llegar a un volumen y se liquidan al cerrar el periodo, no en cada factura.' },
  { id: 'rutas', nombre: 'Rutas de reparto', grupo: 'comercial', requiere: ['albaranes'], disponible: true,
    descripcion: 'Agrupar clientes por ruta y día, y sacar el reparto de la jornada en una hoja.' },
  { id: 'grupos_clientes', nombre: 'Grupos y cadenas', grupo: 'comercial', disponible: true,
    descripcion: 'Clientes que pertenecen a una cadena o central de compras, para facturar y analizar en conjunto.' },

  // --- Trabajo por proyecto ---
  { id: 'obras', nombre: 'Obras y expedientes', grupo: 'proyecto', disponible: true,
    descripcion: 'Agrupar todo lo de un proyecto —horas, materiales, gastos— y saber lo que deja cada uno por separado.' },
  { id: 'ordenes_trabajo', nombre: 'Órdenes de trabajo', grupo: 'proyecto', disponible: true,
    descripcion: 'El parte de un servicio: qué se hizo, quién, cuántas horas y qué materiales se gastaron.' },

  // --- Dinero ---
  { id: 'cartera', nombre: 'Cartera de efectos', grupo: 'dinero', disponible: true,
    descripcion: 'Vencimientos por cobrar y por pagar, con lo pendiente a una fecha y las remesas al banco.' },
  { id: 'gastos', nombre: 'Gastos', grupo: 'dinero', disponible: true,
    descripcion: 'Lo que se paga y no es mercancía: alquiler, suministros, dietas. Entra en el resultado y en el IVA soportado.' },
  { id: 'vehiculos', nombre: 'Vehículos', grupo: 'dinero', requiere: ['gastos'], disponible: true,
    descripcion: 'Combustible, mantenimiento y seguro por vehículo, para saber lo que cuesta cada furgoneta.' },

  // --- TPV ---
  { id: 'tpv', nombre: 'Punto de venta', grupo: 'tpv', disponible: true,
    descripcion: 'Caja rápida con tickets, arqueo y cobro en efectivo o tarjeta.' },

  // --- Fiscal ---
  { id: 'retenciones', nombre: 'Retención de IRPF', grupo: 'fiscal', disponible: false,
    descripcion: 'La retención en factura de profesionales y de obra, con su resumen para el modelo 111.' },
  { id: 'sii', nombre: 'SII (envío inmediato)', grupo: 'fiscal', disponible: false,
    descripcion: 'Envío de los libros de IVA a la Agencia Tributaria en cuatro días. Obligatorio por encima de seis millones de facturación.' },
  { id: 'intracomunitarias', nombre: 'Operaciones intracomunitarias', grupo: 'fiscal', disponible: false,
    descripcion: 'Ventas y compras a otros países de la Unión, con el modelo 349.' },
];

/**
 * Con qué módulos arranca cada sector.
 *
 * La lista es corta a propósito. Es más fácil encender algo que se echa en
 * falta que descubrir que llevas un mes con seis menús que no usas, y un
 * programa que arranca con todo encendido asusta el primer día.
 *
 * Sólo se nombran los que van ENCENDIDOS; el resto arranca apagado.
 */
const POR_SECTOR: Partial<Record<BusinessSector, ModuloId[]>> = {
  // --- Los que mueven género ---
  alimentacion: ['presupuestos', 'pedidos', 'albaranes', 'rectificativas', 'compras', 'almacenes', 'lotes', 'tarifas', 'vendedores', 'cartera'],
  supermercado: ['rectificativas', 'compras', 'tpv', 'almacenes'],
  mayorista: ['presupuestos', 'pedidos', 'albaranes', 'rectificativas', 'compras', 'almacenes', 'tarifas', 'vendedores', 'rappels', 'cartera'],
  bebidas: ['pedidos', 'albaranes', 'rectificativas', 'compras', 'almacenes', 'tarifas', 'vendedores', 'rutas', 'cartera'],
  servicios_industriales: ['presupuestos', 'pedidos', 'albaranes', 'rectificativas', 'compras', 'almacenes', 'tarifas', 'cartera'],

  // --- Salud: consulta, cobro y poco más. Sin almacén ni albaranes ---
  psicologia: ['rectificativas', 'cartera'],
  medicina: ['rectificativas', 'cartera'],
  dental: ['presupuestos', 'rectificativas', 'cartera'],
  fisioterapia: ['rectificativas', 'cartera'],
  nutricion: ['rectificativas', 'cartera'],
  veterinaria: ['rectificativas', 'compras', 'tpv', 'cartera'],

  // --- Despachos: presupuesto, minuta y retención ---
  abogacia: ['presupuestos', 'rectificativas', 'retenciones', 'obras', 'cartera'],
  procuraduria: ['rectificativas', 'retenciones', 'obras', 'cartera'],
  asesoria: ['rectificativas', 'retenciones', 'cartera'],
  peritaje: ['presupuestos', 'rectificativas', 'retenciones', 'cartera'],
  traduccion: ['presupuestos', 'rectificativas', 'retenciones', 'cartera'],

  // --- Técnicos y creativos: proyecto, fases y horas ---
  arquitectura: ['presupuestos', 'rectificativas', 'retenciones', 'obras', 'cartera'],
  interiorismo: ['presupuestos', 'pedidos', 'rectificativas', 'obras', 'cartera'],
  ingenieria: ['presupuestos', 'rectificativas', 'retenciones', 'obras', 'cartera'],
  informatica: ['presupuestos', 'rectificativas', 'obras', 'cartera'],
  diseno: ['presupuestos', 'rectificativas', 'retenciones', 'obras', 'cartera'],
  fotografia: ['presupuestos', 'rectificativas', 'obras', 'cartera'],
  marketing: ['presupuestos', 'rectificativas', 'obras', 'cartera'],
  formacion: ['presupuestos', 'rectificativas', 'cartera'],
  clases: ['rectificativas', 'cartera'],
  freelance: ['presupuestos', 'rectificativas', 'retenciones', 'cartera'],

  // --- Oficios: parte de trabajo, materiales y desplazamiento ---
  electricidad: ['presupuestos', 'albaranes', 'rectificativas', 'compras', 'almacenes', 'ordenes_trabajo', 'obras', 'cartera'],
  fontaneria: ['presupuestos', 'albaranes', 'rectificativas', 'compras', 'ordenes_trabajo', 'cartera'],
  reformas: ['presupuestos', 'albaranes', 'rectificativas', 'compras', 'obras', 'retenciones', 'cartera'],
  taller: ['presupuestos', 'rectificativas', 'compras', 'almacenes', 'ordenes_trabajo', 'vehiculos', 'gastos', 'cartera'],
  limpieza: ['presupuestos', 'rectificativas', 'ordenes_trabajo', 'cartera'],
  transporte: ['presupuestos', 'albaranes', 'rectificativas', 'rutas', 'vehiculos', 'gastos', 'cartera'],

  // --- Servicios al público: caja y bonos ---
  peluqueria: ['rectificativas', 'compras', 'tpv', 'cartera'],
  estetica: ['rectificativas', 'compras', 'tpv', 'cartera'],
  eventos: ['presupuestos', 'rectificativas', 'cartera'],
  inmobiliaria: ['rectificativas', 'retenciones', 'obras', 'cartera'],
};

/** Con qué arranca quien no tiene sector puesto todavía. */
const POR_DEFECTO: ModuloId[] = ['presupuestos', 'albaranes', 'rectificativas', 'compras', 'cartera'];

export function modulosPorDefecto(sector?: BusinessSector): ModuloId[] {
  const base = (sector && POR_SECTOR[sector]) || POR_DEFECTO;
  // Sólo lo que existe de verdad: anunciar un menú que abre una pantalla en
  // blanco es peor que no anunciarlo.
  return base.filter(id => MODULOS.find(m => m.id === id)?.disponible);
}

/**
 * Enciende un módulo, y con él lo que necesita para servir de algo.
 *
 * Las comisiones sin vendedores son una pantalla vacía, así que encender uno
 * arrastra el otro en vez de dejar al usuario adivinando por qué no funciona.
 */
export function encender(activos: ModuloId[], id: ModuloId): ModuloId[] {
  const salida = new Set(activos);
  const pendientes: ModuloId[] = [id];
  while (pendientes.length > 0) {
    const actual = pendientes.pop()!;
    if (salida.has(actual)) continue;
    salida.add(actual);
    const modulo = MODULOS.find(m => m.id === actual);
    for (const req of modulo?.requiere ?? []) pendientes.push(req);
  }
  return [...salida];
}

/**
 * Apaga un módulo, y con él los que dependían de él.
 *
 * Dejar las comisiones encendidas después de apagar los vendedores deja un
 * menú que no puede funcionar. Se apaga en cadena.
 */
export function apagar(activos: ModuloId[], id: ModuloId): ModuloId[] {
  const fuera = new Set<ModuloId>([id]);
  let cambio = true;
  while (cambio) {
    cambio = false;
    for (const m of MODULOS) {
      if (fuera.has(m.id)) continue;
      if ((m.requiere ?? []).some(r => fuera.has(r))) {
        fuera.add(m.id);
        cambio = true;
      }
    }
  }
  return activos.filter(a => !fuera.has(a));
}

/** Si una empresa tiene encendido un módulo. */
export function tieneModulo(activos: ModuloId[] | undefined, id: ModuloId): boolean {
  return (activos ?? []).includes(id);
}
