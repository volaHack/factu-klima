import { describe, it, expect } from 'vitest';

import { ATAJOS_EDITOR, accionDeAtajo, accionDelEditor, type EntornoEditor, type TeclaDelEditor } from './atajos';

const LIBRE: EntornoEditor = { escribiendo: false, hayModal: false, enTextoLargo: false, enDesplegable: false };
const EN_CASILLA: EntornoEditor = { ...LIBRE, escribiendo: true };
const EN_OBSERVACIONES: EntornoEditor = { ...LIBRE, escribiendo: true, enTextoLargo: true };
const EN_DESPLEGABLE: EntornoEditor = { ...LIBRE, escribiendo: true, enDesplegable: true };

const tecla = (key: string, extra: Partial<TeclaDelEditor> = {}): TeclaDelEditor => ({ key, ...extra });

describe('los atajos del editor de documentos', () => {
  it('Ctrl o Cmd + Intro emite y + S guarda, también escribiendo', () => {
    for (const entorno of [LIBRE, EN_CASILLA, EN_OBSERVACIONES]) {
      expect(accionDelEditor(tecla('Enter', { ctrlKey: true }), entorno)).toBe('emitir');
      expect(accionDelEditor(tecla('Enter', { metaKey: true }), entorno)).toBe('emitir');
      expect(accionDelEditor(tecla('s', { ctrlKey: true }), entorno)).toBe('guardar');
      expect(accionDelEditor(tecla('S', { metaKey: true }), entorno)).toBe('guardar');
    }
  });

  it('Alt+N añade línea y Alt+flechas cambia de línea', () => {
    expect(accionDelEditor(tecla('n', { altKey: true }), EN_CASILLA)).toBe('nueva-linea');
    expect(accionDelEditor(tecla('N', { altKey: true }), LIBRE)).toBe('nueva-linea');
    expect(accionDelEditor(tecla('ArrowUp', { altKey: true }), EN_CASILLA)).toBe('linea-anterior');
    expect(accionDelEditor(tecla('ArrowDown', { altKey: true }), EN_CASILLA)).toBe('linea-siguiente');
  });

  it('en las observaciones, Alt se queda para el texto', () => {
    expect(accionDelEditor(tecla('n', { altKey: true }), EN_OBSERVACIONES)).toBeNull();
    expect(accionDelEditor(tecla('ArrowUp', { altKey: true }), EN_OBSERVACIONES)).toBeNull();
  });

  it('en un desplegable, Alt+↓ sigue abriéndolo', () => {
    expect(accionDelEditor(tecla('ArrowDown', { altKey: true }), EN_DESPLEGABLE)).toBeNull();
    expect(accionDelEditor(tecla('n', { altKey: true }), EN_DESPLEGABLE)).toBe('nueva-linea');
  });

  it('la tecla muerta de la ñ en el Mac no se come', () => {
    expect(accionDelEditor(tecla('Dead', { altKey: true, code: 'KeyN' }), EN_CASILLA)).toBeNull();
    expect(accionDelEditor(tecla('˜', { altKey: true, code: 'KeyN' }), EN_CASILLA)).toBeNull();
    // Un teclado que da otra cosa con Alt pero no un carácter, sí.
    expect(accionDelEditor(tecla('Unidentified', { altKey: true, code: 'KeyN' }), EN_CASILLA)).toBe('nueva-linea');
  });

  it('la chuleta con ?, salvo escribiendo', () => {
    expect(accionDelEditor(tecla('?', { shiftKey: true }), LIBRE)).toBe('chuleta');
    expect(accionDelEditor(tecla('?', { shiftKey: true }), EN_CASILLA)).toBeNull();
  });

  it('no se dispara con modal delante, componiendo o si otro ya atendió la tecla', () => {
    expect(accionDelEditor(tecla('Enter', { ctrlKey: true }), { ...LIBRE, hayModal: true })).toBeNull();
    expect(accionDelEditor(tecla('n', { altKey: true, isComposing: true }), EN_CASILLA)).toBeNull();
    expect(accionDelEditor(tecla('ArrowDown', { altKey: true }), { ...EN_CASILLA, yaAtendida: true })).toBeNull();
  });

  it('el resto de combinaciones son del navegador', () => {
    for (const t of [
      tecla('k', { ctrlKey: true }), tecla('f', { ctrlKey: true }), tecla('s', { ctrlKey: true, shiftKey: true }),
      tecla('Enter', { ctrlKey: true, altKey: true }), tecla('ArrowLeft', { altKey: true }), tecla('f', { altKey: true }),
      tecla('Enter'), tecla('n'), tecla('ArrowDown'),
    ]) {
      expect(accionDelEditor(t, LIBRE)).toBeNull();
    }
  });

  it('no pisa los atajos de la aplicación', () => {
    // Ctrl+K sigue siendo la búsqueda y la N suelta, la factura nueva.
    expect(accionDeAtajo(tecla('k', { ctrlKey: true }), LIBRE)).toBe('buscar');
    expect(accionDeAtajo(tecla('n', { altKey: true }), LIBRE)).toBeNull();
    expect(accionDelEditor(tecla('n'), LIBRE)).toBeNull();
  });

  it('la chuleta enseña cada atajo una vez', () => {
    const acciones = ATAJOS_EDITOR.map(a => a.accion);
    expect(new Set(acciones).size).toBe(acciones.length);
    expect(acciones).toContain('emitir');
  });
});
