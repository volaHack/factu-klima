import type { ModuloId } from './modulos';
import type { FichaId } from './panel';
// ============================================================
// TIPOS DEL SISTEMA DE FACTURACIÓN (MULTI-SECTOR)
// ============================================================

// --- Enums ---

export enum InvoiceStatus {
  BORRADOR = 'borrador',
  PRE_APROBACION = 'pre_aprobacion',
  APROBADO = 'aprobado',
  APROBADO_PARCIAL = 'aprobado_parcial',
  RECHAZADO = 'rechazado',
  EMITIDA = 'emitida',
  PENDIENTE = 'pendiente',
  PARCIAL = 'parcial',
  PAGADA = 'pagada',
  VENCIDA = 'vencida',
  ANULADA = 'anulada',
  EXPEDIDO = 'expedido',
  FACTURADO = 'facturado',
}

export type TipoDocumento = 'presupuesto' | 'pedido' | 'albaran' | 'factura' | 'rectificativa';
export type SentidoDocumento = 'venta' | 'compra';

/**
 * Tipo de factura para la AEAT (Verifactu / SII).
 *
 * F1 = factura completa, F2 = simplificada (ticket TPV), F3 = emitida en
 * sustitución de simplificadas. R1–R5 son rectificativas.
 * Se resuelve automáticamente según el tipo de documento y el origen.
 */
export type TipoFacturaFiscal =
  | 'F1' | 'F2' | 'F3'
  | 'R1' | 'R2' | 'R3' | 'R4' | 'R5';

/**
 * Clave de régimen especial de IVA (campo obligatorio en Verifactu y SII).
 *
 * 01 = Régimen general, 02 = Exportación, 05 = Régimen especial de criterio
 * de caja, 09 = Entregas intracomunitarias, etc. La lista completa viene
 * de la Orden HAC/1177/2024 y la documentación técnica del SII.
 */
export type ClaveRegimenIva =
  | '01'  // Régimen general
  | '02'  // Exportación
  | '03'  // Operaciones a las que se aplique el régimen especial de bienes usados
  | '04'  // Régimen especial de oro de inversión
  | '05'  // Régimen especial de agencias de viaje
  | '06'  // Régimen especial grupo de entidades en IVA (nivel avanzado)
  | '07'  // Régimen especial grupo de entidades en IVA e IGIC (nivel avanzado)
  | '08'  // Régimen especial criterio de caja
  | '09'  // Operaciones sujetas al IPSI/IGIC (Canarias, Ceuta, Melilla)
  | '10'  // Adquisiciones intracomunitarias de bienes y prestaciones de servicios
  | '11'  // Entregas intracomunitarias exentas
  | '12'  // Operaciones no sujetas o con inversión del sujeto pasivo
  | '13'  // Facturaciones de prestaciones de servicios de agencias de viaje
  | '14'  // Cobros por cuenta de terceros (art. 5 RD 1619/2012)
  | '15'  // Régimen especial de IVA de grupos de entidades. Art. 163 sexies.cinco LIVA
  | '16'  // Régimen especial de ventanilla única
  | '17'; // Recargo de equivalencia

export interface SerieDocumento {
  serie: string;
  nextNumber: number;
}

export enum PaymentMethod {
  TRANSFERENCIA = 'transferencia',
  EFECTIVO = 'efectivo',
  DOMICILIACION = 'domiciliacion',
  PAGARE = 'pagare',
  TARJETA = 'tarjeta',
  BIZUM = 'bizum',
}

export enum ProductCategory {
  FRUTAS = 'frutas',
  VERDURAS = 'verduras',
  LACTEOS = 'lacteos',
  CARNICOS = 'carnicos',
  PESCADOS = 'pescados',
  CONGELADOS = 'congelados',
  BEBIDAS = 'bebidas',
  CONSERVAS = 'conservas',
  PANADERIA = 'panaderia',
  OTROS = 'otros',
}

export enum TaxRate {
  // --- IVA (Régimen General — Península e Islas Baleares) ---
  GENERAL = 21,
  REDUCIDO = 10,
  SUPERREDUCIDO = 4,
  EXENTO = 0,

  // --- IGIC (Impuesto General Indirecto Canario — Canarias) ---
  IGIC_GENERAL = 7,
  IGIC_REDUCIDO = 3,
  IGIC_INCREMENTADO = 13,
  // IGIC exento también usa 0, compartido con EXENTO
}

export enum UnitOfMeasure {
  KG = 'kg',
  UNIDAD = 'ud',
  CAJA = 'caja',
  PALET = 'palet',
  LITRO = 'litro',
  DOCENA = 'docena',
  PACK = 'pack',
}

/**
 * A qué se dedica quien factura.
 *
 * Manda qué categorías de producto salen de fábrica y qué conceptos se
 * sugieren en las líneas, así que un fontanero no tiene que borrar «Frutas
 * frescas» para escribir «Mano de obra».
 *
 * Los cinco primeros venden género; los demás venden trabajo, y sus
 * «categorías» son conceptos de factura —una sesión, una minuta, una partida
 * de obra— en vez de familias de artículos.
 */
