import {
  InvoiceStatus,
  type Client,
  type CompanySettings,
  type Invoice,
  type Product,
  type Albaran,
  type Devolucion,
  type Abono,
  type Almacen,
  type Vendedor,
  type Obra,
  type Vehiculo,
  type Gasto,
  type Lote,
  type TipoDocumento,
  type SentidoDocumento,
} from '../types';

/**
 * RETRATO INTEGRAL DE TODOS LOS DATOS DEL SISTEMA PARA LA ASISTENCIA IA
 *
 * Proporciona a la IA acceso total y estructurado a los datos del negocio:
 * - Almacenes e inventario: todos los almacenes registrados (central, secundarios, etc.).
 * - Documentos creados: Facturas, Albaranes, Presupuestos, Pedidos, Rectificativas, Devoluciones y Abonos.
 * - Destinatario (a quién fue: cliente o proveedor, nombre y NIF).
 * - Importes exactos (cuánto dinero fue: total con IVA, base imponible e impuestos).
 * - Fechas de emisión, vencimiento y estado de aprobación/cobro/facturación.
 * - Catálogo de productos, stock por artículo, referencias y precios.
 * - Clientes y proveedores con su actividad comercial.
 * - Obras y proyectos, órdenes de trabajo, vehículos y flota.
 * - Gastos del negocio y balance.
 * - Vendedores y comisiones.
 * - Lotes y trazabilidad / caducidades.
 */

export interface AlmacenDetalleIA {
  id: string;
  codigo: string;
  nombre: string;
  direccion?: string;
  principal: boolean;
  activo: boolean;
}

export interface DocumentoDetalleIA {
  id: string;
  tipo: string; // "Factura", "Albarán", "Presupuesto", "Pedido", "Factura rectificativa", "Devolución", "Abono"
  tipoRaw: string;
  sentido: SentidoDocumento;
  numero: string;
  destinatario: string;
  destinatarioNif?: string;
  fechaEmision: string;
  fechaVencimiento: string;
  estado: string;
  total: number;
  subtotal: number;
  impuestos: number;
  lineasResumen: string;
}

export interface ClienteDetalleIA {
  nombre: string;
  nif?: string;
  totalFacturado: number;
  totalFacturas: number;
  totalAlbaranes: number;
  totalPresupuestos: number;
  totalPedidos: number;
  esProveedor: boolean;
  activo: boolean;
}

export interface ProductoDetalleIA {
  nombre: string;
  precio: number;
  referencia?: string;
  stock?: number;
  categoria?: string;
}

export interface ObraDetalleIA {
  numero: string;
  nombre: string;
  cliente?: string;
  estado: string;
  presupuesto?: number;
}

export interface VendedorDetalleIA {
  nombre: string;
  comisionPct?: number;
  activo: boolean;
}

export interface VehiculoDetalleIA {
  matricula: string;
  nombre?: string;
  activo: boolean;
}

export interface GastoDetalleIA {
  concepto: string;
  total: number;
  fecha: string;
  categoria: string;
  proveedor?: string;
}

export interface LoteDetalleIA {
  numeroLote: string;
  productoNombre: string;
  fechaCaducidad?: string;
  stockActual: number;
}

export interface RetratoDelPanel {
  // --- Almacenes y logística ---
  almacenes: AlmacenDetalleIA[];
  totalAlmacenes: number;
  almacenPrincipalNombre?: string;

  // --- Resumen Económico Global de Facturas ---
  totalFacturado: number;
  totalCobradoOAprobado: number;
  totalPendiente: number;
  totalVencido: number;
  totalBorradores: number;

  // --- Facturas por estado ---
  facturasTotales: number;
  facturasCobradasOAprobadas: number;
  facturasPendientes: number;
  facturasVencidas: number;
  facturasBorradores: number;
  facturasAnuladas: number;

  // --- Albaranes (tabla albaranes + documentos albarán) ---
  albaranesTotales: number;
  albaranesImporte: number;
  albaranesPendientesFacturar: number;
  albaranesPendientesImporte: number;
  albaranesFacturados: number;

  // --- Otros documentos ---
  presupuestosTotales: number;
  presupuestosImporte: number;
  pedidosTotales: number;
  pedidosImporte: number;
  rectificativasTotales: number;
  rectificativasImporte: number;
  devolucionesTotales: number;
  abonosTotales: number;

  // --- Temporal ---
  facturasDelAno: number;
  importeDelAno: number;
  facturasDelMes: number;
  importeDelMes: number;

  // --- Listado completo de documentos (ordenados por fecha descendente) ---
  todosLosDocumentos: DocumentoDetalleIA[];
  clientes: ClienteDetalleIA[];
  productos: ProductoDetalleIA[];
  obras: ObraDetalleIA[];
  vendedores: VendedorDetalleIA[];
  vehiculos: VehiculoDetalleIA[];
  gastos: GastoDetalleIA[];
  totalGastos: number;
  lotes: LoteDetalleIA[];

  // --- Vencidas destacadas ---
  vencidasMasViejas: { numero: string; dias: number; importe: number; cliente: string }[];

  // --- Configuración y Fiscal ---
  nombreEmpresa: string;
  nifEmpresa: string;
  tieneNif: boolean;
  tieneDireccion: boolean;
  tieneLogotipo: boolean;
  tienePlantillaPropia: boolean;
  verifactuActivo: boolean;
  impuesto: 'IVA' | 'IGIC';
  plan: string;
}

