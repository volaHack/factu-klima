/**
 * OFERTAS Y PROMOCIONES
 *
 * «Diez cajas de cerveza y una gratis». «El segundo paquete de pañuelos al
 * 50 %». «Los martes, la fruta a mitad de precio de siete a nueve». Cada
 * gremio tiene las suyas, y todas acaban siendo la misma pregunta: dadas
 * estas líneas de venta, ¿cuánto se le descuenta al cliente y por qué?
 *
 * POR QUÉ ESTO ES UN MÓDULO PURO Y SIN PANTALLA
 * ---------------------------------------------
 * Porque el cálculo tiene que dar lo mismo en los tres sitios donde ocurre
 * —el TPV mientras se escanea, la factura que se emite después, y el
 * presupuesto que se manda antes— y porque es dinero: un 3x2 mal contado no
 * es un fallo de interfaz, es cobrar de más a un cliente o de menos a la
 * caja. Aquí no se toca el DOM ni la base de datos; entran líneas y ofertas,
 * salen líneas y un desglose de lo aplicado, y se puede probar entero.
 *
 * LAS DOS REGLAS QUE LO GOBIERNAN TODO
 * ------------------------------------
 * 1. NUNCA SE COBRA DE MÁS. Si dos ofertas pisan la misma línea y no son
 *    acumulables, se aplica la que más le conviene AL CLIENTE. No la más
 *    nueva, ni la de mayor prioridad: la que más le ahorra. Un cliente que
 *    descubre que había una oferta mejor que no se le aplicó no vuelve.
 * 2. TODO QUEDA EXPLICADO. Cada euro descontado sale con el nombre de la
 *    oferta que lo produjo. Sin eso, ni el cajero puede responder «¿por qué
 *    me cobras esto?» ni el dueño puede saber qué promoción le está
 *    costando el margen.
 *
 * LO QUE NO HACE, A PROPÓSITO
 * ---------------------------
 * No decide el precio base —eso son las tarifas—, no toca el IVA —el
 * descuento va sobre la base imponible y el tipo no cambia— y no reparte
 * regalos por su cuenta: propone la línea de regalo y quien llama decide si
 * la mete. En una caja registradora, lo que aparece solo en el ticket sin
 * que nadie lo haya pedido es un problema, no una comodidad.
 */

import type { Oferta, TipoOferta } from './types';

// ============================================================
// LO QUE ENTRA Y LO QUE SALE
// ============================================================

/** Una línea de venta, con lo mínimo que el motor necesita saber de ella. */
export interface LineaOfertable {
  id: string;
  productId: string;
  /** Categoría del producto, para las ofertas de familia entera. */
  categoria?: string;
  nombre: string;
  cantidad: number;
  /** Precio unitario antes de cualquier descuento. */
  precioUnitario: number;
  /**
   * Descuento que ya llevaba la línea puesto a mano por el comercial.
   * Las ofertas se calculan SOBRE lo que queda después de éste: quien
   * negocia un precio especial no pierde además la promoción.
   */
  descuentoManual?: number;
}

/** Un regalo que una oferta propone añadir al ticket. */
export interface RegaloPropuesto {
  ofertaId: string;
  productId: string;
  nombre: string;
  cantidad: number;
}

/** Una oferta que ha entrado, con lo que ha supuesto. */
export interface OfertaAplicada {
  ofertaId: string;
  nombre: string;
  tipo: TipoOferta;
  /** Sobre qué línea. Ausente en las que actúan sobre el ticket entero. */
  lineaId?: string;
  /** Euros que se le descuentan al cliente por esta oferta. */
  ahorro: number;
  /** Cómo explicárselo a quien pregunte: «3x2 · 1 unidad gratis». */
  detalle: string;
}

/** Una línea después de pasar por las ofertas. */
export interface LineaConOferta extends LineaOfertable {
  /** Lo que costaba la línea sin ninguna oferta (ya con el descuento manual). */
  importeSinOfertas: number;
  /** Lo que cuesta después de aplicarlas. */
  importe: number;
  /** Cuánto se ahorra en esta línea. */
  ahorro: number;
  /**
   * El ahorro expresado como porcentaje de descuento sobre el importe que
   * tenía la línea, para poder guardarlo en el hueco de descuento de la
   * factura y que salga impreso.
   */
  descuentoOferta: number;
}

export interface ResultadoOfertas {
  lineas: LineaConOferta[];
  aplicadas: OfertaAplicada[];
  regalos: RegaloPropuesto[];
  /** Suma de todo lo descontado, en euros. */
  ahorroTotal: number;
}