export type BusinessSector =
  | 'alimentacion' | 'supermercado' | 'mayorista' | 'bebidas' | 'servicios_industriales'
  | 'psicologia'
  | 'medicina'
  | 'dental'
  | 'fisioterapia'
  | 'nutricion'
  | 'veterinaria'
  | 'abogacia'
  | 'procuraduria'
  | 'asesoria'
  | 'peritaje'
  | 'traduccion'
  | 'arquitectura'
  | 'interiorismo'
  | 'ingenieria'
  | 'informatica'
  | 'diseno'
  | 'fotografia'
  | 'marketing'
  | 'formacion'
  | 'clases'
  | 'freelance'
  | 'electricidad'
  | 'fontaneria'
  | 'reformas'
  | 'taller'
  | 'limpieza'
  | 'transporte'
  | 'peluqueria'
  | 'estetica'
  | 'eventos'
  | 'inmobiliaria';

/** Familia a la que pertenece un sector, para agrupar el selector. */
export type GrupoSector = 'comercio' | 'salud' | 'profesional' | 'tecnico' | 'oficio' | 'publico';

// Modo de uso del TPV: afecta al grid de productos (denso IA), la venta por
// peso (PLU) y las mesas con cuentas abiertas.
export type TpvMode = 'tienda' | 'supermercado' | 'restaurante';
export type AccentTheme = 'rose' | 'wine' | 'terracotta' | 'plum';

export interface Tarifa {
  id: string;
  nombre: string;
  activa: boolean;
  porcentajeDefecto?: number;
}

export interface Almacen {
  id: string;
  codigo: string;
  nombre: string;
  direccion?: string;
  principal: boolean;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TraspasoLineItem {
  id: string;
  productId: string;
  productName: string;
  productRef: string;
  quantity: number;
  unit?: UnitOfMeasure;
}

export interface TraspasoAlmacen {
  id: string;
  number: string;
  origenAlmacenId: string;
  origenAlmacenNombre: string;
  destinoAlmacenId: string;
  destinoAlmacenNombre: string;
  fecha: string;
  lineItems: TraspasoLineItem[];
  notas?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RegularizacionStock {
  id: string;
  fecha: string;
  almacenId: string;
  almacenNombre: string;
  productId: string;
  productName: string;
  productRef: string;
  stockTeorico: number;
  stockReal: number;
  diferencia: number;
  motivo: string;
  notas?: string;
  createdAt: string;
}

/**
 * En qué se va el dinero que no es mercancía.
 *
 * Alquiler, suministros, dietas, seguros: entra en el resultado del negocio
 * y en el IVA soportado del trimestre, pero no es una compra de género y no
 * pasa por el almacén.
 */
export type GastoCategoria =
  | 'alquiler' | 'suministros' | 'personal' | 'vehiculo' | 'material'
  | 'servicios' | 'impuestos' | 'seguros' | 'otros';

export interface Gasto {
  id: string;
  fecha: string;
  concepto: string;
  categoria: GastoCategoria;
  proveedorId?: string;
  proveedorNombre?: string;
  baseImponible: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  paymentMethod: PaymentMethod;
  /** A qué vehículo se le imputa, si es un gasto de flota. */
  vehiculoId?: string;
  /** A qué obra o expediente se le imputa este gasto. */
  obraId?: string;
  notas?: string;

  /* --- Clasificación fiscal (migración 036) ---
     Soportar una cuota y poder deducirla son dos cosas distintas, y los
     modelos 303 y 420 las piden separadas y por tipo de operación. */

  /** Si la cuota soportada da derecho a deducción. Por defecto sí. */
  deducible?: boolean;
  /** A qué casilla del 303/420 va la cuota. Ver la migración 036. */
  tipoOperacion?: TipoOperacionGasto;
  /** Cuota realmente deducible si es menor que `taxAmount` (prorrata,
   *  afectación parcial). Sin valor = se deduce entera. */
  cuotaDeducible?: number;

