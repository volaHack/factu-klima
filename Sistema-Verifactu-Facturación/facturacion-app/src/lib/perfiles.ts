/**
 * PERFILES DE TRABAJO — LAS PERSONAS QUE USAN LA CUENTA
 *
 * Una cuenta es de un negocio; los perfiles son quienes trabajan en él.
 * No son cuentas nuevas: no tienen email ni contraseña, y la sesión de
 * Supabase sigue siendo la del titular. Son lo que ve y hace cada persona
 * sentada delante del equipo, y lo que queda apuntado a su nombre.
 *
 * TRES ROLES, NO UNA MATRIZ DE PERMISOS
 *
 * Un negocio pequeño no quiere configurar cuarenta casillas: quiere decir
 * «esta es la dueña», «este lleva el día a día» y «esta sólo cobra». Cada
 * rol deja ver unas pantallas y no otras; lo demás, igual para todos.
 *
 * LO QUE ESTO ES Y LO QUE NO
 *
 * El PIN impide que un empleado se ponga el perfil del titular sin
 * saberlo, y el rol esconde lo que no le toca. No es una barrera contra
 * quien tenga la contraseña de la cuenta: con ella se entra a todo, como
 * hasta ahora. Es organización y rastro, no seguridad de acceso.
 */

export type RolPerfil = 'titular' | 'empleado' | 'cajero';

export interface Perfil {
  id: string;
  nombre: string;
  rol: RolPerfil;
  color: string;
  /** SHA-256(sal + pin) en hexadecimal; sin PIN, vacío. */
  pinHash?: string | null;
  pinSal?: string | null;
  activo: boolean;
  creadoEn?: string;
}

export interface InfoRol {
  id: RolPerfil;
  nombre: string;
  /** Qué puede hacer, en una frase: es lo que se lee al elegirlo. */
  explica: string;
}

export const ROLES: InfoRol[] = [
  { id: 'titular', nombre: 'Titular', explica: 'Todo: ajustes, informes, equipo y dinero.' },
  { id: 'empleado', nombre: 'Empleado', explica: 'El día a día: facturas, clientes, productos, almacén y caja. Sin ajustes ni informes.' },
  { id: 'cajero', nombre: 'Cajero', explica: 'Sólo el TPV: cobrar, abrir y cerrar la caja.' },
];

export const nombreRol = (rol: RolPerfil) => ROLES.find(r => r.id === rol)?.nombre ?? rol;

/**
 * Lo que un empleado no ve: la configuración de la empresa, el dinero
 * agregado y lo fiscal. Por prefijo de ruta.
 */
const VEDADO_EMPLEADO = [
  '/ajustes', '/equipo', '/admin', '/importar', '/plantillas', '/gestoria', '/verifactu',
  '/informes', '/contabilidad', '/listados-fiscales', '/tesoreria', '/conciliacion', '/recordatorios', '/comisiones', '/sii',
];

/** Lo único que ve un cajero. */
const PERMITIDO_CAJERO = ['/tpv'];

const coincide = (ruta: string, prefijo: string) => ruta === prefijo || ruta.startsWith(prefijo + '/');

/** ¿Puede este rol abrir esta pantalla? */
export function puedeEntrar(rol: RolPerfil, ruta: string): boolean {
  if (rol === 'titular') return true;
  if (rol === 'cajero') return PERMITIDO_CAJERO.some(p => coincide(ruta, p));
  return !VEDADO_EMPLEADO.some(p => coincide(ruta, p));
}

/** Adónde se va al elegir el perfil. */
export function inicioDe(rol: RolPerfil): string {
  return rol === 'cajero' ? '/tpv' : '/dashboard';
}

// ------------------------------------------------------------
// PIN
// ------------------------------------------------------------

