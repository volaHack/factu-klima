/**
 * «DESCARGAR TODOS MIS DATOS», DESDE EL SERVIDOR
 *
 * Antes la copia se armaba con lo que hubiera en la caché de ESTE equipo:
 * si estaba a medias (un móvil que nunca había abierto ciertas pantallas,
 * una descarga cortada) la copia salía a medias sin decirlo, y no llevaba
 * los registros Veri*Factu, los cobros ni los eventos. Ahora la copia es la
 * del servidor (/api/copia), entera, con su manifiesto; y los libros CSV se
 * sacan de esa misma copia, así que cuadran con ella.
 */

import { descargar, libroDeClientes, libroDeFacturas, libroDeGastos, libroDeLineas, libroDeProductos, type FicheroExportado } from '@/lib/exportar';
import { mapGastoFromDb, mapInvoiceFromDb } from '@/lib/mapeosDb';
import { mapClientFromDb, mapProductFromDb } from '@/lib/storage';

type Fila = Record<string, unknown>;

export interface ResultadoCopia {
  ficheros: number;
  facturas: number;
  registrosVerifactu: number;
  verificada: boolean;
  problemas: string[];
}

export async function descargarCopiaDelServidor(): Promise<ResultadoCopia> {
  if (!navigator.onLine) throw new Error('La copia se hace con los datos del servidor: hace falta conexión.');
  const r = await fetch('/api/copia', { cache: 'no-store' });
  const texto = await r.text();
  if (!r.ok) {
    let motivo = 'No se ha podido hacer la copia.';
    try { motivo = (JSON.parse(texto) as { error?: string }).error ?? motivo; } catch { /* no era JSON */ }
    throw new Error(motivo);
  }
  const copia = JSON.parse(texto) as {
    generadoEn: string;
    tablas: Record<string, Fila[]>;
    verificacionAlGenerar?: { ok: boolean; problemas: string[] };
  };
  const t = copia.tablas;
  const fecha = copia.generadoEn.slice(0, 10);
  const ajustes = (t.company_settings ?? [])[0] as { business_name?: string; igic_enabled?: boolean } | undefined;
  const impuesto = ajustes?.igic_enabled ? 'IGIC' : 'IVA';
  const empresa = (ajustes?.business_name || 'empresa')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

  const porFactura = (filas: Fila[] = []) => {
    const m = new Map<string, Fila[]>();
    for (const f of filas) m.set(String(f.invoice_id), [...(m.get(String(f.invoice_id)) ?? []), f]);
    return m;
  };
  const lineas = porFactura(t.invoice_line_items);
  const desgloses = porFactura(t.invoice_tax_breakdown);
  const facturas = (t.invoices ?? []).map(f => mapInvoiceFromDb(f, lineas.get(String(f.id)) ?? [], desgloses.get(String(f.id)) ?? []));

  const ficheros: FicheroExportado[] = [
    // La copia tal cual llegó del servidor: es la que lleva el manifiesto.
    { nombre: `${empresa}-${fecha}-copia-completa.json`, contenido: texto, tipo: 'application/json' },
    { nombre: `${empresa}-${fecha}-libro-facturas.csv`, contenido: libroDeFacturas(facturas, impuesto), tipo: 'text/csv' },
    { nombre: `${empresa}-${fecha}-libro-lineas.csv`, contenido: libroDeLineas(facturas, impuesto), tipo: 'text/csv' },
    { nombre: `${empresa}-${fecha}-libro-gastos.csv`, contenido: libroDeGastos((t.gastos ?? []).map(mapGastoFromDb), impuesto), tipo: 'text/csv' },
    { nombre: `${empresa}-${fecha}-catalogo.csv`, contenido: libroDeProductos((t.products ?? []).map(mapProductFromDb), impuesto), tipo: 'text/csv' },
    { nombre: `${empresa}-${fecha}-clientes.csv`, contenido: libroDeClientes((t.clients ?? []).map(mapClientFromDb)), tipo: 'text/csv' },
  ];
  for (const f of ficheros) {
    descargar(f);
    await new Promise(listo => setTimeout(listo, 350));
  }
  return {
    ficheros: ficheros.length,
    facturas: facturas.filter(f => f.status !== 'borrador').length,
    registrosVerifactu: (t.verifactu_registros ?? []).length,
    verificada: copia.verificacionAlGenerar?.ok ?? false,
    problemas: copia.verificacionAlGenerar?.problemas ?? [],
  };
}