function dias(desde: string): number {
  if (!desde) return 0;
  const ms = Date.now() - new Date(desde).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

function redondearEuros(n: number): number {
  return Number((Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2));
}

export function nombreTipoDocumento(tipo?: TipoDocumento | string): string {
  switch (tipo) {
    case 'albaran':
      return 'Albarán';
    case 'presupuesto':
      return 'Presupuesto';
    case 'pedido':
      return 'Pedido';
    case 'rectificativa':
      return 'Factura rectificativa';
    case 'devolucion':
      return 'Devolución';
    case 'abono':
      return 'Abono';
    case 'factura':
    default:
      return 'Factura';
  }
}

export function estadoEnEspanol(status: InvoiceStatus | string): string {
  switch (status) {
    case InvoiceStatus.APROBADO:
      return 'Aprobada';
    case InvoiceStatus.APROBADO_PARCIAL:
      return 'Aprobada parcial';
    case InvoiceStatus.PAGADA:
      return 'Pagada / Cobrada';
    case InvoiceStatus.EMITIDA:
      return 'Emitida';
    case InvoiceStatus.PENDIENTE:
      return 'Pendiente de cobro';
    case InvoiceStatus.PARCIAL:
      return 'Cobro parcial';
    case InvoiceStatus.VENCIDA:
      return 'Vencida';
    case InvoiceStatus.BORRADOR:
    case 'borrador':
      return 'Borrador';
    case InvoiceStatus.PRE_APROBACION:
      return 'Pre-aprobación';
    case InvoiceStatus.RECHAZADO:
      return 'Rechazada';
    case InvoiceStatus.ANULADA:
    case 'anulado':
      return 'Anulada';
    case InvoiceStatus.EXPEDIDO:
    case 'expedido':
      return 'Expedido (sin facturar)';
    case InvoiceStatus.FACTURADO:
    case 'facturado':
      return 'Facturado';
    default:
      return status;
  }
}

export function retratoDelPanel(entrada: {
  facturas: Invoice[];
  albaranes?: Albaran[];
  devoluciones?: Devolucion[];
  abonos?: Abono[];
  clientes: Client[];
  ajustes: CompanySettings | null;
  productos?: Product[];
  almacenes?: Almacen[];
  vendedores?: Vendedor[];
  obras?: Obra[];
  vehiculos?: Vehiculo[];
  gastos?: Gasto[];
  lotes?: Lote[];
  tienePlantillaPropia: boolean;
}): RetratoDelPanel {
  const {
    ajustes,
    facturas = [],
    albaranes = [],
    devoluciones = [],
    abonos = [],
    clientes = [],
    productos = [],
    almacenes = [],
    vendedores = [],
    obras = [],
    vehiculos = [],
    gastos = [],
    lotes = [],
  } = entrada;

  // --- Almacenes ---
  const almacenesDetalle: AlmacenDetalleIA[] = almacenes.map(a => ({
    id: a.id,
    codigo: a.codigo,
    nombre: a.nombre,
    direccion: a.direccion,
    principal: Boolean(a.principal),
    activo: Boolean(a.activo),
  }));
  const almPrincipal = almacenesDetalle.find(a => a.principal)?.nombre || almacenesDetalle[0]?.nombre;

  // --- Lista unificada de documentos ---
  const docMap = new Map<string, DocumentoDetalleIA>();

  // 1. Mapear facturas, presupuestos, pedidos y rectificativas desde invoices
  facturas.forEach(d => {
    const lineas = (d.lineItems || []).map(li => {
      const q = li.quantity ?? 1;
      const desc = li.productName || 'Concepto';
      return `${desc} (${q} ud)`;
    }).slice(0, 3).join(', ');

    const tipoDoc = nombreTipoDocumento(d.tipo);
    docMap.set(d.id, {
      id: d.id,
      tipo: tipoDoc,
      tipoRaw: d.tipo ?? 'factura',
      sentido: d.sentido ?? 'venta',
      numero: d.number || '(sin número)',
      destinatario: d.clientName || 'Sin destinatario',
      destinatarioNif: d.clientNif || '',
      fechaEmision: d.issueDate || '',
      fechaVencimiento: d.dueDate || '',
      estado: estadoEnEspanol(d.status),
      total: redondearEuros(d.total || 0),
      subtotal: redondearEuros(d.subtotal || 0),
      impuestos: redondearEuros(d.totalTax || 0),
      lineasResumen: lineas ? `[${lineas}]` : '',
    });
  });

  // 2. Mapear albaranes específicos desde la colección albaranes
  albaranes.forEach(a => {
    const lineas = (a.lineItems || []).map(li => {
      const q = li.quantity ?? 1;
      const desc = li.productName || 'Concepto';
      return `${desc} (${q} ud)`;
    }).slice(0, 3).join(', ');

    let estadoStr = 'Borrador (pendiente de facturar)';
    if (a.status === 'facturado') estadoStr = 'Facturado';
    else if (a.status === 'expedido') estadoStr = 'Expedido (pendiente de facturar)';
    else if (a.status === 'anulado') estadoStr = 'Anulado';

    docMap.set(a.id, {
      id: a.id,
      tipo: 'Albarán',
      tipoRaw: 'albaran',
      sentido: 'venta',
      numero: a.number || '(sin número)',
      destinatario: a.clientName || 'Sin destinatario',
      destinatarioNif: a.clientNif || '',
      fechaEmision: a.issueDate || '',
      fechaVencimiento: '',
      estado: estadoStr,
      total: redondearEuros(a.total || 0),
      subtotal: redondearEuros(a.subtotal || 0),
      impuestos: redondearEuros(a.totalTax || 0),
      lineasResumen: lineas ? `[${lineas}]` : '',
    });
  });

  // 3. Mapear devoluciones
  devoluciones.forEach(dev => {
    docMap.set(dev.id, {
      id: dev.id,
      tipo: 'Devolución',
      tipoRaw: 'devolucion',
      sentido: 'venta',
      numero: dev.number || '(sin número)',
      destinatario: dev.clientName || 'Sin destinatario',
      destinatarioNif: dev.clientNif || '',
      fechaEmision: dev.issueDate || '',
      fechaVencimiento: '',
      estado: 'Registrada',
      total: redondearEuros(dev.total || 0),
      subtotal: redondearEuros(dev.total || 0),
      impuestos: 0,
      lineasResumen: '',
    });
  });

  // 4. Mapear abonos
  abonos.forEach(ab => {
    docMap.set(ab.id, {
      id: ab.id,
      tipo: 'Abono',
      tipoRaw: 'abono',
      sentido: 'venta',
      numero: ab.number || '(sin número)',
      destinatario: ab.clientName || 'Sin destinatario',
      destinatarioNif: ab.clientNif || '',
      fechaEmision: ab.issueDate || '',
      fechaVencimiento: '',
      estado: ab.status || 'Emitido',
      total: redondearEuros(ab.total || 0),
      subtotal: redondearEuros(ab.total || 0),
      impuestos: 0,
      lineasResumen: ab.reason ? `[Motivo: ${ab.reason}]` : '',
    });
  });

  // Lista ordenada por fecha más reciente
  const todosLosDocumentos: DocumentoDetalleIA[] = Array.from(docMap.values()).sort(
    (a, b) => new Date(b.fechaEmision || 0).getTime() - new Date(a.fechaEmision || 0).getTime()
  );

  // Clasificación de facturas
  const facturasDocs = facturas.filter(d => (d.tipo ?? 'factura') === 'factura');
  const facturasVivas = facturasDocs.filter(f => f.status !== InvoiceStatus.ANULADA);
  const facturasEmitidas = facturasVivas.filter(f => f.status !== InvoiceStatus.BORRADOR);

  const cobradasOAprobadas = facturasVivas.filter(
    f => f.status === InvoiceStatus.PAGADA ||
         f.status === InvoiceStatus.APROBADO ||
         f.status === InvoiceStatus.APROBADO_PARCIAL
  );

  const pendientes = facturasVivas.filter(
    f => f.status === InvoiceStatus.PENDIENTE ||
         f.status === InvoiceStatus.EMITIDA ||
         f.status === InvoiceStatus.PARCIAL ||
         f.status === InvoiceStatus.PRE_APROBACION
  );

  const vencidas = facturasVivas.filter(f => f.status === InvoiceStatus.VENCIDA);
  const borradores = facturasDocs.filter(f => f.status === InvoiceStatus.BORRADOR);
  const anuladas = facturasDocs.filter(f => f.status === InvoiceStatus.ANULADA);

  // Fechas y temporales para facturas
  const ahora = new Date();
  const mesActual = ahora.getMonth();
  const anoActual = ahora.getFullYear();

  const delAno = facturasEmitidas.filter(f => {
    const d = new Date(f.issueDate);
    return d.getFullYear() === anoActual;
  });

  const delMes = facturasEmitidas.filter(f => {
    const d = new Date(f.issueDate);
    return d.getMonth() === mesActual && d.getFullYear() === anoActual;
  });

  // Totales económicos de facturas
  const totalFacturado = redondearEuros(facturasEmitidas.reduce((s, f) => s + (f.total || 0), 0));
  const totalCobradoOAprobado = redondearEuros(cobradasOAprobadas.reduce((s, f) => s + (f.total || 0), 0));
  const totalPendiente = redondearEuros(pendientes.reduce((s, f) => s + (f.total || 0), 0));
  const totalVencido = redondearEuros(vencidas.reduce((s, f) => s + (f.total || 0), 0));
  const totalBorradores = redondearEuros(borradores.reduce((s, f) => s + (f.total || 0), 0));
  const importeDelAno = redondearEuros(delAno.reduce((s, f) => s + (f.total || 0), 0));
  const importeDelMes = redondearEuros(delMes.reduce((s, f) => s + (f.total || 0), 0));

  // Totales de albaranes
  const todosAlbaranes = todosLosDocumentos.filter(d => d.tipoRaw === 'albaran');
  const albaranesNoAnulados = todosAlbaranes.filter(a => !a.estado.toLowerCase().includes('anulado'));
  const albaranesTotales = todosAlbaranes.length;
  const albaranesImporte = redondearEuros(albaranesNoAnulados.reduce((s, a) => s + a.total, 0));

  const albaranesPendientes = albaranesNoAnulados.filter(a =>
    a.estado.toLowerCase().includes('pendiente') || a.estado.toLowerCase().includes('borrador') || a.estado.toLowerCase().includes('expedido')
  );
  const albaranesPendientesFacturar = albaranesPendientes.length;
  const albaranesPendientesImporte = redondearEuros(albaranesPendientes.reduce((s, a) => s + a.total, 0));
  const albaranesFacturados = albaranesNoAnulados.filter(a => a.estado.toLowerCase().includes('facturado')).length;

  // Otros documentos
  const presupuestosDocs = facturas.filter(d => d.tipo === 'presupuesto');
  const presupuestosImporte = redondearEuros(
    presupuestosDocs.filter(p => p.status !== InvoiceStatus.ANULADA).reduce((s, p) => s + (p.total || 0), 0)
  );

  const pedidosDocs = facturas.filter(d => d.tipo === 'pedido');
  const pedidosImporte = redondearEuros(
    pedidosDocs.filter(p => p.status !== InvoiceStatus.ANULADA).reduce((s, p) => s + (p.total || 0), 0)
  );

  const rectificativasDocs = facturas.filter(d => d.tipo === 'rectificativa');
  const rectificativasImporte = redondearEuros(
    rectificativasDocs.filter(r => r.status !== InvoiceStatus.ANULADA).reduce((s, r) => s + (r.total || 0), 0)
  );

  // Clientes y proveedores
  const mapaClientes = new Map<string, {
    total: number;
    facturas: number;
    albaranes: number;
    presupuestos: number;
    pedidos: number;
    nombre: string;
    nif?: string;
    esProveedor: boolean;
    activo: boolean;
  }>();
  
  clientes.forEach(c => {
    const nombreCliente = c.tradeName || c.businessName || 'Cliente';
    mapaClientes.set(c.id, {
      nombre: nombreCliente,
      nif: c.nif,
      total: 0,
      facturas: 0,
      albaranes: 0,
      presupuestos: 0,
      pedidos: 0,
      esProveedor: Boolean(c.esProveedor),
      activo: Boolean(c.active),
    });
  });

  todosLosDocumentos.forEach(doc => {
    const key = doc.destinatario;
    const existente = mapaClientes.get(key) || {
      nombre: doc.destinatario,
      nif: doc.destinatarioNif,
      total: 0,
      facturas: 0,
      albaranes: 0,
      presupuestos: 0,
      pedidos: 0,
      esProveedor: false,
      activo: true,
    };

    if (doc.tipoRaw === 'factura' && !doc.estado.toLowerCase().includes('borrador') && !doc.estado.toLowerCase().includes('anulad')) {
      existente.total += doc.total || 0;
      existente.facturas += 1;
    } else if (doc.tipoRaw === 'albaran') {
      existente.albaranes += 1;
    } else if (doc.tipoRaw === 'presupuesto') {
      existente.presupuestos += 1;
    } else if (doc.tipoRaw === 'pedido') {
      existente.pedidos += 1;
    }

    mapaClientes.set(key, existente);
  });

  const clientesDetalle: ClienteDetalleIA[] = Array.from(mapaClientes.values())
    .map(c => ({
      nombre: c.nombre,
      nif: c.nif,
      totalFacturado: redondearEuros(c.total),
      totalFacturas: c.facturas,
      totalAlbaranes: c.albaranes,
      totalPresupuestos: c.presupuestos,
      totalPedidos: c.pedidos,
      esProveedor: c.esProveedor,
      activo: c.activo,
    }))
    .sort((a, b) => b.totalFacturado - a.totalFacturado);

  // Vencidas más antiguas
  const vencidasMasViejas = [...vencidas]
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(a.dueDate).getTime())
    .slice(0, 5)
    .map(f => ({
      numero: f.number,
      cliente: f.clientName,
      dias: dias(f.dueDate),
      importe: redondearEuros(f.total || 0),
    }));

  // Gastos
  const totalGastos = redondearEuros(gastos.reduce((s, g) => s + (g.total || 0), 0));
  const gastosDetalle: GastoDetalleIA[] = gastos.slice(0, 15).map(g => ({
    concepto: g.concepto,
    total: redondearEuros(g.total || 0),
    fecha: g.fecha,
    categoria: g.categoria,
    proveedor: g.proveedorNombre,
  }));

  // Obras
  const obrasDetalle: ObraDetalleIA[] = obras.map(o => ({
    numero: o.numero,
    nombre: o.nombre,
    cliente: o.clienteNombre,
    estado: o.estado,
    presupuesto: o.presupuesto ? redondearEuros(o.presupuesto) : undefined,
  }));

  // Vendedores
  const vendedoresDetalle: VendedorDetalleIA[] = vendedores.map(v => ({
    nombre: v.nombre,
    comisionPct: v.comisionPct,
    activo: v.activo,
  }));

  // Vehículos
  const vehiculosDetalle: VehiculoDetalleIA[] = vehiculos.map(v => ({
    matricula: v.matricula,
    nombre: v.nombre,
    activo: v.activo,
  }));

  // Lotes
  // Los nombres de la izquierda son los que lee el asistente; los de la
  // derecha, los que tiene de verdad un `Lote`. Se leían con nombres que
  // `Lote` no tiene —numeroLote, productoNombre, stockActual— y todo
  // salía `undefined`: el asistente habría visto lotes sin código, sin
  // producto y sin existencias.
  const lotesDetalle: LoteDetalleIA[] = lotes.slice(0, 15).map(l => ({
    numeroLote: l.codigo,
    productoNombre: l.productName,
    fechaCaducidad: l.fechaCaducidad,
    stockActual: l.cantidadDisponible,
  }));

  // Productos
  const productosDetalle: ProductoDetalleIA[] = productos.slice(0, 30).map(p => ({
    nombre: p.name,
    precio: redondearEuros(p.unitPrice || 0),
    referencia: p.ref,
    stock: p.stockQuantity,
    categoria: p.category,
  }));

  const nombreEmpresa = ajustes?.tradeName || ajustes?.businessName || 'Tu empresa';

  return {
    almacenes: almacenesDetalle,
    totalAlmacenes: almacenesDetalle.length,
    almacenPrincipalNombre: almPrincipal,

    totalFacturado,
    totalCobradoOAprobado,
    totalPendiente,
    totalVencido,
    totalBorradores,

    facturasTotales: facturasEmitidas.length,
    facturasCobradasOAprobadas: cobradasOAprobadas.length,
    facturasPendientes: pendientes.length,
    facturasVencidas: vencidas.length,
    facturasBorradores: borradores.length,
    facturasAnuladas: anuladas.length,

    albaranesTotales,
    albaranesImporte,
    albaranesPendientesFacturar,
    albaranesPendientesImporte,
    albaranesFacturados,

    presupuestosTotales: presupuestosDocs.length,
    presupuestosImporte,
    pedidosTotales: pedidosDocs.length,
    pedidosImporte,
    rectificativasTotales: rectificativasDocs.length,
    rectificativasImporte,
    devolucionesTotales: devoluciones.length,
    abonosTotales: abonos.length,

    facturasDelAno: delAno.length,
    importeDelAno,
    facturasDelMes: delMes.length,
    importeDelMes,

    todosLosDocumentos,
    clientes: clientesDetalle,
    productos: productosDetalle,
    obras: obrasDetalle,
    vendedores: vendedoresDetalle,
    vehiculos: vehiculosDetalle,
    gastos: gastosDetalle,
    totalGastos,
    lotes: lotesDetalle,

    vencidasMasViejas,

    nombreEmpresa,
    nifEmpresa: ajustes?.nif || '',
    tieneNif: Boolean(ajustes?.nif?.trim()),
    tieneDireccion: Boolean(ajustes?.address?.trim()),
    tieneLogotipo: Boolean(ajustes?.logoUrl?.trim()),
    tienePlantillaPropia: entrada.tienePlantillaPropia,
    verifactuActivo: Boolean(ajustes?.verifactuEnabled),
    impuesto: ajustes?.igicEnabled ? 'IGIC' : 'IVA',
    plan: ajustes?.planId ?? 'estándar',
  };
}