  createdAt: string;
  updatedAt: string;
}

/** Tipos de operación de un gasto, tal y como los separa el modelo 303. */
export type TipoOperacionGasto =
  | 'interior_corriente'
  | 'interior_inversion'
  | 'importacion_corriente'
  | 'importacion_inversion'
  | 'intracomunitaria_corriente'
  | 'intracomunitaria_inversion'
  | 'inversion_sujeto_pasivo'
  | 'no_sujeta'
  | 'exenta';

/** Régimen de IRPF del empresario: decide si le toca el 130 o el 131. */
export type RegimenIrpf =
  | 'directa_normal'
  | 'directa_simplificada'
  | 'objetiva'
  | 'no_aplica';

/**
 * Un vehículo de la empresa, para saber lo que cuesta cada furgoneta.
 *
 * No lleva más que lo imprescindible para identificarlo: el coste de verdad
 * —combustible, mantenimiento, seguro— vive en los gastos que se le imputan,
 * no aquí. Duplicarlo en dos sitios es la manera segura de que se
 * desincronicen.
 */
export interface Vehiculo {
  id: string;
  matricula: string;
  nombre?: string;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * UNA OBRA O EXPEDIENTE
 *
 * Lo que agrupa el trabajo de un proyecto entero: un abogado la llama
 * expediente, un arquitecto obra, un fontanero simplemente «el trabajo de
 * casa de fulano». Es la misma idea con otro nombre: un cajón donde caen las
 * facturas, los albaranes y los gastos de ESE proyecto, para saber al final
 * si ha dejado dinero o lo ha costado.
 */
export type EstadoObra = 'abierta' | 'cerrada';

export interface Obra {
  id: string;
  numero: string;
  nombre: string;
  clienteId?: string;
  clienteNombre?: string;
  estado: EstadoObra;
  fechaApertura: string;
  fechaCierre?: string;
  /** Lo presupuestado, si se pactó de antemano. Sólo referencia: no limita nada. */
  presupuesto?: number;
  notas?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * EL PARTE DE UN SERVICIO
 *
 * Qué se hizo, quién, cuántas horas y qué materiales se gastaron. Para quien
 * no vende género sino intervenciones: un fontanero, un electricista, un
 * taller, una empresa de limpieza. Se abre al llegar el aviso, se cierra al
 * terminar, y de ahí sale la factura —o no, si es garantía.
 */
export type EstadoOrdenTrabajo = 'abierta' | 'en_curso' | 'cerrada';

export interface OrdenTrabajo {
  id: string;
  numero: string;
  clienteId?: string;
  clienteNombre?: string;
  descripcion: string;
  estado: EstadoOrdenTrabajo;
  fecha: string;
  /** Quién la atiende. Apunta a Vendedor, que aquí hace de técnico de campo, no de comercial. */
  tecnicoId?: string;
  horas?: number;
  /** Qué se ha gastado en materiales, en texto libre: una lista de partes es una obra, no una orden suelta. */
  materiales?: string;
  /** Si es parte de un proyecto más grande. */
  obraId?: string;
  /** La factura en la que acabó, si se facturó. */
  invoiceId?: string;
  notas?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * UN LOTE DE PRODUCTO
 *
 * Trazabilidad alimentaria: qué lote se vendió a quién y con qué caducidad.
 * No es opcional en distribución de alimentación —es obligación legal, para
 * poder responder a una alerta sanitaria retirando exactamente lo que hay
 * que retirar y a quién avisar, sin tener que revisar factura por factura.
 *
 * Las existencias del lote se descuentan al expedir el albarán que lo
 * vende, igual que el stock del producto: es el mismo momento en que la
 * mercancía sale de verdad por la puerta.
 */
export interface Lote {
  id: string;
  productId: string;
  productRef: string;
  productName: string;
  /** El código del lote, casi siempre el que trae el proveedor. */
  codigo: string;
  fechaEntrada: string;
  fechaCaducidad?: string;
  cantidadEntrada: number;
  /** Lo que queda sin vender. Baja al expedir un albarán que use este lote. */
  cantidadDisponible: number;
  proveedorId?: string;
  proveedorNombre?: string;
  notas?: string;
  /**
   * EN QUÉ SITUACIÓN ESTÁ EL LOTE.
   *
   * Es lo que faltaba para poder FRENAR un lote. Hasta ahora la
   * trazabilidad sabía decir a quién se le había servido el lote L-4471,
   * pero nada impedía seguir vendiéndolo mientras se averiguaba: el aviso
   * de la agencia de seguridad alimentaria llegaba y el género seguía
   * saliendo por la puerta.
   *
   * - `disponible`: se vende con normalidad.
   * - `inmovilizado`: retenido mientras se comprueba. No se puede vender,
   *   pero sigue en el almacén y puede volver a liberarse.
   * - `retirado`: fuera de circulación para siempre. No se vende ni se
   *   libera; queda para la trazabilidad y para poder demostrar cuándo se
   *   retiró y por qué.
   *
   * Ausente en los lotes guardados antes de que esto existiera, y se trata
   * como `disponible`: una empresa que ya tenía lotes no puede encontrarse
   * el almacén entero bloqueado el día que esto se despliega.
   */
  estado?: EstadoLote;
  /** Por qué se inmovilizó o se retiró. Obligatorio al bloquear. */
  motivoBloqueo?: string;
  /** Cuándo se bloqueó, para poder demostrar la rapidez de la reacción. */
  bloqueadoEn?: string;
  createdAt: string;
  updatedAt: string;
}

/** Ver `Lote.estado`. */
export type EstadoLote = 'disponible' | 'inmovilizado' | 'retirado';

/**
 * UNA OFERTA DE MOSTRADOR
 *
 * Lo que va en el cartel: «3x2», «segunda unidad al 50 %», «diez cajas y
 * una gratis», «los martes la fruta a mitad de precio». Todas caben en la
 * misma ficha porque todas responden a lo mismo —a quién alcanza, cuándo
 * vive y cuánto descuenta—; lo único que cambia es la aritmética, y de eso
 * se encarga `ofertas.ts`.
 *
 * A diferencia del rappel, que es el premio por comprar mucho a lo largo de
 * un periodo y se liquida al cerrarlo, la oferta se aplica AQUÍ Y AHORA,
 * en la línea de la venta, y el cliente la ve en su ticket.
 */
export type TipoOferta =
  /** Llévate N, paga M. El 3x2 y el «diez y una gratis» (11x10). */
  | 'nxm'
  /** La segunda unidad con un tanto por ciento de descuento. */
  | 'unidad_siguiente'
  /** Un tanto por ciento sobre la línea entera. */
  | 'porcentaje'
  /** Tantos euros menos por cada unidad. */
  | 'importe'
  /** Precio cerrado por unidad mientras dure. */
  | 'precio_fijo'
  /** Por tramos de cantidad: a partir de tantas unidades, tanto por ciento. */
  | 'escalado'
  /** Al comprar N de esto, se regala otra cosa. */
  | 'regalo';

/** A qué alcanza una oferta. */
export type AlcanceOferta = 'producto' | 'categoria' | 'todo';

/** Un tramo de las ofertas escaladas. */
export interface TramoOferta {
  desdeCantidad: number;
  porcentaje: number;
}

export interface Oferta {
  id: string;
  /** Lo que se lee en el cartel y en el ticket. */
  nombre: string;
  tipo: TipoOferta;

