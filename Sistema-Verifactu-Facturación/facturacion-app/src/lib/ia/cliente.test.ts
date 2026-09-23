import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  configuracionIA,
  esCuotaAgotada,
  generarTexto,
  mereceOtroIntento,
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

describe('un fallo pasajero del proveedor no gasta el intento del usuario', () => {
  it('sabe qué estados merecen repetir y cuáles no', () => {
    // Saturado o roto por dentro: vale la pena repetir.
    for (const estado of [429, 500, 502, 503, 504]) {
      expect(mereceOtroIntento(estado), `${estado} debería reintentarse`).toBe(true);
    }
    // La petición está mal o la clave no vale: repetirla da el mismo
    // error, dos veces más lento.
    for (const estado of [400, 401, 403, 404, 422, 501]) {
      expect(mereceOtroIntento(estado), `${estado} NO debería reintentarse`).toBe(false);
    }
  });

  it('repite tras un 503 y devuelve la respuesta buena', async () => {
    // Esto pasó de verdad: Gemini contestó «This model is currently
    // experiencing high demand» y al repetir acertó los cinco recuadros.
    process.env.IA_BASE_URL = 'http://servidor.de.prueba/v1';
    const llamadas: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      llamadas.push(String(url));
      if (llamadas.length === 1) {
        return new Response('{"error":"high demand"}', { status: 503 });
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: 'Pulsa F3.' } }] }), { status: 200 });
    }) as typeof fetch;

    try {
      await expect(generarTexto({ instrucciones: 'da igual' })).resolves.toBe('Pulsa F3.');
      expect(llamadas).toHaveLength(2);
    } finally {
      globalThis.fetch = original;
    }
  }, 10_000);

  it('no repite un 401: la clave no se arregla insistiendo', async () => {
    process.env.IA_BASE_URL = 'http://servidor.de.prueba/v1';
    let llamadas = 0;
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      llamadas++;
      return new Response('{"error":"clave invalida"}', { status: 401 });
    }) as typeof fetch;

    try {
      await expect(generarTexto({ instrucciones: 'da igual' })).rejects.toThrow(FalloIA);
      expect(llamadas).toBe(1);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('no repite cuando la conexión se rechaza', async () => {
    // Si no hay nadie al otro lado, no lo va a haber un segundo después,
    // y la espera ya ha sido larga.
    process.env.IA_BASE_URL = 'http://servidor.de.prueba/v1';
    let llamadas = 0;
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      llamadas++;
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;

    try {
      await expect(generarTexto({ instrucciones: 'da igual' })).rejects.toMatchObject({ motivo: 'sin-contacto' });
      expect(llamadas).toBe(1);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('pero SÍ repite cuando se acaba el tiempo', async () => {
    // No es lo mismo. Un servicio alojado que va cargado acepta la
    // conexión y se queda pensando: medido contra Gemini, la misma
    // llamada tardó 4,6 s una vez y 28 s la siguiente. Ahí repetir sirve.
    process.env.IA_BASE_URL = 'http://servidor.de.prueba/v1';
    let llamadas = 0;
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      llamadas++;
      if (llamadas === 1) {
        const err = new Error('The operation was aborted due to timeout');
        err.name = 'TimeoutError';
        throw err;
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: 'Aquí está.' } }] }), { status: 200 });
    }) as typeof fetch;

    try {
      await expect(generarTexto({ instrucciones: 'da igual' })).resolves.toBe('Aquí está.');
      expect(llamadas).toBe(2);
    } finally {
      globalThis.fetch = original;
    }
  }, 15_000);

  it('si se acaba el tiempo en todos los intentos, se rinde y lo dice', async () => {
    process.env.IA_BASE_URL = 'http://servidor.de.prueba/v1';
    let llamadas = 0;
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      llamadas++;
      const err = new Error('timeout');
      err.name = 'TimeoutError';
      throw err;
    }) as typeof fetch;

    try {
      await expect(generarTexto({ instrucciones: 'da igual' })).rejects.toMatchObject({ motivo: 'sin-contacto' });
      expect(llamadas).toBe(3);
    } finally {
      globalThis.fetch = original;
    }
  }, 20_000);
});