/** Formateador a euros en texto con formato español: 1.452,00 € */
function formatoEuros(num: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(num);
}

/**
 * Traduce el retrato completo a un conjunto de frases ricas y estructuradas
 * para que el modelo de IA tenga a la vista todos los datos del sistema.
 */
/**
 * LOS RECUENTOS, HECHOS AQUÍ Y NO POR EL MODELO
 *
 * «¿Cuántos borradores tengo?» se contestaba con 3 cuando había más de
 * diez. El modelo no se equivocaba al sumar: le llegaba una lista de
 * documentos recortada y le tocaba contarla. Un modelo de lenguaje cuenta
 * mal una lista larga y no puede contar lo que no ve.
 *
 * Así que los números van ya hechos, sobre TODOS los documentos: cuántos
 * de cada tipo en cada estado, con su importe, y cuántos por año. Van los
 * primeros del enunciado, antes de cualquier listado, para que lleguen
 * siempre enteros aunque lo de abajo haya que recortarlo.
 */
export function recuentosEnPalabras(documentos: readonly DocumentoDetalleIA[]): string[] {
  if (documentos.length === 0) return ['- No hay ningún documento creado todavía.'];

  // tipo -> estado -> { cuantos, importe }
  const porTipo = new Map<string, Map<string, { cuantos: number; importe: number }>>();
  // año -> tipo -> estado -> cuantos
  const porAno = new Map<string, Map<string, Map<string, number>>>();

  for (const d of documentos) {
    const tipo = d.tipo;
    const estado = d.estado || 'Sin estado';
    const ano = (d.fechaEmision || '').slice(0, 4) || 'sin fecha';

    const estados = porTipo.get(tipo) ?? new Map();
    const actual = estados.get(estado) ?? { cuantos: 0, importe: 0 };
    estados.set(estado, { cuantos: actual.cuantos + 1, importe: actual.importe + (d.total || 0) });
    porTipo.set(tipo, estados);

    const tiposDelAno = porAno.get(ano) ?? new Map();
    const estadosDelTipo = tiposDelAno.get(tipo) ?? new Map();
    estadosDelTipo.set(estado, (estadosDelTipo.get(estado) ?? 0) + 1);
    tiposDelAno.set(tipo, estadosDelTipo);
    porAno.set(ano, tiposDelAno);
  }

  const lineas: string[] = [
    `=== RECUENTO EXACTO DE DOCUMENTOS (${documentos.length} en total; estos números son los buenos, úsalos tal cual) ===`,
  ];

  for (const [tipo, estados] of [...porTipo].sort((a, b) => a[0].localeCompare(b[0]))) {
    const total = [...estados.values()].reduce((s, e) => s + e.cuantos, 0);
    const detalle = [...estados]
      .sort((a, b) => b[1].cuantos - a[1].cuantos)
      .map(([estado, e]) => `${estado}: ${e.cuantos} (${formatoEuros(e.importe)})`)
      .join('; ');
    lineas.push(`- ${tipo}: ${total} en total → ${detalle}.`);
  }

  lineas.push('', '=== POR AÑO DE EMISIÓN ===');
  for (const [ano, tipos] of [...porAno].sort((a, b) => b[0].localeCompare(a[0]))) {
    const partes = [...tipos].map(([tipo, estados]) => {
      const total = [...estados.values()].reduce((s, n) => s + n, 0);
      const detalle = [...estados].map(([estado, n]) => `${n} ${estado.toLowerCase()}`).join(', ');
      return `${tipo}: ${total} (${detalle})`;
    });
    lineas.push(`- ${ano}: ${partes.join(' | ')}.`);
  }

  // DESDE CADA AÑO HASTA HOY, YA SUMADO
  //
  // «¿Cuántos borradores hay a partir de 2024?» se contestaba con los de
  // 2024 solos —4 en vez de 20—: el modelo leía «a partir de» como «de».
  // Pedirle que sume no bastó; dárselo sumado, sí. Es la misma lección que
  // con los recuentos: lo que se puede calcular aquí no se le deja a él.
  const anos = [...porAno.keys()].filter(a => /^\d{4}$/.test(a)).sort();
  if (anos.length > 1) {
    lineas.push('', '=== ACUMULADO DESDE CADA AÑO HASTA HOY («a partir de», «desde») ===');
    for (const desde of anos.slice(0, -1)) {
      const acumulado = new Map<string, Map<string, number>>();
      for (const [ano, tipos] of porAno) {
        if (!/^\d{4}$/.test(ano) || ano < desde) continue;
        for (const [tipo, estados] of tipos) {
          const suma = acumulado.get(tipo) ?? new Map<string, number>();
          for (const [estado, n] of estados) suma.set(estado, (suma.get(estado) ?? 0) + n);
          acumulado.set(tipo, suma);
        }
      }
      const partes = [...acumulado].map(([tipo, estados]) => {
        const total = [...estados.values()].reduce((s, n) => s + n, 0);
        const detalle = [...estados].map(([estado, n]) => `${n} ${estado.toLowerCase()}`).join(', ');
        return `${tipo}: ${total} (${detalle})`;
      });
      lineas.push(`- Desde ${desde} hasta hoy: ${partes.join(' | ')}.`);
    }
  }

  // LOS QUE ESTÁN A MEDIAS, CON SU NÚMERO
  //
  // «¿Cuáles son?» es la pregunta que sigue a «¿cuántos hay?», y se
  // contestaba inventando: con el listado recortado, el modelo nombró
  // cuatro facturas FAC-2024-00xx que no existían. Un número de factura
  // inventado es peor que ninguno —se busca, no aparece, y se deja de
  // fiar—. Así que los documentos que se preguntan (borradores,
  // pendientes, vencidos, sin facturar) van aquí con su número, sin
  // depender de que el listado de abajo llegue entero.
  const aMedias = /borrador|pendiente|vencid|expedido|pre-aprob|parcial/i;
  const grupos = new Map<string, string[]>();
  for (const d of documentos) {
    if (!aMedias.test(d.estado || '')) continue;
    const ano = (d.fechaEmision || '').slice(0, 4) || 'sin fecha';
    const clave = `${d.tipo} · ${d.estado} · ${ano}`;
    const lista = grupos.get(clave) ?? [];
    lista.push(d.numero);
    grupos.set(clave, lista);
  }
  if (grupos.size > 0) {
    lineas.push('', '=== NÚMEROS DE LOS DOCUMENTOS A MEDIAS (todos, por tipo, estado y año) ===');
    for (const [clave, numeros] of [...grupos].sort((a, b) => b[0].localeCompare(a[0]))) {
      const mostrados = numeros.slice(0, 60);
      const resto = numeros.length - mostrados.length;
      lineas.push(
        `- ${clave} (${numeros.length}): ${mostrados.join(', ')}${resto > 0 ? ` y ${resto} más` : ''}.`,
      );
    }
  }

  return lineas;
}

