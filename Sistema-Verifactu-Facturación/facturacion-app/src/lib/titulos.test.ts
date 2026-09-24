import { describe, it, expect } from 'vitest';
import { tituloDePagina } from './titulos';

describe('tituloDePagina', () => {
  it('las rutas exactas, incluidas las que antes salían en blanco', () => {
    expect(tituloDePagina('/dashboard')).toBe('Panel');
    expect(tituloDePagina('/tesoreria')).toBe('Tesorería');
    expect(tituloDePagina('/albaranes')).toBe('Albaranes');
    expect(tituloDePagina('/facturas/nueva')).toBe('Nueva factura');
  });

  it('las subrutas con id', () => {
    expect(tituloDePagina('/facturas/abc')).toBe('Factura');
    expect(tituloDePagina('/facturas/abc/editar')).toBe('Editar factura');
    expect(tituloDePagina('/clientes/abc')).toBe('Cliente');
    expect(tituloDePagina('/documentos/abc/editar')).toBe('Editar documento');
    expect(tituloDePagina('/admin/cuentas/abc')).toBe('Cuenta');
  });

  it('los modelos fiscales llevan su número', () => {
    expect(tituloDePagina('/listados-fiscales/303')).toBe('Modelo 303');
  });

  it('una barra final no cambia nada, y una ruta desconocida hereda su sección', () => {
    expect(tituloDePagina('/gastos/')).toBe('Gastos');
    expect(tituloDePagina('/informes/lo-que-sea')).toBe('Informes');
    expect(tituloDePagina('/no-existe')).toBe('');
  });
});