describe('quedarse sin cupo no es lo mismo que fallar', () => {
  const CUOTA_DE_GEMINI = JSON.stringify({
    error: {
      code: 429,
      message: 'You exceeded your current quota... Quota exceeded for metric: '
        + 'generate_content_free_tier_requests, limit: 20. Please retry in 28.679062611s.',
      status: 'RESOURCE_EXHAUSTED',
    },
  });

  it('reconoce un cupo agotado por lo que dice el proveedor', () => {
    expect(esCuotaAgotada(CUOTA_DE_GEMINI)).toBe(true);
    expect(esCuotaAgotada('{"error":{"code":"insufficient_quota"}}')).toBe(true);
  });

  it('y también cuando pide esperar más de lo que estamos dispuestos', () => {
    expect(esCuotaAgotada('slow down, please retry in 45s')).toBe(true);
    // Cuatro segundos sí los esperamos: eso es una rafaga, no un cupo.
    expect(esCuotaAgotada('slow down, please retry in 2s')).toBe(false);
  });

  it('una ráfaga cualquiera no se toma por cupo agotado', () => {
    expect(esCuotaAgotada('{"error":"too many requests"}')).toBe(false);
  });

  it('con el cupo agotado NO insiste: gastaría más deprisa lo que queda', async () => {
    // Y el usuario se comería la espera de tres intentos para acabar en
    // el mismo error.
    process.env.IA_BASE_URL = 'http://servidor.de.prueba/v1';
    let llamadas = 0;
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      llamadas++;
      return new Response(CUOTA_DE_GEMINI, { status: 429 });
    }) as typeof fetch;

    try {
      await expect(generarTexto({ instrucciones: 'da igual' })).rejects.toMatchObject({ motivo: 'sin-cuota' });
      expect(llamadas).toBe(1);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('pero un 429 de ráfaga sí se reintenta', async () => {
    process.env.IA_BASE_URL = 'http://servidor.de.prueba/v1';
    let llamadas = 0;
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      llamadas++;
      if (llamadas === 1) return new Response('{"error":"too many requests"}', { status: 429 });
      return new Response(JSON.stringify({ choices: [{ message: { content: 'Ya está.' } }] }), { status: 200 });
    }) as typeof fetch;

    try {
      await expect(generarTexto({ instrucciones: 'da igual' })).resolves.toBe('Ya está.');
      expect(llamadas).toBe(2);
    } finally {
      globalThis.fetch = original;
    }
  }, 15_000);

  it('se le dice al usuario que es el cupo, no una avería', () => {
    // «No se ha podido contactar» invita a volver a pulsar, que es justo
    // lo que no hay que hacer.
    const r = respuestaDeFallo(new FalloIA('sin-cuota'), 'El resto sigue igual.');
    expect(r.estado).toBe(429);
    expect(r.error).toMatch(/cupo/i);
    expect(r.error).toMatch(/dentro de un rato/i);
  });
});

describe('lo que se le pide al modelo', () => {
  it('va siempre con el razonamiento apagado', async () => {
    // Medido con qwen/qwen3.8-27b en OpenRouter: con el razonamiento
    // encendido gastó los 2.000 tokens pensando y devolvió la respuesta
    // vacía, a los 81 s. Apagado, 3,7 s y la respuesta buena. Si alguien
    // quita esta línea, la Asistencia deja de contestar en producción.
    const { cuerpoOpenAI } = await import('./cliente');
    const cuerpo = cuerpoOpenAI(
      { proveedor: 'local', baseUrl: 'https://openrouter.ai/api/v1', modelo: 'qwen/qwen3.8-27b' },
      { instrucciones: 'hola' },
    );
    expect(cuerpo.reasoning).toEqual({ enabled: false });
  });
});
