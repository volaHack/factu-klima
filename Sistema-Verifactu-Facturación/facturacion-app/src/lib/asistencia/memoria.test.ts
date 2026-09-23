import { describe, it, expect } from 'vitest';

import {
  CLAVE_LEGADO, MAX_SESIONES, cargarSesiones, claveDeMemoria, guardarSesiones, tituloCorto,
  type SesionGuardada,
} from './memoria';
import { codificarWav } from './grabacion';
import { deudaPorCliente, type DocumentoDetalleIA } from './contexto';
import { cuerpoTranscripcion, limpiarTranscripcion } from '../ia/voz';

/** Un localStorage de mentira: un Map con la misma cara. */
function almacen() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
  };
}

function sesion(id: string, texto: string, hora = 1): SesionGuardada {
  return {
    id, titulo: texto, creadaEn: hora, ultimoMensaje: hora,
    mensajes: [{ id: id + 'm', deQuien: 'persona', texto, hora }],
  };
}

describe('cada cuenta ve sólo sus conversaciones', () => {
  it('lo que guarda Ana no lo lee Bea en el mismo navegador', () => {
    const a = almacen();
    guardarSesiones('ana', [sesion('1', '¿Cuánto me debe Construcciones Pérez?')], a);
    expect(cargarSesiones('bea', a)).toEqual([]);
    expect(cargarSesiones('ana', a)[0].titulo).toContain('Pérez');
  });

  it('la clave vieja, compartida, se borra sin leerla', () => {
    // No se sabe de quién era: enseñarla sería justo la fuga.
    const a = almacen();
    a.setItem(CLAVE_LEGADO, JSON.stringify([sesion('x', 'datos de otra cuenta')]));
    expect(cargarSesiones('bea', a)).toEqual([]);
    expect(a.m.has(CLAVE_LEGADO)).toBe(false);
  });

  it('sin sesión no se carga ni se guarda nada', () => {
    const a = almacen();
    guardarSesiones(null, [sesion('1', 'hola')], a);
    expect(a.m.size).toBe(0);
    expect(cargarSesiones(null, a)).toEqual([]);
  });

  it('la clave lleva el identificador de la cuenta', () => {
    expect(claveDeMemoria('abc')).toBe(`${CLAVE_LEGADO}:abc`);
  });

  it('se quedan las más recientes cuando hay demasiadas', () => {
    const a = almacen();
    const muchas = Array.from({ length: MAX_SESIONES + 5 }, (_, i) => sesion(String(i), 'p' + i, i));
    guardarSesiones('ana', muchas, a);
    const cargadas = cargarSesiones('ana', a);
    expect(cargadas).toHaveLength(MAX_SESIONES);
    expect(cargadas[0].id).toBe(String(MAX_SESIONES + 4));
  });

  it('un JSON roto no tumba la pantalla', () => {
    const a = almacen();
    a.setItem(claveDeMemoria('ana'), '{roto');
    expect(cargarSesiones('ana', a)).toEqual([]);
  });

  it('el título es corto y empieza en mayúscula', () => {
    expect(tituloCorto('¿cuántos borradores tengo?')).toBe('Cuántos borradores tengo');
    expect(tituloCorto('x'.repeat(80)).length).toBeLessThanOrEqual(41);
  });
});

describe('la nota de voz', () => {
  it('se codifica como un WAV válido de 16 bits', () => {
    const wav = codificarWav(new Float32Array([0, 1, -1, 0.5]), 16_000);
    const v = new DataView(wav.buffer);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe('WAVE');
    expect(v.getUint32(24, true)).toBe(16_000);
    expect(v.getUint32(40, true)).toBe(8);
    expect(v.getInt16(46, true)).toBe(0x7fff);
    expect(v.getInt16(48, true)).toBe(-0x8000);
    expect(wav.length).toBe(44 + 8);
  });

  it('va al modelo como input_audio en WAV', () => {
    const cuerpo = cuerpoTranscripcion({ baseUrl: 'x', modelo: 'google/gemini-3.5-flash-lite', esOpenRouter: true }, 'QUJD');
    const partes = cuerpo.messages[0].content;
    expect(partes[1]).toEqual({ type: 'input_audio', input_audio: { data: 'QUJD', format: 'wav' } });
    expect(cuerpo).toHaveProperty('reasoning');
    expect(cuerpoTranscripcion({ baseUrl: 'x', modelo: 'm', esOpenRouter: false }, 'QUJD')).not.toHaveProperty('reasoning');
    // GPT Audio no razona: el campo no se le manda.
    expect(cuerpoTranscripcion({ baseUrl: 'x', modelo: 'openai/gpt-audio-mini', esOpenRouter: true }, 'QUJD')).not.toHaveProperty('reasoning');
  });

  it('el silencio no se manda como pregunta', () => {
    expect(limpiarTranscripcion('[silencio]')).toBe('');
    expect(limpiarTranscripcion('«¿Cuántas facturas tengo?»')).toBe('¿Cuántas facturas tengo?');
  });
});

describe('quién debe dinero', () => {
  it('suma por cliente las facturas sin cobrar, de más a menos', () => {
    const d = (destinatario: string, estado: string, total: number, tipo = 'Factura'): DocumentoDetalleIA =>
      ({ destinatario, estado, total, tipo, sentido: 'venta' } as DocumentoDetalleIA);
    const deudas = deudaPorCliente([
      d('Pérez', 'Vencida', 100),
      d('Pérez', 'Pendiente de cobro', 50),
      d('López', 'Pendiente de cobro', 400),
      d('López', 'Pagada / Cobrada', 999),
      d('Gómez', 'Borrador', 999),
      d('Ruiz', 'Pendiente de cobro', 999, 'Presupuesto'),
    ]);
    expect(deudas).toEqual([
      { cliente: 'López', importe: 400, facturas: 1, vencidas: 0 },
      { cliente: 'Pérez', importe: 150, facturas: 2, vencidas: 1 },
    ]);
  });
});

describe('transcribir con reserva', () => {
  it('si el primer modelo falla, prueba el siguiente; sin saldo, para', async () => {
    const { transcribir } = await import('../ia/voz');
    const antes = { ...process.env };
    process.env.IA_BASE_URL = 'https://openrouter.ai/api/v1';
    process.env.IA_API_KEY = 'k';
    delete process.env.IA_VOZ_MODELO;
    const pedidos: string[] = [];
    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      const modelo = JSON.parse(String(init.body)).model as string;
      pedidos.push(modelo);
      if (modelo.startsWith('google/')) return new Response('{"error":{"message":"bad audio"}}', { status: 400 });
      return new Response(JSON.stringify({ choices: [{ message: { content: '¿Cuántas facturas tengo?' } }] }), { status: 200 });
    }) as typeof fetch;
    try {
      await expect(transcribir('QUJD')).resolves.toBe('¿Cuántas facturas tengo?');
      expect(pedidos).toEqual(['google/gemini-3.5-flash-lite', 'openai/gpt-audio-mini']);

      pedidos.length = 0;
      globalThis.fetch = (async () => new Response('{"error":{"message":"Insufficient credits"}}', { status: 402 })) as typeof fetch;
      await expect(transcribir('QUJD')).rejects.toMatchObject({ motivo: 'sin-cuota' });
    } finally {
      globalThis.fetch = fetchOriginal;
      process.env = antes;
    }
  });
});