/**
 * Deja el retrato dentro de un tamaño, recortando por el FINAL.
 *
 * Antes la ruta se quedaba con las 20 primeras líneas: bastaba cuando el
 * retrato era un resumen de diez, y dejó de bastar cuando empezó a listar
 * cada documento. Ahora el límite es de tamaño, no de líneas, y lo que se
 * corta es lo último —el detalle—, nunca los recuentos del principio. Si
 * se corta algo, se dice, para que el modelo no tome un listado parcial
 * por completo.
 */
export function acotarSituacion(lineas: readonly string[], maximoCaracteres: number): string[] {
  const resultado: string[] = [];
  let usados = 0;
  for (let i = 0; i < lineas.length; i++) {
    const linea = String(lineas[i]).slice(0, 1_000);
    if (usados + linea.length + 1 > maximoCaracteres) {
      resultado.push(
        `(… ${lineas.length - i} líneas más de detalle no caben aquí. Los RECUENTOS de arriba sí incluyen TODOS los documentos: fíate de ellos, no de contar esta lista.)`,
      );
      break;
    }
    resultado.push(linea);
    usados += linea.length + 1;
  }
  return resultado;
}

/** Hoy, escrito como lo diría una persona: el modelo no sabe qué día es. */
function hoyEnPalabras(ahora = new Date()): string {
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(ahora);
}

