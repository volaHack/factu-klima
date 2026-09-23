/**
 * LAS CONVERSACIONES SON DE UNA CUENTA, NO DEL NAVEGADOR
 *
 * Se guardaban en `localStorage` bajo una única clave,
 * «asistencia-sesiones». El navegador es el mismo aunque cambie quien
 * entra, así que si en un ordenador compartido salía una cuenta y
 * entraba otra, la segunda abría la Asistencia y se encontraba las
 * conversaciones de la primera: con sus clientes, sus importes y sus
 * números de factura escritos en las respuestas.
 *
 * Ahora cada cuenta tiene su clave, con su identificador dentro. Una
 * cuenta no puede leer la de otra porque ni siquiera la busca. La clave
 * vieja, compartida, se borra al primer arranque sin leerla: no hay forma
 * de saber de quién era, y enseñársela a quien no es su dueño es
 * justamente lo que se quiere evitar.
 */

export interface MensajeGuardado {
  id: string;
  deQuien: 'persona' | 'asistente';
  texto: string;
  hora: number;
  /** Si la pregunta se hizo hablando. */
  porVoz?: boolean;
  /** La respuesta es un aviso de que algo ha fallado, no una respuesta. */
  error?: boolean;
}

export interface SesionGuardada {
  id: string;
  titulo: string;
  mensajes: MensajeGuardado[];
  creadaEn: number;
  ultimoMensaje: number;
}

export const CLAVE_LEGADO = 'asistencia-sesiones';
export const MAX_SESIONES = 30;
export const MAX_MENSAJES_POR_SESION = 200;

export function claveDeMemoria(usuarioId: string): string {
  return `${CLAVE_LEGADO}:${usuarioId}`;
}

type Almacen = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function esSesion(x: unknown): x is SesionGuardada {
  const s = x as SesionGuardada;
  return !!s && typeof s.id === 'string' && typeof s.titulo === 'string' && Array.isArray(s.mensajes);
}

export function cargarSesiones(usuarioId: string | null, almacen: Almacen): SesionGuardada[] {
  // Sin cuenta no hay conversaciones: ni las de nadie, ni las compartidas.
  if (!usuarioId) return [];
  try {
    almacen.removeItem(CLAVE_LEGADO);
    const guardado = almacen.getItem(claveDeMemoria(usuarioId));
    const datos: unknown = guardado ? JSON.parse(guardado) : [];
    return Array.isArray(datos) ? datos.filter(esSesion) : [];
  } catch {
    return [];
  }
}

export function guardarSesiones(usuarioId: string | null, sesiones: SesionGuardada[], almacen: Almacen): void {
  if (!usuarioId) return;
  const recortadas = [...sesiones]
    .sort((a, b) => b.ultimoMensaje - a.ultimoMensaje)
    .slice(0, MAX_SESIONES)
    .map(s => ({ ...s, mensajes: s.mensajes.slice(-MAX_MENSAJES_POR_SESION) }));
  try {
    almacen.setItem(claveDeMemoria(usuarioId), JSON.stringify(recortadas));
  } catch {
    /* sin sitio: se pierde el historial, no la conversación en curso */
  }
}

export function tituloCorto(texto: string): string {
  const limpio = texto.replace(/[¿?¡!]/g, '').replace(/\s+/g, ' ').trim();
  const conMayuscula = limpio.charAt(0).toUpperCase() + limpio.slice(1);
  return conMayuscula.length > 42 ? conMayuscula.slice(0, 40).trimEnd() + '…' : conMayuscula;
}
