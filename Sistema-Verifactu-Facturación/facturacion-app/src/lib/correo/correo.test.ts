import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verificarFirmaWebhook } from './webhook';
import { correoBase, escaparHtml } from './plantilla';
import { correoDeAuth, enlaceDeConfirmacion } from './auth';

const SECRETO = 'v1,whsec_' + Buffer.from('secreto-de-prueba-123').toString('base64');
function firmar(id: string, ts: string, cuerpo: string, secreto = SECRETO) {
  const clave = Buffer.from(secreto.replace(/^v1,whsec_/, ''), 'base64');
  return 'v1,' + crypto.createHmac('sha256', clave).update(`${id}.${ts}.${cuerpo}`).digest('base64');
}

describe('verificarFirmaWebhook (Standard Webhooks)', () => {
  const ahora = 1_800_000_000;
  const ts = String(ahora);
  const cuerpo = '{"user":{"email":"a@b.es"}}';

  it('acepta una firma buena', () => {
    expect(verificarFirmaWebhook({ secreto: SECRETO, id: 'msg_1', timestamp: ts, firma: firmar('msg_1', ts, cuerpo), cuerpo, ahora })).toBe(true);
  });

  it('acepta si una de varias firmas es buena (rotación de secretos)', () => {
    const firma = `v1,AAAA ${firmar('msg_1', ts, cuerpo)}`;
    expect(verificarFirmaWebhook({ secreto: SECRETO, id: 'msg_1', timestamp: ts, firma, cuerpo, ahora })).toBe(true);
  });

  it('rechaza un cuerpo cambiado, otro secreto o un id cambiado', () => {
    const f = firmar('msg_1', ts, cuerpo);
    expect(verificarFirmaWebhook({ secreto: SECRETO, id: 'msg_1', timestamp: ts, firma: f, cuerpo: cuerpo + ' ', ahora })).toBe(false);
    expect(verificarFirmaWebhook({ secreto: 'v1,whsec_' + Buffer.from('otro').toString('base64'), id: 'msg_1', timestamp: ts, firma: f, cuerpo, ahora })).toBe(false);
    expect(verificarFirmaWebhook({ secreto: SECRETO, id: 'msg_2', timestamp: ts, firma: f, cuerpo, ahora })).toBe(false);
  });

  it('rechaza una petición vieja (más de 5 minutos) o del futuro', () => {
    const viejo = String(ahora - 301);
    expect(verificarFirmaWebhook({ secreto: SECRETO, id: 'm', timestamp: viejo, firma: firmar('m', viejo, cuerpo), cuerpo, ahora })).toBe(false);
    const futuro = String(ahora + 301);
    expect(verificarFirmaWebhook({ secreto: SECRETO, id: 'm', timestamp: futuro, firma: firmar('m', futuro, cuerpo), cuerpo, ahora })).toBe(false);
  });

  it('sin secreto o sin cabeceras, nunca', () => {
    expect(verificarFirmaWebhook({ secreto: '', id: 'm', timestamp: ts, firma: firmar('m', ts, cuerpo), cuerpo, ahora })).toBe(false);
    expect(verificarFirmaWebhook({ secreto: SECRETO, id: null, timestamp: ts, firma: 'v1,x', cuerpo, ahora })).toBe(false);
  });
});

describe('plantilla', () => {
  it('escapa lo que viene de fuera', () => {
    expect(escaparHtml('<b>"Pepe" & cía</b>')).toBe('&lt;b&gt;&quot;Pepe&quot; &amp; cía&lt;/b&gt;');
    const { html } = correoBase({ titulo: 'Hola <script>', parrafos: ['a & b'] });
    expect(html).not.toContain('<script>');
    expect(html).toContain('Hola &lt;script&gt;');
  });

  it('lleva versión en texto plano con el enlace del botón', () => {
    const { texto } = correoBase({ titulo: 'T', parrafos: ['Uno'], boton: { texto: 'Entrar', url: 'https://klimafacturas.com/x' } });
    expect(texto).toContain('Entrar: https://klimafacturas.com/x');
  });
});

describe('correos de la cuenta', () => {
  const base = 'https://klimafacturas.com';

  it('el enlace va a /auth/confirm de la app con el token y adónde volver', () => {
    const url = new URL(enlaceDeConfirmacion(base, 'abc123', 'recovery', '/restablecer-contrasena'));
    expect(url.origin + url.pathname).toBe('https://klimafacturas.com/auth/confirm');
    expect(url.searchParams.get('token_hash')).toBe('abc123');
    expect(url.searchParams.get('type')).toBe('recovery');
    expect(url.searchParams.get('next')).toBe('/restablecer-contrasena');
  });

  it('confirmar el registro: asunto, saludo con nombre y botón', () => {
    const c = correoDeAuth({ tipo: 'signup', enlace: `${base}/auth/confirm?x=1`, nombre: 'Lucía', correo: 'lucia@ej.es' });
    expect(c.asunto).toBe('Confirma tu cuenta de KlimaFacturas');
    expect(c.html).toContain('Hola, Lucía');
    expect(c.html).toContain('Confirmar mi cuenta');
    expect(c.html).toContain(`${base}/auth/confirm?x=1`);
  });

  it('recuperar la contraseña: dice qué hacer si no lo ha pedido', () => {
    const c = correoDeAuth({ tipo: 'recovery', enlace: `${base}/r`, correo: 'a@b.es' });
    expect(c.asunto).toBe('Restablece tu contraseña de KlimaFacturas');
    expect(c.texto).toMatch(/no has sido tú/i);
    expect(c.html).toContain('Elegir una contraseña nueva');
  });

  it('sin nombre, saludo neutro', () => {
    expect(correoDeAuth({ tipo: 'recovery', enlace: 'x', correo: 'a@b.es' }).html).toContain('Hola,');
  });

  it('el código de un solo uso se enseña cuando no hay enlace', () => {
    const c = correoDeAuth({ tipo: 'reauthentication', codigo: '123456', correo: 'a@b.es' });
    expect(c.html).toContain('123456');
    expect(c.asunto).toMatch(/código/i);
  });
});
