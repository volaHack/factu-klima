import { describe, it, expect } from 'vitest';

import { asegurarHuecoQr, CLAVE_QR, esCampoQr } from './huecoQr';
import { campoNuevo } from './editor';
import { QR_MAX_MM, QR_MIN_MM } from '../verifactu/qrFactura';
import type { CampoDetectado } from './tipos';

const A4 = { ancho: 210, alto: 297 };

let siguiente = 0;
const nuevoId = () => `id-${++siguiente}`;

function campoCualquiera(): CampoDetectado {
  const c = campoNuevo(nuevoId(), { x: 20, y: 100, ancho: 40, alto: 6 });
  c.clave = 'cliente_nombre';
  return c;
}

describe('el recuadro del QR aparece y desaparece con el tipo', () => {
  it('una plantilla de factura lo lleva', () => {
    const campos = asegurarHuecoQr([campoCualquiera()], A4, true, nuevoId);
    expect(campos.filter(esCampoQr)).toHaveLength(1);
  });

  it('una de albarán no lo lleva', () => {
    expect(asegurarHuecoQr([campoCualquiera()], A4, false, nuevoId).filter(esCampoQr)).toHaveLength(0);
  });

  it('desmarcar «Facturas» se lo lleva por delante', () => {
    // Si no, quedaría en el editor un hueco que no se imprime nunca.
    const conQr = asegurarHuecoQr([campoCualquiera()], A4, true, nuevoId);
    const sinQr = asegurarHuecoQr(conQr, A4, false, nuevoId);
    expect(sinQr.filter(esCampoQr)).toHaveLength(0);
    expect(sinQr).toHaveLength(1);
  });

  it('no lo duplica si ya estaba', () => {
    const una = asegurarHuecoQr([], A4, true, nuevoId);
    const otra = asegurarHuecoQr(una, A4, true, nuevoId);
    expect(otra.filter(esCampoQr)).toHaveLength(1);
    // Y devuelve la MISMA lista: un cambio de estado que no cambia nada no
    // debe repintar el editor entero.
    expect(otra).toBe(una);
  });

  it('tampoco toca nada cuando no hay que quitarlo', () => {
    const campos = [campoCualquiera()];
    expect(asegurarHuecoQr(campos, A4, false, nuevoId)).toBe(campos);
  });

  it('respeta el recuadro que el usuario ya haya movido', () => {
    // Éste es el punto del asunto: si lo ha arrastrado al pie porque
    // arriba tapaba el membrete, ahí se queda.
    const movido = asegurarHuecoQr([], A4, true, nuevoId);
    const qr = movido.find(esCampoQr)!;
    qr.x = 160;
    qr.y = 240;

    const despues = asegurarHuecoQr(movido, A4, true, nuevoId);
    const sigue = despues.find(esCampoQr)!;
    expect(sigue.x).toBe(160);
    expect(sigue.y).toBe(240);
  });
});

describe('cómo nace el recuadro', () => {
  const campos = asegurarHuecoQr([], A4, true, nuevoId);
  const qr = campos.find(esCampoQr)!;

  it('se llama como lo busca el generador del PDF', () => {
    expect(qr.clave).toBe(CLAVE_QR);
    expect(qr.tipo).toBe('imagen');
  });

  it('nace donde manda la AEAT: arriba y centrado en vertical', () => {
    expect(qr.y).toBeLessThan(A4.alto / 3);
    const centro = qr.x + qr.ancho / 2;
    expect(Math.abs(centro - A4.ancho / 2)).toBeLessThan(1);
  });

  it('nace con un tamaño legal', () => {
    expect(qr.ancho).toBeGreaterThanOrEqual(QR_MIN_MM);
    expect(qr.ancho).toBeLessThanOrEqual(QR_MAX_MM);
    expect(qr.alto).toBe(qr.ancho);
  });

  it('en apaisado nace a la izquierda, como pide la especificación', () => {
    const apaisado = asegurarHuecoQr([], { ancho: 297, alto: 210 }, true, nuevoId);
    const suQr = apaisado.find(esCampoQr)!;
    expect(suQr.x).toBeLessThan(297 / 4);
    expect(suQr.y).toBeLessThan(210 / 3);
  });

  it('dice para qué es y que se puede mover', () => {
    // El motivo se le enseña al usuario en el editor: es donde se entera
    // de que ese recuadro no está clavado.
    expect(qr.motivo).toMatch(/mover/i);
  });
});
