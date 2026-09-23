/**
 * GRABAR LA NOTA DE VOZ
 *
 * El dictado del navegador enseña el texto mientras se habla, pero en
 * muchos navegadores no existe o falla (ver `lib/ia/voz.ts`). Por eso,
 * a la vez que se dicta, se graba el audio: si el dictado no ha dado
 * nada, el audio va al servidor y se transcribe allí. Quien habla no
 * tiene que saber cuál de los dos ha funcionado.
 *
 * Se entrega en WAV mono a 16 kHz: es lo que entienden todos los modelos
 * con oído, y a esa frecuencia la voz se oye entera con un tercio de
 * bytes que a 48 kHz. Un minuto son ~1,9 MB.
 */

export const FRECUENCIA_WAV = 16_000;
/** Más de esto no es una pregunta, es un dictado de carta. Se para solo. */
export const DURACION_MAXIMA_MS = 90_000;

export function grabacionDisponible(): boolean {
  return typeof window !== 'undefined'
    && typeof window.MediaRecorder !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia;
}

/** PCM de 16 bits con su cabecera WAV. Puro: se prueba sin navegador. */
export function codificarWav(muestras: Float32Array, frecuencia: number): Uint8Array {
  const bytes = new Uint8Array(44 + muestras.length * 2);
  const v = new DataView(bytes.buffer);
  const texto = (pos: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(pos + i, s.charCodeAt(i)); };

  texto(0, 'RIFF');
  v.setUint32(4, 36 + muestras.length * 2, true);
  texto(8, 'WAVE');
  texto(12, 'fmt ');
  v.setUint32(16, 16, true);          // tamaño del bloque fmt
  v.setUint16(20, 1, true);           // PCM
  v.setUint16(22, 1, true);           // mono
  v.setUint32(24, frecuencia, true);
  v.setUint32(28, frecuencia * 2, true); // bytes por segundo
  v.setUint16(32, 2, true);           // bytes por muestra
  v.setUint16(34, 16, true);          // bits por muestra
  texto(36, 'data');
  v.setUint32(40, muestras.length * 2, true);

  for (let i = 0; i < muestras.length; i++) {
    const m = Math.max(-1, Math.min(1, muestras[i]));
    v.setInt16(44 + i * 2, m < 0 ? m * 0x8000 : m * 0x7fff, true);
  }
  return bytes;
}

export function bytesABase64(bytes: Uint8Array): string {
  let binario = '';
  const trozo = 0x8000;
  for (let i = 0; i < bytes.length; i += trozo) {
    binario += String.fromCharCode(...bytes.subarray(i, i + trozo));
  }
  return btoa(binario);
}

/** Lo grabado (webm, ogg o mp4 según el navegador) → WAV mono 16 kHz. */
export async function audioAWav(grabado: Blob): Promise<Uint8Array> {
  const datos = await grabado.arrayBuffer();
  const Contexto = window.AudioContext
    ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Contexto();
  let original: AudioBuffer;
  try {
    original = await ctx.decodeAudioData(datos);
  } finally {
    void ctx.close();
  }
  const largo = Math.max(1, Math.ceil(original.duration * FRECUENCIA_WAV));
  const offline = new OfflineAudioContext(1, largo, FRECUENCIA_WAV);
  const fuente = offline.createBufferSource();
  fuente.buffer = original;
  fuente.connect(offline.destination);
  fuente.start();
  const remuestreado = await offline.startRendering();
  return codificarWav(remuestreado.getChannelData(0), FRECUENCIA_WAV);
}

export interface Grabacion {
  /** Para y entrega lo grabado; `null` si no hubo nada. */
  parar(): Promise<Blob | null>;
  /** Para y lo tira. */
  cancelar(): void;
}

export interface OpcionesGrabacion {
  /** Volumen de 0 a 1, unas 30 veces por segundo, para dibujar la onda. */
  alNivel?(nivel: number): void;
  /** Se ha llegado a la duración máxima: quien grabe decide qué hacer. */
  alLlegarAlMaximo?(): void;
}

/**
 * Pide el micrófono y empieza a grabar. Lanza si no hay permiso o no hay
 * micrófono; el error trae `name` (NotAllowedError, NotFoundError…).
 */
export async function empezarGrabacion(opciones: OpcionesGrabacion = {}): Promise<Grabacion> {
  const flujo = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });

  const grabadora = new MediaRecorder(flujo);
  const trozos: Blob[] = [];
  grabadora.ondataavailable = (e) => { if (e.data.size > 0) trozos.push(e.data); };
  grabadora.start(250);

  // Nivel para la onda: un analizador sobre el mismo flujo.
  let ctx: AudioContext | null = null;
  let cuadro = 0;
  if (opciones.alNivel) {
    try {
      ctx = new AudioContext();
      const analizador = ctx.createAnalyser();
      analizador.fftSize = 512;
      ctx.createMediaStreamSource(flujo).connect(analizador);
      const buffer = new Uint8Array(analizador.fftSize);
      const medir = () => {
        analizador.getByteTimeDomainData(buffer);
        let suma = 0;
        for (const b of buffer) { const x = (b - 128) / 128; suma += x * x; }
        // La voz normal da un RMS de 0,02-0,2: se estira para que se vea.
        opciones.alNivel?.(Math.min(1, Math.sqrt(suma / buffer.length) * 4));
        cuadro = requestAnimationFrame(medir);
      };
      medir();
    } catch { /* sin onda no pasa nada */ }
  }

  const tope = setTimeout(() => opciones.alLlegarAlMaximo?.(), DURACION_MAXIMA_MS);

  const soltar = () => {
    clearTimeout(tope);
    cancelAnimationFrame(cuadro);
    flujo.getTracks().forEach(t => t.stop());
    void ctx?.close().catch(() => {});
  };

  return {
    parar: () => new Promise<Blob | null>((resolver) => {
      if (grabadora.state === 'inactive') { soltar(); resolver(null); return; }
      grabadora.onstop = () => {
        soltar();
        resolver(trozos.length ? new Blob(trozos, { type: grabadora.mimeType || 'audio/webm' }) : null);
      };
      grabadora.stop();
    }),
    cancelar: () => {
      grabadora.onstop = null;
      if (grabadora.state !== 'inactive') grabadora.stop();
      soltar();
    },
  };
}

/** El aviso que toca según por qué no se ha podido abrir el micrófono. */
export function motivoDeFalloDeGrabacion(err: unknown): string {
  const nombre = (err as { name?: string })?.name ?? '';
  if (nombre === 'NotAllowedError' || nombre === 'SecurityError') {
    return 'No has dado permiso para usar el micrófono. Actívalo en el candado de la barra de direcciones y vuelve a probar.';
  }
  if (nombre === 'NotFoundError' || nombre === 'OverconstrainedError') {
    return 'No se encuentra ningún micrófono conectado.';
  }
  if (nombre === 'NotReadableError') {
    return 'Otro programa está usando el micrófono. Ciérralo y vuelve a probar.';
  }
  return 'No se ha podido usar el micrófono. Escribe la pregunta.';
}
