import 'server-only';

import { supabaseServicio } from '@/lib/supabase/servicio';

/**
 * QUIÉN PRODUCE EL SOFTWARE
 *
 * En un programa que se vende a otros, el productor (el que responde del
 * software ante la AEAT y firma la declaración responsable) es la
 * plataforma, igual para todas las cuentas. Se configura una vez en
 * Administración → Configuración (migración 053) y de ahí sale:
 *
 *  · el bloque SistemaInformatico de cada registro Veri*Factu;
 *  · la página pública de la declaración responsable.
 */
export interface Productor {
  nombre: string | null;
  nif: string | null;
  domicilio: string | null;
  email: string | null;
  sistemaNombre: string;
  sistemaId: string;
  sistemaVersion: string;
  lugar: string | null;
  fecha: string | null;
}

export async function productorDePlataforma(): Promise<Productor | null> {
  try {
    const { data } = await supabaseServicio().from('plataforma_config')
      .select('productor_nombre, productor_nif, productor_domicilio, productor_email, sistema_nombre, sistema_id, sistema_version, declaracion_lugar, declaracion_fecha')
      .single();
    if (!data) return null;
    return {
      nombre: data.productor_nombre, nif: data.productor_nif, domicilio: data.productor_domicilio, email: data.productor_email,
      sistemaNombre: data.sistema_nombre || 'FactuKlima', sistemaId: data.sistema_id || 'FK', sistemaVersion: data.sistema_version || '1.0',
      lugar: data.declaracion_lugar, fecha: data.declaracion_fecha,
    };
  } catch {
    return null; // sin clave de servicio o sin migración: se usa lo de cada cuenta
  }
}
