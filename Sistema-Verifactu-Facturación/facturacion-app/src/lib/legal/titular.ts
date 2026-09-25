import 'server-only';

import { productorDePlataforma } from '@/lib/plataforma/productor';
import { TITULAR } from './datos';

export interface Titular {
  titular: string;
  nif: string;
  domicilio: string;
  email: string;
  registro: string;
  completo: boolean;
}

/**
 * Los datos del titular para las páginas legales. Mandan los que se
 * rellenan en Administración → Configuración (los mismos del productor
 * del software y de la declaración responsable); lo que falte allí sale
 * de `datos.ts`. Así se rellenan en un solo sitio.
 */
export async function titularActual(): Promise<Titular> {
  const p = await productorDePlataforma();
  const t = {
    titular: p?.nombre || TITULAR.titular,
    nif: p?.nif || TITULAR.nif,
    domicilio: p?.domicilio || TITULAR.domicilio,
    email: p?.email || TITULAR.email,
    registro: TITULAR.registro,
  };
  return { ...t, completo: Boolean(t.titular && t.nif && t.domicilio && t.email) };
}
