'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { oficioParaSector, plantillaDeOtroOficio } from '@/lib/plantillas/desdeCero';
import { BUSINESS_SECTORS } from '@/lib/constants';
import type { BusinessSector } from '@/lib/types';

/**
 * AVISO: ESTA FACTURA ES DE OTRO GREMIO
 *
 * El caso real que lo motiva: un despacho de abogados con el sector puesto
 * en «Abogacía y Despachos» veía su formulario correctamente titulado
 * «Conceptos de la minuta»… y debajo, en cada línea, dos casillas
 * pidiéndole «CAJ.» y «U/C». No venían del sector —ése ya estaba bien—
 * sino de la PLANTILLA activa, que se había montado con el oficio de un
 * distribuidor. Las columnas de una plantilla salen impresas en el PDF, así
 * que el formulario tiene que seguir pidiéndolas: lo que estaba mal era el
 * diseño, y en ninguna pantalla se decía.
 *
 * No se oculta nada ni se adivina: se dice de qué gremio es la plantilla,
 * cuál sería la suya, y se deja el enlace para cambiarla en un clic.
 */
export default function AvisoPlantillaDeOtroOficio({
  oficioDeLaPlantilla,
  sector,
}: {
  oficioDeLaPlantilla: string | undefined;
  sector: BusinessSector | undefined;
}) {
  const ajena = plantillaDeOtroOficio(oficioDeLaPlantilla, sector);
  if (!ajena) return null;

  const suyo = oficioParaSector(sector);
  const nombreSector = BUSINESS_SECTORS.find(s => s.value === sector)?.label ?? 'tu actividad';

  return (
    <div className="status-panel status-panel--warning" style={{ marginBottom: 'var(--space-5)' }}>
      <span className="status-panel-icon"><AlertTriangle size={18} /></span>
      <div className="status-panel-body">
        <div className="status-panel-title">
          Tu diseño de factura es de otro oficio: {ajena.nombre}
        </div>
        <p className="status-panel-text">
          Por eso las líneas te piden {[ajena.unidad, ...(ajena.columnas ?? []), ...(ajena.columnasFijas ?? []).map(c => c.cabecera)]
            .slice(0, 3)
            .map(t => `«${t}»`)
            .join(', ')} en vez de lo que lleva {nombreSector}. Esas casillas salen impresas en el
          PDF, así que aquí hay que rellenarlas mientras el diseño sea ése.{' '}
          <Link href="/plantillas" style={{ color: 'var(--accent-400)', fontWeight: 600 }}>
            Crea la de {suyo.nombre}
          </Link>{' '}
          y márcala como predeterminada: te sale la primera de la lista.
        </p>
      </div>
    </div>
  );
}
