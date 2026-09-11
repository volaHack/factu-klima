import { baseQueCuadra, tratamiento, zonaFiscal, type RegimenIgic } from './impuestos';

export interface DatosCliente { nombre: string; nif: string; direccion: string; cp: string; }
export interface LineaPlataforma { concepto: string; cantidad: number; precio: number; tipo: number; }
export interface PayloadFactura {
  origen_externo: string; serie: string; fecha: string;
  cliente_nombre: string; cliente_nif: string | null; cliente_direccion: string | null;
  tipo: 'factura' | 'rectificativa'; tipo_factura_fiscal: 'F1' | 'F2' | 'R1' | 'R5';
  notas: string | null; datos_extras: Record<string, unknown>; lineas: LineaPlataforma[];
  documento_origen_id?: string; documento_origen_number?: string;
}

/** El total de la factura es lo cobrado; el impuesto sale de dentro. */
function lineaDesdeCobrado(concepto: string, cobrado: number, tipo: number): LineaPlataforma {
  const precio = tipo > 0 ? baseQueCuadra(cobrado, tipo).base : cobrado;
  return { concepto, cantidad: 1, precio, tipo };
}

export function facturaDeSuscripcion(a: {
  stripeInvoiceId: string; fecha: string; plan: string; intervalo: 'month' | 'year';
  periodo: { inicio: string; fin: string }; cobrado: number; cliente: DatosCliente;
  serie: string; regimen: RegimenIgic;
}): PayloadFactura | { revisar: string } {
  const zona = zonaFiscal(a.cliente.cp);
  const t = tratamiento(zona, a.regimen);
  if (!t) return { revisar: `${a.cliente.nombre} (CP ${a.cliente.cp || 'vacío'}): fuera de Canarias y península, hay que facturarlo a mano.` };
  if (!a.cliente.nif.trim()) return { revisar: `${a.cliente.nombre}: sin NIF, no se puede emitir la factura completa.` };

  const concepto = `Plan ${a.plan} · ${a.intervalo === 'month' ? 'mensual' : 'anual'} · del ${a.periodo.inicio} al ${a.periodo.fin}`;
  return {
    origen_externo: `stripe:${a.stripeInvoiceId}`, serie: a.serie, fecha: a.fecha,
    cliente_nombre: a.cliente.nombre, cliente_nif: a.cliente.nif, cliente_direccion: a.cliente.direccion,
    tipo: 'factura', tipo_factura_fiscal: 'F1', notas: t.mencion,
    datos_extras: t.calificacion ? { calificacion: t.calificacion } : {},
    lineas: [lineaDesdeCobrado(concepto, a.cobrado, t.tipo)],
  };
}

export function facturaDePropina(a: {
  sessionId: string; fecha: string; cobrado: number; serie: string; regimen: RegimenIgic;
}): PayloadFactura {
  const t = tratamiento('canarias', a.regimen)!;
  return {
    origen_externo: `stripe:${a.sessionId}`, serie: a.serie, fecha: a.fecha,
    cliente_nombre: 'Cliente sin identificar', cliente_nif: null, cliente_direccion: null,
    tipo: 'factura', tipo_factura_fiscal: 'F2', notas: t.mencion, datos_extras: {},
    lineas: [lineaDesdeCobrado('Propina / apoyo al desarrollo', a.cobrado, t.tipo)],
  };
}
