/**
 * BORRAR CON «DESHACER», COMO EN EL CORREO
 *
 * El «¿Seguro que quieres eliminar…?» de siempre se acaba aceptando sin
 * leer, y no salva a nadie del dedo que se equivoca de fila. Aquí el borrado
 * no se pregunta: la ficha desaparece de la lista al momento, sale un aviso
 * con «Deshacer» y el borrado de verdad espera unos segundos. Si se pulsa
 * «Deshacer», no ha llegado a tocarse nada: ni la copia local ni el
 * servidor, así que no hay nada que reconstruir.
 *
 * Se espera en memoria y no en el servidor a propósito: los artículos
 * arrastran en cascada sus movimientos de stock (migración 074) y una
 * «restauración» después de borrar los perdería. Si la pestaña se cierra
 * en esos segundos, el borrado se lanza al salir; si ni eso llega a
 * completarse, la ficha sigue ahí, que es el fallo bueno.
 *
 * SOLO FICHAS. Las facturas emitidas no se borran nunca (Veri*Factu): se
 * anulan o se rectifican, y nada de esto se usa con ellas.
 */

export const ESPERA_DESHACER_MS = 6000;

interface Pendiente {
  temporizador: ReturnType<typeof setTimeout>;
  ejecutar: () => Promise<void>;
}

const pendientes = new Map<string, Pendiente>();
let escuchandoSalida = false;

export interface BorradoProgramado {
  /** Lo cancela si aún no se ha hecho. Devuelve si llegó a tiempo. */
  deshacer: () => boolean;
}

export interface OpcionesBorrado {
  espera?: number;
  /** Si el borrado de verdad falla (sin permisos, error del servidor…). */
  alFallar?: (error: unknown) => void;
  /** Cuando ya se ha hecho. */
  alTerminar?: () => void;
}

function escucharSalida(): void {
  if (escuchandoSalida || typeof window === 'undefined') return;
  escuchandoSalida = true;
  window.addEventListener('pagehide', () => { void ejecutarPendientes(); });
}

/**
 * Deja un borrado para dentro de unos segundos. Programar otra vez la misma
 * clave sustituye al anterior (no se borra dos veces).
 */
export function programarBorrado(clave: string, borrar: () => Promise<void>, opciones: OpcionesBorrado = {}): BorradoProgramado {
  const { espera = ESPERA_DESHACER_MS, alFallar, alTerminar } = opciones;
  escucharSalida();
  const previo = pendientes.get(clave);
  if (previo) clearTimeout(previo.temporizador);

  const ejecutar = async () => {
    pendientes.delete(clave);
    try {
      await borrar();
      alTerminar?.();
    } catch (e) {
      alFallar?.(e);
    }
  };
  pendientes.set(clave, { temporizador: setTimeout(() => { void ejecutar(); }, espera), ejecutar });

  return {
    deshacer: () => {
      const p = pendientes.get(clave);
      if (!p || p.ejecutar !== ejecutar) return false;
      clearTimeout(p.temporizador);
      pendientes.delete(clave);
      return true;
    },
  };
}

export function borradoPendiente(clave: string): boolean {
  return pendientes.has(clave);
}

/** Las claves que están esperando, para no volver a pintarlas en la lista. */
export function clavesPendientes(): string[] {
  return [...pendientes.keys()];
}

/** Hace ya todo lo que estaba esperando (al cerrar la pestaña). */
export async function ejecutarPendientes(): Promise<void> {
  const todos = [...pendientes.values()];
  for (const p of todos) clearTimeout(p.temporizador);
  await Promise.all(todos.map(p => p.ejecutar()));
}
