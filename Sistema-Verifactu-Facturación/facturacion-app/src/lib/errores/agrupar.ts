/** Los errores apuntados, agrupados por huella para la administración. */

export interface FilaError {
  id: number;
  creado_en: string;
  origen: 'navegador' | 'servidor';
  mensaje: string;
  pila: string | null;
  ruta: string | null;
  huella: string;
  user_id: string | null;
  navegador: string | null;
  version: string | null;
  resuelto: boolean;
}

export interface GrupoError {
  huella: string;
  origen: FilaError['origen'];
  mensaje: string;
  ruta: string | null;
  pila: string | null;
  veces: number;
  cuentas: number;
  primera: string;
  ultima: string;
  version: string | null;
  resuelto: boolean;
}

/** Más recientes primero. Un grupo está resuelto si lo está su última aparición. */
export function agruparErrores(filas: FilaError[]): GrupoError[] {
  const grupos = new Map<string, GrupoError & { _cuentas: Set<string> }>();
  for (const f of [...filas].sort((a, b) => b.creado_en.localeCompare(a.creado_en))) {
    const g = grupos.get(f.huella);
    if (!g) {
      grupos.set(f.huella, {
        huella: f.huella, origen: f.origen, mensaje: f.mensaje, ruta: f.ruta, pila: f.pila,
        veces: 1, cuentas: 0, primera: f.creado_en, ultima: f.creado_en, version: f.version, resuelto: f.resuelto,
        _cuentas: new Set(f.user_id ? [f.user_id] : []),
      });
    } else {
      g.veces++;
      g.primera = f.creado_en;
      if (f.user_id) g._cuentas.add(f.user_id);
    }
  }
  return [...grupos.values()].map(({ _cuentas, ...g }) => ({ ...g, cuentas: _cuentas.size }));
}
