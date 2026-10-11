import { describe, expect, it } from 'vitest';
import { pantallasMencionadas, separarSiguientes, textoVisible } from './respuesta';
import { trozosSSE } from '../ia/enVivo';

describe('separarSiguientes', () => {
  it('quita la línea de seguimiento y devuelve las preguntas', () => {
    const r = separarSiguientes('Tienes **3** vencidas.\n\nSIGUIENTES: ¿Quién me debe más? | ¿Qué vence esta semana? | ¿Cómo va el mes?');
    expect(r.cuerpo).toBe('Tienes **3** vencidas.');
    expect(r.siguientes).toEqual(['¿Quién me debe más?', '¿Qué vence esta semana?', '¿Cómo va el mes?']);
  });

  it('sin línea de seguimiento, el texto tal cual', () => {
    expect(separarSiguientes('Hola, dime.')).toEqual({ cuerpo: 'Hola, dime.', siguientes: [] });
  });

  it('acepta variaciones del modelo (minúsculas, guiones, comillas) y se queda con 3 como mucho', () => {
    const r = separarSiguientes('Listo.\nSiguientes: - «¿A?» | "¿B?" | ¿C? | ¿D?');
    expect(r.siguientes).toEqual(['¿A?', '¿B?', '¿C?']);
  });

  it('descarta preguntas vacías o kilométricas', () => {
    const larga = '¿' + 'x'.repeat(200) + '?';
    expect(separarSiguientes(`Vale.\nSIGUIENTES: | ${larga} | ¿Y los gastos?`).siguientes).toEqual(['¿Y los gastos?']);
  });
});

describe('textoVisible (mientras se escribe)', () => {
  it('no enseña la línea de seguimiento a medias', () => {
    expect(textoVisible('Tienes 3.\nSIGUI')).toBe('Tienes 3.');
    expect(textoVisible('Tienes 3.\nSIGUIENTES: ¿Quién')).toBe('Tienes 3.');
  });

  it('no enseña un razonamiento <think> ni abierto ni cerrado', () => {
    expect(textoVisible('<think>pienso')).toBe('');
    expect(textoVisible('<think>pienso</think>Hola')).toBe('Hola');
  });

  it('un texto normal sale igual', () => {
    expect(textoVisible('Lo tienes en Facturas')).toBe('Lo tienes en Facturas');
  });
});

describe('pantallasMencionadas', () => {
  it('encuentra las pantallas por su nombre y da su dirección', () => {
    const r = pantallasMencionadas('Lo tienes en Facturas, y los cobros en Recordatorios de cobro.');
    expect(r).toEqual([
      { titulo: 'Facturas', ruta: '/facturas' },
      { titulo: 'Recordatorios de cobro', ruta: '/recordatorios' },
    ]);
  });

  it('el nombre más largo gana: «Facturas recurrentes» no es también «Facturas»', () => {
    expect(pantallasMencionadas('Mira Facturas recurrentes.').map(p => p.titulo)).toEqual(['Facturas recurrentes']);
  });

  it('no enlaza palabras corrientes en minúscula ni pantallas de administración o la propia Asistencia', () => {
    expect(pantallasMencionadas('Tienes tres facturas y un banco.')).toEqual([]);
    expect(pantallasMencionadas('Pregunta en Asistente o en Panel de administración.')).toEqual([]);
  });

  it('como mucho tres, sin repetir', () => {
    const r = pantallasMencionadas('Facturas, Gastos, Banco, Tesorería y otra vez Facturas.');
    expect(r.map(p => p.titulo)).toEqual(['Facturas', 'Gastos', 'Banco']);
  });
});

describe('trozosSSE', () => {
  it('saca el texto de cada evento completo y guarda el resto', () => {
    const r = trozosSSE('data: {"choices":[{"delta":{"content":"Ho"}}]}\n\ndata: {"choices":[{"delta":{"content":"la"}}]}\n\ndata: {"choi');
    expect(r.trozos).toEqual(['Ho', 'la']);
    expect(r.resto).toBe('data: {"choi');
    expect(r.fin).toBe(false);
  });

  it('reconoce el final y aguanta líneas de comentario y \\r\\n', () => {
    const r = trozosSSE(': keep-alive\r\n\r\ndata: {"choices":[{"delta":{"content":"x"}}]}\r\n\r\ndata: [DONE]\r\n\r\n');
    expect(r.trozos).toEqual(['x']);
    expect(r.fin).toBe(true);
  });

  it('ignora eventos sin texto (rol, razonamiento)', () => {
    const r = trozosSSE('data: {"choices":[{"delta":{"role":"assistant"}}]}\n\ndata: {"choices":[{"delta":{"reasoning":"..."}}]}\n\n');
    expect(r.trozos).toEqual([]);
  });
});
