import { InvoiceStatus, type Client, type CompanySettings, type Invoice } from '../types';

/**
 * LO QUE EL ASISTENTE SABE DE LA SITUACIÓN DEL CLIENTE
 *
 * Un asistente que sólo conoce el manual contesta cosas ciertas e
 * inútiles: «para cobrar una factura vencida, entra en Facturas y…».
 * El que sabe que HAY tres vencidas, y cuáles, contesta lo que hace
 * falta: «tienes 3 vencidas por 1.240 € — la más vieja es la FAC-0012
 * de hace 47 días».
 *
 * Esto arma ese retrato, y lo arma CONTANDO, no mandando los datos: al
 * modelo le va un resumen de números y estados, nunca la lista de
 * clientes ni sus importes uno a uno. Dos razones, y las dos importan:
 * los datos de facturación de una empresa no tienen por qué pasearse por
 * un servicio de terceros, y una lista de doscientas facturas no cabe —y
 * no ayuda— en un enunciado.
 *
 * Lo que sí viaja son los números de las facturas que el asistente puede
 * necesitar nombrar («la FAC-2026-0012 lleva 47 días vencida»), y como
 * mucho unas pocas. Un número de factura no dice cuánto factura nadie.
 */

export interface RetratoDelPanel {
  /** Facturas emitidas en total, sin contar anuladas. */
  facturas: number;
  borradores: number;
  vencidas: number;
  /** Importe de lo vencido, redondeado a euros. */
  importeVencido: number;
  pendientesDeCobro: number;
  importePendiente: number;
  /** Las vencidas más viejas, para poder nombrarlas. */
  vencidasMasViejas: { numero: string; dias: number }[];
  clientesActivos: number;
  /** Facturas emitidas este mes natural. */
  facturasDelMes: number;
  importeDelMes: number;

  // --- Lo que puede estar sin terminar de configurar ---
  tieneNif: boolean;
  tieneDireccion: boolean;
  tieneLogotipo: boolean;
  tienePlantillaPropia: boolean;
  verifactuActivo: boolean;
  impuesto: 'IVA' | 'IGIC';
  plan: string;
}

function dias(desde: string): number {
  const ms = Date.now() - new Date(desde).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

function euros(importe: number): number {
  return Math.round(importe);
}

export function retratoDelPanel(entrada: {
  facturas: Invoice[];
  clientes: Client[];
  ajustes: CompanySettings | null;
  tienePlantillaPropia: boolean;
}): RetratoDelPanel {
  const { ajustes } = entrada;
  const vivas = entrada.facturas.filter(f => f.status !== InvoiceStatus.ANULADA);

  const borradores = vivas.filter(f => f.status === InvoiceStatus.BORRADOR);
  const vencidas = vivas.filter(f => f.status === InvoiceStatus.VENCIDA);
  const pendientes = vivas.filter(
    f => f.status === InvoiceStatus.PENDIENTE || f.status === InvoiceStatus.EMITIDA,
  );

  const ahora = new Date();
  const delMes = vivas.filter(f => {
    const d = new Date(f.issueDate);
    return d.getMonth() === ahora.getMonth() && d.getFullYear() === ahora.getFullYear();
  });

  return {
    facturas: vivas.length,
    borradores: borradores.length,
    vencidas: vencidas.length,
    importeVencido: euros(vencidas.reduce((s, f) => s + f.total, 0)),
    pendientesDeCobro: pendientes.length,
    importePendiente: euros(pendientes.reduce((s, f) => s + f.total, 0)),
    vencidasMasViejas: [...vencidas]
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .slice(0, 3)
      .map(f => ({ numero: f.number, dias: dias(f.dueDate) })),
    clientesActivos: entrada.clientes.filter(c => c.active).length,
    facturasDelMes: delMes.length,
    importeDelMes: euros(delMes.reduce((s, f) => s + f.total, 0)),

    tieneNif: Boolean(ajustes?.nif?.trim()),
    tieneDireccion: Boolean(ajustes?.address?.trim()),
    tieneLogotipo: Boolean(ajustes?.logoUrl?.trim()),
    tienePlantillaPropia: entrada.tienePlantillaPropia,
    verifactuActivo: Boolean(ajustes?.verifactuEnabled),
    impuesto: ajustes?.igicEnabled ? 'IGIC' : 'IVA',
    plan: ajustes?.planId ?? 'sin plan',
  };
}

/**
 * El retrato, escrito en frases.
 *
 * Se le manda al modelo tal cual. En castellano y no en JSON porque un
 * modelo pequeño lee mucho mejor «tienes 3 facturas vencidas por 1.240 €»
 * que `{"vencidas":3,"importeVencido":1240}`, y porque así lo que se
 * envía se puede leer de un vistazo y comprobar que no lleva nada que no
 * deba salir de aquí.
 */
export function retratoEnPalabras(r: RetratoDelPanel): string[] {
  const lineas: string[] = [
    `- Facturas emitidas: ${r.facturas}. Este mes: ${r.facturasDelMes}, por ${r.importeDelMes} €.`,
    `- Borradores sin emitir: ${r.borradores}.`,
    `- Pendientes de cobro: ${r.pendientesDeCobro}, por ${r.importePendiente} €.`,
    `- Vencidas: ${r.vencidas}, por ${r.importeVencido} €.`,
  ];

  if (r.vencidasMasViejas.length > 0) {
    lineas.push(
      '- Las vencidas más antiguas: '
      + r.vencidasMasViejas.map(v => `${v.numero} (${v.dias} días)`).join(', ') + '.',
    );
  }

  lineas.push(`- Clientes activos: ${r.clientesActivos}.`);
  lineas.push(`- Impuesto configurado: ${r.impuesto}. Plan: ${r.plan}.`);

  // Lo que está a medias. Se dice sólo cuando falta: una lista de cosas
  // que ya están bien no ayuda a nadie y gasta enunciado.
  const pendiente: string[] = [];
  if (!r.tieneNif) pendiente.push('el NIF de la empresa');
  if (!r.tieneDireccion) pendiente.push('la dirección de la empresa');
  if (!r.tieneLogotipo) pendiente.push('el logotipo');
  if (!r.tienePlantillaPropia) pendiente.push('un diseño de documento propio');
  if (!r.verifactuActivo) pendiente.push('activar Veri*Factu');
  if (pendiente.length > 0) {
    lineas.push(`- SIN CONFIGURAR TODAVÍA: ${pendiente.join(', ')}.`);
  }

  return lineas;
}
