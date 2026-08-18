/**
 * EL COSTE DE LO VENDIDO, RECONSTRUIDO EN ORDEN
 *
 * El precio medio ponderado se calcula hacia delante: entra una compra y el
 * medio se mueve. Eso funciona si las cosas se apuntan en el orden en que
 * pasan, y en una empresa de verdad no pasa nunca.
 *
 * Lo normal es esto: se vende el lunes, se factura el lunes, y la factura del
 * proveedor llega el día 20 del mes siguiente. Cuando se mete la compra, esa
 * venta del lunes lleva ya un mes guardada con el coste que se supo entonces
 * —el medio viejo, o cero si el producto era nuevo— y nadie la corrige. El
 * margen que enseña el programa es mentira, y encima es mentira siempre en la
 * misma dirección: si el producto era nuevo el coste guardado fue cero, así
 * que el beneficio sale del 100%.
 *
 * Aquí se reconstruye. Se ponen todos los movimientos en orden de fecha, se
 * recalcula el medio en cada paso, y se dice cuánto costó DE VERDAD cada
 * salida. Es lo que hace cualquier programa de contabilidad al cerrar el mes,
 * y se llama regularizar.
 *
 * NO SE TOCA NINGUNA FACTURA. El coste guardado en la línea de venta se
 * queda como está, porque es un dato histórico legítimo: lo que se sabía al
 * emitirla. Lo que sale de aquí es lo que costó realmente, y es lo que miran
 * los informes. Además una factura sellada no se puede modificar, y el coste
 * de lo vendido no es un dato fiscal: es contabilidad de gestión.
 */

/** Un movimiento de existencias, venga de donde venga. */
export interface MovimientoCoste {
  /** Para ordenar. Formato ISO (`2026-08-19` o con hora). */
  fecha: string;
  tipo: 'compra' | 'venta' | 'ajuste';
  /** Siempre en positivo: el signo lo pone el tipo. */
  cantidad: number;
  /**
   * Coste unitario neto. Obligatorio en las compras; en las ventas se ignora
   * (es lo que se calcula) y en los ajustes, si viene, fija el coste de lo
   * que entra.
   */
  precio?: number;
  /** Para poder devolver el coste al sitio del que salió el movimiento. */
  referencia: string;
}

/** Lo que costó una salida concreta. */
export interface CosteDeVenta {
  referencia: string;
  fecha: string;
  cantidad: number;
  /** Coste unitario en ese momento. */
  costeUnitario: number;
  /** cantidad × costeUnitario. */
  costeTotal: number;
  /**
   * true si en ese momento no se sabía todavía lo que costaba, porque la
   * primera compra es posterior. Se le ha puesto el precio de esa primera
   * compra, que es la mejor respuesta posible, pero conviene saberlo.
   */
  estimado: boolean;
}

export interface ResultadoCostes {
  /** El precio medio al final de todo el histórico. */
  pmpFinal: number;
  /** Las existencias al final, que pueden salir negativas. Ver abajo. */
  existenciasFinales: number;
  costes: CosteDeVenta[];
  /**
   * Las existencias se quedaron en negativo en algún momento.
   *
   * Significa que se vendió lo que aún no constaba comprado, casi siempre
   * porque falta meter un albarán de compra. Los números salen igualmente,
   * pero conviene mirarlo.
   */
  huboDescubierto: boolean;
}

/**
 * Reproduce el histórico de un producto y devuelve lo que costó cada salida.
 *
 * Los movimientos se ordenan por fecha, y a igualdad de fecha entran ANTES
 * las compras que las ventas. No es un capricho: cuando la compra y la venta
 * son del mismo día —el género que se recibe por la mañana y sale por la
 * tarde, que en distribución es lo corriente— procesar la venta primero la
 * dejaría sin coste conocido y con las existencias en negativo por un día.
 */
export function reproducirCostes(movimientos: MovimientoCoste[]): ResultadoCostes {
  const orden = { compra: 0, ajuste: 1, venta: 2 };
  const ordenados = [...movimientos].sort((a, b) =>
    a.fecha.localeCompare(b.fecha) || orden[a.tipo] - orden[b.tipo]);

  let existencias = 0;
  let pmp = 0;
  let huboDescubierto = false;
  const costes: CosteDeVenta[] = [];

  for (const mov of ordenados) {
    const cantidad = Math.abs(mov.cantidad);
    if (cantidad === 0) continue;

    if (mov.tipo === 'compra' || (mov.tipo === 'ajuste' && mov.precio !== undefined)) {
      const precio = mov.precio ?? 0;
      // El medio ponderado de toda la vida. Con las existencias en negativo
      // —se vendió más de lo que consta comprado— la fórmula da un disparate,
      // así que en ese caso la entrada fija el medio en vez de mezclarse con
      // un saldo que no existe.
      const base = Math.max(existencias, 0);
      pmp = base + cantidad > 0
        ? ((base * pmp) + (cantidad * precio)) / (base + cantidad)
        : precio;
      existencias += cantidad;
      continue;
    }

    if (mov.tipo === 'ajuste') {
      // Un ajuste sin precio sólo mueve el recuento: una merma o un recuento
      // de inventario no cambian lo que costó el género que queda.
      existencias += mov.cantidad;
      continue;
    }

    // Una venta.
    costes.push({
      referencia: mov.referencia,
      fecha: mov.fecha,
      cantidad,
      costeUnitario: pmp,
      costeTotal: redondear(cantidad * pmp),
      estimado: pmp === 0,
    });
    existencias -= cantidad;
    if (existencias < 0) huboDescubierto = true;
  }

  // Segunda pasada, para lo que se vendió antes de que constara ninguna
  // compra. En ese momento no había forma de saber el coste, así que se le
  // pone el de la primera compra que llegó: es la mejor respuesta posible, y
  // desde luego mejor que cero, que daría un margen del cien por cien y un
  // beneficio que nadie ha tenido.
  const primeraCompra = ordenados.find(m => m.tipo === 'compra' && (m.precio ?? 0) > 0);
  if (primeraCompra) {
    for (const coste of costes) {
      if (!coste.estimado) continue;
      coste.costeUnitario = primeraCompra.precio!;
      coste.costeTotal = redondear(coste.cantidad * primeraCompra.precio!);
    }
  }

  return {
    pmpFinal: redondear(pmp, 4),
    existenciasFinales: redondear(existencias, 4),
    costes,
    huboDescubierto,
  };
}

