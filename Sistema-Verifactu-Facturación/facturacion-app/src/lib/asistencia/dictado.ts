/**
 * DICTAR EN VEZ DE ESCRIBIR
 *
 * Quien está detrás de un mostrador o en una furgoneta no va a teclear
 * un párrafo. Habla.
 *
 * SE USA EL DICTADO DEL PROPIO NAVEGADOR, NO SE SUBE EL AUDIO
 * ----------------------------------------------------------
 * Chrome, Edge y Safari traen reconocimiento de voz incorporado. Usarlo
 * tiene tres ventajas sobre grabar y mandar el fichero a un servidor, y
 * las tres pesan:
 *
 *  1. Se ve lo que va entendiendo MIENTRAS se habla, así que el usuario
 *     corrige sobre la marcha en vez de descubrir el error después.
 *  2. Es instantáneo y no cuesta nada: no hay subida ni transcripción
 *     que pagar.
 *  3. El audio no sale del navegador. Lo que viaja al modelo es el texto
 *     ya transcrito, que es lo único que hace falta.
 *
 * Firefox no lo trae, así que `disponible()` lo dice y la pantalla
 * enseña sólo el campo de escribir. Un botón de micrófono que no hace
 * nada es peor que no tenerlo.
 */

/** La API va con prefijo en casi todos los navegadores. */
interface VentanaConDictado extends Window {
  SpeechRecognition?: new () => ReconocedorDeVoz;
  webkitSpeechRecognition?: new () => ReconocedorDeVoz;
}

interface ResultadoDeVoz {
  isFinal: boolean;
  0: { transcript: string };
}

interface ReconocedorDeVoz {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ResultadoDeVoz> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

function constructor(): (new () => ReconocedorDeVoz) | null {
  if (typeof window === 'undefined') return null;
  const w = window as VentanaConDictado;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function dictadoDisponible(): boolean {
  return constructor() !== null;
}

/** Lo que se le dice al usuario cuando el micrófono falla. */
export function motivoDeFalloDeDictado(codigo: string): string {
  switch (codigo) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'No has dado permiso para usar el micrófono. Actívalo en el candado de la barra de direcciones.';
    case 'no-speech':
      return 'No se ha oído nada. Prueba otra vez, más cerca del micrófono.';
    case 'audio-capture':
      return 'No se encuentra ningún micrófono conectado.';
    case 'network':
      return 'El dictado necesita conexión y ahora mismo no la hay. Escribe la pregunta.';
    default:
      return 'No se ha podido usar el micrófono. Escribe la pregunta.';
  }
}

export interface Dictado {
  /** Corta la escucha y devuelve lo dictado hasta ese momento. */
  parar(): void;
}

export interface OpcionesDictado {
  /** Lo que se lleva oído, incluido lo que aún puede cambiar. */
  alOir(texto: string, definitivo: boolean): void;
  alFallar(mensaje: string): void;
  alTerminar(): void;
}

/**
 * Empieza a escuchar. Devuelve `null` si el navegador no sabe dictar.
 *
 * El texto llega entero desde el principio de la frase, no por trozos:
 * el componente lo pinta tal cual y no tiene que ir pegando cachos.
 */
export function empezarDictado(opciones: OpcionesDictado): Dictado | null {
  const Reconocedor = constructor();
  if (!Reconocedor) return null;

  const reconocedor = new Reconocedor();
  reconocedor.lang = 'es-ES';
  // `continuous` para que no se corte en la primera pausa: la gente
  // piensa a mitad de frase.
  reconocedor.continuous = true;
  reconocedor.interimResults = true;

  let confirmado = '';

  reconocedor.onresult = (evento) => {
    let provisional = '';
    for (let i = evento.resultIndex; i < evento.results.length; i++) {
      const resultado = evento.results[i];
      if (resultado.isFinal) confirmado += resultado[0].transcript;
      else provisional += resultado[0].transcript;
    }
    opciones.alOir((confirmado + provisional).trim(), provisional === '');
  };

  reconocedor.onerror = (evento) => {
    // «aborted» es lo que pasa al parar a propósito: no es un fallo.
    if (evento.error !== 'aborted') opciones.alFallar(motivoDeFalloDeDictado(evento.error));
  };

  reconocedor.onend = () => opciones.alTerminar();

  try {
    reconocedor.start();
  } catch {
    // Llamar a start() dos veces seguidas lanza; no es motivo de aviso.
    return { parar: () => reconocedor.abort() };
  }

  return { parar: () => reconocedor.stop() };
}