/**
 * QUIÉN LE DEBE DINERO, POR CLIENTE
 *
 * «¿Quién me debe más?» es de las primeras cosas que pregunta alguien
 * con varios clientes, y el retrato sólo tenía el total pendiente. Se
 * suma aquí, de las facturas que siguen sin cobrar, para que el modelo
 * no tenga que recorrer el listado y sumar —que es justo lo que hace mal.
 */
export function deudaPorCliente(
  documentos: readonly DocumentoDetalleIA[],
): { cliente: string; importe: number; facturas: number; vencidas: number }[] {
  const porCliente = new Map<string, { importe: number; facturas: number; vencidas: number }>();
  for (const d of documentos) {
    if (d.sentido === 'compra') continue;
    if (!/^Factura/.test(d.tipo)) continue;
    const vencida = /vencid/i.test(d.estado);
    if (!vencida && !/pendiente|parcial|emitida/i.test(d.estado)) continue;
    const nombre = d.destinatario || 'Sin cliente';
    const actual = porCliente.get(nombre) ?? { importe: 0, facturas: 0, vencidas: 0 };
    porCliente.set(nombre, {
      importe: actual.importe + (d.total || 0),
      facturas: actual.facturas + 1,
      vencidas: actual.vencidas + (vencida ? 1 : 0),
    });
  }
  return [...porCliente.entries()]
    .map(([cliente, v]) => ({ cliente, importe: redondearEuros(v.importe), facturas: v.facturas, vencidas: v.vencidas }))
    .filter(c => c.importe > 0)
    .sort((a, b) => b.importe - a.importe);
}