function redondear(n: number, decimales = 2): number {
  const factor = 10 ** decimales;
  return Math.round(n * factor) / factor;
}

// ============================================================
// DE LOS DOCUMENTOS GUARDADOS A LOS MOVIMIENTOS
// ============================================================

/** Lo mínimo que hace falta de un documento para sacar sus movimientos. */
export interface DocumentoParaCostes {
  id: string;
  number: string;
  issueDate: string;
  tipo?: string;
  sentido?: string;
  status: string;
  lineItems: {
    id: string;
    productId: string;
    quantity: number;
    unitPrice: number;
    discountPercent?: number;
    discountPercent2?: number;
    discountPercent3?: number;
  }[];
}

/** Y de una regularización de almacén. */
export interface AjusteParaCostes {
  id: string;
  fecha: string;
  productId: string;
  diferencia: number;
}

/**
 * Qué documentos mueven existencias de verdad.
 *
 * Un presupuesto y un pedido no: son intenciones, y hasta que no sale el
 * género del almacén no hay nada que costear. Un albarán sí, en cuanto se
 * expide, que es cuando la mercancía se mueve físicamente.
 *
 * Las facturas NO cuentan aquí a propósito, aunque lleven las mismas líneas:
 * casi siempre nacen de un albarán ya expedido y contarlas dos veces
 * duplicaría las salidas. Una factura directa sin albarán sí cuenta, porque
 * entonces es ella la que saca el género.
 */
export function moviemientosDeDocumento(doc: DocumentoParaCostes, productId: string): MovimientoCoste[] {
  const tipo = doc.tipo ?? 'factura';
  const esCompra = (doc.sentido ?? 'venta') === 'compra';

  if (tipo === 'presupuesto' || tipo === 'pedido') return [];
  if (tipo === 'albaran' && doc.status !== 'expedido') return [];
  if (tipo === 'factura' || tipo === 'rectificativa') {
    if (doc.status === 'borrador' || doc.status === 'anulada') return [];
  }

  return doc.lineItems
    .filter(li => li.productId === productId && li.quantity !== 0)
    .map(li => ({
      fecha: doc.issueDate,
      tipo: esCompra ? ('compra' as const) : ('venta' as const),
      cantidad: Math.abs(li.quantity),
      precio: esCompra ? precioNeto(li) : undefined,
      referencia: `${doc.number}#${li.id}`,
    }));
}

/** Lo que cuesta de verdad una unidad comprada: con los tres descuentos. */
function precioNeto(li: {
  unitPrice: number; discountPercent?: number; discountPercent2?: number; discountPercent3?: number;
}): number {
  return li.unitPrice
    * (1 - (li.discountPercent || 0) / 100)
    * (1 - (li.discountPercent2 || 0) / 100)
    * (1 - (li.discountPercent3 || 0) / 100);
}

/** Una regularización de almacén, como ajuste sin precio. */
export function movimientoDeAjuste(ajuste: AjusteParaCostes): MovimientoCoste {
  return {
    fecha: ajuste.fecha,
    tipo: 'ajuste',
    cantidad: ajuste.diferencia,
    referencia: `ajuste#${ajuste.id}`,
  };
}

/**
 * Todos los movimientos de un producto, listos para reproducir.
 *
 * Ojo con las facturas que nacen de un albarán: se descartan para no contar
 * la misma salida dos veces. Se reconocen porque llevan apuntado de qué
 * documento vienen.
 */
export function movimientosDeProducto(
  productId: string,
  documentos: DocumentoParaCostes[],
  ajustes: AjusteParaCostes[],
  vieneDeAlbaran: (doc: DocumentoParaCostes) => boolean,
): MovimientoCoste[] {
  const deDocumentos = documentos
    .filter(d => !vieneDeAlbaran(d))
    .flatMap(d => moviemientosDeDocumento(d, productId));
  const deAjustes = ajustes
    .filter(a => a.productId === productId && a.diferencia !== 0)
    .map(movimientoDeAjuste);
  return [...deDocumentos, ...deAjustes];
}