  alcance: AlcanceOferta;
  /** Ids de producto o nombres de categoría, según el alcance. Vacío en `todo`. */
  alcanceIds: string[];

  // --- La aritmética, según el tipo ---
  /** N de «N x M», y el «cada cuántos» del regalo. */
  paramN?: number;
  /** M de «N x M». */
  paramM?: number;
  /** El tanto por ciento de las ofertas que descuentan porcentaje. */
  paramPorcentaje?: number;
  /** Los euros de las de importe, y el precio de las de precio fijo. */
  paramImporte?: number;
  tramos?: TramoOferta[];
  regaloProductId?: string;
  regaloNombre?: string;
  regaloCantidad?: number;

  // --- Cuándo vive ---
  /** `YYYY-MM-DD`. Sin valor, desde siempre. */
  desde?: string;
  /** `YYYY-MM-DD`. Sin valor, hasta que se desactive. */
  hasta?: string;
  /** 0 = domingo. Vacío o ausente: todos los días. */
  diasSemana?: number[];
  /** `HH:MM`. Las dos juntas o ninguna; admiten cruzar la medianoche. */
  horaInicio?: string;
  horaFin?: string;

  // --- A quién y con qué condiciones ---
  soloGrupoClienteId?: string;
  soloClienteId?: string;
  /** Compra mínima del ticket para que entre. */
  minimoImporte?: number;
  /** Unidades mínimas en la línea para que entre. */
  minimoUnidades?: number;

  // --- Gobierno ---
  activa: boolean;
  /**
   * Si convive con otras sobre la misma línea.
   *
   * Las no acumulables compiten entre sí y gana la que más ahorra al
   * cliente; las acumulables se suman encima. Por defecto NO acumulable,
   * que es lo que espera cualquiera que ponga dos carteles distintos.
   */
  acumulable: boolean;
  /** Sólo desempata entre dos que ahorren lo mismo. Mayor va primero. */
  prioridad?: number;
  /** Tope de veces que puede aplicarse. Sin valor, ilimitada. */
  usosMaximos?: number;
  /** Cuántas veces se ha aplicado ya. */
  usos?: number;

  createdAt: string;
  updatedAt: string;
}

/**
 * UN RAPPEL POR VOLUMEN
 *
 * No es un descuento de cada factura: es el premio por comprar mucho a lo
 * largo de un periodo, y se liquida al cerrarlo —con un abono, normalmente—,
 * no línea a línea. Por tramos: a partir de tanto factura, tanto por
 * ciento; a partir de más, más.
 */
export interface TramoRappel {
  /** A partir de qué importe facturado se aplica este tramo. */
  desde: number;
  porcentaje: number;
}

export interface RappelConfig {
  id: string;
  nombre: string;
  /** Vacío = se aplica a cualquier cliente que llegue al tramo. */
  clienteId?: string;
  clienteNombre?: string;
  /** De menor a mayor umbral. */
  tramos: TramoRappel[];
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * UN GRUPO O CADENA DE CLIENTES
 *
 * Varios clientes que en realidad son la misma central de compras o la
 * misma cadena: sucursales que facturan por separado pero cuyo volumen
 * conjunto es lo que de verdad importa para negociar condiciones o para
 * ver quién pesa más en la cartera.
 */
export interface GrupoCliente {
  id: string;
  nombre: string;
  notas?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * UNA RUTA DE REPARTO
 *
 * Agrupa clientes por zona o por día, para sacar de un tirón la hoja de la
 * jornada: qué hay que llevar y a quién, en el orden en que toca pasar.
 */
export interface RutaReparto {
  id: string;
  nombre: string;
  /** 0 = domingo … 6 = sábado. El día habitual, si lo tiene. */
  diaSemana?: number;
  notas?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * UNA UNIDAD CON NÚMERO DE SERIE
 *
 * Un lote controla una partida entera; un número de serie controla UNA
 * unidad concreta, de principio a fin: de qué proveedor entró, a qué
 * cliente se vendió y cuándo, y hasta cuándo cubre la garantía. Para
 * aparatos, maquinaria, electrónica —lo que se repara o se sustituye pieza
 * a pieza, no a granel.
 */
export type EstadoNumeroSerie = 'en_stock' | 'vendido' | 'baja';

export interface NumeroSerie {
  id: string;
  productId: string;
  productRef: string;
  productName: string;
  numeroSerie: string;
  estado: EstadoNumeroSerie;
  fechaEntrada: string;
  proveedorId?: string;
  proveedorNombre?: string;
  fechaVenta?: string;
  clienteId?: string;
  clienteNombre?: string;
  invoiceId?: string;
  /** Meses de garantía desde la venta. Sin fecha de venta, no cuenta nada todavía. */
  garantiaMeses?: number;
  notas?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * UN COMPONENTE DEL ESCANDALLO
 *
 * Cuánto de este producto hace falta para fabricar UNA unidad del producto
 * final. La receta, dicho en existencias.
 */
export interface ComponenteEscandallo {
  productId: string;
  productRef: string;
  productName: string;
  cantidad: number;
}

/**
 * UN ESCANDALLO
 *
 * Qué componentes consume cada artículo fabricado y cuánto cuesta
 * producirlo. Fabricar una unidad no es venderla: descuenta los componentes
 * del almacén y da de alta el producto terminado, con su coste real —lo que
 * costaron los componentes, no un precio inventado.
 */
export interface Escandallo {
  id: string;
  /** El producto que se fabrica. */
  productId: string;
  productRef: string;
  productName: string;
  componentes: ComponenteEscandallo[];
  /** Mano de obra, energía, lo que no es un componente en sí. Por unidad fabricada. */
  costeAdicional?: number;
  notas?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceLineItem {
  id: string;
  productId: string;
  productName: string;
  productRef: string;
  quantity: number;
  unitPrice: number;
  unit: UnitOfMeasure;
  taxRate: number;
  discountPercent: number;
  discountPercent2?: number;
  discountPercent3?: number;
  /**
   * Cuántas unidades sueltas trae cada bulto de los que se facturan.
   *
   * En distribución se vende por cajas y se controla por unidades: doce cajas
   * de veinticuatro son doce en la factura y 288 en el almacén. La cantidad
   * sigue siendo la de bultos —es lo que se cobra— y esto dice a cuántas
   * unidades equivale.
   *
   * Vacío o 1 en quien no trabaja así, que es la mayoría.
   */
  unitsPerPackage?: number;
  /** De qué lote sale esta línea, si el producto se controla por lotes. */
  loteId?: string;
  /** El código del lote, guardado también aquí para no depender de que el lote siga existiendo. */
  loteCodigo?: string;
  /** Qué unidad concreta con número de serie sale en esta línea. */
  numeroSerieId?: string;
  numeroSerie?: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  /** Coste unitario del producto al emitir (PMP o última compra) para análisis de margen */
  costPrice?: number;
  /**
   * Valores de las columnas personalizadas de la plantilla (`custom_col_N`).
   * Se piden por línea al crear la factura y se imprimen tal cual.
   */
  customCols?: Record<string, string>;
}

export interface TaxBreakdown {
  rate: number;
  base: number;
  amount: number;
}

export interface VerifactuMetadata {
  chainedHash: string;
  qrCodeUrl: string;
  timestamp: string;
  signatureStatus: 'VALID' | 'PENDING' | 'LOCAL_MODE';
}

export interface Invoice {
  id: string;
  number: string;
  series: string;
  
