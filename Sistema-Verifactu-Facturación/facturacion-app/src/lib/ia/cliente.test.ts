import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  configuracionIA,
  extraerTexto,
  FalloIA,
  IA_LOCAL_POR_DEFECTO,
  limpiarRespuesta,
  MODELO_POR_DEFECTO,
  respuestaDeFallo,
} from './cliente';

const VARIABLES = ['IA_BASE_URL', 'IA_MODELO', 'IA_API_KEY', 'GEMINI_API_KEY', 'GEMINI_MODELO'];

let original: Record<string, string | undefined>;

beforeEach(() => {
  original = Object.fromEntries(VARIABLES.map(v => [v, process.env[v]]));
  for (const v of VARIABLES) delete process.env[v];
});

afterEach(() => {
  for (const v of VARIABLES) {
    if (original[v] === undefined) delete process.env[v];
    else process.env[v] = original[v];
  }
});

describe('qué modelo se usa según lo que haya configurado', () => {
  it('sin nada puesto, no hay IA y se dice', () => {
    // Callar y contestar cualquier cosa sería peor: quien pregunta se lo
    // creería.
    expect(configuracionIA()).toBeNull();
  });

  it('con sólo el modelo, apunta al servidor local de esta máquina', () => {
    process.env.IA_MODELO = 'qwen3-4b-instruct';
    expect(configuracionIA()).toEqual({
      proveedor: 'local',
      baseUrl: IA_LOCAL_POR_DEFECTO,
      modelo: 'qwen3-4b-instruct',
      clave: undefined,
    });
  });

  it('con sólo la dirección, usa el modelo por defecto', () => {
    process.env.IA_BASE_URL = 'http://127.0.0.1:9999/v1';
    const config = configuracionIA();
    expect(config?.modelo).toBe(MODELO_POR_DEFECTO);
    expect(config?.baseUrl).toBe('http://127.0.0.1:9999/v1');
  });

  it('quita la barra final de la dirección', () => {
    // Con ella saldría .../v1//chat/completions, que algunos servidores
    // aceptan y otros contestan con un 404 desconcertante.
    process.env.IA_BASE_URL = 'https://api.ejemplo.com/v1/';
    expect(configuracionIA()?.baseUrl).toBe('https://api.ejemplo.com/v1');
  });

  it('lleva la clave si el servidor la pide', () => {
    process.env.IA_BASE_URL = 'https://api.ejemplo.com/v1';
    process.env.IA_API_KEY = 'sk-lo-que-sea';
    expect(configuracionIA()?.clave).toBe('sk-lo-que-sea');
  });

  it('el servidor local manda sobre Gemini', () => {
    // Si alguien se ha molestado en levantar un modelo local, es el que
    // quiere usar, aunque la clave de Gemini siga por ahí de antes.
    process.env.IA_MODELO = 'qwen3-4b-instruct';
    process.env.GEMINI_API_KEY = 'una-clave';
    expect(configuracionIA()?.proveedor).toBe('local');
  });

  it('sin local, sigue valiendo la clave de Gemini como antes', () => {
    process.env.GEMINI_API_KEY = 'una-clave';
    const config = configuracionIA();
    expect(config?.proveedor).toBe('gemini');
    expect(config?.modelo).toBe('gemini-3.6-flash');
  });

  it('una variable en blanco es como no ponerla', () => {
    // Una variable vacía en el panel de Vercel es lo más fácil de dejarse,
    // y apuntaría a un servidor inexistente en vez de caer en Gemini.
    process.env.IA_BASE_URL = '   ';
    process.env.IA_MODELO = '';
    process.env.GEMINI_API_KEY = 'una-clave';
    expect(configuracionIA()?.proveedor).toBe('gemini');
  });
});

describe('limpiar lo que añaden los modelos pequeños', () => {
  it('tira el razonamiento en voz alta', () => {
    expect(limpiarRespuesta('<think>a ver, el cliente...</think>Pulsa F2.')).toBe('Pulsa F2.');
  });

  it('tira también un razonamiento sin cerrar', () => {
    // Pasa cuando se acaba el cupo pensando: lo que hay detrás no es una
    // respuesta, es un discurso a medias.
    expect(limpiarRespuesta('Respuesta.<think>y ademas podria')).toBe('Respuesta.');
  });

  it('desenvuelve el JSON del bloque de código', () => {
    expect(limpiarRespuesta('```json\n{"sugerencias":[]}\n```')).toBe('{"sugerencias":[]}');
    expect(limpiarRespuesta('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('deja en paz una respuesta limpia', () => {
    expect(limpiarRespuesta('  Pulsa F3 para aparcar la venta.  ')).toBe(
      'Pulsa F3 para aparcar la venta.',
    );
  });
});

describe('de dónde se saca el texto de cada proveedor', () => {
  it('del formato de OpenAI, que es el que hablan los locales', () => {
    const datos = { choices: [{ message: { role: 'assistant', content: 'Hola' } }] };
    expect(extraerTexto(datos, 'local')).toBe('Hola');
  });

  it('del formato de Gemini, juntando sus trozos', () => {
    const datos = { candidates: [{ content: { parts: [{ text: 'Ho' }, { text: 'la' }] } }] };
    expect(extraerTexto(datos, 'gemini')).toBe('Hola');
  });

  it('si sólo hay razonamiento y no respuesta, devuelve vacío', () => {
    // Algunos servidores dejan `content` vacío y ponen el discurso aparte.
    // Entregar el razonamiento como si fuera la respuesta sería mentir.
    const datos = { choices: [{ message: { reasoning_content: 'pensando...', content: null } }] };
    expect(extraerTexto(datos, 'local')).toBe('');
  });

  it('una respuesta con forma rara no revienta', () => {
    expect(extraerTexto({}, 'local')).toBe('');
    expect(extraerTexto({}, 'gemini')).toBe('');
    expect(extraerTexto(null, 'local')).toBe('');
  });
});

describe('qué se le contesta al usuario cuando falla', () => {
  it('sin configurar es un 501, no un error del servicio', () => {
    // Son cosas distintas: una la arregla quien administra poniendo una
    // variable; la otra es que el modelo no responde ahora mismo.
    const r = respuestaDeFallo(new FalloIA('sin-configurar'), 'da igual');
    expect(r.estado).toBe(501);
    expect(r.error).toMatch(/no está configurada/i);
  });

  it('no poder contactar es un 502 y dice que el resto sigue funcionando', () => {
    const r = respuestaDeFallo(new FalloIA('sin-contacto'), 'El TPV sigue funcionando igual.');
    expect(r.estado).toBe(502);
    expect(r.error).toContain('El TPV sigue funcionando igual.');
  });

  it('el detalle interno nunca viaja al usuario', () => {
    // El detalle puede llevar trozos de la petición del cliente.
    const fallo = new FalloIA('rechazado', '401 {"error":"clave sk-secreta invalida"}');
    expect(respuestaDeFallo(fallo, '').error).not.toContain('sk-secreta');
  });
});