/** Todo lo que hace falta saber del ticket para decidir qué ofertas entran. */
export interface ContextoOferta {
  /** Momento de la venta. Manda para las vigencias y las horas. */
  fecha?: Date;
  /** A qué grupo de clientes pertenece el comprador, si a alguno. */
  grupoClienteId?: string;
  /** Id del cliente, para las ofertas dirigidas a uno concreto. */
  clientId?: string;
}

// ============================================================
// DINERO
// ============================================================

/**
 * Redondeo a céntimo, y sólo aquí.
 *
 * Todo el cálculo intermedio va en coma flotante sin redondear —redondear a
 * mitad de camino es como se acumulan los céntimos de diferencia entre lo
 * que dice el ticket y lo que dice la suma— y se corta al final.
 */
export function aCentimos(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

/** El importe de una línea con su descuento manual ya aplicado. */
function importeBase(linea: LineaOfertable): number {
  const queda = 1 - (linea.descuentoManual ?? 0) / 100;
  return linea.cantidad * linea.precioUnitario * queda;
}

/** Lo que cuesta una unidad después del descuento manual. */
function precioUnitarioBase(linea: LineaOfertable): number {
  return linea.precioUnitario * (1 - (linea.descuentoManual ?? 0) / 100);
}

// ============================================================
// VIGENCIA
// ============================================================

/** `HH:MM` a minutos desde medianoche. Devuelve null si no se entiende. */
function enMinutos(hora?: string): number | null {
  if (!hora) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hora.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Si la oferta está viva en este momento.
 *
 * Las horas admiten cruzar la medianoche —«de 22:00 a 02:00» es una franja
 * de un bar, no un error— y por eso no se comparan con un simple `>=` y
 * `<=`: cuando el fin es menor que el inicio, la franja es la unión de los
 * dos trozos.
 */
export function ofertaVigente(oferta: Oferta, ahora = new Date()): boolean {
  if (!oferta.activa) return false;

  const dia = ahora.toISOString().slice(0, 10);
  if (oferta.desde && dia < oferta.desde) return false;
  if (oferta.hasta && dia > oferta.hasta) return false;

  // 0 = domingo, como `getDay()`.
  if (oferta.diasSemana?.length && !oferta.diasSemana.includes(ahora.getDay())) return false;

  const inicio = enMinutos(oferta.horaInicio);
  const fin = enMinutos(oferta.horaFin);
  if (inicio !== null && fin !== null) {
    const minutos = ahora.getHours() * 60 + ahora.getMinutes();
    const dentro = inicio <= fin
      ? minutos >= inicio && minutos <= fin
      : minutos >= inicio || minutos <= fin;
    if (!dentro) return false;
  }

  if (typeof oferta.usosMaximos === 'number' && (oferta.usos ?? 0) >= oferta.usosMaximos) return false;

  return true;
}

/** Si la oferta va dirigida a este cliente. Sin restricción, va a todos. */
function alcanzaAlCliente(oferta: Oferta, ctx: ContextoOferta): boolean {
  if (oferta.soloGrupoClienteId && oferta.soloGrupoClienteId !== ctx.grupoClienteId) return false;
  if (oferta.soloClienteId && oferta.soloClienteId !== ctx.clientId) return false;
  return true;
}

/** Si la oferta se aplica a esta línea por producto o por familia. */
export function alcanzaALaLinea(oferta: Oferta, linea: LineaOfertable): boolean {
  switch (oferta.alcance) {
    case 'todo':
      return true;
    case 'producto':
      return oferta.alcanceIds.includes(linea.productId);
    case 'categoria':
      return Boolean(linea.categoria && oferta.alcanceIds.includes(linea.categoria));
    default:
      return false;
  }
}

// ============================================================
// LO QUE DESCUENTA CADA CLASE DE OFERTA
// ============================================================

/** Lo que una oferta le ahorra a UNA línea, en euros, y cómo se explica. */
interface Efecto {
  ahorro: number;
  detalle: string;
}

const SIN_EFECTO: Efecto = { ahorro: 0, detalle: '' };

/**
 * «Llévate N, paga M».
 *
 * Es la forma general de casi todo lo que se anuncia en un cartel: el 3x2
 * es N=3, M=2, y «diez cajas y una gratis» es N=11, M=10 —once te llevas,
 * diez pagas—. Se aplica por grupos completos: con siete unidades de un 3x2
 * entran dos grupos (seis unidades, dos gratis) y la séptima se paga
 * entera. Contar la séptima como «medio grupo» sería regalar algo que el
 * cartel no promete.
 */
function efectoNxM(oferta: Oferta, linea: LineaOfertable): Efecto {
  const lleva = oferta.paramN ?? 0;
  const paga = oferta.paramM ?? 0;
  if (lleva <= 0 || paga <= 0 || paga >= lleva) return SIN_EFECTO;

  const grupos = Math.floor(linea.cantidad / lleva);
  if (grupos < 1) return SIN_EFECTO;

  const gratis = grupos * (lleva - paga);
  const ahorro = gratis * precioUnitarioBase(linea);
  return {
    ahorro,
    detalle: `${lleva}x${paga} · ${gratis} ${gratis === 1 ? 'unidad gratis' : 'unidades gratis'}`,
  };
}

/**
 * «La segunda unidad al X %».
 *
 * El «paquete de pañuelos 50 % gratuito» del encargo es esto con X = 50: se
 * paga la primera entera y la segunda a mitad. Se aplica por PAREJAS, y la
 * unidad suelta que sobre se paga entera.
 */
function efectoUnidadSiguiente(oferta: Oferta, linea: LineaOfertable): Efecto {
  const descuento = oferta.paramPorcentaje ?? 0;
  if (descuento <= 0) return SIN_EFECTO;

  const parejas = Math.floor(linea.cantidad / 2);
  if (parejas < 1) return SIN_EFECTO;

  const ahorro = parejas * precioUnitarioBase(linea) * (descuento / 100);
  return {
    ahorro,
    detalle: `2ª unidad al ${descuento} % · ${parejas} ${parejas === 1 ? 'pareja' : 'parejas'}`,
  };
}

/** Un tanto por ciento sobre toda la línea. */
function efectoPorcentaje(oferta: Oferta, linea: LineaOfertable): Efecto {
  const pct = oferta.paramPorcentaje ?? 0;
  if (pct <= 0) return SIN_EFECTO;
  return { ahorro: importeBase(linea) * (pct / 100), detalle: `-${pct} %` };
}

/** Tantos euros menos por cada unidad comprada. */
function efectoImporte(oferta: Oferta, linea: LineaOfertable): Efecto {
  const euros = oferta.paramImporte ?? 0;
  if (euros <= 0) return SIN_EFECTO;
  // Nunca por debajo de cero: un descuento no puede convertirse en un pago
  // al cliente por llevarse el género.
  const ahorro = Math.min(euros * linea.cantidad, importeBase(linea));
  return { ahorro, detalle: `-${euros.toFixed(2)} € por unidad` };
}

/** Precio cerrado por unidad mientras dure la promoción. */
function efectoPrecioFijo(oferta: Oferta, linea: LineaOfertable): Efecto {
  const precio = oferta.paramImporte;
  if (typeof precio !== 'number' || precio < 0) return SIN_EFECTO;

  const actual = precioUnitarioBase(linea);
  if (precio >= actual) return SIN_EFECTO; // no es oferta si sale más caro

  return {
    ahorro: (actual - precio) * linea.cantidad,
    detalle: `Precio promoción ${precio.toFixed(2)} €`,
  };
}

/**
 * Por tramos de cantidad: a partir de tantas unidades, tanto por ciento.
 *
 * Se coge el tramo MÁS ALTO que se alcanza, no la suma de todos: comprar
 * cincuenta no da el descuento de diez más el de veinte más el de
 * cincuenta, da el de cincuenta.
 */
function efectoEscalado(oferta: Oferta, linea: LineaOfertable): Efecto {
  const tramos = (oferta.tramos ?? [])
    .filter(t => t.desdeCantidad > 0 && t.porcentaje > 0)
    .sort((a, b) => b.desdeCantidad - a.desdeCantidad);

  const tramo = tramos.find(t => linea.cantidad >= t.desdeCantidad);
  if (!tramo) return SIN_EFECTO;

  return {
    ahorro: importeBase(linea) * (tramo.porcentaje / 100),
    detalle: `Desde ${tramo.desdeCantidad} uds · -${tramo.porcentaje} %`,
  };
}

/** Qué le hace una oferta a una línea. */
export function efectoSobreLinea(oferta: Oferta, linea: LineaOfertable): Efecto {
  if (linea.cantidad <= 0) return SIN_EFECTO;
  if (typeof oferta.minimoUnidades === 'number' && linea.cantidad < oferta.minimoUnidades) return SIN_EFECTO;

  switch (oferta.tipo) {
    case 'nxm': return efectoNxM(oferta, linea);
    case 'unidad_siguiente': return efectoUnidadSiguiente(oferta, linea);
    case 'porcentaje': return efectoPorcentaje(oferta, linea);
    case 'importe': return efectoImporte(oferta, linea);
    case 'precio_fijo': return efectoPrecioFijo(oferta, linea);
    case 'escalado': return efectoEscalado(oferta, linea);
    // El regalo no descuenta dinero de la línea: añade otra cosa al ticket.
    case 'regalo': return SIN_EFECTO;
    default: return SIN_EFECTO;
  }
}

// ============================================================
// EL MOTOR
// ============================================================

/**
 * Aplica las ofertas a un conjunto de líneas.
 *
 * El orden es el que importa:
 *
 * 1. Se descartan las que no están vigentes o no van dirigidas a este
 *    cliente. Una oferta caducada no se mira más.
 * 2. Por cada línea se calcula qué le haría CADA oferta que la alcanza.
 * 3. Se resuelven los choques: entre las no acumulables gana la que más
 *    ahorra al cliente, y encima de ella se suman las que sí lo son.
 * 4. Se comprueba el mínimo de compra del ticket, que no se puede saber
 *    hasta tener el total.
 * 5. Y se redondea, una sola vez, al final.
 */
export function aplicarOfertas(
  lineas: LineaOfertable[],
  ofertas: Oferta[],
  ctx: ContextoOferta = {},
): ResultadoOfertas {
  const ahora = ctx.fecha ?? new Date();

  const candidatas = ofertas.filter(o => ofertaVigente(o, ahora) && alcanzaAlCliente(o, ctx));

  // El mínimo de compra se mide sobre el ticket ANTES de las ofertas: si se
  // midiera después, aplicar una oferta podría dejar el ticket por debajo
  // del mínimo y desactivarla, que a su vez lo subiría otra vez. Ese bucle
  // no tiene solución estable y el cliente vería el total bailando.
  const totalSinOfertas = lineas.reduce((s, l) => s + importeBase(l), 0);
  const conMinimo = candidatas.filter(o =>
    typeof o.minimoImporte !== 'number' || totalSinOfertas >= o.minimoImporte);

  const aplicadas: OfertaAplicada[] = [];
  const regalos: RegaloPropuesto[] = [];

  const resultado: LineaConOferta[] = lineas.map(linea => {
    const base = importeBase(linea);
    const alcanzan = conMinimo.filter(o => alcanzaALaLinea(o, linea));

    // Los regalos se anotan aparte: no bajan el precio de esta línea.
    for (const oferta of alcanzan) {
      if (oferta.tipo !== 'regalo') continue;
      if (!oferta.regaloProductId) continue;
      const cada = oferta.paramN ?? 1;
      if (cada <= 0) continue;
      const veces = Math.floor(linea.cantidad / cada);
      if (veces < 1) continue;
      const cantidad = veces * (oferta.regaloCantidad ?? 1);
      regalos.push({
        ofertaId: oferta.id,
        productId: oferta.regaloProductId,
        nombre: oferta.regaloNombre ?? 'Regalo',
        cantidad,
      });
      aplicadas.push({
        ofertaId: oferta.id,
        nombre: oferta.nombre,
        tipo: oferta.tipo,
        lineaId: linea.id,
        ahorro: 0,
        detalle: `Regalo · ${cantidad} × ${oferta.regaloNombre ?? 'artículo'}`,
      });
    }

    const efectos = alcanzan
      .filter(o => o.tipo !== 'regalo')
      .map(o => ({ oferta: o, efecto: efectoSobreLinea(o, linea) }))
      .filter(e => e.efecto.ahorro > 0);

    if (efectos.length === 0) {
      return {
        ...linea,
        importeSinOfertas: aCentimos(base),
        importe: aCentimos(base),
        ahorro: 0,
        descuentoOferta: 0,
      };
    }

    const acumulables = efectos.filter(e => e.oferta.acumulable);
    const exclusivas = efectos.filter(e => !e.oferta.acumulable);

    // De las exclusivas, la que más le ahorra al cliente. La prioridad sólo
    // decide un empate: si dos ahorran lo mismo, manda la que el usuario
    // haya puesto por delante.
    const mejorExclusiva = exclusivas.sort((a, b) => {
      const dif = b.efecto.ahorro - a.efecto.ahorro;
      if (Math.abs(dif) > 0.0001) return dif;
      return (b.oferta.prioridad ?? 0) - (a.oferta.prioridad ?? 0);
    })[0];

    const elegidas = [...(mejorExclusiva ? [mejorExclusiva] : []), ...acumulables];

    // Nunca por debajo de cero, por muchas que se acumulen.
    let restante = base;
    let ahorroLinea = 0;
    for (const { oferta, efecto } of elegidas) {
      const aplicado = Math.min(efecto.ahorro, restante);
      if (aplicado <= 0) continue;
      restante -= aplicado;
      ahorroLinea += aplicado;
      aplicadas.push({
        ofertaId: oferta.id,
        nombre: oferta.nombre,
        tipo: oferta.tipo,
        lineaId: linea.id,
        ahorro: aCentimos(aplicado),
        detalle: efecto.detalle,
      });
    }

    const importe = base - ahorroLinea;
    return {
      ...linea,
      importeSinOfertas: aCentimos(base),
      importe: aCentimos(importe),
      ahorro: aCentimos(ahorroLinea),
      descuentoOferta: base > 0 ? Number(((ahorroLinea / base) * 100).toFixed(4)) : 0,
    };
  });

  return {
    lineas: resultado,
    aplicadas,
    regalos,
    ahorroTotal: aCentimos(resultado.reduce((s, l) => s + l.ahorro, 0)),
  };
}

// ============================================================
// PARA ENSEÑARLO
// ============================================================

/** Cómo se llama cada clase de oferta en pantalla. */
export const NOMBRES_TIPO: Record<TipoOferta, string> = {
  nxm: 'Llévate N, paga M',
  unidad_siguiente: 'Segunda unidad rebajada',
  porcentaje: 'Porcentaje de descuento',
  importe: 'Euros de descuento',
  precio_fijo: 'Precio de promoción',
  escalado: 'Descuento por cantidad',
  regalo: 'Regalo por compra',
};

/**
 * Una frase que explique la oferta tal y como se pondría en el cartel.
 *
 * Se usa en el listado, en el TPV y en el ticket: es la misma promesa en
 * los tres sitios, escrita una sola vez.
 */
export function describirOferta(oferta: Oferta): string {
  switch (oferta.tipo) {
    case 'nxm': {
      const n = oferta.paramN ?? 0;
      const m = oferta.paramM ?? 0;
      const gratis = Math.max(0, n - m);
      return gratis === 1 && m > 1
        ? `Compra ${m} y llévate ${n} (1 gratis)`
        : `${n}x${m}`;
    }
    case 'unidad_siguiente':
      return `2ª unidad al ${oferta.paramPorcentaje ?? 0} % de descuento`;
    case 'porcentaje':
      return `${oferta.paramPorcentaje ?? 0} % de descuento`;
    case 'importe':
      return `${(oferta.paramImporte ?? 0).toFixed(2)} € menos por unidad`;
    case 'precio_fijo':
      return `A ${(oferta.paramImporte ?? 0).toFixed(2)} € la unidad`;
    case 'escalado': {
      const tramos = (oferta.tramos ?? []).slice().sort((a, b) => a.desdeCantidad - b.desdeCantidad);
      if (!tramos.length) return 'Descuento por cantidad';
      return tramos.map(t => `${t.desdeCantidad}+ uds: -${t.porcentaje} %`).join(' · ');
    }
    case 'regalo':
      return `Por cada ${oferta.paramN ?? 1}, ${oferta.regaloCantidad ?? 1} × ${oferta.regaloNombre ?? 'regalo'}`;
    default:
      return '';
  }
}

/** Por qué una oferta no está entrando ahora mismo. Vacío si sí está. */
export function motivoNoVigente(oferta: Oferta, ahora = new Date()): string {
  if (!oferta.activa) return 'Está desactivada';

  const dia = ahora.toISOString().slice(0, 10);
  if (oferta.desde && dia < oferta.desde) return `Empieza el ${oferta.desde}`;
  if (oferta.hasta && dia > oferta.hasta) return `Terminó el ${oferta.hasta}`;
  if (oferta.diasSemana?.length && !oferta.diasSemana.includes(ahora.getDay())) {
    return 'Hoy no es uno de sus días';
  }

  const inicio = enMinutos(oferta.horaInicio);
  const fin = enMinutos(oferta.horaFin);
  if (inicio !== null && fin !== null) {
    const minutos = ahora.getHours() * 60 + ahora.getMinutes();
    const dentro = inicio <= fin
      ? minutos >= inicio && minutos <= fin
      : minutos >= inicio || minutos <= fin;
    if (!dentro) return `Sólo de ${oferta.horaInicio} a ${oferta.horaFin}`;
  }

  if (typeof oferta.usosMaximos === 'number' && (oferta.usos ?? 0) >= oferta.usosMaximos) {
    return 'Se ha agotado el número de usos';
  }
  return '';
}
