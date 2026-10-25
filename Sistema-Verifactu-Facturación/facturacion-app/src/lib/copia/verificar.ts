/**
 * ¿SIRVE ESTA COPIA PARA RECONSTRUIR LA EMPRESA?
 *
 * Tres comprobaciones, de la más barata a la más fuerte:
 *   1. El manifiesto: cada tabla tiene las filas y el contenido que dice.
 *   2. La cadena Veri*Factu: cada registro vuelve a dar SU huella al
 *      recalcularla (con el mismo algoritmo que la AEAT, lib/verifactu/huella)
 *      y engancha con el anterior.
 *   3. Las facturas emitidas tienen su registro de alta, con la misma huella.
 */

import { comprobarManifiesto, TABLAS } from './nucleo.mjs';
import { fechaAeat, huellaDeAlta, huellaDeAnulacion } from '@/lib/verifactu/huella';

type Fila = Record<string, unknown>;
export interface CopiaEmpresa {
  formato?: number;
  cuenta?: string;
  manifiesto?: Record<string, { filas: number; sha256: string }>;
  huellaCopia?: string;
  tablas?: Record<string, Fila[]>;
}

export interface ResultadoVerificacion {
  ok: boolean;
  problemas: string[];
  resumen: { tablas: number; filas: number; registrosVerifactu: number; facturasSelladas: number };
}

const SELLABLE = (f: Fila) => ['factura', 'rectificativa'].includes(String(f.tipo ?? 'factura')) && (f.sentido ?? 'venta') === 'venta';

export async function verificarCopia(copia: CopiaEmpresa): Promise<ResultadoVerificacion> {
  const problemas = await comprobarManifiesto(copia);
  const tablas = copia.tablas ?? {};

  // 2. La cadena, en orden.
  const registros = [...(tablas.verifactu_registros ?? [])].sort((a, b) => Number(a.indice) - Number(b.indice));
  if (registros.length && Number(registros[0].indice) !== 1) {
    problemas.push(`La cadena Veri*Factu de la copia empieza en el registro ${registros[0].indice}: faltan los anteriores.`);
  }
  let anterior: Fila | null = null;
  for (const r of registros) {
    const n = String(r.num_serie);
    if (anterior === null) {
      if (r.huella_anterior) problemas.push(`Registro ${r.indice} (${n}): es el primero de la copia pero dice enganchar con otro anterior.`);
    } else {
      if (Number(r.indice) !== Number(anterior.indice) + 1) problemas.push(`Falta el registro ${Number(anterior.indice) + 1} de la cadena (salta de ${anterior.indice} a ${r.indice}).`);
      if (r.huella_anterior !== anterior.huella) problemas.push(`Registro ${r.indice} (${n}): no engancha con el anterior.`);
    }
    const recalculada = r.tipo_registro === 'anulacion'
      ? await huellaDeAnulacion({
          idEmisorFacturaAnulada: String(r.id_emisor), numSerieFacturaAnulada: n,
          fechaExpedicionFacturaAnulada: fechaAeat(String(r.fecha_expedicion)),
          huellaAnterior: (r.huella_anterior as string | null) ?? '', fechaHoraHusoGenRegistro: String(r.fecha_hora_huso),
        })
      : await huellaDeAlta({
          idEmisorFactura: String(r.id_emisor), numSerieFactura: n,
          fechaExpedicionFactura: fechaAeat(String(r.fecha_expedicion)), tipoFactura: String(r.tipo_factura ?? ''),
          cuotaTotal: Number(r.cuota_total ?? 0), importeTotal: Number(r.importe_total ?? 0),
          huellaAnterior: (r.huella_anterior as string | null) ?? '', fechaHoraHusoGenRegistro: String(r.fecha_hora_huso),
        });
    if (recalculada !== r.huella) problemas.push(`Registro ${r.indice} (${n}): su huella no se corresponde con sus datos (alterado).`);
    anterior = r;
  }

  // 3. Cada factura emitida, con su registro de alta y la misma huella.
  const altas = new Map(registros.filter(r => r.tipo_registro === 'alta').map(r => [String(r.invoice_id), r]));
  const selladas = (tablas.invoices ?? []).filter(f => f.sealed_at && SELLABLE(f));
  for (const f of selladas) {
    const alta = altas.get(String(f.id));
    if (!alta) { problemas.push(`La factura ${f.number} está emitida y en la copia no está su registro Veri*Factu.`); continue; }
    if (f.verifactu_hash && f.verifactu_hash !== alta.huella) problemas.push(`La factura ${f.number}: su huella no coincide con la de su registro.`);
  }

  const filas = TABLAS.reduce((s, t) => s + (tablas[t.nombre]?.length ?? 0), 0);
  return {
    ok: problemas.length === 0,
    problemas,
    resumen: { tablas: TABLAS.length, filas, registrosVerifactu: registros.length, facturasSelladas: selladas.length },
  };
}