  // Client
  clientId: string;
  clientName: string;
  clientNif: string;
  clientAddress: string;
  
  // Dates
  issueDate: string;
  dueDate: string;
  paidDate?: string;

  // Status
  status: InvoiceStatus;
  /**
   * Por qué se anuló, y cuándo.
   *
   * Una factura emitida no se borra nunca: se anula dejando constancia del
   * motivo. Ese motivo ya se guardaba en la base de datos desde el
   * principio, pero no se leía en ninguna parte, así que quien anulaba una
   * factura no podía volver a ver más tarde por qué lo hizo — que es
   * justo lo que pregunta una inspección.
   */
  cancelReason?: string;
  cancelledAt?: string;

  // Line items
  lineItems: InvoiceLineItem[];
  
  // Totals
  subtotal: number;
  totalDiscount: number;
  taxBreakdown: TaxBreakdown[];
  totalTax: number;
  total: number;
  
  // Payment
  paymentMethod: PaymentMethod;
  
  // Notes
  notes: string;

  /** Valores libres para los campos manuales de la plantilla activa (custom_N). */
  datosExtras?: Record<string, string>;

  // Verifactu Ready Metadata
  verifactu?: VerifactuMetadata;
  
  // Stripe Online Payments
  stripePaymentUrl?: string;
  stripeSessionId?: string;
  paidAt?: string;
  
  // Metadata
  createdAt: string;
  updatedAt: string;

  // TPV
  posSessionId?: string;
  // true = ticket emitido offline con número temporal (SERIE-AÑO-0000-SUFIJO).
  // El servidor lo renumerá a la siguiente secuencia libre si hay colisión al
  // sincronizar; la fecha real de venta se conserva.
  numberTemporary?: boolean;

  /** Tipo de documento. Por defecto 'factura' (compatibilidad con los existentes). */
  tipo?: TipoDocumento;
  /** Venta o compra. Por defecto 'venta'. */
  sentido?: SentidoDocumento;
  /** Documento que da origen a este (presupuesto→pedido→albarán→factura). */
  documentoOrigenId?: string;
  documentoOrigenNumber?: string;
  /** Vendedor asignado (decide la serie, Fase 1 Etapa 4). */
  vendedorId?: string;
  /** Tarifa aplicada en el documento */
  tarifaId?: string;
  /** Almacén origen (en ventas) o almacén destino (en compras) */
  almacenId?: string;
  /**
   * A qué obra o expediente pertenece este documento.
   *
   * Agrupar por obra es cómo se sabe si un proyecto ha dejado dinero o lo ha
   * costado: sin esto, la factura de un cliente con tres proyectos abiertos
   * no dice a cuál de los tres corresponde.
   */
  obraId?: string;
  /**
   * El porcentaje de retención de IRPF, en factura de profesionales y de
   * obra (15% habitual, 7% el primer año de alta como autónomo).
   *
   * NO CAMBIA `total`. El total de la factura sigue siendo base + IVA, que
   * es lo que Hacienda espera ver en la cara de la factura y lo que el
   * disparador de sellado recalcula por su cuenta desde las líneas —tocar
   * `total` aquí rompería esa comprobación en el mismo instante en que la
   * factura se sella. La retención es un descuento en el COBRO, no en la
   * factura: se resta al final, aparte, y sólo para saber lo que de verdad
   * va a entrar o a salir.
   */
  retencionPct?: number;
  /** Importe total acumulado ya cobrado/pagado */
  paidAmount?: number;
  /** IDs de los registros de cobro/pago vinculados */
  paymentRecordIds?: string[];
  /** Hasta 3 descuentos globales al pie de documento (descuento comercial, pronto pago, especial) */
  globalDiscountPercent1?: number;
  globalDiscountPercent2?: number;
  globalDiscountPercent3?: number;

