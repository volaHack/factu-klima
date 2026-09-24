import { describe, it, expect } from 'vitest';
import {
  comprobarPin, hashPin, haceCuanto, iniciales, inicioDe, nuevaSal, ordenarPerfiles, pinValido,
  problemaAlBorrar, problemaAlGuardar, puedeEntrar, type Perfil,
} from './perfiles';

const perfil = (extra: Partial<Perfil> = {}): Perfil => ({
  id: crypto.randomUUID(), nombre: 'Ana', rol: 'empleado', color: '#b02a5c', activo: true, ...extra,
});

describe('puedeEntrar', () => {
  it('el titular entra en todo', () => {
    expect(puedeEntrar('titular', '/ajustes')).toBe(true);
    expect(puedeEntrar('titular', '/admin/cuentas')).toBe(true);
  });

  it('el empleado hace el día a día pero no ve ajustes, informes ni lo fiscal', () => {
    expect(puedeEntrar('empleado', '/facturas/nueva')).toBe(true);
    expect(puedeEntrar('empleado', '/tpv')).toBe(true);
    expect(puedeEntrar('empleado', '/clientes/abc')).toBe(true);
    expect(puedeEntrar('empleado', '/ajustes')).toBe(false);
    expect(puedeEntrar('empleado', '/informes')).toBe(false);
    expect(puedeEntrar('empleado', '/listados-fiscales/303')).toBe(false);
  });

  it('el prefijo es por segmento: /informes no veda /informes-algo', () => {
    expect(puedeEntrar('empleado', '/informesx')).toBe(true);
  });

  it('el cajero sólo ve el TPV', () => {
    expect(puedeEntrar('cajero', '/tpv')).toBe(true);
    expect(puedeEntrar('cajero', '/dashboard')).toBe(false);
    expect(puedeEntrar('cajero', '/facturas')).toBe(false);
    expect(inicioDe('cajero')).toBe('/tpv');
    expect(inicioDe('empleado')).toBe('/dashboard');
  });
});

describe('PIN', () => {
  it('de 4 a 6 cifras', () => {
    expect(pinValido('1234')).toBe(true);
    expect(pinValido('123456')).toBe(true);
    expect(pinValido('123')).toBe(false);
    expect(pinValido('12a4')).toBe(false);
    expect(pinValido('1234567')).toBe(false);
  });

  it('el hash depende de la sal y se comprueba bien', async () => {
    const sal = nuevaSal();
    expect(sal).toMatch(/^[0-9a-f]{32}$/);
    const h = await hashPin('4821', sal);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashPin('4821', nuevaSal())).not.toBe(h);
    expect(await comprobarPin({ pinHash: h, pinSal: sal }, '4821')).toBe(true);
    expect(await comprobarPin({ pinHash: h, pinSal: sal }, '4822')).toBe(false);
  });

  it('un perfil sin PIN se abre sin pedirlo', async () => {
    expect(await comprobarPin({ pinHash: null, pinSal: null }, '')).toBe(true);
  });
});

describe('reglas del equipo', () => {
  const titular = perfil({ nombre: 'Rosa', rol: 'titular' });

  it('siempre queda un titular activo', () => {
    expect(problemaAlGuardar([titular], { ...titular, rol: 'empleado' })).toMatch(/titular/);
    expect(problemaAlGuardar([titular], { ...titular, activo: false })).toMatch(/titular/);
    expect(problemaAlBorrar([titular, perfil()], titular.id)).toMatch(/único titular/);
    expect(problemaAlBorrar([titular], titular.id)).toBeNull();
  });

  it('el primer perfil sólo puede ser titular', () => {
    expect(problemaAlGuardar([], perfil({ rol: 'empleado' }))).toMatch(/titular/);
    expect(problemaAlGuardar([], perfil({ rol: 'titular' }))).toBeNull();
  });

  it('nombre obligatorio, sin repetir y PIN válido', () => {
    expect(problemaAlGuardar([titular], perfil({ nombre: '  ' }))).toMatch(/nombre/);
    expect(problemaAlGuardar([titular], perfil({ nombre: 'rosa' }))).toMatch(/Ya hay/);
    expect(problemaAlGuardar([titular], perfil(), '12')).toMatch(/PIN/);
    expect(problemaAlGuardar([titular], perfil(), '1234')).toBeNull();
  });

  it('titulares primero y luego por nombre', () => {
    const lista = ordenarPerfiles([perfil({ nombre: 'Zoe', rol: 'cajero' }), perfil({ nombre: 'Bea' }), titular]);
    expect(lista.map(p => p.nombre)).toEqual(['Rosa', 'Bea', 'Zoe']);
  });

  it('iniciales', () => {
    expect(iniciales('María Fernández García')).toBe('MG');
    expect(iniciales('pepe')).toBe('PE');
    expect(iniciales('  ')).toBe('?');
  });
});

describe('haceCuanto', () => {
  const ahora = new Date(2026, 8, 24, 12, 0, 0);
  it('en palabras', () => {
    expect(haceCuanto(new Date(2026, 8, 24, 11, 59, 40).toISOString(), ahora)).toBe('ahora mismo');
    expect(haceCuanto(new Date(2026, 8, 24, 11, 50).toISOString(), ahora)).toBe('hace 10 min');
    expect(haceCuanto(new Date(2026, 8, 24, 9, 0).toISOString(), ahora)).toBe('hace 3 h');
    expect(haceCuanto(new Date(2026, 8, 23, 18, 40).toISOString(), ahora)).toMatch(/^ayer 18:40$/);
  });
});