/**
 * EL RETRATO EN FRASES, DE LO MÁS IMPORTANTE A LO MENOS
 *
 * El orden no es estético. Si el retrato no cabe —el modelo local lee
 * unos 7.500 caracteres—, se recorta por el FINAL. Antes el listado de
 * todos los documentos iba en medio, así que en un negocio con muchas
 * facturas se comía el sitio y lo que se perdía era la configuración de
 * la empresa, los clientes y el stock: el asistente decía que no había
 * NIF porque la línea del NIF no había llegado. Ahora van primero los
 * números hechos y lo que describe al negocio, y el listado documento a
 * documento, que es lo más largo y lo que menos falta hace entero, al
 * final.
 */
export function retratoEnPalabras(r: RetratoDelPanel): string[] {
  const lineas: string[] = [
    `HOY ES ${hoyEnPalabras()}.`,
    '',
    `=== LA EMPRESA ===`,
    `- Nombre: ${r.nombreEmpresa || 'sin nombre puesto'}${r.nifEmpresa ? ` (NIF: ${r.nifEmpresa})` : ' (sin NIF puesto)'}.`,
    `- Impuesto que aplica: ${r.impuesto}. Plan contratado: ${r.plan}. Veri*Factu: ${r.verifactuActivo ? 'ACTIVO' : 'desactivado'}.`,
  ];

  const pendienteConfig: string[] = [];
  if (!r.tieneNif) pendienteConfig.push('el NIF de la empresa');
  if (!r.tieneDireccion) pendienteConfig.push('la dirección fiscal');
  if (!r.tieneLogotipo) pendienteConfig.push('el logotipo');
  if (!r.tienePlantillaPropia) pendienteConfig.push('un diseño de documento propio');
  if (!r.verifactuActivo) pendienteConfig.push('activar la emisión Veri*Factu');
  lineas.push(pendienteConfig.length > 0
    ? `- PENDIENTE DE CONFIGURAR: ${pendienteConfig.join(', ')}.`
    : '- La configuración básica está completa.');

  lineas.push('', ...recuentosEnPalabras(r.todosLosDocumentos));

  lineas.push(
    '',
    `=== RESUMEN DE DINERO ===`,
    `- Facturado en total: ${formatoEuros(r.totalFacturado)} (${r.facturasTotales} facturas).`,
    `- Cobrado / aprobado: ${formatoEuros(r.totalCobradoOAprobado)} (${r.facturasCobradasOAprobadas} facturas).`,
    `- Pendiente de cobro: ${formatoEuros(r.totalPendiente)} (${r.facturasPendientes} facturas).`,
    `- Vencido sin cobrar: ${formatoEuros(r.totalVencido)} (${r.facturasVencidas} facturas).`,
    `- Este año (${new Date().getFullYear()}): ${formatoEuros(r.importeDelAno)} en ${r.facturasDelAno} facturas. Este mes: ${formatoEuros(r.importeDelMes)} en ${r.facturasDelMes} facturas.`,
    `- Albaranes: ${r.albaranesTotales} por ${formatoEuros(r.albaranesImporte)}; ${r.albaranesPendientesFacturar} sin facturar (${formatoEuros(r.albaranesPendientesImporte)}) y ${r.albaranesFacturados} ya facturados.`,
    `- Presupuestos: ${r.presupuestosTotales} por ${formatoEuros(r.presupuestosImporte)}. Pedidos: ${r.pedidosTotales} por ${formatoEuros(r.pedidosImporte)}.`,
    `- Rectificativas: ${r.rectificativasTotales} (${formatoEuros(r.rectificativasImporte)}). Devoluciones: ${r.devolucionesTotales}. Abonos: ${r.abonosTotales}.`,
    `- Gastos apuntados: ${formatoEuros(r.totalGastos)} en ${r.gastos.length} gastos.`,
  );

  if (r.vencidasMasViejas.length > 0) {
    lineas.push(
      '- Vencidas a reclamar, de la más antigua a la más reciente: ' +
      r.vencidasMasViejas.map(v => `${v.numero} de ${v.cliente} (${formatoEuros(v.importe)}, vencida hace ${v.dias} días)`).join('; ') + '.',
    );
  }

  const deudas = deudaPorCliente(r.todosLosDocumentos);
  if (deudas.length > 0) {
    lineas.push('', `=== QUIÉN DEBE DINERO (${deudas.length} clientes, de más a menos) ===`);
    deudas.slice(0, 25).forEach(d => {
      lineas.push(`- ${d.cliente}: ${formatoEuros(d.importe)} en ${d.facturas} factura${d.facturas === 1 ? '' : 's'} sin cobrar${d.vencidas > 0 ? `, ${d.vencidas} vencida${d.vencidas === 1 ? '' : 's'}` : ''}.`);
    });
  }

  if (r.clientes.length > 0) {
    const ordenados = [...r.clientes].sort((a, b) => b.totalFacturado - a.totalFacturado);
    const tope = 40;
    lineas.push('', `=== CLIENTES Y PROVEEDORES (${r.clientes.length}${r.clientes.length > tope ? `, aquí los ${tope} que más facturan` : ''}) ===`);
    ordenados.slice(0, tope).forEach(c => {
      const rol = c.esProveedor ? 'PROVEEDOR' : 'CLIENTE';
      const extra: string[] = [];
      if (c.totalAlbaranes > 0) extra.push(`${c.totalAlbaranes} albaranes`);
      if (c.totalPresupuestos > 0) extra.push(`${c.totalPresupuestos} presupuestos`);
      if (c.totalPedidos > 0) extra.push(`${c.totalPedidos} pedidos`);
      lineas.push(
        `- [${rol}] ${c.nombre}${c.nif ? ` (${c.nif})` : ''}: ${formatoEuros(c.totalFacturado)} en ${c.totalFacturas} facturas${extra.length ? ` + ${extra.join(', ')}` : ''}${c.activo ? '' : ' [inactivo]'}.`,
      );
    });
  } else {
    lineas.push('', '- No hay ningún cliente dado de alta.');
  }

  if (r.productos.length > 0) {
    const tope = 40;
    const sinStock = r.productos.filter(p => p.stock !== undefined && p.stock <= 0);
    lineas.push('', `=== PRODUCTOS Y STOCK (${r.productos.length}${r.productos.length > tope ? `, aquí ${tope}` : ''}) ===`);
    if (sinStock.length > 0) {
      lineas.push(`- SIN STOCK (${sinStock.length}): ${sinStock.slice(0, 20).map(p => p.nombre).join(', ')}.`);
    }
    r.productos.slice(0, tope).forEach(p => {
      const ref = p.referencia ? ` (ref. ${p.referencia})` : '';
      const stock = p.stock !== undefined ? ` · stock ${p.stock} ud` : '';
      const cat = p.categoria ? ` · ${p.categoria}` : '';
      lineas.push(`- ${p.nombre}${ref}: ${formatoEuros(p.precio)}${stock}${cat}`);
    });
  }

  if (r.gastos.length > 0) {
    const porCategoria = new Map<string, number>();
    for (const g of r.gastos) {
      const c = g.categoria || 'Sin categoría';
      porCategoria.set(c, (porCategoria.get(c) ?? 0) + (g.total || 0));
    }
    lineas.push('', `=== GASTOS (${r.gastos.length}, total ${formatoEuros(r.totalGastos)}) ===`);
    lineas.push('- Por categoría: ' + [...porCategoria.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([c, t]) => `${c} ${formatoEuros(t)}`).join('; ') + '.');
    [...r.gastos].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')).slice(0, 12).forEach(g => {
      lineas.push(`- ${g.fecha}: ${g.concepto}${g.proveedor ? ` (${g.proveedor})` : ''} · ${formatoEuros(g.total)}`);
    });
  }

  if (r.lotes.length > 0) {
    lineas.push('', `=== LOTES (${r.lotes.length}, primero los que caducan antes) ===`);
    [...r.lotes]
      .sort((a, b) => (a.fechaCaducidad || '9999').localeCompare(b.fechaCaducidad || '9999'))
      .slice(0, 20)
      .forEach(l => lineas.push(`- Lote ${l.numeroLote} de ${l.productoNombre}: ${l.stockActual} ud${l.fechaCaducidad ? ` · caduca ${l.fechaCaducidad}` : ''}`));
  }

  if (r.obras.length > 0) {
    lineas.push('', `=== OBRAS Y PROYECTOS (${r.obras.length}) ===`);
    r.obras.forEach(o => {
      lineas.push(`- [${o.numero}] «${o.nombre}» · ${o.estado}${o.cliente ? ` · cliente ${o.cliente}` : ''}${o.presupuesto ? ` · presupuesto ${formatoEuros(o.presupuesto)}` : ''}`);
    });
  }

  if (r.vendedores.length > 0) {
    lineas.push('', `=== VENDEDORES (${r.vendedores.length}) ===`);
    r.vendedores.forEach(v => lineas.push(`- ${v.nombre}${v.comisionPct !== undefined ? ` · comisión ${v.comisionPct}%` : ''} (${v.activo ? 'activo' : 'inactivo'})`));
  }

  if (r.vehiculos.length > 0) {
    lineas.push('', `=== VEHÍCULOS (${r.vehiculos.length}) ===`);
    r.vehiculos.forEach(v => lineas.push(`- ${v.matricula}${v.nombre ? ` (${v.nombre})` : ''} · ${v.activo ? 'en servicio' : 'de baja'}`));
  }

  lineas.push('', `=== ALMACENES (${r.totalAlmacenes}) ===`);
  if (r.almacenes.length > 0) {
    r.almacenes.forEach(a => {
      lineas.push(`- «${a.nombre}» (código ${a.codigo}${a.direccion ? ` · ${a.direccion}` : ''} · ${a.activo ? 'activo' : 'inactivo'})${a.principal ? ' [PRINCIPAL]' : ''}`);
    });
  } else {
    lineas.push('- No hay almacenes dados de alta.');
  }

  if (r.todosLosDocumentos.length > 0) {
    lineas.push('', `=== REGISTRO DETALLADO DE TODOS LOS DOCUMENTOS (${r.todosLosDocumentos.length}, del más reciente al más antiguo) ===`);
    r.todosLosDocumentos.forEach(d => {
      const sentido = d.sentido === 'compra' ? ' [COMPRA]' : '';
      const nif = d.destinatarioNif ? ` (${d.destinatarioNif})` : '';
      const conceptos = d.lineasResumen ? ` | Conceptos: ${d.lineasResumen}` : '';
      lineas.push(
        `* [${d.tipo.toUpperCase()}${sentido}] ${d.numero} | ${d.destinatario}${nif} | ${d.fechaEmision}${d.fechaVencimiento ? ` (vto. ${d.fechaVencimiento})` : ''} | ${d.estado} | ${formatoEuros(d.total)} (base ${formatoEuros(d.subtotal)} + impuestos ${formatoEuros(d.impuestos)})${conceptos}`,
      );
    });
  }

  return lineas;
}