/** Entre 4 y 6 cifras: lo que se teclea de pie en un mostrador. */
export function pinValido(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

/** Una sal nueva: 16 bytes al azar, en hexadecimal. */
export function nuevaSal(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPin(pin: string, sal: string): Promise<string> {
  const datos = new TextEncoder().encode(`${sal}:${pin}`);
  const resumen = await crypto.subtle.digest('SHA-256', datos);
  return Array.from(new Uint8Array(resumen), b => b.toString(16).padStart(2, '0')).join('');
}

export const tienePin = (p: Pick<Perfil, 'pinHash' | 'pinSal'>) => Boolean(p.pinHash && p.pinSal);

export async function comprobarPin(perfil: Pick<Perfil, 'pinHash' | 'pinSal'>, pin: string): Promise<boolean> {
  if (!tienePin(perfil)) return true;
  return (await hashPin(pin, perfil.pinSal!)) === perfil.pinHash;
}

// ------------------------------------------------------------
// Presentación y reglas del equipo
// ------------------------------------------------------------

/**
 * Colores de persona. Identifican a alguien de un vistazo (el avatar, su
 * fila en la actividad), así que son categóricos y fijos: no siguen el
 * acento de la empresa, igual que no cambia el color de una categoría.
 */
export const COLORES_PERFIL = ['#b02a5c', '#3987e5', '#199e70', '#c98500', '#7c3a5c', '#d95926', '#4a5568', '#0e7490'];

export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/** Titulares primero, luego por nombre. */
export function ordenarPerfiles<T extends Pick<Perfil, 'rol' | 'nombre'>>(perfiles: T[]): T[] {
  const peso = { titular: 0, empleado: 1, cajero: 2 } as const;
  return [...perfiles].sort((a, b) => peso[a.rol] - peso[b.rol] || a.nombre.localeCompare(b.nombre, 'es'));
}

/**
 * Qué impide guardar o borrar un perfil, o null si se puede.
 *
 * La regla que importa: siempre queda al menos un titular activo. Sin él,
 * nadie podría volver a entrar en Ajustes para arreglarlo.
 */
export function problemaAlGuardar(perfiles: Perfil[], perfil: Perfil, pinNuevo?: string): string | null {
  if (!perfil.nombre.trim()) return 'Ponle un nombre.';
  if (perfil.nombre.trim().length > 60) return 'El nombre no puede pasar de 60 caracteres.';
  if (pinNuevo !== undefined && pinNuevo !== '' && !pinValido(pinNuevo)) return 'El PIN son de 4 a 6 cifras.';
  const repetido = perfiles.find(p => p.id !== perfil.id && p.nombre.trim().toLowerCase() === perfil.nombre.trim().toLowerCase());
  if (repetido) return `Ya hay un perfil que se llama «${repetido.nombre}».`;
  const restantes = perfiles.filter(p => p.id !== perfil.id).concat(perfil);
  if (!restantes.some(p => p.rol === 'titular' && p.activo)) return 'Tiene que quedar al menos un titular activo.';
  return null;
}

export function problemaAlBorrar(perfiles: Perfil[], id: string): string | null {
  const restantes = perfiles.filter(p => p.id !== id);
  if (restantes.length > 0 && !restantes.some(p => p.rol === 'titular' && p.activo)) {
    return 'Es el único titular: crea otro antes de borrarlo.';
  }
  return null;
}

// ------------------------------------------------------------
// Actividad
// ------------------------------------------------------------

export type AccionPerfil = 'entrada' | 'salida' | 'factura_emitida' | 'caja_abierta' | 'caja_cerrada';

export const TEXTO_ACCION: Record<AccionPerfil, string> = {
  entrada: 'Empezó a trabajar',
  salida: 'Cerró su perfil',
  factura_emitida: 'Emitió',
  caja_abierta: 'Abrió la caja',
  caja_cerrada: 'Cerró la caja',
};

/** «hace 3 min», «hace 2 h», «ayer 18:40», «12 sep 09:15». */
export function haceCuanto(iso: string, ahora: Date = new Date()): string {
  const d = new Date(iso);
  const seg = Math.round((ahora.getTime() - d.getTime()) / 1000);
  if (seg < 45) return 'ahora mismo';
  const min = Math.round(seg / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  const hora = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const mismoDia = d.toDateString() === ahora.toDateString();
  if (mismoDia) return `hace ${h} h`;
  const ayer = new Date(ahora); ayer.setDate(ahora.getDate() - 1);
  if (d.toDateString() === ayer.toDateString()) return `ayer ${hora}`;
  return `${d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} ${hora}`;
}
