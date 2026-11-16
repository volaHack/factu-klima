import { describe, it, expect } from 'vitest';
import {
  comprobarPin, esDocumentoDeVendedor, hashPin, haceCuanto, iniciales, inicioDe, nuevaSal, ordenarPerfiles, pinValido,
  problemaAlBorrar, problemaAlGuardar, puedeEntrar, ROLES, tipoParaVendedor, veCifrasDelNegocio, type Perfil,
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
    // El historial suma lo facturado por año: es dinero agregado.
    expect(puedeEntrar('empleado', '/historico')).toBe(false);
    // El cierre enseña el IGIC del mes y lo que se debe: es de la oficina.
    expect(puedeEntrar('empleado', '/cierre')).toBe(false);
  });

  it('el empleado del almacén entra en la cola de preparar pedidos; el cajero no', () => {
    expect(puedeEntrar('empleado', '/preparar-pedidos')).toBe(true);
    expect(puedeEntrar('cajero', '/preparar-pedidos')).toBe(false);
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

describe('el vendedor', () => {
  it('abre sus pedidos y presupuestos de venta, y los hace nuevos', () => {
    expect(puedeEntrar('vendedor', '/documentos?tipo=pedido&sentido=venta')).toBe(true);
    expect(puedeEntrar('vendedor', '/documentos?tipo=presupuesto&sentido=venta')).toBe(true);
    expect(puedeEntrar('vendedor', '/documentos/nuevo?tipo=pedido&sentido=venta')).toBe(true);
    expect(puedeEntrar('vendedor', '/documentos/nuevo?tipo=presupuesto&sentido=venta')).toBe(true);
    // La ficha y su edición: la pantalla comprueba que el documento sea suyo.
    expect(puedeEntrar('vendedor', '/documentos/abc')).toBe(true);
    expect(puedeEntrar('vendedor', '/documentos/abc/editar')).toBe(true);
  });

  it('no ve compras, albaranes, facturas ni «todos los documentos»', () => {
    expect(puedeEntrar('vendedor', '/documentos?tipo=pedido&sentido=compra')).toBe(false);
    expect(puedeEntrar('vendedor', '/documentos/nuevo?tipo=pedido&sentido=compra')).toBe(false);
    expect(puedeEntrar('vendedor', '/documentos?tipo=albaran&sentido=venta')).toBe(false);
    expect(puedeEntrar('vendedor', '/documentos?tipo=factura&sentido=compra')).toBe(false);
    expect(puedeEntrar('vendedor', '/documentos?tipo=rectificativa&sentido=venta')).toBe(false);
    expect(puedeEntrar('vendedor', '/documentos?tipo=todos')).toBe(false);
    expect(puedeEntrar('vendedor', '/documentos/historico/123')).toBe(false);
    expect(puedeEntrar('vendedor', '/facturas')).toBe(false);
    expect(puedeEntrar('vendedor', '/facturas/nueva')).toBe(false);
  });

  it('consulta los clientes, no los proveedores, y no da de alta desde la lista', () => {
    expect(puedeEntrar('vendedor', '/clientes?tipo=clientes')).toBe(true);
    expect(puedeEntrar('vendedor', '/clientes/abc')).toBe(true);
    expect(puedeEntrar('vendedor', '/clientes?tipo=proveedores')).toBe(false);
    expect(puedeEntrar('vendedor', '/clientes?tipo=clientes&nuevo=1')).toBe(false);
  });

  it('ni el panel, ni el dinero, ni el almacén, ni los ajustes', () => {
    for (const ruta of [
      '/dashboard', '/asistencia', '/productos', '/almacenes?tab=existencias', '/preparar-pedidos', '/tpv',
      '/tesoreria?tab=cobros', '/banco', '/gastos', '/informes', '/contabilidad', '/cierre', '/comisiones',
      '/listados?tab=listados', '/listados-fiscales', '/ajustes', '/equipo', '/verifactu', '/importar', '/admin',
    ]) expect(puedeEntrar('vendedor', ruta), ruta).toBe(false);
  });

  it('con la ruta sola responde por la pantalla: es ella la que se queda en lo suyo', () => {
    expect(puedeEntrar('vendedor', '/documentos')).toBe(true);
    expect(puedeEntrar('vendedor', '/documentos/nuevo')).toBe(true);
    expect(puedeEntrar('vendedor', '/clientes')).toBe(true);
  });

  it('empieza en sus pedidos', () => {
    const inicio = inicioDe('vendedor');
    expect(inicio).toBe('/documentos?tipo=pedido&sentido=venta');
    expect(puedeEntrar('vendedor', inicio)).toBe(true);
  });

  it('sus documentos son el pedido y el presupuesto de venta', () => {
    expect(esDocumentoDeVendedor({ tipo: 'pedido', sentido: 'venta' })).toBe(true);
    expect(esDocumentoDeVendedor({ tipo: 'presupuesto', sentido: 'venta' })).toBe(true);
    expect(esDocumentoDeVendedor({ tipo: 'presupuesto' })).toBe(true);
    expect(esDocumentoDeVendedor({ tipo: 'pedido', sentido: 'compra' })).toBe(false);
    expect(esDocumentoDeVendedor({ tipo: 'albaran', sentido: 'venta' })).toBe(false);
    expect(esDocumentoDeVendedor({ tipo: 'factura', sentido: 'venta' })).toBe(false);
    // Sin tipo es una factura de venta de las de antes.
    expect(esDocumentoDeVendedor({})).toBe(false);
  });

  it('si la dirección pide otro tipo, se queda en el pedido', () => {
    expect(tipoParaVendedor('presupuesto')).toBe('presupuesto');
    expect(tipoParaVendedor('pedido')).toBe('pedido');
    expect(tipoParaVendedor('factura')).toBe('pedido');
    expect(tipoParaVendedor('todos')).toBe('pedido');
    expect(tipoParaVendedor(null)).toBe('pedido');
  });

  it('es el único que no ve costes ni cifras del negocio', () => {
    expect(veCifrasDelNegocio('vendedor')).toBe(false);
    expect(veCifrasDelNegocio('titular')).toBe(true);
    expect(veCifrasDelNegocio('empleado')).toBe(true);
    expect(veCifrasDelNegocio('cajero')).toBe(true);
    // La cuenta no usa perfiles: la app de siempre.
    expect(veCifrasDelNegocio(null)).toBe(true);
    expect(veCifrasDelNegocio(undefined)).toBe(true);
  });

  it('los demás roles no miran los filtros: nada cambia para ellos', () => {
    expect(puedeEntrar('empleado', '/documentos?tipo=pedido&sentido=compra')).toBe(true);
    expect(puedeEntrar('empleado', '/tesoreria?tab=cobros')).toBe(false);
    expect(puedeEntrar('cajero', '/tpv?caja=1')).toBe(true);
    expect(puedeEntrar('titular', '/documentos?tipo=todos')).toBe(true);
  });

  it('está entre los roles que se pueden elegir', () => {
    expect(ROLES.map(r => r.id)).toEqual(['titular', 'empleado', 'vendedor', 'cajero']);
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
