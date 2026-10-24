/* eslint-disable @typescript-eslint/no-explicit-any -- datos de prueba a medias */
import { describe, it, expect } from 'vitest';
import { buscarPantallas, buscarDocumentos, buscarFichas, buscarArticulos, enlaceDeDocumento } from './buscadorUniversal';

const docs = [
  { id: 'd1', number: 'F-2026-0012', tipo: 'factura', sentido: 'venta', clientName: 'Bar Pepe', clientNif: 'B12345678', issueDate: '2026-10-02', total: 1234.5, lineItems: [{ productName: 'Queso curado', productRef: 'Q1' }] },
  { id: 'd2', number: 'ALB-0007', tipo: 'albaran', sentido: 'compra', clientName: 'Almazara Sur', clientNif: 'B8', issueDate: '2026-09-01', total: 60, lineItems: [{ productName: 'Aceite de oliva', productRef: 'A1' }] },
] as any;
const fichas = [
  { id: 'c1', businessName: 'Pepe SL', tradeName: 'Bar Pepe', nif: 'B12345678', phone: '928111222', email: 'pepe@bar.es', city: 'Arrecife', contactPerson: 'José', active: true },
  { id: 'c2', businessName: 'Almazara Sur SA', tradeName: '', nif: 'B87654321', phone: '', email: '', city: 'Jaén', contactPerson: '', active: true, esProveedor: true },
] as any;

describe('buscador universal', () => {
  it('encuentra pantallas por su nombre o por sinónimos, y ofrece crear', () => {
    expect(buscarPantallas('albaran compra').map(r => r.titulo)).toEqual(['Albaranes de compra', 'Crear nuevo · Albaranes de compra']);
    expect(buscarPantallas('nuevo albaran compra')[0]).toMatchObject({ grupo: 'accion', href: '/documentos/nuevo?tipo=albaran&sentido=compra' });
    expect(buscarPantallas('inventario').map(r => r.titulo)).toContain('Regularizaciones de stock');
    expect(buscarPantallas('modelo 303').map(r => r.titulo)).toContain('Listados fiscales');
  });

  it('encuentra documentos por número, cliente, NIF, importe o artículo de sus líneas', () => {
    expect(buscarDocumentos(docs, '0012')[0].href).toBe('/facturas/d1');
    expect(buscarDocumentos(docs, 'pepe').map(r => r.clave)).toEqual(['doc:d1']);
    expect(buscarDocumentos(docs, '1234,50').map(r => r.clave)).toEqual(['doc:d1']);
    expect(buscarDocumentos(docs, 'aceite').map(r => r.clave)).toEqual(['doc:d2']);
    expect(buscarDocumentos(docs, 'B12345678').map(r => r.clave)).toEqual(['doc:d1']);
    expect(enlaceDeDocumento(docs[1])).toBe('/documentos/d2');
  });

  it('encuentra fichas por nombre, NIF, teléfono, ciudad o contacto, sin tildes', () => {
    expect(buscarFichas(fichas, 'jaen').map(r => r.clave)).toEqual(['ficha:c2']);
    expect(buscarFichas(fichas, 'jose').map(r => r.clave)).toEqual(['ficha:c1']);
    expect(buscarFichas(fichas, '928111')[0].href).toBe('/clientes/c1');
    expect(buscarFichas(fichas, 'proveedor').map(r => r.clave)).toEqual(['ficha:c2']);
  });

  it('los artículos abren su ficha', () => {
    const r = buscarArticulos([{ id: 'p1', ref: 'A1', name: 'Aceite', active: true, unitPrice: 5, unit: 'ud', stockQuantity: 3 }] as any, 'aceite');
    expect(r[0]).toMatchObject({ href: '/productos?editar=p1', titulo: '[A1] Aceite' });
  });
});
