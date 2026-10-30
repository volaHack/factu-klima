import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { programarBorrado, borradoPendiente, clavesPendientes, ejecutarPendientes, ESPERA_DESHACER_MS } from './borradoDiferido';

describe('borrar con deshacer', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('no borra nada hasta que pasa la espera', async () => {
    const borrar = vi.fn(async () => {});
    const alTerminar = vi.fn();
    programarBorrado('producto:1', borrar, { alTerminar });
    expect(borradoPendiente('producto:1')).toBe(true);
    await vi.advanceTimersByTimeAsync(ESPERA_DESHACER_MS - 1);
    expect(borrar).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(borrar).toHaveBeenCalledTimes(1);
    expect(alTerminar).toHaveBeenCalled();
    expect(borradoPendiente('producto:1')).toBe(false);
  });

  it('deshacer a tiempo lo cancela; tarde ya no puede', async () => {
    const borrar = vi.fn(async () => {});
    const b = programarBorrado('cliente:1', borrar);
    expect(b.deshacer()).toBe(true);
    await vi.advanceTimersByTimeAsync(ESPERA_DESHACER_MS * 2);
    expect(borrar).not.toHaveBeenCalled();

    const otro = programarBorrado('cliente:2', borrar, { espera: 10 });
    await vi.advanceTimersByTimeAsync(10);
    expect(otro.deshacer()).toBe(false);
    expect(borrar).toHaveBeenCalledTimes(1);
  });

  it('volver a programar la misma ficha no la borra dos veces', async () => {
    const borrar = vi.fn(async () => {});
    const primero = programarBorrado('producto:9', borrar);
    programarBorrado('producto:9', borrar);
    expect(primero.deshacer()).toBe(false);
    await vi.advanceTimersByTimeAsync(ESPERA_DESHACER_MS);
    expect(borrar).toHaveBeenCalledTimes(1);
  });

  it('si el borrado falla, se avisa', async () => {
    const alFallar = vi.fn();
    programarBorrado('producto:3', async () => { throw new Error('sin permiso'); }, { alFallar, espera: 5 });
    await vi.advanceTimersByTimeAsync(5);
    expect(alFallar).toHaveBeenCalledWith(expect.any(Error));
  });

  it('al salir se hace todo lo pendiente de una vez', async () => {
    const borrar = vi.fn(async () => {});
    programarBorrado('a', borrar);
    programarBorrado('b', borrar);
    expect(clavesPendientes()).toEqual(['a', 'b']);
    await ejecutarPendientes();
    expect(borrar).toHaveBeenCalledTimes(2);
    expect(clavesPendientes()).toEqual([]);
  });
});
