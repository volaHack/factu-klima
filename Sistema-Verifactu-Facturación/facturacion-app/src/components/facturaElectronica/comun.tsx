'use client';

import { getContenidoFe } from '@/lib/facturaElectronica/almacen';
import { NOMBRE_ESTADO, type EstadoFe } from '@/lib/facturaElectronica/estados';

/** El estado con su color. */
export function EstadoFeBadge({ estado }: { estado: EstadoFe }) {
  return <span className={`badge fe-estado is-${estado}`}>{NOMBRE_ESTADO[estado]}</span>;
}

/** Cómo se llama el canal para quien lo lee. */
export const nombreCanal = (canal: string) =>
  canal === 'simulado' ? 'Modo de pruebas (no sale del programa)' : canal === 'spfe' ? 'Solución pública de la AEAT' : 'Recibida por fichero o correo';

const EXTENSION: Record<string, string> = { ubl: 'xml', cii: 'xml', facturae: 'xml', edifact: 'edi' };

/** Descarga el fichero tal como se guardó (el que cuenta para la ley). */
export async function descargarFicheroFe(id: string): Promise<void> {
  const { contenido, formato, numero } = await getContenidoFe(id);
  // Sólo para descargar, nunca para abrir en el navegador: el contenido
  // puede venir de un proveedor.
  const url = URL.createObjectURL(new Blob([contenido], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(numero || 'factura').replace(/[^A-Za-z0-9_-]+/g, '_')}-${formato}.${EXTENSION[formato] ?? 'xml'}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export const fechaCorta = (f?: string) => (f ? f.slice(0, 10).split('-').reverse().join('/') : '—');