  // --- Fiscal (Verifactu / SII / Intracomunitarias) ---

  /**
   * Tipo de factura fiscal: F1 (completa), F2 (simplificada/ticket), R1–R5
   * (rectificativa). Se resuelve automáticamente al emitir, pero se puede
   * forzar a mano para casos especiales.
   */
  tipoFacturaFiscal?: TipoFacturaFiscal;

  /**
   * Clave de régimen especial de IVA, obligatoria en el XML de Verifactu y
   * SII. Por defecto '01' (régimen general). Se pone a '11' automáticamente
   * si la operación es una entrega intracomunitaria exenta.
   */
  claveRegimenIva?: ClaveRegimenIva;

  /** true si la operación es intracomunitaria (cliente con VAT de otro país UE). */
  esIntracomunitaria?: boolean;

  /**
   * Clave de operación para el Modelo 349:
   * E = Entregas, A = Adquisiciones, T = Triangulares,
   * S = Prestaciones de servicios, I = Adquisiciones de servicios.
   */
  tipoOperacion349?: 'E' | 'A' | 'T' | 'S' | 'I';

  /** Estado del envío al SII: pendiente, enviado, aceptado o rechazado. */
  siiStatus?: 'pendiente_sii' | 'enviado_sii' | 'aceptado_sii' | 'rechazado_sii';

  /** NIF-IVA del destinatario (VAT Number intracomunitario), copiado del cliente al emitir. */
  clientVatNumber?: string;
}

// --- TPV (punto de venta) ---

export interface PosSession {
  id: string;
  openedAt: string;
  closedAt?: string;
  startingCash: number;
  countedCash?: number;
  expectedCash?: number;
  cashDifference?: number;
  status: 'open' | 'closed';
  notes?: string;
}

export interface PosCartLine {
  productId: string;
  productName: string;
  productRef: string;
  unitPrice: number;
  unit: UnitOfMeasure;
  taxRate: number;
  quantity: number;
  discountPercent: number;
  stockQuantity: number;
}

export interface PosHeldSale {
  id: string;
  label: string;
  heldAt: string;
  lines: PosCartLine[];
}

export interface Client {
  id: string;
  nif: string;
  businessName: string;
  tradeName: string;
  email: string;
  phone: string;
  contactPerson: string;
  address: string;
  city: string;
  postalCode: string;
  province: string;
  country: string;
  paymentDays: number;
  defaultPaymentMethod: PaymentMethod;
  notes: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  isWalkIn?: boolean;
  /** true = la ficha es un proveedor (compras). */
  esProveedor?: boolean;
  /** Vendedor asignado al cliente */
  vendedorId?: string;
  /** Tarifa asignada al cliente */
  tarifaId?: string;
  /** Hasta 3 descuentos en cascada por defecto en línea para este cliente [D1%, D2%, D3%] */
  defaultDiscounts?: [number, number, number];
  /** A qué cadena o central de compras pertenece, si es parte de una. */
  grupoId?: string;
  /** A qué ruta de reparto pertenece. */
  rutaId?: string;

