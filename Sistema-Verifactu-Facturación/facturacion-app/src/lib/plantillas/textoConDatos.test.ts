import { describe, expect, it } from 'vitest';
import { contenidoParaPdfme, marcadoresDe, marcadoresDesconocidos, textoDeMuestra } from './textoConDatos';

describe('rótulos con datos', () => {
  it('encuentra los marcadores', () => {
    expect(marcadoresDe('{cliente_cp} {cliente_ciudad} ({cliente_provincia}) {cliente_cp}')).toEqual(['cliente_cp', 'cliente_ciudad', 'cliente_provincia']);
  });

  it('avisa de los que no existen', () => {
    expect(marcadoresDesconocidos('Hola {cliente_nombre} y {inventado}')).toEqual(['inventado']);
  });

  it('traduce la paginación a pdfme', () => {
    expect(contenidoParaPdfme('Página {pagina} de {paginas}')).toBe('Página {currentPage} de {totalPages}');
  });

  it('quita los marcadores desconocidos y neutraliza llaves sueltas', () => {
    expect(contenidoParaPdfme('Para {cliente_nombre}{inventado}')).toBe('Para {cliente_nombre}');
    expect(contenidoParaPdfme('Oferta {precio especial} válida')).toBe('Oferta (precio especial) válida');
    expect(contenidoParaPdfme('Sin llaves')).toBe('Sin llaves');
  });

  it('muestra cómo queda con datos de ejemplo', () => {
    expect(textoDeMuestra('Página {pagina} de {paginas}')).toBe('Página 1 de 2');
    expect(textoDeMuestra('Para {cliente_nombre}', { cliente_nombre: 'Bar Paco' })).toBe('Para Bar Paco');
  });
});
