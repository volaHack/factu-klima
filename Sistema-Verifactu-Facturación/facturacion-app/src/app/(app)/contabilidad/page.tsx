'use client';

import VistaContabilidad from '@/components/contabilidad/VistaContabilidad';
import { cargarContabilidad } from '@/lib/contabilidad/cargar';

export default function ContabilidadPage() {
  return <VistaContabilidad cargar={cargarContabilidad} />;
}