  /**
   * NIF-IVA intracomunitario (VAT Number).
   *
   * Es el identificador fiscal para operaciones entre países de la UE.
   * Formato: código de país (2 letras) + número de identificación fiscal.
   * Ejemplo: FR12345678901, DE123456789, PT123456789.
   *
   * Solo se rellena para clientes o proveedores de otros países de la UE.
   * Si existe, la factura se clasifica automáticamente como intracomunitaria.
   */
  vatNumber?: string;
}

export interface Vendedor {
  id: string;
  nombre: string;
  activo: boolean;
  /** Serie propia por tipo de documento; si falta, usa la de la empresa. */
  series: Partial<Record<string, string>>; // clave `${tipo}_${sentido}` -> serie
  /**
   * Almacén del que saca género este comercial. Vacío si trabaja contra el
   * de la empresa, que es lo corriente en oficina; el de ruta suele tener el
   * suyo, que es la furgoneta.
   */
  almacenId?: string;
  /**
   * Porcentaje que se lleva este comercial de lo que vende.
   *
   * Uno solo, no por artículo o por cliente: es lo que cubre a la mayoría de
   * negocios sin complicar el alta de un vendedor, y es ampliable el día que
   * alguien necesite algo más fino.
   */
  comisionPct?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  ref: string;
  name: string;
  description: string;
  category: string;
  unitPrice: number;
  defaultTaxRate: number;
  unit: UnitOfMeasure;
  /**
   * Unidades sueltas por bulto, para venderlo por cajas.
   *
   * Se pone una vez en la ficha del producto y cada línea que lo use la
   * hereda, en vez de teclearla en cada factura y equivocarse una de cada
   * diez. Vacío o 1 en lo que no se vende por cajas.
   */
  unitsPerPackage?: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  barcode?: string;
  stockQuantity?: number;
  lowStockThreshold?: number;
  // Contador de unidades vendidas (base del inventario IA / más vendidos)
  unitsSold?: number;
  // Miniatura del producto (data URL comprimida; ligera para offline y sync)
  imageUrl?: string;
  /** Referencia del proveedor */
  supplierRef?: string;
  /** Precios por tarifa: { [tarifaId]: precio } */
  tarifaPrices?: Record<string, number>;
  /** Precio Medio Ponderado (coste acumulado de compras) */
  costePmp?: number;
  /** Coste de la última compra registrada */
  costeUltimaCompra?: number;
  /** Desglose de existencias por almacén: { [almacenId]: stock } */
  stocksByAlmacen?: Record<string, number>;
}

export interface CustomCategory {
  id: string;
  name: string;
  icon: string;
  sector?: BusinessSector;
  // true = la categoría por defecto con este id ha sido eliminada por el usuario
  hidden?: boolean;
}

export interface CompanySettings {
  /**
   * Qué partes del programa ve esta empresa.
   *
   * Vacío o ausente = todavía no se ha configurado, y se usan los de salida
   * de su sector. Así una empresa que ya existía no se queda sin menús el día
   * que esto se despliega.
   */
  modulos?: ModuloId[];
  /** Las fichas del panel de inicio, en el orden en que se pintan. */
  panel?: FichaId[];
  /**
   * Sobre qué se calcula la comisión de un vendedor: lo que se ha FACTURADO
   * (cuenta en cuanto la factura sale, cobre o no) o lo que se ha COBRADO
   * (cuenta sólo cuando el dinero ha entrado). Cada negocio tiene su
   * costumbre, y pagar comisión de algo que luego resulta impagado es
   * exactamente el tipo de disgusto que esto evita si se deja en 'cobrado'.
   */
  comisionBase?: 'facturado' | 'cobrado';
  // Identity
  businessName: string;
  nif: string;
  tradeName: string;
  sector: BusinessSector;
  accentTheme: AccentTheme;
  
  // Contact
  email: string;
  phone: string;
  website: string;
  
  // Address
  address: string;
  city: string;
  postalCode: string;
  province: string;
  
  // Invoice settings
  invoiceSeries: string;
  nextInvoiceNumber: number;
  defaultPaymentDays: number;
  defaultPaymentMethod: PaymentMethod;
  invoiceFooterText: string;

  // TPV — serie separada para tickets de mostrador (factura simplificada)
  tpvEnabled?: boolean;
  tpvSeries: string;
  nextTpvNumber: number;
  // Cómo se usa el TPV: tienda (estándar), supermercado (grid denso + PLU) o restaurante (mesas).
  tpvMode?: TpvMode;
  
  // Banking
  iban: string;
  bankName: string;
  
  // Verifactu Switch
  verifactuEnabled: boolean;
  
  // Logo
  logoUrl: string;
  
  // Custom categories per sector/company
  customCategories?: CustomCategory[];

  // Stripe Online Payments Integration
  // Sólo la clave PÚBLICA vive aquí. La secret key y el webhook secret
  // van en variables de entorno del servidor (STRIPE_SECRET_KEY,
  // STRIPE_WEBHOOK_SECRET): esta tabla la puede leer el navegador.
  stripeEnabled?: boolean;
  stripePublishableKey?: string;

  // Régimen fiscal: IVA (Península + Baleares) o IGIC (Canarias)
  // Cuando igicEnabled = true, el sistema muestra tasas IGIC en
  // todos los formularios, facturas, TPV e informes.
  igicEnabled?: boolean;

  /* --- Régimen fiscal para los listados fiscales (migración 036) --- */

  /** Régimen de IRPF del empresario. Sin valor = sin configurar: el
   *  panel NO decide por el usuario cuál de los dos modelos le toca. */
  regimenIrpf?: RegimenIrpf;
  /** Epígrafe del IAE, que es lo que fija los módulos del 131. */
  epigrafeIae?: string;
  /** Prorrata general, si se aplica. Sin valor = se deduce el 100%. */
  porcentajeProrrata?: number;

  // Porcentajes disponibles para elegir en facturas, TPV e informes.
  // La empresa los configura en Ajustes sin necesidad de informático.
  // Si están vacíos se usan los del régimen activo (IVA 21/10/4/0 o IGIC 7/3/13/0).
  ivaRates?: number[];
  igicRates?: number[];

  // Suscripción y límites de plan
  planId?: 'basico' | 'pro' | 'sin_limite';
  subscriptionStatus?: 'active' | 'inactive' | 'past_due' | 'canceled';

  // Albaranes (documento de entrega/preparación)
  albaranSeries?: string;
  nextAlbaranNumber?: number;

  // Devoluciones (mercancía devuelta: roturas, defectos…)
  devolucionSeries?: string;
  nextDevolucionNumber?: number;

  // Abonos (nota de crédito a favor del cliente)
  abonoSeries?: string;
  nextAbonoNumber?: number;

  /** Series y contadores por (tipo, sentido). Clave: `${tipo}_${sentido}`. */
  seriesDocumentos?: Record<string, SerieDocumento>;

  /** Tarifas de precios definidas en la empresa */
  tarifas?: Tarifa[];

  /** Almacenes y ubicaciones de la empresa */
  almacenes?: Almacen[];

