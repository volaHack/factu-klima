import { describe, it, expect, beforeEach } from 'vitest';
import { aplicarAcento, acentoActual, CLAVE_ACENTO, esAcento, GUION_ACENTO } from './acento';

/** Un <body> y un localStorage mínimos: lo justo que usa el módulo. */
function montarNavegador() {
  const clases = new Set<string>();
  const body = {
    classList: {
      add: (c: string) => { clases.add(c); },
      remove: (c: string) => { clases.delete(c); },
      contains: (c: string) => clases.has(c),
    },
    get className() { return [...clases].join(' '); },
    set className(v: string) { clases.clear(); v.split(/\s+/).filter(Boolean).forEach(c => clases.add(c)); },
  };
  const datos = new Map<string, string>();
  Object.assign(globalThis, {
    document: { body },
    localStorage: {
      getItem: (k: string) => datos.get(k) ?? null,
      setItem: (k: string, v: string) => { datos.set(k, v); },
      clear: () => datos.clear(),
    },
  });
}

describe('acento', () => {
  beforeEach(() => {
    montarNavegador();
    document.body.className = 'otra-clase';
  });

  it('aplica el acento sin borrar las demás clases del body y lo recuerda', () => {
    aplicarAcento('terracotta');
    expect(document.body.classList.contains('theme-terracotta')).toBe(true);
    expect(document.body.classList.contains('otra-clase')).toBe(true);
    expect(localStorage.getItem(CLAVE_ACENTO)).toBe('terracotta');
    expect(acentoActual()).toBe('terracotta');
  });

  it('al cambiar de acento, quita el anterior', () => {
    aplicarAcento('wine');
    aplicarAcento('plum');
    expect(document.body.className).not.toContain('theme-wine');
    expect(acentoActual()).toBe('plum');
  });

  it('un valor desconocido cae en el rosa de por defecto', () => {
    aplicarAcento('zafiro');
    expect(acentoActual()).toBe('rose');
    expect(esAcento('zafiro')).toBe(false);
  });

  it('el guion previo al pintado aplica el acento recordado', () => {
    localStorage.setItem(CLAVE_ACENTO, 'wine');
    new Function(GUION_ACENTO)();
    expect(acentoActual()).toBe('wine');
  });

  it('el guion ignora lo que no sea un acento válido', () => {
    localStorage.setItem(CLAVE_ACENTO, '"><script>');
    new Function(GUION_ACENTO)();
    expect(document.body.className).toBe('otra-clase');
  });
});