  // Cobros y Pagos (Tesorería)
  cobroSeries?: string;
  nextCobroNumber?: number;
  pagoSeries?: string;
  nextPagoNumber?: number;
}

// --- Albaranes (documento de entrega) ---

export type AlbaranStatus = 'borrador' | 'expedido' | 'facturado' | 'anulado';

export interface AlbaranLineItem {
  id: string;
  productId: string;
  productName: string;
  productRef: string;
  quantity: number;
  unitPrice: number;
  unit: UnitOfMeasure;
  taxRate: number;
  /**
   * Hasta tres descuentos en cascada, igual que en una factura.
   *
   * Un albarán se convierte en factura, y si la línea del albarán sólo
   * guardara el primero, la factura que sale de él cobraría de más.
   */
  discountPercent: number;
  discountPercent2?: number;
  discountPercent3?: number;
  /** Unidades sueltas por bulto. En un albarán es lo que se cuenta al descargar. */
  unitsPerPackage?: number;
  /** De qué lote sale esta línea, si el producto se controla por lotes. */
  loteId?: string;
  /** El código del lote, guardado también aquí para no depender de que el lote siga existiendo. */
  loteCodigo?: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  /** Valores de las columnas personalizadas de la plantilla (`custom_col_N`). */
  customCols?: Record<string, string>;
}

export interface Albaran {
  id: string;
  number: string;
  series: string;
  clientId: string;
  clientName: string;
  clientNif: string;
  clientAddress: string;
  issueDate: string;
  status: AlbaranStatus;
  lineItems: AlbaranLineItem[];
  subtotal: number;
  totalDiscount: number;
  taxBreakdown: TaxBreakdown[];
  totalTax: number;
  total: number;
  notes: string;
  /** Valores libres para los campos manuales de la plantilla activa (custom_N). */
  datosExtras?: Record<string, string>;
  // Factura resultante de la conversión (individual o agrupada)
  invoiceId?: string;
  createdAt: string;
  updatedAt: string;
}

// --- Devoluciones ---

export type DevolucionReason = 'rotura' | 'defecto' | 'error' | 'vencido' | 'otro';
export type DevolucionOrigin = 'albaran' | 'factura' | 'manual';

export interface DevolucionLineItem {
  id: string;
  productId: string;
  productName: string;
  productRef: string;
  quantity: number;
  unitPrice: number;
  unit: UnitOfMeasure;
  taxRate: number;
  total: number;
  // true = la mercancía vuelve a la nave (se suma al stock)
  restock: boolean;
}

export interface Devolucion {
  id: string;
  number: string;
  series: string;
  origin: DevolucionOrigin;
  originId?: string;
  originNumber?: string;
  clientId: string;
  clientName: string;
  clientNif: string;
  issueDate: string;
  reason: DevolucionReason;
  reasonNote: string;
  status: 'registrada' | 'abonada';
  lineItems: DevolucionLineItem[];
  total: number;
  notes: string;
  abonoId?: string;
  createdAt: string;
  updatedAt: string;
}

// --- Abonos (nota de crédito) ---

export type AbonoStatus = 'emitido' | 'parcial' | 'usado' | 'anulado';

export interface Abono {
  id: string;
  number: string;
  series: string;
  clientId: string;
  clientName: string;
  clientNif: string;
  issueDate: string;
  total: number;
  usedAmount: number;
  status: AbonoStatus;
  devolucionId?: string;
  reason: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface AbonoAplicacion {
  id: string;
  abonoId: string;
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  appliedAt: string;
}

// --- Utility Types ---

export interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
}

export interface SortState {
  field: string;
  direction: 'asc' | 'desc';
}

export interface FilterState {
  search: string;
  status?: InvoiceStatus[];
  dateFrom?: string;
  dateTo?: string;
  clientId?: string;
  category?: ProductCategory;
  minAmount?: number;
  maxAmount?: number;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message?: string;
  duration?: number;
}

// --- Order Pre-Approval System ---

export type ApprovalStatus = 'pending' | 'approved' | 'partial' | 'rejected';

export interface OrderApproval {
  id: string;
  invoiceId: string;
  token: string;
  status: ApprovalStatus;
  clientMessage: string;
  respondedAt: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface OrderApprovalItem {
  id: string;
  approvalId: string;
  lineItemId: string;
  accepted: boolean;
  adjustedQuantity: number | null;
  rejectionReason: string;
}

// --- User Profile / Onboarding ---

export interface UserProfile {
  id: string;
  displayName: string;
  avatarUrl: string;
  onboardingCompleted: boolean;
  createdAt: string;
}

// --- Cobros, Pagos y Tesorería (Fase 4) ---

export type TipoCobroPago = 'cobro' | 'pago';

export interface CobroPagoDesglose {
  invoiceId: string;
  invoiceNumber: string;
  importeAplicado: number;
}

export interface CobroPago {
  id: string;
  tipo: TipoCobroPago; // 'cobro' (a cliente) | 'pago' (a proveedor)
  series: string;
  number: string;
  fecha: string;
  contraparteId: string;
  contraparteNombre: string;
  contraparteNif?: string;
  paymentMethod: PaymentMethod;
  cuentaBancaria?: string;
  importeTotal: number;
  desglose: CobroPagoDesglose[];
  notas?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MovimientoExtracto {
  id: string;
  fecha: string;
  tipo: 'factura' | 'cobro_pago';
  numero: string;
  concepto: string;
  debe: number; // Incrementa saldo (Factura de venta a cliente / Pago a proveedor)
  haber: number; // Reduce saldo (Cobro de cliente / Factura de compra proveedor)
  saldo: number; // Saldo vivo tras el movimiento
}

